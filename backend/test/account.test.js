const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, createUser, tokenFor, api } = require('./helpers');

before(startServer);
after(stopServer);

test('GET /email-sender starts empty for a fresh user', async () => {
  const token = tokenFor(createUser('acctuser1'));
  const res = await api('/api/account/email-sender', { token });
  assert.equal(res.status, 200);
  assert.equal(res.body.email, null);
  assert.equal(res.body.hasAppPassword, false);
});

test('PUT /email-sender sets email without touching hasAppPassword', async () => {
  const token = tokenFor(createUser('acctuser2'));
  const res = await api('/api/account/email-sender', { method: 'PUT', token, body: { email: 'sender@example.com' } });
  assert.equal(res.status, 204);

  const after = await api('/api/account/email-sender', { token });
  assert.equal(after.body.email, 'sender@example.com');
  assert.equal(after.body.hasAppPassword, false);
});

test('PUT /email-sender with an appPassword sets hasAppPassword', async () => {
  const token = tokenFor(createUser('acctuser3'));
  await api('/api/account/email-sender', { method: 'PUT', token, body: { email: 'a@example.com', appPassword: 'secret pass' } });

  const after = await api('/api/account/email-sender', { token });
  assert.equal(after.body.hasAppPassword, true);
});

test('an invalid email is rejected', async () => {
  const token = tokenFor(createUser('acctuser4'));
  const res = await api('/api/account/email-sender', { method: 'PUT', token, body: { email: 'not-an-email' } });
  assert.equal(res.status, 400);
});

test('changing the sender email WITHOUT a new app password clears the stale one', async () => {
  const token = tokenFor(createUser('acctuser5'));
  await api('/api/account/email-sender', { method: 'PUT', token, body: { email: 'old@example.com', appPassword: 'secret pass' } });
  let state = await api('/api/account/email-sender', { token });
  assert.equal(state.body.hasAppPassword, true);

  // Same request shape as "just editing the address field" in Settings — no appPassword.
  await api('/api/account/email-sender', { method: 'PUT', token, body: { email: 'new@example.com' } });
  state = await api('/api/account/email-sender', { token });
  assert.equal(state.body.email, 'new@example.com');
  assert.equal(state.body.hasAppPassword, false, 'the old password would silently fail against the new address');
});

test('re-submitting the SAME email does not clear an existing app password', async () => {
  const token = tokenFor(createUser('acctuser6'));
  await api('/api/account/email-sender', { method: 'PUT', token, body: { email: 'same@example.com', appPassword: 'secret pass' } });

  await api('/api/account/email-sender', { method: 'PUT', token, body: { email: 'same@example.com' } });
  const state = await api('/api/account/email-sender', { token });
  assert.equal(state.body.hasAppPassword, true, 'no real change happened, the password should survive');
});

test('changing email AND supplying a new app password in the same request keeps it set', async () => {
  const token = tokenFor(createUser('acctuser7'));
  await api('/api/account/email-sender', { method: 'PUT', token, body: { email: 'old2@example.com', appPassword: 'old secret' } });

  await api('/api/account/email-sender', {
    method: 'PUT',
    token,
    body: { email: 'new2@example.com', appPassword: 'new secret' },
  });
  const state = await api('/api/account/email-sender', { token });
  assert.equal(state.body.email, 'new2@example.com');
  assert.equal(state.body.hasAppPassword, true);
});
