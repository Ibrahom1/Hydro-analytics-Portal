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
  // Linux/Docker: check bin/python first, then Windows Scripts/python.exe
  const linuxVenv = path.join(config.projectRoot, '.venv', 'bin', 'python');
  const winVenv = path.join(config.projectRoot, '.venv', 'Scripts', 'python.exe');
  if (fs.existsSync(linuxVenv)) return `"${linuxVenv}"`;
  if (fs.existsSync(winVenv)) return `"${winVenv}"`;
  try {
    execSync('python3 -c "import sys"', { stdio: 'ignore' });
    return 'python3';
  } catch (_) { /* ignore */ }
  try {
    execSync('python -c "import sys"', { stdio: 'ignore' });
    return 'python';
  } catch (_) { /* ignore */ }
  try {
    execSync('py -3 -c "import sys"', { stdio: 'ignore' });
    return 'py -3';
  } catch (_) { /* ignore */ }
  return null;
}

function getLocalDateStr(timestampMs = Date.now()) {
  const d = new Date(timestampMs);
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' });
  return formatter.format(d);
}

function getTodayDateFormats() {
  const yyyy_mm_dd = getLocalDateStr(Date.now());
  const [y, m, d] = yyyy_mm_dd.split('-');
  const dd_mm_yyyy = `${d}/${m}/${y}`;
  return { yyyy_mm_dd, dd_mm_yyyy };
}

function isDailyWaterHashIngested(hash) {
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

function isKpHashIngested(hash) {
  const pythonCmd = findPython();
  if (!pythonCmd) return false;
  const dbPath = path.join(config.projectRoot, 'data', 'kp_stations_data.sqlite');
  if (!fs.existsSync(dbPath)) return false;
  try {
    const cmd = `${pythonCmd} -c "import sqlite3; conn=sqlite3.connect(r'${dbPath}'); cursor=conn.execute('SELECT 1 FROM kp_water_reports WHERE source_sha256=\\'${hash}\\''); print(bool(cursor.fetchone()))"`;
    const output = execSync(cmd).toString().trim();
    return output === 'True';
  } catch (err) {
    return false;
  }
}

function isGbHashIngested(hash) {
  const pythonCmd = findPython();
  if (!pythonCmd) return false;
  const dbPath = path.join(config.projectRoot, 'data', 'gb_stations.sqlite');
  if (!fs.existsSync(dbPath)) return false;
  try {
    const cmd = `${pythonCmd} -c "import sqlite3; conn=sqlite3.connect(r'${dbPath}'); cursor=conn.execute('SELECT 1 FROM gb_water_reports WHERE source_sha256=\\'${hash}\\''); print(bool(cursor.fetchone()))"`;
    const output = execSync(cmd).toString().trim();
    return output === 'True';
  } catch (err) {
    return false;
  }
}

function isDailyWaterIngestedForDate(dateStr) {
  const pythonCmd = findPython();
  if (!pythonCmd) return false;
  const dbPath = path.join(config.projectRoot, 'data', 'daily_water_situation.sqlite');
  if (!fs.existsSync(dbPath)) return false;
  try {
    const cmd = `${pythonCmd} -c "import sqlite3; conn=sqlite3.connect(r'${dbPath}'); cursor=conn.execute('SELECT 1 FROM daily_water_reports WHERE report_date=\\'${dateStr}\\' LIMIT 1'); print(bool(cursor.fetchone()))"`;
    const output = execSync(cmd).toString().trim();
    return output === 'True';
  } catch (err) {
    return false;
  }
}

function isKpIngestedForDate(dd_mm_yyyy) {
  const pythonCmd = findPython();
  if (!pythonCmd) return false;
  const dbPath = path.join(config.projectRoot, 'data', 'kp_stations_data.sqlite');
  if (!fs.existsSync(dbPath)) return false;
  try {
    const cmd = `${pythonCmd} -c "import sqlite3; conn=sqlite3.connect(r'${dbPath}'); cursor=conn.execute('SELECT 1 FROM kp_water_reports WHERE date=\\'${dd_mm_yyyy}\\' LIMIT 1'); print(bool(cursor.fetchone()))"`;
    const output = execSync(cmd).toString().trim();
    return output === 'True';
  } catch (err) {
    return false;
  }
}

function isGbIngestedForDate(yyyy_mm_dd) {
  const pythonCmd = findPython();
  if (!pythonCmd) return false;
  const dbPath = path.join(config.projectRoot, 'data', 'gb_stations.sqlite');
  if (!fs.existsSync(dbPath)) return false;
  try {
    const cmd = `${pythonCmd} -c "import sqlite3; conn=sqlite3.connect(r'${dbPath}'); cursor=conn.execute('SELECT 1 FROM gb_water_reports WHERE date_iso=\\'${yyyy_mm_dd}\\' LIMIT 1'); print(bool(cursor.fetchone()))"`;
    const output = execSync(cmd).toString().trim();
    return output === 'True';
  } catch (err) {
    return false;
  }
}

function isTodayReportsInDb() {
  const { yyyy_mm_dd, dd_mm_yyyy } = getTodayDateFormats();
  const dwDone = isDailyWaterIngestedForDate(yyyy_mm_dd);
  const kpDone = isKpIngestedForDate(dd_mm_yyyy);
  const gbDone = isGbIngestedForDate(yyyy_mm_dd);
  return { dwDone, kpDone, gbDone, allDone: dwDone && kpDone && gbDone, dateStr: yyyy_mm_dd };
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

function runKpIngestionOnly() {
  const pythonCmd = findPython();
  if (!pythonCmd) return false;
  const cwd = config.projectRoot;
  try {
    log('  INGEST: Running kp_stations_db.py...');
    execSync(`${pythonCmd} "${path.join(cwd, 'res_kp', 'kp_stations_db.py')}"`, {
      cwd, stdio: 'inherit', timeout: 120_000,
    });
    log('  INGEST: kp_stations_db.py completed.');
    return true;
  } catch (err) {
    console.error(`  INGEST: kp_stations_db.py failed: ${err.message}`);
    return false;
  }
}

function runGbIngestionOnly() {
  const pythonCmd = findPython();
  if (!pythonCmd) return false;
  const cwd = config.projectRoot;
  try {
    log('  INGEST: Running gb_stations_db.py...');
    execSync(`${pythonCmd} "${path.join(cwd, 'res_gb', 'gb_stations_db.py')}"`, {
      cwd, stdio: 'inherit', timeout: 120_000,
    });
    log('  INGEST: gb_stations_db.py completed.');
    return true;
  } catch (err) {
    console.error(`  INGEST: gb_stations_db.py failed: ${err.message}`);
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

function restoreNewestGbPdf() {
  const archiveDir = path.join(config.projectRoot, 'res_gb', 'Historical GB Reports');
  if (!fs.existsSync(archiveDir)) return false;
  try {
    const files = fs.readdirSync(archiveDir)
      .filter(f => f.endsWith('.pdf'))
      .sort();
    if (files.length === 0) return false;
    const newestFile = files[files.length - 1];
    const srcPath = path.join(archiveDir, newestFile);
    const dstPath = path.join(config.projectRoot, 'res_gb', config.gbPdfSaveName);
    fs.copyFileSync(srcPath, dstPath);
    log(`  Restored newest archived PDF "${newestFile}" → SWHP Report.pdf`);
    return true;
  } catch (err) {
    console.error(`  Failed to restore newest GB PDF: ${err.message}`);
    return false;
  }
}

function restoreNewestKpPdf() {
  const archiveDir = path.join(config.projectRoot, 'res_kp', 'Historical KP Reports');
  if (!fs.existsSync(archiveDir)) return false;
  try {
    const files = fs.readdirSync(archiveDir)
      .filter(f => f.endsWith('.pdf'))
      .sort();
    if (files.length === 0) return false;
    const newestFile = files[files.length - 1];
    const srcPath = path.join(archiveDir, newestFile);
    const dstPath = path.join(config.projectRoot, 'res_kp', config.kpPdfSaveName);
    fs.copyFileSync(srcPath, dstPath);
    log(`  Restored newest archived PDF "${newestFile}" → Flood Report.pdf`);
    return true;
  } catch (err) {
    console.error(`  Failed to restore newest KP PDF: ${err.message}`);
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
      'res_kp/Flood Report.pdf',
      'res_kp/Historical KP Reports',
      'data/kp_stations_data.sqlite',
      'res_gb/SWHP Report.pdf',
      'res_gb/Historical GB Reports',
      'data/gb_stations.sqlite'
    ];
    const existingGitFiles = gitFiles.filter(f => fs.existsSync(path.join(cwd, f)));
    if (existingGitFiles.length > 0) {
      execSync(`git add ${existingGitFiles.map(f => `"${f}"`).join(' ')}`, { cwd, stdio: 'inherit' });
    }
    try {
      execSync('git diff --cached --quiet', { cwd, stdio: 'ignore' });
      log('  GIT: No changes to commit.');
    } catch (_) {
      const today = new Date().toISOString().split('T')[0];
      // Discard any unstaged gauge scraper modifications that could conflict with GitHub Actions commits
      try {
        execSync('git checkout -- FFD_other_gauge_fetch/latest_all_gauges.json data/other_gauges.sqlite', { cwd, stdio: 'ignore' });
      } catch (_) {}

      // Commit staged files
      execSync(`git commit -m "Auto-ingest Daily Water Situation, KP and GB reports ${today}"`, { cwd, stdio: 'inherit' });

      // Pull any upstream commits before pushing (avoids binary SQLite rebase locks)
      try {
        execSync('git pull --no-rebase', { cwd, stdio: 'inherit' });
      } catch (_) {
        try { execSync('git merge --abort', { cwd, stdio: 'ignore' }); } catch (_) {}
        try { execSync('git rebase --abort', { cwd, stdio: 'ignore' }); } catch (_) {}
        log('  GIT: pull --no-rebase completed or skipped, proceeding to push...');
      }
      execSync('git push', { cwd, stdio: 'inherit' });
      log('  GIT: Changes committed and pushed.');
    }
  } catch (err) {
    console.error(`  GIT: Operations failed: ${err.message}`);
    try { execSync('git merge --abort', { cwd, stdio: 'ignore' }); } catch (_) {}
    try { execSync('git rebase --abort', { cwd, stdio: 'ignore' }); } catch (_) {}
    return false;
  }
  return true;
}

function cleanStaleAuthLocks(authDir) {
  try {
    const sessionDir = path.join(authDir, 'session');
    if (!fs.existsSync(sessionDir)) return;
    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    const dirsToCheck = [sessionDir, path.join(sessionDir, 'Default')];
    for (const d of dirsToCheck) {
      if (!fs.existsSync(d)) continue;
      for (const file of lockFiles) {
        const p = path.join(d, file);
        try {
          if (fs.existsSync(p) || fs.lstatSync(p).isSymbolicLink()) {
            fs.unlinkSync(p);
          }
        } catch (_) {}
      }
    }
  } catch (_) {}
}

// ── Main Bot ───────────────────────────────────────────────────────────

async function main() {
  const authOnly = process.argv.includes('--auth-only');

  cleanStaleAuthLocks(config.authDir);

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: config.authDir }),
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html',
    },
    puppeteer: {
      headless: true,
      protocolTimeout: 300_000,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--no-first-run',
        '--no-default-browser-check',
      ],
    },
  });

  let shutdownTimer = null;
  let targetChatId = null;
  let readyFired = false;
  let readyWatchdog = null;

  /**
   * Checks whether a message contains a new Daily Water Situation PDF
   * or KP Flood Report PDF that hasn't been ingested yet. If so, saves it
   * and runs the appropriate ingestion script.
   *
   * Returns { ingested: boolean, isToday: boolean, type: string }
   */
  async function processMessage(msg) {
    try {
      // 1. Filter: check if message is from target group
      if (targetChatId) {
        if (msg.from !== targetChatId) return { ingested: false };
      } else {
        const chat = await msg.getChat();
        if (!chat.isGroup) return { ingested: false };
        if (!chat.name.toLowerCase().includes(config.groupNameFilter.toLowerCase())) return { ingested: false };
      }

      // 2. Filter: must have media attachment and be a document type (e.g. PDF)
      if (!msg.hasMedia) return { ingested: false };
      if (msg.type !== 'document') return { ingested: false };

      // Check filename across all candidate fields (body, caption, _data.filename)
      const rawCandidates = [
        msg.body || '',
        msg.caption || '',
        (msg._data && msg._data.filename) || '',
        (msg._data && msg._data.caption) || ''
      ].join(' ').toLowerCase().replace(/[_\s-]+/g, ' ');

      let isDailyWater = rawCandidates.includes('daily water situation') ||
                         (rawCandidates.includes('daily water') && rawCandidates.includes('situation')) ||
                         (rawCandidates.includes('water situation') && rawCandidates.includes('daily'));
      let isKpReport = rawCandidates.includes('flood report') ||
                       (rawCandidates.includes('flood') && rawCandidates.includes('report'));
      let isGbReport = rawCandidates.includes('swhp') ||
                       (rawCandidates.includes('rivers') && rawCandidates.includes('tributaries') && rawCandidates.includes('flows'));
      
      if (!isDailyWater && !isKpReport && !isGbReport) {
        return { ingested: false };
      }

      const msgDate = getLocalDateStr(msg.timestamp * 1000);
      const todayStr = getLocalDateStr(Date.now());
      const isTodayMsg = (msgDate === todayStr);

      // 30-second timeout to prevent hanging forever
      const downloadPromise = msg.downloadMedia();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Download timed out after 30s for message from ${msgDate}`)), 30000)
      );
      const media = await Promise.race([downloadPromise, timeoutPromise]);
      if (!media) {
        log(`  ⚠ Could not fetch media headers for attachment from ${msgDate}`);
        return { ingested: false };
      }
      
      if (!media.mimetype || !media.mimetype.includes('pdf')) {
        return { ingested: false };
      }

      const buffer = Buffer.from(media.data, 'base64');
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      const fileName = media.filename || (isDailyWater ? 'Daily Water Situation.pdf' : (isKpReport ? 'Flood Report.pdf' : 'SWHP Report.pdf'));

      if (isDailyWater && isDailyWaterHashIngested(hash)) {
        log(`  ℹ [${msgDate}] "${fileName}" → Already ingested in DB (Skipped)`);
        return { ingested: false };
      }

      if (isKpReport && isKpHashIngested(hash)) {
        log(`  ℹ [${msgDate}] "${fileName}" → Already ingested in DB (Skipped)`);
        return { ingested: false };
      }

      if (isGbReport && isGbHashIngested(hash)) {
        log(`  ℹ [${msgDate}] "${fileName}" → Already ingested in DB (Skipped)`);
        return { ingested: false };
      }

      log(`────────────────────────────────────────────`);
      log(`📥 NEW UNINGESTED PDF FOUND: "${fileName}" (${Math.round(buffer.length / 1024)} KB, Msg Date: ${msgDate})`);

      if (isDailyWater) {
        // Save to res_storages/Daily Water Situation.pdf
        const savePath = path.join(config.projectRoot, 'res_storages', config.pdfSaveName);
        fs.writeFileSync(savePath, buffer);
  
        // Phase 1 ONLY: ingest into SQLite + archive
        if (config.autoRunPipeline) {
          runIngestionOnly();
        }
      } else if (isKpReport) {
        // Save to res_kp/Flood Report.pdf
        const savePath = path.join(config.projectRoot, 'res_kp', config.kpPdfSaveName);
        fs.writeFileSync(savePath, buffer);
  
        if (config.autoRunPipeline) {
          runKpIngestionOnly();
        }
      } else if (isGbReport) {
        // Save to res_gb/SWHP Report.pdf
        const savePath = path.join(config.projectRoot, 'res_gb', config.gbPdfSaveName);
        fs.writeFileSync(savePath, buffer);
  
        if (config.autoRunPipeline) {
          runGbIngestionOnly();
        }
      }

      log(`────────────────────────────────────────────`);
      return { ingested: true, isToday: isTodayMsg, type: isDailyWater ? 'daily_water' : (isKpReport ? 'kp' : 'gb') };
    } catch (err) {
      if (config.verboseLogging) {
        console.error('Error processing message:', err);
      } else {
        const msgDate = getLocalDateStr(msg.timestamp * 1000);
        log(`[INFO] Could not download media for message from ${msgDate}: ${err.message}`);
      }
      return { ingested: false };
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

    // Restore newest PDFs to their respective root res folders
    restoreNewestPdf();
    restoreNewestKpPdf();
    restoreNewestGbPdf();

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
    if (readyWatchdog) clearTimeout(readyWatchdog);
    readyWatchdog = setTimeout(async () => {
      if (!readyFired) {
        log('[WATCHDOG] Ready event took longer than 45s. Triggering page reload to refresh WhatsApp Web...');
        try {
          if (client.pupPage) {
            await client.pupPage.reload({ waitUntil: 'domcontentloaded' });
          }
        } catch (e) {
          console.warn('[WATCHDOG] Page reload error:', e.message);
        }
      }
    }, 45000);
  });

  // ── Auth Failure ─────────────────────────────────────────────────
  client.on('auth_failure', (msg) => {
    console.error(`Authentication failed: ${msg}`);
    console.error('Delete the .wwebjs_auth folder and re-scan the QR code.');
    process.exit(1);
  });

  // ── Ready ────────────────────────────────────────────────────────
  client.on('ready', async () => {
    readyFired = true;
    if (readyWatchdog) clearTimeout(readyWatchdog);
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
        let todayIngestedCount = 0;
        for (const msg of messages) {
          const res = await processMessage(msg);
          if (res.ingested) {
            newCount++;
            if (res.isToday) todayIngestedCount++;
          }
        }

        if (newCount > 0) {
          finalize(newCount);
        }

        const todayCheck = isTodayReportsInDb();
        if (config.disconnectAfterDownload && todayCheck.allDone) {
          if (shutdownTimer) clearTimeout(shutdownTimer);
          gracefulShutdown(client, `All 3 reports for today (${todayCheck.dateStr}) are fully ingested. Mission accomplished.`);
          return;
        } else {
          log(`[STATUS] Today's reports (${todayCheck.dateStr}) status: Daily Water = ${todayCheck.dwDone ? '✓ Ingested' : '⏳ Pending'}, KP Report = ${todayCheck.kpDone ? '✓ Ingested' : '⏳ Pending'}, GB Report = ${todayCheck.gbDone ? '✓ Ingested' : '⏳ Pending'}.`);
          log(`Bot will STAY ONLINE and listen for incoming messages until listen window (${config.listenWindowMinutes}m) expires...`);
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
    const res = await processMessage(msg);
    if (res.ingested) {
      finalize(1);
      const todayCheck = isTodayReportsInDb();
      if (config.disconnectAfterDownload && todayCheck.allDone) {
        if (shutdownTimer) clearTimeout(shutdownTimer);
        gracefulShutdown(client, `All 3 reports for today (${todayCheck.dateStr}) are fully ingested. Mission accomplished.`);
      } else {
        log(`[STATUS] Ingested ${res.type === 'daily_water' ? 'Daily Water' : (res.type === 'kp' ? 'KP Report' : 'GB SWHP Report')} PDF for ${todayCheck.dateStr}.`);
        log(`[STATUS] Today's reports (${todayCheck.dateStr}) status: Daily Water = ${todayCheck.dwDone ? '✓ Ingested' : '⏳ Pending'}, KP Report = ${todayCheck.kpDone ? '✓ Ingested' : '⏳ Pending'}, GB Report = ${todayCheck.gbDone ? '✓ Ingested' : '⏳ Pending'}.`);
        log(`Bot will STAY ONLINE and listen for remaining reports until listen window (${config.listenWindowMinutes}m) expires...`);
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
