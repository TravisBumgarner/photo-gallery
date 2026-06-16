import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Runs first when tagging is selected. For a LOCAL model server it does the
// work: starts Ollama if it's installed but not running, and pulls the model if
// it's missing. For a remote host it only checks (can't manage another machine).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLI_CACHE = path.join(ROOT, 'offline-ingestion', '.cli-cache');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isLocal = (host: string) => /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(host);
const ollamaInstalled = () =>
  spawnSync('ollama', ['--version'], { stdio: 'ignore' }).status === 0;

function readCliCache(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(CLI_CACHE, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2];
    }
  } catch {
    // no config yet
  }
  return out;
}

async function tags(host: string): Promise<string[] | null> {
  try {
    const res = await fetch(`${host}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = (await res.json()) as { models?: { name: string }[] };
    return (data.models ?? []).map((m) => m.name);
  } catch {
    return null;
  }
}

function die(...lines: string[]): never {
  for (const l of lines) console.error(l);
  process.exit(1);
}

async function main() {
  const cfg = readCliCache();
  const model = cfg.MODEL_SERVER_MODEL;
  if (!model) {
    console.log('No model configured — skipping tagging preflight.');
    return;
  }
  const host = (cfg.MODEL_SERVER_HOST || 'http://localhost:11434').replace(
    /\/+$/,
    '',
  );

  // 1. Ensure the server is reachable.
  let installed = await tags(host);
  if (installed === null) {
    if (!isLocal(host)) {
      die(`Model server unreachable at ${host} (remote — start Ollama there).`);
    }
    if (!ollamaInstalled()) {
      die(
        'Ollama is not installed. Install it from https://ollama.com/download,',
        'then re-run. (It only needs installing once.)',
      );
    }
    console.log('Starting Ollama…');
    spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < 30 && installed === null; i++) {
      await sleep(1000);
      installed = await tags(host);
    }
    if (installed === null) die('Ollama did not come up after 30s.');
    console.log('Ollama is up.');
  }

  // 2. Ensure the model is pulled.
  const base = (s: string) => s.split(':')[0];
  const has = (list: string[]) =>
    list.some((n) => n === model || base(n) === base(model));

  if (!has(installed)) {
    if (!isLocal(host)) {
      die(`Model "${model}" not on ${host} — pull it there: ollama pull ${model}`);
    }
    console.log(`Pulling ${model} (first time — can be several GB)…`);
    const r = spawnSync('ollama', ['pull', model], { stdio: 'inherit' });
    if (r.status !== 0) {
      die(
        `Failed to pull "${model}". Check the exact name — run \`ollama list\``,
        'or browse https://ollama.com/library (e.g. the Qwen VL model is qwen2.5vl).',
      );
    }
    // Authoritative: confirm it's actually there now.
    const after = await tags(host);
    if (!after || !has(after)) {
      die(`"${model}" still not available after pull — is the name correct?`);
    }
  }
  console.log(`Model "${model}" ready on ${host}.`);
}

main();
