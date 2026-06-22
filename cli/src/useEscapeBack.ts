import { useInput } from 'ink';

/**
 * Consistent "Esc = go back one level" handler. Pass the action to run on
 * Escape, or `null`/`undefined` to disable it (e.g. while a validation check is
 * in flight, or on a screen where backing out doesn't make sense).
 *
 * Ink's `useInput` doesn't bubble — every mounted handler sees the key. So a
 * screen that delegates to a child component should leave Esc to the child and
 * pass `null` here, to avoid two handlers firing on the same press.
 */
export function useEscapeBack(onEscape: (() => void) | null | undefined): void {
  useInput((_input, key) => {
    if (key.escape && onEscape) onEscape();
  });
}
