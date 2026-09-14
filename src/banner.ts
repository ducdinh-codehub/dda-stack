import figlet from 'figlet';
import gradient from 'gradient-string';

// Sweeps the full hue wheel (red -> orange -> yellow -> green -> cyan -> blue ->
// purple -> back to red) instead of a fixed few stops, for maximum color variety.
const BANNER_GRADIENT = gradient.rainbow;

export function renderBanner(text: string): string {
  const art = figlet.textSync(text, { font: 'Sub-Zero' });
  return BANNER_GRADIENT.multiline(art);
}
