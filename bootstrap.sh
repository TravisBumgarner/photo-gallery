#!/usr/bin/env bash
set -e

echo "Installing dependencies..."
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

if [ ! -f backend/.env ]; then
  echo "Creating backend/.env from .env.example..."
  cp backend/.env.example backend/.env
fi

echo "Running database migrations..."
npm run db:generate
npm run db:migrate

echo "Done! Run 'npm run dev' to start."
