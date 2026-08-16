const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, createUser, tokenFor, shareCalendar, setEmail, api, db } = require('./helpers');

before(startServer);
after(stopServer);

async function createTask(token, overrides = {}) {
  return api('/api/tasks', {
    method: 'POST',
    token,
    body: { title: 'Пост', client: 'Иван', date: '2026-09-01', ...overrides },
  });
}

async function createLink(token, client) {
  return api('/api/share-links', { method: 'POST', token, body: { client } });
}

// ---- authed (owner) side ----

test('owner can post and read comments on their own task', async () => {
  const token = tokenFor(createUser('commentowner1'));
  const created = await createTask(token);

  const posted = await api(`/api/tasks/${created.body.id}/comments`, { method: 'POST', token, body: { body: 'Здравей' } });
  assert.equal(posted.status, 201);
  assert.equal(posted.body.author, 'owner');
  assert.equal(posted.body.body, 'Здравей');

  const list = await api(`/api/tasks/${created.body.id}/comments`, { token });
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].author, 'owner');
});

test('comments come back oldest-first', async () => {
  const token = tokenFor(createUser('commentowner2'));
  const created = await createTask(token);
  await api(`/api/tasks/${created.body.id}/comments`, { method: 'POST', token, body: { body: 'Първи' } });
  await api(`/api/tasks/${created.body.id}/comments`, { method: 'POST', token, body: { body: 'Втори' } });

  const list = await api(`/api/tasks/${created.body.id}/comments`, { token });
  assert.deepEqual(list.body.map((c) => c.body), ['Първи', 'Втори']);
});

test('a stranger cannot post a comment, but a shared=1 task is readable by anyone', async () => {
  const owner = createUser('commentowner3');
  const stranger = createUser('commentstranger3');
  const ownerToken = tokenFor(owner);
  const created = await createTask(ownerToken, { shared: true });

  const forbidden = await api(`/api/tasks/${created.body.id}/comments`, {
    method: 'POST',
    token: tokenFor(stranger),
    body: { body: 'опит' },
  });
  assert.equal(forbidden.status, 403);

  const readable = await api(`/api/tasks/${created.body.id}/comments`, { token: tokenFor(stranger) });
  assert.equal(readable.status, 200);
});

test('a calendar_shares collaborator can read comments on a private task', async () => {
  const owner = createUser('commentowner4');
  const collaborator = createUser('commentcollab4');
  const ownerToken = tokenFor(owner);
  const created = await createTask(ownerToken);

  setEmail(collaborator.id, 'collab4@example.com');
  shareCalendar(owner.id, 'collab4@example.com');

  const res = await api(`/api/tasks/${created.body.id}/comments`, { token: tokenFor(collaborator) });
  assert.equal(res.status, 200);
});

test('empty or oversized comment bodies are rejected', async () => {
  const token = tokenFor(createUser('commentowner5'));
  const created = await createTask(token);

  const empty = await api(`/api/tasks/${created.body.id}/comments`, { method: 'POST', token, body: { body: '   ' } });
  assert.equal(empty.status, 400);

  const oversized = await api(`/api/tasks/${created.body.id}/comments`, {
    method: 'POST',
    token,
    body: { body: 'x'.repeat(2001) },
  });
  assert.equal(oversized.status, 400);
});

test('owner-initiated approval_status change goes through PUT /:id and shows up in task_history', async () => {
  const token = tokenFor(createUser('commentowner6'));
  const created = await createTask(token);

  const updated = await api(`/api/tasks/${created.body.id}`, { method: 'PUT', token, body: { approval_status: 'approved' } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.approval_status, 'approved');
  assert.equal(updated.body.approval_status_set_by, 'owner');

  const history = await api(`/api/tasks/${created.body.id}/history`, { token });
  assert.equal(history.body[0].action, 'updated');
  assert.deepEqual(history.body[0].changes, [{ field: 'approval_status', old: null, new: 'approved' }]);
});

test('an invalid approval_status value is rejected by PUT /:id', async () => {
  const token = tokenFor(createUser('commentowner7'));
  const created = await createTask(token);
  const res = await api(`/api/tasks/${created.body.id}`, { method: 'PUT', token, body: { approval_status: 'bogus' } });
  assert.equal(res.status, 400);
});

test('comments and deletion cleanup: DELETE /:id removes task_comments too', async () => {
  const token = tokenFor(createUser('commentowner8'));
  const created = await createTask(token);
  await api(`/api/tasks/${created.body.id}/comments`, { method: 'POST', token, body: { body: 'ще изчезне' } });

  const del = await api(`/api/tasks/${created.body.id}`, { method: 'DELETE', token });
  assert.equal(del.status, 204);

  const rows = db.prepare('SELECT * FROM task_comments WHERE task_id = ?').all(created.body.id);
  assert.equal(rows.length, 0);
});

test('bulk series delete cleans up comments for every removed occurrence', async () => {
  const token = tokenFor(createUser('commentowner9'));
  // Own date range (not 2026-09-01, which other tests in this file also use with
  // shared=1 — a shared=1 task from a DIFFERENT owner would otherwise show up in this
  // user's own-calendar list too and collide with the .find() below).
  await createTask(token, { client: 'Серия9', date: '2026-10-01', recurrence: { type: 'daily', until: '2026-10-03' } });
  const list = await api('/api/tasks?from=2026-10-01&to=2026-10-03&client=Серия9', { token });
  const anchor = list.body.find((t) => t.date === '2026-10-01');

  for (const task of list.body) {
    await api(`/api/tasks/${task.id}/comments`, { method: 'POST', token, body: { body: 'коментар' } });
  }

  const del = await api(`/api/tasks/${anchor.id}/series?scope=all`, { method: 'DELETE', token });
  assert.equal(del.status, 204);

  for (const task of list.body) {
    const rows = db.prepare('SELECT * FROM task_comments WHERE task_id = ?').all(task.id);
    assert.equal(rows.length, 0);
  }
});

// ---- public (client, unauthenticated) side ----

test('a client with a valid link can read and post comments, and change approval status', async () => {
  const ownerToken = tokenFor(createUser('commentpubowner1'));
  const created = await createTask(ownerToken, { client: 'Клиент1' });
  const link = await createLink(ownerToken, 'Клиент1');

  const posted = await api(`/api/public-share/${link.body.token}/tasks/${created.body.id}/comments`, {
    method: 'POST',
    body: { body: 'От клиента' },
  });
  assert.equal(posted.status, 201);
  assert.equal(posted.body.author, 'client');

  const list = await api(`/api/public-share/${link.body.token}/tasks/${created.body.id}/comments`);
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].author, 'client');

  const status = await api(`/api/public-share/${link.body.token}/tasks/${created.body.id}/approval-status`, {
    method: 'PUT',
    body: { status: 'changes_requested' },
  });
  assert.equal(status.status, 200);
  assert.equal(status.body.approval_status, 'changes_requested');
  assert.equal(status.body.approval_status_set_by, 'client');

  // Owner's regular fetch reflects it too.
  const ownerView = await api(`/api/tasks/${created.body.id}`, { method: 'PUT', token: ownerToken, body: {} });
  assert.equal(ownerView.body.approval_status, 'changes_requested');
});

test('client-initiated approval status change does NOT appear in task_history (no authed actor)', async () => {
  const ownerToken = tokenFor(createUser('commentpubowner2'));
  const created = await createTask(ownerToken, { client: 'Клиент2' });
  const link = await createLink(ownerToken, 'Клиент2');

  await api(`/api/public-share/${link.body.token}/tasks/${created.body.id}/approval-status`, {
    method: 'PUT',
    body: { status: 'approved' },
  });

  const history = await api(`/api/tasks/${created.body.id}/history`, { token: ownerToken });
  assert.equal(history.body.length, 1); // just the original "created" entry
  assert.equal(history.body[0].action, 'created');
});

test('public comment/status routes 404 identically for an unknown token, a revoked token, and a task outside the link scope', async () => {
  const ownerToken = tokenFor(createUser('commentpubowner3'));
  const created = await createTask(ownerToken, { client: 'Клиент3' });
  const otherClientTask = await createTask(ownerToken, { client: 'ДругКлиент3' });
  const link = await createLink(ownerToken, 'Клиент3');

  const unknown = await api(`/api/public-share/not-a-real-token/tasks/${created.body.id}/comments`);
  assert.equal(unknown.status, 404);

  await api(`/api/share-links/${link.body.id}`, { method: 'DELETE', token: ownerToken });
  const revoked = await api(`/api/public-share/${link.body.token}/tasks/${created.body.id}/comments`);
  assert.equal(revoked.status, 404);
  assert.deepEqual(revoked.body, unknown.body);

  const freshLink = await createLink(ownerToken, 'Клиент3');
  const wrongScope = await api(`/api/public-share/${freshLink.body.token}/tasks/${otherClientTask.body.id}/comments`);
  assert.equal(wrongScope.status, 404);
  assert.deepEqual(wrongScope.body, unknown.body);
});

test('public comment validation: empty body and invalid status are rejected', async () => {
  const ownerToken = tokenFor(createUser('commentpubowner4'));
  const created = await createTask(ownerToken, { client: 'Клиент4' });
  const link = await createLink(ownerToken, 'Клиент4');

  const emptyComment = await api(`/api/public-share/${link.body.token}/tasks/${created.body.id}/comments`, {
    method: 'POST',
    body: { body: '' },
  });
  assert.equal(emptyComment.status, 400);

  const badStatus = await api(`/api/public-share/${link.body.token}/tasks/${created.body.id}/approval-status`, {
    method: 'PUT',
    body: { status: 'bogus' },
  });
  assert.equal(badStatus.status, 400);
});

test('GET /:token/tasks includes approval_status', async () => {
  const ownerToken = tokenFor(createUser('commentpubowner5'));
  const created = await createTask(ownerToken, { client: 'Клиент5' });
  await api(`/api/tasks/${created.body.id}`, { method: 'PUT', token: ownerToken, body: { approval_status: 'approved' } });
  const link = await createLink(ownerToken, 'Клиент5');

  const list = await api(`/api/public-share/${link.body.token}/tasks`);
  assert.equal(list.body[0].approval_status, 'approved');
});
