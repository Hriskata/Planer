const express = require('express');
const db = require('../db');
const { APPROVAL_STATUSES, MAX_COMMENT_LENGTH } = require('../taskFields');

const router = express.Router();

const LINK_NOT_FOUND = { error: 'Линкът не съществува или е изтекъл.' };

// Deliberately the SAME error for "token never existed" and "token was revoked" —
// distinguishing the two would let a caller probe whether a guessed/leaked string was
// ever a valid link. Cheap to get right, so we do.
function resolveActiveLink(token) {
  if (typeof token !== 'string' || token.length === 0) return null;
  return db.prepare('SELECT owner_id, client FROM share_links WHERE token = ? AND revoked_at IS NULL').get(token);
}

// Resolves a specific task ONLY if it's actually within this token's own owner+client
// scope — guards the per-task comment/approval-status routes below against a visitor
// reusing a valid token to poke at some OTHER task (even one belonging to the same
// owner but a different client, e.g. by guessing sequential ids). Returns null for any
// failure mode (bad token, unknown task, wrong owner/client) so callers can respond with
// the same non-distinguishable LINK_NOT_FOUND regardless of which check actually failed.
function resolveTaskInScope(token, taskId) {
  const link = resolveActiveLink(token);
  if (!link) return null;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task || task.user_id !== link.owner_id || task.client !== link.client) return null;
  return task;
}

// Link metadata only (client name, for the page header) — kept separate from the task
// list below so the frontend can render "Календар на <клиент>" immediately and retry
// the (larger) task fetch independently.
router.get('/:token', (req, res) => {
  const link = resolveActiveLink(req.params.token);
  if (!link) return res.status(404).json(LINK_NOT_FOUND);
  res.json({ client: link.client });
});

// This link's client's tasks — minimal column set, no email_*/reminder_sent/shared/
// user_id (see schema.sql/CLAUDE.md for why those are private-to-owner columns). No
// `shared = 1` OR-clause either — tasks.shared is an unrelated "visible to every user
// of this instance" mechanism that has no business leaking into a public client link.
router.get('/:token/tasks', (req, res) => {
  const link = resolveActiveLink(req.params.token);
  if (!link) return res.status(404).json(LINK_NOT_FOUND);

  const rows = db
    .prepare(
      `SELECT id, title, notes, date, time, status, client, post_type, platform, priority, image_path, approval_status
       FROM tasks
       WHERE user_id = @ownerId AND client = @client
       ORDER BY date IS NULL, date ASC, time IS NULL, time ASC`
    )
    .all({ ownerId: link.owner_id, client: link.client });
  res.json(rows);
});

// Comment thread for one task, as seen from the public link — same shape/order as the
// authed GET /api/tasks/:id/comments (routes/tasks.js).
router.get('/:token/tasks/:taskId/comments', (req, res) => {
  const task = resolveTaskInScope(req.params.token, req.params.taskId);
  if (!task) return res.status(404).json(LINK_NOT_FOUND);

  const rows = db
    .prepare('SELECT id, author, body, created_at FROM task_comments WHERE task_id = ? ORDER BY id ASC')
    .all(task.id);
  res.json(rows);
});

// A visitor with a valid link can post a comment — author = 'client' distinguishes it
// from the owner's own replies (routes/tasks.js's POST /:id/comments, author = 'owner').
// No rate limiting here, deliberately — same tradeoff already accepted for the rest of
// this public router: the 192-bit token is the only real gate, and an IP-keyed limiter
// is a no-op behind Cloudflare Tunnel (see CLAUDE.md т.4 on share_links).
router.post('/:token/tasks/:taskId/comments', (req, res) => {
  const task = resolveTaskInScope(req.params.token, req.params.taskId);
  if (!task) return res.status(404).json(LINK_NOT_FOUND);

  const body = req.body?.body;
  if (typeof body !== 'string' || body.trim().length === 0) {
    return res.status(400).json({ error: 'Коментарът не може да е празен.' });
  }
  if (body.length > MAX_COMMENT_LENGTH) {
    return res.status(400).json({ error: `Коментарът трябва да е до ${MAX_COMMENT_LENGTH} символа.` });
  }

  const result = db
    .prepare('INSERT INTO task_comments (task_id, author, body) VALUES (?, ?, ?)')
    .run(task.id, 'client', body.trim());
  const created = db.prepare('SELECT id, author, body, created_at FROM task_comments WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// Client-side approval status change — a RAW UPDATE, deliberately NOT going through
// tasks.js's applyTaskUpdate/task_history machinery: there's no authenticated user_id to
// attribute the change to (task_history.actor_id is a NOT NULL FK to users(id)), so this
// intentionally does not appear in the owner's audit "История" — only owner-initiated
// status changes (via the normal authed PUT /:id) do.
router.put('/:token/tasks/:taskId/approval-status', (req, res) => {
  const task = resolveTaskInScope(req.params.token, req.params.taskId);
  if (!task) return res.status(404).json(LINK_NOT_FOUND);

  const status = req.body?.status;
  if (status !== null && !APPROVAL_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status трябва да е null или едно от: ${APPROVAL_STATUSES.join(', ')}.` });
  }

  db.prepare("UPDATE tasks SET approval_status = ?, approval_status_set_by = 'client', updated_at = datetime('now') WHERE id = ?")
    .run(status, task.id);
  res.json({ id: task.id, approval_status: status, approval_status_set_by: 'client' });
});

module.exports = router;
