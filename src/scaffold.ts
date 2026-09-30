import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
export const TEMPLATES_ROOT = path.resolve(__dirname, '..', 'templates');

export interface TemplateVars {
  projectName: string;
  /** kebab-case, safe for npm package names / dirs */
  projectSlug: string;
  [key: string]: string;
}

const RENAME_MAP: Record<string, string> = {
  gitignore: '.gitignore',
  npmrc: '.npmrc',
  env: '.env',
  'env.example': '.env.example',
  prettierignore: '.prettierignore',
};

/** Files an overlay never touches even when present in the template (native-generated, don't clobber). */
const NATIVE_PROTECTED = new Set(['android', 'ios', 'package.additions.json']);

/** Copied byte-for-byte, skipping utf8 text decoding and `{{var}}` substitution (which would corrupt them). */
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico',
  '.ttf', '.otf', '.woff', '.woff2',
]);

/**
 * Copies a template directory on top of `destDir` (which may already contain a
 * natively-generated RN/Expo project), substituting `{{token}}` vars in file
 * contents and applying dotfile renames (templates ship as `gitignore` instead
 * of `.gitignore` so npm doesn't strip them when this package is published).
 */
export function overlayTemplate(templateDir: string, destDir: string, vars: TemplateVars) {
  fs.mkdirSync(destDir, { recursive: true });
  copyDir(templateDir, destDir, vars, true);
  mergePackageAdditions(templateDir, destDir, vars);
}

function copyDir(srcDir: string, destDir: string, vars: TemplateVars, isRoot: boolean) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    if (isRoot && NATIVE_PROTECTED.has(entry.name)) continue;

    const srcPath = path.join(srcDir, entry.name);
    const destName = RENAME_MAP[entry.name] ?? entry.name;
    const destPath = path.join(destDir, destName);

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDir(srcPath, destPath, vars, false);
    } else if (BINARY_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      fs.copyFileSync(srcPath, destPath);
    } else {
      const contents = applyVars(fs.readFileSync(srcPath, 'utf8'), vars);
      // .gitignore is additive: a natively-generated project already ships one
      // (Pods/, DerivedData, keystores, ...) and we don't want to lose that.
      if (destName === '.gitignore' && fs.existsSync(destPath)) {
        fs.appendFileSync(destPath, '\n' + contents);
      } else {
        fs.writeFileSync(destPath, contents);
      }
    }
  }
}

/**
 * Templates ship a `package.additions.json` (dependencies/devDependencies/scripts,
 * plus `main` when a template replaces the entry point) instead of a full
 * package.json, so overlaying never clobbers fields the native generator wrote
 * (name, native config blocks, etc.).
 */
function mergePackageAdditions(templateDir: string, destDir: string, vars: TemplateVars) {
  const additionsPath = path.join(templateDir, 'package.additions.json');
  if (!fs.existsSync(additionsPath)) return;

  const additions = JSON.parse(applyVars(fs.readFileSync(additionsPath, 'utf8'), vars));
  const pkgPath = path.join(destDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  for (const field of ['dependencies', 'devDependencies', 'scripts'] as const) {
    if (additions[field]) {
      pkg[field] = { ...pkg[field], ...additions[field] };
    }
  }
  if (additions.main) pkg.main = additions.main;

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

function applyVars(contents: string, vars: TemplateVars): string {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value),
    contents,
  );
}
