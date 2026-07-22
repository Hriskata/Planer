require('dotenv').config();

// If missing, the server would sign tokens with `undefined` — a silent security hole.
// Better to fail the startup immediately with a clear error.
if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET не е зададен. Копирай .env.example в .env и попълни стойност.');
  process.exit(1);
}

const app = require('./app');
const { checkReminders, CHECK_INTERVAL_MS } = require('./notifications');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Сървърът слуша на порт ${PORT}`);
});

// Best-effort: a failed check (e.g. a transient push-service error) shouldn't kill the
// interval — just log it and try again on the next tick.
setInterval(() => {
  checkReminders().catch((err) => console.error('Грешка при проверка на напомняния:', err));
}, CHECK_INTERVAL_MS);
