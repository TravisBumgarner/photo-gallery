# Run the gallery on this computer

Everything stays local — no bucket, no remote host. Good for viewing your own
library or trying it out.

## 1. Build + publish locally

```bash
./ingest-and-sync
```

Publishes the DB + media under `data/out` (`STORAGE_URL=file://…/data/out`).

## 2. Point the backend at it

`backend/.env`:

```ini
PORT=8084
NODE_ENV=production
DATABASE_URL=./data/served.sqlite
STORAGE_URL=file:///ABSOLUTE/PATH/TO/photo-gallery/data/out
# MEDIA_BASE_URL left unset — the backend serves media itself.
APP_PASSWORD=your-gallery-password
SESSION_SECRET=any-long-random-string
CORS_ORIGIN=http://localhost:8084
```

## 3. Start it

```bash
cd backend
npm run build
npm run start
```

Open <http://localhost:8084> and log in with `APP_PASSWORD`. (Point the web UI
at this backend with `EXPO_PUBLIC_API_BASE_URL=http://localhost:8084`.)

Re-run `./ingest-and-sync` when you add photos, then restart the backend.
