#!/usr/bin/env bash
set -e

# Clean install: remove node_modules and lockfiles so npm workspaces
# can properly hoist shared dependencies (e.g. drizzle-orm).
# Workspace dirs must not have their own package-lock.json.
echo "Cleaning previous installs..."
rm -rf node_modules package-lock.json
rm -rf backend/node_modules backend/package-lock.json
rm -rf frontend/node_modules frontend/package-lock.json
rm -rf offline-processing/node_modules offline-processing/package-lock.json
rm -rf shared/node_modules shared/package-lock.json

# Install all dependencies (npm workspaces handles backend, frontend, etc.)
echo "Installing dependencies..."
npm install

# Copy .env.example files if .env doesn't already exist
if [ ! -f backend/.env ]; then
  echo "Creating backend/.env from .env.example..."
  cp backend/.env.example backend/.env
fi

# Apply existing Drizzle migrations to SQLite
echo "Running database migrations..."
npm run db:migrate

# Next steps:
#   1. Edit backend/.env with your settings (see README for details)
#   2. Run 'npm run dev' to start (frontend on :5200, backend on :8084)
#   3. For ingestion, run ./oi from offline-processing/ (see offline-processing/README.md)
echo ""
echo "Done! Edit .env files if needed, then run 'npm run dev' to start."
