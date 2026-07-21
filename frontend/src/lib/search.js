// A single free-text search covers both "search tasks" and "search tags" — tags are
// just literal `[tagname]` substrings inside the title/notes, so a plain case-insensitive
// substring match against both fields already finds them with no special parsing needed.
export function taskMatches(task, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  return (task.title || '').toLowerCase().includes(q) || (task.notes || '').toLowerCase().includes(q);
}

// Multiple filters combine with OR — a task stands out if it matches ANY active
// filter (free-typed text and/or one or more selected [tag] chips at once). No active
// filters means no filtering at all (everything matches, nothing dims).
export function taskMatchesAny(task, filters) {
  if (!filters || filters.length === 0) return true;
  return filters.some((f) => taskMatches(task, f));
}

const TAG_RE = /\[([^[\]]+)\]/g;

// Pulls the distinct set of [tag] names out of whatever tasks are currently loaded, so
// the UI can offer them as quick-pick chips instead of the user typing brackets by hand.
export function extractTags(tasks) {
  const tags = new Set();
  for (const task of tasks) {
    for (const text of [task.title, task.notes]) {
      if (!text) continue;
      for (const match of text.matchAll(TAG_RE)) {
        tags.add(match[1].trim());
      }
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b, 'bg'));
}

// Maps each [tag] to the color already used by an existing task carrying it — so a new
// task with the same tag can inherit it automatically. First match wins if history is
// inconsistent (e.g. tasks colored before this feature existed); not worth resolving further.
export function getTagColors(tasks) {
  const map = new Map();
  for (const task of tasks) {
    if (!task.color) continue;
    for (const text of [task.title, task.notes]) {
      if (!text) continue;
      for (const match of text.matchAll(TAG_RE)) {
        const tag = match[1].trim();
        if (!map.has(tag)) map.set(tag, task.color);
      }
    }
  }
  return map;
}
