import path from 'node:path';
import { isNotNull } from 'drizzle-orm';
import { createDb } from 'shared/db';
import { WasmEmbedder } from 'shared/embed';
import { photos } from 'shared/db/schema';
import { config } from './config.js';

const EMBED_DIM = 384;
const MODEL_CACHE_DIR = path.resolve('models/bge-small-en-v1.5');

interface MatrixEntry {
  uuid: string;
  vec: Float32Array;
}

let matrix: MatrixEntry[] | null = null;
let loadInflight: Promise<MatrixEntry[]> | null = null;

const db = createDb(config.DATABASE_URL);

function normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const m = Math.sqrt(sum);
  if (m === 0) return v;
  for (let i = 0; i < v.length; i++) v[i] /= m;
  return v;
}

async function loadMatrix(): Promise<MatrixEntry[]> {
  if (matrix) return matrix;
  if (loadInflight) return loadInflight;

  loadInflight = (async () => {
    const rows = await db
      .select({ uuid: photos.uuid, embedding: photos.tagsEmbedding })
      .from(photos)
      .where(isNotNull(photos.tagsEmbedding));

    const entries: MatrixEntry[] = [];
    for (const row of rows) {
      if (!row.embedding) continue;
      const buf = Buffer.from(row.embedding);
      if (buf.byteLength !== EMBED_DIM * 4) continue;
      const vec = new Float32Array(
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      );
      entries.push({ uuid: row.uuid, vec: normalize(vec) });
    }
    matrix = entries;
    loadInflight = null;
    console.log(`[contentSearch] loaded ${entries.length} embeddings`);
    return entries;
  })();

  return loadInflight;
}

let embedder: WasmEmbedder | null = null;
let embedderInflight: Promise<WasmEmbedder> | null = null;

async function getEmbedder(): Promise<WasmEmbedder> {
  if (embedder) return embedder;
  if (embedderInflight) return embedderInflight;
  embedderInflight = WasmEmbedder.create(MODEL_CACHE_DIR).then((e) => {
    embedder = e;
    embedderInflight = null;
    return e;
  });
  return embedderInflight;
}

async function embedQuery(text: string): Promise<Float32Array> {
  const e = await getEmbedder();
  return e.embed(text);
}

function cosineDistance(a: Float32Array, b: Float32Array): number {
  // Inputs are unit-normalized by the embedding model, so cosine distance is 1 - dot.
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return 1 - dot;
}

export interface RankedHit {
  uuid: string;
  distance: number;
}

export async function searchByQuery(
  query: string,
  limit: number | undefined,
  candidateUuids?: Set<string>,
): Promise<RankedHit[]> {
  const [qvecRaw, entries] = await Promise.all([
    embedQuery(query),
    loadMatrix(),
  ]);
  if (qvecRaw.length !== EMBED_DIM) {
    throw new Error(
      `query embedding dim ${qvecRaw.length}, expected ${EMBED_DIM}`,
    );
  }
  const qvec = normalize(new Float32Array(qvecRaw));

  // If a candidate set is supplied (caller pre-filtered by SQL), score only
  // those entries — otherwise top-K can miss filter-matching photos that
  // didn't make the global top-K cut.
  const pool = candidateUuids
    ? entries.filter((e) => candidateUuids.has(e.uuid))
    : entries;
  const scored: RankedHit[] = pool.map((e) => ({
    uuid: e.uuid,
    distance: cosineDistance(qvec, e.vec),
  }));
  scored.sort((a, b) => a.distance - b.distance);
  return limit === undefined ? scored : scored.slice(0, limit);
}
