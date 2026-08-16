<script>
  import { colorForPostType } from './colors.js';
  import { colorForPriority } from './priorities.js';
  import { handlePointerDown, getDragState, consumeSuppressedClick } from './dragDrop.svelte.js';
  import Icon from './Icon.svelte';

  // Used identically everywhere a post renders (week view, day view, the backlog
  // column) so the same content always looks the same regardless of where it appears.
  // readOnly: viewing someone else's shared calendar (see CalendarSwitcher.svelte) —
  // no drag, no toggling done; the tile still opens on click, MainView just renders
  // TaskForm itself in read-only mode when this is set.
  let { task, dimmed = false, onEdit, onToggle, readOnly = false } = $props();

  // Done tasks always render gray+struck-through (CSS class) regardless of post-type
  // color — an inline style would otherwise win the cascade over that class, so this
  // returns '' for done tasks and lets the .done CSS rule apply undisturbed.
  function tileColorStyle() {
    if (task.status === 'done') return '';
    const c = colorForPostType(task.post_type);
    // The priority left-edge stripe rides along on the same inline style (not a
    // separate element) so it shares the done-task exemption above for free — an
    // already-completed task shouldn't still shout "urgent" at you.
    const priorityStripe = task.priority ? `border-left: 4px solid ${colorForPriority(task.priority)};` : '';
    return `background: ${c.bg}; color: ${c.fg}; ${priorityStripe}`;
  }

  // "Client - post type" is the primary label per the content-planning layout; falls
  // back to the title when neither is set (e.g. older tasks from before these fields
  // existed) so a post never renders with a blank label.
  function postLabel() {
    const parts = [task.client, task.post_type].map((v) => (v || '').trim()).filter(Boolean);
    return parts.length > 0 ? parts.join(' - ') : task.title;
  }
</script>

<!-- Not role="button"/tabindex — a checkbox nested inside an element exposed as a
     button to assistive tech is an invalid, confusing ARIA structure (and doubles the
     tab stops per tile). Mouse users can still click anywhere on the tile to edit (this
     onclick); the real keyboard/AT-accessible entry point is the .post-label button
     below instead, a plain sibling of the checkbox, not an ancestor of it. -->
<div
  class="post"
  class:done={task.status === 'done'}
  class:dimmed
  class:dragging={getDragState()?.task.id === task.id}
  style={tileColorStyle()}
  onpointerdown={(e) => {
    if (!readOnly) handlePointerDown(e, task);
  }}
  onclick={() => {
    if (consumeSuppressedClick()) return;
    onEdit(task);
  }}
>
  <div class="post-header">
    {#if task.priority}
      <!-- Text stays the tile's own foreground color, not colorForPriority(task) — the
           left-edge stripe above already carries the color signal; recoloring the text
           too would fight the post-type background instead of just accenting it. -->
      <span class="priority-badge" title={`Приоритет ${task.priority}`}>P{task.priority}</span>
    {/if}
    {#if task.series_id}
      <span class="repeat-badge" title="Част от повтаряща се поредица">
        <Icon name="repeat" size="0.7rem" />
      </span>
    {/if}
    {#if task.approval_status === 'approved'}
      <span class="approval-badge approved" title="Одобрен">
        <Icon name="check-circle" size="0.7rem" />
      </span>
    {:else if task.approval_status === 'changes_requested'}
      <span class="approval-badge changes" title="Нужни промени">
        <Icon name="alert-circle" size="0.7rem" />
      </span>
    {/if}
    <button
      type="button"
      class="post-label"
      onclick={(e) => {
        e.stopPropagation();
        if (consumeSuppressedClick()) return;
        onEdit(task);
      }}
    >
      {postLabel()}
    </button>
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <!-- Stops the click from bubbling to the tile's own onclick (which opens the edit
         form) — toggling done shouldn't also open the form. -->
    <label class="post-done" onclick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={task.status === 'done'} onchange={() => onToggle(task)} disabled={readOnly} />
      Завършен
    </label>
  </div>
  {#if task.image_path}
    <img class="post-image" src={task.image_path} alt="" loading="lazy" />
  {/if}
</div>

<style>
  .post {
    background: var(--color-post-default-bg);
    color: var(--color-post-default-fg);
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
  .post-label:focus-visible {
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
    /* Reset <button> defaults — visually identical to the plain <span> this replaced,
       see the nested-interactive-controls comment above the markup for why it's a
       button now. */
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    font-family: inherit;
    font-size: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .priority-badge {
    font-size: 0.65rem;
    font-weight: 700;
    flex-shrink: 0;
    opacity: 0.85;
  }
  .repeat-badge {
    display: inline-flex;
    flex-shrink: 0;
    opacity: 0.85;
  }
  .approval-badge {
    display: inline-flex;
    flex-shrink: 0;
  }
  .approval-badge.approved {
    color: var(--color-success);
  }
  .approval-badge.changes {
    color: var(--color-danger);
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
    border-radius: 6px; /* matches .post's own radius, so the photo isn't sharp-cornered inside a rounded tile */
  }
  .post.done .post-image {
    filter: grayscale(100%);
    opacity: 0.75;
  }
</style>
