const express = require('express');
const db = require('../db');
const { encrypt } = require('../crypto');
const { invalidateTransporter } = require('../email');
const { EMAIL_RE, normalizeEmail } = require('../validators');

const router = express.Router();

// The sender identity for "email a task on completion" — a per-user setting, separate
// from login identity (a user could sign in with a password but still send through a
// Gmail account, or sign in with Google but send through a different address). The App
// Password itself is never sent back to the client, only whether one is currently set.
router.get('/email-sender', (req, res) => {
  const user = db.prepare('SELECT email, email_app_password_enc FROM users WHERE id = ?').get(req.user.id);
  res.json({ email: user.email, hasAppPassword: Boolean(user.email_app_password_enc) });
});

router.put('/email-sender', (req, res) => {
  const { email, appPassword } = req.body || {};

  // '' is treated the same as null (both clear the field) — validated separately from
  // "did the request even touch this field at all" below, or an empty string would
  // always fail EMAIL_RE and a user could never actually clear their sender email from
  // Settings (only ever change it to another valid address).
  if (email !== undefined && email !== null && email !== '') {
    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'email трябва да е валиден имейл адрес.' });
    }
  }

  // Both fields follow the same "omitted = leave untouched" rule (an explicit null/''
  // is what clears them) — email used to be set unconditionally to `email ?? null` here,
  // which wiped the stored address on any update that didn't happen to include it (e.g.
  // a request that only rotates the App Password).
  const updates = {};
  if (email !== undefined) updates.email = email ? normalizeEmail(email) : null;
  if (typeof appPassword === 'string' && appPassword.trim()) {
    updates.email_app_password_enc = encrypt(appPassword.trim());
  } else if (appPassword === '') {
    updates.email_app_password_enc = null;
  }

  if (Object.keys(updates).length > 0) {
    const setClauses = Object.keys(updates)
      .map((col) => `${col} = @${col}`)
      .join(', ');
    db.prepare(`UPDATE users SET ${setClauses} WHERE id = @id`).run({ ...updates, id: req.user.id });
    invalidateTransporter(req.user.id);
  }
  res.status(204).send();
});

module.exports = router;
