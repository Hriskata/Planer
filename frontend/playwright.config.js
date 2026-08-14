import { defineConfig } from '@playwright/test';

// Dedicated ports, separate from the normal dev setup (backend :3000, frontend :5173)
// so `npm run test:e2e` never collides with an already-running `npm run dev` session.
const BACKEND_PORT = 3901;
const FRONTEND_PORT = 5273;

export default defineConfig({
  testDir: './tests/e2e',
  // Small smoke suite sharing one seeded account and one backend/DB — safer to run
  // serially for now than to add per-test data isolation just to parallelize a handful
  // of specs. Revisit if this suite grows enough for that tradeoff to flip.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node tests/start-test-backend.cjs',
      port: BACKEND_PORT,
      reuseExistingServer: false,
      timeout: 20_000,
    },
    {
      command: `npx vite --port ${FRONTEND_PORT} --strictPort`,
      port: FRONTEND_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 20_000,
      env: { BACKEND_PORT: String(BACKEND_PORT) },
    },
  ],
});
