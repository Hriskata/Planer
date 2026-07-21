// Small date helpers instead of a full library (date-fns etc.) — the app only
// works with plain YYYY-MM-DD dates, no time zones/locales.

export function todayStr() {
  return formatDate(new Date());
}

export function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + delta);
  return formatDate(date);
}

// The week starts on Monday.
export function startOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ...
  const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return addDays(formatDate(date), offset);
}

export function getWeekDates(dateStr) {
  const start = startOfWeek(dateStr);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

const WEEKDAY_NAMES = ['неделя', 'понеделник', 'вторник', 'сряда', 'четвъртък', 'петък', 'събота'];
const WEEKDAY_NAMES_SHORT = ['нед', 'пон', 'вт', 'ср', 'чет', 'пет', 'съб'];

export function weekdayName(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return WEEKDAY_NAMES[new Date(y, m - 1, d).getDay()];
}

export function weekdayNameShort(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return WEEKDAY_NAMES_SHORT[new Date(y, m - 1, d).getDay()];
}

export function displayDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d}.${String(m).padStart(2, '0')}.${y}`;
}

export function isWeekend(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 || day === 6;
}

// Adds whole months, clamping the day if the target month is shorter (e.g. Jan 31 -> Feb 28/29)
// instead of letting it silently roll into the following month.
export function addMonths(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1 + delta, 1);
  const daysInTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, daysInTargetMonth));
  return formatDate(target);
}

// The full grid shown on a month page: from the Monday on/before the 1st of the
// month through the Sunday on/after the last day — always a whole number of weeks.
export function getMonthGridDates(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  const firstOfMonth = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate(); // day 0 of next month = last day of this month
  const lastOfMonth = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const gridStart = startOfWeek(firstOfMonth);
  const gridEnd = addDays(startOfWeek(lastOfMonth), 6);

  const dates = [];
  for (let cur = gridStart; cur <= gridEnd; cur = addDays(cur, 1)) {
    dates.push(cur);
  }
  return dates;
}

const MONTH_NAMES = [
  'януари', 'февруари', 'март', 'април', 'май', 'юни',
  'юли', 'август', 'септември', 'октомври', 'ноември', 'декември',
];

export function monthLabel(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}
