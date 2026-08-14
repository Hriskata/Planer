# Stage 1: build the frontend static assets (Svelte + Vite)
FROM node:22-slim AS frontend-build
WORKDIR /frontend
# @playwright/test (E2E test devDependency, only ever run locally — see frontend/tests/)
# pulls in `playwright`, whose own postinstall downloads a ~150-300MB Chromium binary by
# default. Nothing in this image ever runs those tests, so skip that download entirely —
# without this, a fresh build (no local ms-playwright cache to reuse) wastes build time
# fetching a browser and adds a network dependency this step doesn't actually need.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: backend runtime, serving both the API and the built frontend from one process
FROM node:22-slim
# -slim strips tzdata by default, so an unrecognized TZ (set via docker-compose.yml)
# would silently fall back to UTC instead of actually shifting task-reminder timing.
RUN apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=frontend-build /frontend/dist /app/frontend/dist

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/index.js"]
