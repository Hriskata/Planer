const express = require('express');
const db = require('../db');
const { sendTaskCompletionEmail } = require('../email');
const { EMAIL_RE } = require('../validators');
const { resolveViewedOwnerId } = require('../calendarAccess');
const { deleteUploadedFile } = require('../uploadStorage');
const { addDays, addMonths, isoWeekday } = require('../dateUtils');
const { APPROVAL_STATUSES, MAX_COMMENT_LENGTH } = require('../taskFields');

const router = express.Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const VALID_STATUS = ['pending', 'done'];
const RECURRENCE_TYPES = ['daily', 'weekly', 'monthly'];
// Sanity/abuse cap, not a performance one — node:sqlite handles a few hundred
// synchronous inserts trivially. 366 covers a full daily year with no friction, while
// firmly blocking a mistaken decades-long daily series (e.g. a stale default `until`).
const MAX_SERIES_OCCURRENCES = 366;

// email_on_complete/email_to/email_subject/email_body/email_sent are the task OWNER's
// private automation config (who gets emailed, with what message) — redacted to
// off/NULL here for rows only visible via shared = 1, since a collaborator has no
// reason to see who someone else's completion email goes to. Shared between both GET
// routes below so the redaction rule can't drift out of sync between them.
const REDACTED_EMAIL_COLUMNS = `
  CASE WHEN user_id = @userId THEN email_on_complete ELSE 0 END AS email_on_complete,
  CASE WHEN user_id = @userId THEN email_to ELSE NULL END AS email_to,
  CASE WHEN user_id = @userId THEN email_subject ELSE NULL END AS email_subject,
  CASE WHEN user_id = @userId THEN email_body ELSE NULL END AS email_body,
  CASE WHEN user_id = @userId THEN email_sent ELSE 0 END AS email_sent
`;

// The "sender" for a completion email is always the acting user themselves (you can
// only ever complete your own tasks — see the ownership check in PUT /:id below), so
// this is keyed off req.user.id in both call sites below, not the task's own user_id.
function getEmailSender(userId) {
  return db.prepare('SELECT id, email, email_app_password_enc FROM users WHERE id = ?').get(userId);
}

// "Копирай" (duplicate) on a task carries its image_path over verbatim (see
// TaskForm.svelte), so two rows can legitimately point at the same physical file until
// one of them gets its own new photo — only actually delete the file once nothing else
// references it, or the sibling task's photo breaks.
function imagePathStillReferenced(imagePath, excludeTaskId) {
  const row = db.prepare('SELECT 1 FROM tasks WHERE image_path = ? AND id != ? LIMIT 1').get(imagePath, excludeTaskId);
  return Boolean(row);
}

// Which columns count as a meaningful, user-facing edit for the audit log — deliberately
// excludes reminder_sent/email_sent/updated_at/created_at/series_id/user_id, which are
// internal bookkeeping/side-effects rather than something a person consciously changed.
const HISTORY_DIFF_FIELDS = [
  'title', 'notes', 'date', 'time', 'status', 'client', 'post_type',
  'platform', 'priority', 'image_path', 'shared',
  'email_on_complete', 'email_to', 'email_subject', 'email_body',
  'approval_status',
];

// Field-level diff between a task's pre-image and the partial `data` about to be applied
// — only fields actually present in `data` AND actually different are included, so a
// no-op save (open + Save with nothing changed) produces an empty array. series_id gets
// its own pseudo-field instead of joining the generic loop above: the raw numeric id
// means nothing to a reader, only the "detached from its series" transition does.
function diffForHistory(task, data) {
  const changes = [];
  for (const field of HISTORY_DIFF_FIELDS) {
    if (field in data && data[field] !== task[field]) {
      changes.push({ field, old: task[field] ?? null, new: data[field] ?? null });
    }
  }
  if ('series_id' in data && data.series_id === null && task.series_id !== null) {
    changes.push({ field: 'series', old: 'series', new: 'standalone' });
  }
  return changes;
}

function recordHistory(taskId, ownerId, actorId, action, title, changes = null) {
  db.prepare(
    `INSERT INTO task_history (task_id, owner_id, actor_id, action, task_title, changes)
     VALUES (@taskId, @ownerId, @actorId, @action, @title, @changes)`
  ).run({
    taskId,
    ownerId,
    actorId,
    action,
    title,
    changes: changes && changes.length ? JSON.stringify(changes) : null,
  });
}

// Whether the caller may see a given task's audit history — mirrors the visibility rules
// baked into GET /'s SQL WHERE clause (own tasks, anyone's shared=1 tasks, or a whole
// calendar granted via calendar_shares), but expressed per-task instead of per-list since
// there's no existing single-task GET route to piggyback on.
function canViewTask(req, task) {
  if (task.user_id === req.user.id) return true;
  if (task.shared) return true;
  const me = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id);
  if (!me?.email) return false;
  const share = db
    .prepare('SELECT id FROM calendar_shares WHERE owner_id = ? AND shared_email = ?')
    .get(task.user_id, me.email);
  return Boolean(share);
}

function validateTaskInput(body, { partial = false } = {}) {
  const errors = [];
  const data = {};

  if (!partial || body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim().length === 0) {
      errors.push('title е задължително и трябва да е непразен текст.');
    } else {
      data.title = body.title.trim();
    }
  }

  // date is optional — a task with no date is "unscheduled" (shown in the backlog
  // column) until dragged onto a day in week/month/day view.
  //
  // Nullable fields below all follow the same three-way shape: field omitted entirely
  // -> leave data untouched (partial update keeps the existing value) or default to
  // null (full create); field explicitly null -> clear it (data[field] = null), even
  // on a partial update — body.date !== null must be checked BEFORE falling into the
  // "!partial" branch, or an explicit null during an edit (e.g. dragging a task back
  // to the unscheduled/backlog column, or clearing notes) is silently dropped instead
  // of actually clearing the column.
  if (body.date !== undefined) {
    if (body.date !== null) {
      if (typeof body.date !== 'string' || !DATE_RE.test(body.date)) {
        errors.push('date трябва да е във формат YYYY-MM-DD.');
      } else {
        data.date = body.date;
      }
    } else {
      data.date = null;
    }
  } else if (!partial) {
    data.date = null;
  }

  if (body.time !== undefined) {
    if (body.time !== null) {
      if (typeof body.time !== 'string' || !TIME_RE.test(body.time)) {
        errors.push('time трябва да е във формат HH:MM.');
      } else {
        data.time = body.time;
      }
    } else {
      data.time = null;
    }
  } else if (!partial) {
    data.time = null;
  }

  if (body.notes !== undefined) {
    if (body.notes !== null) {
      if (typeof body.notes !== 'string') {
        errors.push('notes трябва да е текст.');
      } else {
        data.notes = body.notes;
      }
    } else {
      data.notes = null;
    }
  } else if (!partial) {
    data.notes = null;
  }

  // client, post_type, platform, image_path, email_subject, email_body: simple optional
  // text fields, same shape as notes. platform holds the dropdown's chosen value verbatim
  // (including free text typed in for "Други") — no fixed enum enforced server-side, same
  // as post_type, so the option list can change on the frontend without a migration.
  for (const field of ['client', 'post_type', 'platform', 'image_path', 'email_subject', 'email_body']) {
    if (body[field] !== undefined) {
      if (body[field] !== null) {
        if (typeof body[field] !== 'string') {
          errors.push(`${field} трябва да е текст.`);
        } else {
          data[field] = body[field];
        }
      } else {
        data[field] = null;
      }
    } else if (!partial) {
      data[field] = null;
    }
  }

  if (body.email_to !== undefined) {
    if (body.email_to !== null) {
      if (typeof body.email_to !== 'string' || !EMAIL_RE.test(body.email_to)) {
        errors.push('email_to трябва да е валиден имейл адрес.');
      } else {
        data.email_to = body.email_to;
      }
    } else {
      data.email_to = null;
    }
  } else if (!partial) {
    data.email_to = null;
  }

  if (body.email_on_complete !== undefined) {
    data.email_on_complete = body.email_on_complete ? 1 : 0;
  } else if (!partial) {
    data.email_on_complete = 0;
  }

  if (body.priority !== undefined) {
    if (body.priority !== null) {
      if (!Number.isInteger(body.priority) || body.priority < 1 || body.priority > 4) {
        errors.push('priority трябва да е цяло число от 1 до 4.');
      } else {
        data.priority = body.priority;
      }
    } else {
      data.priority = null;
    }
  } else if (!partial) {
    data.priority = null;
  }

  if (body.status !== undefined) {
    if (!VALID_STATUS.includes(body.status)) {
      errors.push(`status трябва да е едно от: ${VALID_STATUS.join(', ')}.`);
    } else {
      data.status = body.status;
    }
  } else if (!partial) {
    data.status = 'pending';
  }

  if (body.shared !== undefined) {
    data.shared = body.shared ? 1 : 0;
  } else if (!partial) {
    data.shared = 0;
  }

  // Detaching a single occurrence from its recurring series (see PUT /:id/series for
  // the "this and all following"/"entire series" bulk scopes instead) — re-attaching to
  // an ARBITRARY series isn't supported, so only the literal value null is accepted.
  if (body.series_id !== undefined) {
    if (body.series_id !== null) {
      errors.push('series_id може да е само null (премахване от поредица).');
    } else {
      data.series_id = null;
    }
  }

  // Client-review status (share-link feature) — owner-side changes go through this same
  // PUT /:id path (see applyTaskUpdate below, which also stamps approval_status_set_by =
  // 'owner'); the public/client-side equivalent is a separate raw UPDATE in
  // publicShare.js, since there's no authenticated user to attribute it to.
  if (body.approval_status !== undefined) {
    if (body.approval_status !== null && !APPROVAL_STATUSES.includes(body.approval_status)) {
      errors.push(`approval_status трябва да е null или едно от: ${APPROVAL_STATUSES.join(', ')}.`);
    } else {
      data.approval_status = body.approval_status;
    }
  }

  // Cross-field: "send an email" only makes sense with a recipient. On a full create,
  // every field above already has a value (explicit or defaulted), so this can be
  // checked right here; a partial update may be touching neither field (leaving both at
  // whatever they already were) or only one of them, so that combined check happens in
  // the route handler instead, once it has the full merged record to look at.
  if (!partial && data.email_on_complete && !data.email_to) {
    errors.push('email_to е задължителен, ако имейл при завършване е включен.');
  }

  return { errors, data };
}

// Computes every occurrence date for a recurrence rule, string dates throughout
// (YYYY-MM-DD sorts lexicographically identically to chronologically, same trick this
// file's SQL already relies on for date >= @from AND date <= @to).
function generateOccurrenceDates({ type, weekdays, startDate, until }) {
  const dates = [];
  if (type === 'daily') {
    for (let d = startDate; d <= until; d = addDays(d, 1)) dates.push(d);
  } else if (type === 'weekly') {
    const wanted = new Set(weekdays);
    for (let d = startDate; d <= until; d = addDays(d, 1)) {
      if (wanted.has(isoWeekday(d))) dates.push(d);
    }
  } else if (type === 'monthly') {
    // Each step computed as addMonths(startDate, i) — always from the ORIGINAL anchor,
    // not addMonths(previous, 1) — so day-of-month clamping never compounds. E.g.
    // starting Jan 31: addMonths(startDate,1) -> Feb 28, addMonths(startDate,2) -> Mar
    // 31 (correctly recovers); iteratively clamping from the already-clamped Feb 28
    // would wrongly drift to Mar 28 instead.
    let d = startDate;
    let i = 0;
    while (d <= until) {
      dates.push(d);
      i += 1;
      d = addMonths(startDate, i);
    }
  }
  return dates;
}

// Validates a `recurrence` object from a create request against the task's own `date`
// (the series' anchor/first occurrence). Mirrors validateTaskInput's { errors, ... }
// shape. Returns occurrenceDates=null whenever errors is non-empty.
function validateRecurrence(recurrence, taskDate) {
  const errors = [];

  if (!recurrence || typeof recurrence !== 'object') {
    return { errors: ['recurrence трябва да е обект.'], occurrenceDates: null };
  }
  if (!RECURRENCE_TYPES.includes(recurrence.type)) {
    errors.push(`recurrence.type трябва да е едно от: ${RECURRENCE_TYPES.join(', ')}.`);
  }
  if (typeof taskDate !== 'string' || !DATE_RE.test(taskDate)) {
    errors.push('date е задължителна дата за повтаряща се задача.');
  }
  if (typeof recurrence.until !== 'string' || !DATE_RE.test(recurrence.until)) {
    errors.push('recurrence.until трябва да е във формат YYYY-MM-DD.');
  } else if (typeof taskDate === 'string' && DATE_RE.test(taskDate) && recurrence.until < taskDate) {
    errors.push('recurrence.until трябва да е на или след date.');
  }

  let normalizedWeekdays = null;
  if (recurrence.type === 'weekly') {
    const weekdays = recurrence.weekdays;
    if (!Array.isArray(weekdays) || weekdays.length === 0 || !weekdays.every((w) => Number.isInteger(w) && w >= 1 && w <= 7)) {
      errors.push('recurrence.weekdays трябва да е непразен списък от цели числа 1-7.');
    } else {
      normalizedWeekdays = [...new Set(weekdays)];
      if (typeof taskDate === 'string' && DATE_RE.test(taskDate) && !normalizedWeekdays.includes(isoWeekday(taskDate))) {
        errors.push('Избраните дни от седмицата трябва да включват деня на началната дата.');
      }
    }
  }

  if (errors.length > 0) {
    return { errors, occurrenceDates: null };
  }

  const occurrenceDates = generateOccurrenceDates({
    type: recurrence.type,
    weekdays: normalizedWeekdays,
    startDate: taskDate,
    until: recurrence.until,
  });

  if (occurrenceDates.length > MAX_SERIES_OCCURRENCES) {
    return {
      errors: [`Правилото генерира твърде много повторения (макс. ${MAX_SERIES_OCCURRENCES}) — стесни периода.`],
      occurrenceDates: null,
    };
  }

  return { errors: [], occurrenceDates, normalizedWeekdays };
}

// Applies already-validated partial `data` to one existing `task` row — the same
// reminder_sent/email_sent state-machine transitions PUT /:id has always computed,
// factored out so both the single-row route and the bulk PUT /:id/series route (which
// calls this once per row in a loop) share one implementation. Does NOT itself send
// email or delete the old image file — callers do that once, either immediately
// (single-row) or batched after the whole loop (bulk, see PUT /:id/series). `actorId` is
// who's making the change (always req.user.id at every call site today), threaded
// through separately from task.user_id so the audit row can distinguish the two once
// task sharing is ever more than read-only.
function applyTaskUpdate(task, data, actorId) {
  const merged = { ...task, ...data };
  const historyChanges = diffForHistory(task, data);

  // Rescheduling (a new date and/or time) means any already-sent 10-min-before
  // reminder was for the old moment — reset it so the new one still gets a reminder.
  const rescheduled = ('date' in data && data.date !== task.date) || ('time' in data && data.time !== task.time);
  const reminderSent = rescheduled ? 0 : task.reminder_sent;

  const becameUndone = task.status === 'done' && merged.status !== 'done';
  // Un-completing resets the flag so a later re-completion sends again; completing
  // sends (see shouldSendEmail below) and is recorded once that actually succeeds — a
  // failed send (bad address, SMTP down) leaves it at 0 so the NEXT completion can
  // retry, rather than silently marking a mail that never went out as sent.
  const emailSent = becameUndone ? 0 : task.email_sent;
  const shouldSendEmail = merged.status === 'done' && merged.email_on_complete && merged.email_to && !task.email_sent;
  const seriesId = 'series_id' in data ? data.series_id : task.series_id;
  // Owner-only path (applyTaskUpdate is never called from the public/client routes —
  // those do a separate raw UPDATE, see publicShare.js) — safe to hardcode 'owner' here
  // whenever the status is actually part of this update.
  const approvalStatusSetBy = 'approval_status' in data ? 'owner' : task.approval_status_set_by;

  db.prepare(
    `UPDATE tasks SET title = @title, notes = @notes, date = @date, time = @time,
       status = @status, shared = @shared, client = @client,
       post_type = @post_type, platform = @platform, priority = @priority, image_path = @image_path,
       email_on_complete = @email_on_complete, email_to = @email_to,
       email_subject = @email_subject, email_body = @email_body, email_sent = @emailSent,
       reminder_sent = @reminderSent, series_id = @seriesId,
       approval_status = @approvalStatus, approval_status_set_by = @approvalStatusSetBy,
       updated_at = datetime('now')
     WHERE id = @id`
  ).run({
    title: merged.title,
    notes: merged.notes,
    date: merged.date,
    time: merged.time,
    status: merged.status,
    shared: merged.shared,
    client: merged.client,
    post_type: merged.post_type,
    platform: merged.platform,
    priority: merged.priority,
    image_path: merged.image_path,
    email_on_complete: merged.email_on_complete,
    email_to: merged.email_to,
    email_subject: merged.email_subject,
    email_body: merged.email_body,
    emailSent,
    reminderSent,
    seriesId,
    approvalStatus: merged.approval_status,
    approvalStatusSetBy,
    id: task.id,
  });

  if (historyChanges.length > 0) {
    recordHistory(task.id, task.user_id, actorId, 'updated', merged.title, historyChanges);
  }

  return {
    updated: db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id),
    shouldSendEmail,
    oldImagePath: task.image_path,
  };
}

// The user's own tasks + shared tasks from everyone else — or, with ?calendar=<ownerId>,
// someone else's calendar entirely (see resolveViewedOwnerId).
router.get('/', (req, res) => {
  const { date, from, to, client } = req.query;

  for (const [name, value] of [['date', date], ['from', from], ['to', to]]) {
    if (value !== undefined && !DATE_RE.test(value)) {
      return res.status(400).json({ error: `${name} трябва да е във формат YYYY-MM-DD.` });
    }
  }

  const ownerId = resolveViewedOwnerId(req);
  if (ownerId === null) {
    return res.status(403).json({ error: 'Нямаш достъп до този календар.' });
  }

  // @date/@from/@to/@client are always present in the query (instead of being
  // conditionally spliced into the text), because node:sqlite throws if a named
  // parameter is passed that's missing from the SQL text. `date` is an exact match (day
  // view); `from`/`to` is an inclusive range (week/month views) — both can be combined,
  // though in practice the frontend only ever sends one or the other. `client` with none
  // of the three date params is how LibraryPage's "Постове" tab asks for "every task
  // (scheduled or not) for this one client" — see the ORDER BY note below for why that
  // combination needed its own handling.
  //
  // The ownership condition covers two different sharing mechanisms depending on
  // whether this is "my own calendar" or someone else's: viewing your own shows your
  // tasks plus anyone's tasks.shared = 1 (visible instance-wide); viewing someone
  // else's (via ?calendar=, already validated above) shows only THEIR tasks — not
  // blended with your own or with unrelated third parties' shared = 1 tasks. Written as
  // one SQL expression referencing both @ownerId and @userId (rather than branching the
  // query text in JS) so both params are always bound, regardless of which side is true.
  const baseQuery = `
    SELECT id, user_id, title, notes, date, time, status, shared, color,
           client, post_type, platform, priority, image_path, series_id,
           approval_status, created_at, updated_at,
           ${REDACTED_EMAIL_COLUMNS}
    FROM tasks
    WHERE (
        (@ownerId = @userId AND (user_id = @userId OR shared = 1))
        OR (@ownerId != @userId AND user_id = @ownerId)
      )
      AND (@date IS NULL OR date = @date)
      AND (@from IS NULL OR date >= @from)
      AND (@to IS NULL OR date <= @to)
      AND (@client IS NULL OR client = @client)
    ORDER BY date IS NULL, date ASC, time IS NULL, time ASC
  `;

  const rows = db.prepare(baseQuery).all({
    userId: req.user.id,
    ownerId,
    date: date ?? null,
    from: from ?? null,
    to: to ?? null,
    client: client ?? null,
  });
  res.json(rows);
});

// Distinct clients across this owner's tasks (same visibility rule as GET / above) —
// powers LibraryPage's client sidebar, so a client that only has scheduled posts and no
// library material yet still shows up there instead of only being reachable by typing
// their name from scratch in the upload form.
router.get('/clients', (req, res) => {
  const ownerId = resolveViewedOwnerId(req);
  if (ownerId === null) {
    return res.status(403).json({ error: 'Нямаш достъп до този календар.' });
  }
  const rows = db
    .prepare(
      `SELECT DISTINCT client FROM tasks
       WHERE (
           (@ownerId = @userId AND (user_id = @userId OR shared = 1))
           OR (@ownerId != @userId AND user_id = @ownerId)
         )
         AND client IS NOT NULL AND client != ''
       ORDER BY client COLLATE NOCASE`
    )
    .all({ userId: req.user.id, ownerId });
  res.json(rows.map((r) => r.client));
});

// Tasks with no date at all — the backlog column shown beside every view (day/week/
// month), independent of whatever date range that view currently has loaded. Same
// ?calendar=<ownerId> support and ownership condition as GET / above.
router.get('/unscheduled', (req, res) => {
  const ownerId = resolveViewedOwnerId(req);
  if (ownerId === null) {
    return res.status(403).json({ error: 'Нямаш достъп до този календар.' });
  }

  const rows = db
    .prepare(
      `SELECT id, user_id, title, notes, date, time, status, shared, color,
              client, post_type, platform, priority, image_path, series_id,
              approval_status, reminder_sent, created_at, updated_at,
              ${REDACTED_EMAIL_COLUMNS}
       FROM tasks
       WHERE (
           (@ownerId = @userId AND (user_id = @userId OR shared = 1))
           OR (@ownerId != @userId AND user_id = @ownerId)
         )
         AND date IS NULL
       ORDER BY created_at DESC`
    )
    .all({ userId: req.user.id, ownerId });
  res.json(rows);
});

// Sends a completion email for one already-done row, fire-and-forget — shared by both
// the single-task and the recurring-series create paths below (a directly-API-created
// task, or any occurrence of a freshly-created series, could in principle already be
// 'done'; the normal UI never does this, but a direct API call could).
function sendCompletionEmailIfDone(created, userId) {
  if (!(created.status === 'done' && created.email_on_complete && created.email_to)) return;
  const sender = getEmailSender(userId);
  sendTaskCompletionEmail(created, sender)
    .then((sent) => {
      if (sent) {
        db.prepare('UPDATE tasks SET email_sent = 1 WHERE id = ?').run(created.id);
      } else {
        console.warn('Имейл при завършване прескочен за задача', created.id, '— подателят няма настроен Gmail App Password.');
      }
    })
    .catch((err) => {
      console.error('Имейл при завършване — грешка за задача', created.id, ':', err.message);
    });
}

router.post('/', (req, res) => {
  const { errors, data } = validateTaskInput(req.body || {});

  // `recurrence` (optional) — a client-side-managed series flag would need its own
  // migration path; omitted/null keeps today's exact single-task behavior, so every
  // existing caller is unaffected.
  let recurrence = null;
  if (req.body?.recurrence) {
    recurrence = validateRecurrence(req.body.recurrence, data.date);
    errors.push(...recurrence.errors);
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  if (!recurrence) {
    const result = db
      .prepare(
        `INSERT INTO tasks (
           user_id, title, notes, date, time, status, shared, client, post_type, platform, priority,
           image_path, email_on_complete, email_to, email_subject, email_body
         )
         VALUES (
           @userId, @title, @notes, @date, @time, @status, @shared, @client, @post_type, @platform, @priority,
           @image_path, @email_on_complete, @email_to, @email_subject, @email_body
         )`
      )
      .run({ userId: req.user.id, ...data });

    const created = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
    recordHistory(created.id, req.user.id, req.user.id, 'created', created.title);
    res.status(201).json(created);

    // Fired after the response, not awaited: an SMTP round trip has no business making
    // a task-save request wait on it, and staying synchronous here (no async handler)
    // means a DB error above still hits Express's normal synchronous error handling
    // instead of becoming an unhandled rejection (Express 4 doesn't catch those itself).
    sendCompletionEmailIfDone(created, req.user.id);
    return;
  }

  // Recurring path: one task_series rule row + one tasks row per occurrence date, all
  // sharing series_id. Wrapped in a transaction (same BEGIN/COMMIT/ROLLBACK pattern as
  // db.js's table-rebuild migration) so a mid-loop failure never leaves a partial series.
  const rec = req.body.recurrence;
  let createdRows;
  db.exec('BEGIN');
  try {
    const seriesResult = db
      .prepare(
        `INSERT INTO task_series (user_id, recurrence_type, weekdays, start_date, until_date)
         VALUES (@userId, @type, @weekdays, @startDate, @until)`
      )
      .run({
        userId: req.user.id,
        type: rec.type,
        weekdays: rec.type === 'weekly' ? recurrence.normalizedWeekdays.join(',') : null,
        startDate: data.date,
        until: rec.until,
      });
    const seriesId = seriesResult.lastInsertRowid;

    const insertStmt = db.prepare(
      `INSERT INTO tasks (
         user_id, title, notes, date, time, status, shared, client, post_type, platform, priority,
         image_path, email_on_complete, email_to, email_subject, email_body, series_id
       )
       VALUES (
         @userId, @title, @notes, @date, @time, @status, @shared, @client, @post_type, @platform, @priority,
         @image_path, @email_on_complete, @email_to, @email_subject, @email_body, @seriesId
       )`
    );
    const insertedIds = recurrence.occurrenceDates.map(
      (occDate) => insertStmt.run({ userId: req.user.id, ...data, date: occDate, seriesId }).lastInsertRowid
    );

    for (const id of insertedIds) {
      recordHistory(id, req.user.id, req.user.id, 'created', data.title);
    }

    createdRows = db
      .prepare(`SELECT * FROM tasks WHERE id IN (${insertedIds.map(() => '?').join(',')}) ORDER BY date ASC`)
      .all(...insertedIds);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  // Same response shape as the non-recurring path (a single task object) — TaskForm.svelte
  // never reads the POST response body, it just refetches the whole list afterwards, so
  // this stays the least-surprising choice for any future caller of createTask().
  res.status(201).json(createdRows[0]);

  for (const created of createdRows) {
    sendCompletionEmailIfDone(created, req.user.id);
  }
});

router.put('/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);

  if (!task) {
    return res.status(404).json({ error: 'Задачата не е намерена.' });
  }
  if (task.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Може да редактираш само собствените си задачи.' });
  }

  const { errors, data } = validateTaskInput(req.body || {}, { partial: true });
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  const merged = { ...task, ...data };
  // Unlike a full create, a partial update may leave email_on_complete/email_to
  // untouched (keeping whatever the task already had) or change only one of them —
  // validateTaskInput can't see that combined picture, so the cross-field check happens
  // here instead, against the final merged record.
  if (merged.email_on_complete && !merged.email_to) {
    return res.status(400).json({ errors: ['email_to е задължителен, ако имейл при завършване е включен.'] });
  }

  const { updated, shouldSendEmail, oldImagePath } = applyTaskUpdate(task, data, req.user.id);
  res.json(updated);

  // The old photo was replaced or cleared — clean it up so uploads don't accumulate
  // forever, unless a duplicated sibling task (or another occurrence of a recurring
  // series) still points at the same file. Fire-and-forget, same as the email send below.
  if (oldImagePath && oldImagePath !== updated.image_path && !imagePathStillReferenced(oldImagePath, task.id)) {
    deleteUploadedFile(oldImagePath);
  }

  // Fired after the response, not awaited — see the identical reasoning in POST above.
  if (shouldSendEmail) {
    const sender = getEmailSender(req.user.id);
    sendTaskCompletionEmail(updated, sender)
      .then((sent) => {
        if (sent) {
          db.prepare('UPDATE tasks SET email_sent = 1 WHERE id = ?').run(task.id);
        } else {
          console.warn('Имейл при завършване прескочен за задача', task.id, '— подателят няма настроен Gmail App Password.');
        }
      })
      .catch((err) => {
        console.error('Имейл при завършване — грешка за задача', task.id, ':', err.message);
      });
  }
});

// "This and all following" / "the entire series" bulk edit. "Just this one" doesn't
// need a dedicated route — it reuses the plain PUT /:id above with series_id: null in
// the body (see validateTaskInput), which both edits and detaches the occurrence from
// the series in one call.
//
// date/status (and series_id itself) are deliberately never read from the body here —
// every occurrence keeps its own generated date (bulk-setting date would collapse every
// target row onto one day), and done-state is strictly per-occurrence. Everything else
// that describes "what the post is" is bulk-appliable.
const SERIES_BULK_FIELDS = [
  'title', 'notes', 'client', 'post_type', 'platform', 'priority', 'time',
  'image_path', 'shared', 'email_on_complete', 'email_to', 'email_subject', 'email_body',
];

router.put('/:id/series', (req, res) => {
  const scope = req.query.scope;
  if (!['following', 'all'].includes(scope)) {
    return res.status(400).json({ error: 'scope трябва да е following или all.' });
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Задачата не е намерена.' });
  if (task.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Може да редактираш само собствените си задачи.' });
  }
  if (!task.series_id) {
    return res.status(400).json({ error: 'Задачата не е част от повтаряща се поредица.' });
  }

  const bulkBody = {};
  for (const field of SERIES_BULK_FIELDS) {
    if (req.body?.[field] !== undefined) bulkBody[field] = req.body[field];
  }
  const { errors, data } = validateTaskInput(bulkBody, { partial: true });
  if (errors.length > 0) return res.status(400).json({ errors });

  // node:sqlite throws if a named param object has a key with no matching placeholder
  // in the SQL text — @anchorDate only appears in the `following` variant, so it's only
  // included in the bound params when that's the active scope.
  const whereClause = scope === 'following' ? 'series_id = @seriesId AND date >= @anchorDate' : 'series_id = @seriesId';
  const targets = db
    .prepare(`SELECT * FROM tasks WHERE ${whereClause}`)
    .all(scope === 'following' ? { seriesId: task.series_id, anchorDate: task.date } : { seriesId: task.series_id });

  // Validate the cross-field email_on_complete/email_to check against EVERY target row
  // before applying anything, so a bulk edit either fully succeeds or fully fails —
  // never partially applies then errors out on row N.
  for (const row of targets) {
    const merged = { ...row, ...data };
    if (merged.email_on_complete && !merged.email_to) {
      return res.status(400).json({ errors: ['email_to е задължителен, ако имейл при завършване е включен.'] });
    }
  }

  const results = [];
  const oldImagePaths = new Set();
  const emailQueue = [];
  db.exec('BEGIN');
  try {
    for (const row of targets) {
      const { updated, shouldSendEmail, oldImagePath } = applyTaskUpdate(row, data, req.user.id);
      results.push(updated);
      if (oldImagePath && oldImagePath !== updated.image_path) oldImagePaths.add(oldImagePath);
      if (shouldSendEmail) emailQueue.push(updated);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  res.json({ updated: results });

  for (const p of oldImagePaths) {
    if (!imagePathStillReferenced(p, -1)) deleteUploadedFile(p);
  }
  for (const row of emailQueue) {
    const sender = getEmailSender(req.user.id);
    sendTaskCompletionEmail(row, sender)
      .then((sent) => {
        if (sent) {
          db.prepare('UPDATE tasks SET email_sent = 1 WHERE id = ?').run(row.id);
        } else {
          console.warn('Имейл при завършване прескочен за задача', row.id, '— подателят няма настроен Gmail App Password.');
        }
      })
      .catch((err) => {
        console.error('Имейл при завършване — грешка за задача', row.id, ':', err.message);
      });
  }
});

router.delete('/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);

  if (!task) {
    return res.status(404).json({ error: 'Задачата не е намерена.' });
  }
  if (task.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Може да триеш само собствените си задачи.' });
  }

  // Unlike task_history (must survive the task), comments are meaningless without it —
  // explicit cleanup since FK cascade isn't actually enforced (no PRAGMA foreign_keys).
  db.prepare('DELETE FROM task_comments WHERE task_id = ?').run(task.id);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
  recordHistory(task.id, task.user_id, req.user.id, 'deleted', task.title);
  res.status(204).send();

  if (task.image_path && !imagePathStillReferenced(task.image_path, task.id)) {
    deleteUploadedFile(task.image_path);
  }
});

// "This and all following" / "the entire series" bulk delete. "Just this one" doesn't
// need a dedicated route — the plain DELETE /:id above already works unchanged, since a
// recurring occurrence is just a tasks row with a non-null series_id.
router.delete('/:id/series', (req, res) => {
  const scope = req.query.scope;
  if (!['following', 'all'].includes(scope)) {
    return res.status(400).json({ error: 'scope трябва да е following или all.' });
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Задачата не е намерена.' });
  if (task.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Може да триеш само собствените си задачи.' });
  }
  if (!task.series_id) {
    return res.status(400).json({ error: 'Задачата не е част от повтаряща се поредица.' });
  }

  const whereClause = scope === 'following' ? 'series_id = @seriesId AND date >= @anchorDate' : 'series_id = @seriesId';
  // Gathered BEFORE deleting — imagePathStillReferenced is checked AFTER the delete
  // below, against post-delete state, using these ids/paths as the candidate set.
  // (See PUT /:id/series's identical comment on why @anchorDate is only bound when used.)
  const targets = db
    .prepare(`SELECT id, title, image_path FROM tasks WHERE ${whereClause}`)
    .all(scope === 'following' ? { seriesId: task.series_id, anchorDate: task.date } : { seriesId: task.series_id });

  const ids = targets.map((t) => t.id);
  db.prepare(`DELETE FROM task_comments WHERE task_id IN (${ids.map(() => '?').join(',')})`).run(...ids);
  db.prepare(`DELETE FROM tasks WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);

  for (const row of targets) {
    recordHistory(row.id, task.user_id, req.user.id, 'deleted', row.title);
  }

  // scope=all removes every occurrence, leaving the rule row meaningless — nothing else
  // in this codebase would ever clean it up otherwise, so delete it here. scope=following
  // may leave earlier occurrences behind (a legitimately "thinned" but still-alive
  // series), which still need series_id to resolve back to a rule, so it must survive.
  if (scope === 'all') {
    db.prepare('DELETE FROM task_series WHERE id = ?').run(task.series_id);
  }

  res.status(204).send();

  // No single "self" id to exclude anymore (the whole batch is already gone) — pass a
  // sentinel that can never match a real row (ids are AUTOINCREMENT, never <= 0), so the
  // exclusion clause is a no-op and this purely checks "does any SURVIVING row still
  // reference this path" (e.g. a manually duplicated task sharing the same photo).
  const distinctPaths = [...new Set(targets.map((t) => t.image_path).filter(Boolean))];
  for (const p of distinctPaths) {
    if (!imagePathStillReferenced(p, -1)) deleteUploadedFile(p);
  }
});

// Audit history for one task — the "История" button in TaskForm.svelte. Requires the
// task to still exist (a deleted task's events are only reachable via the global feed
// below, GET /history, since there's no TaskForm to open a "История" dialog from
// anymore). /:id/history (2 segments) never collides with /history (1 segment) below,
// so registration order between the two doesn't matter.
router.get('/:id/history', (req, res) => {
  const task = db.prepare('SELECT id, user_id, shared, title FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Задачата не е намерена.' });
  }
  if (!canViewTask(req, task)) {
    return res.status(403).json({ error: 'Нямаш достъп до тази задача.' });
  }

  const rows = db
    .prepare(
      `SELECT th.id, th.action, th.task_title, th.changes, th.created_at, u.username AS actor_username
       FROM task_history th JOIN users u ON u.id = th.actor_id
       WHERE th.task_id = ?
       ORDER BY th.id DESC`
    )
    .all(task.id);
  res.json(rows.map((r) => ({ ...r, changes: r.changes ? JSON.parse(r.changes) : null })));
});

// Comment thread on one task — the client share-link review flow (see CommentsDialog.svelte,
// used both from the owner's normal TaskForm and from SharedCalendarPage's read-only one).
// Same visibility rule as /:id/history — owner, any shared=1 viewer, or a calendar_shares
// collaborator can READ the thread.
router.get('/:id/comments', (req, res) => {
  const task = db.prepare('SELECT id, user_id, shared FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Задачата не е намерена.' });
  }
  if (!canViewTask(req, task)) {
    return res.status(403).json({ error: 'Нямаш достъп до тази задача.' });
  }

  const rows = db
    .prepare('SELECT id, author, body, created_at FROM task_comments WHERE task_id = ? ORDER BY id ASC')
    .all(task.id);
  res.json(rows);
});

// Posting a comment from the authed/owner side — unlike reading, only the task's actual
// owner may WRITE here (matches every other mutating route in this file); the client-side
// equivalent is a separate unauthenticated route in publicShare.js, author = 'client'.
router.post('/:id/comments', (req, res) => {
  const task = db.prepare('SELECT id, user_id FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Задачата не е намерена.' });
  }
  if (task.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Може да коментираш само собствените си задачи.' });
  }

  const body = req.body?.body;
  if (typeof body !== 'string' || body.trim().length === 0) {
    return res.status(400).json({ error: 'Коментарът не може да е празен.' });
  }
  if (body.length > MAX_COMMENT_LENGTH) {
    return res.status(400).json({ error: `Коментарът трябва да е до ${MAX_COMMENT_LENGTH} символа.` });
  }

  const result = db
    .prepare('INSERT INTO task_comments (task_id, author, body) VALUES (?, ?, ?)')
    .run(task.id, 'owner', body.trim());
  const created = db.prepare('SELECT id, author, body, created_at FROM task_comments WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// Global "Скорошна активност" feed — every history event across one owner's calendar
// (same ?calendar=<ownerId> + resolveViewedOwnerId scoping as GET / and GET /unscheduled
// above), newest first, keyset-paginated via `before` (a history row id, not a
// timestamp — immune to same-millisecond ties that an offset/timestamp cursor could
// drop or duplicate across pages).
router.get('/history', (req, res) => {
  const ownerId = resolveViewedOwnerId(req);
  if (ownerId === null) {
    return res.status(403).json({ error: 'Нямаш достъп до този календар.' });
  }

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const before = req.query.before ? Number(req.query.before) : null;

  const rows = db
    .prepare(
      `SELECT th.id, th.task_id, th.action, th.task_title, th.changes, th.created_at, u.username AS actor_username
       FROM task_history th JOIN users u ON u.id = th.actor_id
       WHERE th.owner_id = @ownerId AND (@before IS NULL OR th.id < @before)
       ORDER BY th.id DESC
       LIMIT @limit`
    )
    .all({ ownerId, before, limit });
  res.json(rows.map((r) => ({ ...r, changes: r.changes ? JSON.parse(r.changes) : null })));
});

module.exports = router;
