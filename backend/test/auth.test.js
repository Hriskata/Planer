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
