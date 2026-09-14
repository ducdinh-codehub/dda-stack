import figlet from 'figlet';
import gradient from 'gradient-string';

const BANNER_GRADIENT = gradient(['#5eead4', '#8b5cf6', '#ec4899']);

export function renderBanner(text: string): string {
  const art = figlet.textSync(text, { font: 'Sub-Zero' });
  return BANNER_GRADIENT.multiline(art);
}
