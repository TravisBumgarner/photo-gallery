# Photo Gallery

Self hosted mobile photo gallery for browsing Lightroom photos quickly.

![Photo Gallery Interface](readme/intro.png)

Built with React + Vite, Express + Drizzle, and SQLite. Managed via npm workspaces.

## Local Setup

1. `npm install`
1. `cp backend/.env.example backend/.env`
1. `cp ingestion/.env.example ingestion/.env`
1. `npm run db:migrate`
1. Ingestion (see below)
1. `npm run dev` (frontend on :5173, backend on :3000)

## Ingestion

Ingestion takes photos out of your library, extracts metadata, generates thumbnails, and loads the data into the database.

1. Preparing Photos
    - Lightroom:
        1. `File -> Export` and click `Add`. Select the preset in `lightroom-export-presets`.
        2. Selecting `Export To: Same folder as original photo` will the Photo Gallery to generate a folder structure for ease of navigation. Alternatively select a single folder.
    - No other apps are currently supported, feel free to reach out if another is wanted.

1. Configure `ingestion/.env`
    - `DATABASE_URL` - Path to the SQLite database file
    - `SOURCE_DIR` - Directory to scan for exported photos
    - `INGEST_MODE` - `local` for development, `production` to enable rsync to remote server
    - `DRY_RUN` - `true` to preview without processing, `false` to run for real
    - `IMAGE_EXTENSIONS` - Comma-separated list of file extensions to include
    - `SSH_HOST` - Remote host for rsync (production mode only)
    - `SSH_DEST_DIR` - Remote directory for rsync (production mode only)
    - `SESSION_SECRET` - Secret for signing session cookies (Use a strong random value)
    - `APP_PASSWORD` - Password for logging into the app (Use a strong random value)
    - `CORS_ORIGIN` - Frontend origin for CORS (e.g. `http://localhost:5173`)


1. `npm run ingest`

## Deployment

```bash
./deploy.sh
```

Builds the frontend and backend locally, then syncs everything to the remote NearlyFreeSpeech host (`nfs_photo-gallery`). The script:

1. Installs dependencies and builds both frontend (Vite) and backend (TypeScript)
1. Rsync's the compiled backend, frontend dist, migrations, and `run.sh` to `/home/protected/`
1. Installs production dependencies on the remote server and sets permissions

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
