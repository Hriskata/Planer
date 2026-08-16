// Deliberately mirrors frontend/src/lib/date.js's addDays/addMonths logic exactly (same
// day-of-month clamping) — kept as a SEPARATE CommonJS file, not a shared import, because
// the frontend file is ESM/Vite-bundled and this backend is CommonJS/require()-based with
// no build step. If the two ever drift, backend/test/taskSeries.test.js's occurrence-date
// assertions will catch it.
//
// new Date(y, m-1, d) (local-components constructor) is used throughout, NOT
// new Date(dateStr) (which parses YYYY-MM-DD as UTC midnight and can shift a day under a
// non-UTC server timezone) — same reasoning as date.js.

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + delta);
  return formatDate(date);
}

// Adds whole months, clamping the day if the target month is shorter (e.g. Jan 31 -> Feb
// 28/29) instead of letting it silently roll into the following month.
function addMonths(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1 + delta, 1);
  const daysInTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, daysInTargetMonth));
  return formatDate(target);
}

// ISO weekday: 1=Monday..7=Sunday (Date#getDay() is 0=Sunday..6=Saturday).
function isoWeekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return ((day + 6) % 7) + 1;
}

module.exports = { addDays, addMonths, isoWeekday };
