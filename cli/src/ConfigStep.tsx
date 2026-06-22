import React, { useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import {
  backupConfigs,
  defaultBackupPath,
  restoreConfigs,
} from './configBackup.js';
import { completePath } from './configFiles.js';
import { TextField } from './TextField.js';
import { useEscapeBack } from './useEscapeBack.js';

type Stage =
  | 'menu'
  | 'working'
  | 'okBackup'
  | 'okRestore'
  | 'restorePath'
  | 'error';

/** Back up the gitignored settings (gallery password, pipeline config, deploy
 * params, prefs) to a zip in ~/Downloads, or restore them from one. */
export function ConfigStep({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState<Stage>('menu');
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');

  // Esc: from a substage back to the menu; from the menu, back out entirely.
  // Disabled mid-operation so a backup/restore in flight isn't interrupted.
  useEscapeBack(
    stage === 'working'
      ? null
      : stage === 'menu'
        ? onDone
        : () => setStage('menu'),
  );

  const doBackup = () => {
    setStage('working');
    const dest = defaultBackupPath();
    backupConfigs(dest)
      .then((files) => {
        setInfo(`${dest}\n  (${files.length} file${files.length === 1 ? '' : 's'})`);
        setStage('okBackup');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setStage('error');
      });
  };

  const doRestore = (zipPath: string) => {
    setStage('working');
    restoreConfigs(zipPath)
      .then(() => {
        setInfo(zipPath);
        setStage('okRestore');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setStage('error');
      });
  };

  if (stage === 'menu') {
    return (
      <Box flexDirection="column">
        <Text bold>Back up / restore settings</Text>
        <Text dimColor>Your settings: hosting, passwords, and deploy details.</Text>
        <SelectInput
          items={[
            { label: 'Back up to Downloads', value: 'backup' },
            { label: 'Restore from a backup', value: 'restore' },
            { label: '← Back', value: 'back' },
          ]}
          onSelect={(item) => {
            if (item.value === 'backup') doBackup();
            else if (item.value === 'restore') setStage('restorePath');
            else onDone();
          }}
        />
      </Box>
    );
  }

  if (stage === 'restorePath') {
    return (
      <Box flexDirection="column">
        <Text bold>Restore from a backup</Text>
        <Text dimColor>This replaces your current settings.</Text>
        <Box>
          <Text>Backup file: </Text>
          <TextField
            value={draft}
            onChange={setDraft}
            onTab={completePath}
            onSubmit={(raw) =>
              raw.trim() ? doRestore(raw) : setStage('menu')
            }
          />
        </Box>
        <Text dimColor>  Tab completes paths · Esc to go back</Text>
      </Box>
    );
  }

  if (stage === 'working') {
    return <Text color="cyan">Working…</Text>;
  }

  if (stage === 'okBackup') {
    return (
      <Box flexDirection="column">
        <Text color="green" bold>
          ✓ Settings backed up.
        </Text>
        <Text>{info}</Text>
        <Text color="yellow" dimColor>
          Keep it safe — it contains your gallery password.
        </Text>
        <SelectInput
          items={[{ label: 'Done', value: 'done' }]}
          onSelect={onDone}
        />
      </Box>
    );
  }

  if (stage === 'okRestore') {
    return (
      <Box flexDirection="column">
        <Text color="green" bold>
          ✓ Settings restored.
        </Text>
        <Text dimColor>From {info}</Text>
        <SelectInput
          items={[{ label: 'Done', value: 'done' }]}
          onSelect={onDone}
        />
      </Box>
    );
  }

  // error
  return (
    <Box flexDirection="column">
      <Text color="red" bold>
        ✖ {error}
      </Text>
      <SelectInput items={[{ label: 'Back', value: 'back' }]} onSelect={onDone} />
    </Box>
  );
}
