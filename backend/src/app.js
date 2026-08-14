const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { requireAuth } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const tasksRouter = require('./routes/tasks');
const uploadsRouter = require('./routes/uploads');
const pushRouter = require('./routes/push');
const accountRouter = require('./routes/account');
const sharingRouter = require('./routes/sharing');
const libraryRouter = require('./routes/library');

const app = express();

// Google Identity Services (the "Sign in with Google" button) loads a script from
// accounts.google.com and renders its consent UI in an iframe — helmet's default CSP
// blocks both by default, so those origins are explicitly allowed here rather than
// disabling the policy altogether.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", 'https://accounts.google.com/gsi/client'],
        'connect-src': ["'self'", 'https://accounts.google.com/gsi/'],
        'frame-src': ["'self'", 'https://accounts.google.com/gsi/'],
      },
    },
    // Helmet's own default here is `same-origin`, which severs `window.opener` for ANY
    // popup this page opens (the browser isolates it into a fresh browsing context
    // group) — harmless for most popups, but Google's Sign In button opens exactly such
    // a popup and its own JS calls `window.opener.postMessage(...)` to hand the
    // credential back, which throws "Cannot read properties of null (reading
    // 'postMessage')" once opener has been nulled out. same-origin-allow-popups keeps
    // the isolation for same-origin windows while leaving popups this page itself opens
    // able to talk back to it.
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  })
);
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
app.use('/api/push', requireAuth, pushRouter);
app.use('/api/account', requireAuth, accountRouter);
app.use('/api/sharing', requireAuth, sharingRouter);
app.use('/api/library', requireAuth, libraryRouter);

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
