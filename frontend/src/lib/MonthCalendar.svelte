<script>
  import { isWeekend, weekdayNameShort, todayStr } from './date.js';
  import { colorForPostType } from './colors.js';
  import { taskMatchesFilters, hasActiveFilters } from './search.js';
  import { createDragToMove } from './dragDrop.svelte.js';

  let { monthDates, referenceMonth, tasks, searchFilter = {}, onEdit, onDayClick, onMove, onCreate } = $props();

  const drag = createDragToMove((task, changes) => onMove(task, changes));

  const MAX_CHIPS = 3;
  const today = todayStr();

  // Fills the rest of the browser window with the month grid instead of a fixed
  // per-row height, so it actually scales with the real screen size (laptop, external
  // monitor, etc.). Re-measured on resize and whenever the row count changes (a month
  // spans 5 or 6 week-rows depending on which days it starts/ends on).
  const MIN_ROW_HEIGHT = 90;
  let gridEl;
  let rowHeight = $state(MIN_ROW_HEIGHT);

  function measureRowHeight() {
    if (!gridEl) return;
    const rows = monthDates.length / 7;
    const top = gridEl.getBoundingClientRect().top;
    const available = window.innerHeight - top - 16;
    rowHeight = Math.max(MIN_ROW_HEIGHT, Math.floor(available / rows));
  }

  $effect(() => {
    monthDates;
    measureRowHeight();
  });

  const dayData = $derived(
    monthDates.map((date) => {
      // When a filter is active, matching tasks sort first so they always land in the
      // MAX_CHIPS visible slots instead of possibly being buried behind "+N още".
      const dayTasks = tasks
        .filter((t) => t.date === date)
        .sort((a, b) => {
          if (hasActiveFilters(searchFilter)) {
            const aMatch = taskMatchesFilters(a, searchFilter);
            const bMatch = taskMatchesFilters(b, searchFilter);
            if (aMatch !== bMatch) return aMatch ? -1 : 1;
          }
          return (a.time || '99:99').localeCompare(b.time || '99:99');
        });
      return {
        date,
        visible: dayTasks.slice(0, MAX_CHIPS),
        overflow: Math.max(0, dayTasks.length - MAX_CHIPS),
      };
    })
  );

  // Done tasks always render gray+struck-through (CSS class) — see the identical
  // comment/pattern in WeekCalendar.svelte.
  function chipStyle(task) {
    if (task.status === 'done') return '';
    const c = colorForPostType(task.post_type);
    return `background: ${c.bg}; color: ${c.fg};`;
  }

  function isDimmed(task) {
    return hasActiveFilters(searchFilter) && !taskMatchesFilters(task, searchFilter);
  }

  // Click-to-create on empty cell space — the day-number/chip/"+more" buttons handle
  // their own clicks (navigate/edit), so this only fires when the click didn't land on
  // one of them.
  function handleCellClick(e, date) {
    if (drag.consumeSuppressedClick()) return; // this click ended a drag, not a tap
    if (e.target.closest('button')) return;
    onCreate(date);
  }
</script>

<svelte:window
  onresize={measureRowHeight}
  onpointermove={drag.handlePointerMove}
  onpointerup={(e) => drag.handlePointerUp(e, '.day-cell')}
  onpointercancel={drag.handlePointerCancel}
/>

<div class="month-calendar">
  <div class="weekday-header">
    {#each monthDates.slice(0, 7) as date (date)}
      <div class="weekday-label" class:weekend={isWeekend(date)}>{weekdayNameShort(date)}</div>
    {/each}
  </div>
  <div class="month-grid" bind:this={gridEl}>
    {#each dayData as day (day.date)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- Chip count varies (0-N) so there's no fixed per-slot button to carry this
           click instead, same reasoning as WeekCalendar's day-column. Keyboard users
           still have the fully-accessible "+" FAB as a fallback. -->
      <div
        class="day-cell"
        class:weekend={isWeekend(day.date)}
        class:other-month={!day.date.startsWith(referenceMonth)}
        class:today={day.date === today}
        data-date={day.date}
        style="min-height: {rowHeight}px"
        onclick={(e) => handleCellClick(e, day.date)}
      >
        <button class="day-number" onclick={() => onDayClick(day.date)}>{Number(day.date.slice(8, 10))}</button>
        <div class="chips">
          {#each day.visible as task (task.id)}
            <button
              class="chip"
              class:done={task.status === 'done'}
              class:dimmed={isDimmed(task)}
              class:dragging={drag.dragState?.task.id === task.id}
              style={chipStyle(task)}
              onpointerdown={(e) => drag.handlePointerDown(e, task)}
              onclick={() => {
                if (drag.consumeSuppressedClick()) return;
                onEdit(task);
              }}
            >
              {#if task.time}<span class="chip-time">{task.time}</span>{/if}
              <span class="chip-title">{task.title}</span>
            </button>
          {/each}
          {#if day.overflow > 0}
            <button class="more" onclick={() => onDayClick(day.date)}>+{day.overflow} още</button>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  {#if drag.dragState?.moved}
    <div class="drag-ghost" style="left: {drag.dragState.x}px; top: {drag.dragState.y}px;">
      {drag.dragState.task.title}
    </div>
  {/if}
</div>

<style>
  .month-calendar {
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    overflow: hidden;
    background: white;
  }
  .weekday-header,
  .month-grid {
    display: grid;
    /* minmax(0, 1fr), not plain 1fr: grid tracks default to a minimum of `auto`, which
       on narrow screens lets unbroken chip-title text (white-space: nowrap) push each
       column wider than its fair share, overflowing the whole grid past the viewport
       with no scroll container to reach it — confirmed visually on a 430px-wide screen. */
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }
  .weekday-header {
    border-bottom: 1px solid #e2e8f0;
  }
  .weekday-label {
    text-align: center;
    font-size: 0.7rem;
    color: #64748b;
    text-transform: uppercase;
    padding: 0.4rem 0;
  }
  /* Deliberately a different gray than the cell borders below — otherwise the weekend
     wash and the grid lines blend into each other. */
  .weekday-label.weekend {
    background: #e9edf2;
  }
  .day-cell {
    min-height: 90px;
    border-left: 1px solid #cbd5e1;
    border-top: 1px solid #cbd5e1;
    padding: 0.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    box-sizing: border-box;
    cursor: pointer;
  }
  .day-cell.weekend {
    background: #e9edf2;
  }
  .day-cell.other-month {
    opacity: 0.45;
  }
  .day-number {
    align-self: flex-start;
    background: none;
    border: none;
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.15rem 0.4rem;
    border-radius: 999px;
    cursor: pointer;
    color: #1e293b;
  }
  .day-cell.today .day-number {
    background: #2563eb;
    color: white;
  }
  .chips {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    overflow: hidden;
  }
  .chip {
    font-size: 0.65rem;
    background: #dbeafe;
    color: #1d4ed8;
    border: none;
    border-radius: 4px;
    padding: 0.1rem 0.3rem;
    text-align: left;
    cursor: pointer;
    display: flex;
    gap: 0.25rem;
    align-items: baseline;
    min-width: 0;
    touch-action: none;
    /* Stops iOS's long-press magnifier/text-selection callout from hijacking a drag gesture. */
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }
  .chip.dragging {
    opacity: 0.3;
  }
  .chip.done {
    background: #94a3b8;
    color: white;
    text-decoration: line-through;
  }
  .chip.dimmed {
    opacity: 0.35;
    filter: grayscale(60%);
  }
  .chip-time {
    font-weight: 600;
    opacity: 0.85;
    flex-shrink: 0;
  }
  .chip-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .more {
    font-size: 0.65rem;
    background: none;
    border: none;
    color: #64748b;
    text-align: left;
    cursor: pointer;
    padding: 0.1rem 0.3rem;
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
