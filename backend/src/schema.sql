-- Runs on every server startup (IF NOT EXISTS = safe to re-run).

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  reminder_minutes INTEGER NOT NULL DEFAULT 10, -- how long before a task's time to push a reminder
  google_id TEXT UNIQUE,                    -- Google's "sub" claim, set for accounts created via
                                             -- Sign in with Google; NULL for password-only accounts
  email TEXT,                               -- sender address for "email a task on completion"
                                             -- (defaults to the Google account's email on Google
                                             -- sign-up; editable in Settings either way)
  email_app_password_enc TEXT,              -- Gmail App Password, encrypted at rest (see crypto.js)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  date TEXT,                                -- format YYYY-MM-DD, NULL = unscheduled (backlog)
  time TEXT,                                -- format HH:MM, optional
  status TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'done'
  shared INTEGER NOT NULL DEFAULT 0,        -- 0 = personal task, 1 = visible to all users
  color TEXT,                               -- legacy, unused — color is now derived from
                                             -- post_type on the frontend (colors.js)
  client TEXT,
  post_type TEXT,
  priority INTEGER,                         -- 1 (most urgent) to 4 (least), or NULL = unset
  image_path TEXT,                          -- e.g. '/uploads/<uuid>.jpg', or NULL
  reminder_sent INTEGER NOT NULL DEFAULT 0, -- 1 once the 10-min-before push has gone out
  email_on_complete INTEGER NOT NULL DEFAULT 0, -- opt-in: send an email when this task is marked done
  email_to TEXT,
  email_subject TEXT,
  email_body TEXT,
  email_sent INTEGER NOT NULL DEFAULT 0,    -- 1 once the completion email has gone out for the
                                             -- current "done" streak; resets to 0 if un-done
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_date ON tasks(user_id, date);

-- One row per browser/device the user enabled notifications on (a user can have several).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
