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
// fine at this project's scale (a handful of columns, one table). Runs BEFORE the
// NOT NULL migration below, so that rebuild's explicit column list always has a
// matching column to read from, however old the database is.
const taskColumns = db.prepare("PRAGMA table_info(tasks)").all().map((c) => c.name);
for (const [column, type] of [
  ['color', 'TEXT'],
  ['client', 'TEXT'],
  ['post_type', 'TEXT'],
  ['image_path', 'TEXT'],
  ['reminder_sent', 'INTEGER NOT NULL DEFAULT 0'],
]) {
  if (!taskColumns.includes(column)) {
    db.exec(`ALTER TABLE tasks ADD COLUMN ${column} ${type}`);
  }
}

const userColumns = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!userColumns.includes('reminder_minutes')) {
  db.exec('ALTER TABLE users ADD COLUMN reminder_minutes INTEGER NOT NULL DEFAULT 10');
}

// SQLite can't directly relax a NOT NULL constraint on an existing column — the only
// way is to rebuild the table. Needed so existing databases (from before "unscheduled"
// backlog tasks existed) allow date to be NULL too, not just brand-new ones. Uses an
// explicit column list (not SELECT *) so it doesn't depend on old/new column order
// matching.
const dateColumn = db.prepare("PRAGMA table_info(tasks)").all().find((c) => c.name === 'date');
if (dateColumn?.notnull) {
  db.exec('BEGIN');
  try {
    db.exec(`
      CREATE TABLE tasks_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        notes TEXT,
        date TEXT,
        time TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        shared INTEGER NOT NULL DEFAULT 0,
        color TEXT,
        client TEXT,
        post_type TEXT,
        image_path TEXT,
        reminder_sent INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO tasks_new (
        id, user_id, title, notes, date, time, status, shared,
        color, client, post_type, image_path, reminder_sent, created_at, updated_at
      )
      SELECT
        id, user_id, title, notes, date, time, status, shared,
        color, client, post_type, image_path, reminder_sent, created_at, updated_at
      FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;
      CREATE INDEX IF NOT EXISTS idx_tasks_user_date ON tasks(user_id, date);
    `);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = db;
