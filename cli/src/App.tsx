import React from 'react';
import { Box, Text, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import { useEffect, useMemo, useState } from 'react';
import { needsSetup } from './configFiles.js';
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
  syncSteps,
} from './steps.js';

type Screen =
  | 'setup'
  | 'phases'
  | 'source'
  | 'mode'
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

  // Persist selections once we commit to running.
  useEffect(() => {
    if (screen === 'run-pre') savePrefs({ phases, adapter, mode, tasks });
  }, [screen, phases, adapter, mode, tasks]);

  // Pre = source + pipeline up to clustering. Then (faces/dogs) the labeling UI.
  // Post = publish (with new labels) + sync.
  const { pre, post, needsLabel } = useMemo(() => {
    const pre: Step[] = [];
    const post: Step[] = [];
    if (phases.includes('source')) pre.push(...sourceSteps(adapter));
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
  }, [phases, adapter, mode, tasks]);

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="magenta" bold>
        📷 photo-gallery orchestrator
      </Text>

      {screen === 'setup' && <Setup onComplete={() => setScreen('phases')} />}

      {screen === 'phases' && (
        <Box flexDirection="column">
          <Text>Which phases to run?</Text>
          <MultiSelect
            initial={phases}
            items={[
              { value: 'source', label: 'Source — get photos into the ingest folder' },
              { value: 'process', label: 'Process — ingest, tag, faces/dogs, publish' },
              { value: 'sync', label: 'Sync — push media to the bucket' },
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
          <Text>Source adapter?</Text>
          <SelectInput
            initialIndex={adapter === 'lightroom' ? 0 : 1}
            items={[
              { label: 'Lightroom export', value: 'lightroom' },
              { label: 'Manual (folder already prepared)', value: 'manual' },
            ]}
            onSelect={(item) => {
              setAdapter(item.value as SourceAdapter);
              setScreen(phases.includes('process') ? 'mode' : 'run-pre');
            }}
          />
        </Box>
      )}

      {screen === 'mode' && (
        <Box flexDirection="column">
          <Text>Process mode?</Text>
          <SelectInput
            initialIndex={mode === 'update' ? 0 : 1}
            items={[
              { label: 'Update — only new/unprocessed photos', value: 'update' },
              { label: 'Create — wipe and reprocess everything', value: 'create' },
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
          <Text>Which tasks?</Text>
          <MultiSelect
            initial={tasks}
            items={[
              { value: 'ingest', label: 'Ingest photos' },
              { value: 'tag', label: 'Text tags + embeddings' },
              { value: 'faces', label: 'Detect + cluster faces' },
              { value: 'dogs', label: 'Detect + cluster dogs' },
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
          <Text color="yellow">Nothing selected — exiting.</Text>
        ))}

      {screen === 'label' && <LabelStep onDone={() => setScreen('run-post')} />}

      {screen === 'run-post' && <Runner steps={post} onDone={() => exit()} />}
    </Box>
  );
}
