#!/usr/bin/env python3
"""Semantic search over tagged photos.

Usage:
    python search.py "clay art"
    python search.py "happy children outdoors"
"""
import os
import sys

import sqlite_vec

import db

LIMIT = int(os.environ.get("LIMIT", "50"))


def main(query: str) -> None:
    qvec = db.embed(query)
    conn = db.connect()
    rows = conn.execute(
        """SELECT p.path, p.tags, v.distance
           FROM tags_vec v
           JOIN photos p ON p.id = v.photo_id
           WHERE v.embedding MATCH ? AND k = ?
           ORDER BY v.distance""",
        (sqlite_vec.serialize_float32(qvec), LIMIT),
    ).fetchall()
    for path, tags, dist in rows:
        print(f"{dist:6.3f}  {path}")
        print(f"          {tags}\n")
    print(f"{len(rows)} result(s) for {query!r}", file=sys.stderr)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print('Usage: python search.py "<query>"', file=sys.stderr)
        sys.exit(1)
    main(" ".join(sys.argv[1:]))
