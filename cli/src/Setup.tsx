import React from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { useEffect, useMemo, useState } from 'react';
import {
  applicableFields,
  completePath,
  type Field,
  loadExistingValues,
  writeConfigFiles,
} from './configFiles.js';
import { TextField } from './TextField.js';
import { useEscapeBack } from './useEscapeBack.js';

/** Setup wizard: walks the config fields and writes .cli-cache + backend/.env.
 * Runs every time, pre-filled from the current config (gray placeholders) —
 * enter keeps a value, type to change it. */
export function Setup({
  onComplete,
  onCancel,
}: {
  onComplete: () => void;
  onCancel: () => void;
}) {
  const existing = useMemo(loadExistingValues, []);
  const [values, setValues] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [warnedValue, setWarnedValue] = useState<string | null>(null);
  const [hintText, setHintText] = useState('');

  const fields = applicableFields(values);
  const field = fields[idx];

  // What enter submits: a value already entered this session (so going back
  // doesn't lose it), else the current config value, else the static default.
  const effectiveDefault = (f: Field) =>
    values[f.key] ?? existing[f.key] ?? f.default ?? '';

  // Esc steps back a field; on the first field it cancels setup entirely.
  // Disabled while a validation check is in flight.
  useEscapeBack(
    checking
      ? null
      : idx > 0
        ? () => {
            setError(null);
            setWarning(null);
            setWarnedValue(null);
            setIdx(idx - 1);
          }
        : onCancel,
  );

  // Start each field empty so the default shows as a gray placeholder; hitting
  // enter on an empty field submits the default (see submit()).
  useEffect(() => {
    setDraft('');
    setError(null);
    setWarning(null);
    setWarnedValue(null);
  }, [field?.key]);

  // Resolve the hint (which may be an async function, e.g. listing installed
  // models) whenever the field changes.
  useEffect(() => {
    let cancelled = false;
    const h = field?.hint;
    if (typeof h === 'function') {
      setHintText('');
      Promise.resolve(h(values)).then((t) => {
        if (!cancelled) setHintText(t);
      });
    } else {
      setHintText(h ?? '');
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <Text color="yellow">
        Setup · step {idx + 1} of {fields.length}
      </Text>
      {field.options ? (
        <Box flexDirection="column">
          <Text>{field.label}</Text>
          <SelectInput
            initialIndex={Math.max(
              0,
              field.options.findIndex((o) => o.value === effectiveDefault(field)),
            )}
            items={field.options}
            onSelect={(item) => submit(item.value)}
          />
        </Box>
      ) : (
        <Box>
          <Text>{field.label}: </Text>
          <TextField
            value={draft}
            onChange={setDraft}
            onSubmit={submit}
            mask={field.secret ? '*' : undefined}
            onTab={field.path ? completePath : undefined}
            placeholder={
              field.secret
                ? effectiveDefault(field)
                  ? '(unchanged — enter to keep)'
                  : undefined
                : effectiveDefault(field) || undefined
            }
          />
        </Box>
      )}
      {hintText ? <Text dimColor>  {hintText}</Text> : null}
      {idx + 1 === fields.length ? (
        <Text dimColor>  You can re-run setup anytime.</Text>
      ) : null}
      <Text dimColor>  Esc to {idx > 0 ? 'go back' : 'cancel'}</Text>
      {checking ? <Text color="cyan">  checking…</Text> : null}
      {warning ? <Text color="yellow">  ⚠ {warning}</Text> : null}
      {error ? <Text color="red">  ✖ {error}</Text> : null}
    </Box>
  );
}
