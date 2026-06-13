import fs from 'node:fs/promises';
import path from 'node:path';
import { isNull, sql } from 'drizzle-orm';
import { createDb } from 'shared/db';
import { dogs, photos } from 'shared/db/schema';
import { imagesDir, loadConfig } from '@/config.js';
import { settings } from '@/settings.js';

interface DetectedDog {
  bbox: [number, number, number, number];
  det_score: number;
  embedding: number[]; // 384-d, L2-normalized
}

interface DetectDogsResponse {
  width: number;
  height: number;
  dogs: DetectedDog[];
}

const RETRY_DELAYS_MS = [500, 1500, 3500];

// If this many requests fail in a row (with no success resetting the streak),
// the server is down/dying (crashed, OOM-killed, or unreachable) — stop and
// abort with a non-zero exit instead of "failing" every remaining image silently.
const ABORT_AFTER_CONSECUTIVE_FAILURES = 5;

async function detectOnce(
  visionHost: string,
  apiKey: string | undefined,
  imageBase64: string,
): Promise<DetectDogsResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(`${visionHost}/detect-dogs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ image: imageBase64 }),
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`detect-dogs failed ${res.status}: ${body}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return (await res.json()) as DetectDogsResponse;
}

function isRetryable(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const status = (err as { status?: number })?.status;
  if (typeof status === 'number') return status >= 500 || status === 429;
  return false;
}

async function detectWithRetry(
  visionHost: string,
  apiKey: string | undefined,
  imageBase64: string,
): Promise<DetectDogsResponse> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await detectOnce(visionHost, apiKey, imageBase64);
    } catch (err) {
      lastErr = err;
      if (attempt === RETRY_DELAYS_MS.length || !isRetryable(err)) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastErr;
}

function vecToBuffer(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

async function main() {
  const config = loadConfig();

  // Reusing VISION_SERVER_HOST since /detect and /detect-dogs live on the same
  // local sidecar. The env var name is historical.
  const visionHost = config.VISION_SERVER_HOST;
  const apiKey = config.VISION_SERVER_API_KEY || undefined;
  if (!visionHost) {
    console.error(
      'VISION_SERVER_HOST must be set in .env.local (see README "Vision Server").',
    );
    process.exit(1);
  }

  const localDbPath = config.DATABASE_URL;
  if (!localDbPath) {
    console.error('DATABASE_URL must be set.');
    process.exit(1);
  }

  const db = createDb(path.resolve(localDbPath));
  const localImagesDir = imagesDir(config);

  try {
    const res = await fetch(`${visionHost}/health`);
    if (!res.ok) throw new Error(`health ${res.status}`);
  } catch (err) {
    console.error(`Vision server not reachable at ${visionHost}: ${err}`);
    process.exit(1);
  }

  const totalRows = (
    await db.select({ count: sql<number>`count(*)` }).from(photos)
  )[0].count;

  const unprocessed = await db
    .select({
      uuid: photos.uuid,
      filename: photos.filename,
      originalPath: photos.originalPath,
    })
    .from(photos)
    .where(isNull(photos.dogsProcessedAt));

  const alreadyProcessed = totalRows - unprocessed.length;

  console.log(`--- Detect dogs ---`);
  console.log(`  Vision server:  ${visionHost}${apiKey ? ' [auth]' : ''}`);
  console.log(`  Local DB:       ${localDbPath}`);
  console.log(`  Images dir:     ${localImagesDir}`);
  console.log(
    `  DB rows:        ${totalRows} (${alreadyProcessed} processed, ${unprocessed.length} pending)`,
  );

  if (unprocessed.length === 0) {
    console.log('\nNothing to process.');
    process.exit(0);
  }

  const startTime = Date.now();
  let processed = 0;
  let failed = 0;
  let consecutiveFailures = 0;
  let aborted: unknown = null;
  let totalDogsFound = 0;
  let nextIndex = 0;
  const fmt = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

  async function worker() {
    while (true) {
      if (aborted) return; // a systemic failure was detected — stop taking work
      const i = nextIndex++;
      if (i >= unprocessed.length) return;
      const row = unprocessed[i];
      try {
        const t0 = Date.now();
        const filePath = path.join(localImagesDir, row.originalPath);
        const buf = await fs.readFile(filePath);
        const b64 = buf.toString('base64');
        const tRead = Date.now();
        const result = await detectWithRetry(visionHost!, apiKey, b64);
        const tDetect = Date.now();

        const W = result.width;
        const H = result.height;

        if (result.dogs.length > 0) {
          await db.insert(dogs).values(
            result.dogs.map((d) => {
              const [x1, y1, x2, y2] = d.bbox;
              const emb = Float32Array.from(d.embedding);
              return {
                photoUuid: row.uuid,
                bboxX: Math.max(0, x1 / W),
                bboxY: Math.max(0, y1 / H),
                bboxW: Math.min(1, (x2 - x1) / W),
                bboxH: Math.min(1, (y2 - y1) / H),
                detScore: d.det_score,
                embedding: vecToBuffer(emb),
              };
            }),
          );
        }

        await db
          .update(photos)
          .set({ dogsProcessedAt: new Date(), updatedAt: new Date() })
          .where(sql`${photos.uuid} = ${row.uuid}`);

        const tDone = Date.now();
        processed++;
        consecutiveFailures = 0; // a success clears the systemic-failure streak
        totalDogsFound += result.dogs.length;
        const elapsed = (tDone - startTime) / 1000;
        const rate = processed / elapsed || 0;
        console.log(
          `  [${processed + failed}/${unprocessed.length}] ${row.filename}  read ${fmt(tRead - t0)}  detect ${fmt(tDetect - tRead)}  db ${fmt(tDone - tDetect)}  total ${fmt(tDone - t0)}  | ${rate.toFixed(2)} img/s | ${result.dogs.length} dog${result.dogs.length === 1 ? '' : 's'}`,
        );
      } catch (err) {
        failed++;
        consecutiveFailures++;
        console.error(
          `  [${processed + failed}/${unprocessed.length}] ${row.filename} FAILED: ${err}`,
        );
        if (consecutiveFailures >= ABORT_AFTER_CONSECUTIVE_FAILURES) {
          aborted = err;
        }
      }
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.min(settings.dogs.detect.concurrency, unprocessed.length),
      },
      () => worker(),
    ),
  );

  const elapsed = (Date.now() - startTime) / 1000;
  const rate = processed / elapsed || 0;
  console.log(
    `\n  Done: ${processed} ok, ${failed} failed, ${totalDogsFound} dogs total in ${fmt(elapsed * 1000)} | ${rate.toFixed(2)} img/s`,
  );

  if (aborted) {
    console.error(
      `\nAborted: ${ABORT_AFTER_CONSECUTIVE_FAILURES}+ requests failed in a row — the vision server looks down.`,
    );
    console.error(`  Last error: ${aborted}`);
    console.error(
      '  A crashed/OOM-killed or unreachable server. Check it is running and has',
    );
    console.error('  enough memory, then re-run.');
    process.exit(1);
  }

  // Don't exit 0 if anything failed — otherwise the caller (oi) treats a fully
  // failed run as success and the pipeline keeps going.
  if (failed > 0) {
    console.error(`\n${failed} image(s) failed — exiting non-zero.`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
