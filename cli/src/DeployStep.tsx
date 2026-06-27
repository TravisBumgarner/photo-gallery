import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
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

type Stage =
  | 'params'
  | 'checking'
  | 'choose'
  | 'needsApp'
  | 'running'
  | 'ok'
  | 'failed'
  | 'manual';

const label = (target: string) =>
  DEPLOY_TARGETS.find((t) => t.value === target)?.label ?? target;

/** What's already on the host: is the app deployed (dist/boot.js) and does it have
 * a published gallery (data/out/db/latest)? One key-auth SSH round-trip, like the
 * deploy. On any SSH failure we report both false — the scripts re-check and emit
 * the precise error, so we never block on a flaky probe. */
function serverState(
  vals: Record<string, string>,
): Promise<{ app: boolean; data: boolean }> {
  return new Promise((resolve) => {
    const host = vals.DEPLOY_SSH_HOST;
    const dir = vals.DEPLOY_REMOTE_DIR || '/home/protected';
    if (!host) {
      resolve({ app: false, data: false });
      return;
    }
    let key = vals.DEPLOY_SSH_KEY || '';
    if (key.startsWith('~')) key = os.homedir() + key.slice(1);
    const args: string[] = [];
    if (key) args.push('-i', key);
    args.push(
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
      '-o',
      'StrictHostKeyChecking=accept-new',
      host,
      `test -f '${dir}/dist/boot.js' && echo APP; test -f '${dir}/data/out/db/latest' && echo DATA`,
    );
    try {
      let out = '';
      const child = spawn('ssh', args, {
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      child.stdout?.on('data', (d) => {
        out += d.toString();
      });
      child.on('error', () => resolve({ app: false, data: false }));
      child.on('close', () =>
        resolve({ app: /\bAPP\b/.test(out), data: /\bDATA\b/.test(out) }),
      );
    } catch {
      resolve({ app: false, data: false });
    }
  });
}

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
  const pendingVals = useRef<Record<string, string>>({});

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

  // The params stage is handled by ParamForm; the manual-guide and the
  // add/replace choice back out via Esc. Once it's running, Esc is off — use the
  // end-screen actions instead.
  useEscapeBack(
    stage === 'manual' || stage === 'choose' || stage === 'needsApp'
      ? onBack
      : null,
  );

  // Run one script live, tee'd to the shared log; resolves with its exit code.
  const runScript = (
    scriptPath: string,
    env: Record<string, string>,
  ): Promise<number> =>
    runStep({ cmd: 'sh', args: [scriptPath], cwd: ROOT, env }, (line) => {
      try {
        appendFileSync(logPath, `${line}\n`);
      } catch {
        // logging is best-effort; never break the deploy on a write error
      }
      tail.current.push(line);
      if (tail.current.length > 200) tail.current.shift();
      setDetail(line);
    });

  // Run the script(s). data pushes pass PUSH_REPLACE for add-vs-replace; when
  // deployAppFirst is set (publish chosen with no app on the host), run the app
  // deploy first and only publish if it succeeds.
  const launch = (
    vals: Record<string, string>,
    replace: boolean,
    deployAppFirst = false,
  ) => {
    setStage('running');
    tail.current = [];
    mkdirSync(path.dirname(logPath), { recursive: true });
    writeFileSync(logPath, `# ${title}\n`);
    const env = isData ? { ...vals, PUSH_REPLACE: replace ? '1' : '' } : vals;
    const chain = deployAppFirst
      ? runScript(deployScriptPath(target), vals).then((code) =>
          code === 0 ? runScript(script, env) : code,
        )
      : runScript(script, env);
    chain.then((code) => setStage(code === 0 ? 'ok' : 'failed'));
  };

  const run = (vals: Record<string, string>) => {
    saveDeployParams(target, vals);
    // App deploy: just go. Data publish needs the app on the host first; probe
    // once, then: no app → offer to deploy it first; app + existing gallery →
    // ask add-vs-replace; app + no gallery → first publish, just go.
    if (!isData) {
      launch(vals, false);
      return;
    }
    pendingVals.current = vals;
    setStage('checking');
    serverState(vals).then(({ app, data }) => {
      if (!app) setStage('needsApp');
      else if (data) setStage('choose');
      else launch(vals, false);
    });
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

  if (stage === 'checking') {
    return (
      <Box flexDirection="column">
        <Text color="cyan">Checking the server…</Text>
      </Box>
    );
  }

  if (stage === 'choose') {
    return (
      <Box flexDirection="column">
        <Text bold>{title}</Text>
        <Text>Your site already has photos. What should I do?</Text>
        <SelectInput
          items={[
            { label: 'Add new + update changed (recommended)', value: 'merge' },
            { label: 'Replace everything on the server', value: 'replace' },
          ]}
          onSelect={(item) =>
            launch(pendingVals.current, item.value === 'replace')
          }
        />
        <Text dimColor>  Esc to go back</Text>
      </Box>
    );
  }

  if (stage === 'needsApp') {
    return (
      <Box flexDirection="column">
        <Text bold>{title}</Text>
        <Text>
          The app isn’t deployed on {label(target)} yet — publishing needs it
          there first to load the database.
        </Text>
        <SelectInput
          items={[
            {
              label: 'Deploy the app first, then publish (recommended)',
              value: 'chain',
            },
            { label: '← Back', value: 'back' },
          ]}
          onSelect={(item) => {
            if (item.value === 'chain') launch(pendingVals.current, false, true);
            else onBack();
          }}
        />
        <Text dimColor>
          {'  '}Builds + uploads the app, then publishes your photos. Esc to go
          back.
        </Text>
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
