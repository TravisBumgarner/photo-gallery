import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useEffect, useState } from 'react';
import { applicableFields, writeConfigFiles } from './configFiles.js';

/** First-run wizard: walks the config fields, then writes .cli-cache +
 * backend/.env. Conditional fields (S3 creds) appear once STORAGE_URL is s3://. */
export function Setup({ onComplete }: { onComplete: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState('');

  const fields = applicableFields(values);
  const field = fields[idx];

  // Reset the input to the field's default whenever we move to a new field.
  useEffect(() => {
    setDraft(field?.default ?? '');
  }, [field?.key]);

  if (!field) return null;

  const submit = (raw: string) => {
    const value = raw.trim() === '' ? (field.default ?? '') : raw.trim();
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
        />
      </Box>
      {field.default ? <Text dimColor>  (enter for default: {field.secret ? '•••' : field.default || '(blank)'})</Text> : null}
    </Box>
  );
}
