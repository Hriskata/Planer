// Free-text search covers title, notes, client, and post type — a plain
// case-insensitive substring match against all four.
export function taskMatches(task, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  return (
    (task.title || '').toLowerCase().includes(q) ||
    (task.notes || '').toLowerCase().includes(q) ||
    (task.client || '').toLowerCase().includes(q) ||
    (task.post_type || '').toLowerCase().includes(q)
  );
}

// Multiple filters combine with OR — a task stands out if it matches ANY active
// filter (free-typed text and/or one or more selected client chips at once). No active
// filters means no filtering at all (everything matches, nothing dims).
export function taskMatchesAny(task, filters) {
  if (!filters || filters.length === 0) return true;
  return filters.some((f) => taskMatches(task, f));
}

// Pulls the distinct set of clients out of whatever tasks are currently loaded, so the
// UI can offer them as quick-pick chips instead of the user retyping the same name.
export function extractClients(tasks) {
  const clients = new Set();
  for (const task of tasks) {
    const client = (task.client || '').trim();
    if (client) clients.add(client);
  }
  return [...clients].sort((a, b) => a.localeCompare(b, 'bg'));
}

// Maps each client to the color already used by an existing task of theirs — so a new
// task for the same client can inherit it automatically. First match wins if history is
// inconsistent (e.g. tasks colored before this feature existed); not worth resolving further.
export function getClientColors(tasks) {
  const map = new Map();
  for (const task of tasks) {
    if (!task.color) continue;
    const client = (task.client || '').trim();
    if (client && !map.has(client)) map.set(client, task.color);
  }
  return map;
}
