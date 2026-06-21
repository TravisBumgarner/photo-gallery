import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import React, { useRef, useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { DEPLOY_TARGETS, deployGuidePath } from './configFiles.js';
import {
  DEPLOY_PARAMS,
  deployScriptPath,
  loadDeployParams,
  saveDeployParams,
} from './deployParams.js';
import { runStep } from './exec.js';
import { ParamForm } from './ParamForm.js';
import { ROOT } from './steps.js';

type Stage = 'params' | 'running' | 'ok' | 'failed' | 'manual';

const label = (target: string) =>
  DEPLOY_TARGETS.find((t) => t.value === target)?.label ?? target;

/** Open a file in the OS default app (best-effort). */
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

/** Deploy to a remote target. Supported targets (have DEPLOY_PARAMS) prompt for
 * their script's env params — pre-filled from last time, editable — then run
 * templates/<target>/deploy.sh live. Full output is tee'd to a log file so the
 * whole thing is reviewable (the on-screen view is only a live tail).
 * Unsupported targets just point at the markdown guide for now. (localhost is
 * handled by ServeStep, not here.) */
export function DeployStep({
  target,
  onDone,
}: {
  target: string;
  onDone: () => void;
}) {
  const fields = DEPLOY_PARAMS[target];
  const [stage, setStage] = useState<Stage>(fields ? 'params' : 'manual');
  const [detail, setDetail] = useState('');
  const tail = useRef<string[]>([]);
  const logPath = path.join(ROOT, '.deploy-logs', `${target}.log`);

  const run = (vals: Record<string, string>) => {
    saveDeployParams(target, vals);
    setStage('running');
    tail.current = [];
    mkdirSync(path.dirname(logPath), { recursive: true });
    writeFileSync(logPath, `# deploy ${target} — ${label(target)}\n`);
    runStep(
      {
        cmd: 'sh',
        args: [deployScriptPath(target)],
        cwd: ROOT,
        env: vals,
      },
      (line) => {
        try {
          appendFileSync(logPath, `${line}\n`);
        } catch {
          // logging is best-effort; never break the deploy on a write error
        }
        tail.current.push(line);
        if (tail.current.length > 200) tail.current.shift();
        setDetail(line);
      },
    ).then((code) => setStage(code === 0 ? 'ok' : 'failed'));
  };

  // Shared end-screen actions: open the full log, or finish.
  const endActions = (
    <SelectInput
      items={[
        { label: 'Open the full log', value: 'log' },
        { label: 'Finish', value: 'finish' },
      ]}
      onSelect={(item) => {
        if (item.value === 'log') openPath(logPath);
        else onDone();
      }}
    />
  );

  if (stage === 'manual') {
    return (
      <Box flexDirection="column">
        <Text>
          Automated deploy to <Text bold>{label(target)}</Text> isn’t wired up
          yet — follow the guide:
        </Text>
        <Text color="cyan">
          {'  '}
          {deployGuidePath(target)}
        </Text>
        <SelectInput
          items={[{ label: 'Finish', value: 'finish' }]}
          onSelect={onDone}
        />
      </Box>
    );
  }

  if (stage === 'params') {
    return (
      <Box flexDirection="column">
        <Text>
          Deploy to <Text bold>{label(target)}</Text> — confirm the settings
          (enter keeps each):
        </Text>
        <ParamForm
          fields={fields ?? []}
          initial={loadDeployParams(target)}
          onPersist={(v) => saveDeployParams(target, v)}
          onSubmit={run}
        />
      </Box>
    );
  }

  if (stage === 'running') {
    return (
      <Box flexDirection="column">
        <Text color="cyan">Deploying to {label(target)}…</Text>
        {/* Live tail — last few lines. Full output is in the log file. */}
        {tail.current.slice(-8).map((l, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rolling tail snapshot
          <Text key={i} dimColor>
            {'  '}
            {l}
          </Text>
        ))}
        <Text dimColor>
          Full log (tail -f to follow): {logPath}
        </Text>
      </Box>
    );
  }

  if (stage === 'ok') {
    return (
      <Box flexDirection="column">
        <Text color="green" bold>
          ✓ Deployed to {label(target)}.
        </Text>
        <Text dimColor>
          If the daemon was already running, restart it so it picks up the new
          release.
        </Text>
        <Text dimColor>Full log: {logPath}</Text>
        {endActions}
      </Box>
    );
  }

  // failed — show a longer tail inline plus the full-log path.
  return (
    <Box flexDirection="column">
      <Text color="red" bold>
        ✖ Deploy to {label(target)} failed.
      </Text>
      {tail.current.slice(-15).map((l, i) => (
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
