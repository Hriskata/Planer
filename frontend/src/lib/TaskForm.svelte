<script>
  import { untrack } from 'svelte';
  import { createTask, updateTask, deleteTask, uploadImage } from './api.js';
  import { POST_TYPES } from './postTypes.js';

  let { task = null, duplicateFrom = null, defaultDate, defaultTime = null, onSaved, onCancel, onDuplicate } = $props();

  // When duplicating, `task` is null (this is a create, not an edit) but fields are
  // pre-filled from `duplicateFrom`. `task` itself still drives edit-only UI (delete,
  // done checkbox, PUT vs POST) further down, so a duplicate correctly starts as a
  // fresh, pending, deletable-only-after-saving task. Read once at mount, same reason
  // as the untrack() calls below.
  const source = untrack(() => task ?? duplicateFrom);

  const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
  const MINUTES = ['00', '15', '30', '45'];

  // Snaps an existing HH:MM to the nearest 15-minute mark, so legacy/dragged times
  // (which may not land on a quarter hour) still show correctly in the two selects below.
  function snapTo15(h, m) {
    let total = Math.round((Number(h) * 60 + Number(m)) / 15) * 15;
    total = ((total % 1440) + 1440) % 1440;
    return [String(Math.floor(total / 60)).padStart(2, '0'), String(total % 60).padStart(2, '0')];
  }

  // The form reads task/defaultDate only once, on open (the component is recreated
  // every time MainView shows it) — it deliberately does NOT follow later changes to
  // the prop, or it would overwrite whatever the user is typing.
  // untrack() confirms to Svelte that this is intentional, not missed reactivity.
  let client = $state(untrack(() => source?.client ?? ''));
  let title = $state(untrack(() => source?.title ?? ''));
  let postType = $state(untrack(() => source?.post_type ?? ''));
  // NOT source?.date ?? defaultDate — date is nullable now (an unscheduled/backlog
  // task), and `null ?? defaultDate` would wrongly replace a real "no date" with
  // today's date on every edit. Only a genuinely absent source falls back to it.
  let date = $state(untrack(() => (source ? (source.date ?? '') : defaultDate)));
  const [initHour, initMinute] = untrack(() => {
    if (source?.time) return snapTo15(...source.time.split(':'));
    if (defaultTime) return defaultTime.split(':');
    return ['', ''];
  });
  let hour = $state(initHour);
  let minute = $state(initMinute);
  let notes = $state(untrack(() => source?.notes ?? '')); // "Копи" in the UI — the post's caption/body text
  let imagePath = $state(untrack(() => source?.image_path ?? null));
  let shared = $state(untrack(() => Boolean(source?.shared)));
  let done = $state(untrack(() => task?.status === 'done'));
  let saving = $state(false);
  let error = $state('');

  let imageUploading = $state(false);
  let imageError = $state('');

  async function handleImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    imageError = '';
    imageUploading = true;
    try {
      const result = await uploadImage(file);
      imagePath = result.path;
    } catch (err) {
      imageError = err.message;
    } finally {
      imageUploading = false;
      e.target.value = ''; // lets the same file be picked again later if removed
    }
  }

  // Picking an hour defaults the minute to :00; clearing the hour clears the minute too
  // (both empty = no time set = an all-day task).
  $effect(() => {
    if (hour !== '' && minute === '') minute = '00';
    if (hour === '') minute = '';
  });

  async function handleSubmit(e) {
    e.preventDefault();
    error = '';
    saving = true;
    const time = hour !== '' && minute !== '' ? `${hour}:${minute}` : null;
    const payload = {
      title,
      date: date || null,
      time,
      notes: notes || null,
      shared,
      client: client || null,
      post_type: postType || null,
      image_path: imagePath,
      status: done ? 'done' : 'pending',
    };
    try {
      if (task) {
        await updateTask(task.id, payload);
      } else {
        await createTask(payload);
      }
      onSaved();
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }

  async function handleDelete() {
    if (!confirm(`Изтриване на "${task.title}"?`)) return;
    error = '';
    saving = true;
    try {
      await deleteTask(task.id);
      onSaved();
    } catch (err) {
      error = err.message;
      saving = false;
    }
  }
</script>

<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) onCancel(); }} role="presentation">
  <form onsubmit={handleSubmit}>
    <h2>{task ? 'Редакция на пост' : 'Нов пост'}</h2>

    <label>
      Клиент
      <input type="text" bind:value={client} placeholder="Име на клиента" />
    </label>

    <label>
      Заглавие
      <input type="text" bind:value={title} required />
    </label>

    <label>
      Тип пост
      <select bind:value={postType}>
        <option value="">— Избери —</option>
        {#each POST_TYPES as pt}<option value={pt}>{pt}</option>{/each}
      </select>
    </label>

    <div class="row">
      <label>
        Дата (по избор)
        <input type="date" bind:value={date} />
      </label>
      <label class="time-field">
        Час (по избор)
        <div class="time-select">
          <select bind:value={hour}>
            <option value="">— —</option>
            {#each HOURS as h}<option value={h}>{h}</option>{/each}
          </select>
          <span>:</span>
          <select bind:value={minute} disabled={hour === ''}>
            {#if hour === ''}<option value="">— —</option>{/if}
            {#each MINUTES as m}<option value={m}>{m}</option>{/each}
          </select>
        </div>
      </label>
    </div>

    <label>
      Копи
      <textarea bind:value={notes} rows="4" placeholder="Текст на поста..."></textarea>
    </label>

    <div class="field">
      <span class="field-label">Снимка (по избор)</span>
      {#if imagePath}
        <div class="image-preview">
          <img src={imagePath} alt="Преглед на качената снимка" />
          <button type="button" class="remove-image" onclick={() => (imagePath = null)} aria-label="Премахни снимката">
            ×
          </button>
        </div>
      {:else}
        <label class="upload-dropzone" class:uploading={imageUploading}>
          <input type="file" accept="image/*" onchange={handleImageSelect} disabled={imageUploading} hidden />
          <span class="upload-icon">📷</span>
          {imageUploading ? 'Качване...' : 'Качи снимка'}
        </label>
      {/if}
      {#if imageError}<p class="error">{imageError}</p>{/if}
    </div>

    {#if task}
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={done} />
        Завършена
      </label>
    {/if}

    <div class="section-divider"></div>

    <label class="checkbox-label">
      <input type="checkbox" bind:checked={shared} />
      Споделена задача (видима за всички потребители)
    </label>

    {#if error}<p class="error">{error}</p>{/if}
    <div class="form-actions">
      {#if task}
        <button type="button" class="danger" onclick={handleDelete} disabled={saving}>Изтрий</button>
        <button type="button" class="secondary" onclick={() => onDuplicate(task)}>Копирай</button>
      {/if}
      <div class="spacer"></div>
      <button type="button" class="secondary" onclick={onCancel}>Отказ</button>
      <button type="submit" disabled={saving}>{saving ? 'Запазване...' : 'Запази'}</button>
    </div>
  </form>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.4);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    z-index: 10;
  }
  form {
    background: white;
    width: 100%;
    max-width: 520px;
    padding: 1.75rem;
    border-radius: 20px 20px 0 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-height: 92vh;
    overflow-y: auto;
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.12);
  }
  h2 {
    margin: 0 0 0.25rem;
    font-size: 1.35rem;
    color: #0f172a;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: #475569;
  }
  .row {
    display: flex;
    gap: 0.75rem;
  }
  .row label {
    flex: 1;
  }
  .time-field {
    flex: 1.1;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .field-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: #475569;
  }
  .checkbox-label {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    font-weight: normal;
    color: #334155;
  }
  .section-divider {
    height: 1px;
    background: #e2e8f0;
    margin: 0.1rem 0;
  }
  input,
  textarea,
  select {
    padding: 0.65rem 0.75rem;
    font-size: 1rem;
    font-weight: normal;
    color: #0f172a;
    border: 1.5px solid #dde3ea;
    border-radius: 10px;
    font-family: inherit;
    transition: border-color 0.15s ease;
  }
  input:focus,
  textarea:focus,
  select:focus {
    outline: none;
    border-color: #2563eb;
  }
  textarea {
    resize: vertical;
  }
  .time-select {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .time-select select {
    flex: 1;
  }
  .upload-dropzone {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1.25rem;
    border: 2px dashed #cbd5e1;
    border-radius: 12px;
    color: #64748b;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    background: #f8fafc;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .upload-dropzone:hover {
    border-color: #2563eb;
    background: #eff6ff;
  }
  .upload-dropzone.uploading {
    cursor: wait;
    opacity: 0.7;
  }
  .upload-icon {
    font-size: 1.2rem;
  }
  .image-preview {
    position: relative;
    width: fit-content;
    max-width: 100%;
  }
  .image-preview img {
    display: block;
    max-width: 100%;
    max-height: 220px;
    border-radius: 12px;
    border: 1.5px solid #dde3ea;
  }
  .remove-image {
    position: absolute;
    top: -0.5rem;
    right: -0.5rem;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    background: #1e293b;
    color: white;
    border: 2px solid white;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  .form-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }
  .spacer {
    flex: 1;
  }
  button {
    padding: 0.65rem 1.3rem;
    font-size: 0.95rem;
    font-weight: 600;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  button:hover {
    background: #1d4ed8;
  }
  button.secondary {
    background: #e2e8f0;
    color: #1e293b;
  }
  button.secondary:hover {
    background: #cbd5e1;
  }
  button.danger {
    background: none;
    color: #dc2626;
    padding: 0.65rem 0.4rem;
  }
  button.danger:hover {
    background: #fef2f2;
  }
  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .error {
    color: #dc2626;
    font-size: 0.85rem;
    margin: 0;
    font-weight: normal;
  }
</style>
