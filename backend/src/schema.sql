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
  platform TEXT,                            -- e.g. 'Facebook', 'Instagram', ... or free text
                                             -- when the user picks "Други" in the dropdown
  priority INTEGER,                         -- 1 (most urgent) to 4 (least), or NULL = unset
  image_path TEXT,                          -- e.g. '/uploads/<uuid>.jpg', or NULL
  reminder_sent INTEGER NOT NULL DEFAULT 0, -- 1 once the 10-min-before push has gone out
  email_on_complete INTEGER NOT NULL DEFAULT 0, -- opt-in: send an email when this task is marked done
  email_to TEXT,
  email_subject TEXT,
  email_body TEXT,
  email_sent INTEGER NOT NULL DEFAULT 0,    -- 1 once the completion email has gone out for the
                                             -- current "done" streak; resets to 0 if un-done
  series_id INTEGER REFERENCES task_series(id) ON DELETE SET NULL, -- NULL = standalone task,
                                             -- otherwise one materialized occurrence of a
                                             -- recurring series (see task_series below).
                                             -- ON DELETE SET NULL is documentation only —
                                             -- this DB never sets PRAGMA foreign_keys = ON,
                                             -- so nothing here is actually enforced by SQLite.
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_date ON tasks(user_id, date);

-- Recurrence RULE for a materialized series of tasks — created once at series-creation
-- time (see routes/tasks.js's POST / recurrence handling) and never re-read to generate
-- more rows later: recurrence always has a required end date (until_date), so every
-- occurrence is inserted as a real tasks row up front, no background generator job like
-- notifications.js needed. Kept around afterwards only so "this and all following"/
-- "entire series" edits and deletes (tasks.series_id) have a rule to key off. Only
-- describes WHEN a series repeats — WHAT each post contains lives entirely on the
-- individual tasks rows, each a fully independent, fully-populated occurrence.
CREATE TABLE IF NOT EXISTS task_series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recurrence_type TEXT NOT NULL,            -- 'daily' | 'weekly' | 'monthly'
  weekdays TEXT,                            -- weekly only: comma-separated ISO weekdays
                                             -- '1'..'7' (1=Monday), e.g. '1,3,5'; NULL
                                             -- for daily/monthly
  start_date TEXT NOT NULL,                 -- YYYY-MM-DD, the first occurrence's date
  until_date TEXT NOT NULL,                 -- YYYY-MM-DD, inclusive — required, v1 has no
                                             -- infinite/rolling recurrence
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per browser/device the user enabled notifications on (a user can have several).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Read-only calendar sharing: the owner grants a specific email full view access to
-- their own calendar (all of their tasks, not just shared=1 ones — a different, broader
-- mechanism than tasks.shared, which is "visible to literally every user of this
-- instance"). Matched against the invitee's own users.email at query time, not resolved
-- to a user_id up front, so an invite still "takes" once that person later sets/changes
-- their email in Settings.
CREATE TABLE IF NOT EXISTS calendar_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(owner_id, shared_email)
);

-- Асет библиотека: брандинг материали (лого, шрифтове, снимки, текстове...) по клиент.
-- owner_id is whose library this belongs to (same "whose calendar" concept as tasks —
-- anyone with calendar_shares access to owner_id can view/upload/download, see
-- routes/library.js), uploaded_by is who actually added it, tracked separately because
-- a shared collaborator may only delete their OWN uploads while the owner can delete
-- anything in their own library (admin-style) — two different people, two different
-- permissions, so one column can't cover both.
CREATE TABLE IF NOT EXISTS library_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client TEXT NOT NULL,
  type TEXT NOT NULL,                       -- 'Лого' | 'Шрифт' | 'Снимка' | 'Текст' | 'Цвят' | 'Друго'
  title TEXT NOT NULL,
  file_path TEXT,                           -- e.g. '/uploads/<uuid>.png', NULL for text/color-only assets
  text_content TEXT,                        -- 'Текст' assets only
  hex_code TEXT,                            -- 'Цвят' assets only, e.g. '#3B82F6'
  rgb_value TEXT,                           -- 'Цвят' assets only, e.g. '59, 130, 246'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_library_assets_owner ON library_assets(owner_id);

-- Публични, неавтентикирани share линкове: собственикът генерира линк, скопиран до
-- ЕДИН client (не целия календар) — трети sharing механизъм, различен от tasks.shared
-- (видимо за всички вътрешни потребители) и calendar_shares (targeted-by-email,
-- автентикирано, целия календар). Токенът е единствената защита — публичният route
-- НЕ минава през requireAuth (виж routes/publicShare.js). Revoke е soft (revoked_at),
-- за да остане audit следа вместо линкът просто да изчезне. Частичният уникален индекс
-- по-долу гарантира най-много един АКТИВЕН линк на (owner_id, client) — създаване е
-- идемпотентно (връща съществуващия активен линк), а create след revoke винаги дава
-- нов токен, защото стария ред вече не колизира (revoked_at не е NULL).
CREATE TABLE IF NOT EXISTS share_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token);

CREATE UNIQUE INDEX IF NOT EXISTS idx_share_links_active_owner_client
  ON share_links(owner_id, client) WHERE revoked_at IS NULL;

-- Audit log за задачи: кой какво е променил и кога. task_id умишлено НЕ е FK към
-- tasks(id) — записите трябва да преживеят изтриване на самата задача (глобалният
-- "Активност" feed показва и вече изтрита активност); PRAGMA foreign_keys така или иначе
-- никога не е ON в тази база. owner_id е task.user_id към момента на действието (за
-- scoping на видимост, същия модел като tasks/library_assets), actor_id е кой реално е
-- извършил действието (req.user.id) — днес винаги съвпада с owner_id, защото редакция/
-- изтриване на задача е ограничено само до собственика ѝ, но пази разграничението за
-- деня, в който task sharing евентуално стане editable, а не само read-only.
CREATE TABLE IF NOT EXISTS task_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,                     -- 'created' | 'updated' | 'deleted'
  task_title TEXT NOT NULL,                 -- snapshot към момента на събитието —
                                             -- четимо дори след преименуване/изтриване
  changes TEXT,                             -- JSON [{field, old, new}, ...], само за
                                             -- 'updated' с непразен diff, иначе NULL
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_task_history_task ON task_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_history_owner_created ON task_history(owner_id, id);
