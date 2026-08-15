/**
 * PALM LEDGER Multi-owner Template installer
 *
 * Goal: one copied Sheet + one copied Apps Script deployment = one isolated owner.
 * No owner shares Spreadsheet, Drive folders, Access Token or Gemini key.
 *
 * Recommended usage for a copied/bound Google Sheet:
 *   1. Open Extensions > Apps Script.
 *   2. Run setupOwnerInstance().
 *   3. Copy the returned accessToken immediately; it is shown only once.
 *   4. Add GEMINI_API_KEY in Script Properties.
 *   5. Deploy as Web App and pair the PWA with that Web App URL + token.
 */

const OWNER_TEMPLATE_VERSION = '1.0.0';
const OWNER_PROPERTY_KEYS = Object.freeze({
  ownerName: 'OWNER_NAME',
  ownerInstanceId: 'OWNER_INSTANCE_ID',
  templateVersion: 'OWNER_TEMPLATE_VERSION',
  installedAt: 'OWNER_INSTALLED_AT',
  spreadsheetId: 'SPREADSHEET_ID',
  projectFolderId: 'PROJECT_FOLDER_ID',
  receiptsFolderId: 'RECEIPTS_FOLDER_ID',
  accessTokenHash: 'APP_ACCESS_TOKEN_HASH',
  geminiApiKey: 'GEMINI_API_KEY'
});

/**
 * One-click installer for a Spreadsheet-bound copy.
 * It intentionally refuses to guess a spreadsheet when the script is standalone.
 */
function setupOwnerInstance() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error(
      'ไม่พบ Google Sheet ที่ผูกกับ Apps Script นี้ ให้เปิด Apps Script จาก Extensions > Apps Script ภายในสำเนา Google Sheet หรือใช้ configureOwnerInstance(ownerName, spreadsheetId)'
    );
  }

  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'ติดตั้ง PALM LEDGER สำหรับเจ้าของใหม่',
    'ใส่ชื่อสวนหรือชื่อเจ้าของ เช่น สวนปาล์มนิพนธ์',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) {
    return { ok: false, cancelled: true };
  }

  const ownerName = String(response.getResponseText() || '').trim();
  if (!ownerName) throw new Error('กรุณาระบุชื่อสวนหรือชื่อเจ้าของ');
  return configureOwnerInstance(ownerName, spreadsheet.getId());
}

/**
 * Installer usable from tests/automation or a standalone Apps Script project.
 */
function configureOwnerInstance(ownerName, spreadsheetId) {
  const cleanOwnerName = String(ownerName || '').trim();
  const cleanSpreadsheetId = String(spreadsheetId || '').trim();
  if (!cleanOwnerName) throw new Error('ownerName is required');
  if (!cleanSpreadsheetId) throw new Error('spreadsheetId is required');

  // Fail early if this account cannot open the target Spreadsheet.
  const spreadsheet = SpreadsheetApp.openById(cleanSpreadsheetId);
  const properties = PropertiesService.getScriptProperties();

  const previousInstanceId = properties.getProperty(OWNER_PROPERTY_KEYS.ownerInstanceId);
  if (previousInstanceId) {
    throw new Error(
      'Apps Script ชุดนี้ถูกติดตั้งเป็น Owner Instance แล้ว (' + previousInstanceId + ') เพื่อป้องกันข้อมูลปะปน ห้ามชี้ instance เดิมไปยังเจ้าของคนใหม่ ให้ทำสำเนา Apps Script/Google Sheet ใหม่แทน'
    );
  }

  const instanceId = 'OWNER_' + Utilities.getUuid().replace(/-/g, '').slice(0, 16).toUpperCase();
  const safeFolderName = cleanOwnerName.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  const rootFolder = DriveApp.createFolder('PALM LEDGER - ' + safeFolderName);
  const receiptsFolder = rootFolder.createFolder('Receipts');

  properties.setProperties({
    [OWNER_PROPERTY_KEYS.ownerName]: cleanOwnerName,
    [OWNER_PROPERTY_KEYS.ownerInstanceId]: instanceId,
    [OWNER_PROPERTY_KEYS.templateVersion]: OWNER_TEMPLATE_VERSION,
    [OWNER_PROPERTY_KEYS.installedAt]: new Date().toISOString(),
    [OWNER_PROPERTY_KEYS.spreadsheetId]: spreadsheet.getId(),
    [OWNER_PROPERTY_KEYS.projectFolderId]: rootFolder.getId(),
    [OWNER_PROPERTY_KEYS.receiptsFolderId]: receiptsFolder.getId()
  }, false);

  // Reuse the production schema/setup routine when the main backend exposes it.
  if (typeof setupProject === 'function') {
    setupProject();
  }

  // Always create an owner-specific token after setupProject so an existing
  // setup routine cannot replace this instance's credentials.
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
      'รัน verifyProjectSetup() หรือ runPhase1Tests() ถ้ามี',
      'Deploy เป็น Web App ใหม่สำหรับเจ้าของคนนี้',
      'นำ Web App URL และ Access Token ไปใส่ใน PALM LEDGER'
    ]
  };
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
  if (!p.getProperty(OWNER_PROPERTY_KEYS.ownerInstanceId)) {
    throw new Error('ยังไม่ได้ติดตั้ง Owner Instance');
  }
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
