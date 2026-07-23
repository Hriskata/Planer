const webpush = require('web-push');
const db = require('./db');

const CHECK_INTERVAL_MS = 30 * 1000;

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('VAPID ключовете липсват — напомнянията за задачи са изключени.');
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

// Local server time as 'YYYY-MM-DD HH:MM:SS' — tasks store date/time as plain text in
// whatever timezone the server runs in, so comparisons stay in that same naive frame
// rather than converting through UTC.
function nowString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function sendReminder(task) {
  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(task.user_id);
  if (subs.length === 0) return;

  const label = [task.client, task.post_type].map((v) => (v || '').trim()).filter(Boolean).join(' - ') || task.title;
  const payload = JSON.stringify({
    title: 'Планер — напомняне',
    body: `${label} в ${task.time}`,
    url: '/',
  });

  for (const sub of subs) {
    const subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
    try {
      await webpush.sendNotification(subscription, payload);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        // Subscription expired/revoked (browser data cleared, uninstalled, etc.) — drop
        // it instead of retrying it forever on every future check.
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
      } else {
        console.error('Push грешка за задача', task.id, ':', err.message);
      }
    }
  }
}

// Runs every 30s. A task is due once "now" has crossed (task time - the OWNER's own
// reminder_minutes preference) but the task's own time hasn't passed yet —
// reminder_sent guards it from firing twice, so a slightly delayed tick (or a server
// restart) still fires it exactly once, just late, rather than requiring a precise
// instant to not miss it. reminder_minutes varies per user, so it's read from the
// joined users row per task rather than a single bound parameter shared by every row.
async function checkReminders() {
  if (!ensureConfigured()) return;
  const now = nowString();
  const dueTasks = db
    .prepare(
      `SELECT t.* FROM tasks t
       JOIN users u ON u.id = t.user_id
       WHERE t.reminder_sent = 0
         AND t.date IS NOT NULL AND t.time IS NOT NULL
         AND datetime(t.date || ' ' || t.time) <= datetime(@now, '+' || u.reminder_minutes || ' minutes')
         AND datetime(t.date || ' ' || t.time) >= datetime(@now)`
    )
    .all({ now });

  for (const task of dueTasks) {
    await sendReminder(task);
    db.prepare('UPDATE tasks SET reminder_sent = 1 WHERE id = ?').run(task.id);
  }
}

module.exports = { checkReminders, CHECK_INTERVAL_MS };
