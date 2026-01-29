# Photo Gallery

React + Vite frontend, Express + Drizzle backend, SQLite database.

## Setup

```bash
./bootstrap.sh
# or: npm run setup
```

This installs dependencies, creates `backend/.env` if missing, and runs database migrations.

## Development

```bash
npm run dev
```

Starts both servers concurrently:
- Frontend: http://localhost:5173
- Backend: http://localhost:3000

The frontend proxies `/api`, `/images`, and `/thumbnails` requests to the backend.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start frontend + backend |
| `npm run dev:frontend` | Start frontend only |
| `npm run dev:backend` | Start backend only |
| `npm run build` | Build both for production |
| `npm run db:generate` | Generate migrations after schema changes |
| `npm run db:migrate` | Run database migrations |
| `npm run db:studio` | Open Drizzle Studio (database GUI) |
