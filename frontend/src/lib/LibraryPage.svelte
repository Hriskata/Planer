<script>
  import {
    getLibraryAssets,
    uploadLibraryAsset,
    deleteLibraryAsset,
    getTaskClients,
    getTasksByClient,
    createShareLink,
    revokeShareLink,
  } from './api.js';
  import { extractClients } from './search.js';
  import { ASSET_TYPES, assetTypeIsText, assetTypeIsColor, sortAssetTypeLabels } from './libraryTypes.js';
  import { todayStr, addMonths, getMonthGridDates, monthLabel } from './date.js';
  import TaskForm from './TaskForm.svelte';
  import MonthCalendar from './MonthCalendar.svelte';
  import Icon from './Icon.svelte';
  import { trapFocus } from './modalA11y.js';

  // activeCalendarOwnerId: null = your own library; otherwise the owner id of a
  // calendar shared with you (see CalendarSwitcher.svelte in MainView's header, which
  // this page shares state with) — the library follows the same "whose calendar am I
  // looking at" switch as the task views, per how this feature was scoped.
  let { activeCalendarOwnerId, myUserId } = $props();

  // A pseudo type, not a real library_assets.type — selecting it swaps the whole
  // content pane to that client's tasks instead of library materials (see below).
  const POSTS_TAB = 'Постове';

  // Also a pseudo type — offered in the upload form's own "Тип" dropdown (alongside
  // Лого/Шрифт/...) so a post can be created while creating a new object from ANY tab,
  // not just after first switching to the Постове tab. Picking it hands off straight to
  // TaskForm instead of ever becoming a library_assets row — see handleFormTypeChange.
  const POST_TYPE_OPTION = 'Пост';

  // Task sharing stays strictly read-only (see calendarAccess.js / CLAUDE.md) even
  // though library material sharing is more permissive (upload allowed) — this tab pulls
  // in real `tasks` rows, so it must follow tasks' own, stricter rule, not the library's.
  const tasksReadOnly = $derived(activeCalendarOwnerId !== null);

  let assets = $state([]);
  let loading = $state(false);
  let error = $state('');
  let selectedClient = $state(''); // '' = "Всички клиенти"
  let selectedType = $state(''); // '' = "Всички"
  let showUploadForm = $state(false);
  let taskClients = $state([]);
  let posts = $state([]);
  let postsLoading = $state(false);
  let showTaskForm = $state(false);
  let editingPost = $state(null);
  let duplicatePostFrom = $state(null);
  // Reference date for the Постове tab's own month calendar — independent of Планер's
  // main calendar (a different page, a different "which month am I looking at").
  let libraryDate = $state(todayStr());

  // "Сподели с клиента" modal state — a public, unauthenticated read-only calendar link
  // scoped to exactly one client (see routes/publicShare.js).
  let shareModalClient = $state(null); // null = closed, otherwise the client name
  let shareLink = $state(null);
  let shareLoading = $state(false);
  let shareError = $state('');
  let shareCopied = $state(false);
  let shareRevoked = $state(false);

  async function load() {
    loading = true;
    error = '';
    try {
      assets = await getLibraryAssets(activeCalendarOwnerId);
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  // Non-critical if this fails (network hiccup, etc.) — the sidebar just falls back to
  // showing only clients that already have library material, same as before this tab existed.
  async function loadTaskClients() {
    try {
      taskClients = await getTaskClients(activeCalendarOwnerId);
    } catch {
      // ignored — see comment above
    }
  }

  $effect(() => {
    activeCalendarOwnerId;
    load();
    loadTaskClients();
  });

  async function loadPosts() {
    postsLoading = true;
    error = '';
    try {
      posts = await getTasksByClient(selectedClient, activeCalendarOwnerId);
    } catch (err) {
      error = err.message;
    } finally {
      postsLoading = false;
    }
  }

  // Only fetches while the Постове tab is actually selected — switching to it re-runs
  // this (selectedType becomes a tracked dependency), and while on it, changing client
  // or calendar re-fetches too.
  $effect(() => {
    if (selectedType !== POSTS_TAB) return;
    selectedClient;
    activeCalendarOwnerId;
    loadPosts();
  });

  // Clients come from two places now — library material and the calendar's own tasks —
  // so a client who only has scheduled posts and no uploaded material yet still shows
  // up here instead of only being reachable by typing their name from scratch.
  const clients = $derived(
    [...new Set([...extractClients(assets), ...taskClients])].sort((a, b) => a.localeCompare(b, 'bg'))
  );
  const filteredAssets = $derived(
    assets.filter(
      (a) => (!selectedClient || a.client === selectedClient) && (!selectedType || a.type === selectedType)
    )
  );

  // Alphabetical, "Друго" last — Постове/Пост are mixed into their respective list
  // before sorting so they land in their correct alphabetical slot instead of always
  // trailing at the end (see sortAssetTypeLabels).
  const tabTypes = $derived(sortAssetTypeLabels([...ASSET_TYPES, POSTS_TAB]));
  const formTypeOptions = $derived(
    sortAssetTypeLabels(tasksReadOnly ? ASSET_TYPES : [...ASSET_TYPES, POST_TYPE_OPTION])
  );

  const libraryMonthDates = $derived(getMonthGridDates(libraryDate));
  const libraryReferenceMonth = $derived(libraryDate.slice(0, 7));
  function libraryGoPrev() {
    libraryDate = addMonths(libraryDate, -1);
  }
  function libraryGoNext() {
    libraryDate = addMonths(libraryDate, 1);
  }
  function libraryGoToday() {
    libraryDate = todayStr();
  }

  // Mirrors the backend's exact permission check (routes/library.js) so the × button
  // simply doesn't render for materials a delete request would 403 on anyway — the
  // owner of the library has admin-style rights over everything in it, anyone else may
  // only delete what they themselves uploaded.
  function canDelete(asset) {
    const isOwnLibrary = activeCalendarOwnerId === null;
    return isOwnLibrary || asset.uploaded_by === myUserId;
  }

  async function handleDelete(asset) {
    if (!confirm(`Изтриване на "${asset.title}"?`)) return;
    error = '';
    try {
      await deleteLibraryAsset(asset.id);
      await load();
    } catch (err) {
      error = err.message;
    }
  }

  function handleUploaded() {
    showUploadForm = false;
    load();
  }

  // Shared by the Постове tab's own FAB, the month calendar's click-to-create (which
  // additionally pins a date), and by picking "Пост" in the upload form's own Тип
  // dropdown (see handleFormTypeChange) — all just want a blank TaskForm prefilled with
  // whichever client (and, for the calendar, day) is currently in scope.
  function startNewPost(clientHint, date) {
    if (tasksReadOnly) return; // all call sites already guard against this; belt-and-suspenders
    editingPost = null;
    duplicatePostFrom = clientHint || date ? { client: clientHint || '', ...(date ? { date } : {}) } : null;
    showTaskForm = true;
  }

  function handleFabClick() {
    if (selectedType === POSTS_TAB) {
      startNewPost(selectedClient);
    } else {
      openUploadForm();
    }
  }

  // "Пост" in the upload form's Тип dropdown is a pseudo option (see its definition) —
  // picking it never becomes a library_assets row, it just hands off to TaskForm
  // immediately, closing the upload modal in the same motion.
  function handleFormTypeChange() {
    if (formType === POST_TYPE_OPTION) {
      showUploadForm = false;
      startNewPost(formClient.trim());
    }
  }

  function openEditPost(post) {
    editingPost = post;
    duplicatePostFrom = null;
    showTaskForm = true;
  }

  function handleDuplicatePost(post) {
    editingPost = null;
    duplicatePostFrom = post;
    showTaskForm = true;
  }

  function handlePostSaved() {
    showTaskForm = false;
    loadPosts();
  }

  const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];
  function isImageAsset(asset) {
    if (!asset.file_path) return false;
    const lower = asset.file_path.toLowerCase();
    return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }
  function fileName(asset) {
    return asset.file_path ? asset.file_path.split('/').pop() : '';
  }
  // Prefers hex over rgb for the swatch background — both may be set on the same
  // asset (two notations for the same color), hex is just the more direct CSS value.
  function swatchColor(asset) {
    if (asset.hex_code) return asset.hex_code;
    if (asset.rgb_value) return `rgb(${asset.rgb_value})`;
    return null;
  }

  async function openShareModal(client) {
    shareModalClient = client;
    shareLink = null;
    shareError = '';
    shareCopied = false;
    shareRevoked = false;
    shareLoading = true;
    try {
      shareLink = await createShareLink(client);
    } catch (err) {
      shareError = err.message;
    } finally {
      shareLoading = false;
    }
  }

  function closeShareModal() {
    shareModalClient = null;
  }

  function shareUrl() {
    return `${window.location.origin}/share/${shareLink.token}`;
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl());
      shareCopied = true;
    } catch {
      shareError = 'Копирането не бе възможно — избери и копирай линка ръчно.';
    }
  }

  async function handleRevokeShareLink() {
    if (!confirm('Прекратяване на достъпа за този линк? Старият линк спира да работи веднага.')) return;
    shareError = '';
    try {
      await revokeShareLink(shareLink.id);
      shareLink = null;
      shareRevoked = true;
    } catch (err) {
      shareError = err.message;
    }
  }

  // --- Upload form state ---
  let formClient = $state('');
  let formType = $state(ASSET_TYPES[0]);
  let formTitle = $state('');
  let formTextContent = $state('');
  let formHexCode = $state('');
  let formRgbValue = $state('');
  let formFile = $state(null);
  let formSaving = $state(false);
  let formError = $state('');

  function openUploadForm() {
    formClient = selectedClient;
    // Pre-select whatever type tab is currently active (e.g. "+" while on Цвят starts a
    // new Цвят) — only when it's a real material type, though; "Всички" (no tab narrowed
    // down) still falls back to the first type, same as before.
    formType = ASSET_TYPES.includes(selectedType) ? selectedType : ASSET_TYPES[0];
    formTitle = '';
    formTextContent = '';
    formHexCode = '';
    formRgbValue = '';
    formFile = null;
    formError = '';
    showUploadForm = true;
  }

  function handleFileSelect(e) {
    formFile = e.target.files?.[0] || null;
  }

  async function handleUploadSubmit(e) {
    e.preventDefault();
    formError = '';
    if (!formClient.trim() || !formTitle.trim()) {
      formError = 'Клиент и заглавие са задължителни.';
      return;
    }
    if (assetTypeIsText(formType) && !formTextContent.trim()) {
      formError = 'Въведи текстовото съдържание.';
      return;
    }
    if (assetTypeIsColor(formType) && !formHexCode.trim() && !formRgbValue.trim() && !formFile) {
      formError = 'Въведи HEX, RGB, или качи снимка — поне едно от трите.';
      return;
    }
    if (!assetTypeIsText(formType) && !assetTypeIsColor(formType) && !formFile) {
      formError = 'Избери файл за качване.';
      return;
    }
    formSaving = true;
    try {
      await uploadLibraryAsset(
        {
          client: formClient.trim(),
          type: formType,
          title: formTitle.trim(),
          file: assetTypeIsText(formType) ? null : formFile,
          textContent: assetTypeIsText(formType) ? formTextContent.trim() : null,
          hexCode: assetTypeIsColor(formType) ? formHexCode.trim() : null,
          rgbValue: assetTypeIsColor(formType) ? formRgbValue.trim() : null,
        },
        activeCalendarOwnerId
      );
      handleUploaded();
    } catch (err) {
      formError = err.message;
    } finally {
      formSaving = false;
    }
  }
</script>

<div class="library">
  <aside class="client-sidebar">
    <button class="client-item" class:active={selectedClient === ''} onclick={() => (selectedClient = '')}>
      Всички клиенти
    </button>
    {#each clients as client (client)}
      <div class="client-row">
        <button class="client-item" class:active={selectedClient === client} onclick={() => (selectedClient = client)}>
          {client}
        </button>
        {#if activeCalendarOwnerId === null}
          <button class="client-share-btn" onclick={() => openShareModal(client)} aria-label={`Сподели с ${client}`}>
            <Icon name="share-2" size="0.85rem" />
          </button>
        {/if}
      </div>
    {/each}
    {#if clients.length === 0 && !loading}
      <p class="sidebar-empty">Все още няма клиенти.</p>
    {/if}
  </aside>

  <div class="library-content">
    <div class="type-tabs">
      <button class:active={selectedType === ''} onclick={() => (selectedType = '')}>Всички</button>
      {#each tabTypes as t (t)}
        <button class:active={selectedType === t} onclick={() => (selectedType = t)}>{t}</button>
      {/each}
    </div>

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    {#if selectedType === POSTS_TAB}
      <div class="calendar-area">
        <div class="month-nav">
          <h3>{monthLabel(libraryDate)}</h3>
          <button onclick={libraryGoPrev} aria-label="Предишен месец">‹</button>
          <button onclick={libraryGoToday}>Днес</button>
          <button onclick={libraryGoNext} aria-label="Следващ месец">›</button>
        </div>
        {#if postsLoading}
          <p class="empty">Зареждане...</p>
        {:else}
          <MonthCalendar
            monthDates={libraryMonthDates}
            referenceMonth={libraryReferenceMonth}
            tasks={posts}
            onEdit={openEditPost}
            onDayClick={() => {}}
            onCreate={(date) => startNewPost(selectedClient, date)}
            readOnly={tasksReadOnly}
          />
        {/if}
      </div>
    {:else if loading}
      <p class="empty">Зареждане...</p>
    {:else if filteredAssets.length === 0}
      <p class="empty">
        Няма материали{selectedClient ? ` за ${selectedClient}` : ''}{selectedType ? ` от тип ${selectedType}` : ''}.
      </p>
    {:else}
      <div class="asset-grid">
        {#each filteredAssets as asset (asset.id)}
          <div class="asset-card">
            {#if canDelete(asset)}
              <button class="asset-delete" onclick={() => handleDelete(asset)} aria-label="Изтрий материала">×</button>
            {/if}
            <div class="asset-preview">
              {#if assetTypeIsColor(asset.type)}
                <div class="color-preview">
                  {#if swatchColor(asset)}
                    <div class="color-swatch" style={`background: ${swatchColor(asset)};`}></div>
                  {:else if isImageAsset(asset)}
                    <img src={asset.file_path} alt={asset.title} loading="lazy" />
                  {/if}
                  {#if asset.hex_code}<span class="color-value">{asset.hex_code}</span>{/if}
                  {#if asset.rgb_value}<span class="color-value">rgb({asset.rgb_value})</span>{/if}
                  {#if swatchColor(asset) && asset.file_path}
                    <a class="color-photo-link" href={asset.file_path} download>снимка</a>
                  {/if}
                </div>
              {:else if isImageAsset(asset)}
                <img src={asset.file_path} alt={asset.title} loading="lazy" />
              {:else if assetTypeIsText(asset.type)}
                <p class="asset-text">{asset.text_content}</p>
              {:else}
                <a class="asset-file" href={asset.file_path} download>{fileName(asset)}</a>
              {/if}
            </div>
            <div class="asset-meta">
              <span class="asset-title">{asset.title}</span>
              <span class="asset-tags">
                <span class="tag-chip">{asset.type}</span>
                <span class="tag-chip">{asset.client}</span>
              </span>
              <span class="asset-uploader">качено от {asset.uploaded_by_username}</span>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  {#if selectedType !== POSTS_TAB || !tasksReadOnly}
    <button
      class="fab"
      onclick={handleFabClick}
      aria-label={selectedType === POSTS_TAB ? 'Нов пост' : 'Добави материал'}
    >
      +
    </button>
  {/if}

  {#if showTaskForm}
    {#key editingPost?.id ?? (duplicatePostFrom?.id ? `dup-${duplicatePostFrom.id}` : `new-${duplicatePostFrom?.client ?? ''}`)}
      <TaskForm
        task={editingPost}
        duplicateFrom={duplicatePostFrom}
        defaultDate={todayStr()}
        onSaved={handlePostSaved}
        onCancel={() => (showTaskForm = false)}
        onDuplicate={handleDuplicatePost}
        readOnly={tasksReadOnly}
      />
    {/key}
  {/if}

  {#if showUploadForm}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-backdrop" onclick={() => (showUploadForm = false)}>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        class="modal"
        tabindex="-1"
        onclick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-modal-title"
        use:trapFocus={{ onEscape: () => (showUploadForm = false) }}
      >
        <h2 id="upload-modal-title">Нов материал</h2>
        <form onsubmit={handleUploadSubmit}>
          <label>
            Клиент
            <input type="text" bind:value={formClient} placeholder="Име на клиента" required />
          </label>
          <label>
            Тип
            <select bind:value={formType} onchange={handleFormTypeChange}>
              {#each formTypeOptions as t (t)}<option value={t}>{t}</option>{/each}
            </select>
          </label>
          <label>
            Заглавие
            <input type="text" bind:value={formTitle} required />
          </label>
          {#if assetTypeIsText(formType)}
            <label>
              Текст
              <textarea bind:value={formTextContent} rows="5"></textarea>
            </label>
          {:else if assetTypeIsColor(formType)}
            <p class="field-hint">Попълни поне едно от трите — HEX, RGB, или снимка.</p>
            <label>
              HEX
              <input type="text" bind:value={formHexCode} placeholder="#3B82F6" />
            </label>
            <label>
              RGB
              <input type="text" bind:value={formRgbValue} placeholder="59, 130, 246" />
            </label>
            <label>
              Снимка (по избор)
              <input type="file" onchange={handleFileSelect} accept="image/*" />
            </label>
          {:else}
            <label>
              Файл
              <input
                type="file"
                onchange={handleFileSelect}
                accept={formType === 'Шрифт'
                  ? '.ttf,.otf,.woff,.woff2'
                  : formType === 'Друго'
                    ? 'image/*,.ttf,.otf,.woff,.woff2,.pdf'
                    : 'image/*'}
              />
            </label>
          {/if}
          {#if formError}<p class="error" role="alert">{formError}</p>{/if}
          <div class="form-actions">
            <button type="button" class="secondary" onclick={() => (showUploadForm = false)}>Отказ</button>
            <button type="submit" disabled={formSaving}>{formSaving ? 'Качване...' : 'Качи'}</button>
          </div>
        </form>
      </div>
    </div>
  {/if}

  {#if shareModalClient}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-backdrop" onclick={closeShareModal}>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        class="modal"
        tabindex="-1"
        onclick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        use:trapFocus={{ onEscape: closeShareModal }}
      >
        <h2 id="share-modal-title">Линк за {shareModalClient}</h2>
        {#if shareLoading}
          <p class="empty">Зареждане...</p>
        {:else if shareLink}
          <p class="field-hint">
            Всеки с този линк вижда само постовете на "{shareModalClient}", без логин и без право на редакция.
          </p>
          <label>
            Линк
            <input type="text" readonly value={shareUrl()} onclick={(e) => e.target.select()} />
          </label>
          <div class="share-actions">
            <button type="button" onclick={copyShareLink}>Копирай</button>
            {#if shareCopied}<span class="share-copied">Копирано.</span>{/if}
          </div>
          <button type="button" class="share-revoke" onclick={handleRevokeShareLink}>Премахни линка</button>
        {:else if shareRevoked}
          <p class="field-hint">Линкът е премахнат — старият вече не работи.</p>
          <button type="button" onclick={() => openShareModal(shareModalClient)}>Генерирай нов линк</button>
        {/if}
        {#if shareError}<p class="error" role="alert">{shareError}</p>{/if}
        <div class="form-actions">
          <button type="button" class="secondary" onclick={closeShareModal}>Затвори</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .library {
    display: flex;
    gap: 1.25rem;
    /* Default (stretch), not flex-start — .library itself is now a properly
       height-bounded flex:1 region (see MainView's .app-shell), so both the sidebar
       and the content column can stretch to match its real available height instead
       of each shrink-wrapping to their own content. */
    padding: 1rem;
    flex: 1;
    min-height: 0;
  }
  .client-sidebar {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    width: 180px;
    flex-shrink: 0;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 0.5rem;
    /* Stretched (see .library above) to reach the bottom of the available space with
       matching breathing room, regardless of how few clients exist — not just capped
       once there happen to be enough to overflow it. Scrolls internally rather than
       growing the box (or the page) further once the client list doesn't fit.
       min-height: 0 overrides the flex default (min-height: auto), which otherwise
       forces this box to its content's full height regardless of stretch — the classic
       nested-flexbox gotcha, needed at every level in this chain, not just on .library. */
    min-height: 0;
    overflow-y: auto;
  }
  .client-row {
    display: flex;
    align-items: center;
    gap: 0.15rem;
  }
  .client-item {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    text-align: left;
    padding: 0.5rem 0.6rem;
    border-radius: 6px;
    font-size: 0.9rem;
    color: var(--color-text);
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .client-share-btn {
    flex-shrink: 0;
    background: none;
    border: none;
    padding: 0.4rem;
    border-radius: 6px;
    color: var(--color-text-faint);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .client-share-btn:hover {
    background: var(--color-accent-tint);
    color: var(--color-accent);
  }
  .client-item:hover {
    background: var(--color-accent-tint);
  }
  .client-item.active {
    background: var(--color-accent);
    color: white;
    font-weight: 600;
  }
  .sidebar-empty {
    font-size: 0.8rem;
    color: var(--color-text-faint);
    padding: 0.5rem 0.6rem;
    margin: 0;
  }
  .library-content {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    /* Column so the Постове tab's .calendar-area below can claim the leftover height
       with flex:1 (same reasoning as MainView's own .calendar-area) — the asset/post
       grids in the other tabs don't opt into that (no flex:1 of their own), so they're
       unaffected and still just size to content with this element scrolling them. */
    display: flex;
    flex-direction: column;
  }
  .type-tabs {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
    flex-shrink: 0;
  }
  .type-tabs button {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    padding: 0.35rem 0.9rem;
    font-size: 0.85rem;
    color: var(--color-text);
    cursor: pointer;
  }
  .type-tabs button.active {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: white;
    font-weight: 600;
  }
  .asset-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 1rem;
  }
  /* Wraps the month nav + MonthCalendar (Постове tab) — named to match MainView's own
     .calendar-area purely so MonthCalendar's measureRowHeight (gridEl.closest(
     '.calendar-area')) finds a real, height-bound ancestor here too, the same way it
     does on the main calendar page, instead of falling back to the whole window. */
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
  .month-nav h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text);
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
  .asset-card {
    position: relative;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .asset-delete {
    position: absolute;
    top: 0.35rem;
    right: 0.35rem;
    z-index: 1;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.55);
    color: white;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  .asset-preview {
    aspect-ratio: 1 / 1;
    background: var(--color-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .asset-preview img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .asset-text {
    font-size: 0.8rem;
    color: var(--color-text);
    padding: 0.75rem;
    margin: 0;
    overflow: auto;
    max-height: 100%;
    white-space: pre-wrap;
  }
  .color-preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    width: 100%;
    height: 100%;
    padding: 0.75rem;
  }
  .color-swatch {
    width: 70%;
    aspect-ratio: 1 / 1;
    border-radius: 8px;
    border: 1px solid var(--color-border);
    flex-shrink: 0;
  }
  .color-value {
    font-size: 0.75rem;
    font-family: monospace;
    color: var(--color-text-muted);
  }
  .color-photo-link {
    font-size: 0.7rem;
    color: var(--color-accent);
    text-decoration: none;
  }
  .color-photo-link:hover {
    text-decoration: underline;
  }
  .field-hint {
    font-size: 0.8rem;
    color: var(--color-text-faint);
    margin: -0.25rem 0 0;
  }
  .share-actions {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .share-actions button {
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
    border-radius: 6px;
    border: none;
    background: var(--color-accent);
    color: white;
    cursor: pointer;
  }
  .share-copied {
    font-size: 0.8rem;
    color: var(--color-success);
  }
  .share-revoke {
    align-self: flex-start;
    background: none;
    border: none;
    color: var(--color-danger);
    font-size: 0.85rem;
    cursor: pointer;
    padding: 0;
  }
  .asset-file {
    color: var(--color-accent);
    font-size: 0.85rem;
    text-decoration: none;
    padding: 0.75rem;
    word-break: break-all;
    text-align: center;
  }
  .asset-file:hover {
    text-decoration: underline;
  }
  .asset-meta {
    padding: 0.6rem 0.7rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .asset-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .asset-tags {
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
  }
  .tag-chip {
    font-size: 0.7rem;
    background: var(--color-accent-tint);
    color: var(--color-accent);
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
  }
  .asset-uploader {
    font-size: 0.7rem;
    color: var(--color-text-faint);
  }
  .fab {
    position: fixed;
    right: 1.25rem;
    bottom: 1.25rem;
    width: 3.25rem;
    height: 3.25rem;
    border-radius: 50%;
    border: none;
    background: var(--color-accent);
    color: white;
    font-size: 1.8rem;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .fab:hover {
    background: var(--color-accent-hover);
  }
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    z-index: 20;
  }
  .modal {
    background: var(--color-surface);
    border-radius: 12px;
    padding: 1.5rem;
    width: 100%;
    max-width: 380px;
    max-height: 90vh;
    overflow-y: auto;
  }
  .modal h2 {
    margin: 0 0 1rem;
    font-size: 1.15rem;
  }
  .modal form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .modal label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.9rem;
    color: var(--color-text);
  }
  .modal input,
  .modal select,
  .modal textarea {
    padding: 0.6rem;
    font-size: 1rem;
    color: var(--color-text);
    background: var(--color-surface);
    border: 1px solid var(--color-border-strong);
    border-radius: 6px;
    font-family: inherit;
  }
  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }
  .form-actions button {
    padding: 0.6rem 1.1rem;
    font-size: 0.95rem;
    border-radius: 6px;
    cursor: pointer;
    border: none;
  }
  .form-actions button[type='submit'] {
    background: var(--color-accent);
    color: white;
  }
  .form-actions button[type='submit']:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .form-actions .secondary {
    background: none;
    border: 1px solid var(--color-border-strong);
    color: var(--color-text);
  }
  .empty {
    color: var(--color-text-faint);
    font-size: 0.9rem;
  }
  .error {
    color: var(--color-danger);
    font-size: 0.9rem;
  }
  @media (max-width: 720px) {
    .library {
      flex-direction: column;
    }
    .client-sidebar {
      width: 100%;
      flex-direction: row;
      flex-wrap: wrap;
      /* The desktop column's stretch-to-fill sizing doesn't suit a wrapping chip row —
         it just grows with its (wrapped) content here instead (overflow-y: auto from
         the base rule is a no-op without an explicit height to overflow). */
      overflow-y: visible;
    }
  }
</style>
