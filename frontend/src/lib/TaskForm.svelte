<script>
  import { untrack, onMount } from 'svelte';
  import { createTask, updateTask, deleteTask, getTagColorSource } from './api.js';
  import { TASK_COLORS } from './colors.js';
  import { extractTags, getTagColors } from './search.js';

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
  let title = $state(untrack(() => source?.title ?? ''));
  let date = $state(untrack(() => source?.date ?? defaultDate));
  const [initHour, initMinute] = untrack(() => {
    if (source?.time) return snapTo15(...source.time.split(':'));
    if (defaultTime) return defaultTime.split(':');
    return ['', ''];
  });
  let hour = $state(initHour);
  let minute = $state(initMinute);
  let notes = $state(untrack(() => source?.notes ?? ''));
  let shared = $state(untrack(() => Boolean(source?.shared)));
  let color = $state(untrack(() => source?.color ?? null));
  let done = $state(untrack(() => task?.status === 'done'));
  let saving = $state(false);
  let error = $state('');

  // Picking an hour defaults the minute to :00; clearing the hour clears the minute too
  // (both empty = no time set = an all-day task).
  $effect(() => {
    if (hour !== '' && minute === '') minute = '00';
    if (hour === '') minute = '';
  });

  // Same-tag tasks share one color: fetched once on open (best-effort — a failure here
  // shouldn't block creating/editing a task, it just means no auto-fill/lock this time).
  let tagColorSource = $state([]);
  onMount(async () => {
    try {
      tagColorSource = await getTagColorSource();
    } catch {
      // ignore — see comment above
    }
  });

  const tagColorMap = $derived(getTagColors(tagColorSource));
  const currentTag = $derived(extractTags([{ title, notes }])[0] ?? null);
  const lockedColor = $derived(currentTag ? (tagColorMap.get(currentTag) ?? null) : null);

  $effect(() => {
    if (lockedColor && color !== lockedColor) {
      color = lockedColor;
    }
  });

  async function handleSubmit(e) {
    e.preventDefault();
    error = '';
    saving = true;
    const time = hour !== '' && minute !== '' ? `${hour}:${minute}` : null;
    const payload = { title, date, time, notes: notes || null, shared, color, status: done ? 'done' : 'pending' };
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
    <h2>{task ? 'Редакция на задача' : 'Нова задача'}</h2>
    <label>
      Заглавие
      <input type="text" bind:value={title} required />
    </label>
    <label>
      Дата
      <input type="date" bind:value={date} required />
    </label>
    <label>
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
    <label>
      Бележки
      <textarea bind:value={notes} rows="3"></textarea>
    </label>
    <label>
      Цвят (по избор)
      {#if lockedColor}
        <p class="tag-color-note">Определен от тага [{currentTag}] — важи за всички задачи с този таг.</p>
      {/if}
      <div class="color-picker">
        <button
          type="button"
          class="color-swatch none"
          class:selected={color === null}
          disabled={!!lockedColor}
          onclick={() => (color = null)}
          aria-label="Без цвят"
        ></button>
        {#each TASK_COLORS as c (c.value)}
          <button
            type="button"
            class="color-swatch"
            class:selected={color === c.value}
            disabled={!!lockedColor}
            style="background: {c.bg};"
            onclick={() => (color = c.value)}
            aria-label={c.label}
          ></button>
        {/each}
      </div>
    </label>
    <label class="checkbox-label">
      <input type="checkbox" bind:checked={shared} />
      Споделена задача (видима за всички потребители)
    </label>
    {#if task}
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={done} />
        Завършена
      </label>
    {/if}
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
    max-width: 480px;
    padding: 1.5rem;
    border-radius: 16px 16px 0 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-height: 90vh;
    overflow-y: auto;
  }
  h2 {
    margin: 0 0 0.25rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.9rem;
  }
  .checkbox-label {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }
  .color-picker {
    display: flex;
    gap: 0.5rem;
  }
  .color-swatch {
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
  }
  .color-swatch.none {
    background: white;
    border-color: #cbd5e1;
    background-image: linear-gradient(to top right, transparent 47%, #dc2626 49%, #dc2626 51%, transparent 53%);
  }
  .color-swatch.selected {
    border-color: #1e293b;
  }
  .color-swatch:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }
  .tag-color-note {
    font-size: 0.75rem;
    color: #64748b;
    margin: 0;
  }
  input,
  textarea,
  select {
    padding: 0.6rem;
    font-size: 1rem;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-family: inherit;
  }
  .time-select {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .time-select select {
    flex: 1;
  }
  .form-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  .spacer {
    flex: 1;
  }
  button {
    padding: 0.6rem 1.2rem;
    font-size: 1rem;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }
  button.secondary {
    background: #e2e8f0;
    color: #1e293b;
  }
  button.danger {
    background: none;
    color: #dc2626;
    padding: 0.6rem 0.4rem;
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
