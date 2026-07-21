const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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

  const token = jwt.sign({ username: user.username }, process.env.JWT_SECRET, {
    subject: String(user.id),
    expiresIn: TOKEN_TTL,
  });

  res.json({ token, user: { id: user.id, username: user.username } });
});

module.exports = router;
