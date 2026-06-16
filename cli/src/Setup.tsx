import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useEffect, useMemo, useState } from 'react';
import {
  applicableFields,
  type Field,
  loadExistingValues,
  writeConfigFiles,
} from './configFiles.js';

/** Setup wizard: walks the config fields and writes .cli-cache + backend/.env.
 * Runs every time, pre-filled from the current config (gray placeholders) —
 * enter keeps a value, type to change it. S3 fields appear once STORAGE_URL is
 * s3://. */
export function Setup({ onComplete }: { onComplete: () => void }) {
  const existing = useMemo(loadExistingValues, []);
  const [values, setValues] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [warnedValue, setWarnedValue] = useState<string | null>(null);

  const fields = applicableFields(values);
  const field = fields[idx];

  // What enter submits: the current config value, else the static default.
  const effectiveDefault = (f: Field) => existing[f.key] ?? f.default ?? '';

  // Start each field empty so the default shows as a gray placeholder; hitting
  // enter on an empty field submits the default (see submit()).
  useEffect(() => {
    setDraft('');
    setError(null);
    setWarning(null);
    setWarnedValue(null);
  }, [field?.key]);

  if (!field) return null;

  const submit = async (raw: string) => {
    if (checking) return;
    const value = raw.trim() === '' ? effectiveDefault(field) : raw.trim();
    setChecking(true);
    const err = (await field.validate?.(value, values)) ?? null;
    if (err) {
      setChecking(false);
      setError(err);
      return; // stay on this field
    }
    // Non-blocking advisory: show once, proceed on a second enter.
    if (warnedValue !== value) {
      const warn = (await field.advise?.(value, values)) ?? null;
      setChecking(false);
      if (warn) {
        setWarning(warn);
        setWarnedValue(value);
        return;
      }
    } else {
      setChecking(false);
    }
    const next = { ...values, [field.key]: value };
    setValues(next);
    const nextFields = applicableFields(next);
    if (idx + 1 >= nextFields.length) {
      const written = writeConfigFiles(next);
      // brief confirmation, then continue
      console.log(`\nWrote ${written.cliCache}\nWrote ${written.backendEnv}\n`);
      onComplete();
    } else {
      setIdx(idx + 1);
    }
  };

  return (
    <Box flexDirection="column">
      <Text color="yellow">First-run setup ({idx + 1}/{fields.length})</Text>
      <Text dimColor>
        Saved to offline-ingestion/.cli-cache + backend/.env — edit those later, or
        delete them to run setup again.
      </Text>
      <Box>
        <Text>{field.label}: </Text>
        <TextInput
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          mask={field.secret ? '*' : undefined}
          placeholder={
            field.secret
              ? effectiveDefault(field)
                ? '(unchanged — enter to keep)'
                : undefined
              : effectiveDefault(field) || undefined
          }
        />
      </Box>
      {field.hint ? <Text dimColor>  {field.hint}</Text> : null}
      {checking ? <Text color="cyan">  checking…</Text> : null}
      {warning ? <Text color="yellow">  ⚠ {warning}</Text> : null}
      {error ? <Text color="red">  ✖ {error}</Text> : null}
    </Box>
  );
}
