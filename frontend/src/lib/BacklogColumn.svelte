<script>
  import { taskMatchesFilters, hasActiveFilters } from './search.js';
  import { UNSCHEDULED, consumeSuppressedClick } from './dragDrop.svelte.js';
  import PostTile from './PostTile.svelte';

  // Shown beside every view (day/week/month) — same component, same styling, so the
  // column looks identical no matter which subpage is active. data-date={UNSCHEDULED} is
  // what makes this a valid drag-drop target: dropping a scheduled post here clears its
  // date (see dragDrop.svelte.js).
  let { tasks, searchFilter = {}, onEdit, onToggle, onCreate, readOnly = false } = $props();

  function isDimmed(task) {
    return hasActiveFilters(searchFilter) && !taskMatchesFilters(task, searchFilter);
  }

  // Click-to-create on empty list space, same pattern as WeekCalendar's day-column —
  // creates a task with no date, which is exactly what lands it in this column.
  function handleListClick(e) {
    if (readOnly || !onCreate) return;
    if (consumeSuppressedClick()) return; // this click ended a drag, not a tap
    if (e.target.closest('.post')) return;
    onCreate();
  }
</script>

<div class="backlog" data-date={UNSCHEDULED}>
  <h3>Неразпределени</h3>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="backlog-list" class:clickable={!readOnly && onCreate} onclick={handleListClick}>
    {#each tasks as task (task.id)}
      <PostTile {task} dimmed={isDimmed(task)} {onEdit} {onToggle} {readOnly} />
    {:else}
      <p class="empty-hint">Няма неразпределени постове</p>
    {/each}
  </div>
</div>

<style>
  .backlog {
    display: flex;
    flex-direction: column;
    width: 220px;
    flex-shrink: 0;
    border: 1px solid var(--color-border);
    border-radius: 10px;
    background: var(--color-surface);
    box-sizing: border-box;
  }
  h3 {
    margin: 0;
    padding: 0.6rem 0.75rem;
    font-size: 0.85rem;
    color: var(--color-text-muted);
    border-bottom: 1px solid var(--color-border);
  }
  .backlog-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-height: 120px;
  }
  .backlog-list.clickable {
    cursor: pointer;
  }
  .empty-hint {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-text-faint);
    text-align: center;
    padding: 1rem 0.5rem;
  }
</style>
