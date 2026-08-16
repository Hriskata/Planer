// Client share-link review status — null (no value stored) is the implicit "За преглед"
// default, not a real member of this list, mirroring how priorities.js treats
// priority=null as "unset" rather than as a fourth priority level.
export const APPROVAL_STATUSES = ['approved', 'changes_requested'];

const APPROVAL_STATUS_LABELS = {
  approved: 'Одобрен',
  changes_requested: 'Нужни промени',
};

export function approvalStatusLabel(status) {
  return APPROVAL_STATUS_LABELS[status] ?? 'За преглед';
}
