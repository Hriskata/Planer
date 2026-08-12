// Task color is derived entirely from post type — not a per-task manual choice — so
// content of the same type always reads the same way across the whole calendar.
// Values are CSS variable references (defined for both themes in app.css), not raw
// hex — the tile/chip that consumes these never needs to know which theme is active,
// the browser resolves the right shade via the cascade, same as every other themed
// color in the app.
const POST_TYPE_COLORS = {
  Reel: { bg: 'var(--color-post-reel-bg)', fg: 'var(--color-post-reel-fg)' },
  Post: { bg: 'var(--color-post-post-bg)', fg: 'var(--color-post-post-fg)' },
  Story: { bg: 'var(--color-post-story-bg)', fg: 'var(--color-post-story-fg)' },
  Carrousel: { bg: 'var(--color-post-carrousel-bg)', fg: 'var(--color-post-carrousel-fg)' },
};

// Falls back to a neutral blue for tasks with no post type set (e.g. created before
// this field existed) instead of rendering with no color at all.
const DEFAULT_COLOR = { bg: 'var(--color-post-default-bg)', fg: 'var(--color-post-default-fg)' };

export function colorForPostType(postType) {
  return POST_TYPE_COLORS[postType] ?? DEFAULT_COLOR;
}
