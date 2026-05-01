import fs from 'node:fs/promises';
import path from 'node:path';
import { isNull, sql } from 'drizzle-orm';
import { createDb } from 'shared/db';
import { WasmEmbedder } from 'shared/embed';
import { photos } from 'shared/db/schema';
import { loadConfig } from '@/config.js';

const PARALLEL = 2000;
const MODEL_CACHE_DIR = path.resolve('../backend/models/bge-small-en-v1.5');
const LOCAL_IMAGES_DIR = path.resolve('../backend/public/images');
const TAG_PROMPT = `Generate search tags for this image. Output 15-20 comma-separated tags covering:
- Concrete subjects (people, objects, animals)
- Setting/location (indoor/outdoor, specific place type)
- Visual attributes (dominant colors, lighting, composition)
- Style/medium (photo, illustration, screenshot, etc.)
- Mood or activity
Use lowercase, single words or short phrases. No explanations.`;

const RETRY_DELAYS_MS = [500, 1500, 3500];

async function callGenerateOnce(
  modelHost: string,
  model: string,
  apiKey: string | undefined,
  imageBase64: string,
): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(`${modelHost}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: TAG_PROMPT },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
          ],
        },
      ],
    }),
    // Vision LLM calls can be slow; no client-side timeout.
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`generate failed ${res.status}: ${body}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0].message.content.trim();
}

function isRetryable(err: unknown): boolean {
  // Connection-level failures from undici surface as TypeError "fetch failed".
  if (err instanceof TypeError) return true;
  const status = (err as { status?: number })?.status;
  // Retry server errors and rate limits; 4xx other than 429 is not retryable.
  if (typeof status === 'number') return status >= 500 || status === 429;
  return false;
}

async function callGenerate(
  modelHost: string,
  model: string,
  apiKey: string | undefined,
  imageBase64: string,
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await callGenerateOnce(modelHost, model, apiKey, imageBase64);
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
  const config = loadConfig('local');

  const modelHost = config.MODEL_SERVER_HOST;
  const model = config.MODEL_SERVER_MODEL;
  const apiKey = config.MODEL_SERVER_API_KEY;
  if (!modelHost || !model) {
    console.error(
      'MODEL_SERVER_HOST and MODEL_SERVER_MODEL must be set in .env.local (see README "Model Server").',
    );
    process.exit(1);
  }

  const localDbPath = config.DATABASE_URL;
  if (!localDbPath) {
    console.error('DATABASE_URL must be set (path to local sqlite).');
    process.exit(1);
  }

  const db = createDb(path.resolve(localDbPath));

  const totalRows = (
    await db.select({ count: sql<number>`count(*)` }).from(photos)
  )[0].count;

  const untagged = await db
    .select({
      uuid: photos.uuid,
      filename: photos.filename,
      originalPath: photos.originalPath,
    })
    .from(photos)
    .where(isNull(photos.tags));

  const alreadyTagged = totalRows - untagged.length;

  console.log(`--- Tagging ---`);
  console.log(
    `  Model server: ${modelHost} (${model})${apiKey ? ' [auth]' : ''}`,
  );
  console.log(`  Local DB:     ${localDbPath}`);
  console.log(`  Images dir:   ${LOCAL_IMAGES_DIR}`);
  console.log(
    `  DB rows:      ${totalRows} (${alreadyTagged} tagged, ${untagged.length} untagged)`,
  );

  if (untagged.length === 0) {
    console.log('\nNothing to tag.');
  } else {
    console.log('\nLoading WASM embedder...');
    const embedder = await WasmEmbedder.create(MODEL_CACHE_DIR);

    const startTime = Date.now();
    let processed = 0;
    let failed = 0;
    let nextIndex = 0;
    const fmt = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

    // Sliding-window concurrency: PARALLEL workers pull the next row as soon
    // as they're free, so a slow request doesn't stall faster ones in its batch.
    async function worker() {
      while (true) {
        const i = nextIndex++;
        if (i >= untagged.length) return;
        const row = untagged[i];
        try {
          const t0 = Date.now();
          const filePath = path.join(LOCAL_IMAGES_DIR, row.originalPath);
          const buf = await fs.readFile(filePath);
          const b64 = buf.toString('base64');
          const tRead = Date.now();
          const tags = await callGenerate(modelHost!, model!, apiKey, b64);
          const tUpload = Date.now();
          const vec = await embedder.embed(tags);
          const tEmbed = Date.now();
          await db
            .update(photos)
            .set({
              tags,
              tagsEmbedding: vecToBuffer(vec),
              updatedAt: new Date(),
            })
            .where(sql`${photos.uuid} = ${row.uuid}`);
          const tDone = Date.now();
          processed++;
          const firstFiveTags = tags
            .split(',')
            .slice(0, 5)
            .map((s) => s.trim())
            .join(', ');
          const elapsed = (tDone - startTime) / 1000;
          const rate = processed / elapsed || 0;
          console.log(
            `  [${processed + failed}/${untagged.length}] ${row.filename}  read ${fmt(tRead - t0)}  upload ${fmt(tUpload - tRead)}  embed ${fmt(tEmbed - tUpload)}  db ${fmt(tDone - tEmbed)}  total ${fmt(tDone - t0)}  | ${rate.toFixed(2)} img/s | ${firstFiveTags}`,
          );
        } catch (err) {
          failed++;
          console.error(
            `  [${processed + failed}/${untagged.length}] ${row.filename} FAILED: ${err}`,
          );
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(PARALLEL, untagged.length) }, () =>
        worker(),
      ),
    );

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processed / elapsed || 0;
    console.log(
      `\n  Done: ${processed} ok, ${failed} failed in ${fmt(elapsed * 1000)} | ${rate.toFixed(2)} img/s`,
    );
  }

  const remainingUntagged = (
    await db
      .select({ count: sql<number>`count(*)` })
      .from(photos)
      .where(isNull(photos.tags))
  )[0].count;
  console.log(
    `\nLocal DB: ${totalRows} rows (${
      totalRows - remainingUntagged
    } tagged, ${remainingUntagged} untagged).`,
  );

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
