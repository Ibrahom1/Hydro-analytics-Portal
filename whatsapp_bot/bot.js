/**
 * WhatsApp Bot — Daily Water Situation PDF Auto-Downloader
 *
 * Connects to WhatsApp Web, listens to the configured group for a
 * limited time window, downloads the Daily Water Situation PDF when
 * it appears, and optionally triggers the full ingestion pipeline.
 *
 * Handles multiple missing PDFs: if both 15-Jul and 16-Jul are posted
 * in the group, both get ingested into SQLite regardless of order.
 * storages.py always runs against the NEWEST report.
 *
 * Usage:
 *   node bot.js              — Normal run (listen window)
 *   node bot.js --auth-only  — Scan QR and exit (first-time setup)
 */

const { Client, LocalAuth, Message, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const ChatFactory = require('./node_modules/whatsapp-web.js/src/factories/ChatFactory');
const config = require('./config');

// Override Message.prototype.downloadMedia to bypass broken WAWebCollections.Msg lookup.
// Instead of looking up the message model by ID (which fails for messages loaded via
// fetchMessages()), we pass the raw media parameters directly to the browser's
// downloadAndMaybeDecrypt function.
Message.prototype.downloadMedia = async function() {
  if (!this.hasMedia) {
    return undefined;
  }
  try {
    // Extract media params from the raw data object (these are always available
    // on messages returned by fetchMessages, even if the browser-side model is gone)
    const mediaParams = {
      directPath: this._data.directPath,
      encFilehash: this._data.encFilehash,
      filehash: this._data.filehash,
      mediaKey: this._data.mediaKey,
      mediaKeyTimestamp: this._data.mediaKeyTimestamp,
      type: this._data.type,
      mimetype: this._data.mimetype,
      filename: this._data.filename,
      size: this._data.size,
    };

    if (!mediaParams.directPath || !mediaParams.mediaKey) {
      throw new Error(`Missing media params: directPath=${!!mediaParams.directPath}, mediaKey=${!!mediaParams.mediaKey}`);
    }

    const result = await this.client.pupPage.evaluate(async (params) => {
      try {
        const mockQpl = {
          addAnnotations: function () { return this; },
          addPoint: function () { return this; },
        };
        const decryptedMedia = await window
          .require('WAWebDownloadManager')
          .downloadManager.downloadAndMaybeDecrypt({
            directPath: params.directPath,
            encFilehash: params.encFilehash,
            filehash: params.filehash,
            mediaKey: params.mediaKey,
            mediaKeyTimestamp: params.mediaKeyTimestamp,
            type: params.type,
            signal: new AbortController().signal,
            downloadQpl: mockQpl,
          });

        const data = await window.WWebJS.arrayBufferToBase64Async(decryptedMedia);
        return {
          data,
          mimetype: params.mimetype,
          filename: params.filename,
          filesize: params.size,
        };
      } catch (err) {
        return { error: (err.status === 404 ? 'Media expired (404)' : (err.stack || err.message || String(err))) };
      }
    }, mediaParams);

    if (result && result.error) {
      throw new Error(result.error);
    }
    if (!result) return undefined;
    return new MessageMedia(result.mimetype, result.data, result.filename, result.filesize);
  } catch (err) {
    throw err;
  }
};

// ── Helpers ────────────────────────────────────────────────────────────

function timestamp() {
  return new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
}

function log(msg) {
  console.log(`[${timestamp()}] ${msg}`);
}

// ── Python & SQLite ────────────────────────────────────────────────────

function findPython() {
  const venvPython = path.join(config.projectRoot, '.venv', 'Scripts', 'python.exe');
  if (fs.existsSync(venvPython)) return `"${venvPython}"`;
  try {
    execSync('py -3 -c "import sys"', { stdio: 'ignore' });
    return 'py -3';
  } catch (_) { /* ignore */ }
  try {
    execSync('python -c "import sys"', { stdio: 'ignore' });
    return 'python';
  } catch (_) { /* ignore */ }
  return null;
}

/**
 * Checks the local SQLite database to see if a file with this SHA-256 hash
 * has already been ingested.
 */
function isHashIngested(hash) {
  const pythonCmd = findPython();
  if (!pythonCmd) return false;
  const dbPath = path.join(config.projectRoot, 'data', 'daily_water_situation.sqlite');
  if (!fs.existsSync(dbPath)) return false;
  try {
    const cmd = `${pythonCmd} -c "import sqlite3; conn=sqlite3.connect(r'${dbPath}'); cursor=conn.execute('SELECT 1 FROM daily_water_reports WHERE source_sha256=\\'${hash}\\''); print(bool(cursor.fetchone()))"`;
    const output = execSync(cmd).toString().trim();
    return output === 'True';
  } catch (err) {
    return false;
  }
}

// ── Pipeline Phases ────────────────────────────────────────────────────
// Phase 1: Ingest ONE PDF into SQLite + archive to Historical folder.
//          Does NOT run storages.py (avoids stale data overwrite).
// Phase 2: Run storages.py ONCE with the NEWEST PDF to update
//          ft_and_percentage.js with the latest values.

function runIngestionOnly() {
  const pythonCmd = findPython();
  if (!pythonCmd) return false;
  const cwd = config.projectRoot;
  try {
    log('  INGEST: Running daily_water_situation_db.py...');
    execSync(`${pythonCmd} "${path.join(cwd, 'res_storages', 'daily_water_situation_db.py')}"`, {
      cwd, stdio: 'inherit', timeout: 120_000,
    });
    log('  INGEST: daily_water_situation_db.py completed.');
    return true;
  } catch (err) {
    console.error(`  INGEST: daily_water_situation_db.py failed: ${err.message}`);
    return false;
  }
}

function runStoragesUpdate() {
  const pythonCmd = findPython();
  if (!pythonCmd) return false;
  const cwd = config.projectRoot;
  try {
    log('  STORAGES: Running storages.py...');
    execSync(`${pythonCmd} "${path.join(cwd, 'res_storages', 'storages.py')}"`, {
      cwd, stdio: 'inherit', timeout: 120_000,
    });
    log('  STORAGES: storages.py completed.');
    return true;
  } catch (err) {
    console.error(`  STORAGES: storages.py failed: ${err.message}`);
    return false;
  }
}

/**
 * Finds the newest archived PDF in Historical Daily Storages/ by filename
 * (filenames are YYYY-MM-DD.pdf) and copies it to Daily Water Situation.pdf
 * so that storages.py always runs against the latest report.
 */
function restoreNewestPdf() {
  const archiveDir = path.join(config.projectRoot, 'res_storages', 'Historical Daily Storages');
  if (!fs.existsSync(archiveDir)) return false;
  try {
    const files = fs.readdirSync(archiveDir)
      .filter(f => f.endsWith('.pdf'))
      .sort(); // Lexicographic sort on YYYY-MM-DD.pdf = chronological
    if (files.length === 0) return false;
    const newestFile = files[files.length - 1];
    const srcPath = path.join(archiveDir, newestFile);
    const dstPath = path.join(config.projectRoot, 'res_storages', config.pdfSaveName);
    fs.copyFileSync(srcPath, dstPath);
    log(`  Restored newest archived PDF "${newestFile}" → Daily Water Situation.pdf`);
    return true;
  } catch (err) {
    console.error(`  Failed to restore newest PDF: ${err.message}`);
    return false;
  }
}

function pushChanges() {
  const cwd = config.projectRoot;
  try {
    const gitFiles = [
      'res_storages/Daily Water Situation.pdf',
      'res_storages/Historical Daily Storages',
      'data/daily_water_situation.sqlite',
      'script/ft_and_percentage.js',
    ];
    execSync(`git add ${gitFiles.map(f => `"${f}"`).join(' ')}`, { cwd, stdio: 'inherit' });
    try {
      execSync('git diff --cached --quiet', { cwd, stdio: 'ignore' });
      log('  GIT: No changes to commit.');
    } catch (_) {
      const today = new Date().toISOString().split('T')[0];
      execSync(`git commit -m "Auto-ingest Daily Water Situation updates ${today}"`, { cwd, stdio: 'inherit' });
      execSync('git push', { cwd, stdio: 'inherit' });
      log('  GIT: Changes committed and pushed.');
    }
  } catch (err) {
    console.error(`  GIT: Operations failed: ${err.message}`);
    return false;
  }
  return true;
}

// ── Main Bot ───────────────────────────────────────────────────────────

async function main() {
  const authOnly = process.argv.includes('--auth-only');

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: config.authDir }),
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html',
    },
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
      ],
    },
  });

  let shutdownTimer = null;
  let targetChatId = null;

  /**
   * Checks whether a message contains a new Daily Water Situation PDF
   * that hasn't been ingested yet. If so, saves it and runs ONLY the
   * ingestion script (daily_water_situation_db.py) — NOT storages.py.
   *
   * Returns true if a new PDF was ingested.
   */
  async function processMessage(msg) {
    try {
      // 1. Filter: check if message is from target group
      if (targetChatId) {
        if (msg.from !== targetChatId) return false;
      } else {
        const chat = await msg.getChat();
        if (!chat.isGroup) return false;
        if (!chat.name.toLowerCase().includes(config.groupNameFilter.toLowerCase())) return false;
      }

      // 2. Filter: must have media attachment and be a document type (e.g. PDF)
      if (!msg.hasMedia) return false;
      if (msg.type !== 'document') return false;

      // Check filename in msg.body (which represents the document filename on WA Web)
      const bodyText = (msg.body || '').toLowerCase();
      if (!bodyText.includes(config.pdfNameFilter.toLowerCase())) {
        return false;
      }

      const msgDate = new Date(msg.timestamp * 1000).toISOString().split('T')[0];
      log(`  Downloading PDF from ${msgDate}...`);

      // 30-second timeout to prevent hanging forever
      const downloadPromise = msg.downloadMedia();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Download timed out after 30s for message from ${msgDate}`)), 30000)
      );
      const media = await Promise.race([downloadPromise, timeoutPromise]);
      if (!media) {
        log(`  ⚠ Download returned null for ${msgDate} (media not available on server)`);
        return false;
      }
      log(`  ✓ Downloaded: mimetype=${media.mimetype}, filename="${media.filename}", size=${media.data ? media.data.length : 0} chars`);
      if (!media.mimetype || !media.mimetype.includes('pdf')) {
        log(`  ⚠ Skipped: not a PDF (mimetype: ${media.mimetype})`);
        return false;
      }

      // Compute hash and check against DB
      const buffer = Buffer.from(media.data, 'base64');
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      if (isHashIngested(hash)) {
        log(`  ⚠ Skipped: already ingested (hash: ${hash.slice(0, 12)}...)`);
        return false;
      }

      log(`────────────────────────────────────────────`);
      log(`Found NEW PDF: "${media.filename}" (${Math.round(buffer.length / 1024)} KB, hash: ${hash.slice(0, 12)}...)`);

      // Save to res_storages/Daily Water Situation.pdf
      const savePath = path.join(config.projectRoot, 'res_storages', config.pdfSaveName);
      fs.writeFileSync(savePath, buffer);

      // Phase 1 ONLY: ingest into SQLite + archive
      if (config.autoRunPipeline) {
        runIngestionOnly();
      }

      log(`────────────────────────────────────────────`);
      return true;
    } catch (err) {
      if (config.verboseLogging) {
        console.error('Error processing message:', err);
      } else {
        const msgDate = new Date(msg.timestamp * 1000).toISOString().split('T')[0];
        log(`[INFO] Could not download media for message from ${msgDate}: ${err.message}`);
      }
      return false;
    }
  }

  /**
   * Runs the final Phase 2 steps after all PDFs have been ingested:
   *   1. Restore the NEWEST archived PDF → Daily Water Situation.pdf
   *   2. Run storages.py ONCE (so ft_and_percentage.js has latest values)
   *   3. Git commit + push all changes
   */
  function finalize(count) {
    log('════════════════════════════════════════════');
    log(`FINALIZE: ${count} new PDF(s) ingested. Running final steps...`);

    // Restore newest PDF so storages.py generates correct values
    restoreNewestPdf();

    // Phase 2: run storages.py once with the newest PDF
    runStoragesUpdate();

    // Push everything at once
    pushChanges();

    log(`FINALIZE: All done.`);
    log('════════════════════════════════════════════');
  }

  // ── QR Code ──────────────────────────────────────────────────────
  client.on('qr', (qr) => {
    log('Scan this QR code with WhatsApp on your phone:');
    qrcode.generate(qr, { small: true });
    log('(Open WhatsApp → Settings → Linked Devices → Link a Device)');
  });

  // ── Authenticated ────────────────────────────────────────────────
  client.on('authenticated', () => {
    log('Session authenticated successfully. Session saved for future runs.');
  });

  // ── Auth Failure ─────────────────────────────────────────────────
  client.on('auth_failure', (msg) => {
    console.error(`Authentication failed: ${msg}`);
    console.error('Delete the .wwebjs_auth folder and re-scan the QR code.');
    process.exit(1);
  });

  // ── Ready ────────────────────────────────────────────────────────
  client.on('ready', async () => {
    log('WhatsApp bot is READY and listening for messages.');

    if (authOnly) {
      log('--auth-only mode: QR scan complete. Disconnecting...');
      gracefulShutdown(client, 'Auth-only setup complete.');
      return;
    }

    // Set the auto-disconnect timer
    if (config.listenWindowMinutes > 0) {
      const ms = config.listenWindowMinutes * 60 * 1000;
      log(`Auto-disconnect timer set for ${config.listenWindowMinutes} minutes.`);
      shutdownTimer = setTimeout(() => {
        gracefulShutdown(client, 'Listen window expired.');
      }, ms);
    }

    // ── Startup History Check ──────────────────────────────────────
    // Fetch recent messages and ingest any PDFs that are missing from
    // the database. This catches PDFs sent BEFORE the bot came online.
    try {
      log('Running startup history check...');
      
      // Custom robust getChats implementation to catch individual serialization errors
      const chatsRaw = await client.pupPage.evaluate(async () => {
        // Decorate getChatModel to fallback to basic serialization if it fails (e.g. LID migration errors)
        const originalGetChatModel = window.WWebJS.getChatModel;
        window.WWebJS.getChatModel = async (chat, options) => {
          try {
            return await originalGetChatModel(chat, options);
          } catch (err) {
            try {
              const model = chat.serialize();
              model.isGroup = !!chat.groupMetadata;
              model.isReadOnly = chat.groupMetadata ? chat.groupMetadata.announce : false;
              model.formattedTitle = chat.formattedTitle || chat.contact?.name || chat.id.user;
              return model;
            } catch (innerErr) {
              return null;
            }
          }
        };

        const chatModels = window.require('WAWebCollections').Chat.getModelsArray();
        const chatPromises = chatModels.map(async (chat) => {
          try {
            return await window.WWebJS.getChatModel(chat);
          } catch (err) {
            return null;
          }
        });
        const results = await Promise.all(chatPromises);
        return results.filter(c => c !== null);
      });
      const chats = chatsRaw.map(chat => ChatFactory.create(client, chat));

      log(`Found ${chats.length} active chats.`);
      chats.forEach(c => {
        if (c.isGroup) {
          log(`  - Group: "${c.name}" (ID: ${c.id._serialized})`);
        }
      });

      const targetChat = chats.find(c =>
        c.isGroup && c.name && c.name.toLowerCase().includes(config.groupNameFilter.toLowerCase())
      );

      if (targetChat) {
        targetChatId = targetChat.id._serialized;
        log(`Target group ID resolved: ${targetChatId}`);
        log(`Fetching recent messages from "${targetChat.name}"...`);
        const messages = await targetChat.fetchMessages({ limit: config.historyScanLimit });
        log(`Fetched ${messages.length} messages. Scanning for missing PDFs...`);

        let newCount = 0;
        for (const msg of messages) {
          if (await processMessage(msg)) newCount++;
        }

        if (newCount > 0) {
          finalize(newCount);
          if (config.disconnectAfterDownload) {
            if (shutdownTimer) clearTimeout(shutdownTimer);
            gracefulShutdown(client, `History sync complete: ${newCount} new PDF(s).`);
            return;
          }
        } else {
          log('No new PDFs found in recent history. Waiting for new messages...');
        }
      } else {
        log(`Target group "${config.groupNameFilter}" not found in chat list.`);
      }
    } catch (err) {
      console.error('Startup check failed:', err);
    }
  });

  // ── Incoming Message Handler ─────────────────────────────────────
  // For live messages, each new PDF is ingested immediately and then
  // finalized (storages.py + git push) right away.
  client.on('message', async (msg) => {
    if (await processMessage(msg)) {
      finalize(1);
      if (config.disconnectAfterDownload) {
        if (shutdownTimer) clearTimeout(shutdownTimer);
        gracefulShutdown(client, 'Live PDF downloaded. Mission accomplished.');
      }
    }
  });

  // ── Disconnected ─────────────────────────────────────────────────
  client.on('disconnected', (reason) => {
    log(`Disconnected from WhatsApp: ${reason}`);
  });

  // ── Start ────────────────────────────────────────────────────────
  await client.initialize();
}

// ── Graceful Shutdown ──────────────────────────────────────────────────

async function gracefulShutdown(client, reason) {
  log(`Shutting down: ${reason}`);
  try {
    await client.destroy();
  } catch (_) { /* ignore */ }
  log('Bot stopped cleanly. Goodbye.');
  process.exit(0);
}

// ── Process Signal Handlers ────────────────────────────────────────────

process.on('SIGINT', () => {
  log('Received SIGINT. Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Received SIGTERM. Shutting down...');
  process.exit(0);
});

// ── Entry Point ────────────────────────────────────────────────────────

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
