import React from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { useEffect, useMemo, useState } from 'react';
import { needsSetup } from './configFiles.js';
import { MultiSelect } from './MultiSelect.js';
import { loadPrefs, savePrefs } from './prefs.js';
import { Runner } from './Runner.js';
import { Setup } from './Setup.js';
import {
  type ProcessOpts,
  type SourceAdapter,
  type Step,
  processSteps,
  sourceSteps,
  syncSteps,
} from './steps.js';

type Screen = 'setup' | 'phases' | 'source' | 'mode' | 'tasks' | 'run';

export function App({ forceSetup = false }: { forceSetup?: boolean }) {
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
    if (screen === 'run') savePrefs({ phases, adapter, mode, tasks });
  }, [screen, phases, adapter, mode, tasks]);

  const steps = useMemo<Step[]>(() => {
    if (screen !== 'run') return [];
    const out: Step[] = [];
    if (phases.includes('source')) out.push(...sourceSteps(adapter));
    if (phases.includes('process')) {
      const opts: ProcessOpts = {
        mode,
        ingest: tasks.includes('ingest'),
        tag: tasks.includes('tag'),
        faces: tasks.includes('faces'),
        dogs: tasks.includes('dogs'),
      };
      out.push(...processSteps(opts));
    }
    if (phases.includes('sync')) out.push(...syncSteps());
    return out;
  }, [screen, phases, adapter, mode, tasks]);

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
              else setScreen('run');
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
              setScreen(phases.includes('process') ? 'mode' : 'run');
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
              setScreen('run');
            }}
          />
        </Box>
      )}

      {screen === 'run' &&
        (steps.length > 0 ? (
          <Runner steps={steps} />
        ) : (
          <Text color="yellow">Nothing selected — exiting.</Text>
        ))}
    </Box>
  );
}
