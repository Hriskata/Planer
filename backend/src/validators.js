// Shared, not re-declared per-route — used wherever an email address needs the same
// "good enough, not full RFC 5322" check (task email_to, account sender email).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Case doesn't carry identity for email addresses in practice (providers treat
// Ivan@Gmail.com and ivan@gmail.com as the same inbox) — applied everywhere an email
// gets stored (users.email, calendar_shares.shared_email) so a calendar share match
// can't silently fail just because the owner and the invitee typed/received different
// casing for the same address.
function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

module.exports = { EMAIL_RE, normalizeEmail };
