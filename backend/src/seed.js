// Creates/updates a user. There is intentionally no public /register endpoint —
// the (2-4) accounts are managed by you through this CLI script.
//
// Usage: npm run seed -- <username> <password>

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

const [, , username, password] = process.argv;

if (!username || !password) {
  console.error('Употреба: npm run seed -- <username> <password>');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Паролата трябва да е поне 8 символа.');
  process.exit(1);
}

const passwordHash = bcrypt.hashSync(password, 12);

const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);

if (existing) {
  db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(passwordHash, username);
  console.log(`Паролата на "${username}" е обновена.`);
} else {
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
  console.log(`Потребител "${username}" е създаден.`);
}
