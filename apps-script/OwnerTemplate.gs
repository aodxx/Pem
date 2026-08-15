/**
 * PALM LEDGER Multi-owner Template installer
 *
 * Security boundary:
 *   1 Owner = 1 Apps Script project/deployment = 1 Spreadsheet = 1 Drive workspace.
 *
 * IMPORTANT: this installer deliberately does NOT call setupProject().
 * The legacy production setupProject() writes the original production
 * Spreadsheet/Drive IDs, which must never be inherited by a new owner.
 */

const OWNER_TEMPLATE_VERSION = '1.0.1';
const OWNER_PROPERTY_KEYS = Object.freeze({
  ownerName: 'OWNER_NAME',
  ownerInstanceId: 'OWNER_INSTANCE_ID',
  templateVersion: 'OWNER_TEMPLATE_VERSION',
  installedAt: 'OWNER_INSTALLED_AT',
  spreadsheetId: 'SPREADSHEET_ID',
  projectFolderId: 'PROJECT_FOLDER_ID',
  receiptsFolderId: 'RECEIPTS_FOLDER_ID',
  accessTokenHash: 'APP_ACCESS_TOKEN_HASH',
  geminiApiKey: 'GEMINI_API_KEY',
  setupVersion: 'SETUP_VERSION',
  setupAt: 'SETUP_AT'
});

/**
 * Run this from a CLEAN Spreadsheet-bound copy.
 * The target Sheet must contain no owner transaction rows.
 */
function setupOwnerInstance() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error(
      'ไม่พบ Google Sheet ที่ผูกกับ Apps Script นี้ ให้เปิด Apps Script จาก Extensions > Apps Script ภายใน Template Sheet หรือใช้ configureOwnerInstance(ownerName, spreadsheetId)'
    );
  }

  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'ติดตั้ง PALM LEDGER สำหรับเจ้าของใหม่',
    'ใส่ชื่อสวนหรือชื่อเจ้าของ เช่น สวนปาล์มนิพนธ์',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return { ok: false, cancelled: true };

  const ownerName = String(response.getResponseText() || '').trim();
  if (!ownerName) throw new Error('กรุณาระบุชื่อสวนหรือชื่อเจ้าของ');
  return configureOwnerInstance(ownerName, spreadsheet.getId());
}

/**
 * Install an isolated owner instance into a clean target Spreadsheet.
 * Works from bound scripts and standalone scripts.
 */
function configureOwnerInstance(ownerName, spreadsheetId) {
  const cleanOwnerName = String(ownerName || '').trim();
  const cleanSpreadsheetId = String(spreadsheetId || '').trim();
  if (!cleanOwnerName) throw new Error('ownerName is required');
  if (!cleanSpreadsheetId) throw new Error('spreadsheetId is required');

  const spreadsheet = SpreadsheetApp.openById(cleanSpreadsheetId);
  const properties = PropertiesService.getScriptProperties();

  const previousInstanceId = properties.getProperty(OWNER_PROPERTY_KEYS.ownerInstanceId);
  if (previousInstanceId) {
    throw new Error(
      'Apps Script ชุดนี้ถูกติดตั้งเป็น Owner Instance แล้ว (' + previousInstanceId + ') เพื่อป้องกันข้อมูลปะปน ห้ามเปลี่ยนไปใช้เจ้าของคนอื่น ให้สร้างสำเนา Template ใหม่แทน'
    );
  }

  // Never allow a new template installer to target the original production DB.
  if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.spreadsheetId && cleanSpreadsheetId === String(APP_CONFIG.spreadsheetId)) {
    throw new Error('ไม่อนุญาตให้ติดตั้ง Multi-owner ลงบน Spreadsheet production เดิม กรุณาใช้ Template Sheet ใหม่ที่ไม่มีข้อมูลส่วนตัว');
  }

  assertCleanOwnerSpreadsheet_(spreadsheet);

  const instanceId = 'OWNER_' + Utilities.getUuid().replace(/-/g, '').slice(0, 16).toUpperCase();
  const safeFolderName = cleanOwnerName.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  const rootFolder = DriveApp.createFolder('PALM LEDGER - ' + safeFolderName);
  const receiptsFolder = rootFolder.createFolder('Palm Yield Ledger Receipts');
  const installedAt = new Date().toISOString();

  // Set the owner boundary BEFORE any database helper is called. The production
  // backend reads Script Properties first, so all schema work below is scoped to
  // this owner's Spreadsheet.
  properties.setProperties({
    [OWNER_PROPERTY_KEYS.ownerName]: cleanOwnerName,
    [OWNER_PROPERTY_KEYS.ownerInstanceId]: instanceId,
    [OWNER_PROPERTY_KEYS.templateVersion]: OWNER_TEMPLATE_VERSION,
    [OWNER_PROPERTY_KEYS.installedAt]: installedAt,
    [OWNER_PROPERTY_KEYS.spreadsheetId]: spreadsheet.getId(),
    [OWNER_PROPERTY_KEYS.projectFolderId]: rootFolder.getId(),
    [OWNER_PROPERTY_KEYS.receiptsFolderId]: receiptsFolder.getId(),
    [OWNER_PROPERTY_KEYS.setupVersion]: 'multi-owner-' + OWNER_TEMPLATE_VERSION,
    [OWNER_PROPERTY_KEYS.setupAt]: installedAt
  }, false);

  // Build only the schema. Do NOT call legacy setupProject(), because that
  // function writes the original production IDs into Script Properties.
  if (typeof resetRuntimeCaches_ === 'function') resetRuntimeCaches_();
  if (typeof ensureRequiredSheets_ === 'function') ensureRequiredSheets_();
  if (typeof resetRuntimeCaches_ === 'function') resetRuntimeCaches_();

  seedOwnerSettings_(cleanOwnerName);

  const accessToken = generateOwnerAccessToken_();
  properties.setProperty(OWNER_PROPERTY_KEYS.accessTokenHash, hashOwnerSecret_(accessToken));

  return {
    ok: true,
    ownerName: cleanOwnerName,
    instanceId: instanceId,
    spreadsheetId: spreadsheet.getId(),
    projectFolderId: rootFolder.getId(),
    receiptsFolderId: receiptsFolder.getId(),
    accessToken: accessToken,
    next: [
      'เก็บ Access Token นี้ไว้ทันที เพราะระบบเก็บเฉพาะ hash',
      'ตั้ง GEMINI_API_KEY ใน Script Properties',
      'รัน getOwnerInstanceStatus() และตรวจว่าค่าของ owner นี้ครบ',
      'รัน runPhase1Tests() ถ้ามี และตรวจว่า failed = 0',
      'Deploy เป็น Web App ใหม่สำหรับเจ้าของคนนี้',
      'นำ Web App URL และ Access Token ไปจับคู่กับ PALM LEDGER บนอุปกรณ์ของเจ้าของคนนี้'
    ]
  };
}

/** Refuse templates that contain copied production/owner transaction data. */
function assertCleanOwnerSpreadsheet_(spreadsheet) {
  const transactionalSheets = ['Sales', 'Deductions', 'Buyers', 'Contractors', 'LaborEntries', 'LaborPayments', 'OCRRuns', 'AuditTrail', 'Logs'];
  const dirty = transactionalSheets.filter(function(sheetName) {
    const sheet = spreadsheet.getSheetByName(sheetName);
    return sheet && sheet.getLastRow() > 1;
  });
  if (dirty.length) {
    throw new Error(
      'Template Sheet นี้มีข้อมูลเดิมอยู่ใน: ' + dirty.join(', ') + '. เพื่อไม่ให้ข้อมูลของเจ้าของเดิมถูกคัดลอกไป ให้ใช้ Template Sheet ที่มีเฉพาะหัวตารางและ Settings เท่านั้น'
    );
  }
}

/** Seed non-secret owner defaults only; never copy production secrets. */
function seedOwnerSettings_(ownerName) {
  if (typeof getSpreadsheet_ !== 'function') return;
  const spreadsheet = getSpreadsheet_();
  const sheet = spreadsheet.getSheetByName('Settings');
  if (!sheet) return;

  const defaults = [
    ['OWNER_DISPLAY_NAME', ownerName, 'string', 'ชื่อสวน/เจ้าของที่แสดงใน instance นี้'],
    ['GEMINI_MODEL', 'gemini-3.6-flash', 'string', 'Gemini model สำหรับ OCR'],
    ['GEMINI_SCHEMA_VERSION', '1.0.0', 'string', 'OCR schema version'],
    ['LOW_CONFIDENCE_THRESHOLD', 0.75, 'number', 'เกณฑ์เตือนความมั่นใจต่ำ'],
    ['WEIGHT_TOLERANCE_KG', 1, 'number', 'ค่าคลาดเคลื่อนน้ำหนักที่ยอมรับ'],
    ['MONEY_TOLERANCE_THB', 1, 'number', 'ค่าคลาดเคลื่อนยอดเงินที่ยอมรับ'],
    ['DUPLICATE_WARN_SCORE', 0.7, 'number', 'เกณฑ์เตือนรายการซ้ำ']
  ];

  const existing = {};
  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues().forEach(function(row) {
      const key = String(row[0] || '').trim();
      if (key) existing[key] = true;
    });
  }
  const missing = defaults.filter(function(row) { return !existing[row[0]]; });
  if (missing.length) sheet.getRange(sheet.getLastRow() + 1, 1, missing.length, 4).setValues(missing);
  if (typeof resetRuntimeCaches_ === 'function') resetRuntimeCaches_();
}

/** Returns non-secret installation metadata for troubleshooting. */
function getOwnerInstanceStatus() {
  const p = PropertiesService.getScriptProperties();
  const spreadsheetId = p.getProperty(OWNER_PROPERTY_KEYS.spreadsheetId) || '';
  const projectFolderId = p.getProperty(OWNER_PROPERTY_KEYS.projectFolderId) || '';
  const receiptsFolderId = p.getProperty(OWNER_PROPERTY_KEYS.receiptsFolderId) || '';
  return {
    installed: Boolean(p.getProperty(OWNER_PROPERTY_KEYS.ownerInstanceId)),
    ownerName: p.getProperty(OWNER_PROPERTY_KEYS.ownerName) || '',
    instanceId: p.getProperty(OWNER_PROPERTY_KEYS.ownerInstanceId) || '',
    templateVersion: p.getProperty(OWNER_PROPERTY_KEYS.templateVersion) || '',
    installedAt: p.getProperty(OWNER_PROPERTY_KEYS.installedAt) || '',
    spreadsheetConfigured: Boolean(spreadsheetId),
    projectFolderConfigured: Boolean(projectFolderId),
    receiptsFolderConfigured: Boolean(receiptsFolderId),
    accessTokenConfigured: Boolean(p.getProperty(OWNER_PROPERTY_KEYS.accessTokenHash)),
    geminiConfigured: Boolean(p.getProperty(OWNER_PROPERTY_KEYS.geminiApiKey))
  };
}

/** Rotates only this owner's PWA token. The old token stops working immediately. */
function rotateOwnerAccessToken() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty(OWNER_PROPERTY_KEYS.ownerInstanceId)) throw new Error('ยังไม่ได้ติดตั้ง Owner Instance');
  const accessToken = generateOwnerAccessToken_();
  p.setProperty(OWNER_PROPERTY_KEYS.accessTokenHash, hashOwnerSecret_(accessToken));
  return {
    ok: true,
    accessToken: accessToken,
    message: 'Token เดิมถูกยกเลิกแล้ว กรุณานำ Token ใหม่นี้ไปตั้งค่าในอุปกรณ์ของเจ้าของรายนี้'
  };
}

function generateOwnerAccessToken_() {
  return 'PALM-' + Utilities.getUuid().replace(/-/g, '') + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function hashOwnerSecret_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ''),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(byte) {
    const unsigned = byte < 0 ? byte + 256 : byte;
    return ('0' + unsigned.toString(16)).slice(-2);
  }).join('');
}
