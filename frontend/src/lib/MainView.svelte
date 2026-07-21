<script>
  import { auth } from './stores.js';
  import { getTasks, getTasksRange, getUnscheduledTasks, updateTask, logout } from './api.js';
  import {
    todayStr,
    addDays,
    addMonths,
    getWeekDates,
    getMonthGridDates,
    displayDate,
    weekdayName,
    monthLabel,
  } from './date.js';
  import TaskForm from './TaskForm.svelte';
  import PostTile from './PostTile.svelte';
  import WeekCalendar from './WeekCalendar.svelte';
  import MonthCalendar from './MonthCalendar.svelte';
  import BacklogColumn from './BacklogColumn.svelte';
  import { extractClients } from './search.js';
  import { POST_TYPES } from './postTypes.js';
  import { theme, toggleTheme } from './theme.js';
  import {
    getDragState,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  } from './dragDrop.svelte.js';

  let viewMode = $state('day'); // 'day' | 'week' | 'month'
  let currentDate = $state(todayStr());
  let tasks = $state([]);
  let unscheduledTasks = $state([]); // no date yet — shown in the backlog column
  let loading = $state(false);
  let error = $state('');
  let offline = $state(false);
  let showForm = $state(false);
  let editingTask = $state(null);
  let duplicateSource = $state(null);
  let newTaskDate = $state(todayStr());
  let newTaskTime = $state(null);
  let searchQuery = $state('');
  let selectedClient = $state(''); // '' = all clients
  let selectedPostType = $state(''); // '' = all post types
  let searchEnabled = $state(true);

  const weekDates = $derived(getWeekDates(currentDate));
  const monthDates = $derived(getMonthGridDates(currentDate));
  const referenceMonth = $derived(currentDate.slice(0, 7));
  // {} when the filter is off (via the toggle) — passed down as "no filter" to every
  // view, so this is the single on/off switch. Otherwise text/client/postType each
  // narrow the result further (AND) — see taskMatchesFilters.
  const activeFilters = $derived(
    searchEnabled ? { text: searchQuery, client: selectedClient, postType: selectedPostType } : {}
  );
  const availableClients = $derived(extractClients(tasks));

  function clearFilters() {
    searchQuery = '';
    selectedClient = '';
    selectedPostType = '';
  }

  // silent=true skips the `loading` flag for refreshes after a mutation (toggle/delete/
  // save) — otherwise the {#if loading} branch below briefly unmounts WeekCalendar/
  // MonthCalendar for no visible reason.
  async function loadTasks({ silent = false } = {}) {
    if (!silent) loading = true;
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
      tasks = result.tasks;
      offline = result.offline;

      const unscheduledResult = await getUnscheduledTasks();
      unscheduledTasks = unscheduledResult.tasks;
    } catch (err) {
      error = err.message;
    } finally {
      if (!silent) loading = false;
    }
  }

  $effect(() => {
    currentDate;
    viewMode;
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
  function handleDayClick(date) {
    currentDate = date;
    viewMode = 'day';
  }

  function openNewTaskForm() {
    editingTask = null;
    duplicateSource = null;
    newTaskDate = currentDate;
    newTaskTime = null;
    showForm = true;
  }
  function openEditForm(task) {
    editingTask = task;
    duplicateSource = null;
    showForm = true;
  }
  function handleDuplicate(task) {
    editingTask = null;
    duplicateSource = task;
    showForm = true;
  }
  // Click-to-create on empty calendar space (WeekCalendar/MonthCalendar) — date is
  // always given, time only from the week grid (month cells have no time granularity).
  function handleGridCreate(date, time = null) {
    editingTask = null;
    duplicateSource = null;
    newTaskDate = date;
    newTaskTime = time;
    showForm = true;
  }

  async function handleToggleStatus(task) {
    const next = task.status === 'done' ? 'pending' : 'done';
    try {
      await updateTask(task.id, { status: next });
      await loadTasks({ silent: true });
    } catch (err) {
      error = err.message;
    }
  }

  // Drag-and-drop only ever changes the date — there's no hour grid to express a new
  // time against anymore.
  async function handleMoveTask(task, changes) {
    try {
      await updateTask(task.id, changes);
      await loadTasks({ silent: true });
    } catch (err) {
      error = err.message;
    }
  }

  function handleFormSaved() {
    showForm = false;
    loadTasks({ silent: true });
  }
</script>

<!-- Drag-and-drop is handled once, globally, here — not per-view — because a drag can
     start in the backlog column and end in WeekCalendar's grid (or vice versa), which
     are siblings, not nested inside one another. -->
<svelte:window
  onpointermove={handlePointerMove}
  onpointerup={(e) => handlePointerUp(e, handleMoveTask)}
  onpointercancel={handlePointerCancel}
/>

<header>
  <h1>Планер</h1>
  <div class="header-actions">
    <span class="user">{$auth.user.username}</span>
    <button
      class="theme-toggle"
      onclick={toggleTheme}
      aria-label={$theme === 'dark' ? 'Светла тема' : 'Тъмна тема'}
      title={$theme === 'dark' ? 'Светла тема' : 'Тъмна тема'}
    >
      {$theme === 'dark' ? '☀️' : '🌙'}
    </button>
    <button class="link" onclick={logout}>Изход</button>
  </div>
</header>

<nav class="controls">
  <div class="view-toggle">
    <button class:active={viewMode === 'day'} onclick={() => (viewMode = 'day')}>Ден</button>
    <button class:active={viewMode === 'week'} onclick={() => (viewMode = 'week')}>Седмица</button>
    <button class:active={viewMode === 'month'} onclick={() => (viewMode = 'month')}>Месец</button>
  </div>
  <div class="date-nav">
    <button onclick={goPrev} aria-label="Назад">‹</button>
    <button onclick={goToday}>Днес</button>
    <button onclick={goNext} aria-label="Напред">›</button>
  </div>
</nav>

<div class="search-bar">
  <div class="search-input">
    <input
      type="search"
      placeholder="Търсене в заглавие или копи..."
      bind:value={searchQuery}
      aria-label="Търсене на задачи"
    />
    {#if searchQuery}
      <button class="clear" onclick={() => (searchQuery = '')} aria-label="Изчисти търсенето">×</button>
    {/if}
  </div>
  <label class="filter-toggle">
    <input type="checkbox" bind:checked={searchEnabled} />
    Филтър
  </label>
</div>

<div class="filter-selects">
  <select
    class="filter-select"
    bind:value={selectedClient}
    onchange={() => (searchEnabled = true)}
    aria-label="Филтър по клиент"
  >
    <option value="">Всички клиенти</option>
    {#each availableClients as client (client)}<option value={client}>{client}</option>{/each}
  </select>
  <select
    class="filter-select"
    bind:value={selectedPostType}
    onchange={() => (searchEnabled = true)}
    aria-label="Филтър по тип пост"
  >
    <option value="">Всички типове</option>
    {#each POST_TYPES as pt}<option value={pt}>{pt}</option>{/each}
  </select>
  {#if searchQuery || selectedClient || selectedPostType}
    <button class="tag-chip clear-all" onclick={clearFilters}>Изчисти всички</button>
  {/if}
</div>

<main>
  {#if offline}<p class="banner">Няма връзка — показват се последно заредените задачи.</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}

  {#if loading}
    <p class="empty">Зареждане...</p>
  {:else}
    <div class="content-row">
      <div class="calendar-area">
        {#if viewMode === 'day'}
          <h2>{weekdayName(currentDate)}, {displayDate(currentDate)}</h2>
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <!-- data-date makes this a drop target too, same as WeekCalendar's
               day-column/MonthCalendar's day-cell — dragging a backlog post here
               schedules it for the day currently being viewed. -->
          <div
            class="day-grid"
            data-date={currentDate}
            onclick={(e) => {
              if (e.target.closest('.post')) return;
              handleGridCreate(currentDate, null);
            }}
          >
            {#each tasks as task (task.id)}
              <PostTile {task} onEdit={openEditForm} onToggle={handleToggleStatus} />
            {:else}
              <p class="empty">Няма задачи за този ден.</p>
            {/each}
          </div>
        {:else if viewMode === 'week'}
          <WeekCalendar
            {weekDates}
            {tasks}
            searchFilter={activeFilters}
            onEdit={openEditForm}
            onToggle={handleToggleStatus}
            onCreate={handleGridCreate}
          />
        {:else}
          <h2>{monthLabel(currentDate)}</h2>
          <MonthCalendar
            {monthDates}
            {referenceMonth}
            {tasks}
            searchFilter={activeFilters}
            onEdit={openEditForm}
            onDayClick={handleDayClick}
            onCreate={handleGridCreate}
          />
        {/if}
      </div>

      <BacklogColumn
        tasks={unscheduledTasks}
        searchFilter={activeFilters}
        onEdit={openEditForm}
        onToggle={handleToggleStatus}
      />
    </div>
  {/if}
</main>

{#if getDragState()?.moved}
  <div class="drag-ghost" style="left: {getDragState().x}px; top: {getDragState().y}px;">
    {getDragState().task.title}
  </div>
{/if}

<button class="fab" onclick={openNewTaskForm} aria-label="Нова задача">+</button>

{#if showForm}
  <!-- Keyed so switching from "edit task A" to "duplicate of task A" (which keeps
       showForm true throughout) fully remounts the form instead of reusing the old
       instance — TaskForm's fields are frozen at mount (see its own comment on why),
       so without this key a duplicate would silently keep task A's stale field values. -->
  {#key editingTask?.id ?? (duplicateSource ? `dup-${duplicateSource.id}` : 'new')}
    <TaskForm
      task={editingTask}
      duplicateFrom={duplicateSource}
      defaultDate={newTaskDate}
      defaultTime={newTaskTime}
      onSaved={handleFormSaved}
      onCancel={() => (showForm = false)}
      onDuplicate={handleDuplicate}
    />
  {/key}
{/if}

<style>
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    /* Pushes content below the Dynamic Island/notch when installed as a standalone
       iOS app (env() resolves to 0 on browsers without a safe area — harmless there). */
    padding-top: calc(1rem + env(safe-area-inset-top, 0px));
    background: #2563eb;
    color: white;
  }
  header h1 {
    margin: 0;
    font-size: 1.25rem;
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.9rem;
  }
  .link {
    background: none;
    border: none;
    color: white;
    text-decoration: underline;
    cursor: pointer;
    font-size: 0.9rem;
  }
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
  .controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .view-toggle,
  .date-nav {
    display: flex;
    gap: 0.25rem;
  }
  .controls button {
    padding: 0.4rem 0.8rem;
    border: 1px solid var(--color-border-strong);
    background: var(--color-surface);
    color: var(--color-text);
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
  }
  .controls button.active {
    background: var(--color-accent);
    color: white;
    border-color: var(--color-accent);
  }
  .search-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0 1rem 0.5rem;
    max-width: min(1600px, 96vw);
    margin: 0 auto;
    flex-wrap: wrap;
  }
  .search-input {
    position: relative;
    flex: 1;
    min-width: 180px;
  }
  .search-input input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.5rem 2rem 0.5rem 0.75rem;
    /* Must stay >=16px — iOS Safari auto-zooms the page on focus for any input below that. */
    font-size: 1rem;
    border: 1px solid var(--color-border-strong);
    border-radius: 6px;
    background: var(--color-surface);
    color: var(--color-text);
  }
  .search-input .clear {
    position: absolute;
    right: 0.4rem;
    top: 50%;
    transform: translateY(-50%);
    border: none;
    background: none;
    font-size: 1.1rem;
    line-height: 1;
    color: var(--color-text-faint);
    cursor: pointer;
    padding: 0.2rem;
  }
  .filter-toggle {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.85rem;
    color: var(--color-text-muted);
    white-space: nowrap;
    cursor: pointer;
  }
  .filter-selects {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0 1rem 0.75rem;
    max-width: min(1600px, 96vw);
    margin: 0 auto;
  }
  .filter-select {
    font-size: 0.8rem;
    color: var(--color-text);
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    padding: 0.3rem 0.6rem;
    cursor: pointer;
  }
  .tag-chip.clear-all {
    background: none;
    border: none;
    color: var(--color-text-faint);
    text-decoration: underline;
    padding: 0.2rem 0.3rem;
    cursor: pointer;
    font-size: 0.75rem;
  }
  main {
    padding: 0 1rem 5rem;
    padding-bottom: calc(5rem + env(safe-area-inset-bottom, 0px));
    max-width: min(1600px, 96vw);
    margin: 0 auto;
  }
  h2 {
    font-size: 1rem;
    color: var(--color-text-muted);
    margin: 1.25rem 0 0.5rem;
  }
  /* The backlog column is a fixed-width sibling, which is what shrinks the calendar
     itself (flex: 1 fills whatever's left). Stacks vertically below the calendar on
     narrow screens instead of squeezing both side by side. */
  .content-row {
    display: flex;
    gap: 1rem;
    align-items: stretch;
  }
  .calendar-area {
    flex: 1;
    min-width: 0;
  }
  @media (max-width: 720px) {
    .content-row {
      flex-direction: column;
    }
  }
  .day-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.75rem;
    min-height: 120px;
    cursor: pointer;
  }
  .drag-ghost {
    position: fixed;
    transform: translate(-50%, -130%);
    pointer-events: none;
    background: var(--color-accent-hover);
    color: white;
    padding: 0.3rem 0.5rem;
    border-radius: 6px;
    font-size: 0.75rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
    z-index: 50;
    max-width: 160px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .empty {
    color: var(--color-text-faint);
    font-size: 0.9rem;
  }
  .banner {
    background: var(--color-banner-bg);
    color: var(--color-banner-text);
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
    font-size: 0.85rem;
  }
  .error {
    color: var(--color-danger);
    font-size: 0.9rem;
  }
  .fab {
    position: fixed;
    right: 1.25rem;
    bottom: calc(1.25rem + env(safe-area-inset-bottom, 0px));
    width: 3.25rem;
    height: 3.25rem;
    border-radius: 50%;
    background: #2563eb;
    color: white;
    border: none;
    font-size: 1.75rem;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  }
</style>
