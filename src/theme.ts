import pc from 'picocolors';

/** Colors a prompt's question text so it's visually distinct from clack's own
 *  (dim/gray) rendering of the submitted answer below it. */
export function question(text: string): string {
  return pc.cyan(text);
}
