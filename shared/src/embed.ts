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

async function downloadIfMissing(
  cacheDir: string,
  filename: string,
): Promise<string> {
  const local = path.join(cacheDir, path.basename(filename));
  try {
    await fsp.access(local);
    return local;
  } catch {
    // not cached
  }
  await fsp.mkdir(cacheDir, { recursive: true });
  const url = `https://huggingface.co/${MODEL_REPO}/resolve/main/${filename}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fsp.writeFile(local, buf);
  return local;
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
