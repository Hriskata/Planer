// Standalone script (not part of the Playwright/browser context — run directly by
// Node as one of playwright.config.js's webServer entries) that boots a real backend
// instance against its own throwaway SQLite file and seeds one fixed test account,
// so the E2E specs have something to log into without a public /register endpoint to
// call. Re-run on every `npm run test:e2e` — the DB file is wiped first so leftover
// tasks from a previous run never leak into a fresh run's assertions.
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '.tmp-e2e.db');
for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(dbPath + suffix, { force: true });
}
const uploadsDir = path.join(__dirname, '.tmp-e2e-uploads');
fs.rmSync(uploadsDir, { recursive: true, force: true });

process.env.DB_PATH = dbPath;
process.env.PORT = process.env.PORT || '3901';
process.env.JWT_SECRET = 'e2e-test-secret';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.UPLOADS_DIR = uploadsDir;

// bcryptjs is a frontend devDependency purely for this script — db.js/app.js's own
// requires (express, helmet, ...) resolve fine against backend/node_modules regardless
// of who required them, Node resolves relative to the requiring file, not the caller.
const bcrypt = require('bcryptjs');
const db = require('../../backend/src/db');
const app = require('../../backend/src/app');

db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(
  'e2euser',
  bcrypt.hashSync('e2epass123', 4)
);

app.listen(process.env.PORT, () => {
  console.log(`E2E backend listening on ${process.env.PORT}`);
});
