/**
 * Configuration for the WhatsApp Daily Water Situation PDF Bot.
 *
 * Edit these values to match your environment.
 */

const path = require('path');

module.exports = {
  // ── WhatsApp Group Matching ──────────────────────────────────────────
  // The bot checks chat.name.includes(groupNameFilter) — case-insensitive.
  groupNameFilter: 'NDMA Flood Syndicate',

  // ── PDF Detection ────────────────────────────────────────────────────
  // The bot downloads attachments whose filename includes this substring
  // (case-insensitive) AND whose MIME type is application/pdf.
  pdfNameFilter: 'daily water situation',

  // ── Save Location ────────────────────────────────────────────────────
  // Absolute path to the project root. The PDF will be saved at:
  //   <projectRoot>/res_storages/Daily Water Situation.pdf
  projectRoot: path.resolve(__dirname, '..'),
  pdfSaveName: 'Daily Water Situation.pdf',

  // ── KP PDF Detection ──────────────────────────────────────────────────
  kpPdfNameFilter: 'flood report',
  kpPdfSaveName: 'Flood Report.pdf',

  // ── Listening Window ─────────────────────────────────────────────────
  // The bot connects, listens for this many MINUTES, then gracefully
  // disconnects to avoid long-running sessions that could trigger bans.
  // Set to 0 to disable the auto-disconnect timer (not recommended).
  listenWindowMinutes: 120,   // 2 hours (e.g. 09:30 → 11:30 Karachi)

  // If true, the bot disconnects immediately after successfully
  // downloading the PDF (even if the listen window has not expired).
  disconnectAfterDownload: true,

  // ── Pipeline Trigger ─────────────────────────────────────────────────
  // If true, the bot will automatically run the full ingestion pipeline
  // after downloading the PDF:
  //   1. python res_storages/daily_water_situation_db.py
  //   2. python res_storages/storages.py
  //   3. git add + commit + push
  autoRunPipeline: true,

  // ── Session Persistence ──────────────────────────────────────────────
  // Directory where whatsapp-web.js stores the browser session so you
  // only need to scan the QR code once.
  authDir: path.join(__dirname, '.wwebjs_auth'),

  // ── Logging ──────────────────────────────────────────────────────────
  // If true, the bot logs every incoming message's sender and type
  // (useful for debugging group name / filename mismatches).
  verboseLogging: false,

  // ── History Scan Limit ───────────────────────────────────────────────
  // The number of recent messages to inspect on startup. Setting this higher
  // (e.g., 150) ensures the bot retrieves all weekend PDFs on Monday morning
  // even if the group chat is active.
  historyScanLimit: 150,
};
