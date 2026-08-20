import fs from 'node:fs';

const index = fs.readFileSync('frontend/index.html', 'utf8');
const config = fs.readFileSync('frontend/config.js', 'utf8');
const sw = fs.readFileSync('frontend/sw.js', 'utf8');
const styles = fs.readFileSync('frontend/styles-v2.css', 'utf8');
const backup = fs.readFileSync('apps-script/Backup.gs', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(pkg.version === '2.6.2', 'package.json version must be 2.6.2');
assert(config.includes("version: '2.6.2'"), 'frontend config version must be 2.6.2');
assert(sw.includes("const CACHE = 'palm-ledger-v2.6.2';"), 'service worker cache must be 2.6.2');
assert(sw.includes("'modern-polish.css'"), 'modern polish stylesheet must be cached offline');
assert(styles.includes('./modern-polish.css'), 'modern polish stylesheet must be loaded');
assert(index.includes('name="timeIn" type="time" step="1"'), 'timeIn must accept seconds');
assert(index.includes('name="timeOut" type="time" step="1"'), 'timeOut must accept seconds');

for (const fn of ['createDataBackup', 'installDailyBackupTrigger', 'getBackupStatus', 'createRestoreCopyFromBackup']) {
  assert(backup.includes(`function ${fn}(`), `Missing backend backup function: ${fn}`);
}
assert(backup.includes("retentionCount: 30"), 'backup retention must be explicit');
assert(!backup.includes('setContent('), 'restore helper must not overwrite production content');

console.log('production closeout static checks passed');
