# Stage 1: build the frontend static assets (Svelte + Vite)
FROM node:22-slim AS frontend-build
WORKDIR /frontend
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
