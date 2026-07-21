// The filter panel is 3 independent, narrowing criteria (free text, a specific client, a
// specific post type) that combine with AND — each one active only when set, so picking
// a client AND a post type together correctly shows just that combination, not either.
export function taskMatchesFilters(task, { text = '', client = '', postType = '' } = {}) {
  const q = text.trim().toLowerCase();
  if (q) {
    const hit =
      (task.title || '').toLowerCase().includes(q) ||
      (task.notes || '').toLowerCase().includes(q) ||
      (task.client || '').toLowerCase().includes(q) ||
      (task.post_type || '').toLowerCase().includes(q);
    if (!hit) return false;
  }
  if (client && task.client !== client) return false;
  if (postType && task.post_type !== postType) return false;
  return true;
}

export function hasActiveFilters({ text = '', client = '', postType = '' } = {}) {
  return Boolean(text.trim() || client || postType);
}

// Pulls the distinct set of clients out of whatever tasks are currently loaded, so the
// UI can offer them as a quick-pick dropdown instead of the user retyping the same name.
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
