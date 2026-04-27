"""FastAPI backend: semantic search over tagged photos and serve image files."""
from pathlib import Path

import sqlite_vec
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

import db

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/search")
def search(q: str = Query(..., min_length=1), limit: int = 50):
    try:
        qvec = db.embed(q)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"embedding failed: {e}")

    conn = db.connect()
    try:
        rows = conn.execute(
            """SELECT p.id, p.path, p.tags, v.distance
               FROM tags_vec v
               JOIN photos p ON p.id = v.photo_id
               WHERE v.embedding MATCH ? AND k = ?
               ORDER BY v.distance""",
            (sqlite_vec.serialize_float32(qvec), limit),
        ).fetchall()
    finally:
        conn.close()
    return [
        {"id": rid, "path": path, "tags": tags, "distance": dist}
        for rid, path, tags, dist in rows
    ]


@app.get("/api/image/{photo_id}")
def image(photo_id: int):
    conn = db.connect()
    row = conn.execute("SELECT path FROM photos WHERE id = ?", (photo_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="not found")
    path = Path(row[0])
    if not path.exists():
        raise HTTPException(status_code=410, detail="file missing on disk")
    return FileResponse(path)
