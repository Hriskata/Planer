<script>
  import { onMount } from 'svelte';
  import { auth } from './lib/stores.js';
  import { login, getTasks, getTasksRange, updateTask, logout } from './lib/api.js';
  import {
    todayStr,
    addDays,
    addMonths,
    getWeekDates,
    getMonthGridDates,
    displayDate,
    weekdayName,
    weekdayNameShort,
    isWeekend,
    monthLabel,
  } from './lib/date.js';
  import { colorForPostType } from './lib/colors.js';
  import { theme } from './lib/theme.js';

  // Same data/auth as the main app (shared api.js/stores.js) — just a much smaller,
  // always-visible view instead of the full calendar. Meant to run inside the
  // Electron widget wrapper (see desktop-widget/), not a normal browser tab.
  $effect(() => {
    document.documentElement.dataset.theme = $theme;
  });

  let username = $state('');
  let password = $state('');
  let loginError = $state('');
  let loggingIn = $state(false);

  let viewMode = $state('day'); // 'day' | 'week' | 'month'
  let currentDate = $state(todayStr());
  let tasks = $state([]);
  let loading = $state(false);
  let error = $state('');

  const weekDates = $derived(getWeekDates(currentDate));
  const monthDates = $derived(getMonthGridDates(currentDate));
  const referenceMonth = $derived(currentDate.slice(0, 7));
  const today = todayStr();

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
      let result;
      if (viewMode === 'day') {
        result = await getTasks(currentDate);
      } else if (viewMode === 'week') {
        result = await getTasksRange(weekDates[0], weekDates[weekDates.length - 1]);
      } else {
        result = await getTasksRange(monthDates[0], monthDates[monthDates.length - 1]);
      }
      tasks = [...result.tasks].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    // Re-reads on every dependency change (view mode, date) — same reactive-fetch
    // pattern as MainView.svelte's own $effect.
    viewMode;
    currentDate;
    loadTasks();
  });

  function goToday() {
    currentDate = todayStr();
  }
  function goPrev() {
    if (viewMode === 'month') currentDate = addMonths(currentDate, -1);
    else currentDate = addDays(currentDate, viewMode === 'day' ? -1 : -7);
  }
  function goNext() {
    if (viewMode === 'month') currentDate = addMonths(currentDate, 1);
    else currentDate = addDays(currentDate, viewMode === 'day' ? 1 : 7);
  }
  function openDay(date) {
    currentDate = date;
    viewMode = 'day';
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

  function tasksForDate(date) {
    return tasks.filter((t) => t.date === date);
  }

  // Re-polls every minute so the widget reflects changes made elsewhere (phone, main
  // app) without needing a manual refresh.
  onMount(() => {
    const interval = setInterval(() => {
      if ($auth) loadTasks();
    }, 60000);
    return () => clearInterval(interval);
  });
</script>

{#snippet taskRow(task)}
  <label
    class="task-row"
    class:done={task.status === 'done'}
    style={task.status !== 'done' ? `border-left-color: ${colorForPostType(task.post_type).bg}` : ''}
  >
    <input type="checkbox" checked={task.status === 'done'} onchange={() => toggleDone(task)} />
    {#if task.time}<span class="task-time">{task.time}</span>{/if}
    <span class="task-label">{postLabel(task)}</span>
  </label>
{/snippet}

<div class="widget">
  <header>
    <span class="date">
      {#if viewMode === 'day'}{weekdayName(currentDate)}, {displayDate(currentDate)}
      {:else if viewMode === 'week'}{displayDate(weekDates[0])} – {displayDate(weekDates[6])}
      {:else}{monthLabel(currentDate)}{/if}
    </span>
    {#if $auth}
      <button class="icon-btn" onclick={loadTasks} title="Опресни" aria-label="Опресни">⟳</button>
      <button class="icon-btn logout-btn" onclick={logout} title="Изход от профила" aria-label="Изход от профила">
        Изход
      </button>
    {/if}
    <!-- Frameless window has no native minimize/close controls — these replace them,
         present on both the login screen and after logging in. Preload bridge is
         needed because contextIsolation blocks reaching the main-process `app`/window
         directly; both fall back gracefully if somehow loaded outside Electron. -->
    <button
      class="icon-btn minimize-btn"
      onclick={() => window.electronAPI?.minimizeApp()}
      title="Минимизирай"
      aria-label="Минимизирай"
    >
      −
    </button>
    <button
      class="icon-btn close-btn"
      onclick={() => (window.electronAPI ? window.electronAPI.quitApp() : window.close())}
      title="Затвори"
      aria-label="Затвори"
    >
      ×
    </button>
  </header>

  {#if $auth}
    <nav class="controls">
      <div class="view-toggle">
        <button class:active={viewMode === 'day'} onclick={() => (viewMode = 'day')}>Ден</button>
        <button class:active={viewMode === 'week'} onclick={() => (viewMode = 'week')}>Седм</button>
        <button class:active={viewMode === 'month'} onclick={() => (viewMode = 'month')}>Мес</button>
      </div>
      <div class="date-nav">
        <button onclick={goPrev} aria-label="Назад">‹</button>
        <button onclick={goToday} aria-label="Днес">•</button>
        <button onclick={goNext} aria-label="Напред">›</button>
      </div>
    </nav>
  {/if}

  {#if !$auth}
    <form class="login" onsubmit={handleLogin}>
      <input type="text" bind:value={username} placeholder="Потребител" autocomplete="username" required />
      <input type="password" bind:value={password} placeholder="Парола" autocomplete="current-password" required />
      {#if loginError}<p class="error">{loginError}</p>{/if}
      <button type="submit" disabled={loggingIn}>{loggingIn ? 'Влизане...' : 'Вход'}</button>
    </form>
  {:else}
    {#if error}<p class="error">{error}</p>{/if}

    {#if viewMode === 'day'}
      <div class="task-list">
        {#each tasksForDate(currentDate) as task (task.id)}
          {@render taskRow(task)}
        {:else}
          <p class="empty">{loading ? 'Зареждане...' : 'Няма задачи за днес 🎉'}</p>
        {/each}
      </div>
    {:else if viewMode === 'week'}
      <div class="agenda">
        {#each weekDates as date (date)}
          <div class="agenda-day">
            <div class="agenda-day-header" class:weekend={isWeekend(date)} class:today={date === today}>
              {weekdayNameShort(date)}, {displayDate(date)}
            </div>
            {#each tasksForDate(date) as task (task.id)}
              {@render taskRow(task)}
            {:else}
              <p class="empty small">Няма постове</p>
            {/each}
          </div>
        {/each}
      </div>
    {:else}
      <div class="month-grid">
        {#each monthDates as date (date)}
          {@const dayTasks = tasksForDate(date)}
          {@const doneCount = dayTasks.filter((t) => t.status === 'done').length}
          <button
            class="month-cell"
            class:weekend={isWeekend(date)}
            class:other-month={!date.startsWith(referenceMonth)}
            class:today={date === today}
            onclick={() => openDay(date)}
          >
            <span class="month-day-number">{Number(date.slice(8, 10))}</span>
            {#if dayTasks.length > 0}
              <span class="month-day-badge" class:all-done={doneCount === dayTasks.length}>{dayTasks.length}</span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
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
  }
  /* Frameless Electron window — makes the whole widget draggable like a titlebar.
     -webkit-app-region does NOT cascade to descendants on its own (confirmed via
     getComputedStyle — a child with no value of its own computes to "none", not its
     parent's "drag"), so every element needs an explicit value: default the whole
     tree to drag, then opt the actual interactive controls back out below.
     user-select: none is just as necessary — text is selectable by default, and a
     mousedown-drag that starts over actual text (e.g. the date label) gets captured
     as a text-selection gesture instead of ever reaching the drag-region behavior, so
     without this the window silently fails to move from most of its own draggable area. */
  .widget,
  .widget * {
    -webkit-app-region: drag;
    -webkit-user-select: none;
    user-select: none;
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
    -webkit-app-region: no-drag !important;
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
  .minimize-btn,
  .close-btn {
    font-size: 1.1rem;
    font-weight: 700;
  }
  .controls {
    -webkit-app-region: no-drag !important;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.3rem;
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }
  .view-toggle,
  .date-nav {
    display: flex;
    gap: 0.2rem;
  }
  .controls button {
    padding: 0.2rem 0.4rem;
    border: 1px solid var(--color-border-strong);
    background: var(--color-surface);
    color: var(--color-text);
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.7rem;
    line-height: 1.2;
  }
  .controls button.active {
    background: #2563eb;
    color: white;
    border-color: #2563eb;
  }
  .login {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
  }
  /* Only the controls themselves opt out of dragging — the gaps/padding around them
     stay part of the draggable region, so there's more than a sliver of header to grab. */
  .login input,
  .login button {
    -webkit-app-region: no-drag !important;
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
  .task-list,
  .agenda {
    /* Deliberately draggable (unlike .login) — with tasks in it, most of this area is
       .task-row cards anyway, each opted back out below, so the empty space around/
       below them is what stays grabbable. */
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .agenda-day {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .agenda-day-header {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    padding: 0.15rem 0.2rem;
  }
  .agenda-day-header.weekend {
    color: var(--color-text-faint);
  }
  .agenda-day-header.today {
    color: var(--color-accent);
  }
  .task-row {
    -webkit-app-region: no-drag !important;
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
  .month-grid {
    flex: 1;
    overflow-y: auto;
    padding: 0.4rem;
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0.2rem;
    align-content: start;
  }
  .month-cell {
    -webkit-app-region: no-drag !important;
    position: relative;
    aspect-ratio: 1 / 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface-alt);
    border: none;
    border-radius: 5px;
    color: var(--color-text);
    font-size: 0.7rem;
    cursor: pointer;
    padding: 0;
  }
  .month-cell.weekend {
    background: var(--color-weekend);
  }
  .month-cell.other-month {
    opacity: 0.4;
  }
  .month-cell.today {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }
  .month-day-badge {
    position: absolute;
    bottom: 2px;
    right: 2px;
    min-width: 12px;
    height: 12px;
    padding: 0 2px;
    border-radius: 999px;
    background: var(--color-accent);
    color: white;
    font-size: 0.55rem;
    line-height: 12px;
    text-align: center;
  }
  .month-day-badge.all-done {
    background: var(--color-text-faint);
  }
  .empty {
    text-align: center;
    color: var(--color-text-faint);
    font-size: 0.8rem;
    margin-top: 1rem;
  }
  .empty.small {
    margin: 0;
    font-size: 0.7rem;
    text-align: left;
    padding-left: 0.2rem;
  }
  .error {
    color: var(--color-danger);
    font-size: 0.75rem;
    margin: 0.4rem 0.5rem 0;
  }
</style>
