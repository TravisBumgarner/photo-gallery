import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import React, { useRef, useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import {
  DEPLOY_PARAMS,
  loadDeployParams,
  saveDeployParams,
} from './deployParams.js';
import { runStep } from './exec.js';
import { ParamForm } from './ParamForm.js';
import { ROOT } from './steps.js';

// Pull reuses the NFS deploy's connection params (host/key/dir) — but not the
// public site URL, which is irrelevant to a download.
const PULL_PARAMS = (DEPLOY_PARAMS.nearlyfreespeech ?? []).filter(
  (p) => p.key !== 'DEPLOY_SITE_URL',
);
const SCRIPT = path.join(ROOT, 'deploy', 'nearlyfreespeech', 'pull.sh');

function openPath(p: string): void {
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [p]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', p]]
        : ['xdg-open', [p]];
  try {
    spawn(cmd as string, args as string[], {
      stdio: 'ignore',
      detached: true,
    }).unref();
  } catch {
    // no opener — the path is printed anyway
  }
}

type Stage = 'params' | 'running' | 'ok' | 'failed';

/** Pull the published data/out down from the NFS host so this machine can serve
 * or rebuild from it. Reuses the deploy's saved host/key, runs pull.sh live. */
export function PullStep({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState<Stage>('params');
  const [detail, setDetail] = useState('');
  const tail = useRef<string[]>([]);
  const logPath = path.join(ROOT, '.deploy-logs', 'pull.log');

  const run = (vals: Record<string, string>) => {
    saveDeployParams('nearlyfreespeech', vals); // values carry the site URL too
    setStage('running');
    tail.current = [];
    mkdirSync(path.dirname(logPath), { recursive: true });
    writeFileSync(logPath, '# pull data/out from host\n');
    runStep({ cmd: 'sh', args: [SCRIPT], cwd: ROOT, env: vals }, (line) => {
      try {
        appendFileSync(logPath, `${line}\n`);
      } catch {
        // best-effort
      }
      tail.current.push(line);
      if (tail.current.length > 200) tail.current.shift();
      setDetail(line);
    }).then((code) => setStage(code === 0 ? 'ok' : 'failed'));
  };

  const endActions = (
    <SelectInput
      items={[
        { label: 'Open the full log', value: 'log' },
        { label: 'Done', value: 'done' },
      ]}
      onSelect={(item) => (item.value === 'log' ? openPath(logPath) : onDone())}
    />
  );

  if (stage === 'params') {
    return (
      <Box flexDirection="column">
        <Text bold>Download the gallery from your server</Text>
        <Text dimColor>
          Copies the database + photos down to this machine (e.g. onto a new or
          wiped computer). Uses your saved deploy connection.
        </Text>
        <ParamForm
          fields={PULL_PARAMS}
          initial={loadDeployParams('nearlyfreespeech')}
          onPersist={(v) => saveDeployParams('nearlyfreespeech', v)}
          onSubmit={run}
          onCancel={onDone}
        />
      </Box>
    );
  }

  if (stage === 'running') {
    return (
      <Box flexDirection="column">
        <Text color="cyan">Pulling from your host…</Text>
        {tail.current.slice(-8).map((l, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rolling tail snapshot
          <Text key={i} dimColor>
            {'  '}
            {l}
          </Text>
        ))}
        <Text dimColor>Full log: {logPath}</Text>
      </Box>
    );
  }

  if (stage === 'ok') {
    return (
      <Box flexDirection="column">
        <Text color="green" bold>
          ✓ Pulled — your local copy now matches the host.
        </Text>
        <Text dimColor>
          You can now serve it here, or add new photos and reprocess.
        </Text>
        {endActions}
      </Box>
    );
  }

  // failed
  return (
    <Box flexDirection="column">
      <Text color="red" bold>
        ✖ Pull failed.
      </Text>
      {tail.current.slice(-12).map((l, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static tail snapshot
        <Text key={i} dimColor>
          {'  '}
          {l}
        </Text>
      ))}
      <Text dimColor>Full log: {logPath}</Text>
      {endActions}
    </Box>
  );
}
