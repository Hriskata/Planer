const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const db = require('../db');

const router = express.Router();

// Long-lived token (30 days) — a simple choice appropriate for a trusted family
// app instead of an access+refresh token pair. See note 3 in the project brief.
const TOKEN_TTL = '30d';

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Нужни са потребителско име и парола.' });
  }

  const user = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username);

  // Deliberately the same error message for an unknown user and a wrong password,
  // so we don't reveal which usernames exist.
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Грешно потребителско име или парола.' });
  }

  const token = issueToken(user);
  res.json({ token, user: { id: user.id, username: user.username } });
});

function issueToken(user) {
  return jwt.sign({ username: user.username }, process.env.JWT_SECRET, {
    subject: String(user.id),
    expiresIn: TOKEN_TTL,
  });
}

// Public (not secret) — a Google OAuth Client ID is meant to be visible in frontend
// code; fetched at runtime instead of baked into the build so it can change without a
// rebuild, same reasoning as /push/vapid-public-key.
router.get('/google-client-id', (req, res) => {
  res.json({ clientId: process.env.GOOGLE_CLIENT_ID || null });
});

let googleClient = null;
function getGoogleClient() {
  if (!googleClient) googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  return googleClient;
}

// Comma-separated allowlist (GOOGLE_ALLOWED_EMAILS) gates NEW account creation only —
// once someone has an account, tightening the list later doesn't retroactively lock
// them out. Unset/empty = open registration (whatever the landing page's "register"
// link is meant to allow); set it once the app is meant to stop accepting strangers.
function isAllowedNewSignup(email) {
  const raw = process.env.GOOGLE_ALLOWED_EMAILS;
  if (!raw || !raw.trim()) return true;
  const allowed = raw.split(',').map((e) => e.trim().toLowerCase());
  return allowed.includes(email.toLowerCase());
}

router.post('/google', async (req, res) => {
  const { credential } = req.body || {};
  if (typeof credential !== 'string' || !credential) {
    return res.status(400).json({ error: 'credential е задължителен.' });
  }
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: 'Влизането с Google не е конфигурирано на сървъра.' });
  }

  let payload;
  try {
    const ticket = await getGoogleClient().verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: 'Невалиден Google токен.' });
  }

  if (!payload.email_verified) {
    return res.status(401).json({ error: 'Google имейлът не е потвърден.' });
  }

  let user = db.prepare('SELECT id, username FROM users WHERE google_id = ?').get(payload.sub);

  if (!user) {
    if (!isAllowedNewSignup(payload.email)) {
      return res.status(403).json({ error: 'Този имейл няма право да създава акаунт.' });
    }

    // Google-created accounts still need *some* password_hash (the column is NOT NULL)
    // even though they'll never log in with a password — a random one that can never be
    // guessed/typed, not a nullable column, so this doesn't need its own schema/migration
    // special-case throughout the rest of the app.
    const placeholderHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12);
    try {
      const result = db
        .prepare(
          `INSERT INTO users (username, password_hash, google_id, email)
           VALUES (@username, @passwordHash, @googleId, @email)`
        )
        .run({ username: payload.email, passwordHash: placeholderHash, googleId: payload.sub, email: payload.email });
      user = { id: result.lastInsertRowid, username: payload.email };
    } catch {
      // username (= email) collides with an existing password-only account.
      return res.status(409).json({ error: 'Вече има акаунт с този имейл — влез с потребител/парола.' });
    }
  }

  const token = issueToken(user);
  res.json({ token, user: { id: user.id, username: user.username } });
});

module.exports = router;
