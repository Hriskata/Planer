<script>
  import {
    notificationsEnabled,
    syncNotificationState,
    toggleNotifications,
  } from './notifications.js';
  import { getNotificationSettings, updateNotificationSettings } from './api.js';

  let dropdownOpen = $state(false);
  let modalOpen = $state(false);

  let reminderMinutes = $state(10);
  let loading = $state(false);
  let saving = $state(false);
  let error = $state('');
  let saved = $state(false);

  function openDropdown() {
    dropdownOpen = !dropdownOpen;
  }

  async function openNotificationSettings() {
    dropdownOpen = false;
    modalOpen = true;
    error = '';
    saved = false;
    loading = true;
    try {
      const settings = await getNotificationSettings();
      reminderMinutes = settings.reminderMinutes;
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function handleToggle() {
    error = '';
    try {
      await toggleNotifications();
    } catch (err) {
      error = err.message;
    }
  }

  async function saveReminderMinutes() {
    error = '';
    saved = false;
    saving = true;
    try {
      await updateNotificationSettings(reminderMinutes);
      saved = true;
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }

  // Reflects reality (permission/subscription can change outside the app, e.g. browser
  // site settings) whenever the dropdown/modal is opened, same as MainView does on load.
  $effect(() => {
    if (dropdownOpen || modalOpen) syncNotificationState();
  });
</script>

<div class="settings-wrapper">
  <button
    class="theme-toggle"
    onclick={openDropdown}
    aria-label="Настройки"
    title="Настройки"
  >
    ⚙️
  </button>

  {#if dropdownOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="backdrop" onclick={() => (dropdownOpen = false)}></div>
    <div class="dropdown">
      <button class="dropdown-item" onclick={openNotificationSettings}>Известия</button>
    </div>
  {/if}
</div>

{#if modalOpen}
  <div
    class="overlay"
    onclick={(e) => {
      if (e.target === e.currentTarget) modalOpen = false;
    }}
    role="presentation"
  >
    <div class="modal">
      <h2>Известия</h2>

      {#if loading}
        <p class="hint">Зареждане...</p>
      {:else}
        <label class="toggle-row">
          <span>Извести ме за задачи</span>
          <input type="checkbox" checked={$notificationsEnabled} onchange={handleToggle} />
        </label>

        <label class="minutes-row">
          <span>Минути преди часа на задачата</span>
          <input
            type="number"
            min="1"
            max="1440"
            bind:value={reminderMinutes}
            disabled={!$notificationsEnabled}
          />
        </label>

        {#if error}<p class="error">{error}</p>{/if}
        {#if saved}<p class="hint success">Запазено.</p>{/if}

        <div class="modal-actions">
          <button class="secondary" onclick={() => (modalOpen = false)}>Затвори</button>
          <button onclick={saveReminderMinutes} disabled={saving || !$notificationsEnabled}>
            {saving ? 'Запазване...' : 'Запази'}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .settings-wrapper {
    position: relative;
  }
  /* Matches MainView's own .theme-toggle exactly (that class is scoped to MainView's
     styles and doesn't reach across components, so it's redefined here). */
  .theme-toggle {
    background: none;
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: 999px;
    width: 1.9rem;
    height: 1.9rem;
    line-height: 1;
    font-size: 1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 15;
  }
  .dropdown {
    position: absolute;
    top: calc(100% + 0.4rem);
    right: 0;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    min-width: 140px;
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
    cursor: pointer;
  }
  .dropdown-item:hover {
    background: var(--color-surface-alt);
  }
  .overlay {
    position: fixed;
    inset: 0;
    background: var(--color-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    box-sizing: border-box;
    z-index: 20;
  }
  .modal {
    background: var(--color-surface);
    width: 100%;
    max-width: 340px;
    padding: 1.5rem;
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.12);
  }
  h2 {
    margin: 0;
    font-size: 1.15rem;
    color: var(--color-text);
  }
  .toggle-row,
  .minutes-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: 0.9rem;
    color: var(--color-text);
  }
  .minutes-row input {
    width: 4.5rem;
    padding: 0.4rem 0.5rem;
    font-size: 0.9rem;
    border: 1px solid var(--color-border-strong);
    border-radius: 6px;
    background: var(--color-surface);
    color: var(--color-text);
  }
  .minutes-row input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  input[type='checkbox'] {
    width: 1.15rem;
    height: 1.15rem;
    cursor: pointer;
  }
  .hint {
    margin: 0;
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }
  .hint.success {
    color: #16a34a;
  }
  .error {
    color: var(--color-danger);
    font-size: 0.85rem;
    margin: 0;
  }
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  button {
    padding: 0.55rem 1.1rem;
    font-size: 0.9rem;
    font-weight: 600;
    background: var(--color-accent);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
  }
  button.secondary {
    background: var(--color-border);
    color: var(--color-text);
  }
  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
