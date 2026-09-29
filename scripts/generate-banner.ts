// Renders the CLI banner to assets/banner.svg for the README / npm page.
// Colors come from the real `renderBanner()` output (truecolor ANSI codes),
// so the image matches what the terminal shows exactly.
// Run with: FORCE_COLOR=3 tsx scripts/generate-banner.ts
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { renderBanner } from '../src/banner.js';

const CHAR_WIDTH = 9.6;
const LINE_HEIGHT = 20;
const FONT_SIZE = 16;
const PADDING = 24;
const DIM_COLOR = '#808080';

type Cell = { ch: string; color: string | null };

function parseAnsiLine(line: string): Cell[] {
  const cells: Cell[] = [];
  let color: string | null = null;
  const re = /\x1b\[([\d;]*)m|([^\x1b])/g;
  for (const m of line.matchAll(re)) {
    if (m[2] !== undefined) {
      cells.push({ ch: m[2], color });
      continue;
    }
    const codes = m[1].split(';').map(Number);
    if (codes[0] === 38 && codes[1] === 2) {
      const [r, g, b] = codes.slice(2, 5);
      color = `#${[r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')}`;
    } else if (codes[0] === 2) {
      // `pc.dim` on the tag: terminals render dimmed default text as gray.
      color = DIM_COLOR;
    } else if ([0, 22, 39].includes(codes[0])) {
      color = null;
    }
  }
  return cells;
}

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const ansi = renderBanner('LET PLAY !', '@dda-stack');
if (!ansi.includes('\x1b[38;2;')) {
  throw new Error('No truecolor output — run with FORCE_COLOR=3.');
}

const lines = ansi.split('\n').map(parseAnsiLine);
const cols = Math.max(...lines.map(l => l.length));
const width = Math.ceil(cols * CHAR_WIDTH + PADDING * 2);
const height = lines.length * LINE_HEIGHT + PADDING * 2;

const textRows = lines.map((cells, i) => {
  const y = PADDING + (i + 1) * LINE_HEIGHT - 5;
  const tspans = cells
    .map((c, x) => {
      if (c.ch === ' ') return '';
      const fill = c.color ?? '#ffffff';
      return `<tspan x="${(PADDING + x * CHAR_WIDTH).toFixed(1)}" fill="${fill}">${escapeXml(c.ch)}</tspan>`;
    })
    .join('');
  return `  <text y="${y}">${tspans}</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" rx="8" fill="#000000"/>
  <g font-family="Menlo, Consolas, 'DejaVu Sans Mono', 'Courier New', monospace" font-size="${FONT_SIZE}" xml:space="preserve">
${textRows.join('\n')}
  </g>
</svg>
`;

const root = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'assets', 'banner.svg');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, svg);
console.log(`Wrote ${path.relative(root, out)} (${width}x${height})`);
