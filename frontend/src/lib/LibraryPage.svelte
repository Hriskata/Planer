<script>
  import { getLibraryAssets, uploadLibraryAsset, deleteLibraryAsset } from './api.js';
  import { extractClients } from './search.js';
  import { ASSET_TYPES, assetTypeIsText } from './libraryTypes.js';

  // activeCalendarOwnerId: null = your own library; otherwise the owner id of a
  // calendar shared with you (see CalendarSwitcher.svelte in MainView's header, which
  // this page shares state with) — the library follows the same "whose calendar am I
  // looking at" switch as the task views, per how this feature was scoped.
  let { activeCalendarOwnerId, myUserId } = $props();

  let assets = $state([]);
  let loading = $state(false);
  let error = $state('');
  let selectedClient = $state(''); // '' = "Всички клиенти"
  let selectedType = $state(''); // '' = "Всички"
  let showUploadForm = $state(false);

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

  $effect(() => {
    activeCalendarOwnerId;
    load();
  });

  const clients = $derived(extractClients(assets));
  const filteredAssets = $derived(
    assets.filter(
      (a) => (!selectedClient || a.client === selectedClient) && (!selectedType || a.type === selectedType)
    )
  );

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

  const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];
  function isImageAsset(asset) {
    if (!asset.file_path) return false;
    const lower = asset.file_path.toLowerCase();
    return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }
  function fileName(asset) {
    return asset.file_path ? asset.file_path.split('/').pop() : '';
  }

  // --- Upload form state ---
  let formClient = $state('');
  let formType = $state(ASSET_TYPES[0]);
  let formTitle = $state('');
  let formTextContent = $state('');
  let formFile = $state(null);
  let formSaving = $state(false);
  let formError = $state('');

  function openUploadForm() {
    formClient = selectedClient;
    formType = ASSET_TYPES[0];
    formTitle = '';
    formTextContent = '';
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
    if (!assetTypeIsText(formType) && !formFile) {
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
      <button class="client-item" class:active={selectedClient === client} onclick={() => (selectedClient = client)}>
        {client}
      </button>
    {/each}
    {#if clients.length === 0 && !loading}
      <p class="sidebar-empty">Все още няма клиенти.</p>
    {/if}
  </aside>

  <div class="library-content">
    <div class="type-tabs">
      <button class:active={selectedType === ''} onclick={() => (selectedType = '')}>Всички</button>
      {#each ASSET_TYPES as t (t)}
        <button class:active={selectedType === t} onclick={() => (selectedType = t)}>{t}</button>
      {/each}
    </div>

    {#if error}<p class="error">{error}</p>{/if}

    {#if loading}
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
              {#if isImageAsset(asset)}
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

  <button class="fab" onclick={openUploadForm} aria-label="Добави материал">+</button>

  {#if showUploadForm}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-backdrop" onclick={() => (showUploadForm = false)}>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="modal" onclick={(e) => e.stopPropagation()}>
        <h2>Нов материал</h2>
        <form onsubmit={handleUploadSubmit}>
          <label>
            Клиент
            <input type="text" bind:value={formClient} placeholder="Име на клиента" required />
          </label>
          <label>
            Тип
            <select bind:value={formType}>
              {#each ASSET_TYPES as t (t)}<option value={t}>{t}</option>{/each}
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
          {#if formError}<p class="error">{formError}</p>{/if}
          <div class="form-actions">
            <button type="button" class="secondary" onclick={() => (showUploadForm = false)}>Отказ</button>
            <button type="submit" disabled={formSaving}>{formSaving ? 'Качване...' : 'Качи'}</button>
          </div>
        </form>
      </div>
    </div>
  {/if}
</div>

<style>
  .library {
    display: flex;
    gap: 1.25rem;
    align-items: flex-start;
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
  }
  .client-item {
    background: none;
    border: none;
    text-align: left;
    padding: 0.5rem 0.6rem;
    border-radius: 6px;
    font-size: 0.9rem;
    color: var(--color-text);
    cursor: pointer;
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
  }
  .type-tabs {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
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
    }
  }
</style>
