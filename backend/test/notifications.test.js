const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const webpush = require('web-push');
const { startServer, stopServer, createUser, db } = require('./helpers');
const { checkReminders } = require('../src/notifications');

before(startServer);
after(stopServer);

// checkReminders() reads these lazily on every call (not at require time), so setting
// them here — a real keypair, generateVAPIDKeys() does no network call — is enough to
// make ensureConfigured() pass for every test in this file.
const vapidKeys = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapidKeys.publicKey;
process.env.VAPID_PRIVATE_KEY = vapidKeys.privateKey;

function localDateTimeInMinutes(deltaMinutes) {
  const d = new Date(Date.now() + deltaMinutes * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

test('two overlapping checkReminders() runs only send one push per due task', async () => {
  const user = createUser('remindertest');
  // 5 minutes out — inside the default 10-minute reminder window, and safely in the
  // future so it can't fail the "time >= now" half of the due-window check because of
  // second-level rounding (a task set to exactly "now" could lose that race).
  const { date, time } = localDateTimeInMinutes(5);
  db.prepare(
    `INSERT INTO tasks (user_id, title, date, time, reminder_sent) VALUES (?, ?, ?, ?, 0)`
  ).run(user.id, 'Due soon', date, time);
  db.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)`
  ).run(user.id, 'https://example.com/fake-endpoint', 'fake-p256dh', 'fake-auth');

  let sendCount = 0;
  const originalSend = webpush.sendNotification;
  webpush.sendNotification = async () => {
    sendCount += 1;
  };
  try {
    // Both calls are made before either is awaited — checkReminders runs synchronously
    // up through setting its `running` guard and reading dueTasks (node:sqlite is sync),
    // so the second call reliably observes running === true and bails immediately,
    // exactly reproducing the "overlapping 30s ticks" scenario the guard exists for.
    const first = checkReminders();
    const second = checkReminders();
    await Promise.all([first, second]);
  } finally {
    webpush.sendNotification = originalSend;
  }

  assert.equal(sendCount, 1, 'the due task should only be sent once, not once per overlapping run');
});
