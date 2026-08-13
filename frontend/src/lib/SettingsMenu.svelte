<script>
  import {
    notificationsEnabled,
    syncNotificationState,
    toggleNotifications,
  } from './notifications.js';
  import {
    getNotificationSettings,
    updateNotificationSettings,
    getEmailSenderSettings,
    updateEmailSenderSettings,
  } from './api.js';
  import Icon from './Icon.svelte';

  let dropdownOpen = $state(false);
  let modalOpen = $state(false);

  let reminderMinutes = $state(10);
  let loading = $state(false);
  let saving = $state(false);
  let error = $state('');
  let saved = $state(false);

  let emailModalOpen = $state(false);
  let senderEmail = $state('');
  let senderAppPassword = $state(''); // never pre-filled — the server never returns the real one
  let hasAppPassword = $state(false);
  let emailLoading = $state(false);
  let emailSaving = $state(false);
  let emailError = $state('');
  let emailSaved = $state(false);

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

  async function openEmailSenderSettings() {
    dropdownOpen = false;
    emailModalOpen = true;
    emailError = '';
    emailSaved = false;
    senderAppPassword = '';
    emailLoading = true;
    try {
      const settings = await getEmailSenderSettings();
      senderEmail = settings.email || '';
      hasAppPassword = settings.hasAppPassword;
    } catch (err) {
      emailError = err.message;
    } finally {
      emailLoading = false;
    }
  }

  async function saveEmailSender() {
    emailError = '';
    emailSaved = false;
    emailSaving = true;
    try {
      // An empty app-password field means "leave it as-is", not "clear it" — trimming to
      // undefined drops the key entirely (JSON.stringify skips undefined values), which
      // is exactly what the backend treats as "keep the stored one". Explicit clearing
      // has its own button below.
      await updateEmailSenderSettings({ email: senderEmail, appPassword: senderAppPassword.trim() || undefined });
      hasAppPassword = hasAppPassword || Boolean(senderAppPassword.trim());
      senderAppPassword = '';
      emailSaved = true;
    } catch (err) {
      emailError = err.message;
    } finally {
      emailSaving = false;
    }
  }

  async function clearAppPassword() {
    emailError = '';
    emailSaved = false;
    emailSaving = true;
    try {
      await updateEmailSenderSettings({ email: senderEmail, appPassword: '' });
      hasAppPassword = false;
      senderAppPassword = '';
      emailSaved = true;
    } catch (err) {
      emailError = err.message;
    } finally {
      emailSaving = false;
    }
  }

  async function handleToggle(e) {
    error = '';
    try {
      await toggleNotifications();
    } catch (err) {
      error = err.message;
      // The checkbox is a real DOM element — clicking it flips its native checked
      // state immediately, before this handler even runs. `checked={$notificationsEnabled}`
      // is a one-way binding, so Svelte only writes it back to the DOM when the store
      // value itself changes; on failure the store stays exactly what it was, so
      // Svelte sees "no change" and never corrects the checkbox's now-wrong visual
      // state on its own — it has to be snapped back explicitly here.
      e.target.checked = $notificationsEnabled;
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
    <Icon name="settings" size="1.05rem" />
  </button>

  {#if dropdownOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="backdrop" onclick={() => (dropdownOpen = false)}></div>
    <div class="dropdown">
      <button class="dropdown-item" onclick={openNotificationSettings}>Известия</button>
      <button class="dropdown-item" onclick={openEmailSenderSettings}>Имейл подател</button>
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

{#if emailModalOpen}
  <div
    class="overlay"
    onclick={(e) => {
      if (e.target === e.currentTarget) emailModalOpen = false;
    }}
    role="presentation"
  >
    <div class="modal">
      <h2>Имейл подател</h2>
      <p class="hint">
        Използва се за автоматизацията "изпрати имейл при завършване" в задачите — писмата тръгват
        през твоя Gmail, не през общ сървърен акаунт.
      </p>

      {#if emailLoading}
        <p class="hint">Зареждане...</p>
      {:else}
        <label class="field-row">
          <span>Gmail адрес</span>
          <input type="email" bind:value={senderEmail} placeholder="you@gmail.com" />
        </label>

        <label class="field-row">
          <span>App Password{hasAppPassword ? ' (запазена)' : ''}</span>
          <input
            type="password"
            bind:value={senderAppPassword}
            placeholder={hasAppPassword ? '•••• •••• •••• ••••' : 'abcd efgh ijkl mnop'}
            autocomplete="off"
          />
        </label>
        {#if hasAppPassword}
          <button type="button" class="link-button" onclick={clearAppPassword} disabled={emailSaving}>
            Премахни паролата
          </button>
        {/if}

        {#if emailError}<p class="error">{emailError}</p>{/if}
        {#if emailSaved}<p class="hint success">Запазено.</p>{/if}

        <div class="modal-actions">
          <button class="secondary" onclick={() => (emailModalOpen = false)}>Затвори</button>
          <button onclick={saveEmailSender} disabled={emailSaving}>
            {emailSaving ? 'Запазване...' : 'Запази'}
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
    /* Buttons don't inherit `color` from an ancestor by default — was only coming out
       white here by accident, via the unrelated generic `button { color: white }` rule
       below (meant for the modal's Save/Close buttons). Explicit now, so it doesn't
       depend on that. */
    color: inherit;
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
  .field-row {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text-muted);
  }
  .field-row input {
    padding: 0.55rem 0.65rem;
    font-size: 0.9rem;
    font-weight: normal;
    color: var(--color-text);
    background: var(--color-surface);
    border: 1px solid var(--color-border-strong);
    border-radius: 8px;
  }
  .link-button {
    align-self: flex-start;
    background: none;
    padding: 0;
    font-size: 0.8rem;
    font-weight: normal;
    color: var(--color-text-faint);
    text-decoration: underline;
  }
  .link-button:hover {
    color: var(--color-danger);
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
