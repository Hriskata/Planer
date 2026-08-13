const express = require('express');
const db = require('../db');
const { EMAIL_RE, normalizeEmail } = require('../validators');

const router = express.Router();

// SQLite's extended result code for a UNIQUE constraint violation (SQLITE_CONSTRAINT_
// UNIQUE) — used below to tell "already shared with this address" (fine, a no-op) apart
// from any other INSERT failure (which must not be swallowed as if it succeeded).
const SQLITE_CONSTRAINT_UNIQUE = 2067;

// Calendars I've granted access to — my own outgoing shares, for the "Споделяне на
// календар" settings screen (add/remove who can see my tasks).
router.get('/shares', (req, res) => {
  const rows = db
    .prepare('SELECT id, shared_email, created_at FROM calendar_shares WHERE owner_id = ? ORDER BY created_at DESC')
    .all(req.user.id);
  res.json(rows);
});

router.post('/shares', (req, res) => {
  const { email } = req.body || {};
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'email трябва да е валиден имейл адрес.' });
  }
  try {
    db.prepare('INSERT INTO calendar_shares (owner_id, shared_email) VALUES (?, ?)').run(req.user.id, normalizeEmail(email));
  } catch (err) {
    // UNIQUE(owner_id, shared_email) — already shared with this address is a no-op
    // success, not an error; the end state the caller wants is already true. Anything
    // else (a locked DB, etc.) is a real failure and must not look like success.
    if (err.errcode !== SQLITE_CONSTRAINT_UNIQUE) throw err;
  }
  res.status(204).send();
});

router.delete('/shares/:id', (req, res) => {
  const share = db.prepare('SELECT id FROM calendar_shares WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
  if (!share) {
    return res.status(404).json({ error: 'Споделянето не е намерено.' });
  }
  db.prepare('DELETE FROM calendar_shares WHERE id = ?').run(share.id);
  res.status(204).send();
});

// Calendars shared WITH me — matched against my own users.email (not my username/login
// identity), so this is empty until I've set a sender email in Settings even if someone
// already invited me; the header's calendar switcher reads this to build its dropdown.
router.get('/shared-with-me', (req, res) => {
  const me = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id);
  // A deleted-but-still-JWT-valid user (requireAuth only checks the token's signature,
  // not that the row still exists) would otherwise crash here instead of just seeing no
  // shared calendars.
  if (!me?.email) return res.json([]);

  const rows = db
    .prepare(
      `SELECT u.id AS ownerId, u.username AS ownerLabel
       FROM calendar_shares cs
       JOIN users u ON u.id = cs.owner_id
       WHERE cs.shared_email = ?
       ORDER BY u.username`
    )
    .all(me.email);
  res.json(rows);
});

module.exports = router;
