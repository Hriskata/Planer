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
// it doesn't add columns to a tasks table that already exists from before these
// columns were introduced. This is a lightweight stand-in for a migration system,
// fine at this project's scale (a handful of columns, one table).
const taskColumns = db.prepare("PRAGMA table_info(tasks)").all().map((c) => c.name);
for (const [column, type] of [
  ['color', 'TEXT'],
  ['client', 'TEXT'],
  ['post_type', 'TEXT'],
  ['image_path', 'TEXT'],
]) {
  if (!taskColumns.includes(column)) {
    db.exec(`ALTER TABLE tasks ADD COLUMN ${column} ${type}`);
  }
}

module.exports = db;
