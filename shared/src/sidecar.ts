import { z } from 'zod';

/**
 * Per-photo sidecar: the durable record of the *expensive* ingestion compute
 * (vision-LLM tags, text embedding, face/dog detections + their embeddings),
 * keyed by file content hash so it survives renames and DB loss.
 *
 * Stored as one JSON file per photo at `sidecars/{contentHash}.json`. Losing
 * the ingestion DB then costs a rebuild (minutes), not re-running the models
 * (the 2-day problem). Embeddings are base64-encoded Float32 buffers — exact
 * and compact, the same bytes the DB blob columns hold.
 */
const detectionSchema = z.object({
  bboxX: z.number(),
  bboxY: z.number(),
  bboxW: z.number(),
  bboxH: z.number(),
  detScore: z.number(),
  embedding: z.string(), // base64 Float32 buffer
});

export const sidecarSchema = z.object({
  version: z.literal(1),
  contentHash: z.string(),
  uuid: z.string(),
  tags: z.string().nullable(),
  tagsEmbedding: z.string().nullable(), // base64 Float32 buffer
  faces: z.array(detectionSchema),
  dogs: z.array(detectionSchema),
});

export type Detection = z.infer<typeof detectionSchema>;
export type Sidecar = z.infer<typeof sidecarSchema>;

/** Embedding blob (DB column / raw bytes) <-> base64 string for JSON. */
export function encodeEmbedding(buf: Buffer | Uint8Array | null): string | null {
  if (!buf) return null;
  return Buffer.from(buf).toString('base64');
}

export function decodeEmbedding(b64: string | null): Buffer | null {
  if (!b64) return null;
  return Buffer.from(b64, 'base64');
}

export function serializeSidecar(sidecar: Sidecar): Buffer {
  return Buffer.from(JSON.stringify(sidecarSchema.parse(sidecar)));
}

export function parseSidecar(data: Buffer | string): Sidecar {
  return sidecarSchema.parse(JSON.parse(data.toString()));
}
