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

1. `npm run ingest`

## Deployment

1. `npm run build`
1. Set `INGEST_MODE=production`, `SSH_HOST`, and `SSH_DEST_DIR` in `ingestion/.env`
1. `node backend/dist/index.js`
1. Serve `frontend/dist/` via static file server or reverse proxy
