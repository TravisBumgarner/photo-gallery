import readline from 'node:readline';

// Set ASSUME_YES=1 (the bash orchestrator does this) to auto-confirm every
// prompt so scripts run unattended inside containers. Without it, the prompts
// behave exactly as before.
export function assumeYes(): boolean {
  const v = (process.env.ASSUME_YES ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function ask(message: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export async function confirm(message: string): Promise<boolean> {
  if (assumeYes()) {
    console.log(`${message} (y/n) y  [ASSUME_YES]`);
    return true;
  }
  const answer = await ask(`${message} (y/n) `);
  return answer.trim().toLowerCase() === 'y';
}

// Destructive-action guard: the user must re-type an exact token. Auto-passes
// under ASSUME_YES (the orchestrator has already confirmed the choice in its
// own menu before invoking the task).
export async function confirmTyped(
  message: string,
  expected: string,
): Promise<boolean> {
  if (assumeYes()) {
    console.log(`${message}${expected}  [ASSUME_YES]`);
    return true;
  }
  const answer = await ask(message);
  return answer.trim() === expected;
}
