const express = require('express');
const db = require('../db');
const { sendTaskCompletionEmail } = require('../email');
const { EMAIL_RE } = require('../validators');

const router = express.Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const VALID_STATUS = ['pending', 'done'];

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

// Resolves "whose calendar is this request actually looking at" — the caller's own
// (the default, no ?calendar= at all) or someone else's, if that owner has granted the
// caller's own email full view access via calendar_shares (see routes/sharing.js).
// Returns null when ?calendar= doesn't resolve to anything the caller may see, so the
// route can 403 instead of silently falling back to "my own calendar" — a typo'd or
// revoked id should never quietly show the wrong (but real) data.
function resolveViewedOwnerId(req) {
  const { calendar } = req.query;
  if (calendar === undefined) return req.user.id;

  const ownerId = Number(calendar);
  if (!Number.isInteger(ownerId)) return null;
  if (ownerId === req.user.id) return ownerId; // viewing "someone else's" own id is just your own calendar

  // requireAuth only verifies the JWT's signature, not that the user row still exists
  // (e.g. a dev DB reset while an old token is still cached in a browser) — `me` can
  // genuinely be undefined here.
  const me = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id);
  if (!me?.email) return null;

  const share = db
    .prepare('SELECT id FROM calendar_shares WHERE owner_id = ? AND shared_email = ?')
    .get(ownerId, me.email);
  return share ? ownerId : null;
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

// The user's own tasks + shared tasks from everyone else — or, with ?calendar=<ownerId>,
// someone else's calendar entirely (see resolveViewedOwnerId).
router.get('/', (req, res) => {
  const { date, from, to } = req.query;

  for (const [name, value] of [['date', date], ['from', from], ['to', to]]) {
    if (value !== undefined && !DATE_RE.test(value)) {
      return res.status(400).json({ error: `${name} трябва да е във формат YYYY-MM-DD.` });
    }
  }

  const ownerId = resolveViewedOwnerId(req);
  if (ownerId === null) {
    return res.status(403).json({ error: 'Нямаш достъп до този календар.' });
  }

  // @date/@from/@to are always present in the query (instead of being conditionally
  // spliced into the text), because node:sqlite throws if a named parameter is passed
  // that's missing from the SQL text. `date` is an exact match (day view); `from`/`to`
  // is an inclusive range (week/month views) — both can be combined, though in practice
  // the frontend only ever sends one or the other.
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
           client, post_type, platform, priority, image_path, created_at, updated_at,
           ${REDACTED_EMAIL_COLUMNS}
    FROM tasks
    WHERE (
        (@ownerId = @userId AND (user_id = @userId OR shared = 1))
        OR (@ownerId != @userId AND user_id = @ownerId)
      )
      AND (@date IS NULL OR date = @date)
      AND (@from IS NULL OR date >= @from)
      AND (@to IS NULL OR date <= @to)
    ORDER BY date ASC, time IS NULL, time ASC
  `;

  const rows = db.prepare(baseQuery).all({
    userId: req.user.id,
    ownerId,
    date: date ?? null,
    from: from ?? null,
    to: to ?? null,
  });
  res.json(rows);
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
              client, post_type, platform, priority, image_path, reminder_sent, created_at, updated_at,
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

router.post('/', (req, res) => {
  const { errors, data } = validateTaskInput(req.body || {});
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

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
  res.status(201).json(created);

  // Rare (the UI always creates tasks as pending), but a direct API call could create
  // one already marked done — treat that the same as any other completion. Fired after
  // the response, not awaited: an SMTP round trip has no business making a task-save
  // request wait on it, and staying synchronous here (no async handler) means a DB
  // error above still hits Express's normal synchronous error handling instead of
  // becoming an unhandled rejection (Express 4 doesn't catch those on its own).
  if (created.status === 'done' && created.email_on_complete && created.email_to) {
    const sender = getEmailSender(req.user.id);
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

  // Rescheduling (a new date and/or time) means any already-sent 10-min-before
  // reminder was for the old moment — reset it so the new one still gets a reminder.
  const rescheduled =
    ('date' in data && data.date !== task.date) || ('time' in data && data.time !== task.time);
  const reminderSent = rescheduled ? 0 : task.reminder_sent;

  const becameUndone = task.status === 'done' && merged.status !== 'done';
  // Un-completing resets the flag so a later re-completion sends again; completing
  // sends (see below) and is recorded once that actually succeeds — a failed send
  // (bad address, SMTP down) leaves it at 0 so the NEXT completion can retry, rather
  // than silently marking a mail that never went out as sent.
  let emailSent = becameUndone ? 0 : task.email_sent;
  // Not just "did status change to done in THIS request" — also covers turning email
  // on complete on (or filling in email_to) while the task was already sitting done,
  // which used to never send until the task got toggled off and on again. The guard is
  // "still hasn't been sent for the current done streak" (task.email_sent, the
  // pre-update value), not becameUndone/emailSent above.
  const shouldSendEmail = merged.status === 'done' && merged.email_on_complete && merged.email_to && !task.email_sent;

  // We pass only exactly the keys that appear in the SQL text — node:sqlite throws
  // on a named parameter in the object that has no matching placeholder.
  db.prepare(
    `UPDATE tasks SET title = @title, notes = @notes, date = @date, time = @time,
       status = @status, shared = @shared, client = @client,
       post_type = @post_type, platform = @platform, priority = @priority, image_path = @image_path,
       email_on_complete = @email_on_complete, email_to = @email_to,
       email_subject = @email_subject, email_body = @email_body, email_sent = @emailSent,
       reminder_sent = @reminderSent, updated_at = datetime('now')
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
    id: task.id,
  });

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
  res.json(updated);

  // Fired after the response, not awaited — see the identical reasoning in POST above.
  if (shouldSendEmail) {
    const sender = getEmailSender(req.user.id);
    sendTaskCompletionEmail(merged, sender)
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

router.delete('/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);

  if (!task) {
    return res.status(404).json({ error: 'Задачата не е намерена.' });
  }
  if (task.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Може да триеш само собствените си задачи.' });
  }

  db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
  res.status(204).send();
});

module.exports = router;
