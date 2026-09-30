import * as p from '@clack/prompts';
import pc from 'picocolors';

/** Colors a prompt's question text so it's visually distinct from clack's own
 *  (dim/gray) rendering of the submitted answer below it. */
export function question(text: string): string {
  return pc.cyan(text);
}

/**
 * clack's spinner, except when stdout isn't a terminal (CI logs, piped
 * output): there it would print every animation frame as a new chunk of text,
 * so fall back to one plain log line per start/stop instead.
 */
export function spinner(): Pick<ReturnType<typeof p.spinner>, 'start' | 'stop'> {
  if (process.stdout.isTTY) return p.spinner();
  return {
    start: message => p.log.step(message ?? ''),
    stop: message => p.log.info(message ?? ''),
  };
}
