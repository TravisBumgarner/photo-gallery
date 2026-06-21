# Deploy templates

One folder per hosting target. `localhost/` and `nearlyfreespeech/` each have a
`deploy.md` (and NearlyFreeSpeech a `deploy.sh`) for getting the gallery online.

## How the gallery deploys

The serving side is one Node/Express app (`backend/`) that, at boot:

- **pulls the read-only DB** from `STORAGE_URL` (see `backend/src/boot.ts`), and
- **serves photo media** at `/images` and `/thumbnails` from local disk
  (`STORAGE_URL=file://…`). The web UI always loads `${backend}/images/<file>`.

Both supported targets serve everything from one host's disk — "prod is a clone
of local."

## Always start local

Build + publish on your machine first:

```bash
./ingest-and-sync
```

This processes your photos and publishes the slim DB + sidecars + media to
`STORAGE_URL` (`file://…/data/out`). You then rsync that output to the host (the
NearlyFreeSpeech deploy does this for you).

## Backend env

`backend/.env`:

| Var | Meaning |
| --- | --- |
| `PORT` | Port the backend listens on |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Local path the pulled read-only DB lands at (e.g. `./data/served.sqlite`) |
| `STORAGE_URL` | Where to pull the DB + media from: `file:///abs/path` |
| `BACKEND_SERVER` | `localhost` or `nearlyfreespeech` (boot-time config validation) |
| `APP_PASSWORD` | Gallery login password |
| `SESSION_SECRET` | Any long random string |
| `CORS_ORIGIN` | Origin the web UI is served from |

Targets: `localhost` · `nearlyfreespeech`
