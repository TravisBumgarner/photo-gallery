import path from 'node:path';
import { isNull, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { createDb } from 'shared/db';
import { photos } from 'shared/db/schema';
import { WasmEmbedder } from 'shared/embed';
import { imagesDir, loadConfig, modelCacheDir } from '@/config.js';
import { fmtDuration, status, summary } from '@/progress.js';
import { settings } from '@/settings.js';

const RETRY_DELAYS_MS = [500, 1500, 3500];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isLocalHost = (host: string) =>
  /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(host);

/** Connection-level failure (server unreachable / reset / gateway down), as
 * opposed to a per-image error. For a REMOTE host this means "server went away"
 * → pause and wait for it, rather than counting every remaining image failed. */
function isConnLevel(err: unknown): boolean {
  if (err instanceof TypeError) return true; // undici "fetch failed"
  const status = (err as { status?: number })?.status;
  return status === 502 || status === 503 || status === 504;
}

/** Is the model server answering right now? Used to poll for its return. */
async function serverReachable(
  host: string,
  apiKey: string | undefined,
): Promise<boolean> {
  try {
    const res = await fetch(`${host.replace(/\/+$/, '')}/api/tags`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      signal: AbortSignal.timeout(4000),
    });
    return res.ok || res.status === 401 || res.status === 403; // up (maybe auth)
  } catch {
    return false;
  }
}

// A vision model spends most of its time encoding the image, and that cost grows
// with resolution — full-size photos can take minutes per image on CPU (and blow
// past the fetch timeout). ~1024px is plenty for tag-level understanding and cuts
// the encode time dramatically.
const MAX_IMAGE_EDGE = 1024;

// If this many requests fail in a row (with no success resetting the streak),
// the server is down/dying (e.g. OOM-killed) — stop hammering it and abort the
// run with a non-zero exit instead of "failing" every remaining image silently.
const ABORT_AFTER_CONSECUTIVE_FAILURES = 5;

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
      // Stream so tokens flow as they're generated. A non-streaming request
      // returns nothing until the whole generation finishes, which on a slow
      // (CPU) server trips fetch's ~300s headers-timeout; streaming keeps the
      // connection active and isn't killed by it.
      stream: true,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: settings.tagging.prompt },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok || !res.body) {
    const body = res.body ? await res.text() : '';
    const err = new Error(`generate failed ${res.status}: ${body}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }

  // Parse the OpenAI-style SSE stream: each `data: {json}` line carries a token
  // in choices[0].delta.content; `data: [DONE]` ends it.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let content = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? ''; // keep the trailing partial line buffered
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data) as {
          choices?: { delta?: { content?: string } }[];
        };
        content += json.choices?.[0]?.delta?.content ?? '';
      } catch {
        // ignore keep-alive / partial lines
      }
    }
  }
  return content.trim();
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

/** Ollama only auto-resolves a bare name to :latest. If the configured model
 * isn't directly usable but exactly one tagged variant is installed (e.g.
 * qwen3-vl:8b for qwen3-vl), use that. Best-effort + Ollama-specific; other
 * OpenAI-compatible servers keep the configured name. Resolution happens here,
 * at the point of use — config is never rewritten. */
async function resolveModel(modelHost: string, model: string): Promise<string> {
  try {
    const res = await fetch(`${modelHost.replace(/\/+$/, '')}/api/tags`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return model;
    const data = (await res.json()) as { models?: { name: string }[] };
    const names = (data.models ?? []).map((m) => m.name);
    const base = (s: string) => s.split(':')[0];
    if (names.includes(model)) return model;
    if (!model.includes(':') && names.includes(`${model}:latest`)) return model;
    const variants = names.filter((n) => base(n) === base(model));
    if (variants.length === 1 && variants[0] !== model) {
      console.log(`  Resolved model "${model}" → "${variants[0]}".`);
      return variants[0];
    }
    return model;
  } catch {
    return model;
  }
}

function vecToBuffer(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

async function main() {
  const config = loadConfig();

  const rawModelHost = config.MODEL_SERVER_HOST;
  const configuredModel = config.MODEL_SERVER_MODEL;
  const apiKey = config.MODEL_SERVER_API_KEY;
  if (!rawModelHost || !configuredModel) {
    console.error(
      'MODEL_SERVER_HOST and MODEL_SERVER_MODEL must be set in .cli-cache (see README "Model Server").',
    );
    process.exit(1);
  }
  // Post-guard const → type `string` inside the worker closure (CFA narrowing
  // of the original is lost across the closure boundary).
  const modelHost = rawModelHost;
  const model = await resolveModel(modelHost, configuredModel);

  const localDbPath = config.DATABASE_URL;
  if (!localDbPath) {
    console.error('DATABASE_URL must be set (path to local sqlite).');
    process.exit(1);
  }

  const db = createDb(path.resolve(localDbPath));
  const localImagesDir = imagesDir(config);
  const cacheDir = modelCacheDir(config);

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
  console.log(`  Images dir:   ${localImagesDir}`);
  console.log(
    `  DB rows:      ${totalRows} (${alreadyTagged} tagged, ${untagged.length} untagged)`,
  );

  let failed = 0;
  let aborted: unknown = null;

  if (untagged.length === 0) {
    console.log('\nNothing to tag.');
  } else {
    console.log('\nLoading WASM embedder...');
    const embedder = await WasmEmbedder.create(cacheDir);
    console.log('Embedder ready.');
    console.log(
      `\nTagging ${untagged.length} image(s) with '${model}'. The FIRST request makes the\n` +
        'server load the model into memory, which can take a while for a large model\n' +
        "(and is where it OOMs if the model doesn't fit) — later images are much faster.",
    );

    const startTime = Date.now();
    let processed = 0;
    let consecutiveFailures = 0;
    let nextIndex = 0;
    let inFlight = 0;
    const isRemote = !isLocalHost(modelHost);
    // Rows that hit the server mid-outage go here to be retried once it's back,
    // so a transient drop doesn't permanently "fail" them.
    const retryQueue: (typeof untagged)[number][] = [];
    // While set, the server is down and every worker awaits it before taking
    // more work — the "pause". One worker runs the poll; the rest just wait.
    let recovery: Promise<void> | null = null;
    const fmt = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

    // Remote server dropped out: pause all workers, poll until it answers, then
    // resume. Only the first caller runs the loop; concurrent callers share it.
    function pauseUntilServerBack(triggerErr: unknown): Promise<void> {
      if (!recovery) {
        recovery = (async () => {
          console.error(
            `\n⚠ Model server ${modelHost} stopped responding (${triggerErr}).`,
          );
          console.error(
            '  Pausing — will resume automatically when it’s reachable again. Press q to stop.',
          );
          let waited = 0;
          while (!(await serverReachable(modelHost, apiKey))) {
            status(
              `⚠ Model server unreachable — paused, waiting for it to come back (${waited}s)… press q to stop`,
            );
            await sleep(5000);
            waited += 5;
          }
          console.log(`  Model server back after ~${waited}s — resuming.`);
          status('resuming…');
          consecutiveFailures = 0; // fresh streak after the outage
        })().finally(() => {
          recovery = null;
        });
      }
      return recovery;
    }

    // Next unit of work: retries first, then the untagged list; null when both
    // are drained. Kept in one place so the worker stays simple.
    function nextRow(): (typeof untagged)[number] | null {
      if (retryQueue.length) return retryQueue.shift() ?? null;
      if (nextIndex < untagged.length) return untagged[nextIndex++];
      return null;
    }

    // Sliding-window concurrency: PARALLEL workers pull the next row as soon
    // as they're free, so a slow request doesn't stall faster ones in its batch.
    async function worker() {
      while (true) {
        if (aborted) return; // a systemic failure was detected — stop taking work
        if (recovery) await recovery; // server is down — hold until it's back
        const row = nextRow();
        if (!row) {
          // No queued work, but an in-flight request could still requeue on an
          // outage — only truly done once nothing is left and nothing's running.
          if (inFlight === 0 && retryQueue.length === 0) return;
          await sleep(100);
          continue;
        }
        inFlight++;
        try {
          const t0 = Date.now();
          const filePath = path.join(localImagesDir, row.originalPath);
          // Downscale to MAX_IMAGE_EDGE before sending — full-res photos make the
          // vision encoder crawl on CPU. .rotate() applies EXIF orientation.
          const b64 = (
            await sharp(filePath)
              .rotate()
              .resize(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE, {
                fit: 'inside',
                withoutEnlargement: true,
              })
              .jpeg({ quality: 85 })
              .toBuffer()
          ).toString('base64');
          const tags = await callGenerate(modelHost, model, apiKey, b64);
          const vec = await embedder.embed(tags);
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
          consecutiveFailures = 0; // a success clears the systemic-failure streak
          const elapsed = (tDone - startTime) / 1000;
          const rate = processed / elapsed || 0;
          // Per-image line: progress, filename, time, rate. No tags.
          console.log(
            `  [${processed + failed}/${untagged.length}] ${row.filename}  ${fmt(tDone - t0)}  ${rate.toFixed(2)} img/s`,
          );
          status(
            `${processed + failed} / ${untagged.length} photos · ${(elapsed / processed).toFixed(1)} s/img · ETA ${fmtDuration((untagged.length - (processed + failed)) * (elapsed / processed))}`,
          );
        } catch (err) {
          consecutiveFailures++;
          // Remote server dropped out → don't count these as failed; requeue
          // the image and (once the streak confirms it's systemic) pause the
          // whole run until the server returns, then resume.
          if (isRemote && isConnLevel(err)) {
            retryQueue.push(row);
            if (consecutiveFailures >= ABORT_AFTER_CONSECUTIVE_FAILURES) {
              await pauseUntilServerBack(err);
            }
          } else {
            // Per-image error, or a local server that won't recover by waiting
            // (e.g. OOM-killed) → count it and abort the run if it's systemic.
            failed++;
            console.error(
              `  [${processed + failed}/${untagged.length}] ${row.filename} FAILED: ${err}`,
            );
            if (consecutiveFailures >= ABORT_AFTER_CONSECUTIVE_FAILURES) {
              aborted = err;
            }
          }
        } finally {
          inFlight--;
        }
      }
    }

    await Promise.all(
      Array.from(
        { length: Math.min(settings.tagging.concurrency, untagged.length) },
        () => worker(),
      ),
    );

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processed / elapsed || 0;
    console.log(
      `\n  Done: ${processed} ok, ${failed} failed in ${fmt(elapsed * 1000)} | ${rate.toFixed(2)} img/s`,
    );
    summary(
      processed || failed
        ? `${processed.toLocaleString()} tagged${failed ? ` · ${failed} failed` : ''}`
        : 'nothing new — all photos already tagged',
    );

    if (aborted) {
      console.error(
        `\nAborted: ${ABORT_AFTER_CONSECUTIVE_FAILURES}+ requests failed in a row — the model server looks down.`,
      );
      console.error(`  Last error: ${aborted}`);
      console.error(
        "  'signal: killed' usually means the model was OOM-killed. Use a smaller",
      );
      console.error(
        '  MODEL_SERVER_MODEL, or give Docker / the host machine more memory.',
      );
      process.exit(1);
    }
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

  // Don't exit 0 if anything failed — otherwise the caller (oi) treats a fully
  // failed run as success and the pipeline keeps going.
  if (failed > 0) {
    console.error(`\n${failed} image(s) failed to tag — exiting non-zero.`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
