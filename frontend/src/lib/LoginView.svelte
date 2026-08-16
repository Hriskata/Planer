<script>
  import { onMount } from 'svelte';
  import { login, loginWithGoogle, getGoogleClientId } from './api.js';

  let { onBack } = $props();

  let username = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);
  let googleReady = $state(false);
  // $state, not a plain `let` — the $effect below reads it to decide when to render the
  // Google button, and only re-runs on genuine reactive dependencies; without this the
  // compiler warns (non_reactive_update) that it happens to work only because bind:this
  // fires before effects flush in this specific case, not because Svelte is actually
  // tracking the assignment.
  let googleButtonEl = $state();

  async function handleSubmit(e) {
    e.preventDefault();
    error = '';
    loading = true;
    try {
      await login(username, password);
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function handleGoogleCredential(response) {
    error = '';
    try {
      await loginWithGoogle(response.credential);
    } catch (err) {
      error = err.message;
    }
  }

  // The Google button only appears once we know a client ID is actually configured
  // (server-side, via GOOGLE_CLIENT_ID) — otherwise a self-hosted instance without
  // Google set up would show a button that can only ever fail.
  onMount(async () => {
    const clientId = await getGoogleClientId().catch(() => null);
    if (!clientId) return;

    // Re-mounting this component (logging out and landing back on the login screen,
    // or any other remount within the same page load) used to inject a second <script>
    // tag and re-run Google's own init every time — the library is already loaded and
    // global on window.google after the first mount, so later mounts just reuse it.
    if (!window.google?.accounts?.id) {
      const loaded = await new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        // A blocked/failed script load (offline, an extension, a network policy —
        // accounts.google.com isn't reachable from every network) used to leave this
        // awaiting forever, since only onload settled the promise; onerror now
        // resolves(false) instead, so the form below just falls back to username/password.
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.head.appendChild(script);
      });
      if (!loaded) return;
    }

    window.google.accounts.id.initialize({ client_id: clientId, callback: handleGoogleCredential });
    googleReady = true;
  });

  // Renders into the <div> below once it actually exists — an $effect (not a plain
  // queueMicrotask after `googleReady = true`) so it doesn't depend on Svelte's DOM
  // update for the {#if googleReady} block happening to land before a hand-scheduled
  // microtask; it just naturally re-runs once googleButtonEl is bound.
  $effect(() => {
    if (googleReady && googleButtonEl) {
      window.google.accounts.id.renderButton(googleButtonEl, { theme: 'outline', size: 'large', width: 280 });
    }
  });
</script>

<div class="login-screen">
  <form onsubmit={handleSubmit}>
    <button type="button" class="back-link" onclick={onBack}>← Начало</button>
    <h1>Планер</h1>
    <label>
      Потребител
      <input type="text" bind:value={username} autocomplete="username" required />
    </label>
    <label>
      Парола
      <input type="password" bind:value={password} autocomplete="current-password" required />
    </label>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button type="submit" disabled={loading}>{loading ? 'Влизане...' : 'Вход'}</button>

    {#if googleReady}
      <div class="divider"><span>или</span></div>
      <div class="google-button" bind:this={googleButtonEl}></div>
    {/if}
  </form>
</div>

<style>
  .login-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh; /* fallback for browsers without dvh support */
    min-height: 100dvh; /* avoids the classic iOS Safari jump when the address bar shows/hides */
    box-sizing: border-box;
    padding-top: max(1rem, env(safe-area-inset-top));
    padding-bottom: max(1rem, env(safe-area-inset-bottom));
    padding-left: max(1rem, env(safe-area-inset-left));
    padding-right: max(1rem, env(safe-area-inset-right));
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
    max-width: 320px;
    background: var(--color-surface);
    padding: 1.5rem;
    border-radius: 12px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  }
  h1 {
    margin: 0 0 0.5rem;
    text-align: center;
    color: var(--color-accent);
  }
  .back-link {
    align-self: flex-start;
    background: none;
    padding: 0;
    margin-bottom: 0.25rem;
    font-size: 0.85rem;
    font-weight: normal;
    color: var(--color-text-faint);
  }
  .back-link:hover {
    color: var(--color-accent);
  }
  .divider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: var(--color-text-faint);
    font-size: 0.8rem;
    margin: 0.25rem 0;
  }
  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--color-border);
  }
  .google-button {
    display: flex;
    justify-content: center;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.9rem;
    color: var(--color-text);
  }
  input {
    padding: 0.6rem;
    font-size: 1rem;
    color: var(--color-text);
    background: var(--color-surface);
    border: 1px solid var(--color-border-strong);
    border-radius: 6px;
  }
  button {
    padding: 0.7rem;
    font-size: 1rem;
    background: var(--color-accent);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.6;
  }
  .error {
    color: var(--color-danger);
    font-size: 0.9rem;
    margin: 0;
  }
</style>
