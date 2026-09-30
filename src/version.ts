import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

// Reads this package's own version at runtime instead of hardcoding it, so it
// can't drift out of sync with a version bump. `../package.json` resolves
// correctly from both `src/` (dev, via tsx) and the built `dist/index.js`
// (published) — both sit one level below the repo root.
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
export const cliVersion: string = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
).version;
