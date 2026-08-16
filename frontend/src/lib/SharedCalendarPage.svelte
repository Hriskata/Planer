<script>
  import { getPublicShareLink, getPublicShareTasks } from './api.js';
  import { todayStr, addMonths, getMonthGridDates, monthLabel } from './date.js';
  import { theme, toggleTheme } from './theme.js';
  import MonthCalendar from './MonthCalendar.svelte';
  import TaskForm from './TaskForm.svelte';
  import Icon from './Icon.svelte';

  // Standalone public page — no MainView chrome, no auth, reached via /share/:token
  // (see App.svelte). The token is the ONLY thing identifying which client's calendar
  // this is; there is no logged-in user on this page at all.
  let { token } = $props();

  let client = $state(null);
  let tasks = $state([]);
  let loading = $state(true);
  let error = $state('');
  let viewDate = $state(todayStr());
  let selectedTask = $state(null);

  async function load() {
    loading = true;
    error = '';
    try {
      const link = await getPublicShareLink(token);
      client = link.client;
      tasks = await getPublicShareTasks(token);
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  load();

  const monthDates = $derived(getMonthGridDates(viewDate));
  const referenceMonth = $derived(viewDate.slice(0, 7));
  function goPrev() {
    viewDate = addMonths(viewDate, -1);
  }
  function goNext() {
    viewDate = addMonths(viewDate, 1);
  }
  function goToday() {
    viewDate = todayStr();
  }

  function openTask(task) {
    selectedTask = task;
  }
  function closeTask() {
    selectedTask = null;
  }
</script>

<div class="shared-page">
  <header class="topbar">
    <span class="wordmark">Планер</span>
    <button
      class="theme-toggle"
      onclick={toggleTheme}
      aria-label={$theme === 'dark' ? 'Светла тема' : 'Тъмна тема'}
      title={$theme === 'dark' ? 'Светла тема' : 'Тъмна тема'}
    >
      <Icon name={$theme === 'dark' ? 'sun' : 'moon'} size="1.05rem" />
    </button>
  </header>

  <main class="content">
    {#if loading}
      <p class="status">Зареждане...</p>
    {:else if error}
      <p class="status error" role="alert">{error}</p>
    {:else}
      <h1>Календар на {client}</h1>
      <div class="calendar-area">
        <div class="month-nav">
          <h2>{monthLabel(viewDate)}</h2>
          <button onclick={goPrev} aria-label="Предишен месец">‹</button>
          <button onclick={goToday}>Днес</button>
          <button onclick={goNext} aria-label="Следващ месец">›</button>
        </div>
        <MonthCalendar
          {monthDates}
          {referenceMonth}
          {tasks}
          onEdit={openTask}
          onDayClick={() => {}}
          onCreate={() => {}}
          readOnly={true}
        />
      </div>
    {/if}
  </main>

  {#if selectedTask}
    <TaskForm task={selectedTask} readOnly={true} onCancel={closeTask} />
  {/if}
</div>

<style>
  .shared-page {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--color-bg);
    color: var(--color-text);
  }
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    padding-top: calc(1rem + env(safe-area-inset-top, 0px));
    flex-shrink: 0;
  }
  .wordmark {
    font-size: 1.15rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--color-accent);
  }
  .theme-toggle {
    color: var(--color-text-muted);
    background: none;
    border: 1.5px solid var(--color-border);
    border-radius: 999px;
    width: 2.1rem;
    height: 2.1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  .theme-toggle:hover {
    background: var(--color-accent-tint);
    color: var(--color-accent);
  }
  .content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 0 1.5rem 1.5rem;
    max-width: 1000px;
    width: 100%;
    margin: 0 auto;
  }
  .content h1 {
    font-size: 1.4rem;
    margin: 0 0 1rem;
    flex-shrink: 0;
  }
  .status {
    color: var(--color-text-muted);
    padding: 2rem 0;
    text-align: center;
  }
  .status.error {
    color: var(--color-danger);
  }
  /* Exact class MonthCalendar's measureRowHeight() looks for via
     gridEl.closest('.calendar-area') — see CLAUDE.md's layout notes. */
  .calendar-area {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .month-nav {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 0.75rem;
    flex-shrink: 0;
  }
  .month-nav h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    min-width: 9rem;
  }
  .month-nav button {
    padding: 0.4rem 0.8rem;
    border: 1px solid var(--color-border-strong);
    background: var(--color-surface);
    color: var(--color-text);
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
  }
</style>
