# Node image powering both the `cli` (ingest/tag/detect/cluster tasks) and the
# `label-app` web UI. Build context is the REPO ROOT (see docker-compose.yml),
# because offline-processing depends on the `shared` workspace and shells out to
# `backend`'s drizzle migrations when creating a fresh database.
FROM node:20-bookworm-slim

# better-sqlite3 compiles from source.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install only the workspaces we need (not frontend), with manifests copied first
# for layer caching. frontend's manifest is required so the workspace resolves.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY offline-processing/package.json offline-processing/
COPY frontend/package.json frontend/
RUN npm install --include-workspace-root \
      -w shared -w backend -w offline-processing

# Source. Only what the CLI + label-app + migrations actually touch.
# Root tsconfig is required: offline-processing/tsconfig extends it for the `@/*`
# path alias that tsx resolves at runtime.
COPY tsconfig.json ./
COPY shared/ shared/
COPY backend/drizzle/ backend/drizzle/
COPY backend/drizzle.config.ts backend/tsconfig.json backend/
COPY offline-processing/ offline-processing/

# Default config path (compose bind-mounts the host file over this so edits apply).
ENV OP_CONFIG_PATH=/app/offline-processing/offline-processing.config.yaml

WORKDIR /app/offline-processing

# label-app service overrides nothing; cli service is driven via
# `docker compose run --rm cli npm run <task>`.
CMD ["npm", "run", "label"]
