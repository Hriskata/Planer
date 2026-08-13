<script>
  import { getSharedWithMe } from './api.js';
  import Icon from './Icon.svelte';

  // activeOwnerId: null = viewing your own calendar, otherwise the owner whose shared
  // calendar is currently shown. onSelect(ownerId) is called with null for "my own".
  let { ownUsername, activeOwnerId, onSelect } = $props();

  let open = $state(false);
  let shared = $state([]);

  // Fetched once on mount, not re-derived from anything reactive — a newly-accepted
  // share only ever needs to appear after a fresh page load, same as the rest of the
  // app's data.
  getSharedWithMe()
    .then((rows) => (shared = rows))
    .catch(() => {});

  const currentLabel = $derived(
    activeOwnerId === null ? ownUsername : (shared.find((s) => s.ownerId === activeOwnerId)?.ownerLabel ?? ownUsername)
  );

  function select(ownerId) {
    open = false;
    onSelect(ownerId);
  }
</script>

<div class="switcher">
  <button class="trigger" onclick={() => (open = !open)} title={currentLabel}>
    <span class="label">{currentLabel}</span>
    {#if shared.length > 0}<Icon name="chevron-down" size="0.85rem" />{/if}
  </button>

  {#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="backdrop" onclick={() => (open = false)}></div>
    <div class="dropdown">
      <button class="dropdown-item" class:active={activeOwnerId === null} onclick={() => select(null)}>
        {ownUsername} <span class="hint">(твоят)</span>
      </button>
      {#each shared as s (s.ownerId)}
        <button class="dropdown-item" class:active={activeOwnerId === s.ownerId} onclick={() => select(s.ownerId)}>
          {s.ownerLabel}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .switcher {
    position: relative;
  }
  .trigger {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    background: none;
    border: none;
    color: inherit;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    padding: 0;
    max-width: 9rem;
  }
  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 15;
  }
  .dropdown {
    position: absolute;
    top: calc(100% + 0.4rem);
    left: 0;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    min-width: 180px;
    overflow: hidden;
    z-index: 16;
  }
  .dropdown-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.6rem 0.85rem;
    background: none;
    border: none;
    color: var(--color-text);
    font-size: 0.85rem;
    font-weight: normal;
    cursor: pointer;
  }
  .dropdown-item:hover {
    background: var(--color-surface-alt);
  }
  .dropdown-item.active {
    color: var(--color-accent);
    font-weight: 600;
  }
  .hint {
    color: var(--color-text-faint);
    font-weight: normal;
  }
</style>
