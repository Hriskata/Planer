<script>
  import { displayDate, weekdayNameShort, isWeekend } from './date.js';
  import { taskMatchesFilters, hasActiveFilters } from './search.js';
  import { consumeSuppressedClick } from './dragDrop.svelte.js';
  import PostTile from './PostTile.svelte';

  let {
    weekDates,
    tasks,
    searchFilter = {},
    onEdit,
    onToggle,
    onCreate,
    readOnly = false,
    selectMode = false,
    selectedIds = null,
    onToggleSelect = null,
  } = $props();

  function isDimmed(task) {
    return hasActiveFilters(searchFilter) && !taskMatchesFilters(task, searchFilter);
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

  // Click-to-create on empty column space — the posts handle their own clicks (edit,
  // toggle-done, drag), so this only fires when the click didn't land on one. No hour
  // grid here, so a click just creates an untimed post for that day — the user sets a
  // time in the form if they want one.
  function handleColumnClick(e, date) {
    if (readOnly || selectMode) return;
    if (consumeSuppressedClick()) return; // this click ended a drag, not a tap
    if (e.target.closest('.post')) return;
    onCreate(date, null);
  }
</script>

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

    <div class="grid">
      {#each dayData as day (day.date)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- Post count is unpredictable (0-N, plain flex list) — no clean per-slot
             button to carry this click instead. Keyboard users still have the fully
             -accessible "+" FAB as a fallback. -->
        <div
          class="day-column"
          class:weekend={isWeekend(day.date)}
          class:read-only={readOnly}
          data-date={day.date}
          onclick={(e) => handleColumnClick(e, day.date)}
        >
          {#each day.tasks as task (task.id)}
            <PostTile
              {task}
              dimmed={isDimmed(task)}
              {onEdit}
              {onToggle}
              {readOnly}
              {selectMode}
              selected={selectedIds?.has(task.id) ?? false}
              {onToggleSelect}
            />
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
    border: 1px solid var(--color-border);
    border-radius: 10px;
    overflow: hidden;
    background: var(--color-surface);
    /* Stretches down to the bottom of the screen (with the usual breathing room, via
       MainView's <main> padding) instead of shrink-wrapping to however many posts
       happen to exist that week — same fix as LibraryPage's client-sidebar. Needs
       MainView's main/.content-row/.calendar-area to each pass flex:1 + min-height:0
       down to here; see main's own comment for why min-height:0 has to repeat at every
       level. */
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .scroll-x {
    /* Both axes: horizontal for narrow phone screens (header/posts scroll together,
       see below), vertical so the box actually fills .calendar's stretched height and
       scrolls its own content instead of growing past it. flex column (not just a plain
       overflow box) so .grid below can claim the leftover height with flex:1 — without
       this, .grid stayed at its own content height and the day-column border-left lines
       stopped short of the bottom instead of reaching it, leaving a visually broken gap
       under short weeks (few/no posts) even though .calendar's outer border already
       stretched to the bottom. */
    overflow-x: auto;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .header-row,
  .grid {
    display: grid;
    /* minmax(0, 1fr), not plain 1fr: grid tracks default to a minimum of `auto`, which
       on narrow screens lets unbroken post-label text (white-space: nowrap) push each
       column wider than its fair share, overflowing the whole grid past the viewport
       with no scroll container to reach it (same overflow quirk as MonthCalendar). Both
       grids share this exact template so header and post columns stay aligned. */
    grid-template-columns: repeat(7, minmax(110px, 1fr));
  }
  .header-row {
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }
  .grid {
    /* Fills whatever height .header-row didn't use; the grid's single auto row track
       then stretches to that height by default (align-content: normal → stretch), which
       in turn stretches each .day-column (default align-items: stretch) so its
       border-left keeps going all the way to the bottom instead of stopping at its own
       content. */
    flex: 1;
    min-height: 0;
  }
  .day-header {
    text-align: center;
    padding: 0.4rem 0.1rem;
    border-left: 1px solid var(--color-border-strong);
    min-width: 0;
  }
  .day-header:first-child {
    border-left: none;
  }
  .day-header.weekend {
    background: var(--color-weekend);
  }
  .day-name {
    font-size: 0.7rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .day-date {
    font-size: 0.85rem;
    font-weight: 600;
  }
  .day-column {
    border-left: 1px solid var(--color-border-strong);
    min-width: 0;
    /* No fixed height/overflow here — the column just grows with its posts; .scroll-x
       above is what scrolls (as one unit, header-row included) once the week's content
       taller than the box, instead of each column carrying its own separate,
       easy-to-miss internal scrollbar. */
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
    background: var(--color-weekend);
  }
  .day-column.read-only {
    cursor: default;
  }
  .empty-hint {
    margin: 0;
    font-size: 0.7rem;
    color: var(--color-text-faint);
    text-align: center;
    padding: 0.5rem 0;
  }
</style>
