<script>
  // Second stacked/nested modal in the app (first was SeriesScopeDialog) — sits on top
  // of an already-open TaskForm, own overlay/dialog/trapFocus, TaskForm's own trapFocus
  // stays mounted underneath but simply isn't the active focus target while this is open.
  import { trapFocus } from './modalA11y.js';
  import { getTaskHistory } from './api.js';
  import HistoryList from './HistoryList.svelte';

  let { task, onClose } = $props();

  let entries = $state(null);
  let error = $state('');

  $effect(() => {
    getTaskHistory(task.id)
      .then((data) => (entries = data))
      .catch((err) => (error = err.message));
  });
</script>

<div class="history-overlay" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="presentation">
  <div
    class="history-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="task-history-title"
    use:trapFocus={{ onEscape: onClose }}
  >
    <h3 id="task-history-title">История</h3>
    {#if error}
      <p class="error" role="alert">{error}</p>
    {:else}
      <HistoryList {entries} />
    {/if}
    <div class="history-actions">
      <button type="button" class="secondary" onclick={onClose}>Затвори</button>
    </div>
  </div>
</div>

<style>
  .history-overlay {
    position: fixed;
    inset: 0;
    background: var(--color-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    /* Above TaskForm's own .overlay, same tier as SeriesScopeDialog. */
    z-index: 30;
  }
  .history-dialog {
    background: var(--color-surface);
    border-radius: 12px;
    padding: 1.5rem;
    width: 100%;
    max-width: 420px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .history-dialog h3 {
    margin: 0 0 0.9rem;
    font-size: 1.1rem;
    flex-shrink: 0;
  }
  .history-dialog :global(.history-list) {
    overflow-y: auto;
    min-height: 0;
  }
  .error {
    color: var(--color-danger);
    font-size: 0.9rem;
  }
  .history-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 1.1rem;
    flex-shrink: 0;
  }
  .history-actions button {
    padding: 0.55rem 1rem;
    font-size: 0.9rem;
    border-radius: 6px;
    border: 1px solid var(--color-border-strong);
    background: none;
    color: var(--color-text);
    cursor: pointer;
  }
</style>
