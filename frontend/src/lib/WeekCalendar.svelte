<script>
  import { onMount } from 'svelte';
  import { displayDate, weekdayNameShort, isWeekend } from './date.js';
  import { colorOf } from './colors.js';
  import { taskMatches } from './search.js';

  let { weekDates, tasks, searchFilter = '', onEdit, onMove, onCreate } = $props();

  // Done tasks always render gray+struck-through (CSS class) regardless of color — an
  // inline style would otherwise win the cascade over that class, so this returns ''
  // for done tasks and lets the .done CSS rule apply undisturbed.
  function tileColorStyle(task) {
    const c = task.status !== 'done' ? colorOf(task.color) : null;
    return c ? `background: ${c.bg}; color: ${c.fg}; border-color: ${c.bg};` : '';
  }

  function isDimmed(task) {
    return searchFilter && !taskMatches(task, searchFilter);
  }

  const ROW_HEIGHT = 48; // px per hour
  // Tasks have no explicit end time — used only to size/space event blocks visually.
  const NOMINAL_DURATION_MIN = 60;
  const HOURS = Array.from({ length: 24 }, (_, h) => h);

  function minutesOf(time) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  // Greedy interval-scheduling lane assignment (classic calendar layout): tasks that
  // don't overlap in time share a lane; overlapping ones get placed side by side.
  function layoutDay(dayTasks) {
    const sorted = [...dayTasks].sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
    const laneEnds = [];
    const placed = [];
    for (const task of sorted) {
      const start = minutesOf(task.time);
      const end = start + NOMINAL_DURATION_MIN;
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(end);
      } else {
        laneEnds[lane] = end;
      }
      placed.push({ task, start, end, lane });
    }
    const laneCount = laneEnds.length || 1;
    return placed.map((p) => ({
      task: p.task,
      top: (p.start / 1440) * 100,
      height: Math.max(((p.end - p.start) / 1440) * 100, 2.5),
      left: (p.lane / laneCount) * 100,
      width: 100 / laneCount,
    }));
  }

  const dayData = $derived(
    weekDates.map((date) => {
      const dayTasks = tasks.filter((t) => t.date === date);
      return {
        date,
        allDay: dayTasks.filter((t) => !t.time),
        timed: layoutDay(dayTasks.filter((t) => t.time)),
      };
    })
  );

  const hasAnyAllDay = $derived(dayData.some((d) => d.allDay.length > 0));

  let scrollEl;
  onMount(() => {
    scrollEl?.scrollTo({ top: 7 * ROW_HEIGHT });
  });

  // Drag-and-drop, via Pointer Events (unified mouse+touch — the native HTML5
  // drag-and-drop API doesn't work reliably with touch, which is this app's main
  // input). Tapping without moving is left to the native `click` event below, which
  // works for touch/mouse/keyboard alike; pointer events here only handle the drag.
  const MOVE_THRESHOLD = 6; // px before a press counts as a drag rather than a tap
  const SNAP_MINUTES = 15;

  // Shared by drag-drop (below) and click-to-create — converts a pixel offset from the
  // top of a day-column into a 15-minute-snapped "HH:MM" time.
  function offsetToTime(offsetY) {
    const hours = offsetY / ROW_HEIGHT;
    let totalMinutes = Math.round((hours * 60) / SNAP_MINUTES) * SNAP_MINUTES;
    totalMinutes = Math.max(0, Math.min(23 * 60 + 45, totalMinutes));
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
  }

  let dragState = $state(null); // { task, startX, startY, moved, x, y } | null
  let suppressNextClick = false;

  function handlePointerDown(e, task) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragState = { task, startX: e.clientX, startY: e.clientY, moved: false, x: e.clientX, y: e.clientY };
  }

  function handlePointerMove(e) {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(dx, dy) > MOVE_THRESHOLD) {
      dragState.moved = true;
    }
    if (dragState.moved) {
      dragState.x = e.clientX;
      dragState.y = e.clientY;
      e.preventDefault(); // stop touch-scrolling the grid while actively dragging
    }
  }

  function handlePointerUp(e) {
    if (!dragState) return;
    const { task, moved } = dragState;
    dragState = null;
    if (!moved) return; // a plain tap — the native click handler opens the edit form

    suppressNextClick = true;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const allDayCell = target?.closest('.all-day-cell');
    const dayColumn = target?.closest('.day-column');

    if (allDayCell?.dataset.date) {
      const date = allDayCell.dataset.date;
      if (date !== task.date || task.time) onMove(task, { date, time: null });
    } else if (dayColumn?.dataset.date) {
      const date = dayColumn.dataset.date;
      const rect = dayColumn.getBoundingClientRect();
      const time = offsetToTime(e.clientY - rect.top);
      if (date !== task.date || time !== task.time) onMove(task, { date, time });
    }
  }

  function handlePointerCancel() {
    dragState = null;
  }

  function handleTileClick(task) {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    onEdit(task);
  }

  // Click-to-create: each hour-cell is its own <button> (see template) rather than one
  // click handler on the whole day-column — real, individually focusable buttons instead
  // of a div wrapping other buttons, which is both a genuine keyboard-accessibility win
  // and sidesteps the "interactive element nested in another interactive element" mess a
  // single container-level click handler would create around the existing event tiles.
  // Guarded against the spurious click that follows a completed drag-drop (same flag
  // handleTileClick uses).
  function handleHourCellClick(e, date, hour) {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetInDay = hour * ROW_HEIGHT + (e.clientY - rect.top);
    onCreate(date, offsetToTime(offsetInDay));
  }

  function handleAllDayRowClick(e, date) {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    if (e.target.closest('button')) return;
    onCreate(date, null);
  }
</script>

<svelte:window onpointermove={handlePointerMove} onpointerup={handlePointerUp} onpointercancel={handlePointerCancel} />

<div class="calendar">
  <!-- Single horizontally-scrolling wrapper so the header/all-day/hour rows stay
       column-aligned and scroll together on narrow phone screens. Vertical scroll
       is scoped to just the hour grid below, so the header stays visible while
       scrolling through hours. -->
  <div class="scroll-x">
    <div class="header-row">
      <div class="gutter"></div>
      {#each weekDates as date (date)}
        <div class="day-header" class:weekend={isWeekend(date)}>
          <div class="day-name">{weekdayNameShort(date)}</div>
          <div class="day-date">{displayDate(date)}</div>
        </div>
      {/each}
    </div>

    {#if hasAnyAllDay}
      <div class="header-row all-day-row">
        <div class="gutter">Цял ден</div>
        {#each dayData as day (day.date)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <!-- Unlike the hour grid, chip count/positions here are unpredictable (0-N,
               plain flex list) — no clean per-slot button to carry this click instead.
               Keyboard users still have the fully-accessible "+" FAB as a fallback. -->
          <div
            class="all-day-cell"
            class:weekend={isWeekend(day.date)}
            data-date={day.date}
            onclick={(e) => handleAllDayRowClick(e, day.date)}
          >
            {#each day.allDay as task (task.id)}
              <button
                class="all-day-chip"
                class:done={task.status === 'done'}
                class:dragging={dragState?.task.id === task.id}
                class:dimmed={isDimmed(task)}
                style={tileColorStyle(task)}
                onpointerdown={(e) => handlePointerDown(e, task)}
                onclick={() => handleTileClick(task)}
              >
                {task.title}
              </button>
            {/each}
          </div>
        {/each}
      </div>
    {/if}

    <div class="grid-scroll-y" bind:this={scrollEl}>
      <div class="grid">
        <div class="hours-gutter">
          {#each HOURS as h}
            <div class="hour-label" style="height: {ROW_HEIGHT}px">{String(h).padStart(2, '0')}:00</div>
          {/each}
        </div>
        {#each dayData as day (day.date)}
          <div
            class="day-column"
            class:weekend={isWeekend(day.date)}
            data-date={day.date}
            style="height: {ROW_HEIGHT * 24}px"
          >
            {#each HOURS as h}
              <button
                type="button"
                class="hour-cell"
                style="height: {ROW_HEIGHT}px"
                aria-label="Нова задача в {displayDate(day.date)} около {String(h).padStart(2, '0')}:00"
                onclick={(e) => handleHourCellClick(e, day.date, h)}
              ></button>
            {/each}
            {#each day.timed as item (item.task.id)}
              <button
                class="event"
                class:done={item.task.status === 'done'}
                class:dragging={dragState?.task.id === item.task.id}
                class:dimmed={isDimmed(item.task)}
                style="top: {item.top}%; height: {item.height}%; left: {item.left}%; width: {item.width}%; {tileColorStyle(item.task)}"
                onpointerdown={(e) => handlePointerDown(e, item.task)}
                onclick={() => handleTileClick(item.task)}
              >
                <span class="event-time">{item.task.time}</span>
                <span class="event-title">{item.task.title}</span>
              </button>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </div>

  {#if dragState?.moved}
    <div class="drag-ghost" style="left: {dragState.x}px; top: {dragState.y}px;">
      {#if dragState.task.time}<span class="event-time">{dragState.task.time}</span>{/if}
      {dragState.task.title}
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
    grid-template-columns: 48px repeat(7, minmax(84px, 1fr));
  }
  .header-row {
    border-bottom: 1px solid #e2e8f0;
  }
  .gutter {
    font-size: 0.65rem;
    color: #94a3b8;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
  }
  .day-header {
    text-align: center;
    padding: 0.4rem 0.1rem;
    border-left: 1px solid #cbd5e1;
  }
  /* Deliberately a different gray than the hour/column borders above and below —
     otherwise the weekend wash and the grid lines blend into each other. */
  .day-header.weekend,
  .all-day-cell.weekend,
  .day-column.weekend {
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
  .all-day-row {
    align-items: start;
    min-height: 2rem;
  }
  .all-day-cell {
    border-left: 1px solid #cbd5e1;
    padding: 0.15rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    cursor: pointer;
  }
  .all-day-chip {
    font-size: 0.7rem;
    background: #dbeafe;
    color: #1d4ed8;
    border: none;
    border-radius: 4px;
    padding: 0.15rem 0.3rem;
    text-align: left;
    cursor: pointer;
    touch-action: none;
    /* Stops iOS's long-press magnifier/text-selection callout from hijacking a drag gesture. */
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }
  .all-day-chip.done {
    text-decoration: line-through;
    opacity: 0.6;
  }
  .all-day-chip.dragging {
    opacity: 0.3;
  }
  .all-day-chip.dimmed {
    opacity: 0.3;
    filter: grayscale(60%);
  }
  .grid-scroll-y {
    max-height: 60vh; /* fallback for browsers without dvh support */
    max-height: 60dvh;
    overflow-y: auto;
  }
  .hours-gutter {
    display: flex;
    flex-direction: column;
  }
  .hour-label {
    font-size: 0.65rem;
    color: #94a3b8;
    text-align: right;
    padding-right: 0.3rem;
    box-sizing: border-box;
    transform: translateY(-0.5em);
  }
  .day-column {
    position: relative;
    border-left: 1px solid #cbd5e1;
  }
  .hour-cell {
    display: block;
    width: 100%;
    border: none;
    border-bottom: 1px solid #cbd5e1;
    background: none;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    cursor: pointer;
  }
  .event {
    position: absolute;
    box-sizing: border-box;
    background: #2563eb;
    color: white;
    border: 1px solid white;
    border-radius: 4px;
    padding: 0.1rem 0.25rem;
    font-size: 0.65rem;
    text-align: left;
    cursor: pointer;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    line-height: 1.15;
    touch-action: none;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }
  .event.done {
    background: #94a3b8;
    text-decoration: line-through;
  }
  .event.dragging {
    opacity: 0.3;
  }
  .event.dimmed {
    opacity: 0.3;
    filter: grayscale(60%);
  }
  .event-time {
    font-weight: 600;
    opacity: 0.85;
  }
  .event-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    display: flex;
    gap: 0.3rem;
    align-items: baseline;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
