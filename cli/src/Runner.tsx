import React from 'react';
import { Box, Text, useApp } from 'ink';
import Spinner from 'ink-spinner';
import { useEffect, useRef, useState } from 'react';
import { runStep } from './exec.js';
import type { Step } from './steps.js';

type Status = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

/** Runs a list of steps sequentially, showing a live checklist + the last
 * output line of the active step. Stops on the first failure. */
export function Runner({ steps }: { steps: Step[] }) {
  const { exit } = useApp();
  const [statuses, setStatuses] = useState<Status[]>(
    steps.map(() => 'pending'),
  );
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      const setStatus = (i: number, s: Status) =>
        setStatuses((prev) => prev.map((p, idx) => (idx === i ? s : p)));

      for (let i = 0; i < steps.length; i++) {
        setActive(i);
        setStatus(i, 'running');
        setRecent([]);
        const tail: string[] = [];
        const code = await runStep(steps[i].spec, (line) => {
          tail.push(line);
          if (tail.length > 30) tail.shift();
          setRecent(tail.slice(-3));
        });
        if (code === 0) {
          setStatus(i, 'done');
        } else {
          setStatus(i, 'failed');
          for (let j = i + 1; j < steps.length; j++) setStatus(j, 'skipped');
          // Surface the failure to the scrollback (persists after the TUI clears).
          console.error(
            `\n─── "${steps[i].id}" failed — last output ───\n${tail.join('\n')}\n`,
          );
          setTimeout(() => exit(new Error(`step "${steps[i].id}" failed`)), 50);
          return;
        }
      }
      setTimeout(() => exit(), 50);
    })();
  }, [steps, exit]);

  const glyph = (s: Status) =>
    s === 'done'
      ? '✔'
      : s === 'failed'
        ? '✖'
        : s === 'skipped'
          ? '–'
          : s === 'pending'
            ? '○'
            : null;
  const color = (s: Status) =>
    s === 'done'
      ? 'green'
      : s === 'failed'
        ? 'red'
        : s === 'skipped'
          ? 'gray'
          : undefined;

  return (
    <Box flexDirection="column">
      {steps.map((step, i) => (
        <Text key={step.id} color={color(statuses[i])}>
          {statuses[i] === 'running' ? (
            <Text color="cyan">
              <Spinner type="dots" />
            </Text>
          ) : (
            glyph(statuses[i])
          )}{' '}
          {step.label}
        </Text>
      ))}
      {statuses[active] === 'running'
        ? recent.map((line, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-size live tail
            <Text key={i} dimColor>
              {'   '}
              {line}
            </Text>
          ))
        : null}
    </Box>
  );
}
