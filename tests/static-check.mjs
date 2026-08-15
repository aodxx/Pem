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
  ,'upgradeLaborSystem','listContractors_','createContractor_','saveLaborForSale_','createLaborPayment_'
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
const styleFiles = ['frontend/styles-v2.css','frontend/styles-core-v2.5.2.css','frontend/home-professional.css'].filter(path => fs.existsSync(path));
const styles = styleFiles.map(path => fs.readFileSync(path, 'utf8')).join('\n');

for (const reliabilityMarker of ['indexedDB.open', 'processPendingSaves', "api('sales.status'", 'idempotencyKey']) {
  if (!app.includes(reliabilityMarker)) throw new Error(`Missing reliable-save marker: ${reliabilityMarker}`);
}
for (const visibilityMarker of ['history-count', 'clear-filters']) {
  if (!html.includes(visibilityMarker)) throw new Error(`Missing record-visibility marker: ${visibilityMarker}`);
}
for (const receiptViewerMarker of ['receipt-viewer', 'receipt-frame', 'viewer-edit-sale']) {
  if (!html.includes(receiptViewerMarker)) throw new Error(`Missing receipt viewer marker: ${receiptViewerMarker}`);
}
for (const receiptViewerLogic of ['openReceiptViewer', 'ImageFileID', '/preview']) {
  if (!app.includes(receiptViewerLogic)) throw new Error(`Missing receipt viewer logic: ${receiptViewerLogic}`);
}
for (const timelineLogic of ['saleDateValue', 'renderSaleGap', 'b.date - a.date', 'ระยะรอบ']) {
  if (!app.includes(timelineLogic)) throw new Error(`Missing chronological timeline logic: ${timelineLogic}`);
}
if (!styles.includes('.sale-gap')) throw new Error('Missing sale timeline connector styles');
for (const closeoutLogic of ['openSaleDetail', 'saveLaborPayment', 'collectContractorUpdates', 'filterContractorSelect', 'paymentStatusLabel']) {
  if (!app.includes(closeoutLogic)) throw new Error(`Missing closeout feature logic: ${closeoutLogic}`);
}
for (const closeoutUi of ['sale-detail-dialog','labor-payment-form','filter-work-mode','filter-contractor','filter-payment-status','filter-date-from','filter-date-to']) {
  if (!html.includes(`id="${closeoutUi}"`)) throw new Error(`Missing closeout feature UI: ${closeoutUi}`);
}
for (const privacyUi of ['profile-settings-button','toggle-api-url','toggle-access-token']) {
  if (!html.includes(`id="${privacyUi}"`)) throw new Error(`Missing privacy/navigation UI: ${privacyUi}`);
}
if (html.includes('data-view="settings"')) throw new Error('Settings must not appear in bottom navigation');
if ((html.match(/class="nav-item/g) || []).length !== 3) throw new Error('Bottom navigation must contain exactly three primary items');
for (const privacyLogic of ['toggleSecretField','hideAllSecrets','visibilitychange','20000']) {
  if (!app.includes(privacyLogic)) throw new Error(`Missing privacy behavior: ${privacyLogic}`);
}
for (const filterDrawerUi of ['history-filter-drawer','filter-active-count']) {
  if (!html.includes(`id="${filterDrawerUi}"`)) throw new Error(`Missing collapsible filter UI: ${filterDrawerUi}`);
}
for (const filterDrawerLogic of ['updateFilterDrawerStatus', "$('#history-filter-drawer').open = false"]) {
  if (!app.includes(filterDrawerLogic)) throw new Error(`Missing collapsible filter behavior: ${filterDrawerLogic}`);
}
if (!styles.includes('.filter-drawer[open]')) throw new Error('Missing collapsible filter styles');
for (const saveFeedbackUi of ['save-feedback','save-feedback-title','save-feedback-message','save-feedback-close']) {
  if (!html.includes(`id="${saveFeedbackUi}"`)) throw new Error(`Missing save feedback UI: ${saveFeedbackUi}`);
}
for (const saveFeedbackLogic of ['showSaveFeedback','กำลังบันทึกรายการ','บันทึกสำเร็จ','ส่งเข้า Google Sheets']) {
  if (!app.includes(saveFeedbackLogic)) throw new Error(`Missing save feedback behavior: ${saveFeedbackLogic}`);
}
for (const loadingUi of ['loading-animation','assets/lottie-light.min.js']) {
  if (!html.includes(loadingUi)) throw new Error(`Missing Lottie loading UI: ${loadingUi}`);
}
for (const loadingLogic of ['initLoadingAnimation','assets/loading.json','goToAndPlay','prefers-reduced-motion']) {
  if (!app.includes(loadingLogic)) throw new Error(`Missing Lottie loading behavior: ${loadingLogic}`);
}
for (const readabilityStyle of ['.save-feedback.working','.history-card .amount strong','.detail-summary-grid strong','.summary-card strong']) {
  if (!styles.includes(readabilityStyle)) throw new Error(`Missing readability/save style: ${readabilityStyle}`);
}
if (!app.includes('<option value="all">ทุกปี</option>')) throw new Error('Missing all-years dashboard option');
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
for (const file of ['frontend/styles-v2.css','frontend/sw.js','frontend/icons/icon.svg']) {
  if (!fs.existsSync(file)) throw new Error(`Missing frontend asset: ${file}`);
}
for (const file of ['frontend/assets/lottie-light.min.js','frontend/assets/loading.json','frontend/assets/lottie-web.LICENSE.md']) {
  if (!fs.existsSync(file)) throw new Error(`Missing Lottie asset: ${file}`);
}
const loadingAnimation = JSON.parse(fs.readFileSync('frontend/assets/loading.json', 'utf8'));
if (loadingAnimation.w !== 124 || loadingAnimation.h !== 124 || !Array.isArray(loadingAnimation.layers) || !loadingAnimation.layers.length) {
  throw new Error('Invalid uploaded Lottie loading animation');
}
if (!fs.readFileSync('frontend/sw.js', 'utf8').includes('assets/loading.json')) throw new Error('Lottie animation is missing from the offline shell');

console.log(JSON.stringify({
  ok: true,
  backendLines: backend.split('\n').length,
  frontendElementsChecked: new Set(ids).size,
  requiredFunctions: requiredFunctions.length,
  pwaIcons: manifestWeb.icons.length,
  styleFiles
}, null, 2));
