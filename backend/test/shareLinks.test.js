const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, createUser, tokenFor, api } = require('./helpers');

before(startServer);
after(stopServer);

async function createTask(token, overrides = {}) {
  return api('/api/tasks', {
    method: 'POST',
    token,
    body: { title: 'Пост', client: 'Иван', date: '2026-09-01', ...overrides },
  });
}

test('creating a share link returns a token', async () => {
  const token = tokenFor(createUser('linkowner1'));
  const res = await api('/api/share-links', { method: 'POST', token, body: { client: 'Иван' } });
  assert.equal(res.status, 201);
  assert.equal(res.body.client, 'Иван');
  assert.ok(res.body.token && res.body.token.length > 0);
});

test('creating a share link for the same client twice is idempotent', async () => {
  const token = tokenFor(createUser('linkowner2'));
  const first = await api('/api/share-links', { method: 'POST', token, body: { client: 'Ани' } });
  const second = await api('/api/share-links', { method: 'POST', token, body: { client: 'Ани' } });
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.body.token, first.body.token);
});

test('an empty client is rejected', async () => {
  const token = tokenFor(createUser('linkowner3'));
  const res = await api('/api/share-links', { method: 'POST', token, body: { client: '   ' } });
  assert.equal(res.status, 400);
});

test('listing share links is scoped to the owner', async () => {
  const ownerToken = tokenFor(createUser('linkowner4'));
  await api('/api/share-links', { method: 'POST', token: ownerToken, body: { client: 'Жоро' } });
  await api('/api/share-links', { method: 'POST', token: ownerToken, body: { client: 'Ани' } });

  const strangerToken = tokenFor(createUser('linkstranger1'));

  const ownerList = await api('/api/share-links', { token: ownerToken });
  const strangerList = await api('/api/share-links', { token: strangerToken });
  assert.equal(ownerList.body.length, 2);
  assert.equal(strangerList.body.length, 0);
});

test('revoking a link works, and revoking it again 404s', async () => {
  const token = tokenFor(createUser('linkowner5'));
  const created = await api('/api/share-links', { method: 'POST', token, body: { client: 'Иван' } });
  const revoked = await api(`/api/share-links/${created.body.id}`, { method: 'DELETE', token });
  assert.equal(revoked.status, 204);
  const revokedAgain = await api(`/api/share-links/${created.body.id}`, { method: 'DELETE', token });
  assert.equal(revokedAgain.status, 404);
});

test("a non-owner can't revoke someone else's link", async () => {
  const owner = createUser('linkowner6');
  const created = await api('/api/share-links', { method: 'POST', token: tokenFor(owner), body: { client: 'Иван' } });
  const strangerToken = tokenFor(createUser('linkstranger2'));
  const res = await api(`/api/share-links/${created.body.id}`, { method: 'DELETE', token: strangerToken });
  assert.equal(res.status, 404);
});

test('creating a link again after revoke issues a fresh token', async () => {
  const token = tokenFor(createUser('linkowner7'));
  const first = await api('/api/share-links', { method: 'POST', token, body: { client: 'Иван' } });
  await api(`/api/share-links/${first.body.id}`, { method: 'DELETE', token });
  const second = await api('/api/share-links', { method: 'POST', token, body: { client: 'Иван' } });
  assert.equal(second.status, 201);
  assert.notEqual(second.body.token, first.body.token);
});

test('/api/share-links requires auth', async () => {
  const get = await api('/api/share-links');
  const post = await api('/api/share-links', { method: 'POST', body: { client: 'Иван' } });
  assert.equal(get.status, 401);
  assert.equal(post.status, 401);
});

test('public resolve returns the client name for an active token', async () => {
  const token = tokenFor(createUser('linkowner8'));
  const created = await api('/api/share-links', { method: 'POST', token, body: { client: 'Иван' } });
  const res = await api(`/api/public-share/${created.body.token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.client, 'Иван');
});

test('public resolve 404s for an unknown token', async () => {
  const res = await api('/api/public-share/not-a-real-token');
  assert.equal(res.status, 404);
});

test('public resolve 404s identically for a revoked token', async () => {
  const token = tokenFor(createUser('linkowner9'));
  const created = await api('/api/share-links', { method: 'POST', token, body: { client: 'Иван' } });
  await api(`/api/share-links/${created.body.id}`, { method: 'DELETE', token });

  const unknown = await api('/api/public-share/not-a-real-token');
  const revoked = await api(`/api/public-share/${created.body.token}`);
  assert.equal(revoked.status, 404);
  assert.deepEqual(revoked.body, unknown.body);
});

test('public tasks only include the linked client, scoped to the linked owner', async () => {
  const ownerA = createUser('linkowner10');
  const ownerB = createUser('linkowner11');
  await createTask(tokenFor(ownerA), { title: 'Иван A1', client: 'Иван' });
  await createTask(tokenFor(ownerA), { title: 'Друг клиент A', client: 'Петър' });
  // Same client name, different owner — must NOT leak into ownerA's link.
  await createTask(tokenFor(ownerB), { title: 'Иван B1', client: 'Иван' });

  const link = await api('/api/share-links', { method: 'POST', token: tokenFor(ownerA), body: { client: 'Иван' } });
  const res = await api(`/api/public-share/${link.body.token}/tasks`);

  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].title, 'Иван A1');
});

test('public tasks omit private columns entirely', async () => {
  const owner = createUser('linkowner12');
  await createTask(tokenFor(owner), {
    title: 'С имейл',
    client: 'Иван',
    email_on_complete: true,
    email_to: 'someone@example.com',
  });
  const link = await api('/api/share-links', { method: 'POST', token: tokenFor(owner), body: { client: 'Иван' } });
  const res = await api(`/api/public-share/${link.body.token}/tasks`);

  assert.equal(res.status, 200);
  const [task] = res.body;
  for (const key of ['email_on_complete', 'email_to', 'email_subject', 'email_body', 'email_sent', 'reminder_sent', 'shared', 'user_id']) {
    assert.ok(!(key in task), `expected "${key}" to be absent from the public tasks response`);
  }
});

test('public tasks 404s for a revoked token', async () => {
  const owner = createUser('linkowner13');
  const link = await api('/api/share-links', { method: 'POST', token: tokenFor(owner), body: { client: 'Иван' } });
  await api(`/api/share-links/${link.body.id}`, { method: 'DELETE', token: tokenFor(owner) });
  const res = await api(`/api/public-share/${link.body.token}/tasks`);
  assert.equal(res.status, 404);
});
