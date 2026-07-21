<script>
  import { isWeekend, weekdayNameShort, todayStr } from './date.js';
  import { colorOf } from './colors.js';

  let { monthDates, referenceMonth, tasks, onEdit, onDayClick } = $props();

  const MAX_CHIPS = 3;
  const today = todayStr();

  const dayData = $derived(
    monthDates.map((date) => {
      const dayTasks = tasks
        .filter((t) => t.date === date)
        .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
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
</script>

<div class="month-calendar">
  <div class="weekday-header">
    {#each monthDates.slice(0, 7) as date (date)}
      <div class="weekday-label" class:weekend={isWeekend(date)}>{weekdayNameShort(date)}</div>
    {/each}
  </div>
  <div class="month-grid">
    {#each dayData as day (day.date)}
      <div
        class="day-cell"
        class:weekend={isWeekend(day.date)}
        class:other-month={!day.date.startsWith(referenceMonth)}
        class:today={day.date === today}
      >
        <button class="day-number" onclick={() => onDayClick(day.date)}>{Number(day.date.slice(8, 10))}</button>
        <div class="chips">
          {#each day.visible as task (task.id)}
            <button
              class="chip"
              class:done={task.status === 'done'}
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
    grid-template-columns: repeat(7, 1fr);
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
  .weekday-label.weekend {
    background: #f1f5f9;
  }
  .day-cell {
    min-height: 90px;
    border-left: 1px solid #f1f5f9;
    border-top: 1px solid #f1f5f9;
    padding: 0.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    box-sizing: border-box;
  }
  .day-cell.weekend {
    background: #f1f5f9;
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
