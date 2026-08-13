const nodemailer = require('nodemailer');
const { decrypt } = require('./crypto');

// One transporter per sender (not a single shared one, unlike the old single-SMTP-
// account version) — each user sends through their OWN Gmail account and App Password,
// so the "from" address is always real and deliverable (no SPF/DKIM spoofing issues
// from sending as someone else through a server you don't control). Small cache so
// repeated sends from the same user in a short window don't rebuild the transport
// every time; Gmail's SMTP settings are fixed, so there's nothing else to configure.
const transporterCache = new Map();

function transporterFor(user) {
  let t = transporterCache.get(user.id);
  if (t) return t;
  t = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // STARTTLS on 587, not implicit TLS
    auth: { user: user.email, pass: decrypt(user.email_app_password_enc) },
  });
  transporterCache.set(user.id, t);
  return t;
}

// Called whenever a user's sender email/app password changes — a stale cached
// transporter would otherwise keep using the old (possibly now-invalid) credentials.
function invalidateTransporter(userId) {
  transporterCache.delete(userId);
}

// `sender` is the task's owner (their Gmail + decrypted App Password), not the task's
// recipient. Returns whether a message actually went out — routes/tasks.js uses this to
// decide if email_sent should flip to 1. No sender configured is a silent no-op (false),
// same as a thrown send error: either way no mail left the server, so the task must NOT
// be marked as sent, or a later fix (setting up the sender) would never get a chance to
// retry it.
async function sendTaskCompletionEmail(task, sender) {
  if (!sender?.email || !sender?.email_app_password_enc) return false;
  const transporter = transporterFor(sender);
  await transporter.sendMail({
    from: sender.email,
    to: task.email_to,
    subject: task.email_subject || `Завършена задача: ${task.title}`,
    text: task.email_body || '',
  });
  return true;
}

module.exports = { sendTaskCompletionEmail, invalidateTransporter };
