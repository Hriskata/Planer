const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, createUser, tokenFor, api } = require('./helpers');

let token;

before(async () => {
  await startServer();
  token = tokenFor(createUser('taskuser'));
});
after(stopServer);

test('creating a task requires a title', async () => {
  const res = await api('/api/tasks', { method: 'POST', token, body: {} });
  assert.equal(res.status, 400);
});

test('create -> list -> update -> delete a task', async () => {
  const created = await api('/api/tasks', {
    method: 'POST',
    token,
    body: {
      title: 'Reel за Иван',
      client: 'Иван',
      post_type: 'Reel',
      platform: 'Instagram',
      priority: 2,
      date: '2026-09-01',
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.title, 'Reel за Иван');
  assert.equal(created.body.priority, 2);
  assert.equal(created.body.status, 'pending');

  const listed = await api('/api/tasks?date=2026-09-01', { token });
  assert.equal(listed.status, 200);
  assert.ok(listed.body.some((t) => t.id === created.body.id));

  const updated = await api(`/api/tasks/${created.body.id}`, { method: 'PUT', token, body: { status: 'done' } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.status, 'done');

  const deleted = await api(`/api/tasks/${created.body.id}`, { method: 'DELETE', token });
  assert.equal(deleted.status, 204);

  const listedAfterDelete = await api('/api/tasks?date=2026-09-01', { token });
  assert.ok(!listedAfterDelete.body.some((t) => t.id === created.body.id));
});

test('a task with no date is unscheduled and shows up in GET /tasks/unscheduled', async () => {
  const created = await api('/api/tasks', { method: 'POST', token, body: { title: 'Без дата' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.date, null);

  const unscheduled = await api('/api/tasks/unscheduled', { token });
  assert.ok(unscheduled.body.some((t) => t.id === created.body.id));
});

test('date must match YYYY-MM-DD', async () => {
  const res = await api('/api/tasks', { method: 'POST', token, body: { title: 'x', date: '2026/09/01' } });
  assert.equal(res.status, 400);
});

test('priority must be an integer from 1 to 4', async () => {
  const res = await api('/api/tasks', { method: 'POST', token, body: { title: 'x', priority: 9 } });
  assert.equal(res.status, 400);
});

test('email_on_complete requires email_to on create', async () => {
  const res = await api('/api/tasks', { method: 'POST', token, body: { title: 'x', email_on_complete: true } });
  assert.equal(res.status, 400);
});

test('GET /tasks/clients returns distinct client names, sorted', async () => {
  await api('/api/tasks', { method: 'POST', token, body: { title: 'a', client: 'Жоро' } });
  await api('/api/tasks', { method: 'POST', token, body: { title: 'b', client: 'Ани' } });
  await api('/api/tasks', { method: 'POST', token, body: { title: 'c', client: 'Ани' } });

  const res = await api('/api/tasks/clients', { token });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, ['Ани', 'Жоро']);
});

test("a user can't edit or delete someone else's task", async () => {
  const ownerToken = tokenFor(createUser('owner1'));
  const created = await api('/api/tasks', { method: 'POST', token: ownerToken, body: { title: 'private' } });

  const intruderToken = tokenFor(createUser('intruder1'));
  const editAttempt = await api(`/api/tasks/${created.body.id}`, {
    method: 'PUT',
    token: intruderToken,
    body: { title: 'hacked' },
  });
  assert.equal(editAttempt.status, 403);

  const deleteAttempt = await api(`/api/tasks/${created.body.id}`, { method: 'DELETE', token: intruderToken });
  assert.equal(deleteAttempt.status, 403);
});
