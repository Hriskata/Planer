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
  import { extractClients, taskMatchesFilters, hasActiveFilters } from './search.js';
  import { POST_TYPES } from './postTypes.js';
  import { PRIORITIES, priorityLabel } from './priorities.js';
  import { theme, toggleTheme } from './theme.js';
  import SettingsMenu from './SettingsMenu.svelte';
  import CalendarSwitcher from './CalendarSwitcher.svelte';
  import LibraryPage from './LibraryPage.svelte';
  import Icon from './Icon.svelte';
  import {
    getDragState,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  } from './dragDrop.svelte.js';

  // 'calendar' = the usual day/week/month task views; 'library' = the branding-assets
  // subpage — both live under the same header (CalendarSwitcher included), so switching
  // pages doesn't lose which calendar you're currently looking at.
  let page = $state('calendar');
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
  let selectedPriority = $state(''); // '' = all priorities
  let searchEnabled = $state(true);
  // null = your own calendar; otherwise the owner id of a calendar shared with you (see
  // CalendarSwitcher.svelte) — everything mutating (create/edit/toggle/drag) is disabled
  // while viewing someone else's, since sharing is read-only.
  let activeCalendarOwnerId = $state(null);
  const readOnly = $derived(activeCalendarOwnerId !== null);

  const weekDates = $derived(getWeekDates(currentDate));
  const monthDates = $derived(getMonthGridDates(currentDate));
  const referenceMonth = $derived(currentDate.slice(0, 7));
  // {} when the filter is off (via the toggle) — passed down as "no filter" to every
  // view, so this is the single on/off switch. Otherwise text/client/postType/priority
  // each narrow the result further (AND) — see taskMatchesFilters.
  const activeFilters = $derived(
    searchEnabled
      ? { text: searchQuery, client: selectedClient, postType: selectedPostType, priority: selectedPriority }
      : {}
  );
  const availableClients = $derived(extractClients(tasks));

  function clearFilters() {
    searchQuery = '';
    selectedClient = '';
    selectedPostType = '';
    selectedPriority = '';
  }

  // Bumped on every call, and stamped on each in-flight request — if a newer call has
  // started by the time an older one's responses come back (e.g. rapidly switching the
  // CalendarSwitcher, or flipping view/date twice before the first fetch lands), the
  // stale one discards its results instead of overwriting newer data with older, out of
  // order arrival isn't guaranteed to match request order.
  let loadGeneration = 0;

  // silent=true skips the `loading` flag for refreshes after a mutation (toggle/delete/
  // save) — otherwise the {#if loading} branch below briefly unmounts WeekCalendar/
  // MonthCalendar for no visible reason.
  async function loadTasks({ silent = false } = {}) {
    const generation = ++loadGeneration;
    if (!silent) loading = true;
    error = '';
    try {
      let result;
      if (viewMode === 'day') {
        result = await getTasks(currentDate, activeCalendarOwnerId);
      } else if (viewMode === 'week') {
        result = await getTasksRange(weekDates[0], weekDates[weekDates.length - 1], activeCalendarOwnerId);
      } else {
        result = await getTasksRange(monthDates[0], monthDates[monthDates.length - 1], activeCalendarOwnerId);
      }

      const unscheduledResult = await getUnscheduledTasks(activeCalendarOwnerId);

      if (generation !== loadGeneration) return; // superseded by a later call while these were in flight
      tasks = result.tasks;
      offline = result.offline;
      unscheduledTasks = unscheduledResult.tasks;
    } catch (err) {
      if (generation !== loadGeneration) return;
      error = err.message;
    } finally {
      if (generation === loadGeneration && !silent) loading = false;
    }
  }

  $effect(() => {
    currentDate;
    viewMode;
    activeCalendarOwnerId;
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
    // Belt-and-suspenders — the checkbox that calls this is already disabled while
    // readOnly (see PostTile), this just makes sure nothing can mutate a shared
    // calendar even if some other path ever reaches this function.
    if (readOnly) return;
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
    if (readOnly) return; // dragging never actually starts while readOnly; see PostTile
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

<!-- Bounds header + page body to the viewport height so the page itself never scrolls —
     only whichever inner region actually needs to (LibraryPage's own sidebar/content,
     or <main> below for the calendar view) does. min-height (not height) so the
     calendar view can still grow taller and let the page scroll under the now-sticky
     header when its content genuinely doesn't fit, exactly as it always has. -->
<div class="app-shell">
<header>
  <div class="nav-left">
    <button class="brand" onclick={() => (page = 'calendar')}>Планер</button>
    <button class="nav-link" class:active={page === 'library'} onclick={() => (page = 'library')}>
      Библиотеки
    </button>
  </div>
  <div class="header-actions">
    <CalendarSwitcher
      ownUsername={$auth.user.username}
      activeOwnerId={activeCalendarOwnerId}
      onSelect={(ownerId) => (activeCalendarOwnerId = ownerId)}
    />
    <SettingsMenu />
    <button
      class="theme-toggle"
      onclick={toggleTheme}
      aria-label={$theme === 'dark' ? 'Светла тема' : 'Тъмна тема'}
      title={$theme === 'dark' ? 'Светла тема' : 'Тъмна тема'}
    >
      <Icon name={$theme === 'dark' ? 'sun' : 'moon'} size="1.05rem" />
    </button>
    <button class="link" onclick={logout}>Изход</button>
  </div>
</header>

{#if page === 'library'}
  <LibraryPage {activeCalendarOwnerId} myUserId={$auth.user.id} />
{:else}
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
  <select
    class="filter-select"
    bind:value={selectedPriority}
    onchange={() => (searchEnabled = true)}
    aria-label="Филтър по приоритет"
  >
    <option value="">Всички приоритети</option>
    {#each PRIORITIES as p}<option value={p}>{priorityLabel(p)}</option>{/each}
  </select>
  {#if searchQuery || selectedClient || selectedPostType || selectedPriority}
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
            class:read-only={readOnly}
            data-date={currentDate}
            onclick={(e) => {
              if (readOnly) return;
              if (e.target.closest('.post')) return;
              handleGridCreate(currentDate, null);
            }}
          >
            {#each tasks as task (task.id)}
              <PostTile
                {task}
                dimmed={hasActiveFilters(activeFilters) && !taskMatchesFilters(task, activeFilters)}
                onEdit={openEditForm}
                onToggle={handleToggleStatus}
                {readOnly}
              />
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
            {readOnly}
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
            {readOnly}
          />
        {/if}
      </div>

      <BacklogColumn
        tasks={unscheduledTasks}
        searchFilter={activeFilters}
        {readOnly}
        onEdit={openEditForm}
        onToggle={handleToggleStatus}
        onCreate={() => handleGridCreate(null)}
      />
    </div>
  {/if}
</main>

{#if getDragState()?.moved}
  <div class="drag-ghost" style="left: {getDragState().x}px; top: {getDragState().y}px;">
    {getDragState().task.title}
  </div>
{/if}

{#if !readOnly}
  <button class="fab" onclick={openNewTaskForm} aria-label="Нова задача">+</button>
{/if}
{/if}
</div>

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
      {readOnly}
    />
  {/key}
{/if}

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    /* A definite height (not min-height) — flex-grow distribution to .library below
       needs the container's own size to be definite, not just floored, or nested flex
       children fall back to their content's full size instead of the remaining space.
       .app-shell becomes the scrolling container itself (not body): the calendar view's
       <main> has no overflow handling of its own, so if its content doesn't fit, THIS
       box scrolls under the sticky header, same net effect as the page scrolling used
       to have — LibraryPage's own regions handle their own internal scroll instead. */
    height: 100vh;
    height: 100dvh; /* falls back to 100vh above on browsers without dvh support */
    overflow-y: auto;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    /* Pushes content below the Dynamic Island/notch when installed as a standalone
       iOS app (env() resolves to 0 on browsers without a safe area — harmless there). */
    padding-top: calc(1rem + env(safe-area-inset-top, 0px));
    background: var(--color-accent);
    color: white;
    /* Requested explicitly — stays pinned at the very top through any scrolling,
       whether that's the calendar view's whole-page scroll or (now bounded away
       entirely, see .app-shell) the library's internal one. */
    position: sticky;
    top: 0;
    z-index: 10;
    flex-shrink: 0;
  }
  .nav-left {
    display: flex;
    align-items: center;
    gap: 1.4rem;
  }
  .brand {
    margin: 0;
    padding: 0;
    font-size: 1.3rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
  }
  .nav-link {
    background: none;
    border: none;
    padding: 0.2rem 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.75);
    border-bottom: 2px solid transparent;
    cursor: pointer;
  }
  .nav-link:hover {
    color: white;
  }
  .nav-link.active {
    color: white;
    border-bottom-color: white;
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
    /* Buttons don't inherit `color` from an ancestor by default (the browser's own
       UA stylesheet gives them their own default instead) — without this the icon
       rendered black even inside the white-on-blue header. */
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
    /* width (not max-width) + align-self (not margin: auto) — now that this is a flex
       item of .app-shell, auto margins on the cross axis suppress stretch and the item
       shrinks to fit its own content instead of filling up to the cap, which is the
       opposite of what "max-width, centered" was trying to do. An explicit width sizes
       it definitely regardless of content; align-self centers it the same as the old
       margin: auto did. See the identical fix on main/.filter-selects below. */
    width: min(1600px, 96vw);
    align-self: center;
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
    width: min(1600px, 96vw);
    align-self: center;
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
    /* Bottom padding is just breathing room now (was 5rem, reserved so the fixed FAB
       never overlapped content) — the FAB is meant to float in front of the
       calendar/backlog boxes now that they stretch to the bottom of the screen (see
       .fab's z-index below), not sit in a dead zone below them. */
    padding: 0 1rem 1rem;
    padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
    /* width + align-self, not max-width + margin: auto — see .search-bar's comment
       above for why (auto margins on a flex item's cross axis suppress stretch, so it
       shrinks to its content's width instead of filling up to the cap; this broke
       exactly this way in production once main became a flex item of .app-shell). */
    width: min(1600px, 96vw);
    align-self: center;
    /* flex:1 + min-height:0 + column: lets .content-row below (Day/Week/Month's own
       calendar box, and BacklogColumn beside it — see their own comments) stretch to
       actually reach the bottom of the screen instead of shrink-wrapping to its
       content, same fix as LibraryPage's client-sidebar. min-height:0 is required at
       EVERY level of this chain (main → .content-row → .calendar-area → the active
       view's own box) or the flex default (min-height: auto) makes each one refuse to
       shrink below its own content, which was the exact bug that broke this the first
       time. */
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  h2 {
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--color-text);
    /* margin-top intentionally matches main's own padding-bottom (1rem) — MonthCalendar
       fills the rest of .calendar-area down to its real bottom edge (see its own
       measureRowHeight comment), so keeping this the same value gives the month label
       equal breathing room above as the grid has below, instead of drifting out of sync
       whenever one of the two changes. */
    margin: 1rem 0 0.5rem;
    letter-spacing: -0.005em;
  }
  /* The backlog column is a fixed-width sibling, which is what shrinks the calendar
     itself (flex: 1 fills whatever's left). Stacks vertically below the calendar on
     narrow screens instead of squeezing both side by side. */
  .content-row {
    display: flex;
    gap: 1rem;
    align-items: stretch;
    flex: 1;
    min-height: 0;
  }
  .calendar-area {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  @media (max-width: 720px) {
    .content-row {
      flex-direction: column;
    }
  }
  .day-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    /* align-content/align-items: start, not the grid default (normal → stretch) — this
       box now stretches to fill .calendar-area (flex:1 below) so empty space below the
       last row is still clickable, same as WeekCalendar's day-column, but without
       align-content:start the single row of tiles would itself stretch to fill that
       full height instead of staying their natural content height. */
    align-content: start;
    align-items: start;
    gap: 0.75rem;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    cursor: pointer;
  }
  .day-grid.read-only {
    cursor: default;
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
    /* Now that the calendar/backlog boxes stretch down near the bottom of the screen
       (see main's reduced padding-bottom above), the FAB deliberately floats in front
       of them instead of living below in what used to be empty space — explicit
       z-index (above header's 10) so it stays clickable/visible on top regardless of
       DOM order. */
    z-index: 20;
    width: 3.25rem;
    height: 3.25rem;
    border-radius: 50%;
    background: var(--color-accent);
    color: white;
    border: none;
    font-size: 1.75rem;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    transition: background-color 0.15s, transform 0.1s;
  }
  .fab:hover {
    background: var(--color-accent-hover);
  }
  .fab:active {
    transform: scale(0.94);
  }
</style>
