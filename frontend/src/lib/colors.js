// Task color is derived entirely from post type — not a per-task manual choice — so
// content of the same type always reads the same way across the whole calendar.
const POST_TYPE_COLORS = {
  Reel: { bg: '#96F835', fg: '#1e293b' },
  Post: { bg: '#5E81FD', fg: '#1e293b' },
  Story: { bg: '#E17CFD', fg: '#1e293b' },
  Carrousel: { bg: '#FCBF78', fg: '#1e293b' },
};

// Falls back to a neutral gray for tasks with no post type set (e.g. created before
// this field existed) instead of rendering with no color at all.
const DEFAULT_COLOR = { bg: '#dbeafe', fg: '#1d4ed8' };

export function colorForPostType(postType) {
  return POST_TYPE_COLORS[postType] ?? DEFAULT_COLOR;
}
