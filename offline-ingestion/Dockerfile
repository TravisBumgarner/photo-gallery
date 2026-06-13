# Node image powering both the `cli` (ingest/tag/detect/cluster tasks) and the
# `label-app` web UI. Build context is the REPO ROOT (see docker-compose.yml),
# because offline-ingestion depends on the `shared` workspace and shells out to
# `backend`'s drizzle migrations when creating a fresh database.
FROM node:20-bookworm-slim

# better-sqlite3 compiles from source; openssh-client is for sync-to-prod.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ openssh-client ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install only the workspaces we need (not frontend), with manifests copied first
# for layer caching. frontend's manifest is required so the workspace resolves.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY offline-ingestion/package.json offline-ingestion/
COPY frontend/package.json frontend/
RUN npm install --include-workspace-root \
      -w shared -w backend -w offline-ingestion

# Source. Only what the CLI + label-app + migrations actually touch.
# Root tsconfig is required: offline-ingestion/tsconfig extends it for the `@/*`
# path alias that tsx resolves at runtime.
COPY tsconfig.json ./
COPY shared/ shared/
COPY backend/drizzle/ backend/drizzle/
COPY backend/drizzle.config.ts backend/tsconfig.json backend/
COPY offline-ingestion/ offline-ingestion/

# Default config path (compose bind-mounts the host file over this so edits apply).
ENV OI_CONFIG_PATH=/app/offline-ingestion/offline-ingestion.config.yaml

WORKDIR /app/offline-ingestion

# label-app service overrides nothing; cli service is driven via
# `docker compose run --rm cli npm run <task>`.
CMD ["npm", "run", "label"]
