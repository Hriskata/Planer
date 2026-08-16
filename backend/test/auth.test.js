const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, createUser, api } = require('./helpers');

before(startServer);
after(stopServer);

test('login with correct credentials returns a token', async () => {
  createUser('alice', 'password123');
  const res = await api('/api/auth/login', { method: 'POST', body: { username: 'alice', password: 'password123' } });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  assert.equal(res.body.user.username, 'alice');
});

test('login with the wrong password is rejected', async () => {
  createUser('bob', 'password123');
  const res = await api('/api/auth/login', { method: 'POST', body: { username: 'bob', password: 'wrong' } });
  assert.equal(res.status, 401);
});

test('login with an unknown username gets the same 401 as a wrong password', async () => {
  const res = await api('/api/auth/login', { method: 'POST', body: { username: 'nobody', password: 'x' } });
  assert.equal(res.status, 401);
});

test('login without a username/password is rejected as a bad request', async () => {
  const res = await api('/api/auth/login', { method: 'POST', body: {} });
  assert.equal(res.status, 400);
});

test('protected routes reject requests with no token', async () => {
  const res = await api('/api/tasks');
  assert.equal(res.status, 401);
});

test('protected routes reject requests with a garbage token', async () => {
  const res = await api('/api/tasks', { token: 'not-a-real-token' });
  assert.equal(res.status, 401);
});

test('repeated failed logins against the same username get rate-limited', async () => {
  createUser('ratelimited', 'realpassword123');

  // 8 is LOGIN_MAX_ATTEMPTS in routes/auth.js — all should still be plain 401s.
  for (let i = 0; i < 8; i++) {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: { username: 'ratelimited', password: 'wrong' },
    });
    assert.equal(res.status, 401, `attempt ${i + 1} should be a normal 401`);
  }

  // The 9th attempt (even with a fresh, DIFFERENT wrong guess) should be throttled.
  const throttled = await api('/api/auth/login', {
    method: 'POST',
    body: { username: 'ratelimited', password: 'also-wrong' },
  });
  assert.equal(throttled.status, 429);

  // Throttling is per-username — a different account is unaffected.
  createUser('notratelimited', 'password123');
  const other = await api('/api/auth/login', {
    method: 'POST',
    body: { username: 'notratelimited', password: 'password123' },
  });
  assert.equal(other.status, 200);
});
