<script>
  // Stacked on top of an already-open TaskForm modal — the first nested/second-layer
  // dialog in the app (no prior precedent; every other confirmation is native
  // window.confirm()). Rendered as its own separate `role="dialog"` overlay (a DOM
  // sibling of TaskForm's own <form>, not nested inside it), so its own use:trapFocus
  // and Escape handling can't collide with TaskForm's — TaskForm's trapFocus stays
  // mounted underneath but simply isn't the active focus target while this is open.
  import { trapFocus } from './modalA11y.js';

  let { action, onChoose, onCancel } = $props(); // action: 'save' | 'delete'
</script>

<div class="scope-overlay" onclick={(e) => { if (e.target === e.currentTarget) onCancel(); }} role="presentation">
  <div
    class="scope-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="scope-dialog-title"
    use:trapFocus={{ onEscape: onCancel }}
  >
    <h3 id="scope-dialog-title">{action === 'delete' ? 'Изтриване на пост' : 'Запазване на промените'}</h3>
    <p>
      Този пост е част от повтаряща се поредица. Кои постове да {action === 'delete' ? 'изтрия' : 'редактирам'}?
    </p>
    <div class="scope-actions">
      <button type="button" onclick={() => onChoose('this')}>Само тази</button>
      <button type="button" onclick={() => onChoose('following')}>Тази и следващите</button>
      <button type="button" onclick={() => onChoose('all')}>Всички</button>
      <button type="button" class="secondary" onclick={onCancel}>Отказ</button>
    </div>
  </div>
</div>

<style>
  .scope-overlay {
    position: fixed;
    inset: 0;
    background: var(--color-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    /* Above TaskForm's own .overlay so this visually sits on top of it. */
    z-index: 30;
  }
  .scope-dialog {
    background: var(--color-surface);
    border-radius: 12px;
    padding: 1.5rem;
    width: 100%;
    max-width: 360px;
  }
  .scope-dialog h3 {
    margin: 0 0 0.6rem;
    font-size: 1.1rem;
  }
  .scope-dialog p {
    margin: 0 0 1.1rem;
    font-size: 0.9rem;
    color: var(--color-text-muted);
  }
  .scope-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .scope-actions button {
    padding: 0.6rem 1rem;
    font-size: 0.95rem;
    border-radius: 6px;
    border: none;
    background: var(--color-accent);
    color: white;
    cursor: pointer;
    text-align: center;
  }
  .scope-actions button:hover {
    background: var(--color-accent-hover);
  }
  .scope-actions .secondary {
    background: none;
    border: 1px solid var(--color-border-strong);
    color: var(--color-text);
  }
</style>
