# offline-ingestion

Everything needed to take a folder of photos and turn it into the gallery's
searchable data — **text tags + vector search, people (faces), and dogs** — in
one self-contained, Dockerized place. This replaces the old split across
`vision-server/`, `ingestion/`, and the tagging UI that used to live in
`frontend/`.

You point it at a photo collection, pick what you want, and it runs the whole
pipeline in containers. The only thing you install is **Docker**.

---

## What's in here

| Piece | What it does | Where it runs |
| --- | --- | --- |
| **`oi`** | Host launcher — the interactive menu that drives everything | Your machine (bash) |
| **`prepare-lightroom`** | Optional prep: move Lightroom export copies into the ingestion folder | Your machine (bash) |
| **`vision-server/`** | Python vision sidecar: face + dog detection and embeddings | Docker (local or a remote box) |
| **`src/`** | The pipeline: ingest, text-tag, detect/cluster faces & dogs, sync | Docker (`cli`) |
| **`src/label-app/`** | Standalone web UI to label face/dog clusters | Docker (`label-app`) |
| **`offline-ingestion.config.yaml`** | Tuning knobs (sizes, quality, concurrency, clustering) | — |
| **`docker-compose.yml`** | Wires the services + volumes together | — |

The orchestrator runs on the **host** (so it can check Docker, mount your photo
folder, and start containers); the actual work runs **in containers** (so there
are no Python/Node/ML dependencies to install).

---

## Prerequisites

- **Docker** with Compose v2 (`docker compose`). That's it.
  - Install: <https://docs.docker.com/get-docker/>
- A **vision LLM** reachable over an OpenAI-compatible API for text tagging
  (e.g. a box running Ollama/vLLM, or the optional bundled `ollama` service).
  Not needed if you skip the text-tag task.

---

## Quick start

```bash
cd offline-ingestion
./oi                            # interactive menu — asks for everything it needs
```

`./oi` will:
1. Check Docker is installed and running.
2. Build the images on first run (cached afterwards).
3. Ask for your **photo folder**, **create vs update**, and **which tasks**.
4. Start the model server(s) it needs and run the pipeline.
5. Offer to open the **tagging UI** to label people and dogs.

You can pre-fill the folder: `./oi /path/to/photos`.

---

## Prepare the Photo Ingestion Directory

The pipeline ingests **one folder**: every image nested anywhere under it, in
whatever structure you choose. Folder names become browsable keywords. The
pipeline doesn't know or care how the photos got there — that's this prep step.
Point `SOURCE_DIR` (the "Photo folder" prompt) at this folder, and it processes
exactly what's inside.

### Manual Setup 

Nest folders however you like and drop images in — they'll be browsable. For
example:

```
photos/
  2023/
    Italy/        beach.jpg, ...
    Birthdays/    ...
  2024/
    ...
```

`2023`, `Italy`, `Birthdays` become keywords. Nothing else to do — run `./oi`
and point it at `photos/`.

### Lightroom Setup

Keep exporting from Lightroom as usual; the gallery's folder structure mirrors
your Lightroom folders.

1. **Install the export preset** — in Lightroom, **File → Export → Add**, then
   import `lightroom-export-presets/To Mobile Photo Gallery.lrtemplate`. It
   writes JPEG viewing copies named `<name>_exported_for_viewing_locally.jpg` 
   alongside your originals. ‼️⚠️ **Do not change this sufix.** ‼️⚠️ Any other params in the export preset can be changed.
2. **Export** your photos with the preset.
3. **Prepare the ingestion folder** — run `./prepare-lightroom`. It moves only
   the `*_exported_for_viewing_locally` copies out of your Lightroom export
   directory and into the ingestion folder, **preserving the folder structure**.
   Your originals/RAW stay where they are.

   ```bash
   ./prepare-lightroom # Without Path   
   ./prepare-lightroom path/to/lightroom # With Path
   ```

4. **Run `./oi`** pointed at that ingestion folder — it now contains only the
   viewing copies, mirroring your Lightroom layout, and ingests cleanly.

Set `LIGHTROOM_DIR` (export source) and `SOURCE_DIR` (ingestion folder) in
`.cli-cache` so the prompts pre-fill.

---

## Configuration — two files

Configuration is split by kind:

### `.cli-cache` — environment & secrets (per machine, gitignored)

Created automatically on first run and filled in as you answer `./oi`'s prompts —
you don't write it by hand. It just remembers your answers between runs. Holds
paths, hosts, and keys:

| Key | Meaning |
| --- | --- |
| `SOURCE_DIR` | Default photo folder (the menu lets you override) |
| `DATABASE_URL`, `DESTINATION_DIRECTORY` | Local DB + image output (host runs only — Docker overrides these) |
| `MODEL_SERVER_HOST` / `_MODEL` / `_API_KEY` | Vision LLM for text tags |
| `VISION_SERVER_HOST` / `_API_KEY` | Vision server (defaults to the local container) |
| `SSH_HOST` | Target for sync-to-prod |
| `INGEST_MODE`, `DRY_RUN`, `FILE_TRANSFER_MODE` | Run behavior (`copy` keeps originals; `cut` moves them) |

### `offline-ingestion.config.yaml` — tuning knobs (committed)

Optional and partial — anything you omit uses the default. Edit only what you
want to change; the menu and pipeline pick it up automatically (it's bind-mounted
into the containers).

| Path | Default | What it controls |
| --- | --- | --- |
| `images.thumbnail.width` / `.quality` | `300` / `85` | Grid thumbnail size + JPEG quality |
| `images.full.maxDimension` | `null` | `null` = store originals untouched. A number downscales the longest edge |
| `images.full.quality` | `90` | Re-encode quality when downscaling |
| `images.blurhash.componentsX/Y` | `4` / `3` | Blurhash placeholder detail |
| `ingest.batchSize` | `20` | Images processed per parallel batch |
| `tagging.concurrency` | `2000` | In-flight vision-LLM requests |
| `tagging.prompt` | (built-in) | The tag-generation prompt |
| `faces.detect.concurrency` / `dogs.detect.concurrency` | `4` / `2` | Detection request parallelism |
| `faces.cluster.{eps,minPts,stickyAssignDist}` | `0.45 / 3 / 0.45` | Face clustering thresholds |
| `dogs.cluster.{eps,minPts,stickyAssignDist}` | `0.35 / 3 / 0.35` | Dog clustering (tighter — DINOv2 is noisier) |
| `labelApp.port` / `.sampleFacesPerCluster` | `5180` / `9` | Tagging UI port + crops shown per cluster |

(The Python vision server's own knobs — detection size, dog confidence, its internal
concurrency — are set via `VISION_DET_SIZE` / `VISION_DOG_DET_CONF` / `VISION_CONCURRENCY`
in `docker-compose.yml`, not here.)

---

## Model servers: local or remote

Two model servers do the heavy lifting: the **vision-server** (faces + dogs, in
Docker) and a native, GPU-backed **Ollama** (the vision LLM for text tags). You
can run them on the same machine as the gallery, or offload them to a beefier box.

`./oi` asks one question — **"Model server host"**:

- **`localhost` (default):** both run here. Faces/dogs in Docker; tagging on a
  native Ollama that `./oi` checks is up (it walks you through installing/starting
  it — see <https://ollama.com/download>). Local servers need no auth.
- **another machine's IP:** that box serves the models to this one. Run
  **`./oi --server`** over there first (next section).

Face/pet data is biometric-class — it stays on your machines and never goes to prod.

### Serving models from another machine — `./oi --server`

On the box with the GPU:

```bash
./oi --server
```

It pulls the vision model into native Ollama, starts the vision-server, and brings
up an **auth gateway** (Caddy) — a single token-protected port (`8443`) that fronts
both servers. The raw Ollama (`11434`) and vision-server (`8090`) ports are *not*
exposed on the LAN; the gateway is the only way in. It prints two things:

```
Model server host : 192.168.1.42
Gateway token     : 9f3c…
```

On your **main** machine, run `./oi`, enter that IP at "Model server host", and
paste the token. `./oi` routes both servers through `http://<ip>:8443` and sends the
token on every request.

> The token crosses the LAN in cleartext (plain HTTP) — fine on a trusted home
> network. Tunnel it (VPN/SSH) on anything you don't control. On **Linux**, Ollama
> must be bound beyond loopback so the gateway container can reach it:
> `OLLAMA_HOST=0.0.0.0:11434 ollama serve` (the macOS Ollama app already works).
> Stop the server with `docker compose --profile server down`.

---

## Create vs update

- **Create (fresh):** wipes the local DB + images and processes everything from
  scratch.
- **Update:** keeps existing data, ingests only new photos, and runs each task
  only on rows that haven't been processed yet (tags / faces / dogs are tracked
  per photo, so re-runs are safe and resumable). Re-run clustering after new
  detections to fold new faces/dogs into existing people/pets.

---

## Tagging UI (label-app)

After detection + clustering, label who's who:

```bash
docker compose up -d label-app      # ./oi also offers to do this
# open http://localhost:5180
```

Toggle **People / Dogs**, switch between **Unlabeled / Labeled / Ignored**, type
a name and **Save**, **Ignore** noise clusters, or check several and **Merge**
them into one. It writes directly to the same `sqlite.db` — no main backend
required.

---

## Sync to production

The menu can sync at the end, or run it manually:

```bash
docker compose run --rm cli npm run sync-db
docker compose run --rm cli npm run sync-images
```

Sync uses rsync over SSH; the `cli` container mounts your `~/.ssh` read-only.
Prod is always a full clone of local.

---

## Running tasks without the menu

`./oi` is just a friendly wrapper. Any individual task can be run directly
(`ASSUME_YES=1` skips confirmation prompts, which the launcher sets):

```bash
export SOURCE_DIR=/path/to/photos          # needed for the cli photo mount
docker compose run --rm cli npm run ingest
docker compose run --rm cli npm run tag
docker compose run --rm cli npm run detect-faces
docker compose run --rm cli npm run cluster-faces
docker compose run --rm cli npm run detect-dogs
docker compose run --rm cli npm run cluster-dogs
```

These scripts can also run **on the host** (`npm install` first, then
`npm run <task>` from this directory) if you'd rather not use Docker — the paths
default to `../backend/...` in that mode.

---

## How it fits together

```
        ┌─────────────── host: ./oi (bash) ───────────────┐
        │  checks Docker · mounts photos · runs the menu   │
        └───────┬───────────────┬───────────────┬──────────┘
                │ up -d          │ run --rm      │ up -d
                ▼                ▼               ▼
        ┌───────────────┐ ┌─────────────┐  ┌──────────────┐
        │ vision-server │ │     cli     │  │  label-app   │
        │  (Python ML)  │◀│  pipeline   │  │  tagging UI  │
        └───────────────┘ └──────┬──────┘  └──────┬───────┘
                                 │                 │
                          ../backend (sqlite.db, public/images, thumbnails)
```
