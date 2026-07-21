<script>
  import { displayDate, weekdayNameShort, isWeekend } from './date.js';
  import { colorForPostType } from './colors.js';
  import { taskMatchesFilters, hasActiveFilters } from './search.js';
  import { createDragToMove } from './dragDrop.svelte.js';

  let { weekDates, tasks, searchFilter = {}, onEdit, onToggle, onMove, onCreate } = $props();

  const drag = createDragToMove((task, changes) => onMove(task, changes));

  // Done tasks always render gray+struck-through (CSS class) regardless of post-type
  // color — an inline style would otherwise win the cascade over that class, so this
  // returns '' for done tasks and lets the .done CSS rule apply undisturbed.
  function tileColorStyle(task) {
    if (task.status === 'done') return '';
    const c = colorForPostType(task.post_type);
    return `background: ${c.bg}; color: ${c.fg};`;
  }

  function isDimmed(task) {
    return hasActiveFilters(searchFilter) && !taskMatchesFilters(task, searchFilter);
  }

  // "Client - post type" is the primary label per the content-planning layout; falls
  // back to the title when neither is set (e.g. older tasks from before these fields
  // existed) so a post never renders with a blank label.
  function postLabel(task) {
    const parts = [task.client, task.post_type].map((v) => (v || '').trim()).filter(Boolean);
    return parts.length > 0 ? parts.join(' - ') : task.title;
  }

  // Untimed posts (no time set) sort first, then timed posts chronologically.
  const dayData = $derived(
    weekDates.map((date) => ({
      date,
      tasks: tasks
        .filter((t) => t.date === date)
        .sort((a, b) => (a.time || '').localeCompare(b.time || '')),
    }))
  );

  // Fills the rest of the browser window below the header instead of a fixed vh
  // percentage, so the calendar actually scales with the real screen size (laptop,
  // external monitor, etc.). Re-measured on resize since the chrome above (search bar,
  // filter dropdowns) can wrap to more lines.
  const MIN_BODY_HEIGHT = 240;
  let gridEl;
  let bodyHeight = $state(400);
  function measureBodyHeight() {
    if (!gridEl) return;
    const top = gridEl.getBoundingClientRect().top;
    bodyHeight = Math.max(MIN_BODY_HEIGHT, window.innerHeight - top - 16);
  }

  $effect(() => {
    weekDates;
    measureBodyHeight();
  });

  // Click-to-create on empty column space — the posts handle their own clicks (edit,
  // toggle-done), so this only fires when the click didn't land on one. No hour grid
  // here, so a click just creates an untimed post for that day — the user sets a time
  // in the form if they want one.
  function handleColumnClick(e, date) {
    if (drag.consumeSuppressedClick()) return; // this click ended a drag, not a tap
    if (e.target.closest('.post')) return;
    onCreate(date, null);
  }
</script>

<svelte:window
  onresize={measureBodyHeight}
  onpointermove={drag.handlePointerMove}
  onpointerup={(e) => drag.handlePointerUp(e, '.day-column')}
  onpointercancel={drag.handlePointerCancel}
/>

<div class="calendar">
  <!-- Single horizontally-scrolling wrapper so the header and post columns stay
       column-aligned and scroll together on narrow phone screens. -->
  <div class="scroll-x">
    <div class="header-row">
      {#each weekDates as date (date)}
        <div class="day-header" class:weekend={isWeekend(date)}>
          <div class="day-name">{weekdayNameShort(date)}</div>
          <div class="day-date">{displayDate(date)}</div>
        </div>
      {/each}
    </div>

    <!-- gridEl is measured from here, NOT from a wrapper around .header-row too — the
         header is a sibling above, so its height is already excluded from bodyHeight
         (see measureBodyHeight). Nesting the header inside this element instead would
         double-count its height into every column's available space. -->
    <div class="grid" bind:this={gridEl}>
      {#each dayData as day (day.date)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- Post count is unpredictable (0-N, plain flex list) — no clean per-slot
             button to carry this click instead. Keyboard users still have the fully
             -accessible "+" FAB as a fallback. -->
        <div
          class="day-column"
          class:weekend={isWeekend(day.date)}
          data-date={day.date}
          style="height: {bodyHeight}px"
          onclick={(e) => handleColumnClick(e, day.date)}
        >
          {#each day.tasks as task (task.id)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- A plain <button> can't contain the "Завършена" checkbox below (nested
                 interactive controls are invalid HTML and double-fire clicks) — this
                 div carries the same edit-on-click/keyboard behavior a button gives for
                 free. -->
            <div
              class="post"
              class:done={task.status === 'done'}
              class:dimmed={isDimmed(task)}
              class:dragging={drag.dragState?.task.id === task.id}
              style={tileColorStyle(task)}
              role="button"
              tabindex="0"
              onpointerdown={(e) => drag.handlePointerDown(e, task)}
              onclick={() => {
                if (drag.consumeSuppressedClick()) return;
                onEdit(task);
              }}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(task); }
              }}
            >
              <span class="post-label">{postLabel(task)}</span>
              {#if task.image_path}
                <img class="post-image" src={task.image_path} alt="" loading="lazy" />
              {/if}
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
              <!-- Stops the click from bubbling to the tile's own onclick (which opens
                   the edit form) — toggling done shouldn't also open the form. -->
              <label class="post-done" onclick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={task.status === 'done'}
                  onchange={() => onToggle(task)}
                />
                Завършена
              </label>
            </div>
          {:else}
            <p class="empty-hint">Няма постове</p>
          {/each}
        </div>
      {/each}
    </div>
  </div>

  {#if drag.dragState?.moved}
    <div class="drag-ghost" style="left: {drag.dragState.x}px; top: {drag.dragState.y}px;">
      {postLabel(drag.dragState.task)}
    </div>
  {/if}
</div>

<style>
  .calendar {
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    overflow: hidden;
    background: white;
  }
  .scroll-x {
    overflow-x: auto;
  }
  .header-row,
  .grid {
    display: grid;
    /* minmax(0, 1fr), not plain 1fr: grid tracks default to a minimum of `auto`, which
       on narrow screens lets unbroken post-label text (white-space: nowrap) push each
       column wider than its fair share, overflowing the whole grid past the viewport
       with no scroll container to reach it (same overflow quirk as MonthCalendar). Both
       grids share this exact template so header and post columns stay aligned — neither
       one has its own vertical scrollbar (that lives per-column inside .day-column), so
       there's no scrollbar-width mismatch between them to compensate for. */
    grid-template-columns: repeat(7, minmax(110px, 1fr));
  }
  .header-row {
    border-bottom: 1px solid #e2e8f0;
  }
  .day-header {
    text-align: center;
    padding: 0.4rem 0.1rem;
    border-left: 1px solid #cbd5e1;
    min-width: 0;
  }
  .day-header:first-child {
    border-left: none;
  }
  .day-header.weekend {
    background: #e9edf2;
  }
  .day-name {
    font-size: 0.7rem;
    color: #64748b;
    text-transform: uppercase;
  }
  .day-date {
    font-size: 0.85rem;
    font-weight: 600;
  }
  .day-column {
    border-left: 1px solid #cbd5e1;
    min-width: 0;
    overflow-y: auto;
    padding: 0.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    cursor: pointer;
    box-sizing: border-box;
  }
  .day-column:first-child {
    border-left: none;
  }
  .day-column.weekend {
    background: #e9edf2;
  }
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
    background: #94a3b8;
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
  .post-label {
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    font-weight: 600;
  }
  /* Uniform tile size across every post, on every day column, regardless of the
     original photo's dimensions — aspect-ratio (not a fixed px height) keeps the box
     proportional to the day column's own width, which itself already scales with
     screen size. object-fit: contain shrinks the photo to fit inside that box without
     cropping it (unlike cover); background: inherit fills the leftover letterboxed
     space with the same color as the tile itself instead of showing through blank. */
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
  .post:focus-visible {
    outline: 2px solid #1e293b;
    outline-offset: 1px;
  }
  .post-done {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.7rem;
    font-weight: normal;
    cursor: pointer;
  }
  .post-done input {
    margin: 0;
    cursor: pointer;
  }
  .empty-hint {
    margin: 0;
    font-size: 0.7rem;
    color: #94a3b8;
    text-align: center;
    padding: 0.5rem 0;
  }
  .drag-ghost {
    position: fixed;
    transform: translate(-50%, -130%);
    pointer-events: none;
    background: #1d4ed8;
    color: white;
    padding: 0.3rem 0.5rem;
    border-radius: 6px;
    font-size: 0.75rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
    z-index: 50;
    max-width: 160px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
