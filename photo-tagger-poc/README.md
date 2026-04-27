# Photo Tagger

Tag photos with a vision LLM (via Ollama), store the tags + vector embeddings in
SQLite, and search semantically in a small React UI. `"clay art"` matches photos
tagged `ceramic, sculpture`; `"women"` matches `woman`.

## Layout

```
photo-tagger/
├── main.py              # populate script — tags images, writes to tags.db
├── db.py                # shared SQLite + FTS5 schema
├── search.py            # CLI semantic search
├── backfill.py          # one-shot: embed any photos rows missing from tags_vec
├── server.py            # FastAPI: /api/search and /api/image/{id}
├── requirements.txt     # fastapi, uvicorn, requests, sqlite-vec
├── package.json         # root: runs both servers via `concurrently`
└── frontend/            # Vite + React
    ├── package.json
    ├── vite.config.js   # proxies /api → :8000
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        └── styles.css
```

How it fits together: React posts `/api/search?q=...` → Vite proxies to FastAPI on
:8000 → FastAPI runs an FTS5 query against `tags.db` and returns
`[{id, path, tags, rank}]`. The grid renders `<img src="/api/image/{id}" />` and
FastAPI streams the file from disk using the absolute path stored at populate time.

## Setup

```
.venv/bin/pip install -r requirements.txt
npm install                       # installs concurrently at root
npm install --prefix frontend     # installs the React app
```

## Populate the DB

Point at an Ollama server with a vision-capable model and a folder of images.
Recurses into subdirectories. Re-runs upsert by absolute path, so they're
idempotent.

```
OLLAMA_HOST=http://192.168.1.22:8080 \
OLLAMA_MODEL=llava \
python main.py inputs/
```

Env vars:

| Var               | Default                    | Notes                                     |
| ----------------- | -------------------------- | ----------------------------------------- |
| `OLLAMA_HOST`     | `http://localhost:11434`   |                                           |
| `OLLAMA_MODEL`    | `gemma4:e4b`               | vision-capable (llava, moondream, llama3.2-vision, gemma3, …) |
| `EMBED_MODEL`     | `BAAI/bge-small-en-v1.5`   | fastembed model (in-process; first use downloads ~33MB to `~/.cache/fastembed/`) |
| `EMBED_DIM`       | `384`                      | must match the embedding model; if changed, `tags_vec` is auto-dropped on next connect (re-run `backfill.py`) |
| `MAX_CONCURRENCY` | `4`                        | up to N images in flight at once          |
| `MAX_IMAGES`      | `0`                        | cap for benchmarking; `0` = no cap        |

Output per image:
```
photo.jpg (3.42s) -> tag1, tag2, tag3, ...
```
…followed by a total at the end.

## Run the app

```
npm run dev
```

Starts FastAPI on :8000 and the Vite dev server on :5173, with interleaved
prefixed output. Ctrl-C kills both. Open http://localhost:5173.

## CLI search

```
python search.py "clay art"
python search.py "clay OR ceramic"
python search.py "sculpture AND tribal"
python search.py "studio*"
```

`LIMIT=N` env var caps results. Lower BM25 = better match.

## Notes / caveats

- **Semantic search via `sqlite-vec` + `fastembed`.** Each tag string is
  embedded in-process (ONNX) and stored in a `vec0` virtual table; queries
  embed the search string and rank by cosine distance. No external embedding
  service required at populate or query time — Ollama is only used for the
  vision tagging step. The FTS5 table is still in the schema but unused at
  query time — kept around so you can layer on hybrid ranking later if you
  want exact-keyword/boolean operators back.
- **Backfilling.** If you populated the DB before vectors were added, run
  `python backfill.py` once to embed existing rows. New runs of `main.py`
  embed inline.
- **Absolute paths.** `photos.path` is stored absolute, so moving `inputs/`
  invalidates the image endpoint. Re-run `main.py` against the new location.
- **Vision model required.** Text-only models (e.g. `llama3.2:latest`) will
  hallucinate refusals like *"I can't see the image…"*.
