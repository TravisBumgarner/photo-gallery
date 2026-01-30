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
| `npm run process-images` | Process photos into the gallery |

## Processing Images

```bash
npm run process-images [path-to-photos]
```

On startup the script prompts for **Development** or **Production** mode:

- **Development (`d`)** — uses the local `.env` database, reads/writes images locally. Behaves the same as before.
- **Production (`p`)** — SCP's the remote SQLite database from the production server, processes images locally, then rsync's images, thumbnails, and the updated database back to the remote server.

Production mode requires SSH access to the host alias `nfs_photo-gallery` (configure in `~/.ssh/config`). The remote layout is:

```
/home/protected/
├── sqlite.db
└── public/
    ├── images/
    └── thumbnails/
```

The script also checks for orphaned database rows (rows referencing images that no longer exist on disk or the remote server) and offers to clean them up before processing.

## Deployment

```bash
./deploy.sh
```

Builds the frontend and backend locally, then syncs everything to the remote NearlyFreeSpeech host (`nfs_photo-gallery`). The script:

1. Installs dependencies and builds both frontend (Vite) and backend (TypeScript)
2. Rsync's the compiled backend, frontend dist, migrations, and `run.sh` to `/home/protected/`
3. Installs production dependencies on the remote server and sets permissions

The remote `.env` and `sqlite.db` are **not** overwritten by the deploy — manage those on the server directly. In production the backend serves the frontend dist, so no separate web server is needed for the SPA.

Remote layout after deploy:

```
/home/protected/
├── dist/              # backend compiled JS
├── frontend-dist/     # frontend built assets
├── drizzle/           # migration files
├── public/
│   ├── images/
│   └── thumbnails/
├── sqlite.db
├── .env
├── package.json
├── run.sh
└── node_modules/
```
