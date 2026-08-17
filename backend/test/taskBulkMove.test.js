const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, createUser, tokenFor, api } = require('./helpers');

before(startServer);
after(stopServer);

function basicTask(overrides = {}) {
  return { title: 'Пост', client: 'Иван', date: '2026-09-01', ...overrides };
}

test('bulk-moves several owned tasks by a positive day offset and records history for each', async () => {
  const token = tokenFor(createUser('bulkmove1'));
  const a = await api('/api/tasks', { method: 'POST', token, body: basicTask({ title: 'A', date: '2026-09-01' }) });
  const b = await api('/api/tasks', { method: 'POST', token, body: basicTask({ title: 'B', date: '2026-09-05' }) });

  const res = await api('/api/tasks/bulk-move', {
    method: 'PUT',
    token,
    body: { ids: [a.body.id, b.body.id], offsetDays: 3 },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.updated.length, 2);

  const aAfter = await api(`/api/tasks?from=2026-09-01&to=2026-09-10`, { token });
  const updatedA = aAfter.body.find((t) => t.id === a.body.id);
  const updatedB = aAfter.body.find((t) => t.id === b.body.id);
  assert.equal(updatedA.date, '2026-09-04');
  assert.equal(updatedB.date, '2026-09-08');

  for (const id of [a.body.id, b.body.id]) {
    const history = await api(`/api/tasks/${id}/history`, { token });
    assert.equal(history.body[0].action, 'updated');
    assert.equal(history.body[0].changes[0].field, 'date');
  }
});

test('bulk-moves by a negative offset (backward)', async () => {
  const token = tokenFor(createUser('bulkmove2'));
  const a = await api('/api/tasks', { method: 'POST', token, body: basicTask({ date: '2026-10-10' }) });

  const res = await api('/api/tasks/bulk-move', { method: 'PUT', token, body: { ids: [a.body.id], offsetDays: -5 } });
  assert.equal(res.status, 200);
  assert.equal(res.body.updated[0].date, '2026-10-05');
});

test('rejects the whole batch (403) when one id belongs to another user, nothing is moved', async () => {
  const token1 = tokenFor(createUser('bulkmove3'));
  const token2 = tokenFor(createUser('bulkmove4'));
  const mine = await api('/api/tasks', { method: 'POST', token: token1, body: basicTask({ date: '2026-09-01' }) });
  const theirs = await api('/api/tasks', { method: 'POST', token: token2, body: basicTask({ date: '2026-09-01' }) });

  const res = await api('/api/tasks/bulk-move', {
    method: 'PUT',
    token: token1,
    body: { ids: [mine.body.id, theirs.body.id], offsetDays: 2 },
  });
  assert.equal(res.status, 403);

  const check = await api(`/api/tasks?date=2026-09-01`, { token: token1 });
  const unchanged = check.body.find((t) => t.id === mine.body.id);
  assert.equal(unchanged.date, '2026-09-01'); // untouched — all-or-nothing
});

test('404s when an id does not exist at all', async () => {
  const token = tokenFor(createUser('bulkmove5'));
  const res = await api('/api/tasks/bulk-move', { method: 'PUT', token, body: { ids: [999999], offsetDays: 1 } });
  assert.equal(res.status, 404);
});

test('validates ids and offsetDays', async () => {
  const token = tokenFor(createUser('bulkmove6'));
  const a = await api('/api/tasks', { method: 'POST', token, body: basicTask() });

  assert.equal((await api('/api/tasks/bulk-move', { method: 'PUT', token, body: { ids: [], offsetDays: 1 } })).status, 400);
  assert.equal(
    (await api('/api/tasks/bulk-move', { method: 'PUT', token, body: { ids: [a.body.id], offsetDays: 0 } })).status,
    400
  );
  assert.equal(
    (await api('/api/tasks/bulk-move', { method: 'PUT', token, body: { ids: [a.body.id], offsetDays: 1.5 } })).status,
    400
  );
  assert.equal(
    (await api('/api/tasks/bulk-move', { method: 'PUT', token, body: { ids: [a.body.id], offsetDays: 99999 } })).status,
    400
  );
  const tooMany = Array.from({ length: 201 }, (_, i) => i + 1);
  assert.equal(
    (await api('/api/tasks/bulk-move', { method: 'PUT', token, body: { ids: tooMany, offsetDays: 1 } })).status,
    400
  );
});

test('silently skips an unscheduled task in the batch while still moving the rest', async () => {
  const token = tokenFor(createUser('bulkmove7'));
  const scheduled = await api('/api/tasks', { method: 'POST', token, body: basicTask({ date: '2026-11-01' }) });
  const unscheduled = await api('/api/tasks', {
    method: 'POST',
    token,
    body: { title: 'Без дата', client: 'Иван' },
  });
  assert.equal(unscheduled.body.date, null);

  const res = await api('/api/tasks/bulk-move', {
    method: 'PUT',
    token,
    body: { ids: [scheduled.body.id, unscheduled.body.id], offsetDays: 2 },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.updated.length, 1);
  assert.equal(res.body.updated[0].id, scheduled.body.id);
  assert.equal(res.body.updated[0].date, '2026-11-03');
});
