import { spawn } from 'node:child_process';
import type { Spec } from './steps.js';

/** Spawn a step's process, streaming output lines to `onLine`. Resolves with
 * the exit code (never rejects — caller decides what to do on failure). */
export function runStep(spec: Spec, onLine: (line: string) => void): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(spec.cmd, spec.args, {
      cwd: spec.cwd,
      env: process.env,
    });
    // Auto-confirm the ingest "Proceed? (y/n)" prompt; no-op for other tasks.
    child.stdin?.write('y\n');
    child.stdin?.end();
    const handle = (buf: Buffer) => {
      for (const line of buf.toString().split('\n')) {
        if (line.trim()) onLine(line.replace(/\s+$/, ''));
      }
    };
    child.stdout?.on('data', handle);
    child.stderr?.on('data', handle);
    child.on('close', (code) => resolve(code ?? 0));
    child.on('error', (err) => {
      onLine(`error: ${err.message}`);
      resolve(1);
    });
  });
}
