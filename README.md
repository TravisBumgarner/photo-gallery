# Photo Gallery

Self-hosted photo gallery for browsing Lightroom photos quickly.

## Features

- Browse thousands of photos without lag
- Filter by camera, lens, date, rating, color label, and more
- Navigate by folder structure
- Search your entire library
- Semantic content search ("photos of mountains at sunset") via vision-LLM tagging
- People and pets search via local face recognition (label clusters once, search by name)
- See stats about your photography habits
- Works on phone and desktop
- Password protected
- Easy Lightroom export workflow

![Photo Gallery Grid](readme/grid.png)
![Photo Detail Single Photo](readme/photo.png)
![Photo Stats](readme/stats.png)

Built with React + Vite, Express + Drizzle, and SQLite. Managed via npm workspaces.

## Local Setup

```bash
./bootstrap.sh
```

This installs dependencies, copies `.env.example` files, and runs database migrations. Once done, configure your `.env` files (see below) and run `npm run dev` (frontend on :5200, backend on :8084).

## Configuration

### `backend/.env`

- `PORT` - Server port (default `8084`)
- `DATABASE_URL` - Path to the SQLite database file
- `NODE_ENV` - `development` or `production`
- `SESSION_SECRET` - Secret for signing session cookies (use a strong random value)
- `APP_PASSWORD` - Password for logging into the app (use a strong random value)

### `ingestion/.env`

- `DATABASE_URL` - Path to the SQLite database file (default `../backend/sqlite.db`)
- `SOURCE_DIR` - Directory to scan for exported photos
- `INGEST_MODE` - Kept as a safety guard for `clear-production-db` (`production` required there). Ingestion itself is always local.
- `DRY_RUN` - `true` to preview without processing, `false` to run for real
- `SSH_HOST` - Remote host for rsync (used by `sync-to-prod` and `clear-production-db`)
- `DESTINATION_DIRECTORY` - Local image root for ingest, also used as the remote root by `sync-to-prod` when reading `.env.production`
- `MODEL_SERVER_HOST` - URL of the model server used for content tagging (e.g. `http://192.168.1.22:8080`). See [Model Server](#model-server) below.
- `MODEL_SERVER_MODEL` - Vision-capable model name to use on the model server (e.g. `gemma4:e4b`, `moondream`, `llava`). Must match a model installed on the Ollama instance.
- `VISION_SERVER_HOST` - URL of the local vision server used for people search (e.g. `http://127.0.0.1:8090`). See [Vision Server](#vision-server) below.
- `VISION_SERVER_API_KEY` - Optional bearer token for the vision server. Leave empty if you didn't set one.

## Model Server

The tagging step (used for content search) calls a separate machine running [Ollama](https://ollama.com) behind a small FastAPI wrapper.

### Setup on the model server

1. Install Ollama and pull a vision-capable model:

   ```bash
   ollama pull gemma4:e4b
   ```

   Other vision-capable options: `llava`, `moondream`, `bakllava`, `llama3.2-vision`. Whichever you pick, set `MODEL_SERVER_MODEL` in `ingestion/.env.*` to match.

2. Save the following as `server.py`:

   ```python
   import asyncio
   import socket
   import uvicorn
   import ollama
   from fastapi import FastAPI
   from pydantic import BaseModel

   PORT = 8080

   app = FastAPI()
   client = ollama.AsyncClient()
   sem = asyncio.Semaphore(4)

   class GenerateRequest(BaseModel):
       model: str
       prompt: str
       images: list[str] = []

   @app.post("/api/generate")
   async def process(req: GenerateRequest):
       async with sem:
           response = await client.chat(
               model=req.model,
               messages=[{"role": "user", "content": req.prompt, "images": req.images}],
           )
       return {"response": response.message.content}

   class BatchRequest(BaseModel):
       requests: list[GenerateRequest]

   @app.post("/api/generate/batch")
   async def process_batch(batch: BatchRequest):
       async def run(req: GenerateRequest):
           response = await client.chat(
               model=req.model,
               messages=[{"role": "user", "content": req.prompt, "images": req.images}],
           )
           return response.message.content

       results = await asyncio.gather(*[run(r) for r in batch.requests])
       return {"responses": results}

   if __name__ == "__main__":
       # macOS: socket.gethostbyname(socket.gethostname()) raises gaierror on
       # most networks. Open a UDP socket toward a public IP (no packets sent)
       # and read getsockname() to get the LAN-reachable address.
       s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
       try:
           s.connect(("8.8.8.8", 80))
           ip = s.getsockname()[0]
       finally:
           s.close()
       print(f"Server: http://{ip}:{PORT}")
       uvicorn.run(app, host="0.0.0.0", port=PORT)
   ```

3. Save the following as `requirements.txt`:

   ```
   fastapi
   uvicorn
   ollama
   ```

4. Install and run:

   ```bash
   python -m venv .venv
   .venv/bin/pip install -r requirements.txt
   .venv/bin/python server.py
   ```

   On startup it prints the URL to use for `MODEL_SERVER_HOST`.

## Vision Server

The people-search step calls a small local [InsightFace](https://github.com/deepinsight/insightface) server. It runs detection (SCRFD) and embedding (ArcFace, 512-d) on CPU — fast enough for a personal library. **Run it locally and never push face data off-machine** — embeddings are biometric data.

Source lives in `vision-server/`:

```bash
cd vision-server
python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python server.py
```

On startup it prints the URL to use for `VISION_SERVER_HOST`. Models auto-download to `~/.insightface/models/` on first run (~330MB).

Optional env vars:

- `PORT` — defaults to `8090`
- `VISION_SERVER_API_KEY` — if set, requires a matching `Authorization: Bearer …` header
- `DET_SIZE` — detection input size (default `640`). Larger catches smaller faces, slower.
- `CONCURRENCY` — number of in-flight `/detect` calls (default `4`)

## Ingestion

Ingestion takes photos out of your library, extracts metadata, generates thumbnails, and loads the data into the database.

1. Preparing Photos
    - Lightroom:
        1. `File -> Export` and click `Add`. Select the preset in `lightroom-export-presets`.
        2. Selecting `Export To: Same folder as original photo` will allow the Photo Gallery to generate a folder structure for ease of navigation. Alternatively select a single folder outside of the library to not take advantage of this feature.
    - No other apps are currently supported, feel free to reach out if another is wanted.

2. `npm run ingest`

### Extracting exported originals

Lightroom's "export for viewing locally" preset writes files with the suffix `_exported_for_viewing_locally`. Two helper scripts pull those out of `SOURCE_DIR` and put them back:

- `npm run extract-exported` — moves every matching file under `SOURCE_DIR` into `~/Desktop/exported_for_viewing_locally/` and writes `moved_files.json` (a manifest of original → new paths).
- `npm run put-back-exported` — reads the manifest and reverses each move. After a fully-successful restore the manifest and (now-empty) folder are removed.

Both default to `.env.local`; pass `production` as an arg to use `.env.production`.

## Content Tagging

Run after ingestion. Each photo is tagged by the [model server](#model-server)'s vision LLM, and the tag string is embedded into a 384-d vector with `BAAI/bge-small-en-v1.5`. Backend and tagger both run the embedder in-process via `onnxruntime-web` (WASM), so no FreeBSD-incompatible native bindings are required and no embedding service is reachable from prod at query time.

Tagging is resumable — each run only processes rows where `tags IS NULL`, so re-running picks up where a prior run stopped or crashed.

`npm run tag` — tags rows in the local SQLite where `tags IS NULL`. Reads images from `backend/public/images/`. On first run, downloads ~34MB of ONNX model + tokenizer to `backend/models/bge-small-en-v1.5/` (gitignored). To push the new tags to prod, run `npm run sync-to-prod` (see [Deployment](#deployment)) and restart the backend.

## People Search

Run after ingestion to enable searching by labeled person ("mom", "alex"). Faces are detected and embedded by the local [vision server](#vision-server), then clustered locally and labeled by you in the `/people` UI.

Two-step pipeline:

1. `npm run detect-faces` — for each photo where `faces_processed_at IS NULL`, calls the vision server, writes per-face rows (bbox + 512-d embedding) to the `faces` table, marks the photo processed. Resumable.
2. `npm run cluster-faces` — runs DBSCAN over all face embeddings (cosine distance, `eps=0.45`, `minPts=3`) and groups similar faces into `face_clusters` rows. Re-runnable: clusters you've already labeled or ignored stay sticky, and new faces close to a sticky centroid get auto-assigned to it.

Then open the local gallery, sign in, and visit `/people` to label each cluster. Face thumbnails are cropped on the fly from the photo thumbnails using stored bbox coords. To make people search work in prod, run `npm run sync-to-prod` after labeling and restart the backend.

When you ingest more photos later, just re-run both scripts — `detect-faces` only processes new rows, and `cluster-faces` keeps your existing labels.

## Dog Search

Mirrors the people pipeline but for individual dogs. The same local [vision server](#vision-server) handles dog detection too — `/detect-dogs` uses YOLOv8n for detection and DINOv2-small for instance-level embeddings (384-d). The dog models lazy-load on first call so face-only users don't pay the startup cost.

Quality note: dog identification is meaningfully noisier than human face recognition (no equivalent of ArcFace exists for individual dogs). Expect more split clusters of the same dog and use the merge button (or just label both clusters with the same name) to combine them.

Two-step pipeline, same as faces:

1. `npm run detect-dogs` — for each photo where `dogs_processed_at IS NULL`, calls `/detect-dogs`, writes per-dog rows to the `dogs` table.
2. `npm run cluster-dogs` — DBSCAN over dog embeddings (`eps=0.35`, `minPts=3`, tighter than faces to favor splits over false merges).

Then visit `/dogs` locally to label each cluster, and use the **Dogs** filter in the gallery sidebar. Run `npm run sync-to-prod` and restart the backend to push the labels to prod.

## Deployment

```bash
./deploy.sh
```

Builds the frontend and backend locally, then syncs everything to the remote NearlyFreeSpeech host (`nfs_photo-gallery`). The script:

1. Installs dependencies and builds both frontend (Vite) and backend (TypeScript)
2. Rsyncs the compiled backend, frontend dist, migrations, and `run.sh` to `/home/protected/`
3. Installs production dependencies on the remote server and sets permissions

The remote `.env` is **not** overwritten by the deploy — manage it on the server directly. The remote `sqlite.db` and image dirs are managed via `sync-to-prod` (below). In production the backend serves the frontend dist, so no separate web server is needed for the SPA.

**Prod is always a full mirror of local.** All AI work (ingest, tag, face/dog detection + clustering, labeling) runs against the local DB and image dirs; the sync scripts then rsync the result up. There is no per-pipeline push, no manifest merge.

Three atomic sync scripts plus a composite, all run from the repo root:

```bash
npm run sync-db        # rsync sqlite.db
npm run sync-images    # rsync public/images/ + public/thumbnails/ (with --delete)
npm run sync-code      # runs deploy.sh — builds and pushes frontend + backend
npm run sync-to-prod   # composite: db + images + code
```

`sync-db` and `sync-images` read `ingestion/.env.production` for `SSH_HOST` and `DESTINATION_DIRECTORY` and prompt for confirmation; `sync-code` runs `deploy.sh` non-interactively.

**Stop the prod backend before `sync-db`** to avoid a SQLite write race, and restart it after so the in-memory embedding cache reloads. `sync-images` uses `--delete` so anything on prod that's not on local gets wiped — that's the clone semantic.

To wipe the prod DB and images (e.g. before a clean re-ingest):

```bash
cd ingestion && npm run clear-production-db
```

Refuses to run unless `INGEST_MODE=production` and `SSH_HOST` are set in `.env.production`, and prompts you to type the SSH host name back. Deletes `sqlite.db`, `public/images/`, and `public/thumbnails/`, then re-runs migrations to leave an empty schema.

The matching local helper (`npm run clear-local-db`) does the same against your local DB and `backend/public/images|thumbnails`; it prompts you to type the DB filename to confirm.

Two chained scripts handle the full workflow from `ingestion/`:

- `npm run nukedb-ingest-tag` — wipes local + prod, re-ingests from `SOURCE_DIR`, tags, syncs DB + images to prod, then moves the originals out of `SOURCE_DIR` to your Desktop. Each underlying script's confirmation prompt still fires.
- `npm run upsert-ingest-tag` — same minus the wipes. Idempotent: ingests any new photos in `SOURCE_DIR`, tags only rows where `tags IS NULL` (so a partial prior run resumes), syncs DB + images to prod, then archives originals to your Desktop. Ingest and tag print before/after row counts (`new`, `updated`, `tagged`, `untagged`) so you can see how the totals move.

Note: the chained scripts only push DB + images, not code (code rarely changes during an ingest cycle — run `npm run sync-code` from the repo root separately when you have code changes). Face/dog detection and clustering are also not in the chained scripts — run them manually after ingest if needed, then re-run `npm run sync-db`.

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
