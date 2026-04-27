#!/usr/bin/env python3
"""Embed any photos rows that aren't yet in tags_vec.

Run once after enabling vector search. Idempotent — only embeds missing rows.
"""
import sys

import sqlite_vec

import db


def main() -> None:
    conn = db.connect()
    rows = conn.execute(
        """SELECT p.id, p.tags
           FROM photos p
           LEFT JOIN tags_vec v ON v.photo_id = p.id
           WHERE v.photo_id IS NULL"""
    ).fetchall()
    if not rows:
        print("nothing to backfill", file=sys.stderr)
        return
    print(f"backfilling {len(rows)} row(s) using {db.EMBED_MODEL}", file=sys.stderr)
    for i, (pid, tags) in enumerate(rows, 1):
        vec = db.embed(tags)
        conn.execute(
            "INSERT INTO tags_vec(photo_id, embedding) VALUES (?, ?)",
            (pid, sqlite_vec.serialize_float32(vec)),
        )
        conn.commit()
        print(f"  [{i}/{len(rows)}] id={pid}", flush=True)
    print("done", file=sys.stderr)


if __name__ == "__main__":
    main()
