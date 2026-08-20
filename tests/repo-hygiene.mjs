import fs from 'node:fs';

const required = [
  'README.md', 'CONTRIBUTING.md', 'package.json',
  'index.html', '.nojekyll',
  'frontend/index.html', 'frontend/app.js', 'frontend/styles-v2.css', 'frontend/sw.js',
  'apps-script/Code.gs', 'apps-script/OwnerTemplate.gs', 'apps-script/Backup.gs', 'apps-script/appsscript.json',
  'docs/API.md', 'docs/INSTALL.md', 'docs/PROGRESS.md', 'docs/NEXT_FEATURES.md', 'docs/MULTI_OWNER_SETUP.md'
];
for (const path of required) {
  if (!fs.existsSync(path)) throw new Error(`Missing canonical project file: ${path}`);
}

const rootEntrypoint = fs.readFileSync('index.html', 'utf8');
if (!rootEntrypoint.includes('./frontend/')) {
  throw new Error('Root index.html must remain a thin GitHub Pages redirect to ./frontend/');
}

const forbiddenRootCopies = [
  'app.js', 'config.js', 'styles.css', 'styles-v2.css',
  'sw.js', 'manifest.webmanifest', 'assets', 'icons', 'frontend/styles.css'
];
for (const path of forbiddenRootCopies) {
  if (fs.existsSync(path)) throw new Error(`Duplicate or obsolete file must not exist: ${path}`);
}

const backendSources = fs.readdirSync('apps-script').filter(name => name.endsWith('.gs')).sort();
const allowedBackendSources = ['Backup.gs', 'Code.gs', 'OwnerTemplate.gs'];
if (backendSources.length !== allowedBackendSources.length || backendSources.some((name, index) => name !== allowedBackendSources[index])) {
  throw new Error(`Apps Script canonical sources must be ${allowedBackendSources.join(', ')}; found: ${backendSources.join(', ')}`);
}

const secretScanFiles = [
  'frontend/config.js', 'frontend/app.js', 'apps-script/Code.gs', 'apps-script/OwnerTemplate.gs', 'apps-script/Backup.gs',
  'README.md', 'CONTRIBUTING.md', 'docs/MULTI_OWNER_SETUP.md'
];
const source = secretScanFiles.map(path => fs.readFileSync(path, 'utf8')).join('\n');
if (/AIza[0-9A-Za-z_-]{20,}/.test(source)) throw new Error('Possible Gemini API key committed');
if (/PALM-[0-9a-f]{20,}/i.test(source)) throw new Error('Possible access token committed');

console.log(JSON.stringify({ ok: true, canonicalFiles: required.length, backendSources }, null, 2));
