# offline-processing

Takes your photos and produces the gallery's searchable data — **text tags +
vector search, faces, and dogs**. Text tagging also needs a **vision LLM** over an
OpenAI-compatible API (e.g. Ollama); skip it and you don't.

## Running it

Everything runs natively through the one wizard, from the repo root:

```bash
./ingest-and-sync
```

It installs dependencies on first run, walks first-time setup (hosting, tagging
model, gallery password), then processes your photos and publishes the gallery.
The only Docker it touches is the **vision-server** (faces/dogs), which it brings
up on demand — nothing else needs containers.

| Piece | What it does |
| --- | --- |
| `src/` | The pipeline tasks (`ingest` / `tag` / `detect-faces` / `cluster-faces` / `detect-dogs` / `cluster-dogs` / `publish`), run natively via `tsx` |
| `vision-server/` | Python sidecar: face + dog detection and embeddings (the one Docker container) |
| `src/label-app/` | Web UI to label face/dog clusters (`npm run label`; the wizard opens it for you) |
| `offline-processing.config.yaml` | Tuning knobs (committed) |
| `docker-compose.yml` | The vision-server, plus the auth gateway used by `./model-server` |

## How it runs

The home menu is the pipeline, one stage at a time — run any on its own, or let
them chain (Add offers to Process next; Process offers to deploy at the end):

- **Add photos** — get images into the staging inbox at the repo root,
  **`pending-ingestion/`** (gitignored, created for you):
  - *Import a Lightroom export* — point at the export folder; images are moved in
    for you (nesting preserved — `2023/Italy/beach.jpg` → keywords `2023`, `Italy`).
  - *Add photos manually* — drop images into `pending-ingestion/` directly (the
    wizard can open the folder for you).
- **Process photos** — ingest → tag → faces/dogs → cluster → label → publish.
  **Resumable and incremental:** run it again anytime to pick up newly-added
  photos or finish an interrupted run — tags/faces/dogs are tracked per photo, so
  it only touches what isn't done yet. After processing, originals are moved into
  a `_already_processed/` archive inside the inbox so they aren't re-scanned.
- **Serve / deploy the gallery**.

Reads JPG, PNG, GIF, BMP, TIFF, WebP — not HEIC or RAW (convert those first).

**Lightroom:** install the preset (`File → Export → Add` →
`lightroom-export-presets/To Mobile Photo Gallery.lrtemplate`). It writes viewing
copies named `<name>_exported_for_viewing_locally.jpg` — **do not change that
suffix**. Export, then **Add photos → Import a Lightroom export** and point at
the export folder.

**Start over** (wipe the database and reprocess everything from scratch — your
photo files are kept) lives under **Settings**.

## Configuration

**`.cli-cache`** (per-machine, gitignored) holds your answers and is written by
`./ingest-and-sync` (and `./model-server`) as you go — you don't edit it by hand:

| Key | Meaning |
| --- | --- |
| `DATABASE_URL`, `DESTINATION_DIRECTORY` | Local DB + image/thumbnail output |
| `MODEL_SERVER_HOST` / `_MODEL` / `_API_KEY` | Vision LLM for text tags |
| `VISION_SERVER_HOST` / `_API_KEY` | Vision server (defaults to the local container) |
| `GATEWAY_TOKEN`, `COMPUTE_HOST` | Set when pointing at a remote `./model-server` |

The staging inbox is **not** configurable — it's always `pending-ingestion/` at
the repo root.

**`offline-processing.config.yaml`** (committed) holds tuning knobs; omit any to
use its default:

| Path | Default | Controls |
| --- | --- | --- |
| `images.thumbnail.width` / `.quality` | `300` / `85` | Grid thumbnail size + quality |
| `images.full.maxDimension` / `.quality` | `null` / `90` | `null` = store originals untouched; a number downscales the longest edge |
| `images.blurhash.componentsX/Y` | `4` / `3` | Blurhash placeholder detail |
| `ingest.batchSize` | `20` | Images per parallel batch |
| `tagging.concurrency` / `.prompt` | `2000` / built-in | In-flight vision-LLM requests + tag prompt |
| `faces.detect.concurrency` / `dogs.detect.concurrency` | `4` / `2` | Detection parallelism |
| `faces.cluster.{eps,minPts,stickyAssignDist}` | `0.45 / 3 / 0.45` | Face clustering thresholds |
| `dogs.cluster.{eps,minPts,stickyAssignDist}` | `0.35 / 3 / 0.35` | Dog clustering (tighter — DINOv2 is noisier) |
| `labelApp.port` / `.sampleFacesPerCluster` | `5180` / `9` | Tagging UI port + crops per cluster |

The Python vision server's own knobs (`VISION_DET_SIZE`, `VISION_DOG_DET_CONF`,
`VISION_CONCURRENCY`) live in `docker-compose.yml`.

## Run the models on another machine

Two things do the heavy lifting: the **vision-server** (faces + dogs) and a
**vision LLM** for tags (Ollama). By default both run on this machine — the wizard
starts Ollama and the vision-server for you.

To offload them to a beefier box, run this on **that** machine:

```bash
./model-server
```

It starts Ollama (GPU) + the vision-server behind a single **token-protected
gateway** on `:8443` (raw ports stay closed) and prints its address + token. Back
on your main machine, enter those at the **"Where's the tagging model running?"**
setup prompt.

> The token crosses the LAN in cleartext (plain HTTP) — fine on a trusted network,
> tunnel it (VPN/SSH) otherwise. Stop the server with Ctrl-C (or
> `docker compose --profile server down` in `offline-processing/`).
>
> Face/pet data is biometric-class — it stays on your machines and never goes to prod.

## Hardware & timing

The AI steps are compute-heavy and **can take a long time** — plan for hours, not
minutes, on a large library:

- **Tagging** runs a vision LLM over every photo: far faster on a GPU,
  seconds-to-minutes per image on CPU. Offload it with `./model-server` (above).
- **Face/dog detection** runs the vision server (InsightFace / YOLOv8 + DINOv2) on
  CPU — fine for a personal library, but still minutes-to-hours at scale.
- **Clustering** (DBSCAN) is quick by comparison but scales with the face/dog count.
- First runs **download models** (~330MB vision server, ~34MB text embedder, plus
  your Ollama vision model), so the first pass is slower still.

Every step is **resumable** — tagging/detection only touch rows not yet done, so an
interrupted run (or a machine that needs to sleep) picks up where it left off. A
realistic workflow: add photos, then leave tagging/detection running overnight.

## Labeling

After detection + clustering, the wizard opens the labeling UI
(`http://localhost:5180`): toggle People/Dogs, name a cluster and **Save**,
**Ignore** noise, or **Merge** several into one. Your labels are reattached to the
clusters on the next run and survive re-clustering.
