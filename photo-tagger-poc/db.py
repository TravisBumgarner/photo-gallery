import os
import sqlite3
import threading
from pathlib import Path

import sqlite_vec
from fastembed import TextEmbedding

DB_PATH = Path(__file__).parent / "tags.db"

EMBED_MODEL = os.environ.get("EMBED_MODEL", "BAAI/bge-small-en-v1.5")
EMBED_DIM = int(os.environ.get("EMBED_DIM", "384"))

SCHEMA = f"""
CREATE TABLE IF NOT EXISTS photos (
    id            INTEGER PRIMARY KEY,
    path          TEXT UNIQUE NOT NULL,
    tags          TEXT NOT NULL,
    processed_at  TEXT NOT NULL,
    elapsed_s     REAL NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS tags_fts USING fts5(
    tags,
    content='photos',
    content_rowid='id',
    tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS photos_ai AFTER INSERT ON photos BEGIN
    INSERT INTO tags_fts(rowid, tags) VALUES (new.id, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS photos_ad AFTER DELETE ON photos BEGIN
    INSERT INTO tags_fts(tags_fts, rowid, tags) VALUES('delete', old.id, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS photos_au AFTER UPDATE ON photos BEGIN
    INSERT INTO tags_fts(tags_fts, rowid, tags) VALUES('delete', old.id, old.tags);
    INSERT INTO tags_fts(rowid, tags) VALUES (new.id, new.tags);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS tags_vec USING vec0(
    photo_id INTEGER PRIMARY KEY,
    embedding float[{EMBED_DIM}] distance_metric=cosine
);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)
    # Drop tags_vec if its dimension changed (e.g. switched embedding models).
    existing = conn.execute(
        "SELECT sql FROM sqlite_master WHERE name='tags_vec'"
    ).fetchone()
    if existing and f"float[{EMBED_DIM}]" not in existing[0]:
        conn.execute("DROP TABLE tags_vec")
    conn.executescript(SCHEMA)
    return conn


_embedder: TextEmbedding | None = None
_embedder_lock = threading.Lock()


def _get_embedder() -> TextEmbedding:
    global _embedder
    if _embedder is None:
        with _embedder_lock:
            if _embedder is None:
                _embedder = TextEmbedding(model_name=EMBED_MODEL)
    return _embedder


def embed(text: str) -> list[float]:
    return next(_get_embedder().embed([text])).tolist()
