import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Tokenizer } from '@huggingface/tokenizers';
import * as ort from 'onnxruntime-web';

// BGE small en v1.5 — 384-d sentence embeddings. We use Xenova's ONNX-converted
// version (quantized) so we can run it via WebAssembly without native bindings.
// Same model file works on macOS, Linux, and FreeBSD because WASM is portable.
const MODEL_REPO = 'Xenova/bge-small-en-v1.5';
const FILES = {
  model: 'onnx/model_quantized.onnx',
  tokenizerJson: 'tokenizer.json',
  tokenizerConfig: 'tokenizer_config.json',
};

export const EMBED_DIM = 384;

// Abort a download if no bytes arrive for this long. A progressing (even slow)
// download keeps resetting it; only a truly stalled/unreachable host trips it —
// so the first-run fetch can't hang forever with no feedback.
const DOWNLOAD_STALL_TIMEOUT_MS = 60_000;
const DOWNLOAD_RETRIES = 3;

async function downloadIfMissing(
  cacheDir: string,
  filename: string,
): Promise<string> {
  const local = path.join(cacheDir, path.basename(filename));
  try {
    await fsp.access(local);
    return local; // already cached — instant
  } catch {
    // not cached
  }
  await fsp.mkdir(cacheDir, { recursive: true });
  const url = `https://huggingface.co/${MODEL_REPO}/resolve/main/${filename}`;
  const base = path.basename(filename);
  const tmp = `${local}.part`;
  const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;

  for (let attempt = 1; attempt <= DOWNLOAD_RETRIES; attempt++) {
    const ctrl = new AbortController();
    let timer = setTimeout(() => ctrl.abort(), DOWNLOAD_STALL_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error('empty response body');
      const total = Number(res.headers.get('content-length') ?? 0);
      console.log(
        `  Downloading ${base}${total ? ` (${mb(total)})` : ''} from HuggingFace — one-time, cached after.`,
      );

      // Stream to a .part file, resetting the stall timer on each chunk, then
      // rename into place so an interrupted download never leaves a corrupt
      // cache file that would poison later runs.
      const out = fs.createWriteStream(tmp);
      let received = 0;
      let nextMark = 0.25;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        clearTimeout(timer);
        timer = setTimeout(() => ctrl.abort(), DOWNLOAD_STALL_TIMEOUT_MS);
        out.write(Buffer.from(value));
        received += value.length;
        if (total > 5e6 && received / total >= nextMark) {
          console.log(`    ${base}: ${Math.round((received / total) * 100)}%`);
          nextMark += 0.25;
        }
      }
      await new Promise<void>((resolve, reject) => {
        out.on('error', reject);
        out.end(() => resolve());
      });
      clearTimeout(timer);
      await fsp.rename(tmp, local);
      return local;
    } catch (err) {
      clearTimeout(timer);
      await fsp.rm(tmp, { force: true }).catch(() => {});
      const reason =
        (err as Error)?.name === 'AbortError'
          ? `stalled (no data for ${DOWNLOAD_STALL_TIMEOUT_MS / 1000}s)`
          : String((err as Error)?.message ?? err);
      if (attempt === DOWNLOAD_RETRIES) {
        throw new Error(
          `Failed to download ${base} from ${url} after ${DOWNLOAD_RETRIES} attempts: ${reason}`,
        );
      }
      console.error(
        `  ${base} download failed (${reason}) — retrying (${attempt}/${DOWNLOAD_RETRIES})…`,
      );
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  // Unreachable: the loop either returns or throws on the final attempt.
  throw new Error(`Failed to download ${base}`);
}

export class WasmEmbedder {
  private constructor(
    private session: ort.InferenceSession,
    private tokenizer: Tokenizer,
  ) {}

  static async create(cacheDir: string): Promise<WasmEmbedder> {
    const [tokJsonPath, tokConfigPath, modelPath] = await Promise.all([
      downloadIfMissing(cacheDir, FILES.tokenizerJson),
      downloadIfMissing(cacheDir, FILES.tokenizerConfig),
      downloadIfMissing(cacheDir, FILES.model),
    ]);
    const tokJson = JSON.parse(await fsp.readFile(tokJsonPath, 'utf-8'));
    const tokConfig = JSON.parse(await fsp.readFile(tokConfigPath, 'utf-8'));
    const tokenizer = new Tokenizer(tokJson, tokConfig);

    const modelBuf = fs.readFileSync(modelPath);
    const session = await ort.InferenceSession.create(modelBuf);
    return new WasmEmbedder(session, tokenizer);
  }

  async embed(text: string): Promise<Float32Array> {
    const enc = this.tokenizer.encode(text, { add_special_tokens: true });
    const seqLen = enc.ids.length;
    const ids = BigInt64Array.from(enc.ids.map((n) => BigInt(n)));
    const mask = BigInt64Array.from(enc.attention_mask.map((n) => BigInt(n)));
    const tokenTypeIds = BigInt64Array.from(
      (enc.token_type_ids ?? new Array(seqLen).fill(0)).map((n) => BigInt(n)),
    );

    const feeds: Record<string, ort.Tensor> = {
      input_ids: new ort.Tensor('int64', ids, [1, seqLen]),
      attention_mask: new ort.Tensor('int64', mask, [1, seqLen]),
    };
    if (this.session.inputNames.includes('token_type_ids')) {
      feeds.token_type_ids = new ort.Tensor('int64', tokenTypeIds, [1, seqLen]);
    }

    const out = await this.session.run(feeds);
    const lastHidden = out[this.session.outputNames[0]].data as Float32Array;

    // Mean pool with attention mask, then L2 normalize.
    const pooled = new Float32Array(EMBED_DIM);
    let total = 0;
    for (let i = 0; i < seqLen; i++) {
      if (Number(mask[i]) === 1) {
        total++;
        for (let j = 0; j < EMBED_DIM; j++) {
          pooled[j] += lastHidden[i * EMBED_DIM + j];
        }
      }
    }
    if (total === 0) return pooled;
    for (let j = 0; j < EMBED_DIM; j++) pooled[j] /= total;

    let magSq = 0;
    for (const v of pooled) magSq += v * v;
    const mag = Math.sqrt(magSq);
    if (mag > 0) for (let j = 0; j < pooled.length; j++) pooled[j] /= mag;
    return pooled;
  }
}
