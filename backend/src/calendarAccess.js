const db = require('./db');

// Resolves "whose calendar/library is this request actually looking at" — the caller's
// own (the default, no ?calendar= at all) or someone else's, if that owner has granted
// the caller's own email access via calendar_shares (see routes/sharing.js). Returns
// null when ?calendar= doesn't resolve to anything the caller may see, so the route can
// 403 instead of silently falling back to "my own calendar" — a typo'd or revoked id
// should never quietly show the wrong (but real) data. Shared between routes/tasks.js
// and routes/library.js — both scope their data by the same owner/sharing rules.
function resolveViewedOwnerId(req) {
  const { calendar } = req.query;
  if (calendar === undefined) return req.user.id;

  const ownerId = Number(calendar);
  if (!Number.isInteger(ownerId)) return null;
  if (ownerId === req.user.id) return ownerId; // viewing "someone else's" own id is just your own calendar

  // requireAuth only verifies the JWT's signature, not that the user row still exists
  // (e.g. a dev DB reset while an old token is still cached in a browser) — `me` can
  // genuinely be undefined here.
  const me = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id);
  if (!me?.email) return null;

  const share = db
    .prepare('SELECT id FROM calendar_shares WHERE owner_id = ? AND shared_email = ?')
    .get(ownerId, me.email);
  return share ? ownerId : null;
}

module.exports = { resolveViewedOwnerId };
