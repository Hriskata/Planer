<script>
  import { displayDate, weekdayNameShort, isWeekend } from './date.js';
  import { colorOf } from './colors.js';
  import { taskMatchesAny } from './search.js';

  let { weekDates, tasks, searchFilter = [], onEdit, onCreate } = $props();

  // Done tasks always render gray+struck-through (CSS class) regardless of color — an
  // inline style would otherwise win the cascade over that class, so this returns ''
  // for done tasks and lets the .done CSS rule apply undisturbed.
  function tileColorStyle(task) {
    const c = task.status !== 'done' ? colorOf(task.color) : null;
    return c ? `background: ${c.bg}; color: ${c.fg};` : '';
  }

  function isDimmed(task) {
    return searchFilter.length > 0 && !taskMatchesAny(task, searchFilter);
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
  // external monitor, etc.) rather than an arbitrary fraction of it. Re-measured on
  // resize since the chrome above (search bar, tag chips) can wrap to more lines.
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

  // Click-to-create on empty column space — the post buttons handle their own clicks
  // (edit), so this only fires when the click didn't land on one. No hour grid here, so
  // a click just creates an untimed post for that day — the user sets a time in the
  // form if they want one.
  function handleColumnClick(e, date) {
    if (e.target.closest('button')) return;
    onCreate(date, null);
  }
</script>

<svelte:window onresize={measureBodyHeight} />

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
          style="height: {bodyHeight}px"
          onclick={(e) => handleColumnClick(e, day.date)}
        >
          {#each day.tasks as task (task.id)}
            <button
              class="post"
              class:done={task.status === 'done'}
              class:dimmed={isDimmed(task)}
              style={tileColorStyle(task)}
              onclick={() => onEdit(task)}
            >
              {#if task.time}<span class="post-time">{task.time}</span>{/if}
              <span class="post-title">{task.title}</span>
            </button>
          {:else}
            <p class="empty-hint">Няма постове</p>
          {/each}
        </div>
      {/each}
    </div>
  </div>
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
       on narrow screens lets unbroken post-title text (white-space: nowrap) push each
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
    gap: 0.35rem;
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
    padding: 0.35rem 0.5rem;
    text-align: left;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    font-size: 0.8rem;
    line-height: 1.2;
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
  .post-time {
    font-size: 0.7rem;
    font-weight: 600;
    opacity: 0.85;
  }
  .post-title {
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
  }
  .empty-hint {
    margin: 0;
    font-size: 0.7rem;
    color: #94a3b8;
    text-align: center;
    padding: 0.5rem 0;
  }
</style>
