const express = require('express');
const db = require('../db');

const router = express.Router();

const LINK_NOT_FOUND = { error: 'Линкът не съществува или е изтекъл.' };

// Deliberately the SAME error for "token never existed" and "token was revoked" —
// distinguishing the two would let a caller probe whether a guessed/leaked string was
// ever a valid link. Cheap to get right, so we do.
function resolveActiveLink(token) {
  if (typeof token !== 'string' || token.length === 0) return null;
  return db.prepare('SELECT owner_id, client FROM share_links WHERE token = ? AND revoked_at IS NULL').get(token);
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
      `SELECT id, title, notes, date, time, status, client, post_type, platform, priority, image_path
       FROM tasks
       WHERE user_id = @ownerId AND client = @client
       ORDER BY date IS NULL, date ASC, time IS NULL, time ASC`
    )
    .all({ ownerId: link.owner_id, client: link.client });
  res.json(rows);
});

module.exports = router;
