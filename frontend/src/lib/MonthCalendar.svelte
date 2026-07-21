<script>
  import { isWeekend, weekdayNameShort, todayStr } from './date.js';
  import { colorOf } from './colors.js';
  import { taskMatches } from './search.js';

  let { monthDates, referenceMonth, tasks, searchFilter = '', onEdit, onDayClick, onCreate } = $props();

  const MAX_CHIPS = 3;
  const today = todayStr();

  const dayData = $derived(
    monthDates.map((date) => {
      // When a filter is active, matching tasks sort first so they always land in the
      // MAX_CHIPS visible slots instead of possibly being buried behind "+N още".
      const dayTasks = tasks
        .filter((t) => t.date === date)
        .sort((a, b) => {
          if (searchFilter) {
            const aMatch = taskMatches(a, searchFilter);
            const bMatch = taskMatches(b, searchFilter);
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
    const c = task.status !== 'done' ? colorOf(task.color) : null;
    return c ? `background: ${c.bg}; color: ${c.fg};` : '';
  }

  function isDimmed(task) {
    return searchFilter && !taskMatches(task, searchFilter);
  }

  // Click-to-create on empty cell space — the day-number/chip/"+more" buttons handle
  // their own clicks (navigate/edit), so this only fires when the click didn't land on
  // one of them.
  function handleCellClick(e, date) {
    if (e.target.closest('button')) return;
    onCreate(date);
  }
</script>

<div class="month-calendar">
  <div class="weekday-header">
    {#each monthDates.slice(0, 7) as date (date)}
      <div class="weekday-label" class:weekend={isWeekend(date)}>{weekdayNameShort(date)}</div>
    {/each}
  </div>
  <div class="month-grid">
    {#each dayData as day (day.date)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- Chip count varies (0-N) so there's no fixed per-slot button to carry this
           click instead, same reasoning as WeekCalendar's all-day-cell. Keyboard users
           still have the fully-accessible "+" FAB as a fallback. -->
      <div
        class="day-cell"
        class:weekend={isWeekend(day.date)}
        class:other-month={!day.date.startsWith(referenceMonth)}
        class:today={day.date === today}
        onclick={(e) => handleCellClick(e, day.date)}
      >
        <button class="day-number" onclick={() => onDayClick(day.date)}>{Number(day.date.slice(8, 10))}</button>
        <div class="chips">
          {#each day.visible as task (task.id)}
            <button
              class="chip"
              class:done={task.status === 'done'}
              class:dimmed={isDimmed(task)}
              style={chipStyle(task)}
              onclick={() => onEdit(task)}
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
</style>
