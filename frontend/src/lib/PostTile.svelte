<script>
  import { colorForPostType } from './colors.js';
  import { handlePointerDown, getDragState, consumeSuppressedClick } from './dragDrop.svelte.js';

  // Used identically everywhere a post renders (week view, day view, the backlog
  // column) so the same content always looks the same regardless of where it appears.
  let { task, dimmed = false, onEdit, onToggle } = $props();

  // Done tasks always render gray+struck-through (CSS class) regardless of post-type
  // color — an inline style would otherwise win the cascade over that class, so this
  // returns '' for done tasks and lets the .done CSS rule apply undisturbed.
  function tileColorStyle() {
    if (task.status === 'done') return '';
    const c = colorForPostType(task.post_type);
    return `background: ${c.bg}; color: ${c.fg};`;
  }

  // "Client - post type" is the primary label per the content-planning layout; falls
  // back to the title when neither is set (e.g. older tasks from before these fields
  // existed) so a post never renders with a blank label.
  function postLabel() {
    const parts = [task.client, task.post_type].map((v) => (v || '').trim()).filter(Boolean);
    return parts.length > 0 ? parts.join(' - ') : task.title;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- A plain <button> can't contain the "Завършен" checkbox below (nested interactive
     controls are invalid HTML and double-fire clicks) — this div carries the same
     edit-on-click/keyboard behavior a button gives for free. -->
<div
  class="post"
  class:done={task.status === 'done'}
  class:dimmed
  class:dragging={getDragState()?.task.id === task.id}
  style={tileColorStyle()}
  role="button"
  tabindex="0"
  onpointerdown={(e) => handlePointerDown(e, task)}
  onclick={() => {
    if (consumeSuppressedClick()) return;
    onEdit(task);
  }}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onEdit(task);
    }
  }}
>
  <div class="post-header">
    <span class="post-label">{postLabel()}</span>
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <!-- Stops the click from bubbling to the tile's own onclick (which opens the edit
         form) — toggling done shouldn't also open the form. -->
    <label class="post-done" onclick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={task.status === 'done'} onchange={() => onToggle(task)} />
      Завършен
    </label>
  </div>
  {#if task.image_path}
    <img class="post-image" src={task.image_path} alt="" loading="lazy" />
  {/if}
</div>

<style>
  .post {
    background: #dbeafe;
    color: #1d4ed8;
    border: none;
    border-radius: 6px;
    padding: 0.35rem;
    text-align: left;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.8rem;
    line-height: 1.2;
    touch-action: none;
    /* Stops iOS's long-press magnifier/text-selection callout from hijacking a drag gesture. */
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }
  .post.done {
    background: var(--color-text-faint);
    color: white;
    text-decoration: line-through;
  }
  .post.dimmed {
    opacity: 0.35;
    filter: grayscale(60%);
  }
  .post.dragging {
    opacity: 0.3;
  }
  .post:focus-visible {
    outline: 2px solid var(--color-text);
    outline-offset: 1px;
  }
  .post-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
  }
  .post-label {
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    font-weight: 600;
    flex: 1;
    min-width: 0;
  }
  .post-done {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    font-size: 0.65rem;
    font-weight: normal;
    cursor: pointer;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .post-done input {
    margin: 0;
    cursor: pointer;
  }
  /* Uniform tile size across every post, everywhere it renders — aspect-ratio (not a
     fixed px height) keeps the box proportional to its container's own width, which
     itself already scales with screen size. object-fit: contain shrinks the photo to
     fit inside that box without cropping it (unlike cover); background: inherit fills
     the leftover letterboxed space with the same color as the tile itself instead of
     showing through blank. */
  .post-image {
    display: block;
    width: 100%;
    aspect-ratio: 1 / 1;
    object-fit: contain;
    background: inherit;
    border-radius: 4px;
  }
  .post.done .post-image {
    filter: grayscale(100%);
    opacity: 0.75;
  }
</style>
