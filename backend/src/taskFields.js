// Small shared constants between routes/tasks.js (owner-side, authed PUT /:id) and
// routes/publicShare.js (client-side, unauthenticated PUT /:token/tasks/:taskId/approval-status)
// so the allowed values can't drift out of sync between the two validation call sites.
const APPROVAL_STATUSES = ['approved', 'changes_requested']; // null = "За преглед" (default)
const MAX_COMMENT_LENGTH = 2000;

module.exports = { APPROVAL_STATUSES, MAX_COMMENT_LENGTH };
