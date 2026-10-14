import fs from 'node:fs';

const index = fs.readFileSync('frontend/index.html', 'utf8');
const config = fs.readFileSync('frontend/config.js', 'utf8');
const sw = fs.readFileSync('frontend/sw.js', 'utf8');
const styles = fs.readFileSync('frontend/styles-v2.css', 'utf8');
const contrast = fs.readFileSync('frontend/contrast-fix.css', 'utf8');
const developerCredit = fs.readFileSync('frontend/developer-credit.css', 'utf8');
const dashboardCss = fs.readFileSync('frontend/dashboard-analytics.css', 'utf8');
const dashboardJs = fs.readFileSync('frontend/dashboard-analytics.js', 'utf8');
const backup = fs.readFileSync('apps-script/Backup.gs', 'utf8');
const productionSmoke = fs.readFileSync('.github/workflows/production-smoke.yml', 'utf8');
const ciWorkflow = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
const deployWorkflow = fs.readFileSync('.github/workflows/deploy-pages.yml', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(pkg.version === '2.7.0', 'package.json version must be 2.7.0');
assert(config.includes("version: '2.7.0'"), 'frontend config version must be 2.7.0');
assert(sw.includes("const CACHE = 'palm-ledger-v2.7.0';"), 'service worker cache must be 2.7.0');
assert(sw.includes("'modern-polish.css'"), 'modern polish stylesheet must be cached offline');
assert(sw.includes("'contrast-fix.css'"), 'contrast fix stylesheet must be cached offline');
assert(sw.includes("'developer-credit.css'"), 'developer credit stylesheet must be cached offline');
assert(sw.includes("'dashboard-analytics.css'"), 'dashboard analytics stylesheet must be cached offline');
assert(sw.includes("'dashboard-analytics.js'"), 'dashboard analytics helper must be cached offline');
assert(styles.includes('./modern-polish.css'), 'modern polish stylesheet must be loaded');
assert(styles.includes('./contrast-fix.css'), 'contrast fix stylesheet must be loaded after polish');
assert(styles.includes('./developer-credit.css'), 'developer credit stylesheet must be loaded');
assert(styles.includes('./dashboard-analytics.css'), 'dashboard analytics stylesheet must be loaded');
assert(index.includes('dashboard-analytics.js'), 'dashboard analytics helper must load before app.js');
assert(index.includes('data-dashboard-metric="price"'), 'price trend control must be present');
assert(dashboardCss.includes('.price-line-svg'), 'dashboard price trend must use a responsive line chart');
assert(dashboardJs.includes('insightCards'), 'dashboard analytics insights must be computed from real monthly series');
assert(contrast.includes('color: #496158 !important;'), 'inactive bottom nav must have explicit readable contrast');
assert(contrast.includes('--contrast-active-bg: #e9f8c7;'), 'active bottom nav must have explicit contrast background');
assert(index.includes('name="timeIn" type="time" step="1"'), 'timeIn must accept seconds');
assert(index.includes('name="timeOut" type="time" step="1"'), 'timeOut must accept seconds');
assert(config.includes('Developed by <b>aod</b>'), 'developer credit must be present');
assert(developerCredit.includes('PALM LEDGER 2.7.0'), 'developer credit stylesheet must match release 2.7.0');
assert(config.includes('https://www.facebook.com/share/1AWvhjdr44/'), 'developer Facebook URL must be present');
assert(developerCredit.includes('.developer-facebook'), 'developer Facebook control must be styled');

for (const fn of ['createDataBackup', 'installDailyBackupTrigger', 'getBackupStatus', 'createRestoreCopyFromBackup']) {
  assert(backup.includes(`function ${fn}(`), `Missing backend backup function: ${fn}`);
}
assert(backup.includes("retentionCount: 30"), 'backup retention must be explicit');
assert(!backup.includes('setContent('), 'restore helper must not overwrite production content');

for (const required of [
  '--location',
  '--max-time 30',
  '--retry-all-errors',
  '[[ ! -s /tmp/health.json ]]',
  "data.version !== '1.3.1'",
  "data.status !== 'ready'",
]) {
  assert(productionSmoke.includes(required), `production smoke is missing: ${required}`);
}

for (const workflow of [ciWorkflow, deployWorkflow]) {
  assert(workflow.includes('actions/checkout@v5'), 'workflow must use the Node.js 24 checkout runtime');
}
assert(ciWorkflow.includes('actions/setup-node@v5'), 'CI must use the Node.js 24 setup-node runtime');
assert(deployWorkflow.includes('actions/setup-node@v5'), 'Pages validation must use the Node.js 24 setup-node runtime');

console.log('production closeout static checks passed');
