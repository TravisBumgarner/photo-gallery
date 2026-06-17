# offline-processing

Takes a folder of photos and produces the gallery's searchable data — **text tags +
vector search, faces, and dogs**. Text tagging also needs a **vision LLM** over an
OpenAI-compatible API (e.g. Ollama); skip it and you don't.

**Two ways to run it:**

- **`./ingest-and-sync` from the repo root (recommended)** — the native cross-platform
  wizard. It runs the `src/` tasks directly with `tsx`; the only Docker touch is the
  vision-server (faces/dogs).
- **`./oi` in this folder** — the self-contained launcher that runs every task inside
  Docker containers instead. Needs only Docker (Compose v2) + bash.

| Piece | What it does |
| --- | --- |
| `src/` | The pipeline tasks (`npm run ingest`/`tag`/`detect-faces`/… via `tsx`) |
| `oi` | Standalone launcher that runs those tasks inside Docker |
| `vision-server/` | Python sidecar: face + dog detection and embeddings (Docker) |
| `src/label-app/` | Web UI to label face/dog clusters |
| `offline-processing.config.yaml` | Tuning knobs (committed) |
| `docker-compose.yml` | Wires the Docker services + volumes (the `./oi` path) |

## Quick start

```bash
./ingest-and-sync     # native wizard, from the repo root
# or, the Docker path:
cd offline-processing && ./oi      # or: ./oi /path/to/photos
```

`./oi` checks Docker, builds images on first run, asks for your photo folder /
create-vs-update / tasks, runs the pipeline, then offers the tagging UI.

- **Create:** wipes local DB + images, processes everything fresh.
- **Update:** ingests only new photos and processes only unprocessed rows (tags/faces/
  dogs are tracked per photo, so re-runs are safe). Re-run clustering after new
  detections to fold them into existing people/pets.

## Prepare the photo folder

The pipeline ingests **one folder**: every image nested under it, in whatever structure
you choose. Folder names become browsable keywords. Just nest folders and drop images in
(`2023/Italy/beach.jpg` → keywords `2023`, `Italy`), then point `./oi` at it.

**Lightroom:** install the preset (`File → Export → Add` →
`lightroom-export-presets/To Mobile Photo Gallery.lrtemplate`). It writes viewing copies
named `<name>_exported_for_viewing_locally.jpg` — **do not change that suffix**. Export,
then pick the **Lightroom** source adapter in `./ingest-and-sync`: it asks for the export
folder, confirms it found exports, and moves only those copies into the ingestion folder
(preserving structure; originals/RAW stay put).

## Configuration

Two files. **`.cli-cache`** (per-machine, gitignored) holds paths/hosts/keys and is
written by `./oi` as you answer prompts — you don't edit it by hand:

| Key | Meaning |
| --- | --- |
| `SOURCE_DIR` | Default photo folder |
| `DATABASE_URL`, `DESTINATION_DIRECTORY` | Local DB + image output (host runs only — Docker overrides) |
| `MODEL_SERVER_HOST` / `_MODEL` / `_API_KEY` | Vision LLM for text tags |
| `VISION_SERVER_HOST` / `_API_KEY` | Vision server (defaults to the local container) |
| `INGEST_MODE`, `DRY_RUN`, `FILE_TRANSFER_MODE` | Run behavior (`copy` keeps originals; `cut` moves them) |

**`offline-processing.config.yaml`** (committed) holds tuning knobs; omit any to use its
default:

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

## Model servers: local or remote

Two servers do the heavy lifting: the **vision-server** (faces + dogs, Docker) and a
native GPU **Ollama** (vision LLM for tags). `./oi` asks one question — **"Model server
host"**:

- **`localhost` (default):** both run here; `./oi` walks you through starting Ollama.
- **another machine's IP:** run **`./oi --server`** on that box first. It pulls the
  vision model, starts the vision-server, and fronts both behind a token-protected Caddy
  gateway on `:8443` (raw ports stay closed). It prints the host IP + gateway token —
  enter those at the "Model server host" prompt on your main machine.

> The token crosses the LAN in cleartext (plain HTTP) — fine on a trusted network, tunnel
> it otherwise. On **Linux**, bind Ollama beyond loopback so the gateway can reach it:
> `OLLAMA_HOST=0.0.0.0:11434 ollama serve`. Stop with `docker compose --profile server down`.
>
> Face/pet data is biometric-class — it stays on your machines and never goes to prod.

## Hardware & timing

The AI steps are compute-heavy and **can take a long time** — plan for hours, not
minutes, on a large library:

- **Tagging** runs a vision LLM over every photo: far faster on a GPU, seconds-to-minutes
  per image on CPU. Offload it to a beefier box with `./oi --server` (above).
- **Face/dog detection** runs the local vision server (InsightFace / YOLOv8 + DINOv2) on
  CPU — fine for a personal library, but still minutes-to-hours at scale.
- **Clustering** (DBSCAN) is quick by comparison but scales with the face/dog count.
- First runs **download models** (~330MB vision server, ~34MB text embedder, plus your
  Ollama vision model), so the first pass is slower still.

Every step is **resumable** — tagging/detection only touch rows not yet done, so an
interrupted run (or a machine that needs to sleep) picks up where it left off. A realistic
workflow: ingest, then leave tagging/detection running overnight.

## Labeling & running tasks directly

After detection + clustering, label clusters in the UI (`docker compose up -d label-app`,
then open `http://localhost:5180`): toggle People/Dogs, name and **Save**, **Ignore**
noise, or **Merge** several into one. It writes straight to `sqlite.db`.

`./oi` is just a wrapper — any task runs directly (`ASSUME_YES=1` skips prompts):

```bash
export SOURCE_DIR=/path/to/photos
docker compose run --rm cli npm run ingest   # or tag / detect-faces / cluster-faces / detect-dogs / cluster-dogs
```

These also run on the host (`npm install`, then `npm run <task>`) if you'd rather skip
Docker — paths default to `../backend/...` in that mode.
