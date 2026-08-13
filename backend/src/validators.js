// Shared, not re-declared per-route — used wherever an email address needs the same
// "good enough, not full RFC 5322" check (task email_to, account sender email).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = { EMAIL_RE };
