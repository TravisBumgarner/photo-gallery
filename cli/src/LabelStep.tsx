import { type ChildProcess, spawn } from 'node:child_process';
import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useEffect, useRef } from 'react';
import { OI_DIR } from './steps.js';

const URL = 'http://localhost:5180';

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

/** Runs the label-app server (native) and waits while the user names clusters,
 * then stops it so the pipeline can publish the new labels. */
export function LabelStep({ onDone }: { onDone: () => void }) {
  const server = useRef<ChildProcess | null>(null);

  useEffect(() => {
    server.current = spawn('npm', ['run', 'label'], {
      cwd: OI_DIR,
      stdio: 'ignore',
    });
    const t = setTimeout(() => openBrowser(URL), 1500); // let it bind first
    return () => {
      clearTimeout(t);
      server.current?.kill();
    };
  }, []);

  useInput((_input, key) => {
    if (key.return) {
      server.current?.kill();
      onDone();
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="cyan">Label your people &amp; pets: {URL}</Text>
      <Text dimColor>
        Name the clusters in the browser, then press enter here to publish.
      </Text>
    </Box>
  );
}
