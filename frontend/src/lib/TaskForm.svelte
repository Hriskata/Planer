<script>
  import { untrack } from 'svelte';
  import {
    createTask,
    updateTask,
    deleteTask,
    updateSeriesScope,
    deleteSeriesScope,
    uploadImage,
    getEmailSenderSettings,
  } from './api.js';
  import { POST_TYPES } from './postTypes.js';
  import { PRIORITIES, priorityLabel } from './priorities.js';
  import { PLATFORMS, PLATFORM_OTHER } from './platforms.js';
  import { isoWeekday } from './date.js';
  import Icon from './Icon.svelte';
  import { trapFocus } from './modalA11y.js';
  import SeriesScopeDialog from './SeriesScopeDialog.svelte';
  import TaskHistoryDialog from './TaskHistoryDialog.svelte';
  import CommentsDialog from './CommentsDialog.svelte';

  const WEEKDAY_OPTIONS = [
    { value: 1, label: 'Пон' },
    { value: 2, label: 'Вт' },
    { value: 3, label: 'Ср' },
    { value: 4, label: 'Чет' },
    { value: 5, label: 'Пет' },
    { value: 6, label: 'Съб' },
    { value: 7, label: 'Нед' },
  ];

  let {
    task = null,
    duplicateFrom = null,
    defaultDate,
    defaultTime = null,
    onSaved,
    onCancel,
    onDuplicate,
    readOnly = false,
    // Client share-link review flow (CommentsDialog.svelte) — threaded down from
    // SharedCalendarPage.svelte when this form is opened from the public, unauthenticated
    // link, so the dialog knows to call the public api.js functions instead of the authed
    // ones. Both are no-ops (unused) in the normal authed context.
    isPublicShare = false,
    shareToken = null,
  } = $props();

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
  // A stored platform outside the fixed list (typed in via "Други" on some earlier
  // save) still needs to round-trip correctly when the task is reopened for editing —
  // it lands in the free-text field, with the select itself falling back to PLATFORM_OTHER.
  let platform = $state(untrack(() => (source?.platform && !PLATFORMS.includes(source.platform) ? PLATFORM_OTHER : (source?.platform ?? ''))));
  let platformOther = $state(untrack(() => (source?.platform && !PLATFORMS.includes(source.platform) ? source.platform : '')));
  // '' (not 0/null) so the empty "— Без —" <option> below binds correctly — coerced
  // back to a number or null in handleSubmit.
  let priority = $state(untrack(() => source?.priority ?? ''));
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
  let emailOnComplete = $state(untrack(() => Boolean(source?.email_on_complete)));
  let emailTo = $state(untrack(() => source?.email_to ?? ''));
  let emailSubject = $state(untrack(() => source?.email_subject ?? ''));
  let emailBody = $state(untrack(() => source?.email_body ?? ''));
  let saving = $state(false);
  let error = $state('');

  // "Повтаря се" — only offered when CREATING (task === null, see the markup below);
  // editing an existing occurrence goes through showScopeDialog instead (this/following/
  // all), not this section. Defaults to the anchor date's own weekday, since that's the
  // day the series is being scheduled FROM — the least-surprising starting selection.
  let recurrenceEnabled = $state(false);
  let recurrenceType = $state('weekly');
  let recurrenceWeekdays = $state(untrack(() => (date ? [isoWeekday(date)] : [])));
  let recurrenceUntil = $state('');

  // Set when editing an occurrence that has task.series_id — intercepts handleSubmit/
  // handleDelete below instead of calling updateTask/deleteTask directly, see
  // handleScopedAction. null = closed.
  let showScopeDialog = $state(null); // null | { action: 'save' | 'delete' }

  let showHistory = $state(false);
  let showComments = $state(false);

  // "Изпрати имейл при завършване" silently no-ops server-side if the account has no
  // Gmail App Password configured (see backend/src/email.js) — nothing in the task's
  // own save/complete flow would ever surface that, so the checkbox itself has to warn
  // about it here. null = not loaded yet (no warning while we don't know).
  let senderConfigured = $state(null);
  // Fetched lazily — only once the checkbox is actually relevant (already on when
  // editing a task that has it, or just turned on), not unconditionally on every single
  // form open. Most task creates/edits never touch this checkbox at all, so eagerly
  // fetching on every open was a network round trip almost nothing needed.
  $effect(() => {
    if (!readOnly && emailOnComplete && senderConfigured === null) {
      getEmailSenderSettings()
        .then((s) => (senderConfigured = s.hasAppPassword))
        .catch(() => {});
    }
  });

  // The actual upload is deferred until submit (see handleSubmit) — picking a file just
  // stores it + a local blob: preview. Uploading eagerly (the old behavior) created a
  // server-side file the instant a file was chosen, with no code path to clean it up if
  // the form was then cancelled, or the photo swapped for a different one before saving
  // — an unbounded orphaned-upload leak. Submitting an already-selected file for an
  // EXISTING task's photo still goes through updateTask's normal image_path change,
  // which the backend already cleans the old file up for.
  let pendingImageFile = $state(null);
  let previewUrl = $state(untrack(() => source?.image_path ?? null));

  function revokePreviewIfBlob() {
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
  }

  function handleImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    revokePreviewIfBlob();
    pendingImageFile = file;
    previewUrl = URL.createObjectURL(file);
    e.target.value = ''; // lets the same file be picked again later if removed
  }

  function handleRemoveImage() {
    revokePreviewIfBlob();
    imagePath = null;
    pendingImageFile = null;
    previewUrl = null;
  }

  // Picking an hour defaults the minute to :00; clearing the hour clears the minute too
  // (both empty = no time set = an all-day task).
  $effect(() => {
    if (hour !== '' && minute === '') minute = '00';
    if (hour === '') minute = '';
  });

  function buildPayload() {
    const time = hour !== '' && minute !== '' ? `${hour}:${minute}` : null;
    const payload = {
      title,
      date: date || null,
      time,
      notes: notes || null,
      shared,
      client: client || null,
      post_type: postType || null,
      platform: platform === PLATFORM_OTHER ? platformOther.trim() || null : platform || null,
      priority: priority !== '' ? Number(priority) : null,
      image_path: imagePath,
      status: done ? 'done' : 'pending',
      email_on_complete: emailOnComplete,
      email_to: emailOnComplete ? emailTo.trim() : null,
      email_subject: emailOnComplete ? emailSubject || null : null,
      email_body: emailOnComplete ? emailBody || null : null,
    };
    if (!task && recurrenceEnabled) {
      payload.recurrence = {
        type: recurrenceType,
        weekdays: recurrenceType === 'weekly' ? recurrenceWeekdays : undefined,
        until: recurrenceUntil,
      };
    }
    return payload;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    error = '';
    if (emailOnComplete && !emailTo.trim()) {
      error = 'Имейл адресът е задължителен, ако имейл при завършване е включено.';
      return;
    }
    // Editing one occurrence of a recurring series needs a this/following/all choice
    // before anything is actually saved — handleScopedAction does the real save once
    // the user picks.
    if (task?.series_id) {
      showScopeDialog = { action: 'save' };
      return;
    }
    saving = true;
    try {
      // Only actually uploaded now, at save time — see the comment on pendingImageFile.
      if (pendingImageFile) {
        const result = await uploadImage(pendingImageFile);
        imagePath = result.path;
        pendingImageFile = null;
      }
      const payload = buildPayload();
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
    // SeriesScopeDialog's own "Само тази" button IS the confirmation for a recurring
    // occurrence — no native confirm() on top of it (that would double-confirm, unlike
    // the "Тази и следващите"/"Всички" buttons which have no separate confirm either).
    if (task.series_id) {
      showScopeDialog = { action: 'delete' };
      return;
    }
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

  async function handleScopedAction(action, scope) {
    showScopeDialog = null;
    error = '';
    saving = true;
    try {
      if (action === 'save') {
        if (pendingImageFile) {
          const result = await uploadImage(pendingImageFile);
          imagePath = result.path;
          pendingImageFile = null;
        }
        const payload = buildPayload();
        if (scope === 'this') {
          // Editing "just this one" also detaches it from the series — once an
          // occurrence has been made uniquely different, it's no longer part of the
          // pattern for future bulk edits (same model as Google Calendar).
          await updateTask(task.id, { ...payload, series_id: null });
        } else {
          await updateSeriesScope(task.id, scope, payload);
        }
      } else if (scope === 'this') {
        await deleteTask(task.id);
      } else {
        await deleteSeriesScope(task.id, scope);
      }
      onSaved();
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }
</script>

<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) onCancel(); }} role="presentation">
  <form
    onsubmit={handleSubmit}
    role="dialog"
    aria-modal="true"
    aria-labelledby="task-form-title"
    use:trapFocus={{ onEscape: onCancel }}
  >
    <h2 id="task-form-title">{readOnly ? 'Преглед на пост' : task ? 'Редакция на пост' : 'Нов пост'}</h2>

    {#if task?.series_id}
      <p class="series-indicator">
        <Icon name="repeat" size="0.9rem" />
        Част от повтаряща се поредица
      </p>
    {/if}

    {#if task}
      <div class="secondary-actions">
        <button type="button" class="history-trigger" onclick={() => (showHistory = true)}>
          <Icon name="clock" size="0.9rem" />
          История
        </button>
        <button type="button" class="history-trigger" onclick={() => (showComments = true)}>
          <Icon name="message-circle" size="0.9rem" />
          Коментари
          {#if task.approval_status}
            <span
              class="approval-dot"
              class:approved={task.approval_status === 'approved'}
              class:changes={task.approval_status === 'changes_requested'}
            ></span>
          {/if}
        </button>
      </div>
    {/if}

    <!-- disabled on the fieldset, not every single field — HTML disables every
         descendant input/select/textarea/button in one place instead of threading
         readOnly onto each of the dozen fields below individually. -->
    <fieldset disabled={readOnly}>
    <label>
      Клиент
      <input type="text" bind:value={client} placeholder="Име на клиента" />
    </label>

    <label>
      Заглавие
      <input type="text" bind:value={title} required />
    </label>

    <div class="row">
      <label>
        Тип пост
        <select bind:value={postType}>
          <option value="">— Избери —</option>
          {#each POST_TYPES as pt (pt)}<option value={pt}>{pt}</option>{/each}
        </select>
      </label>
      <label>
        Приоритет (по избор)
        <select bind:value={priority}>
          <option value="">— Без —</option>
          {#each PRIORITIES as p (p)}<option value={p}>{priorityLabel(p)}</option>{/each}
        </select>
      </label>
    </div>

    <div class="row">
      <label>
        Платформа (по избор)
        <select bind:value={platform}>
          <option value="">— Без —</option>
          {#each PLATFORMS as p (p)}<option value={p}>{p}</option>{/each}
          <option value={PLATFORM_OTHER}>{PLATFORM_OTHER}</option>
        </select>
      </label>
      {#if platform === PLATFORM_OTHER}
        <label>
          Коя платформа
          <input type="text" bind:value={platformOther} placeholder="напр. Pinterest" required />
        </label>
      {/if}
    </div>

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
            {#each HOURS as h (h)}<option value={h}>{h}</option>{/each}
          </select>
          <span>:</span>
          <select bind:value={minute} disabled={hour === ''}>
            {#if hour === ''}<option value="">— —</option>{/if}
            {#each MINUTES as m (m)}<option value={m}>{m}</option>{/each}
          </select>
        </div>
      </label>
    </div>

    {#if !task}
      <div class="section-divider"></div>
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={recurrenceEnabled} disabled={!date} />
        Повтаря се
      </label>
      {#if !date}
        <p class="field-hint">Нужна е дата, за да се повтаря постът.</p>
      {/if}
      {#if recurrenceEnabled}
        <div class="recurrence-fields">
          <label>
            Тип повторение
            <select bind:value={recurrenceType}>
              <option value="daily">Всеки ден</option>
              <option value="weekly">Всяка седмица</option>
              <option value="monthly">Всеки месец (същата дата)</option>
            </select>
          </label>
          {#if recurrenceType === 'weekly'}
            <div class="weekday-picker">
              {#each WEEKDAY_OPTIONS as wd (wd.value)}
                <label class="weekday-chip">
                  <input type="checkbox" value={wd.value} bind:group={recurrenceWeekdays} />
                  {wd.label}
                </label>
              {/each}
            </div>
          {/if}
          <label>
            Повтаря се до
            <input type="date" bind:value={recurrenceUntil} min={date} required={recurrenceEnabled} />
          </label>
        </div>
      {/if}
    {/if}

    <label>
      Копи
      <textarea bind:value={notes} rows="4" placeholder="Текст на поста..."></textarea>
    </label>

    <div class="field">
      <span class="field-label">Снимка (по избор)</span>
      {#if previewUrl}
        <div class="image-preview">
          <img src={previewUrl} alt="Преглед на снимката" />
          <button type="button" class="remove-image" onclick={handleRemoveImage} aria-label="Премахни снимката">
            ×
          </button>
        </div>
      {:else}
        <label class="upload-dropzone">
          <input type="file" accept="image/*" onchange={handleImageSelect} hidden />
          <span class="upload-icon"><Icon name="camera" size="1.2rem" /></span>
          Качи снимка
        </label>
      {/if}
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

    <label class="checkbox-label">
      <input type="checkbox" bind:checked={emailOnComplete} />
      <Icon name="mail" size="1rem" />
      Изпрати имейл при завършване
    </label>

    {#if emailOnComplete}
      <div class="email-fields">
        {#if senderConfigured === false}
          <p class="warning">
            Нямаш настроен имейл подател — писмото няма да излезе. Настрой Gmail App
            Password от Настройки → Имейл подател.
          </p>
        {/if}
        <label>
          Имейл
          <input type="email" bind:value={emailTo} placeholder="someone@example.com" required />
        </label>
        <label>
          Тема
          <input type="text" bind:value={emailSubject} placeholder={`Завършена задача: ${title || '...'}`} />
        </label>
        <label>
          Съобщение
          <textarea bind:value={emailBody} rows="3" placeholder="Текст на имейла..."></textarea>
        </label>
      </div>
    {/if}

    {#if error}<p class="error" role="alert">{error}</p>{/if}
    </fieldset>

    <div class="form-actions">
      {#if readOnly}
        <div class="spacer"></div>
        <button type="button" class="secondary" onclick={onCancel}>Затвори</button>
      {:else}
        {#if task}
          <button type="button" class="danger" onclick={handleDelete} disabled={saving}>Изтрий</button>
          <button type="button" class="secondary" onclick={() => onDuplicate(task)}>Копирай</button>
        {/if}
        <div class="spacer"></div>
        <button type="button" class="secondary" onclick={onCancel}>Отказ</button>
        <button type="submit" disabled={saving}>{saving ? 'Запазване...' : 'Запази'}</button>
      {/if}
    </div>
  </form>
</div>

{#if showScopeDialog}
  <SeriesScopeDialog
    action={showScopeDialog.action}
    onChoose={(scope) => handleScopedAction(showScopeDialog.action, scope)}
    onCancel={() => (showScopeDialog = null)}
  />
{/if}

{#if showHistory}
  <TaskHistoryDialog {task} onClose={() => (showHistory = false)} />
{/if}

{#if showComments}
  <CommentsDialog {task} {isPublicShare} {shareToken} onClose={() => (showComments = false)} />
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: var(--color-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem 0;
    box-sizing: border-box;
    z-index: 10;
  }
  form {
    background: var(--color-surface);
    width: 100%;
    max-width: 520px;
    padding: 1.75rem;
    border-radius: 20px;
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
    color: var(--color-text);
  }
  /* display: contents strips the fieldset's own box out of the layout entirely — its
     children lay out directly in the form's flex column, as if the wrapper weren't
     there, while `disabled` on it still reaches every descendant field/button. */
  fieldset {
    display: contents;
    border: none;
    padding: 0;
    margin: 0;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text-muted);
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
    color: var(--color-text-muted);
  }
  .checkbox-label {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    font-weight: normal;
    color: var(--color-text);
  }
  .email-fields {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.85rem;
    background: var(--color-surface-alt);
    border-radius: 12px;
  }
  .section-divider {
    height: 1px;
    background: var(--color-border);
    margin: 0.1rem 0;
  }
  .series-indicator {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: -0.5rem 0 0;
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }
  .secondary-actions {
    display: flex;
    gap: 1rem;
    margin: -0.4rem 0 0;
  }
  .history-trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0;
    background: none;
    border: none;
    font-size: 0.8rem;
    color: var(--color-text-muted);
    cursor: pointer;
    text-decoration: underline;
  }
  .history-trigger:hover {
    color: var(--color-text);
  }
  .approval-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--color-border-strong);
    flex-shrink: 0;
  }
  .approval-dot.approved {
    background: var(--color-success);
  }
  .approval-dot.changes {
    background: var(--color-danger);
  }
  .field-hint {
    font-size: 0.8rem;
    color: var(--color-text-faint, var(--color-text-muted));
    margin: -0.5rem 0 0;
    font-weight: normal;
  }
  .recurrence-fields {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.85rem;
    background: var(--color-surface-alt);
    border-radius: 12px;
  }
  .weekday-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .weekday-chip {
    flex-direction: row;
    align-items: center;
    gap: 0.3rem;
    font-weight: normal;
    font-size: 0.85rem;
    color: var(--color-text);
    background: var(--color-surface);
    border: 1.5px solid var(--color-border);
    border-radius: 999px;
    padding: 0.3rem 0.7rem;
  }
  input,
  textarea,
  select {
    padding: 0.65rem 0.75rem;
    font-size: 1rem;
    font-weight: normal;
    color: var(--color-text);
    background: var(--color-surface);
    border: 1.5px solid var(--color-border);
    border-radius: 10px;
    font-family: inherit;
    transition: border-color 0.15s ease;
  }
  input:focus,
  textarea:focus,
  select:focus {
    outline: none;
    border-color: var(--color-accent);
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
    border: 2px dashed var(--color-border-strong);
    border-radius: 12px;
    color: var(--color-text-muted);
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    background: var(--color-surface-alt);
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .upload-dropzone:hover {
    border-color: var(--color-accent);
    background: var(--color-accent-tint);
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
    border: 1.5px solid var(--color-border);
  }
  .remove-image {
    position: absolute;
    top: -0.5rem;
    right: -0.5rem;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    background: var(--color-text);
    color: var(--color-surface);
    border: 2px solid var(--color-surface);
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
    background: var(--color-accent);
    color: white;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  button:hover {
    background: var(--color-accent-hover);
  }
  button.secondary {
    background: var(--color-border);
    color: var(--color-text);
  }
  button.secondary:hover {
    background: var(--color-border-strong);
  }
  button.danger {
    background: none;
    color: var(--color-danger);
    padding: 0.65rem 0.4rem;
  }
  button.danger:hover {
    background: var(--color-danger-tint);
  }
  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .error {
    color: var(--color-danger);
    font-size: 0.85rem;
    margin: 0;
    font-weight: normal;
  }
  .warning {
    color: var(--color-danger);
    background: var(--color-danger-tint);
    font-size: 0.8rem;
    font-weight: normal;
    margin: 0 0 0.5rem;
    padding: 0.5rem 0.65rem;
    border-radius: 6px;
  }
</style>
