const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, createUser, tokenFor, shareCalendar, setEmail, api, db } = require('./helpers');

before(startServer);
after(stopServer);

function basicTask(overrides = {}) {
  return { title: 'Пост', client: 'Иван', date: '2026-09-01', ...overrides };
}

test('creating a task records a single "created" entry', async () => {
  const user = createUser('histuser1');
  const token = tokenFor(user);
  const created = await api('/api/tasks', { method: 'POST', token, body: basicTask({ title: 'Първи пост' }) });
  assert.equal(created.status, 201);

  const history = await api(`/api/tasks/${created.body.id}/history`, { token });
  assert.equal(history.status, 200);
  assert.equal(history.body.length, 1);
  assert.equal(history.body[0].action, 'created');
  assert.equal(history.body[0].task_title, 'Първи пост');
  assert.equal(history.body[0].actor_username, 'histuser1');
  assert.equal(history.body[0].changes, null);
});

test('creating a recurring series records one "created" entry per occurrence', async () => {
  const token = tokenFor(createUser('histuser2'));
  const created = await api('/api/tasks', {
    method: 'POST',
    token,
    body: basicTask({ recurrence: { type: 'daily', until: '2026-09-03' } }),
  });
  assert.equal(created.status, 201);

  const list = await api('/api/tasks?from=2026-09-01&to=2026-09-03', { token });
  assert.equal(list.body.length, 3);

  for (const task of list.body) {
    const history = await api(`/api/tasks/${task.id}/history`, { token });
    assert.equal(history.body.length, 1);
    assert.equal(history.body[0].action, 'created');
  }
});

test('editing a task records an "updated" entry with only the actually-changed fields', async () => {
  const token = tokenFor(createUser('histuser3'));
  const created = await api('/api/tasks', { method: 'POST', token, body: basicTask({ title: 'Стар', notes: 'a' }) });

  const edited = await api(`/api/tasks/${created.body.id}`, {
    method: 'PUT',
    token,
    body: { title: 'Нов', notes: 'a' }, // notes unchanged, title changed
  });
  assert.equal(edited.status, 200);

  const history = await api(`/api/tasks/${created.body.id}/history`, { token });
  assert.equal(history.body.length, 2);
  assert.equal(history.body[0].action, 'updated'); // newest first
  assert.equal(history.body[0].task_title, 'Нов');
  assert.deepEqual(history.body[0].changes, [{ field: 'title', old: 'Стар', new: 'Нов' }]);
});

test('a no-op save (identical values) records nothing new', async () => {
  const token = tokenFor(createUser('histuser4'));
  const created = await api('/api/tasks', { method: 'POST', token, body: basicTask({ title: 'Без промяна' }) });

  const saved = await api(`/api/tasks/${created.body.id}`, { method: 'PUT', token, body: { title: 'Без промяна' } });
  assert.equal(saved.status, 200);

  const history = await api(`/api/tasks/${created.body.id}/history`, { token });
  assert.equal(history.body.length, 1); // just the original "created" entry
});

test('bulk edit ("тази и следващите"/"всички") records one "updated" entry per affected row', async () => {
  const token = tokenFor(createUser('histuser5'));
  const created = await api('/api/tasks', {
    method: 'POST',
    token,
    body: basicTask({ title: 'Серия', recurrence: { type: 'daily', until: '2026-09-03' } }),
  });
  const list = await api('/api/tasks?from=2026-09-01&to=2026-09-03', { token });
  const anchor = list.body.find((t) => t.date === '2026-09-01');

  const bulk = await api(`/api/tasks/${anchor.id}/series?scope=all`, {
    method: 'PUT',
    token,
    body: { title: 'Преименувана серия' },
  });
  assert.equal(bulk.status, 200);
  assert.equal(bulk.body.updated.length, 3);

  for (const task of list.body) {
    const history = await api(`/api/tasks/${task.id}/history`, { token });
    assert.equal(history.body.length, 2);
    assert.equal(history.body[0].action, 'updated');
    assert.deepEqual(history.body[0].changes, [{ field: 'title', old: 'Серия', new: 'Преименувана серия' }]);
  }
});

test('detaching a single occurrence ("само тази") records the series pseudo-field', async () => {
  const token = tokenFor(createUser('histuser6'));
  const created = await api('/api/tasks', {
    method: 'POST',
    token,
    body: basicTask({ recurrence: { type: 'daily', until: '2026-09-02' } }),
  });
  const list = await api('/api/tasks?from=2026-09-01&to=2026-09-02', { token });
  const one = list.body[0];

  const detached = await api(`/api/tasks/${one.id}`, { method: 'PUT', token, body: { series_id: null } });
  assert.equal(detached.status, 200);

  const history = await api(`/api/tasks/${one.id}/history`, { token });
  assert.equal(history.body[0].action, 'updated');
  assert.deepEqual(history.body[0].changes, [{ field: 'series', old: 'series', new: 'standalone' }]);
});

test('deleting a task records a "deleted" entry that survives the task row itself', async () => {
  const token = tokenFor(createUser('histuser7'));
  const created = await api('/api/tasks', { method: 'POST', token, body: basicTask({ title: 'За триене' }) });

  const del = await api(`/api/tasks/${created.body.id}`, { method: 'DELETE', token });
  assert.equal(del.status, 204);

  // The task itself is gone — GET /:id/history now 404s (matches TaskForm reachability:
  // "История" only opens from an existing task) — so verify directly against the table.
  const rows = db.prepare('SELECT * FROM task_history WHERE task_id = ? ORDER BY id').all(created.body.id);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].action, 'created');
  assert.equal(rows[1].action, 'deleted');
  assert.equal(rows[1].task_title, 'За триене');

  const history = await api(`/api/tasks/${created.body.id}/history`, { token });
  assert.equal(history.status, 404);
});

test('bulk delete ("следващите"/"всички") records one "deleted" entry per removed row', async () => {
  const token = tokenFor(createUser('histuser8'));
  const created = await api('/api/tasks', {
    method: 'POST',
    token,
    body: basicTask({ title: 'Серия за триене', recurrence: { type: 'daily', until: '2026-09-03' } }),
  });
  const list = await api('/api/tasks?from=2026-09-01&to=2026-09-03', { token });
  const anchor = list.body.find((t) => t.date === '2026-09-01');

  const del = await api(`/api/tasks/${anchor.id}/series?scope=all`, { method: 'DELETE', token });
  assert.equal(del.status, 204);

  for (const task of list.body) {
    const rows = db.prepare('SELECT * FROM task_history WHERE task_id = ? ORDER BY id').all(task.id);
    assert.equal(rows.length, 2);
    assert.equal(rows[1].action, 'deleted');
    assert.equal(rows[1].task_title, 'Серия за триене');
  }
});

test('GET /:id/history: 404 for an unknown task, 403 for someone else\'s private task', async () => {
  const owner = createUser('histuser9');
  const other = createUser('histuser10');
  const ownerToken = tokenFor(owner);
  const otherToken = tokenFor(other);

  const missing = await api('/api/tasks/999999/history', { token: ownerToken });
  assert.equal(missing.status, 404);

  const created = await api('/api/tasks', { method: 'POST', token: ownerToken, body: basicTask() });
  const forbidden = await api(`/api/tasks/${created.body.id}/history`, { token: otherToken });
  assert.equal(forbidden.status, 403);
});

test('GET /:id/history: visible for a shared=1 task to any user, and to a calendar_shares collaborator', async () => {
  const owner = createUser('histuser11');
  const stranger = createUser('histuser12');
  const collaborator = createUser('histuser13');
  const ownerToken = tokenFor(owner);

  const sharedTask = await api('/api/tasks', { method: 'POST', token: ownerToken, body: basicTask({ shared: true }) });
  const strangerView = await api(`/api/tasks/${sharedTask.body.id}/history`, { token: tokenFor(stranger) });
  assert.equal(strangerView.status, 200);

  const privateTask = await api('/api/tasks', { method: 'POST', token: ownerToken, body: basicTask() });
  setEmail(collaborator.id, 'collab@example.com');
  shareCalendar(owner.id, 'collab@example.com');
  const collabView = await api(`/api/tasks/${privateTask.body.id}/history`, { token: tokenFor(collaborator) });
  assert.equal(collabView.status, 200);
});

test('GET /api/tasks/history: scoped by owner, keyset-paginated via before, capped at 200', async () => {
  const owner = createUser('histuser14');
  const other = createUser('histuser15');
  const ownerToken = tokenFor(owner);

  for (let i = 0; i < 5; i += 1) {
    await api('/api/tasks', { method: 'POST', token: ownerToken, body: basicTask({ title: `Пост ${i}` }) });
  }

  const feed = await api('/api/tasks/history', { token: ownerToken });
  assert.equal(feed.status, 200);
  assert.equal(feed.body.length, 5);
  assert.ok(feed.body.every((r, i) => i === 0 || r.id < feed.body[i - 1].id)); // newest first

  const firstPage = await api('/api/tasks/history?limit=2', { token: ownerToken });
  assert.equal(firstPage.body.length, 2);
  const secondPage = await api(`/api/tasks/history?limit=2&before=${firstPage.body[1].id}`, { token: ownerToken });
  assert.equal(secondPage.body.length, 2);
  assert.ok(secondPage.body[0].id < firstPage.body[1].id);

  const capped = await api('/api/tasks/history?limit=99999', { token: ownerToken });
  assert.equal(capped.status, 200); // limit silently clamps to 200, doesn't error

  // A random other user's own (empty) calendar sees nothing from `owner`'s feed.
  const otherFeed = await api('/api/tasks/history', { token: tokenFor(other) });
  assert.equal(otherFeed.body.length, 0);

  const otherViewingOwner = await api(`/api/tasks/history?calendar=${owner.id}`, { token: tokenFor(other) });
  assert.equal(otherViewingOwner.status, 403); // no calendar_shares grant
});
