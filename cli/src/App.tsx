import { existsSync } from 'node:fs';
import React from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { useEffect, useMemo, useState } from 'react';
import {
  blastRadius,
  completePath,
  DEPLOY_TARGETS,
  deployGuidePath,
  expandHome,
  loadExistingValues,
  needsSetup,
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
  | 'view'
  | 'deploy'
  | 'pickMode'
  | 'import'
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

/** Mask a secret for display — present or not, never the value. */
const masked = (v?: string) => (v ? '•••• (set)' : '(not set)');

export function App({ forceSetup = false }: { forceSetup?: boolean }) {
  const { exit } = useApp();
  const prefs = useMemo(loadPrefs, []);
  // --setup forces the wizard. With no config (fresh machine), offer a choice
  // first — set up, or restore a backup — instead of forcing the wizard.
  const [screen, setScreen] = useState<Screen>(
    forceSetup ? 'setup' : needsSetup() ? 'firstRun' : 'start',
  );
  const cfg = useMemo(loadExistingValues, []);

  const [runMode, setRunMode] = useState<RunMode>('add');
  const [importDir, setImportDir] = useState<string>(prefs.importDir);
  const [importDraft, setImportDraft] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [blast, setBlast] = useState<{ photos: number; hasDb: boolean } | null>(
    null,
  );
  const [deployTarget, setDeployTarget] = useState<string>(prefs.deployTarget);

  // Persist selections once we commit to running.
  useEffect(() => {
    if (screen === 'run-pre') savePrefs({ importDir, deployTarget });
  }, [screen, importDir, deployTarget]);

  // Esc goes back on the navigation screens (run/setup/label/serve manage their own).
  useInput((_input, key) => {
    if (!key.escape) return;
    if (screen === 'pickMode' || screen === 'view' || screen === 'deploy') {
      setScreen('start');
    } else if (screen === 'import' || screen === 'create-confirm') {
      setScreen('pickMode');
    }
  });

  // pre = import + compute up to clustering; then the labeling UI; then post.
  const { pre, post } = useMemo(() => {
    const pre: Step[] = [storageCheckStep()];
    if (runMode === 'add') pre.push(importStep(importDir));
    pre.push(...processSteps(runMode));
    const post: Step[] = [publishStep()];
    if (runMode !== 'repair') post.push(archiveStep());
    return { pre, post };
  }, [runMode, importDir]);

  const startAdd = (raw: string) => {
    const dir = expandHome((raw.trim() || importDir).trim());
    if (!dir || !existsSync(dir)) {
      setImportError('That folder doesn’t exist — type the folder your new photos are in.');
      return;
    }
    setImportError(null);
    setImportDir(dir);
    setRunMode('add');
    setScreen('run-pre');
  };

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="magenta" bold>
        📷 Photo Gallery
      </Text>

      {screen === 'firstRun' && (
        <Box flexDirection="column">
          <Text>No settings found on this machine.</Text>
          <SelectInput
            items={[
              { label: 'Set up from scratch', value: 'setup' },
              { label: 'Restore from a backup zip', value: 'config' },
            ]}
            onSelect={(item) => setScreen(item.value as Screen)}
          />
        </Box>
      )}

      {screen === 'setup' && <Setup onComplete={() => setScreen('pickMode')} />}

      {screen === 'start' && (
        <Box flexDirection="column">
          <Text dimColor>Staging library: {cfg.SOURCE_DIR || '(not set)'}</Text>
          <SelectInput
            items={[
              { label: 'Continue with these settings', value: 'continue' },
              { label: 'View settings', value: 'view' },
              {
                label: 'Edit settings (staging folder, host, model, password)',
                value: 'edit',
              },
              { label: 'Put my gallery online (deploy / serve)', value: 'deploy' },
              { label: 'Pull published data down from my host', value: 'pull' },
              { label: 'Back up / restore my settings', value: 'config' },
            ]}
            onSelect={(item) => {
              if (item.value === 'view') setScreen('view');
              else if (item.value === 'edit') setScreen('setup');
              else if (item.value === 'deploy') setScreen('deploy');
              else if (item.value === 'pull') setScreen('pull');
              else if (item.value === 'config') setScreen('config');
              else setScreen('pickMode');
            }}
          />
        </Box>
      )}

      {screen === 'pickMode' && (
        <Box flexDirection="column">
          <Text>What would you like to do?</Text>
          <SelectInput
            items={[
              { label: 'Add new photos', value: 'add' },
              { label: 'Finish / repair processing (no new photos)', value: 'repair' },
              { label: 'Start over (re-process my whole library)', value: 'create' },
            ]}
            onSelect={(item) => {
              if (item.value === 'add') {
                setImportDraft('');
                setImportError(null);
                setScreen('import');
              } else if (item.value === 'repair') {
                setRunMode('repair');
                setScreen('run-pre');
              } else {
                setBlast(blastRadius());
                setScreen('create-confirm');
              }
            }}
          />
          <Text dimColor>  Esc: back</Text>
        </Box>
      )}

      {screen === 'import' && (
        <Box flexDirection="column">
          <Text bold>Add new photos</Text>
          <Text>
            Point me at a folder of new photos — I’ll move them into your staging
            library and process them.
          </Text>
          <Text dimColor>
            Using Lightroom? Export with the “To Mobile Photo Gallery” preset,
            then enter that export folder here.
          </Text>
          <Box>
            <Text>Import from folder: </Text>
            <TextField
              value={importDraft}
              onChange={setImportDraft}
              onTab={completePath}
              onSubmit={startAdd}
              placeholder={importDir || undefined}
            />
          </Box>
          {importError ? <Text color="red">  ✖ {importError}</Text> : null}
          <Text dimColor>  Esc: back</Text>
        </Box>
      )}

      {screen === 'create-confirm' && (
        <Box flexDirection="column">
          <Text color="red" bold>
            ⚠ Start over re-processes your whole library
          </Text>
          <Text>
            This wipes the database + gallery and re-ingests everything in your
            staging library (including the _already_processed archive), then
            re-runs tagging and detection. Your photo files aren’t deleted.
            {blast?.photos
              ? ` ~${blast.photos.toLocaleString()} photos will be reprocessed.`
              : ''}
          </Text>
          <SelectInput
            items={[
              { label: 'Yes, start over', value: 'yes' },
              { label: 'No — go back', value: 'no' },
            ]}
            onSelect={(item) => {
              if (item.value === 'yes') {
                setRunMode('create');
                setScreen('run-pre');
              } else {
                setScreen('pickMode');
              }
            }}
          />
          <Text dimColor>  Esc: back</Text>
        </Box>
      )}

      {screen === 'deploy' && (
        <Box flexDirection="column">
          <Text>Where do you want to put your gallery?</Text>
          <Text dimColor>
            “This computer” serves it locally. Others deploy your published
            gallery to that host.
          </Text>
          <SelectInput
            initialIndex={Math.max(
              0,
              DEPLOY_TARGETS.findIndex((t) => t.value === deployTarget),
            )}
            items={[
              ...DEPLOY_TARGETS.map((t) => ({ label: t.label, value: t.value })),
              { label: '← Back', value: '__back' },
            ]}
            onSelect={(item) => {
              if (item.value === '__back') {
                setScreen('start');
                return;
              }
              setDeployTarget(item.value);
              savePrefs({ importDir, deployTarget: item.value });
              setScreen(item.value === 'localhost' ? 'serve' : 'deployRun');
            }}
          />
          <Text dimColor>  Esc: back</Text>
        </Box>
      )}

      {screen === 'view' && (
        <Box flexDirection="column">
          <Text bold>Settings</Text>
          <Text>Hosting: {cfg.DEPLOY_TARGET || 'localhost'}</Text>
          <Text dimColor>
            {'  '}Guide: {deployGuidePath(cfg.DEPLOY_TARGET || 'localhost')}
          </Text>
          <Text>Staging library: {cfg.SOURCE_DIR || '(not set)'}</Text>
          <Text>
            Tagging model: {cfg.MODEL_SERVER_MODEL || 'none'}
            {cfg.MODEL_SERVER_HOST ? ` @ ${cfg.MODEL_SERVER_HOST}` : ''}
          </Text>
          <Text>Gallery password: {masked(cfg.APP_PASSWORD)}</Text>
          <SelectInput
            items={[
              { label: 'Continue with these settings', value: 'continue' },
              { label: 'Edit settings', value: 'edit' },
              { label: 'Back', value: 'back' },
            ]}
            onSelect={(item) => {
              if (item.value === 'edit') setScreen('setup');
              else if (item.value === 'back') setScreen('start');
              else setScreen('pickMode');
            }}
          />
          <Text dimColor>  Esc: back</Text>
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
                Put it online now — deploy to{' '}
                <Text bold>{cfg.DEPLOY_TARGET}</Text>?
              </Text>
              <SelectInput
                items={[
                  {
                    label: `Yes — deploy to ${cfg.DEPLOY_TARGET}`,
                    value: 'deploy',
                  },
                  { label: 'No — just finish', value: 'finish' },
                ]}
                onSelect={(item) => {
                  if (item.value === 'deploy') {
                    setDeployTarget(cfg.DEPLOY_TARGET || 'localhost');
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
        <DeployStep target={deployTarget} onDone={() => exit()} />
      )}

      {screen === 'pull' && <PullStep onDone={() => setScreen('start')} />}

      {screen === 'config' && <ConfigStep onDone={() => setScreen('start')} />}
    </Box>
  );
}
