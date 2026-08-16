const express = require('express');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

// SQLite's extended result code for a UNIQUE constraint violation — used below to catch
// a race against the partial unique index (schema.sql's idx_share_links_active_owner_client)
// rather than let a concurrent request for the same client blow up with a 500.
const SQLITE_CONSTRAINT_UNIQUE = 2067;

function activeLinkFor(ownerId, client) {
  return db
    .prepare('SELECT id, client, token, created_at, revoked_at FROM share_links WHERE owner_id = ? AND client = ? AND revoked_at IS NULL')
    .get(ownerId, client);
}

// My outgoing client share links (active + revoked, for an audit trail) — powers the
// "Сподели с клиента" action in LibraryPage's client sidebar.
router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT id, client, token, created_at, revoked_at FROM share_links WHERE owner_id = ? ORDER BY created_at DESC')
    .all(req.user.id);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { client } = req.body || {};
  if (typeof client !== 'string' || client.trim().length === 0) {
    return res.status(400).json({ error: 'client е задължителен и трябва да е непразен текст.' });
  }
  const trimmedClient = client.trim();

  // Idempotent: an already-active link for this client is returned as-is instead of
  // minting a duplicate — see schema.sql's partial unique index comment for why.
  const existing = activeLinkFor(req.user.id, trimmedClient);
  if (existing) return res.status(200).json(existing);

  // 24 random bytes, base64url-encoded — 192 bits of entropy. More than the randomUUID()
  // (122 bits) used for upload filenames elsewhere, because this token is the ENTIRE
  // authorization mechanism for the public route, not just a filename.
  const token = crypto.randomBytes(24).toString('base64url');

  try {
    db.prepare('INSERT INTO share_links (owner_id, client, token) VALUES (?, ?, ?)').run(req.user.id, trimmedClient, token);
  } catch (err) {
    if (err.errcode !== SQLITE_CONSTRAINT_UNIQUE) throw err;
    // Lost a race with a concurrent request for the same client — return whatever won.
    return res.status(200).json(activeLinkFor(req.user.id, trimmedClient));
  }

  res.status(201).json(activeLinkFor(req.user.id, trimmedClient));
});

router.delete('/:id', (req, res) => {
  const link = db.prepare('SELECT id FROM share_links WHERE id = ? AND owner_id = ? AND revoked_at IS NULL').get(req.params.id, req.user.id);
  if (!link) {
    return res.status(404).json({ error: 'Линкът не е намерен.' });
  }
  db.prepare("UPDATE share_links SET revoked_at = datetime('now') WHERE id = ?").run(link.id);
  res.status(204).send();
});

module.exports = router;
