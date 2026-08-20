import fs from 'node:fs';

const index = fs.readFileSync('frontend/index.html', 'utf8');
const config = fs.readFileSync('frontend/config.js', 'utf8');
const sw = fs.readFileSync('frontend/sw.js', 'utf8');
const backend = fs.readFileSync('apps-script/Code.gs', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(pkg.version === '2.6.1', 'package.json version must be 2.6.1');
assert(config.includes("version: '2.6.1'"), 'frontend config version must be 2.6.1');
assert(sw.includes("const CACHE = 'palm-ledger-v2.6.1';"), 'service worker cache must be 2.6.1');
assert(index.includes('name="timeIn" type="time" step="1"'), 'timeIn must accept seconds');
assert(index.includes('name="timeOut" type="time" step="1"'), 'timeOut must accept seconds');

for (const fn of ['createDataBackup', 'installDailyBackupTrigger', 'getBackupStatus', 'createRestoreCopyFromBackup']) {
  assert(backend.includes(`function ${fn}(`), `Missing backend backup function: ${fn}`);
}

console.log('production closeout static checks passed');
