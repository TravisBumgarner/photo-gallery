# Self-contained serving image: compiled backend + Expo web static export baked
# in. The read-only DB is pulled from STORAGE_URL at boot; media is served from
# STORAGE_URL (file://) or its own bucket. Build context is the REPO ROOT.
#
#   docker build -f backend/Dockerfile -t photo-gallery .
#   docker run -p 8084:8084 \
#     -e STORAGE_URL=file:///media -v /path/to/output:/media \
#     -e SESSION_SECRET=... -e APP_PASSWORD=... -e CORS_ORIGIN=... \
#     photo-gallery
#
# ---- builder ---------------------------------------------------------------
FROM node:20-bookworm-slim AS builder

# better-sqlite3 compiles from source.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Manifests first (layer caching). All workspace manifests must be present for
# npm to resolve the workspace graph, even ones we don't build here.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY offline-processing/package.json offline-processing/
RUN npm install --include-workspace-root -w shared -w backend -w frontend

# Source.
COPY tsconfig.json ./
COPY shared/ shared/
COPY backend/ backend/
COPY frontend/ frontend/

# Compile shared + backend (tsc -b follows project references).
RUN npm run build -w backend

# Expo web static export. Empty API base = same-origin (the backend serves both
# the frontend and the API), so the image is portable to any host/domain.
ARG EXPO_PUBLIC_API_BASE_URL=""
RUN cd frontend && EXPO_PUBLIC_API_BASE_URL="$EXPO_PUBLIC_API_BASE_URL" \
      npx expo export --platform web --output-dir dist

# Production shared package.json: exports point at compiled dist (mirrors
# deploy.sh) so the runtime resolves `shared/*` to JS, not TS source.
RUN node -e "const fs=require('fs');const p=require('./shared/package.json');\
fs.writeFileSync('/tmp/shared-pkg.json',JSON.stringify({name:p.name,version:p.version,type:p.type,\
exports:{'./db':'./dist/db/index.js','./db/schema':'./dist/db/schema.js','./types':'./dist/types.js',\
'./schemas':'./dist/schemas.js','./embed':'./dist/embed.js','./storage':'./dist/storage/index.js',\
'./sidecar':'./dist/sidecar.js','./labels':'./dist/labels.js','./publish':'./dist/publish.js'},\
dependencies:p.dependencies},null,2))"

# ---- runtime ---------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app/backend

ENV NODE_ENV=production \
    PORT=8084 \
    DATABASE_URL=/tmp/prod.sqlite

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/backend/dist /app/backend/dist
COPY --from=builder /app/frontend/dist /app/backend/frontend-dist

# Materialize `shared` as compiled dist (replace the workspace symlink).
RUN rm -rf /app/node_modules/shared && mkdir -p /app/node_modules/shared
COPY --from=builder /app/shared/dist /app/node_modules/shared/dist
COPY --from=builder /tmp/shared-pkg.json /app/node_modules/shared/package.json

EXPOSE 8084

# Pull the read-only DB, then serve. Restart the container to pick up a newly
# published library snapshot.
CMD ["sh", "-c", "node dist/boot.js && node dist/index.js"]
