import { type ChildProcess, spawn } from 'node:child_process';
import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useEffect, useRef, useState } from 'react';
import { killTree, spawnTracked } from './exec.js';
import { OP_DIR } from './steps.js';

const URL = 'http://localhost:5180';
// Probe a route only the current label-app serves: a stale/old instance still
// holding the port 404s here, so we never declare "ready" (or open) the zombie.
const READY_URL = `${URL}/api/people/counts`;

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

/** Runs the label-app server (native), waits until it's actually serving, opens
 * the browser, and waits while the user names clusters — then stops it so the
 * pipeline can publish the new labels. Surfaces startup failures instead of
 * silently doing nothing. */
export function LabelStep({ onDone }: { onDone: () => void }) {
  const server = useRef<ChildProcess | null>(null);
  const [status, setStatus] = useState<'starting' | 'ready' | 'failed'>(
    'starting',
  );
  const [detail, setDetail] = useState('');

  useEffect(() => {
    const tail: string[] = [];
    let settled = false;
    const fail = (msg: string) => {
      if (settled) return;
      settled = true;
      setDetail(msg);
      setStatus('failed');
    };

    // Pipe stdio (not 'ignore') so a startup failure has a visible reason.
    const child = spawnTracked('npm', ['run', 'label'], { cwd: OP_DIR });
    server.current = child;
    const onData = (buf: Buffer) => {
      for (const line of buf.toString().split('\n')) {
        if (!line.trim()) continue;
        tail.push(line);
        if (tail.length > 12) tail.shift();
        if (/eaddrinuse|address already in use/i.test(line)) {
          fail('Port 5180 is already in use — stop the stale app: lsof -ti tcp:5180 | xargs kill');
        }
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('exit', (code) => {
      if (code) fail(tail.slice(-3).join(' ') || `label app exited (code ${code})`);
    });

    let cancelled = false;
    (async () => {
      for (let i = 0; i < 40 && !cancelled && !settled; i++) {
        try {
          const res = await fetch(READY_URL, {
            signal: AbortSignal.timeout(1500),
          });
          if (res.ok) {
            if (!settled) {
              settled = true;
              setStatus('ready');
              openBrowser(URL);
            }
            return;
          }
        } catch {
          // not up yet
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!cancelled) {
        fail(tail.slice(-3).join(' ') || 'label app never came up on :5180');
      }
    })();

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
      {status === 'starting' && (
        <Text color="cyan">Starting the labeling app… {URL}</Text>
      )}
      {status === 'ready' && (
        <Text color="cyan">Label your people &amp; pets: {URL}</Text>
      )}
      {status === 'failed' && (
        <Box flexDirection="column">
          <Text color="red">Couldn't open the labeling app.</Text>
          <Text dimColor>{detail}</Text>
          <Text dimColor>Then open {URL} in your browser.</Text>
        </Box>
      )}
      <Text dimColor>
        Name the clusters in the browser, then press enter here to publish.
      </Text>
    </Box>
  );
}
