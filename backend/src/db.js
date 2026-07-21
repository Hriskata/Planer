const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite'); // built into Node >= 22.5, no native compile step

const dbPath = process.env.DB_PATH || './data/tasks.db';

// node:sqlite doesn't create the parent directory itself.
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL'); // better throughput for concurrent reads/writes

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// `CREATE TABLE IF NOT EXISTS` in schema.sql only covers brand-new databases —
// it doesn't add columns to a tasks table that already exists from before this
// column was introduced. This is a lightweight stand-in for a migration system,
// fine at this project's scale (one column, one table).
const taskColumns = db.prepare("PRAGMA table_info(tasks)").all().map((c) => c.name);
if (!taskColumns.includes('color')) {
  db.exec('ALTER TABLE tasks ADD COLUMN color TEXT');
}

module.exports = db;
