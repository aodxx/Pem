import fs from 'node:fs';
import vm from 'node:vm';

const backendPath = fs.existsSync('apps-script/Code.gs') ? 'apps-script/Code.gs' : 'Palm-Yield-Ledger-Code.gs';
const manifestPath = fs.existsSync('apps-script/appsscript.json') ? 'apps-script/appsscript.json' : 'appsscript.json';
const backend = fs.readFileSync(backendPath, 'utf8');
new vm.Script(backend, { filename: 'Code.gs' });

const requiredFunctions = [
  'doGet','doPost','setupV1','runV1SmokeTests','testGeminiReceiptFromDrive',
  'analyzeReceipt_','createSale_','updateSale_','voidSale_','listSales_',
  'getSale_','getSaleSaveStatus_','getDashboardSummary_','findDuplicateCandidates_','requireAccessToken_'
];
for (const name of requiredFunctions) {
  if (!new RegExp(`function\\s+${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*\\(`).test(backend)) {
    throw new Error(`Missing backend function: ${name}`);
  }
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.timeZone !== 'Asia/Bangkok' || manifest.runtimeVersion !== 'V8') throw new Error('Invalid Apps Script manifest');
for (const scope of ['spreadsheets','drive','script.external_request']) {
  if (!manifest.oauthScopes.some(value => value.includes(scope))) throw new Error(`Missing OAuth scope: ${scope}`);
}

const html = fs.readFileSync('frontend/index.html', 'utf8');
const app = fs.readFileSync('frontend/app.js', 'utf8');
const dashboardAnalytics = fs.readFileSync('frontend/dashboard-analytics.js', 'utf8');
new vm.Script(dashboardAnalytics, { filename: 'dashboard-analytics.js' });
for (const reliabilityMarker of ['indexedDB.open', 'processPendingSaves', "api('sales.status'", 'idempotencyKey']) {
  if (!app.includes(reliabilityMarker)) throw new Error(`Missing reliable-save marker: ${reliabilityMarker}`);
}
for (const ocrReliabilityMarker of ['imageMimeTypeForFile(file)', 'normalizeImageDataUrl', 'OCR_STILL_PROCESSING', 'maxAttempts = 45', "state.ocrRequestId = requestId", 'enhanceReceiptImage(', 'imageAlternates']) {
  if (!app.includes(ocrReliabilityMarker)) throw new Error(`Missing OCR reliability marker: ${ocrReliabilityMarker}`);
}
for (const backendOcrMarker of ['getGeminiFallbackModels_', 'gemini-3.8-flash', 'gemini-3.5-flash-lite', 'modelsTried', 'กระดาษยับ พับ ขาด สกปรก ซีด']) {
  if (!backend.includes(backendOcrMarker)) throw new Error(`Missing robust OCR backend marker: ${backendOcrMarker}`);
}
for (const visibilityMarker of ['history-count', 'clear-filters']) {
  if (!html.includes(visibilityMarker)) throw new Error(`Missing record-visibility marker: ${visibilityMarker}`);
}
if (!app.includes('<option value="all">ทุกปี</option>')) throw new Error('Missing all-years dashboard option');
for (const dashboardMarker of ['dashboard-metric-tabs', 'monthly-insights', 'dashboard-data-note', 'monthly-chart-axis', 'monthly-chart-months', 'monthly-breakdown-body', 'monthly-breakdown-total']) {
  if (!html.includes(dashboardMarker)) throw new Error(`Missing dashboard analytics element: ${dashboardMarker}`);
}
for (const dashboardMarker of ['renderDashboardAnalytics', 'renderMonthlyInsights', 'renderMonthlyBreakdown', 'price-change', 'dashboardMetric']) {
  if (!app.includes(dashboardMarker)) throw new Error(`Missing dashboard analytics behavior: ${dashboardMarker}`);
}
if (!dashboardAnalytics.includes('window.PalmDashboardAnalytics')) throw new Error('Dashboard analytics helper is not exposed to the app');
const ids = [...app.matchAll(/\$\(['"]#([a-zA-Z0-9_-]+)['"]\)/g)].map(match => match[1]);
for (const id of new Set(ids)) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Frontend references missing element: #${id}`);
}

const config = fs.readFileSync('frontend/config.js', 'utf8');
if (!config.includes('/macros/s/') || !config.includes('/exec')) throw new Error('Frontend API URL missing');
if (/AIza[0-9A-Za-z_-]{20,}/.test(backend + app + config)) throw new Error('Possible API key committed');
if (/PALM-[0-9a-f]{20,}/i.test(backend + app + config)) throw new Error('Possible access token committed');

const manifestWeb = JSON.parse(fs.readFileSync('frontend/manifest.webmanifest', 'utf8'));
for (const icon of manifestWeb.icons) {
  if (!fs.existsSync(`frontend/${icon.src}`)) throw new Error(`Missing PWA icon: ${icon.src}`);
}
for (const file of ['frontend/styles-v2.css','frontend/sw.js','frontend/dashboard-analytics.js','frontend/dashboard-analytics.css','frontend/icons/icon.svg']) {
  if (!fs.existsSync(file)) throw new Error(`Missing frontend asset: ${file}`);
}

console.log(JSON.stringify({
  ok: true,
  backendLines: backend.split('\n').length,
  frontendElementsChecked: new Set(ids).size,
  requiredFunctions: requiredFunctions.length,
  pwaIcons: manifestWeb.icons.length
}, null, 2));
