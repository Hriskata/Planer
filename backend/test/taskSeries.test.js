const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startServer, stopServer, createUser, tokenFor, api, UPLOADS_DIR } = require('./helpers');

before(startServer);
after(stopServer);

function daily(date, until, overrides = {}) {
  return { title: 'Пост', client: 'Иван', date, recurrence: { type: 'daily', until }, ...overrides };
}
function weekly(date, weekdays, until, overrides = {}) {
  return { title: 'Пост', client: 'Иван', date, recurrence: { type: 'weekly', weekdays, until }, ...overrides };
}
function monthly(date, until, overrides = {}) {
  return { title: 'Пост', client: 'Иван', date, recurrence: { type: 'monthly', until }, ...overrides };
}

test('daily series creates one row per day, all sharing series_id', async () => {
  const token = tokenFor(createUser('seriesuser1'));
  const created = await api('/api/tasks', { method: 'POST', token, body: daily('2026-09-01', '2026-09-05') });
  assert.equal(created.status, 201);
  assert.ok(created.body.series_id);

  const list = await api('/api/tasks?from=2026-09-01&to=2026-09-05', { token });
  assert.equal(list.body.length, 5);
  const dates = list.body.map((t) => t.date).sort();
  assert.deepEqual(dates, ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']);
  assert.ok(list.body.every((t) => t.series_id === created.body.series_id));
});

test('weekly series only lands on the chosen weekdays', async () => {
  // 2026-09-01 is a Tuesday.
  const token = tokenFor(createUser('seriesuser2'));
  const created = await api('/api/tasks', { method: 'POST', token, body: weekly('2026-09-01', [2, 4], '2026-09-14') });
  assert.equal(created.status, 201);

  const list = await api('/api/tasks?from=2026-09-01&to=2026-09-14', { token });
  const dates = list.body.map((t) => t.date).sort();
  assert.deepEqual(dates, ['2026-09-01', '2026-09-03', '2026-09-08', '2026-09-10', '2026-09-15'].filter((d) => d <= '2026-09-14'));
});

test('monthly series clamps day-of-month from the original anchor, not the previous occurrence', async () => {
  const token = tokenFor(createUser('seriesuser3'));
  const created = await api('/api/tasks', { method: 'POST', token, body: monthly('2026-01-31', '2026-04-30') });
  assert.equal(created.status, 201);

  const list = await api('/api/tasks?from=2026-01-01&to=2026-04-30', { token });
  const dates = list.body.map((t) => t.date).sort();
  // Jan 31 -> Feb 28 (clamped) -> Mar 31 (recovers, NOT Mar 28) -> Apr 30 (clamped)
  assert.deepEqual(dates, ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
});

test('a series spanning more than 366 occurrences is rejected, with nothing created', async () => {
  const token = tokenFor(createUser('seriesuser4'));
  const res = await api('/api/tasks', { method: 'POST', token, body: daily('2026-01-01', '2027-06-01') });
  assert.equal(res.status, 400);

  const list = await api('/api/tasks?client=Иван', { token });
  assert.equal(list.body.length, 0);
});

test('recurrence.until before date is rejected', async () => {
  const token = tokenFor(createUser('seriesuser5'));
  const res = await api('/api/tasks', { method: 'POST', token, body: daily('2026-09-05', '2026-09-01') });
  assert.equal(res.status, 400);
});

test('weekly recurrence requires a non-empty weekdays list', async () => {
  const token = tokenFor(createUser('seriesuser6'));
  const res = await api('/api/tasks', { method: 'POST', token, body: weekly('2026-09-01', [], '2026-09-14') });
  assert.equal(res.status, 400);
});

test("weekly recurrence's weekdays must include the anchor date's own weekday", async () => {
  const token = tokenFor(createUser('seriesuser7'));
  // 2026-09-01 is a Tuesday (2) — omit it.
  const res = await api('/api/tasks', { method: 'POST', token, body: weekly('2026-09-01', [1, 3], '2026-09-14') });
  assert.equal(res.status, 400);
});

test('recurrence without a date is rejected', async () => {
  const token = tokenFor(createUser('seriesuser8'));
  const res = await api('/api/tasks', {
    method: 'POST',
    token,
    body: { title: 'Пост', recurrence: { type: 'daily', until: '2026-09-05' } },
  });
  assert.equal(res.status, 400);
});

test('a plain create without recurrence is unaffected (series_id null)', async () => {
  const token = tokenFor(createUser('seriesuser9'));
  const created = await api('/api/tasks', { method: 'POST', token, body: { title: 'Обикновен пост', date: '2026-09-01' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.series_id, null);
});

test('POST response for a series is a single object matching the anchor date', async () => {
  const token = tokenFor(createUser('seriesuser10'));
  const created = await api('/api/tasks', { method: 'POST', token, body: daily('2026-09-01', '2026-09-03') });
  assert.equal(created.status, 201);
  assert.equal(created.body.date, '2026-09-01');
  assert.equal(Array.isArray(created.body), false);
});

test('editing "just this one" (series_id: null) detaches only that occurrence', async () => {
  const token = tokenFor(createUser('seriesuser11'));
  await api('/api/tasks', { method: 'POST', token, body: daily('2026-09-01', '2026-09-03') });
  const list = await api('/api/tasks?from=2026-09-01&to=2026-09-03', { token });
  const middle = list.body.find((t) => t.date === '2026-09-02');

  const edited = await api(`/api/tasks/${middle.id}`, { method: 'PUT', token, body: { title: 'Само тази', series_id: null } });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.series_id, null);
  assert.equal(edited.body.title, 'Само тази');

  const after = await api('/api/tasks?from=2026-09-01&to=2026-09-03', { token });
  const others = after.body.filter((t) => t.id !== middle.id);
  assert.ok(others.every((t) => t.title === 'Пост' && t.series_id));
});

test('editing "this and all following" only changes the anchor date forward, and never touches date/status', async () => {
  const token = tokenFor(createUser('seriesuser12'));
  await api('/api/tasks', { method: 'POST', token, body: daily('2026-09-01', '2026-09-05') });
  const list = await api('/api/tasks?from=2026-09-01&to=2026-09-05', { token });
  const rows = list.body.sort((a, b) => a.date.localeCompare(b.date));
  const anchor = rows[2]; // 09-03

  const res = await api(`/api/tasks/${anchor.id}/series?scope=following`, {
    method: 'PUT',
    token,
    body: { title: 'Следващите', date: '2099-01-01', status: 'done' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.updated.length, 3); // 09-03, 09-04, 09-05

  const after = await api('/api/tasks?from=2026-09-01&to=2026-09-05', { token });
  const byDate = Object.fromEntries(after.body.map((t) => [t.date, t]));
  assert.equal(byDate['2026-09-01'].title, 'Пост');
  assert.equal(byDate['2026-09-02'].title, 'Пост');
  assert.equal(byDate['2026-09-03'].title, 'Следващите');
  assert.equal(byDate['2026-09-04'].title, 'Следващите');
  assert.equal(byDate['2026-09-05'].title, 'Следващите');
  // date/status were in the body but must NOT have changed anything.
  assert.ok(Object.keys(byDate).every((d) => byDate[d].status === 'pending'));
});

test('editing "the entire series" changes every occurrence, past and future', async () => {
  const token = tokenFor(createUser('seriesuser13'));
  await api('/api/tasks', { method: 'POST', token, body: daily('2026-09-01', '2026-09-03') });
  const list = await api('/api/tasks?from=2026-09-01&to=2026-09-03', { token });
  const anchor = list.body[0];

  const res = await api(`/api/tasks/${anchor.id}/series?scope=all`, { method: 'PUT', token, body: { title: 'Всички' } });
  assert.equal(res.status, 200);
  assert.equal(res.body.updated.length, 3);

  const after = await api('/api/tasks?from=2026-09-01&to=2026-09-03', { token });
  assert.ok(after.body.every((t) => t.title === 'Всички'));
});

test('a non-owner cannot bulk-edit or bulk-delete someone else\'s series', async () => {
  const owner = createUser('seriesowner14');
  const created = await api('/api/tasks', { method: 'POST', token: tokenFor(owner), body: daily('2026-09-01', '2026-09-02') });
  const strangerToken = tokenFor(createUser('seriesstranger14'));

  const editRes = await api(`/api/tasks/${created.body.id}/series?scope=all`, { method: 'PUT', token: strangerToken, body: { title: 'x' } });
  assert.equal(editRes.status, 403);
  const deleteRes = await api(`/api/tasks/${created.body.id}/series?scope=all`, { method: 'DELETE', token: strangerToken });
  assert.equal(deleteRes.status, 403);
});

test('bulk-scope routes 400 on a non-recurring task', async () => {
  const token = tokenFor(createUser('seriesuser15'));
  const created = await api('/api/tasks', { method: 'POST', token, body: { title: 'Обикновен', date: '2026-09-01' } });
  const res = await api(`/api/tasks/${created.body.id}/series?scope=all`, { method: 'PUT', token, body: { title: 'x' } });
  assert.equal(res.status, 400);
});

test('deleting "this and all following" removes only the matching subset, keeps the series row', async () => {
  const token = tokenFor(createUser('seriesuser16'));
  await api('/api/tasks', { method: 'POST', token, body: daily('2026-09-01', '2026-09-05') });
  const list = await api('/api/tasks?from=2026-09-01&to=2026-09-05', { token });
  const rows = list.body.sort((a, b) => a.date.localeCompare(b.date));
  const anchor = rows[2]; // 09-03

  const res = await api(`/api/tasks/${anchor.id}/series?scope=following`, { method: 'DELETE', token });
  assert.equal(res.status, 204);

  const after = await api('/api/tasks?from=2026-09-01&to=2026-09-05', { token });
  assert.equal(after.body.length, 2);
  assert.deepEqual(after.body.map((t) => t.date).sort(), ['2026-09-01', '2026-09-02']);

  // The remaining occurrences should still resolve to the series (deleting "following"
  // must not have torn down task_series while earlier occurrences survive it).
  assert.ok(after.body.every((t) => t.series_id));
});

test('deleting "the entire series" removes every occurrence', async () => {
  const token = tokenFor(createUser('seriesuser17'));
  await api('/api/tasks', { method: 'POST', token, body: daily('2026-09-01', '2026-09-03') });
  const list = await api('/api/tasks?from=2026-09-01&to=2026-09-03', { token });
  const anchor = list.body[0];

  const res = await api(`/api/tasks/${anchor.id}/series?scope=all`, { method: 'DELETE', token });
  assert.equal(res.status, 204);

  const after = await api('/api/tasks?from=2026-09-01&to=2026-09-03', { token });
  assert.equal(after.body.length, 0);
});

test('deleting a series with a shared image only removes the file once no occurrence references it', async () => {
  const token = tokenFor(createUser('seriesuser18'));
  const form = new FormData();
  form.append('image', new Blob(['fake-image-bytes'], { type: 'image/png' }), 'photo.png');
  const uploaded = await api('/api/uploads', { method: 'POST', token, form });
  const imagePath = uploaded.body.path;

  const created = await api('/api/tasks', {
    method: 'POST',
    token,
    body: daily('2026-09-01', '2026-09-03', { image_path: imagePath }),
  });
  assert.equal(created.status, 201);
  const list = await api('/api/tasks?from=2026-09-01&to=2026-09-03', { token });
  const rows = list.body.sort((a, b) => a.date.localeCompare(b.date));
  const diskPath = path.join(UPLOADS_DIR, path.basename(imagePath));
  assert.ok(fs.existsSync(diskPath), 'uploaded file should exist right after upload');

  // Delete just the first occurrence via the plain single-task DELETE — the file must
  // survive since two siblings still reference it.
  await api(`/api/tasks/${rows[0].id}`, { method: 'DELETE', token });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(fs.existsSync(diskPath), 'file should survive while sibling occurrences still reference it');

  // Now delete the rest ("this and all following" from the 2nd occurrence).
  const delRes = await api(`/api/tasks/${rows[1].id}/series?scope=following`, { method: 'DELETE', token });
  assert.equal(delRes.status, 204);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(!fs.existsSync(diskPath), 'file should be removed once no occurrence references it anymore');
});
