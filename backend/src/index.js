require('dotenv').config();

// If missing, the server would sign tokens with `undefined` — a silent security hole.
// Better to fail the startup immediately with a clear error.
if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET не е зададен. Копирай .env.example в .env и попълни стойност.');
  process.exit(1);
}

const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Сървърът слуша на порт ${PORT}`);
});
