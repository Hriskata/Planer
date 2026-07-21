<script>
  import { taskMatchesFilters, hasActiveFilters } from './search.js';
  import { UNSCHEDULED } from './dragDrop.svelte.js';
  import PostTile from './PostTile.svelte';

  // Shown beside every view (day/week/month) — same component, same styling, so the
  // column looks identical no matter which subpage is active. data-date={UNSCHEDULED} is
  // what makes this a valid drag-drop target: dropping a scheduled post here clears its
  // date (see dragDrop.svelte.js).
  let { tasks, searchFilter = {}, onEdit, onToggle } = $props();

  function isDimmed(task) {
    return hasActiveFilters(searchFilter) && !taskMatchesFilters(task, searchFilter);
  }
</script>

<div class="backlog" data-date={UNSCHEDULED}>
  <h3>Неразпределени</h3>
  <div class="backlog-list">
    {#each tasks as task (task.id)}
      <PostTile {task} dimmed={isDimmed(task)} {onEdit} {onToggle} />
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
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: white;
    box-sizing: border-box;
  }
  h3 {
    margin: 0;
    padding: 0.6rem 0.75rem;
    font-size: 0.85rem;
    color: #334155;
    border-bottom: 1px solid #e2e8f0;
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
  .empty-hint {
    margin: 0;
    font-size: 0.75rem;
    color: #94a3b8;
    text-align: center;
    padding: 1rem 0.5rem;
  }
</style>
