<script>
  import { onMount } from 'svelte';
  import { auth } from './lib/stores.js';
  import { login, getTasks, updateTask, logout } from './lib/api.js';
  import { todayStr, displayDate, weekdayName } from './lib/date.js';
  import { colorForPostType } from './lib/colors.js';
  import { theme } from './lib/theme.js';

  // Same data/auth as the main app (shared api.js/stores.js) — just a much smaller,
  // always-visible view of "today" instead of the full calendar. Meant to run inside
  // the Electron widget wrapper (see desktop-widget/), not a normal browser tab.
  $effect(() => {
    document.documentElement.dataset.theme = $theme;
  });

  let username = $state('');
  let password = $state('');
  let loginError = $state('');
  let loggingIn = $state(false);

  let tasks = $state([]);
  let loading = $state(false);
  let error = $state('');

  async function handleLogin(e) {
    e.preventDefault();
    loginError = '';
    loggingIn = true;
    try {
      await login(username, password);
      await loadTasks();
    } catch (err) {
      loginError = err.message;
    } finally {
      loggingIn = false;
    }
  }

  async function loadTasks() {
    if (!$auth) return;
    loading = true;
    error = '';
    try {
      const result = await getTasks(todayStr());
      tasks = [...result.tasks].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function toggleDone(task) {
    const next = task.status === 'done' ? 'pending' : 'done';
    try {
      await updateTask(task.id, { status: next });
      await loadTasks();
    } catch (err) {
      error = err.message;
    }
  }

  function postLabel(task) {
    const parts = [task.client, task.post_type].map((v) => (v || '').trim()).filter(Boolean);
    return parts.length > 0 ? parts.join(' - ') : task.title;
  }

  // Re-polls every minute so the widget reflects changes made elsewhere (phone, main
  // app) without needing a manual refresh.
  onMount(() => {
    if ($auth) loadTasks();
    const interval = setInterval(() => {
      if ($auth) loadTasks();
    }, 60000);
    return () => clearInterval(interval);
  });
</script>

<div class="widget">
  <header>
    <span class="date">{weekdayName(todayStr())}, {displayDate(todayStr())}</span>
    {#if $auth}
      <button class="icon-btn" onclick={loadTasks} title="Опресни" aria-label="Опресни">⟳</button>
      <button class="icon-btn logout-btn" onclick={logout} title="Изход" aria-label="Изход">Изход</button>
    {/if}
  </header>

  {#if !$auth}
    <form class="login" onsubmit={handleLogin}>
      <input type="text" bind:value={username} placeholder="Потребител" autocomplete="username" required />
      <input type="password" bind:value={password} placeholder="Парола" autocomplete="current-password" required />
      {#if loginError}<p class="error">{loginError}</p>{/if}
      <button type="submit" disabled={loggingIn}>{loggingIn ? 'Влизане...' : 'Вход'}</button>
    </form>
  {:else}
    {#if error}<p class="error">{error}</p>{/if}
    <div class="task-list">
      {#each tasks as task (task.id)}
        <label
          class="task-row"
          class:done={task.status === 'done'}
          style={task.status !== 'done' ? `border-left-color: ${colorForPostType(task.post_type).bg}` : ''}
        >
          <input type="checkbox" checked={task.status === 'done'} onchange={() => toggleDone(task)} />
          {#if task.time}<span class="task-time">{task.time}</span>{/if}
          <span class="task-label">{postLabel(task)}</span>
        </label>
      {:else}
        <p class="empty">{loading ? 'Зареждане...' : 'Няма задачи за днес 🎉'}</p>
      {/each}
    </div>
  {/if}
</div>

<style>
  :global(html),
  :global(body) {
    margin: 0;
    height: 100%;
    overflow: hidden;
  }
  .widget {
    display: flex;
    flex-direction: column;
    height: 100vh;
    box-sizing: border-box;
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    /* Frameless Electron window — this makes the header act as its titlebar so the
       whole widget can still be dragged around the desktop. */
    -webkit-app-region: drag;
  }
  header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.75rem;
    background: #2563eb;
    color: white;
    font-size: 0.8rem;
    font-weight: 600;
    flex-shrink: 0;
  }
  .date {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .icon-btn {
    -webkit-app-region: no-drag;
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    font-size: 0.95rem;
    padding: 0.15rem 0.3rem;
    line-height: 1;
  }
  .logout-btn {
    font-size: 0.7rem;
    text-decoration: underline;
  }
  .login {
    -webkit-app-region: no-drag;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
  }
  .login input {
    padding: 0.5rem;
    font-size: 0.9rem;
    border: 1px solid var(--color-border-strong);
    border-radius: 6px;
    background: var(--color-surface);
    color: var(--color-text);
  }
  .login button {
    padding: 0.5rem;
    font-size: 0.9rem;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }
  .login button:disabled {
    opacity: 0.6;
  }
  .task-list {
    -webkit-app-region: no-drag;
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .task-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.5rem;
    background: var(--color-surface-alt);
    border-left: 3px solid var(--color-border-strong);
    border-radius: 6px;
    font-size: 0.8rem;
    color: var(--color-text);
    cursor: pointer;
  }
  .task-row.done {
    opacity: 0.5;
    text-decoration: line-through;
  }
  .task-row input[type='checkbox'] {
    flex-shrink: 0;
    margin: 0;
    cursor: pointer;
  }
  .task-time {
    font-weight: 600;
    font-size: 0.7rem;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }
  .task-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty {
    text-align: center;
    color: var(--color-text-faint);
    font-size: 0.8rem;
    margin-top: 1rem;
  }
  .error {
    color: var(--color-danger);
    font-size: 0.75rem;
    margin: 0.4rem 0.5rem 0;
  }
</style>
