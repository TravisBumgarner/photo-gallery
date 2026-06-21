import React from 'react';
import { Box, Text, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import { TextField } from './TextField.js';
import { useEffect, useMemo, useState } from 'react';
import {
  blastRadius,
  completePath,
  countLightroomExports,
  DEPLOY_TARGETS,
  deployGuidePath,
  expandHome,
  LIGHTROOM_PRESET,
  loadExistingValues,
  needsSetup,
} from './configFiles.js';
import { ConfigStep } from './ConfigStep.js';
import { DeployStep } from './DeployStep.js';
import { LabelStep } from './LabelStep.js';
import { PullStep } from './PullStep.js';
import { ServeStep } from './ServeStep.js';
import { MultiSelect } from './MultiSelect.js';
import { loadPrefs, savePrefs } from './prefs.js';
import { Runner } from './Runner.js';
import { Setup } from './Setup.js';
import {
  type ProcessOpts,
  type SourceAdapter,
  type Step,
  processSteps,
  publishStep,
  sourceSteps,
  storageCheckStep,
  syncSteps,
} from './steps.js';

type Screen =
  | 'setup'
  | 'start'
  | 'view'
  | 'deploy'
  | 'phases'
  | 'source'
  | 'lightroom'
  | 'mode'
  | 'create-confirm'
  | 'tasks'
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
  // Seed every prompt from last run's choices → enter-enter-enter on re-runs.
  const prefs = useMemo(loadPrefs, []);
  // --setup forces the wizard. With no config (fresh machine), offer a choice
  // first — set up from scratch, or restore a settings backup — instead of
  // forcing the wizard before the menu is reachable. Otherwise straight in.
  const [screen, setScreen] = useState<Screen>(
    forceSetup ? 'setup' : needsSetup() ? 'firstRun' : 'start',
  );
  // Current config (photo folder, model, storage) for the View screen.
  const cfg = useMemo(loadExistingValues, []);
  const [phases, setPhases] = useState<string[]>(prefs.phases);
  const [adapter, setAdapter] = useState<SourceAdapter>(prefs.adapter);
  const [mode, setMode] = useState<'create' | 'update'>(prefs.mode);
  const [tasks, setTasks] = useState<string[]>(prefs.tasks);
  // Blast radius for a Create wipe, computed when Create is picked.
  const [blast, setBlast] = useState<{ photos: number; hasDb: boolean } | null>(
    null,
  );
  // Lightroom export folder + its screen's draft/error state.
  const [lightroomDir, setLightroomDir] = useState<string>(prefs.lightroomDir);
  const [lrDraft, setLrDraft] = useState('');
  const [lrError, setLrError] = useState<string | null>(null);
  const [deployTarget, setDeployTarget] = useState<string>(prefs.deployTarget);

  // Persist selections once we commit to running.
  useEffect(() => {
    if (screen === 'run-pre')
      savePrefs({ phases, adapter, mode, tasks, lightroomDir, deployTarget });
  }, [screen, phases, adapter, mode, tasks, lightroomDir, deployTarget]);

  // Pre = source + pipeline up to clustering. Then (faces/dogs) the labeling UI.
  // Post = publish (with new labels) + sync.
  const { pre, post, needsLabel } = useMemo(() => {
    const pre: Step[] = [];
    const post: Step[] = [];
    // Validate the online gallery destination up front — before the hours-long
    // pipeline — whenever the run will write to it (publish and/or sync), so a
    // bad bucket/credentials fails fast instead of at the very end.
    if (phases.includes('process') || phases.includes('sync')) {
      pre.push(storageCheckStep());
    }
    if (phases.includes('source')) pre.push(...sourceSteps(adapter, lightroomDir));
    let opts: ProcessOpts | null = null;
    if (phases.includes('process')) {
      opts = {
        mode,
        ingest: tasks.includes('ingest'),
        tag: tasks.includes('tag'),
        faces: tasks.includes('faces'),
        dogs: tasks.includes('dogs'),
      };
      pre.push(...processSteps(opts));
      post.push(publishStep());
    }
    if (phases.includes('sync')) post.push(...syncSteps());
    return { pre, post, needsLabel: !!opts && (opts.faces || opts.dogs) };
  }, [phases, adapter, mode, tasks, lightroomDir]);

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

      {screen === 'setup' && <Setup onComplete={() => setScreen('phases')} />}

      {screen === 'start' && (
        <Box flexDirection="column">
          <Text dimColor>Photos: {cfg.SOURCE_DIR || '(not set)'}</Text>
          <Text dimColor>
            Online gallery: {cfg.STORAGE_URL || 'this computer (local disk)'}
          </Text>
          <SelectInput
            items={[
              { label: 'Continue with these settings', value: 'continue' },
              { label: 'View settings', value: 'view' },
              {
                label: 'Edit settings (photo folder, host, model, password)',
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
              else setScreen('phases');
            }}
          />
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
              savePrefs({
                phases,
                adapter,
                mode,
                tasks,
                lightroomDir,
                deployTarget: item.value,
              });
              setScreen(item.value === 'localhost' ? 'serve' : 'deployRun');
            }}
          />
        </Box>
      )}

      {screen === 'view' && (
        <Box flexDirection="column">
          <Text bold>Settings</Text>
          <Text>Hosting: {cfg.DEPLOY_TARGET || 'localhost'}</Text>
          <Text dimColor>
            {'  '}Guide: {deployGuidePath(cfg.DEPLOY_TARGET || 'localhost')}
          </Text>
          <Text>Photo folder: {cfg.SOURCE_DIR || '(not set)'}</Text>
          <Text>
            Online gallery: {cfg.STORAGE_URL || 'this computer (local disk)'}
          </Text>
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
              else setScreen('phases');
            }}
          />
        </Box>
      )}

      {screen === 'phases' && (
        <Box flexDirection="column">
          <Text>What would you like to do?</Text>
          <MultiSelect
            initial={phases}
            items={[
              { value: 'source', label: 'Import new photos from Lightroom' },
              { value: 'process', label: 'Make my photos searchable, and find people & dogs' },
              { value: 'sync', label: 'Put them in my online gallery' },
            ]}
            onSubmit={(sel) => {
              setPhases(sel);
              // 'source' = the Lightroom export-move (its only job). Manual folders
              // need no import step — ingest reads them directly — so go straight
              // to the Lightroom screen.
              if (sel.includes('source')) {
                setAdapter('lightroom');
                setScreen('lightroom');
              } else if (sel.includes('process')) setScreen('mode');
              else setScreen('run-pre');
            }}
          />
        </Box>
      )}

      {screen === 'lightroom' && (
        <Box flexDirection="column">
          <Text bold>Exporting from Lightroom</Text>
          <Text>
            1. In Lightroom, open the Export window. Right-click “Preset” on the
            left, choose Import…, and pick this file:
          </Text>
          <Text dimColor>   {LIGHTROOM_PRESET}</Text>
          <Text>
            2. Select your photos and click Export, using the “To Mobile Photo
            Gallery” preset. It saves small copies next to your originals — your
            originals are never touched.
          </Text>
          <Text>
            3. Type the folder you exported into and press enter — I’ll make sure
            the photos are there:
          </Text>
          <Box>
            <Text>Folder you exported to: </Text>
            <TextField
              value={lrDraft}
              onChange={setLrDraft}
              onTab={completePath}
              onSubmit={(raw) => {
                const dir = expandHome((raw.trim() || lightroomDir).trim());
                if (!dir) {
                  setLrError('Please type the folder you exported into.');
                  return;
                }
                const found = countLightroomExports(dir);
                if (found === 0) {
                  setLrError(
                    `Didn’t find any exported photos in ${dir}. Export from Lightroom first, then press enter to try again.`,
                  );
                  return;
                }
                setLrError(null);
                setLightroomDir(dir);
                setScreen(phases.includes('process') ? 'mode' : 'run-pre');
              }}
              placeholder={lightroomDir || undefined}
            />
          </Box>
          {lrError ? <Text color="red">  ✖ {lrError}</Text> : null}
        </Box>
      )}

      {screen === 'mode' && (
        <Box flexDirection="column">
          <Text>Adding new photos, or starting over?</Text>
          <SelectInput
            initialIndex={mode === 'update' ? 0 : 1}
            items={[
              { label: 'Add new photos (keep what I’ve already done)', value: 'update' },
              { label: 'Start over (erase everything and redo it)', value: 'create' },
            ]}
            onSelect={(item) => {
              const m = item.value as 'create' | 'update';
              setMode(m);
              if (m === 'create') {
                // Gate the wipe behind an explicit, count-bearing confirm —
                // unless there's nothing to lose (fresh setup), where Create
                // and Update are equivalent.
                const radius = blastRadius();
                if (radius.photos > 0 || radius.hasDb) {
                  setBlast(radius);
                  setScreen('create-confirm');
                  return;
                }
              }
              setScreen('tasks');
            }}
          />
        </Box>
      )}

      {screen === 'create-confirm' && (
        <Box flexDirection="column">
          <Text color="red" bold>
            ⚠ Starting over deletes everything you’ve done
          </Text>
          <Text>
            This deletes{' '}
            <Text bold>{blast?.photos.toLocaleString() ?? 0} photos</Text>
            {blast?.hasDb ? ' and everything found so far (search info, people, dogs, and any names you added)' : ''}
            , then starts fresh. This can’t be undone.
          </Text>
          <Text dimColor>
            Adding new photos keeps all of that and only handles what’s new.
          </Text>
          <SelectInput
            items={[
              { label: 'Yes, erase everything and start over', value: 'create' },
              { label: 'No — keep everything, just add new photos', value: 'update' },
            ]}
            onSelect={(item) => {
              setMode(item.value as 'create' | 'update');
              setScreen('tasks');
            }}
          />
        </Box>
      )}

      {screen === 'tasks' && (
        <Box flexDirection="column">
          <Text>What should I do with your photos?</Text>
          <Text dimColor>Pick what you want — everything else happens automatically.</Text>
          <MultiSelect
            initial={tasks}
            items={[
              { value: 'ingest', label: 'Bring in my photos' },
              { value: 'tag', label: 'Make them searchable — type “beach” to find your beach photos' },
              { value: 'faces', label: 'Find people' },
              { value: 'dogs', label: 'Find dogs' },
            ]}
            onSubmit={(sel) => {
              setTasks(sel);
              setScreen('run-pre');
            }}
          />
        </Box>
      )}

      {screen === 'run-pre' &&
        (pre.length + post.length > 0 ? (
          <Runner
            steps={pre}
            onDone={() => setScreen(needsLabel ? 'label' : 'run-post')}
          />
        ) : (
          <Text color="yellow">Nothing chosen — there’s nothing to do.</Text>
        ))}

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
