import { type ChildProcess, type SpawnOptions, spawn } from 'node:child_process';
import type { Spec } from './steps.js';

// Every child we spawn is tracked here so a shutdown can tear the whole fleet
// down. Children are spawned `detached` (their own process group) so signalling
// the negative pid reaches grandchildren too — npm → tsx → node — not just the
// immediate parent, which is what leaks if you only kill the child handle.
const active = new Set<ChildProcess>();

/** Spawn a child in its own process group and track it for shutdown. Auto-drops
 * from the registry when it exits. */
export function spawnTracked(
  cmd: string,
  args: string[],
  opts: SpawnOptions = {},
): ChildProcess {
  const child = spawn(cmd, args, { ...opts, detached: true });
  active.add(child);
  const drop = () => active.delete(child);
  child.once('close', drop);
  child.once('error', drop);
  return child;
}

/** Signal a single child's whole process group, falling back to the bare child
 * on platforms without process groups (e.g. Windows). Best-effort. */
export function killTree(
  child: ChildProcess | null | undefined,
  signal: NodeJS.Signals = 'SIGTERM',
): void {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // already gone
    }
  }
}

/** Terminate every tracked child — the graceful-shutdown hook. */
export function killAll(signal: NodeJS.Signals = 'SIGTERM'): void {
  for (const child of active) killTree(child, signal);
}

/** Spawn a step's process, streaming output lines to `onLine`. Resolves with
 * the exit code (never rejects — caller decides what to do on failure). */
export function runStep(spec: Spec, onLine: (line: string) => void): Promise<number> {
  return new Promise((resolve) => {
    const child = spawnTracked(spec.cmd, spec.args, {
      cwd: spec.cwd,
      env: spec.env ? { ...process.env, ...spec.env } : process.env,
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
