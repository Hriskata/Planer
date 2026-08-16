<script>
  import { priorityLabel } from './priorities.js';

  // Pure presentational — shared by TaskHistoryDialog (one task's own history) and
  // HistoryFeedPage (the global "Скорошна активност" feed across a whole calendar).
  // entries: array of { id, action, task_title, task_id?, changes, created_at,
  // actor_username } as returned by GET /tasks/:id/history or GET /tasks/history, or
  // null while still loading. showTaskTitle: the global feed needs to say WHICH task
  // each row belongs to (many tasks interleaved); the per-task dialog already has that
  // context from its own header, so it stays silent about it.
  let { entries, showTaskTitle = false } = $props();

  const ACTION_LABELS = { created: 'създаде', updated: 'редактира', deleted: 'изтри' };

  const FIELD_LABELS = {
    title: 'Заглавие',
    notes: 'Бележки',
    date: 'Дата',
    time: 'Час',
    status: 'Статус',
    client: 'Клиент',
    post_type: 'Тип',
    platform: 'Платформа',
    priority: 'Приоритет',
    image_path: 'Снимка',
    shared: 'Споделен',
    email_on_complete: 'Имейл при завършване',
    email_to: 'Имейл получател',
    email_subject: 'Тема на имейла',
    email_body: 'Текст на имейла',
    series: 'Поредица',
  };

  // image_path values are internal /uploads/<uuid> paths — meaningless to a reader, so
  // this only ever says whether a photo was present, not which file.
  function formatValue(field, value) {
    if (field === 'image_path') return value ? 'снимка' : '(без снимка)';
    if (field === 'series') return value === 'series' ? 'част от поредица' : 'самостоятелна';
    if (field === 'shared' || field === 'email_on_complete') return value ? 'Да' : 'Не';
    if (field === 'status') return value === 'done' ? 'Завършен' : 'Незавършен';
    if (field === 'priority') return value ? priorityLabel(value) : '(без)';
    if (value === null || value === '') return '(празно)';
    return value;
  }

  function formatTimestamp(isoLike) {
    // created_at is SQLite's datetime('now') — 'YYYY-MM-DD HH:MM:SS' in UTC, no 'Z'
    // suffix, so Date() would otherwise parse it as local time. Splicing one in fixes that.
    return new Date(`${isoLike}Z`).toLocaleString('bg-BG', { dateStyle: 'medium', timeStyle: 'short' });
  }
</script>

<div class="history-list">
  {#if entries === null}
    <p class="hint">Зареждане...</p>
  {:else if entries.length === 0}
    <p class="hint">Няма записана история.</p>
  {:else}
    <ul>
      {#each entries as entry (entry.id)}
        <li>
          <div class="entry-head">
            <span class="entry-summary">
              <strong>{entry.actor_username}</strong> {ACTION_LABELS[entry.action] || entry.action}
              {#if showTaskTitle}
                <span class="entry-task-title">„{entry.task_title}“</span>
              {/if}
            </span>
            <time>{formatTimestamp(entry.created_at)}</time>
          </div>
          {#if entry.changes?.length}
            <ul class="changes">
              {#each entry.changes as change (change.field)}
                <li>
                  {FIELD_LABELS[change.field] || change.field}:
                  <span class="old-value">{formatValue(change.field, change.old)}</span>
                  →
                  <span class="new-value">{formatValue(change.field, change.new)}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .history-list ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .history-list li {
    border-bottom: 1px solid var(--color-border);
    padding-bottom: 0.6rem;
  }
  .history-list li:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
  .entry-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.75rem;
    font-size: 0.9rem;
  }
  .entry-task-title {
    color: var(--color-text-muted);
  }
  time {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    white-space: nowrap;
  }
  .changes {
    list-style: none;
    margin: 0.35rem 0 0;
    padding: 0;
    font-size: 0.8rem;
    color: var(--color-text-muted);
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .old-value {
    text-decoration: line-through;
  }
  .new-value {
    color: var(--color-text);
    font-weight: 600;
  }
  .hint {
    color: var(--color-text-muted);
    font-size: 0.9rem;
    margin: 0;
  }
</style>
