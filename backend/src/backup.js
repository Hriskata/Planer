// Creates a consistent snapshot of the SQLite database via `VACUUM INTO`, which is
// safe to run while the server is live (unlike copying the .db file directly, which
// can grab a half-written page). Usage: npm run backup

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');

const BACKUP_DIR = process.env.BACKUP_DIR || './backups';
const RETENTION_COUNT = 14; // keep the last N backups, prune older ones

fs.mkdirSync(BACKUP_DIR, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(BACKUP_DIR, `tasks-${timestamp}.db`);

db.prepare('VACUUM INTO ?').run(backupPath);
console.log(`Backup created: ${backupPath}`);

const existing = fs
  .readdirSync(BACKUP_DIR)
  .filter((f) => f.startsWith('tasks-') && f.endsWith('.db'))
  .sort();

for (const file of existing.slice(0, Math.max(0, existing.length - RETENTION_COUNT))) {
  fs.unlinkSync(path.join(BACKUP_DIR, file));
  console.log(`Removed old backup: ${file}`);
}
