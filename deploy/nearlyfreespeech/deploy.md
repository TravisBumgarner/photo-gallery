# Deploy to NearlyFreeSpeech.NET

NFSN is cheap, persistent shared hosting with SSH/rsync and a "Daemon" feature
for long-running processes. The disk **is** persistent here, so this follows the
rsync / clone-of-local model — no bucket needed.

The shape: rsync the published output up, run the backend as a daemon, and let
NFSN's web server proxy requests to it.

## 1. Create the site

Make an NFSN site (a "Custom" site works). Note its SSH host and that the public
web root is `/home/public`, with private files under `/home/private`.

## 2. rsync the published output

```bash
./ingest-and-sync                                   # publishes to data/out
rsync -avz data/out/   USER_SITE@ssh.phx.nearlyfreespeech.net:/home/private/data/out/
rsync -avz --exclude node_modules ./   USER_SITE@ssh.…:/home/private/app/
```

## 3. backend `.env` on the host

`/home/private/app/backend/.env`:

```ini
PORT=8084
NODE_ENV=production
DATABASE_URL=/home/private/data/served.sqlite
STORAGE_URL=file:///home/private/data/out
APP_PASSWORD=…
SESSION_SECRET=…
CORS_ORIGIN=https://your-site.nfshost.com
# MEDIA_BASE_URL left unset — the backend serves /images + /thumbnails itself.
```

Build it: `cd /home/private/app/backend && npm ci && npm run build`.

## 4. Run it as a daemon + proxy

In the NFSN control panel, add a **Daemon** that runs
`node /home/private/app/backend/dist/index.js` (it stays up and restarts on
crash). Then route the public site to it — NFSN's web server proxies to the
daemon's `PORT`; set the site to **proxy** all requests to `127.0.0.1:8084`
(NFSN: "Proxy" server type, or an `.htaccess`/site config pointing at the port).

Now `https://your-site/` reaches the backend, which serves the UI's API,
`/images`, and `/thumbnails` from the rsynced files.

> Faster media: instead of proxying `/images` + `/thumbnails` to Node, drop those
> two folders in `/home/public/` and let NFSN's web server serve them statically;
> proxy only `/api` to the daemon. Same URLs, no Node in the image path.

Updating = re-run `./ingest-and-sync`, rsync `data/out/` again, restart the daemon.
