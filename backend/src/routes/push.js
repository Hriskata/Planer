const express = require('express');
const db = require('../db');

const router = express.Router();

// Public (not secret) — the frontend needs it to call pushManager.subscribe(). Behind
// requireAuth anyway, same as everything else under /api, just for consistency.
router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

// Upsert by endpoint — re-subscribing (e.g. after clearing site data) just replaces the
// old row for that endpoint rather than accumulating duplicates.
router.post('/subscribe', (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (typeof endpoint !== 'string' || !keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
    return res.status(400).json({ error: 'Невалиден push subscription обект.' });
  }
  db.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES (@userId, @endpoint, @p256dh, @auth)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = @userId, p256dh = @p256dh, auth = @auth`
  ).run({ userId: req.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth });
  res.status(204).send();
});

router.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body || {};
  if (typeof endpoint !== 'string') {
    return res.status(400).json({ error: 'endpoint е задължителен.' });
  }
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, req.user.id);
  res.status(204).send();
});

module.exports = router;
