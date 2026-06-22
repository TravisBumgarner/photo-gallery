import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import React, { useRef, useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { useEscapeBack } from './useEscapeBack.js';
import { DEPLOY_TARGETS, deployGuidePath } from './configFiles.js';
import {
  DEPLOY_PARAMS,
  deployScriptPath,
  loadDeployParams,
  pushScriptPath,
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

/** Push to a remote target — either the app code (`action: 'app'`, deploy.sh) or
 * the photos + DB (`action: 'data'`, push.sh). Supported targets (have
 * DEPLOY_PARAMS) prompt for their env params — pre-filled, editable — then run
 * the script live, tee'd to a log file. Unsupported targets point at the markdown
 * guide. (localhost is handled by ServeStep, not here.) */
export function DeployStep({
  target,
  action,
  onDone,
  onBack,
}: {
  target: string;
  /** 'app' = deploy code (deploy.sh); 'data' = publish photos + DB (push.sh). */
  action: 'app' | 'data';
  onDone: () => void;
  /** Esc on the first param field backs out to the deploy picker. */
  onBack: () => void;
}) {
  const fields = DEPLOY_PARAMS[target];
  const [stage, setStage] = useState<Stage>(fields ? 'params' : 'manual');
  const [detail, setDetail] = useState('');
  const tail = useRef<string[]>([]);

  const isData = action === 'data';
  const title = isData
    ? `Publish photos to ${label(target)}`
    : `Update the app on ${label(target)}`;
  const runningText = isData
    ? `Publishing photos to ${label(target)}…`
    : `Updating the app on ${label(target)}…`;
  const okText = isData
    ? `Photos published to ${label(target)}.`
    : `App deployed to ${label(target)}.`;
  const okNote = isData
    ? 'Restart the daemon (NFSN panel → Daemons → Send Signals → TERM) so it serves the new release.'
    : 'Next: Publish photos to load the gallery — the site has nothing to serve until you do.';
  const script = isData ? pushScriptPath(target) : deployScriptPath(target);
  const logPath = path.join(ROOT, '.deploy-logs', `${target}-${action}.log`);
  const siteUrl = (loadDeployParams(target).DEPLOY_SITE_URL ?? '').trim();

  // The params stage is handled by ParamForm; here we only back out of the
  // static "manual guide" stage. Once it's running, Esc is off — use the
  // end-screen actions instead.
  useEscapeBack(stage === 'manual' ? onBack : null);

  const run = (vals: Record<string, string>) => {
    saveDeployParams(target, vals);
    setStage('running');
    tail.current = [];
    mkdirSync(path.dirname(logPath), { recursive: true });
    writeFileSync(logPath, `# ${title}\n`);
    runStep(
      {
        cmd: 'sh',
        args: [script],
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

  // Shared end-screen actions: open the live site, the full log, or finish.
  const endActions = (
    <SelectInput
      items={[
        ...(siteUrl ? [{ label: 'Open the site', value: 'site' }] : []),
        { label: 'Open the full log', value: 'log' },
        { label: 'Finish', value: 'finish' },
      ]}
      onSelect={(item) => {
        if (item.value === 'site') openPath(siteUrl);
        else if (item.value === 'log') openPath(logPath);
        else onDone();
      }}
    />
  );

  if (stage === 'manual') {
    return (
      <Box flexDirection="column">
        <Text bold>Deploy to {label(target)}</Text>
        <Text>Automated deploy isn’t set up yet — follow the guide:</Text>
        <Text color="cyan">
          {'  '}
          {deployGuidePath(target)}
        </Text>
        <SelectInput
          items={[{ label: '← Back', value: 'back' }]}
          onSelect={onBack}
        />
      </Box>
    );
  }

  if (stage === 'params') {
    return (
      <Box flexDirection="column">
        <Text bold>{title}</Text>
        <Text dimColor>Enter keeps each saved value.</Text>
        <ParamForm
          fields={fields ?? []}
          initial={loadDeployParams(target)}
          onPersist={(v) => saveDeployParams(target, v)}
          onSubmit={run}
          onCancel={onBack}
        />
      </Box>
    );
  }

  if (stage === 'running') {
    return (
      <Box flexDirection="column">
        <Text color="cyan">{runningText}</Text>
        {/* Live tail — last few lines. Full output is in the log file. */}
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
          ✓ {okText}
        </Text>
        <Text dimColor>{okNote}</Text>
        <Text dimColor>Full log: {logPath}</Text>
        {endActions}
      </Box>
    );
  }

  // failed — show a longer tail inline plus the full-log path.
  return (
    <Box flexDirection="column">
      <Text color="red" bold>
        ✖ {title} failed.
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
