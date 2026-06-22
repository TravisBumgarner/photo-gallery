import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import React from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { useEffect, useMemo, useState } from 'react';
import {
  blastRadius,
  completePath,
  countStagingPhotos,
  DEPLOY_TARGETS,
  expandHome,
  loadExistingValues,
  needsSetup,
  STAGING_DIR,
  SUPPORTED_IMAGE_FORMATS,
} from './configFiles.js';
import { ConfigStep } from './ConfigStep.js';
import { DeployStep } from './DeployStep.js';
import { LabelStep } from './LabelStep.js';
import { loadPrefs, savePrefs } from './prefs.js';
import { PullStep } from './PullStep.js';
import { Runner } from './Runner.js';
import { ServeStep } from './ServeStep.js';
import { Setup } from './Setup.js';
import {
  archiveStep,
  importStep,
  processSteps,
  publishStep,
  type RunMode,
  type Step,
  storageCheckStep,
} from './steps.js';
import { TextField } from './TextField.js';

type Screen =
  | 'setup'
  | 'start'
  | 'settings'
  | 'deploy'
  | 'addPhotos'
  | 'import'
  | 'manual'
  | 'run-import'
  | 'process-confirm'
  | 'create-confirm'
  | 'run-pre'
  | 'label'
  | 'run-post'
  | 'done'
  | 'serve'
  | 'deployRun'
  | 'pull'
  | 'config'
  | 'firstRun';

/** The single remote deploy target (the non-localhost one). */
const REMOTE_TARGET =
  DEPLOY_TARGETS.find((t) => t.value !== 'localhost')?.value ?? 'nearlyfreespeech';

/** Open a folder in the OS file manager (best-effort; the path is shown anyway). */
function openInFileManager(p: string): void {
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [p]]
      : process.platform === 'win32'
        ? ['explorer', [p]]
        : ['xdg-open', [p]];
  try {
    spawn(cmd as string, args as string[], {
      stdio: 'ignore',
      detached: true,
    }).unref();
  } catch {
    // no opener — the path is printed on screen
  }
}

export function App({ forceSetup = false }: { forceSetup?: boolean }) {
  const { exit } = useApp();
  const prefs = useMemo(loadPrefs, []);
  // --setup forces the wizard. With no config (fresh machine), offer a choice
  // first — set up, or restore a backup — instead of forcing the wizard.
  const [screen, setScreen] = useState<Screen>(
    forceSetup ? 'setup' : needsSetup() ? 'firstRun' : 'start',
  );
  const cfg = useMemo(loadExistingValues, []);

  const [runMode, setRunMode] = useState<RunMode>('process');
  const [importDir, setImportDir] = useState<string>(prefs.importDir);
  const [importDraft, setImportDraft] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  // Where setup/config return when launched from more than one place (first-run
  // vs the Settings screen).
  const [returnTo, setReturnTo] = useState<Screen>('start');
  const [blast, setBlast] = useState<{ photos: number; hasDb: boolean } | null>(
    null,
  );
  const [deployTarget, setDeployTarget] = useState<string>(prefs.deployTarget);
  // Which half of a remote deploy DeployStep runs: 'app' (code) or 'data' (photos+DB).
  const [deployAction, setDeployAction] = useState<'app' | 'data'>('data');

  // Persist selections once we commit to running.
  useEffect(() => {
    if (screen === 'run-pre' || screen === 'run-import') {
      savePrefs({ importDir, deployTarget });
    }
  }, [screen, importDir, deployTarget]);

  // Esc = go back one level. Delegated screens (setup/config/deploy-run/pull
  // manage their own Esc; run/label/serve are live processes that intentionally
  // don't take Esc — see their components). The top-level menus quit.
  useInput((_input, key) => {
    if (!key.escape) return;
    if (
      screen === 'addPhotos' ||
      screen === 'process-confirm' ||
      screen === 'settings' ||
      screen === 'deploy'
    ) {
      setScreen('start');
    } else if (screen === 'import' || screen === 'manual') {
      setScreen('addPhotos');
    } else if (screen === 'create-confirm') {
      setScreen('settings');
    } else if (
      screen === 'start' ||
      screen === 'firstRun' ||
      screen === 'done'
    ) {
      exit();
    }
  });

  // The Process pipeline: ingest + compute, then the labeling UI, then publish.
  const { pre, post } = useMemo(
    () => ({
      pre: [storageCheckStep(), ...processSteps(runMode)],
      post: [publishStep(), archiveStep()],
    }),
    [runMode],
  );
  // The Add step runs on its own — just move photos into staging.
  const importSteps = useMemo(() => [importStep(importDir)], [importDir]);

  // Add → import: validate the folder, then run the move (→ "added" prompt).
  const startImport = (raw: string) => {
    const dir = expandHome((raw.trim() || importDir).trim());
    if (!dir || !existsSync(dir)) {
      setImportError('That folder doesn’t exist — type the folder your new photos are in.');
      return;
    }
    setImportError(null);
    setImportDir(dir);
    setScreen('run-import');
  };

  // Add → manual: the photos are already in staging. Refuse if it's empty.
  const confirmManual = () => {
    mkdirSync(STAGING_DIR, { recursive: true });
    if (countStagingPhotos() === 0) {
      setManualError(
        'No photos in the staging folder yet — add some, then try again.',
      );
      return;
    }
    setManualError(null);
    setScreen('process-confirm');
  };

  // Process: confirm first (it's the long step), then run the pipeline.
  const startProcess = () => setScreen('process-confirm');

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="magenta" bold>
        📷 Photo Gallery
      </Text>

      {screen === 'firstRun' && (
        <Box flexDirection="column">
          <Text bold>Let's get set up.</Text>
          <SelectInput
            items={[
              { label: 'Set up from scratch', value: 'setup' },
              { label: 'Restore from a backup', value: 'config' },
              { label: 'Quit', value: 'quit' },
            ]}
            onSelect={(item) => {
              if (item.value === 'quit') {
                exit();
                return;
              }
              // First run lands on the home menu once done, either way.
              setReturnTo('start');
              setScreen(item.value as Screen);
            }}
          />
        </Box>
      )}

      {screen === 'setup' && (
        <Setup
          onComplete={() => setScreen(returnTo)}
          // Cancel returns to where setup was opened from — unless there's still
          // no usable config, in which case back to the first-run choice.
          onCancel={() => setScreen(needsSetup() ? 'firstRun' : returnTo)}
        />
      )}

      {screen === 'start' && (
        <Box flexDirection="column">
          <Text>What do you want to do?</Text>
          <SelectInput
            items={[
              { label: 'Add photos', value: 'add' },
              { label: 'Process photos', value: 'process' },
              { label: 'Serve / deploy the gallery', value: 'deploy' },
              { label: 'Settings', value: 'settings' },
              { label: 'Quit', value: 'quit' },
            ]}
            onSelect={(item) => {
              if (item.value === 'add') setScreen('addPhotos');
              else if (item.value === 'process') startProcess();
              else if (item.value === 'deploy') setScreen('deploy');
              else if (item.value === 'settings') setScreen('settings');
              else exit();
            }}
          />
        </Box>
      )}

      {screen === 'addPhotos' && (
        <Box flexDirection="column">
          <Text bold>Add photos</Text>
          <Text dimColor>Get photos into the staging folder. Process them next.</Text>
          <SelectInput
            items={[
              { label: 'Import a Lightroom export', value: 'import' },
              { label: 'Add photos manually', value: 'manual' },
              { label: '← Back', value: 'back' },
            ]}
            onSelect={(item) => {
              if (item.value === 'import') {
                setImportDraft('');
                setImportError(null);
                setScreen('import');
              } else if (item.value === 'manual') {
                setManualError(null);
                setScreen('manual');
              } else {
                setScreen('start');
              }
            }}
          />
        </Box>
      )}

      {screen === 'manual' && (
        <Box flexDirection="column">
          <Text bold>Add photos manually</Text>
          <Text>Put your photos in this folder:</Text>
          <Text color="cyan">{STAGING_DIR}</Text>
          <Text dimColor>
            Nested folders are fine. Reads {SUPPORTED_IMAGE_FORMATS} — not HEIC or
            RAW (convert those first).
          </Text>
          <Text dimColor>
            {'  '}
            {countStagingPhotos()} photo(s) in the folder right now.
          </Text>
          <SelectInput
            items={[
              { label: 'Open the folder', value: 'open' },
              { label: 'Done — I’ve added my photos', value: 'go' },
              { label: '← Back', value: 'back' },
            ]}
            onSelect={(item) => {
              if (item.value === 'open') {
                mkdirSync(STAGING_DIR, { recursive: true });
                openInFileManager(STAGING_DIR);
              } else if (item.value === 'go') {
                confirmManual();
              } else {
                setScreen('addPhotos');
              }
            }}
          />
          {manualError ? <Text color="red">  ✖ {manualError}</Text> : null}
        </Box>
      )}

      {screen === 'import' && (
        <Box flexDirection="column">
          <Text bold>Import a Lightroom export</Text>
          <Text>
            Export with the “To Mobile Photo Gallery” preset, then enter the
            export folder:
          </Text>
          <Box>
            <Text>Export folder: </Text>
            <TextField
              value={importDraft}
              onChange={setImportDraft}
              onTab={completePath}
              onSubmit={startImport}
              placeholder={importDir || undefined}
            />
          </Box>
          {importError ? <Text color="red">  ✖ {importError}</Text> : null}
          <Text dimColor>  Tab completes paths · Esc to go back</Text>
        </Box>
      )}

      {screen === 'run-import' && (
        <Runner steps={importSteps} onDone={() => setScreen('process-confirm')} />
      )}

      {screen === 'process-confirm' && (
        <Box flexDirection="column">
          <Text bold>Process photos</Text>
          <Text>
            This ingests new photos, runs tagging + face/dog detection, then
            publishes the gallery.
          </Text>
          <Text dimColor>
            {countStagingPhotos()} new photo(s) in staging.
          </Text>
          <Text color="yellow">
            ⚠ This can take a while — minutes to hours to days on a large library
            or without a GPU.
          </Text>
          <Text color="yellow">
            {'  '}Keep your laptop awake and plugged in until it finishes (it
            won’t run while the machine is asleep). It’s resumable, so you can
            stop and run it again later.
          </Text>
          <SelectInput
            items={[
              { label: 'Start processing', value: 'go' },
              { label: '← Back', value: 'back' },
            ]}
            onSelect={(item) => {
              if (item.value === 'go') {
                setRunMode('process');
                setScreen('run-pre');
              } else {
                setScreen('start');
              }
            }}
          />
        </Box>
      )}

      {screen === 'create-confirm' && (
        <Box flexDirection="column">
          <Text color="red" bold>
            ⚠ Start over reprocesses everything
          </Text>
          <Text>
            This wipes the database and reprocesses every photo from scratch
            (tagging and detection re-run). Your photo files are kept.
            {blast?.photos
              ? ` ~${blast.photos.toLocaleString()} photos will be reprocessed.`
              : ''}
          </Text>
          <SelectInput
            items={[
              { label: 'Yes, start over', value: 'yes' },
              { label: '← No, go back', value: 'no' },
            ]}
            onSelect={(item) => {
              if (item.value === 'yes') {
                setRunMode('create');
                setScreen('run-pre');
              } else {
                setScreen('settings');
              }
            }}
          />
        </Box>
      )}

      {screen === 'deploy' && (
        <Box flexDirection="column">
          <Text bold>Serve / deploy the gallery</Text>
          <SelectInput
            items={[
              { label: 'Serve on this computer', value: 'serve' },
              { label: 'Publish photos to your site', value: 'publish' },
              { label: 'Update the app on your site', value: 'app' },
              { label: '← Back', value: 'back' },
            ]}
            onSelect={(item) => {
              if (item.value === 'serve') {
                setDeployTarget('localhost');
                savePrefs({ importDir, deployTarget: 'localhost' });
                setScreen('serve');
              } else if (item.value === 'publish' || item.value === 'app') {
                setDeployTarget(REMOTE_TARGET);
                savePrefs({ importDir, deployTarget: REMOTE_TARGET });
                setDeployAction(item.value === 'publish' ? 'data' : 'app');
                setScreen('deployRun');
              } else {
                setScreen('start');
              }
            }}
          />
        </Box>
      )}

      {screen === 'settings' && (
        <Box flexDirection="column">
          <Text bold>Settings</Text>
          <SelectInput
            items={[
              { label: 'Edit settings (host, model, password)', value: 'edit' },
              { label: 'Back up / restore settings', value: 'config' },
              // Only meaningful with a remote host to pull from.
              ...((cfg.DEPLOY_TARGET ?? 'localhost') !== 'localhost'
                ? [
                    {
                      label: 'Download the gallery from your server',
                      value: 'pull',
                    },
                  ]
                : []),
              { label: 'Start over (wipe & reprocess everything)', value: 'start-over' },
              { label: '← Back', value: 'back' },
            ]}
            onSelect={(item) => {
              if (item.value === 'edit') {
                setReturnTo('settings');
                setScreen('setup');
              } else if (item.value === 'config') {
                setReturnTo('settings');
                setScreen('config');
              } else if (item.value === 'pull') {
                setScreen('pull');
              } else if (item.value === 'start-over') {
                setBlast(blastRadius());
                setScreen('create-confirm');
              } else {
                setScreen('start');
              }
            }}
          />
        </Box>
      )}

      {screen === 'run-pre' && (
        <Runner steps={pre} onDone={() => setScreen('label')} />
      )}

      {screen === 'label' && <LabelStep onDone={() => setScreen('run-post')} />}

      {screen === 'run-post' && (
        <Runner steps={post} onDone={() => setScreen('done')} />
      )}

      {screen === 'done' && (
        <Box flexDirection="column">
          <Text color="green" bold>
            ✓ All done — your gallery data is built and published.
          </Text>
          {(cfg.DEPLOY_TARGET || 'localhost') === 'localhost' ? (
            <Box flexDirection="column">
              <Text>Bring it up on this computer?</Text>
              <SelectInput
                items={[
                  {
                    label: 'Yes — build the web UI and serve it now',
                    value: 'serve',
                  },
                  { label: 'No — just finish', value: 'finish' },
                ]}
                onSelect={(item) =>
                  item.value === 'serve' ? setScreen('serve') : exit()
                }
              />
            </Box>
          ) : (
            <Box flexDirection="column">
              <Text>
                Publish these photos to your site (
                <Text bold>{cfg.DEPLOY_TARGET}</Text>) now?
              </Text>
              <SelectInput
                items={[
                  { label: 'Yes — publish photos', value: 'publish' },
                  { label: 'No — just finish', value: 'finish' },
                ]}
                onSelect={(item) => {
                  if (item.value === 'publish') {
                    setDeployTarget(REMOTE_TARGET);
                    setDeployAction('data');
                    setScreen('deployRun');
                  } else {
                    exit();
                  }
                }}
              />
            </Box>
          )}
        </Box>
      )}

      {screen === 'serve' && <ServeStep onDone={() => exit()} />}

      {screen === 'deployRun' && (
        <DeployStep
          target={deployTarget}
          action={deployAction}
          onDone={() => exit()}
          onBack={() => setScreen('deploy')}
        />
      )}

      {screen === 'pull' && <PullStep onDone={() => setScreen('settings')} />}

      {screen === 'config' && (
        <ConfigStep onDone={() => setScreen(needsSetup() ? 'firstRun' : returnTo)} />
      )}
    </Box>
  );
}
