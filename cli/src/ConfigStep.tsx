import path from 'node:path';
import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import {
  backupConfigs,
  defaultBackupPath,
  restoreConfigs,
} from './configBackup.js';
import { completePath, needsSetup } from './configFiles.js';
import {
  applyMigrations,
  checkMigrations,
  type MigrationStatus,
} from './migrationCheck.js';
import { TextField } from './TextField.js';
import { useEscapeBack } from './useEscapeBack.js';

type Stage =
  | 'menu'
  | 'working'
  | 'okBackup'
  | 'okRestore'
  | 'restorePath'
  | 'migratePrompt'
  | 'migrating'
  | 'okMigrate'
  | 'aheadAbort'
  | 'error';

/** Back up the gitignored settings (gallery password, pipeline config, deploy
 * params, prefs) to a zip in ~/Downloads, or restore them from one. */
export function ConfigStep({
  onDone,
  initial,
}: {
  onDone: () => void;
  /** Open straight into an action instead of the menu — e.g. first-run restore,
   * or the end-of-run backup prompt. */
  initial?: 'backup' | 'restore';
}) {
  const direct = initial !== undefined;
  const [stage, setStage] = useState<Stage>(
    initial === 'restore'
      ? 'restorePath'
      : initial === 'backup'
        ? 'working'
        : 'menu',
  );
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [mig, setMig] = useState<MigrationStatus | null>(null);
  const [busy, setBusy] = useState('Working…');

  // Esc: from a substage back to the menu; from the menu (or a direct-mode
  // substage, which has no menu) back out entirely. Disabled mid-operation.
  useEscapeBack(
    stage === 'working' || stage === 'migrating'
      ? null
      : stage === 'menu' || direct
        ? onDone
        : () => setStage('menu'),
  );

  // Throttle re-renders: a gallery is thousands of files, but updating the count
  // every ~50 keeps Ink responsive while still feeling live.
  const onProgress = (verb: string) => (count: number, file: string) => {
    if (count === 1 || count % 50 === 0)
      setBusy(`${verb} ${count.toLocaleString()} files… ${path.basename(file)}`);
  };

  const doBackup = () => {
    setBusy('Backing up…');
    setStage('working');
    const dest = defaultBackupPath();
    backupConfigs(dest, onProgress('Zipped'))
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
    setBusy('Restoring…');
    setStage('working');
    restoreConfigs(zipPath, onProgress('Restored'))
      .then(async () => {
        setInfo(zipPath);
        // The restored DB may be at a different schema version than this code.
        setBusy('Checking database schema…');
        try {
          const status = await checkMigrations();
          setMig(status);
          if (status.state === 'ahead') setStage('aheadAbort');
          else if (status.state === 'behind') setStage('migratePrompt');
          else setStage('okRestore');
        } catch {
          // Restore succeeded; a failed check shouldn't block it. Migrations
          // also run idempotently at the start of the next processing run.
          setStage('okRestore');
        }
      })
      .catch((err) => {
        // Go back to the path input with the reason, so a wrong path can be
        // fixed and retried (rather than dead-ending on an error screen).
        setError(err instanceof Error ? err.message : String(err));
        setStage('restorePath');
      });
  };

  const doMigrate = () => {
    setStage('migrating');
    applyMigrations()
      .then(() => setStage('okMigrate'))
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setStage('error');
      });
  };

  // Direct backup mode (end-of-run prompt): run it immediately on open.
  useEffect(() => {
    if (initial === 'backup') doBackup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (stage === 'menu') {
    return (
      <Box flexDirection="column">
        <Text bold>Back up / restore</Text>
        <Text dimColor>
          Settings + your processed gallery (photos, database). Can be large.
        </Text>
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
        <Text dimColor>This replaces your current settings and gallery.</Text>
        <Box>
          <Text>Backup file: </Text>
          <TextField
            value={draft}
            onChange={setDraft}
            onTab={(v) => completePath(v, { includeFiles: true })}
            onSubmit={(raw) => {
              setError('');
              if (raw.trim()) doRestore(raw);
              else if (direct) onDone();
              else setStage('menu');
            }}
          />
        </Box>
        {error ? <Text color="red">  ✖ {error}</Text> : null}
        <Text dimColor>  Tab completes paths · Esc to go back</Text>
      </Box>
    );
  }

  if (stage === 'working') {
    return (
      <Text color="cyan">
        <Spinner type="dots" /> {busy}
      </Text>
    );
  }

  if (stage === 'okBackup') {
    return (
      <Box flexDirection="column">
        <Text color="green" bold>
          ✓ Backup saved.
        </Text>
        <Text>{info}</Text>
        <Text color="yellow" dimColor>
          Keep it safe — it has your gallery password and all your processed work.
        </Text>
        <SelectInput
          items={[{ label: 'Done', value: 'done' }]}
          onSelect={onDone}
        />
      </Box>
    );
  }

  if (stage === 'okRestore') {
    // A restore that didn't include this app's settings (e.g. a raw prod
    // snapshot) leaves setup still required — say so rather than silently
    // bouncing back to "Let's get set up" with no explanation.
    const stillNeedsSetup = needsSetup();
    return (
      <Box flexDirection="column">
        <Text color="green" bold>
          ✓ Backup restored.
        </Text>
        <Text dimColor>From {info}</Text>
        {stillNeedsSetup ? (
          <Text color="yellow">
            ⚠ This backup didn't include your gallery settings
            (offline-processing/.cli-cache, backend/.env), so setup is still
            required. It may be a raw prod snapshot rather than a CLI backup.
          </Text>
        ) : null}
        <SelectInput
          items={[{ label: 'Done', value: 'done' }]}
          onSelect={onDone}
        />
      </Box>
    );
  }

  if (stage === 'migratePrompt' && mig) {
    return (
      <Box flexDirection="column">
        <Text color="green" bold>
          ✓ Backup restored.
        </Text>
        <Text>
          Database schema: {mig.applied} of {mig.available} migrations applied.
        </Text>
        <Text dimColor>
          Pending ({mig.pending.length}): {mig.pending.join(', ')}
        </Text>
        <Text color="yellow">
          Migrations are one-way — there is no rollback (the DB is copied to
          {' '}.pre-migrate first). Apply now?
        </Text>
        <SelectInput
          items={[
            { label: 'Yes, apply migrations', value: 'yes' },
            { label: 'No, skip for now', value: 'no' },
          ]}
          onSelect={(item) =>
            item.value === 'yes' ? doMigrate() : setStage('okRestore')
          }
        />
      </Box>
    );
  }

  if (stage === 'migrating') {
    return (
      <Text color="cyan">
        <Spinner type="dots" /> Applying migrations…
      </Text>
    );
  }

  if (stage === 'okMigrate') {
    return (
      <Box flexDirection="column">
        <Text color="green" bold>
          ✓ Migrations applied. Database is up to date.
        </Text>
        <SelectInput
          items={[{ label: 'Done', value: 'done' }]}
          onSelect={onDone}
        />
      </Box>
    );
  }

  if (stage === 'aheadAbort' && mig) {
    return (
      <Box flexDirection="column">
        <Text color="red" bold>
          ⚠ This backup's database is NEWER than your code.
        </Text>
        <Text>
          It has {mig.applied} migrations; this code only knows {mig.available}.
        </Text>
        <Text dimColor>
          Update the CLI/code to a version that includes these migrations, then
          restore again. Do not process against this database until you do.
        </Text>
        <SelectInput
          items={[{ label: 'OK', value: 'ok' }]}
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
