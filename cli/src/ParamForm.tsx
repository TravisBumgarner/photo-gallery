import React, { useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import type { DeployParam } from './deployParams.js';
import { TextField } from './TextField.js';
import { useEscapeBack } from './useEscapeBack.js';

/** A small sequential form over deploy params: one field at a time, each
 * pre-filled with its saved/last value so re-runs are enter-enter-enter (and
 * any field can be edited in place). A field with `options` renders a
 * pick-list. Answered fields stay visible above. Validation may be async (e.g.
 * an SSH connection test) — "Checking…" shows while it runs. */
export function ParamForm({
  fields,
  initial,
  onSubmit,
  onPersist,
  onCancel,
}: {
  fields: DeployParam[];
  initial: Record<string, string>;
  onSubmit: (values: Record<string, string>) => void;
  /** Called with the accumulated answers after each field advances, so a value
   * is remembered even if a later field's check fails and the run is abandoned. */
  onPersist?: (values: Record<string, string>) => void;
  /** Esc on the first field calls this (back out of the form). Omit to keep the
   * first field non-cancellable. */
  onCancel?: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [draft, setDraft] = useState(
    initial[fields[0]?.key ?? ''] ?? fields[0]?.default ?? '',
  );
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Esc steps back to the prior field (restoring what was entered there); on the
  // first field it backs out of the form. Disabled while a check is in flight.
  useEscapeBack(
    checking
      ? null
      : idx > 0
        ? () => {
            const prev = idx - 1;
            setError(null);
            setIdx(prev);
            setDraft(values[fields[prev].key] ?? fields[prev].default ?? '');
          }
        : onCancel,
  );

  const field = fields[idx];
  if (!field) return null;

  const options = field.options?.();

  const labelFor = (f: DeployParam, val: string) =>
    f.options?.().find((o) => o.value === val)?.label ?? val;

  const submit = async (raw: string) => {
    if (checking) return; // ignore enter-mashing while a check is in flight
    const base = options ? raw : (raw.trim() || field.default || '').trim();
    const val = field.normalize ? field.normalize(base) : base;
    setError(null);
    setChecking(true);
    const err = (await field.validate?.(val, values)) ?? null;
    setChecking(false);
    if (err) {
      setError(err);
      return;
    }
    const next = { ...values, [field.key]: val };
    setValues(next);
    onPersist?.(next); // remember it now, before any later field can fail
    const nextField = fields[idx + 1];
    if (!nextField) {
      onSubmit(next);
      return;
    }
    setIdx(idx + 1);
    setDraft(next[nextField.key] ?? nextField.default ?? '');
  };

  return (
    <Box flexDirection="column">
      {fields.slice(0, idx).map((f) => (
        <Text key={f.key} dimColor>
          {f.label}: {labelFor(f, values[f.key]) || '(blank)'}
        </Text>
      ))}
      {options ? (
        <Box flexDirection="column">
          <Text>{field.label}:</Text>
          <SelectInput
            initialIndex={Math.max(
              0,
              options.findIndex((o) => o.value === (values[field.key] ?? '')),
            )}
            items={options}
            onSelect={(item) => submit(item.value)}
          />
        </Box>
      ) : (
        <Box>
          <Text>{field.label}: </Text>
          <TextField value={draft} onChange={setDraft} onSubmit={submit} />
        </Box>
      )}
      {field.hint ? <Text dimColor>  {field.hint}</Text> : null}
      {idx > 0 ? (
        <Text dimColor>  Esc to go back</Text>
      ) : onCancel ? (
        <Text dimColor>  Esc to cancel</Text>
      ) : null}
      {checking ? <Text color="cyan">  Checking…</Text> : null}
      {error ? <Text color="red">  ✖ {error}</Text> : null}
    </Box>
  );
}
