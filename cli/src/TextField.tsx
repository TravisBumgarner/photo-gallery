import React from 'react';
import { Text, useInput } from 'ink';
import { useEffect, useState } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: (v: string) => void;
  mask?: string;
  placeholder?: string;
  /** Tab handler: given the current value, return the completed value. */
  onTab?: (v: string) => string;
}

// Start index of the word ending at `pos` (skips trailing separators first, so
// "/a/b/" deletes "b/", then "/a/").
function wordStart(s: string, pos: number): number {
  const sep = (c: string) => /[\s/]/.test(c);
  let i = pos;
  while (i > 0 && sep(s[i - 1])) i--;
  while (i > 0 && !sep(s[i - 1])) i--;
  return i;
}

/** Like ink-text-input, plus: Tab completion, delete-word (Ctrl+W /
 * Option+Backspace / Ctrl+Backspace), and delete-to-line-start (Ctrl+U). */
export function TextField({
  value,
  onChange,
  onSubmit,
  mask,
  placeholder = '',
  onTab,
}: Props) {
  const [cursor, setCursor] = useState(value.length);
  useEffect(() => {
    setCursor((c) => Math.min(c, value.length));
  }, [value.length]);

  useInput((input, key) => {
    if (
      key.upArrow ||
      key.downArrow ||
      (key.ctrl && input === 'c') ||
      (key.shift && key.tab)
    ) {
      return;
    }
    if (key.return) {
      onSubmit?.(value);
      return;
    }
    if (key.tab) {
      if (onTab) {
        const next = onTab(value);
        onChange(next);
        setCursor(next.length);
      }
      return;
    }
    if (key.leftArrow) {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.rightArrow) {
      setCursor((c) => Math.min(value.length, c + 1));
      return;
    }
    // Ctrl+U — delete from the start of the line to the cursor.
    if (key.ctrl && input === 'u') {
      onChange(value.slice(cursor));
      setCursor(0);
      return;
    }
    // Delete word back — Ctrl+W, Option/Meta+Backspace, or Ctrl+Backspace.
    if (
      (key.ctrl && input === 'w') ||
      ((key.meta || key.ctrl) && (key.backspace || key.delete))
    ) {
      const start = wordStart(value, cursor);
      onChange(value.slice(0, start) + value.slice(cursor));
      setCursor(start);
      return;
    }
    if (key.backspace || key.delete) {
      if (cursor > 0) {
        onChange(value.slice(0, cursor - 1) + value.slice(cursor));
        setCursor((c) => c - 1);
      }
      return;
    }
    // Printable input (ignore remaining control combos).
    if (input && !key.ctrl && !key.meta) {
      onChange(value.slice(0, cursor) + input + value.slice(cursor));
      setCursor((c) => c + input.length);
    }
  });

  const shown = mask ? mask.repeat(value.length) : value;
  if (shown.length === 0) {
    return placeholder ? (
      <Text>
        <Text inverse>{placeholder[0] ?? ' '}</Text>
        <Text dimColor>{placeholder.slice(1)}</Text>
      </Text>
    ) : (
      <Text inverse> </Text>
    );
  }
  const at = Math.min(cursor, shown.length);
  return (
    <Text>
      {shown.slice(0, at)}
      <Text inverse>{shown[at] ?? ' '}</Text>
      {shown.slice(at + 1)}
    </Text>
  );
}
