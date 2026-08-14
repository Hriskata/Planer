// Shared setup for every backend test file. Each test file runs in its own process
// (node's default --test isolation), so setting these env vars here — before ../src/db
// or ../src/app is ever required — gives every file its own fresh in-memory database
// and an isolated uploads dir, instead of touching the real backend/data/tasks.db.
const path = require('path');
const os = require('os');
const fs = require('fs');

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'planer-test-uploads-'));

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../src/db');
const app = require('../src/app');

let server;
let baseUrl;

function startServer() {
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve(baseUrl);
    });
  });
}

function stopServer() {
  return new Promise((resolve) => server.close(resolve));
}

// Inserted directly, same shape as src/seed.js — there's no public /register endpoint
// to go through, and the real seed script isn't built for calling in a loop from tests.
// Cost factor 4 (not seed.js's 12) purely for test speed; bcryptjs is pure JS and 12
// rounds adds up fast across dozens of test users.
function createUser(username, password = 'testpass123') {
  const passwordHash = bcrypt.hashSync(password, 4);
  const result = db
    .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
    .run(username, passwordHash);
  return { id: result.lastInsertRowid, username, password };
}

function tokenFor(user) {
  return jwt.sign({ username: user.username }, process.env.JWT_SECRET, {
    subject: String(user.id),
    expiresIn: '30d',
  });
}

function shareCalendar(ownerId, sharedEmail) {
  db.prepare('INSERT INTO calendar_shares (owner_id, shared_email) VALUES (?, ?)').run(ownerId, sharedEmail);
}

function setEmail(userId, email) {
  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, userId);
}

// Thin fetch wrapper against the running test server — mirrors frontend/src/lib/api.js's
// own request shape closely enough to read naturally, without pulling that module in
// (it also handles offline localStorage caching, which is meaningless here).
async function api(path, { method = 'GET', token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let fetchBody;
  if (form) {
    fetchBody = form; // FormData — fetch sets the multipart Content-Type + boundary itself
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }
  const res = await fetch(`${baseUrl}${path}`, { method, headers, body: fetchBody });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  return { status: res.status, body: json };
}

module.exports = { startServer, stopServer, createUser, tokenFor, shareCalendar, setEmail, api, db };
