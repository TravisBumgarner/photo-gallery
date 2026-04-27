#!/usr/bin/env python3
"""
Tag photos using a remote Ollama server.

Usage:
    OLLAMA_HOST=http://192.168.1.26:11434 python tag_photos.py inputs/
"""
import base64
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
import requests

import sqlite_vec

import db

MAX_CONCURRENCY = int(os.environ.get("MAX_CONCURRENCY", "1"))
MAX_IMAGES = int(os.environ.get("MAX_IMAGES", "0"))  # 0 = no cap

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
MODEL = os.environ.get("OLLAMA_MODEL", "gemma4:e4b")
EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".webp"}
PROMPT = (
    "Generate search tags for this image. Output 15-20 comma-separated tags covering:\n"
    "- Concrete subjects (people, objects, animals)\n"
    "- Setting/location (indoor/outdoor, specific place type)\n"
    "- Visual attributes (dominant colors, lighting, composition)\n"
    "- Style/medium (photo, illustration, screenshot, etc.)\n"
    "- Mood or activity\n"
    "Use lowercase, single words or short phrases. No explanations."
)

def tag_image(path: Path) -> str:
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    r = requests.post(
        f"{OLLAMA_HOST}/api/generate",
        json={
            "model": MODEL,
            "prompt": PROMPT,
            "images": [b64],
            "stream": False,
            "options": {"temperature": 0.0},
        },
        timeout=300,
    )
    r.raise_for_status()
    return r.json()["response"].strip()

def main(folders):
    photos = []
    for folder in folders:
        photos.extend(p for p in Path(folder).expanduser().rglob("*")
                      if p.suffix.lower() in EXTENSIONS)

    conn = db.connect()
    already = {row[0] for row in conn.execute("SELECT path FROM photos")}
    before = len(photos)
    photos = [p for p in photos if str(p.resolve()) not in already]
    skipped = before - len(photos)

    if MAX_IMAGES > 0:
        photos = photos[:MAX_IMAGES]

    print(f"Found {before} photos, {skipped} already in DB (skipping), "
          f"{len(photos)} to process\n", file=sys.stderr)
    print(f"Server: {OLLAMA_HOST}, model: {MODEL}, concurrency: {MAX_CONCURRENCY}\n",
          file=sys.stderr)

    def process(path):
        start = time.perf_counter()
        try:
            tags = tag_image(path)
            vec = db.embed(tags)
            return path, tags, vec, None, time.perf_counter() - start
        except Exception as e:
            return path, None, None, e, time.perf_counter() - start

    total_start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=MAX_CONCURRENCY) as pool:
        futures = [pool.submit(process, p) for p in photos]
        for fut in as_completed(futures):
            path, tags, vec, err, elapsed = fut.result()
            if err is None:
                conn.execute(
                    """INSERT INTO photos(path, tags, processed_at, elapsed_s)
                       VALUES (?, ?, ?, ?)
                       ON CONFLICT(path) DO UPDATE SET
                         tags=excluded.tags,
                         processed_at=excluded.processed_at,
                         elapsed_s=excluded.elapsed_s""",
                    (str(path.resolve()), tags,
                     datetime.now(timezone.utc).isoformat(), elapsed),
                )
                photo_id = conn.execute(
                    "SELECT id FROM photos WHERE path = ?", (str(path.resolve()),)
                ).fetchone()[0]
                conn.execute("DELETE FROM tags_vec WHERE photo_id = ?", (photo_id,))
                conn.execute(
                    "INSERT INTO tags_vec(photo_id, embedding) VALUES (?, ?)",
                    (photo_id, sqlite_vec.serialize_float32(vec)),
                )
                conn.commit()
                print(f"{path.name} ({elapsed:.2f}s) -> {tags}", flush=True)
            else:
                print(f"{path.name} ({elapsed:.2f}s) -> ERROR: {err}", file=sys.stderr)
    conn.close()
    total_elapsed = time.perf_counter() - total_start
    print(f"\nProcessed {len(photos)} photos in {total_elapsed:.2f}s", file=sys.stderr)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python tag_photos.py <folder> [folder ...]", file=sys.stderr)
        sys.exit(1)
    main(sys.argv[1:])
