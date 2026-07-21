// Shared task color palette — used by TaskForm (picker), TaskItem (list border), and
// WeekCalendar/MonthCalendar (tiles/chips), so the mapping only lives in one place.
export const TASK_COLORS = [
  { value: 'green', bg: '#16a34a', fg: '#ffffff', label: 'Зелен' },
  { value: 'yellow', bg: '#eab308', fg: '#1e293b', label: 'Жълт' },
  { value: 'red', bg: '#dc2626', fg: '#ffffff', label: 'Червен' },
];

export function colorOf(value) {
  return TASK_COLORS.find((c) => c.value === value) ?? null;
}
