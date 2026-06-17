import React from 'react';
import { Box, Text, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { useEffect, useMemo, useState } from 'react';
import {
  blastRadius,
  countLightroomExports,
  expandHome,
  LIGHTROOM_PRESET,
  needsSetup,
} from './configFiles.js';
import { LabelStep } from './LabelStep.js';
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
  | 'phases'
  | 'source'
  | 'lightroom'
  | 'mode'
  | 'create-confirm'
  | 'tasks'
  | 'run-pre'
  | 'label'
  | 'run-post';

export function App({ forceSetup = false }: { forceSetup?: boolean }) {
  const { exit } = useApp();
  // Seed every prompt from last run's choices → enter-enter-enter on re-runs.
  const prefs = useMemo(loadPrefs, []);
  // Setup runs on --setup or when config is missing; otherwise straight to the
  // wizard.
  const [screen, setScreen] = useState<Screen>(
    forceSetup || needsSetup() ? 'setup' : 'phases',
  );
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

  // Persist selections once we commit to running.
  useEffect(() => {
    if (screen === 'run-pre')
      savePrefs({ phases, adapter, mode, tasks, lightroomDir });
  }, [screen, phases, adapter, mode, tasks, lightroomDir]);

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

      {screen === 'setup' && <Setup onComplete={() => setScreen('phases')} />}

      {screen === 'phases' && (
        <Box flexDirection="column">
          <Text>What would you like to do?</Text>
          <MultiSelect
            initial={phases}
            items={[
              { value: 'source', label: 'Get my photos ready' },
              { value: 'process', label: 'Make my photos searchable, and find people & dogs' },
              { value: 'sync', label: 'Put them in my online gallery' },
            ]}
            onSubmit={(sel) => {
              setPhases(sel);
              if (sel.includes('source')) setScreen('source');
              else if (sel.includes('process')) setScreen('mode');
              else setScreen('run-pre');
            }}
          />
        </Box>
      )}

      {screen === 'source' && (
        <Box flexDirection="column">
          <Text>Where are your photos?</Text>
          <SelectInput
            initialIndex={adapter === 'lightroom' ? 0 : 1}
            items={[
              { label: 'In Lightroom (I’ll help you export them)', value: 'lightroom' },
              { label: 'In a folder I’ve already set up', value: 'manual' },
            ]}
            onSelect={(item) => {
              const a = item.value as SourceAdapter;
              setAdapter(a);
              if (a === 'lightroom') setScreen('lightroom');
              else setScreen(phases.includes('process') ? 'mode' : 'run-pre');
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
            <TextInput
              value={lrDraft}
              onChange={setLrDraft}
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
              { label: 'Keep everything — just add new photos', value: 'update' },
              { label: 'Yes, erase everything and start over', value: 'create' },
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

      {screen === 'run-post' && <Runner steps={post} onDone={() => exit()} />}
    </Box>
  );
}
