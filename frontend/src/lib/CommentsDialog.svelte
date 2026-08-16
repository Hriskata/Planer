<script>
  // Third stacked/nested modal in the app (after SeriesScopeDialog, TaskHistoryDialog) —
  // sits on top of an already-open TaskForm, own overlay/dialog/trapFocus. Used from BOTH
  // sides of the client share-link review flow: the owner's normal TaskForm (isPublicShare
  // = false, authed api.js calls) and SharedCalendarPage's read-only TaskForm (isPublicShare
  // = true, shareToken required, unauthenticated api.js calls) — same UI either way, only
  // which api.js functions get called differs.
  import { untrack } from 'svelte';
  import { trapFocus } from './modalA11y.js';
  import {
    getTaskComments,
    postTaskComment,
    updateTask,
    getPublicTaskComments,
    postPublicTaskComment,
    updatePublicApprovalStatus,
  } from './api.js';
  import { approvalStatusLabel } from './approvalStatus.js';

  let { task, isPublicShare = false, shareToken = null, onClose } = $props();

  let comments = $state(null);
  let error = $state('');
  let newComment = $state('');
  let posting = $state(false);
  // Local, not the `task` prop itself — TaskForm's own `task` isn't live-refetched while
  // this dialog is open, so status changes are tracked here and simply reflected next
  // time the calendar reloads the task list.
  let status = $state(untrack(() => task.approval_status ?? null));
  let statusSaving = $state(false);

  $effect(() => {
    const fetchComments = isPublicShare ? getPublicTaskComments(shareToken, task.id) : getTaskComments(task.id);
    fetchComments.then((data) => (comments = data)).catch((err) => (error = err.message));
  });

  async function submitComment() {
    const body = newComment.trim();
    if (!body) return;
    posting = true;
    error = '';
    try {
      const created = isPublicShare
        ? await postPublicTaskComment(shareToken, task.id, body)
        : await postTaskComment(task.id, body);
      comments = [...(comments ?? []), created];
      newComment = '';
    } catch (err) {
      error = err.message;
    } finally {
      posting = false;
    }
  }

  async function setStatus(newStatus) {
    if (newStatus === status || statusSaving) return;
    statusSaving = true;
    error = '';
    try {
      if (isPublicShare) {
        await updatePublicApprovalStatus(shareToken, task.id, newStatus);
      } else {
        await updateTask(task.id, { approval_status: newStatus });
      }
      status = newStatus;
    } catch (err) {
      error = err.message;
    } finally {
      statusSaving = false;
    }
  }

  // created_at is SQLite's datetime('now') — 'YYYY-MM-DD HH:MM:SS' in UTC, no 'Z' suffix,
  // so Date() would otherwise parse it as local time (same fix as HistoryList.svelte).
  function formatTimestamp(isoLike) {
    return new Date(`${isoLike}Z`).toLocaleString('bg-BG', { dateStyle: 'medium', timeStyle: 'short' });
  }
</script>

<div class="comments-overlay" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="presentation">
  <div
    class="comments-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="comments-dialog-title"
    use:trapFocus={{ onEscape: onClose }}
  >
    <h3 id="comments-dialog-title">Коментари и одобрение</h3>

    <div class="status-row" role="group" aria-label="Статус на одобрение">
      {#each [null, 'approved', 'changes_requested'] as s (String(s))}
        <button
          type="button"
          class="status-btn"
          class:active={status === s}
          disabled={statusSaving}
          onclick={() => setStatus(s)}
        >
          {approvalStatusLabel(s)}
        </button>
      {/each}
    </div>

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    <div class="comment-list">
      {#if comments === null}
        <p class="hint">Зареждане...</p>
      {:else if comments.length === 0}
        <p class="hint">Все още няма коментари.</p>
      {:else}
        <ul>
          {#each comments as c (c.id)}
            <li class:client={c.author === 'client'}>
              <div class="comment-head">
                <strong>{c.author === 'client' ? 'Клиентът' : 'Собственикът'}</strong>
                <time>{formatTimestamp(c.created_at)}</time>
              </div>
              <p class="comment-body">{c.body}</p>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <form class="new-comment" onsubmit={(e) => { e.preventDefault(); submitComment(); }}>
      <label class="sr-only" for="new-comment-body">Нов коментар</label>
      <textarea id="new-comment-body" bind:value={newComment} placeholder="Напиши коментар..." rows="2" maxlength="2000"
      ></textarea>
      <div class="comments-actions">
        <button type="button" class="secondary" onclick={onClose}>Затвори</button>
        <button type="submit" disabled={posting || !newComment.trim()}>{posting ? 'Изпращане...' : 'Изпрати'}</button>
      </div>
    </form>
  </div>
</div>

<style>
  .comments-overlay {
    position: fixed;
    inset: 0;
    background: var(--color-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    /* Same tier as SeriesScopeDialog/TaskHistoryDialog — never open alongside either in
       practice (this dialog's own focus trap blocks reaching TaskForm's other triggers). */
    z-index: 30;
  }
  .comments-dialog {
    background: var(--color-surface);
    border-radius: 12px;
    padding: 1.5rem;
    width: 100%;
    max-width: 460px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    overflow: hidden;
  }
  .comments-dialog h3 {
    margin: 0;
    font-size: 1.1rem;
    flex-shrink: 0;
  }
  .status-row {
    display: flex;
    gap: 0.4rem;
    flex-shrink: 0;
  }
  .status-btn {
    flex: 1;
    padding: 0.45rem 0.3rem;
    font-size: 0.78rem;
    border-radius: 6px;
    border: 1px solid var(--color-border-strong);
    background: none;
    color: var(--color-text);
    cursor: pointer;
  }
  .status-btn.active {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: white;
    font-weight: 600;
  }
  .status-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .error {
    color: var(--color-danger);
    font-size: 0.85rem;
    margin: 0;
    flex-shrink: 0;
  }
  .comment-list {
    overflow-y: auto;
    min-height: 0;
    flex: 1;
  }
  .comment-list ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .comment-list li {
    padding: 0.5rem 0.6rem;
    border-radius: 8px;
    background: var(--color-surface-alt);
    border-left: 3px solid var(--color-border-strong);
  }
  .comment-list li.client {
    border-left-color: var(--color-accent);
  }
  .comment-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
    font-size: 0.75rem;
  }
  .comment-head time {
    color: var(--color-text-muted);
    white-space: nowrap;
  }
  .comment-body {
    margin: 0.25rem 0 0;
    font-size: 0.9rem;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .hint {
    color: var(--color-text-muted);
    font-size: 0.9rem;
    margin: 0;
  }
  .new-comment {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex-shrink: 0;
  }
  .new-comment textarea {
    resize: vertical;
    min-height: 2.5rem;
    padding: 0.5rem 0.6rem;
    border-radius: 6px;
    border: 1px solid var(--color-border-strong);
    background: var(--color-surface);
    color: var(--color-text);
    font-family: inherit;
    font-size: 0.9rem;
  }
  .comments-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .comments-actions button {
    padding: 0.55rem 1rem;
    font-size: 0.9rem;
    border-radius: 6px;
    border: none;
    background: var(--color-accent);
    color: white;
    cursor: pointer;
  }
  .comments-actions button:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .comments-actions button.secondary {
    background: none;
    border: 1px solid var(--color-border-strong);
    color: var(--color-text);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
</style>
