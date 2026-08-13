// The filter panel is independent, narrowing criteria (free text, a specific client, a
// specific post type, a specific priority) that combine with AND — each one active only
// when set, so picking a client AND a post type together correctly shows just that
// combination, not either.
export function taskMatchesFilters(task, { text = '', client = '', postType = '', priority = '' } = {}) {
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
  if (priority && task.priority !== Number(priority)) return false;
  return true;
}

export function hasActiveFilters({ text = '', client = '', postType = '', priority = '' } = {}) {
  return Boolean(text.trim() || client || postType || priority);
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
