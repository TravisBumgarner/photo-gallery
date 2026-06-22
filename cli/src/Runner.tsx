import React from 'react';
import { Box, Text, useApp } from 'ink';
import Spinner from 'ink-spinner';
import { useEffect, useRef, useState } from 'react';
import { runStep } from './exec.js';
import type { Step } from './steps.js';

type Status = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

// Mirror offline-processing/src/progress.ts — tasks emit these sentinel lines.
const STATUS_PREFIX = '@@PG_STATUS@@';
const SUMMARY_PREFIX = '@@PG_SUMMARY@@';

/** Runs a list of steps sequentially, showing a live checklist. Each step shows
 * a live status while running and a one-line summary once done (both emitted by
 * the task via progress.ts). Stops on the first failure.
 *
 * No Esc/back here on purpose: the steps spawn subprocesses (ingest, detection,
 * publish) that shouldn't be interrupted mid-flight. A failure stops the run and
 * surfaces its output to the scrollback on its own. */
export function Runner({
  steps,
  onDone,
}: {
  steps: Step[];
  onDone: () => void;
}) {
  const { exit } = useApp();
  const [statuses, setStatuses] = useState<Status[]>(
    steps.map(() => 'pending'),
  );
  // Live one-liner (structured status) for the running step; summaries persist
  // per step; tailLines is the recent raw output shown under the running step.
  const [live, setLive] = useState('');
  const [tailLines, setTailLines] = useState<string[]>([]);
  const [summaries, setSummaries] = useState<(string | null)[]>(
    steps.map(() => null),
  );
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      const setStatus = (i: number, s: Status) =>
        setStatuses((prev) => prev.map((p, idx) => (idx === i ? s : p)));
      const setSummaryAt = (i: number, s: string) =>
        setSummaries((prev) => prev.map((p, idx) => (idx === i ? s : p)));

      for (let i = 0; i < steps.length; i++) {
        setStatus(i, 'running');
        setLive('');
        setTailLines([]);
        const tail: string[] = [];
        let summary = '';
        const code = await runStep(steps[i].spec, (line) => {
          if (line.startsWith(STATUS_PREFIX)) {
            setLive(line.slice(STATUS_PREFIX.length).trim());
            return;
          }
          if (line.startsWith(SUMMARY_PREFIX)) {
            const s = line.slice(SUMMARY_PREFIX.length).trim();
            summary = summary ? `${summary} · ${s}` : s;
            setSummaryAt(i, summary);
            return;
          }
          // Raw task output: kept for failure scrollback, and shown live as a
          // rolling tail under the running step.
          tail.push(line);
          if (tail.length > 30) tail.shift();
          setTailLines(tail.slice(-8));
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
      setTimeout(() => onDone(), 50);
    })();
  }, [steps, exit, onDone]);

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
        <Box key={step.id} flexDirection="column">
          <Text color={color(statuses[i])}>
            {statuses[i] === 'running' ? (
              <Text color="cyan">
                <Spinner type="dots" />
              </Text>
            ) : (
              glyph(statuses[i])
            )}{' '}
            {step.label}
            {statuses[i] === 'running' && live ? (
              <Text dimColor> — {live}</Text>
            ) : null}
            {statuses[i] === 'done' && summaries[i] ? (
              <Text dimColor> — {summaries[i]}</Text>
            ) : null}
          </Text>
          {/* Recent raw output under the active step. */}
          {statuses[i] === 'running' &&
            tailLines.map((l, idx) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rolling tail snapshot
              <Text key={idx} dimColor>
                {'    '}
                {l}
              </Text>
            ))}
        </Box>
      ))}
    </Box>
  );
}
