<script>
  import { colorForPostType } from './colors.js';
  import { taskMatchesFilters, hasActiveFilters } from './search.js';

  let { task, searchFilter = {}, onToggle, onEdit, onDelete } = $props();

  const swatch = $derived(colorForPostType(task.post_type));
  const dimmed = $derived(hasActiveFilters(searchFilter) && !taskMatchesFilters(task, searchFilter));
</script>

<li
  class="task-item"
  class:done={task.status === 'done'}
  class:dimmed
  style="border-left-color: {swatch.bg}"
>
  <input
    type="checkbox"
    checked={task.status === 'done'}
    onchange={onToggle}
    aria-label="Отбележи като завършена"
  />
  <div class="task-info">
    <div class="task-title">
      {task.title}
      {#if task.shared}<span class="badge">споделена</span>{/if}
    </div>
    {#if task.time}<div class="task-time">{task.time}</div>{/if}
    {#if task.notes}<div class="task-notes">{task.notes}</div>{/if}
  </div>
  <div class="task-actions">
    <button onclick={onEdit} aria-label="Редакция">✎</button>
    <button onclick={onDelete} aria-label="Изтриване">🗑</button>
  </div>
</li>

<style>
  .task-item {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.75rem;
    background: white;
    border-radius: 10px;
    margin-bottom: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    border-left: 4px solid transparent;
  }
  .task-item.done .task-title {
    text-decoration: line-through;
    color: #94a3b8;
  }
  .task-item.dimmed {
    opacity: 0.35;
    filter: grayscale(50%);
  }
  input[type='checkbox'] {
    margin-top: 0.2rem;
    width: 1.15rem;
    height: 1.15rem;
  }
  .task-info {
    flex: 1;
    min-width: 0;
  }
  .task-title {
    font-weight: 600;
  }
  .badge {
    font-size: 0.7rem;
    font-weight: normal;
    background: #dbeafe;
    color: #1d4ed8;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    margin-left: 0.4rem;
  }
  .task-time {
    font-size: 0.85rem;
    color: #64748b;
  }
  .task-notes {
    font-size: 0.85rem;
    color: #475569;
    margin-top: 0.25rem;
    white-space: pre-wrap;
  }
  .task-actions {
    display: flex;
    gap: 0.25rem;
  }
  .task-actions button {
    border: none;
    background: transparent;
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0.25rem;
  }
</style>
