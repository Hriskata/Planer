const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startServer, stopServer, createUser, tokenFor, shareCalendar, setEmail, api, UPLOADS_DIR } = require('./helpers');

before(startServer);
after(stopServer);

function colorForm({ client = 'Иван', title = 'Brand blue', hex, rgb, withPhoto = false } = {}) {
  const fd = new FormData();
  fd.append('client', client);
  fd.append('type', 'Цвят');
  fd.append('title', title);
  if (hex) fd.append('hex_code', hex);
  if (rgb) fd.append('rgb_value', rgb);
  if (withPhoto) fd.append('file', new Blob(['fake-image-bytes'], { type: 'image/png' }), 'swatch.png');
  return fd;
}

test('a Цвят asset with none of hex/rgb/photo is rejected', async () => {
  const token = tokenFor(createUser('libuser1'));
  const res = await api('/api/library', { method: 'POST', token, form: colorForm() });
  assert.equal(res.status, 400);
});

test('hex alone is enough for a Цвят asset', async () => {
  const token = tokenFor(createUser('libuser2'));
  const res = await api('/api/library', { method: 'POST', token, form: colorForm({ hex: '#3B82F6' }) });
  assert.equal(res.status, 201);
  assert.equal(res.body.hex_code, '#3B82F6');
});

test('rgb alone is enough for a Цвят asset', async () => {
  const token = tokenFor(createUser('libuser3'));
  const res = await api('/api/library', { method: 'POST', token, form: colorForm({ rgb: '59, 130, 246' }) });
  assert.equal(res.status, 201);
  assert.equal(res.body.rgb_value, '59, 130, 246');
});

test('a photo alone is enough for a Цвят asset', async () => {
  const token = tokenFor(createUser('libuser5'));
  const res = await api('/api/library', { method: 'POST', token, form: colorForm({ withPhoto: true }) });
  assert.equal(res.status, 201);
  assert.ok(res.body.file_path);
});

test('an invalid hex code is rejected', async () => {
  const token = tokenFor(createUser('libuser4'));
  const res = await api('/api/library', { method: 'POST', token, form: colorForm({ hex: 'not-a-color' }) });
  assert.equal(res.status, 400);
});

test('a shared collaborator can upload to the owner\'s library, and the owner can delete it', async () => {
  const owner = createUser('libowner1');
  setEmail(owner.id, 'owner1@example.com');
  const collaborator = createUser('libcollab1');
  setEmail(collaborator.id, 'collab1@example.com');
  shareCalendar(owner.id, 'collab1@example.com');

  const uploaded = await api(`/api/library?calendar=${owner.id}`, {
    method: 'POST',
    token: tokenFor(collaborator),
    form: colorForm({ hex: '#ff0000' }),
  });
  assert.equal(uploaded.status, 201);
  assert.equal(uploaded.body.owner_id, owner.id);
  assert.equal(uploaded.body.uploaded_by, collaborator.id);

  // owner-style admin rights: the owner may delete anything in their own library,
  // even material someone else uploaded.
  const ownerDeletes = await api(`/api/library/${uploaded.body.id}`, {
    method: 'DELETE',
    token: tokenFor(owner),
  });
  assert.equal(ownerDeletes.status, 204);
});

test("a collaborator can't delete another collaborator's upload (only their own)", async () => {
  const owner = createUser('libowner2');
  setEmail(owner.id, 'owner2@example.com');
  const collabA = createUser('libcollabA');
  setEmail(collabA.id, 'collabA@example.com');
  shareCalendar(owner.id, 'collabA@example.com');
  const collabB = createUser('libcollabB');
  setEmail(collabB.id, 'collabB@example.com');
  shareCalendar(owner.id, 'collabB@example.com');

  const uploaded = await api(`/api/library?calendar=${owner.id}`, {
    method: 'POST',
    token: tokenFor(collabA),
    form: colorForm({ hex: '#00ff00' }),
  });
  assert.equal(uploaded.status, 201);

  const deleteAttempt = await api(`/api/library/${uploaded.body.id}`, {
    method: 'DELETE',
    token: tokenFor(collabB),
  });
  assert.equal(deleteAttempt.status, 403);
});

test('a stranger with no calendar_shares row is blocked from the library entirely', async () => {
  const owner = createUser('libowner3');
  const stranger = createUser('libstranger1');
  const res = await api(`/api/library?calendar=${owner.id}`, { token: tokenFor(stranger) });
  assert.equal(res.status, 403);
});

test('deleting a library asset removes its uploaded file from disk', async () => {
  const token = tokenFor(createUser('libuser6'));
  const uploaded = await api('/api/library', { method: 'POST', token, form: colorForm({ withPhoto: true }) });
  assert.equal(uploaded.status, 201);
  const diskPath = path.join(UPLOADS_DIR, path.basename(uploaded.body.file_path));
  assert.ok(fs.existsSync(diskPath), 'uploaded file should exist right after upload');

  await api(`/api/library/${uploaded.body.id}`, { method: 'DELETE', token });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(!fs.existsSync(diskPath), 'uploaded file should be removed after the asset is deleted');
});
