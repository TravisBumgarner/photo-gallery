import React, { useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import {
  backupConfigs,
  CONFIG_FILES,
  defaultBackupPath,
  restoreConfigs,
} from './configBackup.js';
import { completePath } from './configFiles.js';
import { TextField } from './TextField.js';

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
        <Text>Back up or restore your settings</Text>
        <Text dimColor>
          Covers your gallery password, pipeline config, deploy details, and
          remembered choices — the files that aren’t in git.
        </Text>
        <SelectInput
          items={[
            { label: 'Back up to a zip in my Downloads', value: 'backup' },
            { label: 'Restore from a zip', value: 'restore' },
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
        <Text>Path to a settings .zip (overwrites your current settings):</Text>
        <Box>
          <Text>Zip file: </Text>
          <TextField
            value={draft}
            onChange={setDraft}
            onTab={completePath}
            onSubmit={(raw) =>
              raw.trim() ? doRestore(raw) : setStage('menu')
            }
          />
        </Box>
        <Text dimColor>  Tab completes paths · leave blank to cancel.</Text>
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
          ✓ Settings restored from {info}
        </Text>
        <Text dimColor>
          Restored: {CONFIG_FILES.join(', ')} (whatever the zip contained).
        </Text>
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
