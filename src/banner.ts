import figlet from 'figlet';
import gradient from 'gradient-string';
import pc from 'picocolors';

// Sweeps the full hue wheel (red -> orange -> yellow -> green -> cyan -> blue ->
// purple -> back to red) instead of a fixed few stops, for maximum color variety.
const BANNER_GRADIENT = gradient.rainbow;

export function renderBanner(text: string, tag?: string): string {
  const art = figlet.textSync(text, { font: 'Sub-Zero' });
  const banner = BANNER_GRADIENT.multiline(art);
  if (!tag) return banner;
  // Right-align the tag on its own line under the banner, matching the
  // banner's widest row so it sits in the bottom-right corner.
  const width = Math.max(...art.split('\n').map(line => line.trimEnd().length));
  const padding = ' '.repeat(Math.max(width - tag.length, 0));
  return `${banner}\n${padding}${pc.dim(tag)}`;
}
