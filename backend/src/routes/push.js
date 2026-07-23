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

// How many minutes before a task's time the reminder scheduler (notifications.js)
// should fire for this user — a per-user preference, not per-device.
router.get('/settings', (req, res) => {
  const user = db.prepare('SELECT reminder_minutes FROM users WHERE id = ?').get(req.user.id);
  res.json({ reminderMinutes: user.reminder_minutes });
});

router.put('/settings', (req, res) => {
  const { reminderMinutes } = req.body || {};
  if (!Number.isInteger(reminderMinutes) || reminderMinutes < 1 || reminderMinutes > 1440) {
    return res.status(400).json({ error: 'reminderMinutes трябва да е цяло число между 1 и 1440.' });
  }
  db.prepare('UPDATE users SET reminder_minutes = ? WHERE id = ?').run(reminderMinutes, req.user.id);
  res.status(204).send();
});

module.exports = router;
