import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useState } from 'react';

export interface Item {
  value: string;
  label: string;
}

/** Minimal checkbox list: ↑/↓ to move, space to toggle, enter to confirm. */
export function MultiSelect({
  items,
  initial,
  onSubmit,
}: {
  items: Item[];
  initial?: string[];
  onSubmit: (selected: string[]) => void;
}) {
  const [cursor, setCursor] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(
    new Set(initial ?? items.map((i) => i.value)),
  );
  const [warn, setWarn] = useState(false);

  useInput((input, key) => {
    if (key.upArrow) setCursor((c) => (c - 1 + items.length) % items.length);
    else if (key.downArrow) setCursor((c) => (c + 1) % items.length);
    else if (input === ' ') {
      const value = items[cursor].value;
      setWarn(false);
      setChecked((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return next;
      });
    } else if (key.return) {
      const selected = items.filter((i) => checked.has(i.value)).map((i) => i.value);
      // Submitting nothing means "do nothing then exit" — almost always a
      // mistake, so require at least one and nudge instead of silently leaving.
      if (selected.length === 0) {
        setWarn(true);
        return;
      }
      onSubmit(selected);
    }
  });

  return (
    <Box flexDirection="column">
      {items.map((item, i) => (
        <Text key={item.value} color={i === cursor ? 'cyan' : undefined}>
          {i === cursor ? '❯ ' : '  '}
          {checked.has(item.value) ? '◉' : '◯'} {item.label}
        </Text>
      ))}
      {warn ? (
        <Text color="yellow">  Please pick at least one — press space to check a box.</Text>
      ) : (
        <Text dimColor>  (↑/↓ to move · space to check · enter when done)</Text>
      )}
    </Box>
  );
}
