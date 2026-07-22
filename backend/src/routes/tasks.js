const express = require('express');
const db = require('../db');

const router = express.Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const VALID_STATUS = ['pending', 'done'];

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

  // client, post_type, image_path: simple optional text fields, same shape as notes.
  for (const field of ['client', 'post_type', 'image_path']) {
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

  return { errors, data };
}

// The user's own tasks + shared tasks from everyone else.
router.get('/', (req, res) => {
  const { date, from, to } = req.query;

  for (const [name, value] of [['date', date], ['from', from], ['to', to]]) {
    if (value !== undefined && !DATE_RE.test(value)) {
      return res.status(400).json({ error: `${name} трябва да е във формат YYYY-MM-DD.` });
    }
  }

  // @date/@from/@to are always present in the query (instead of being conditionally
  // spliced into the text), because node:sqlite throws if a named parameter is passed
  // that's missing from the SQL text. `date` is an exact match (day view); `from`/`to`
  // is an inclusive range (week/month views) — both can be combined, though in practice
  // the frontend only ever sends one or the other.
  const baseQuery = `
    SELECT id, user_id, title, notes, date, time, status, shared, color,
           client, post_type, image_path, created_at, updated_at
    FROM tasks
    WHERE (user_id = @userId OR shared = 1)
      AND (@date IS NULL OR date = @date)
      AND (@from IS NULL OR date >= @from)
      AND (@to IS NULL OR date <= @to)
    ORDER BY date ASC, time IS NULL, time ASC
  `;

  const rows = db.prepare(baseQuery).all({
    userId: req.user.id,
    date: date ?? null,
    from: from ?? null,
    to: to ?? null,
  });
  res.json(rows);
});

// Tasks with no date at all — the backlog column shown beside every view (day/week/
// month), independent of whatever date range that view currently has loaded.
router.get('/unscheduled', (req, res) => {
  const rows = db
    .prepare(
      `SELECT * FROM tasks
       WHERE (user_id = @userId OR shared = 1) AND date IS NULL
       ORDER BY created_at DESC`
    )
    .all({ userId: req.user.id });
  res.json(rows);
});

router.post('/', (req, res) => {
  const { errors, data } = validateTaskInput(req.body || {});
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  const result = db
    .prepare(
      `INSERT INTO tasks (user_id, title, notes, date, time, status, shared, client, post_type, image_path)
       VALUES (@userId, @title, @notes, @date, @time, @status, @shared, @client, @post_type, @image_path)`
    )
    .run({ userId: req.user.id, ...data });

  const created = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
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
  // Rescheduling (a new date and/or time) means any already-sent 10-min-before
  // reminder was for the old moment — reset it so the new one still gets a reminder.
  const rescheduled =
    ('date' in data && data.date !== task.date) || ('time' in data && data.time !== task.time);
  const reminderSent = rescheduled ? 0 : task.reminder_sent;

  // We pass only exactly the keys that appear in the SQL text — node:sqlite throws
  // on a named parameter in the object that has no matching placeholder.
  db.prepare(
    `UPDATE tasks SET title = @title, notes = @notes, date = @date, time = @time,
       status = @status, shared = @shared, client = @client,
       post_type = @post_type, image_path = @image_path, reminder_sent = @reminderSent,
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
    image_path: merged.image_path,
    reminderSent,
    id: task.id,
  });

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
  res.json(updated);
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
