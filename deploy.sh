#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REMOTE="nfs_photo-gallery"
REMOTE_DIR="/home/protected"

cd "$SCRIPT_DIR"

echo "🧱 Building project locally..."

echo "📦 Installing dependencies..."
npm install

echo "🎨 Building frontend (React/Vite)..."
npm run build -w frontend

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
" > /tmp/deploy-package.json

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
" > /tmp/deploy-shared-package.json

echo "🚀 Syncing backend to NearlyFreeSpeech..."
rsync -azPh --timeout=300 \
  /tmp/deploy-package.json \
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

echo "🎨 Syncing frontend dist..."
rsync -azPh --delete \
  --timeout=300 \
  frontend/dist/ \
  "$REMOTE:$REMOTE_DIR/frontend-dist/"

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
  /tmp/deploy-shared-package.json \
  "$REMOTE:$REMOTE_DIR/node_modules/shared/package.json"

echo "🗄️ Running database migrations..."
ssh "$REMOTE" "
  set -euo pipefail
  cd $REMOTE_DIR
  node dist/db/migrate.js
"

echo "✅ Deployment complete!"
echo "Be sure to run ingestion if needed"
echo "🌐 Server should now be serving the frontend from built assets"
