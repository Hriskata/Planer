const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { requireAuth } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const tasksRouter = require('./routes/tasks');
const uploadsRouter = require('./routes/uploads');

const app = express();

app.use(helmet());
app.use(express.json());

// CORS only when CORS_ORIGIN is set (dev, separate Vite server).
// In production the frontend is served from the same origin, so CORS isn't needed.
if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN }));
}

// /login is public (it's how you get a token) — doesn't go through requireAuth.
app.use('/api/auth', authRouter);
app.use('/api/tasks', requireAuth, tasksRouter);
app.use('/api/uploads', requireAuth, uploadsRouter);

// Uploaded task images. Deliberately public (not behind requireAuth) — a plain <img
// src> can't attach the JWT header, and filenames are random UUIDs, not guessable.
// Fine for this app's scale/trust model; revisit if that stops being true.
app.use('/uploads', express.static(process.env.UPLOADS_DIR || './uploads'));

// Frontend static files (Svelte build, Stage 3). frontend/ and backend/ are
// sibling folders, hence two levels up. The check guards against crashing
// while frontend/dist doesn't exist yet.
const frontendDist = path.join(__dirname, '../../frontend/dist');
const frontendExists = fs.existsSync(frontendDist);

if (frontendExists) {
  app.use(express.static(frontendDist));
}

// 404 for unknown /api/* routes — scoped to the API so it doesn't shadow the SPA catch-all below.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Маршрутът не съществува.' });
});

// SPA catch-all: everything else returns index.html so client-side routing works.
app.get('*', (req, res, next) => {
  if (!frontendExists) return next();
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// Central error handler (4 args = Express recognizes it as such).
// Prevents stack traces leaking to the client and the process crashing on errors in routes.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Възникна вътрешна грешка на сървъра.' });
});

module.exports = app;
