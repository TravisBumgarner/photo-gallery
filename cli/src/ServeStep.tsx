import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useEffect, useRef, useState } from 'react';
import { killTree, runStep, spawnTracked } from './exec.js';
import { BACKEND_DIR, FRONTEND_DIR } from './steps.js';

const PORT = 8084;
const URL = `http://localhost:${PORT}`;
const FRONTEND_DIST = path.join(BACKEND_DIR, 'frontend-dist');

// Build the web UI into backend/frontend-dist (same as ./mvp), then the backend
// serves it. EXPO_PUBLIC_API_BASE_URL="" so the bundled UI talks to its own origin.
// Build the web UI (cwd = frontend/). ingest-and-sync doesn't install frontend
// deps (expo is heavy + only needed to build the UI), so install them here if
// missing — otherwise `npx expo` downloads a random latest expo and fails.
// NODE_PATH so the root-hoisted @expo/metro-config can resolve `expo` (npm keeps
// it in frontend/node_modules) — without it the export dies with "Cannot find
// module 'expo/package.json'".
const BUILD_CMD =
  '([ -d node_modules/expo ] || (cd .. && npm install -w frontend --no-audit --no-fund)) && ' +
  'NODE_PATH="$PWD/node_modules" EXPO_PUBLIC_API_BASE_URL="" ' +
  'npx expo export --platform web --output-dir dist ' +
  '&& rm -rf ../backend/frontend-dist && cp -R dist ../backend/frontend-dist';

function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  try {
    spawn(cmd as string, args as string[], {
      stdio: 'ignore',
      detached: true,
    }).unref();
  } catch {
    // no opener — the URL is printed anyway
  }
}

/** localhost "bring it up": build the web UI (cached after the first time), run
 * the backend, open the browser, and stay up until the user stops it. */
export function ServeStep({ onDone }: { onDone: () => void }) {
  const server = useRef<ChildProcess | null>(null);
  const [phase, setPhase] = useState<
    'building' | 'loading' | 'serving' | 'failed'
  >('building');
  const [detail, setDetail] = useState('');

  useEffect(() => {
    let cancelled = false;

    const serve = () => {
      if (cancelled) return;
      setPhase('serving');
      const child = spawnTracked('npx', ['tsx', 'src/index.ts'], {
        cwd: BACKEND_DIR,
        stdio: 'ignore',
      });
      server.current = child;
      child.on('exit', (code) => {
        if (!cancelled && code) {
          setDetail(`backend exited (code ${code})`);
          setPhase('failed');
        }
      });
      // Open the browser once it's actually answering.
      (async () => {
        for (let i = 0; i < 40 && !cancelled; i++) {
          try {
            const res = await fetch(URL, { signal: AbortSignal.timeout(1500) });
            if (res.ok) {
              if (!cancelled) openBrowser(URL);
              return;
            }
          } catch {
            // not up yet
          }
          await new Promise((r) => setTimeout(r, 500));
        }
      })();
    };

    (async () => {
      // Skip the (slow) web build if it's already there — but still pull the DB.
      if (existsSync(path.join(FRONTEND_DIST, 'index.html'))) {
        await pullDbThenServe();
        return;
      }
      setPhase('building');
      const tail: string[] = [];
      const code = await runStep(
        { cmd: 'sh', args: ['-c', BUILD_CMD], cwd: FRONTEND_DIR },
        (line) => {
          tail.push(line);
          if (tail.length > 20) tail.shift();
          if (!cancelled) setDetail(line);
        },
      );
      if (cancelled) return;
      if (code !== 0 || !existsSync(path.join(FRONTEND_DIST, 'index.html'))) {
        setDetail(tail.slice(-3).join(' ') || 'web UI build failed');
        setPhase('failed');
        return;
      }
      await pullDbThenServe();
    })();

    // Pull the published read-only DB (must run before the backend, which opens
    // the DB at import time), then serve.
    async function pullDbThenServe() {
      if (cancelled) return;
      setPhase('loading');
      const tail: string[] = [];
      const code = await runStep(
        { cmd: 'npx', args: ['tsx', 'src/boot.ts'], cwd: BACKEND_DIR },
        (line) => {
          tail.push(line);
          if (tail.length > 20) tail.shift();
          if (!cancelled) setDetail(line);
        },
      );
      if (cancelled) return;
      if (code !== 0) {
        setDetail(
          tail.slice(-3).join(' ') ||
            'failed to load the gallery DB (did publish run?)',
        );
        setPhase('failed');
        return;
      }
      serve();
    }

    return () => {
      cancelled = true;
      killTree(server.current);
    };
  }, []);

  useInput((_input, key) => {
    if (key.return) {
      killTree(server.current);
      onDone();
    }
  });

  return (
    <Box flexDirection="column">
      {phase === 'building' && (
        <>
          <Text color="cyan">
            Building the web UI… (first time installs the web tools — a few minutes)
          </Text>
          {detail ? <Text dimColor>  {detail}</Text> : null}
        </>
      )}
      {phase === 'loading' && (
        <>
          <Text color="cyan">Loading the gallery database…</Text>
          {detail ? <Text dimColor>  {detail}</Text> : null}
        </>
      )}
      {phase === 'serving' && (
        <>
          <Text color="green">Your gallery is live: {URL}</Text>
          <Text dimColor>Log in with your gallery password.</Text>
          <Text dimColor>Press enter here to stop it.</Text>
        </>
      )}
      {phase === 'failed' && (
        <>
          <Text color="red">Couldn't bring up the gallery.</Text>
          <Text dimColor>{detail}</Text>
          <Text dimColor>Press enter to exit.</Text>
        </>
      )}
    </Box>
  );
}
