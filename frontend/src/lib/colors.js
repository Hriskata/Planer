// Shared task color palette — used by TaskForm (picker), TaskItem (list border), and
// WeekCalendar/MonthCalendar (tiles/chips), so the mapping only lives in one place.
export const TASK_COLORS = [
  { value: 'maroon', bg: '#8b4049', fg: '#ffffff', label: 'Бордо' },
  { value: 'crimson', bg: '#b7233a', fg: '#ffffff', label: 'Тъмночервен' },
  { value: 'red', bg: '#e6414f', fg: '#ffffff', label: 'Червен' },
  { value: 'orange', bg: '#f0672c', fg: '#ffffff', label: 'Оранжев' },
  { value: 'salmon', bg: '#e0987a', fg: '#1e293b', label: 'Сьомга' },
  { value: 'tan', bg: '#e8c48c', fg: '#1e293b', label: 'Пясъчен' },
  { value: 'yellow', bg: '#f2e14f', fg: '#1e293b', label: 'Жълт' },
  { value: 'lightgreen', bg: '#7bc95f', fg: '#1e293b', label: 'Светлозелен' },
  { value: 'green', bg: '#16a34a', fg: '#ffffff', label: 'Зелен' },
  { value: 'teal', bg: '#0e7c86', fg: '#ffffff', label: 'Тюркоазен' },
  { value: 'blue', bg: '#1d6fb8', fg: '#ffffff', label: 'Син' },
  { value: 'indigo', bg: '#2e2569', fg: '#ffffff', label: 'Индиго' },
  { value: 'mauve', bg: '#5c5568', fg: '#ffffff', label: 'Сиво-лилав' },
  { value: 'black', bg: '#1c1c1c', fg: '#ffffff', label: 'Черен' },
];

export function colorOf(value) {
  return TASK_COLORS.find((c) => c.value === value) ?? null;
}
