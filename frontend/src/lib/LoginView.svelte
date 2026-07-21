<script>
  import { login } from './api.js';

  let username = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);

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
</script>

<div class="login-screen">
  <form onsubmit={handleSubmit}>
    <h1>Планер</h1>
    <label>
      Потребител
      <input type="text" bind:value={username} autocomplete="username" required />
    </label>
    <label>
      Парола
      <input type="password" bind:value={password} autocomplete="current-password" required />
    </label>
    {#if error}<p class="error">{error}</p>{/if}
    <button type="submit" disabled={loading}>{loading ? 'Влизане...' : 'Вход'}</button>
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
    background: white;
    padding: 1.5rem;
    border-radius: 12px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  }
  h1 {
    margin: 0 0 0.5rem;
    text-align: center;
    color: #2563eb;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.9rem;
  }
  input {
    padding: 0.6rem;
    font-size: 1rem;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
  }
  button {
    padding: 0.7rem;
    font-size: 1rem;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.6;
  }
  .error {
    color: #dc2626;
    font-size: 0.9rem;
    margin: 0;
  }
</style>
