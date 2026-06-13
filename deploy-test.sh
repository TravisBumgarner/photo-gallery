#!/bin/bash
set -euo pipefail

# Full-stack deploy of backend + frontend-v2 (Expo web export) to the v2 NFS site.
#   Site:  https://photo-gallery-v2.nfshost.com/
#   SSH:   nfs_photo-gallery-v2  (alias in ~/.ssh/config, same nfs_key as v1)
#
# Mirrors deploy.sh but: targets the v2 site, and builds the frontend-v2 Expo
# web export (instead of the Vite frontend) into the frontend-dist the backend serves.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REMOTE="nfs_photo-gallery-v2"
REMOTE_DIR="/home/protected"
API_BASE_URL="${API_BASE_URL:-https://photo-gallery-v2.nfshost.com}"

cd "$SCRIPT_DIR"

echo "🧱 Building project locally..."

echo "📦 Installing dependencies..."
npm install

echo "🎨 Building frontend-v2 (Expo web static export, API: $API_BASE_URL)..."
rm -rf frontend-v2/dist
( cd frontend-v2 && EXPO_PUBLIC_API_BASE_URL="$API_BASE_URL" \
    npx expo export --platform web --output-dir dist )

echo "🖥️ Building backend (TypeScript)..."
npm run build -w backend

# Generate deployment package.json:
# - Remove workspace "shared" dep (we sync it manually to node_modules)
# - Keep all other runtime deps (better-sqlite3 is already in dependencies)
echo "📋 Preparing deployment package..."
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('./backend/package.json', 'utf8'));
const deploy = {
  name: pkg.name,
  version: pkg.version,
  type: pkg.type,
  dependencies: { ...pkg.dependencies }
};
delete deploy.dependencies.shared;
process.stdout.write(JSON.stringify(deploy, null, 2));
" > /tmp/deploy-v2-package.json

# Generate production shared package.json with exports pointing to compiled JS
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('./shared/package.json', 'utf8'));
const deploy = {
  name: pkg.name,
  version: pkg.version,
  type: pkg.type,
  exports: {
    './db': './dist/db/index.js',
    './db/schema': './dist/db/schema.js',
    './types': './dist/types.js',
    './schemas': './dist/schemas.js',
    './embed': './dist/embed.js'
  },
  dependencies: pkg.dependencies
};
process.stdout.write(JSON.stringify(deploy, null, 2));
" > /tmp/deploy-v2-shared-package.json

echo "🚀 Syncing backend to NearlyFreeSpeech ($REMOTE)..."
rsync -azPh --timeout=300 \
  /tmp/deploy-v2-package.json \
  "$REMOTE:$REMOTE_DIR/package.json"

rsync -azPh --timeout=300 \
  package-lock.json run.sh \
  "$REMOTE:$REMOTE_DIR/"

rsync -azPh --delete \
  --timeout=300 \
  backend/dist/ \
  "$REMOTE:$REMOTE_DIR/dist/"

rsync -azPh --delete \
  --timeout=300 \
  backend/drizzle/ \
  "$REMOTE:$REMOTE_DIR/drizzle/"

echo "🎨 Syncing frontend-v2 dist..."
rsync -azPh --delete \
  --timeout=300 \
  frontend-v2/dist/ \
  "$REMOTE:$REMOTE_DIR/frontend-dist/"

# Generate the production .env: clone local backend/.env, but force prod values.
# Secrets (SESSION_SECRET, APP_PASSWORD) carry over from local — set real ones in
# backend/.env before deploying.
echo "🔐 Preparing production .env..."
node -e "
const fs = require('fs');
const src = fs.readFileSync('./backend/.env', 'utf8');
const env = {};
for (const line of src.split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*\$/);
  if (m) env[m[1]] = m[2];
}
env.PORT = '8084';
env.DATABASE_URL = 'sqlite.db';
env.NODE_ENV = 'production';
env.CORS_ORIGIN = 'https://photo-gallery-v2.nfshost.com';
const out = Object.entries(env).map(([k, v]) => k + '=' + v).join('\n') + '\n';
process.stdout.write(out);
" > /tmp/deploy-v2.env

rsync -azPh --timeout=300 \
  /tmp/deploy-v2.env \
  "$REMOTE:$REMOTE_DIR/.env"

echo "🗄️ Syncing existing database (clone of local)..."
rsync -azPh --timeout=300 \
  backend/sqlite.db \
  "$REMOTE:$REMOTE_DIR/sqlite.db"

echo "🖼️ Syncing images + thumbnails (this can take a while)..."
ssh "$REMOTE" "mkdir -p $REMOTE_DIR/public/images $REMOTE_DIR/public/thumbnails"
rsync -azPh --delete \
  --timeout=300 \
  backend/public/images/ \
  "$REMOTE:$REMOTE_DIR/public/images/"

rsync -azPh --delete \
  --timeout=300 \
  backend/public/thumbnails/ \
  "$REMOTE:$REMOTE_DIR/public/thumbnails/"

echo "📦 Installing production dependencies remotely..."
ssh "$REMOTE" "
  set -euo pipefail
  cd $REMOTE_DIR

  echo '📁 Ensuring directories exist...'
  mkdir -p public/images public/thumbnails

  echo '🧹 Cleaning previous node_modules...'
  find node_modules -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true
  mkdir -p node_modules

  echo '📦 Installing dependencies...'
  npm install

  echo '🔧 Setting proper permissions...'
  chmod -R 755 dist
  chmod -R 755 frontend-dist
  chmod +x run.sh
"

# Sync shared package to node_modules AFTER npm install (so it doesn't get wiped)
echo "📦 Syncing shared package..."
ssh "$REMOTE" "mkdir -p $REMOTE_DIR/node_modules/shared"

rsync -azPh --delete \
  --timeout=300 \
  shared/dist/ \
  "$REMOTE:$REMOTE_DIR/node_modules/shared/dist/"

rsync -azPh --timeout=300 \
  /tmp/deploy-v2-shared-package.json \
  "$REMOTE:$REMOTE_DIR/node_modules/shared/package.json"

echo "🗄️ Running database migrations..."
ssh "$REMOTE" "
  set -euo pipefail
  cd $REMOTE_DIR
  node dist/db/migrate.js
"

echo "✅ Deployment complete!"
echo "🌐 https://photo-gallery-v2.nfshost.com/"
echo "ℹ️  Restart the daemon in the NFS panel (or it will pick up run.sh on next exec)."
