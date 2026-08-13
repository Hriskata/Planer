// 1 = most urgent, 4 = least — same convention as Jira/Linear-style P1..P4, not a
// 1-is-lowest scale, so lower number always reads as "more important."
export const PRIORITIES = [1, 2, 3, 4];

const PRIORITY_LABELS = {
  1: 'P1 · Спешен',
  2: 'P2 · Висок',
  3: 'P3 · Среден',
  4: 'P4 · Нисък',
};

export function priorityLabel(priority) {
  return PRIORITY_LABELS[priority] ?? '';
}

const PRIORITY_COLORS = {
  1: 'var(--color-priority-1)',
  2: 'var(--color-priority-2)',
  3: 'var(--color-priority-3)',
  4: 'var(--color-priority-4)',
};

export function colorForPriority(priority) {
  return PRIORITY_COLORS[priority] ?? null;
}
