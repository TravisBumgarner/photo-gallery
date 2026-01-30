#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REMOTE="nfs_photo-gallery"
REMOTE_DIR="/home/protected"

cd "$SCRIPT_DIR"

echo "🧱 Building project locally..."

echo "📦 Installing dependencies..."
(cd backend && npm install)
(cd frontend && npm install)

echo "🎨 Building frontend (React/Vite)..."
(cd frontend && npm run build)

echo "🖥️ Building backend (TypeScript)..."
(cd backend && npm run build)

echo "🚀 Syncing backend to NearlyFreeSpeech..."
rsync -azPh --delete \
  --timeout=300 \
  backend/package.json backend/package-lock.json run.sh \
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

  echo '🗄️ Running database migrations...'
  node dist/db/migrate.js
"

echo "🖼️ Processing images in production mode..."
(cd backend && echo "p" | npx tsx src/scripts/processImages.ts ~/Desktop/photos)

echo "✅ Deployment complete!"
echo "🌐 Server should now be serving the frontend from built assets"
