/**
 * Palm Yield Ledger Backend v1.2.0
 * Apps Script Project: 1PzG5lE7bxpSMSyO_BOBx9DGuFTZMTw_7mBV7o12c6HoWMKqzLlmwaGaz
 * รวมจากไฟล์ Phase 1 ใน aodxx/Pem เพื่อให้คัดลอกวางใน Code.gs ได้ครั้งเดียว
 */

// ===== Config.gs =====
const APP_CONFIG = Object.freeze({
  appName: 'Palm Yield Ledger',
  serviceName: 'palm-yield-ledger-api',
  version: '1.2.0',
  apiVersion: 'v1',
  timeZone: 'Asia/Bangkok',
  spreadsheetId: '1S5WtdhsVUOQ5APZ_EiBKSZBTeyi6VKnVLeaGbWPBAPc',
  projectFolderId: '1AnRqXRhfecY1-qqM3iQlV1YtR945cDoN',
  receiptsFolderName: 'Palm Yield Ledger Receipts',
  maxImageBytes: 6500000,
  settingsSheet: 'Settings',
  logSheet: 'Logs',
  requiredSheets: Object.freeze({
    Sales: Object.freeze([
      'SaleID', 'RecordStatus', 'ReceiptNumber', 'SaleDate', 'TimeIn', 'TimeOut',
      'BuyerID', 'BuyerNameRaw', 'BranchRaw', 'CustomerCode', 'CustomerName',
      'VehiclePlate', 'ProductCode', 'ProductName', 'GrossWeightKg', 'TareWeightKg',
      'NetWeightKg', 'DeductionWeightKg', 'PayableWeightKg', 'PricePerKg',
      'GrossAmount', 'TotalDeduction', 'NetAmount', 'Currency', 'Notes',
      'HandwrittenNotes', 'ImageFileID', 'ImageName', 'ImageSha256', 'ImageMimeType',
      'ImageBytes', 'OCRRunID', 'OCRStatus', 'ConfidenceOverall', 'AIModel', 'Source',
      'DuplicateScore', 'DuplicateOfSaleID', 'DuplicateOverride', 'CreatedAt', 'UpdatedAt'
    ]),
    Deductions: Object.freeze([
      'DeductionID', 'SaleID', 'SortOrder', 'DeductionType', 'Description', 'Quantity',
      'Unit', 'Rate', 'Amount', 'CreatedAt', 'UpdatedAt'
    ]),
    Buyers: Object.freeze([
      'BuyerID', 'BuyerName', 'NormalizedName', 'Branch', 'Address', 'Phone', 'Notes',
      'Active', 'CreatedAt', 'UpdatedAt'
    ]),
    OCRRuns: Object.freeze([
      'OCRRunID', 'RequestID', 'ImageSha256', 'Model', 'SchemaVersion', 'Status',
      'OverallConfidence', 'MissingFieldsJSON', 'WarningsJSON', 'ExtractedJSON',
      'DurationMs', 'ErrorCode', 'CreatedAt'
    ]),
    AuditTrail: Object.freeze([
      'AuditID', 'SaleID', 'Action', 'ChangedFieldsJSON', 'Actor', 'Timestamp', 'RequestID'
    ]),
    Logs: Object.freeze([
      'LogID', 'RequestID', 'Level', 'Action', 'SaleID', 'Description', 'ErrorCode',
      'DurationMs', 'Timestamp'
    ]),
    Settings: Object.freeze(['Key', 'Value', 'Type', 'Description'])
  })
});

const SCRIPT_PROPERTY_KEYS = Object.freeze({
  spreadsheetId: 'SPREADSHEET_ID',
  projectFolderId: 'PROJECT_FOLDER_ID',
  receiptsFolderId: 'RECEIPTS_FOLDER_ID',
  geminiApiKey: 'GEMINI_API_KEY',
  accessTokenHash: 'APP_ACCESS_TOKEN_HASH',
  setupVersion: 'SETUP_VERSION',
  setupAt: 'SETUP_AT'
});

// Reuse Apps Script service objects inside one request. Reopening the same
// spreadsheet and rereading headers for every row is noticeably slow on mobile.
var runtimeSpreadsheetCache_ = null;
var runtimeSheetCache_ = {};
var runtimeHeaderCache_ = {};
var runtimeSettingsCache_ = null;
var runtimeWriteLockHeld_ = false;

function getRuntimeConfig_() {
  const properties = PropertiesService.getScriptProperties();
  return {
    appName: APP_CONFIG.appName,
    serviceName: APP_CONFIG.serviceName,
    version: APP_CONFIG.version,
    apiVersion: APP_CONFIG.apiVersion,
    timeZone: APP_CONFIG.timeZone,
    spreadsheetId: properties.getProperty(SCRIPT_PROPERTY_KEYS.spreadsheetId) || APP_CONFIG.spreadsheetId,
    projectFolderId: properties.getProperty(SCRIPT_PROPERTY_KEYS.projectFolderId) || APP_CONFIG.projectFolderId,
    receiptsFolderId: properties.getProperty(SCRIPT_PROPERTY_KEYS.receiptsFolderId),
    geminiConfigured: Boolean(properties.getProperty(SCRIPT_PROPERTY_KEYS.geminiApiKey)),
    accessTokenConfigured: Boolean(properties.getProperty(SCRIPT_PROPERTY_KEYS.accessTokenHash)),
    setupVersion: properties.getProperty(SCRIPT_PROPERTY_KEYS.setupVersion),
    setupAt: properties.getProperty(SCRIPT_PROPERTY_KEYS.setupAt)
  };
}

// ===== Errors.gs =====
class AppError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'AppError';
    this.code = code || 'INTERNAL_ERROR';
    this.details = details || null;
  }
}

function normalizeError_(error) {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  return {
    code: 'INTERNAL_ERROR',
    message: 'ระบบเกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง',
    details: null
  };
}

// ===== Utils.gs =====
function nowIso_() {
  return Utilities.formatDate(new Date(), APP_CONFIG.timeZone, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function createId_(prefix) {
  const stamp = Utilities.formatDate(new Date(), APP_CONFIG.timeZone, 'yyyyMMddHHmmssSSS');
  const random = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  return String(prefix || 'ID').toUpperCase() + '_' + stamp + '_' + random;
}

function createRequestId_(provided) {
  const value = String(provided || '').trim();
  return value || createId_('REQ');
}

function parseJsonBody_(event) {
  const raw = event && event.postData && event.postData.contents;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('Body must be an object');
    }
    return parsed;
  } catch (error) {
    throw new AppError('INVALID_REQUEST', 'ข้อมูล JSON ไม่ถูกต้อง');
  }
}

function normalizeAction_(value) {
  return String(value || '').trim().toLowerCase();
}

function safeJsonStringify_(value) {
  try {
    return JSON.stringify(value === undefined ? null : value);
  } catch (error) {
    return JSON.stringify({ serializationError: true });
  }
}

function toBoolean_(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  return ['true', '1', 'yes', 'y'].indexOf(normalized) >= 0;
}

function toNumber_(value, fallback) {
  if (value === '' || value === null || value === undefined) return fallback === undefined ? null : fallback;
  const number = Number(String(value).replace(/,/g, '').trim());
  return isFinite(number) ? number : (fallback === undefined ? null : fallback);
}

function cleanText_(value) {
  const text = String(value === null || value === undefined ? '' : value).trim();
  return text || null;
}

function normalizeName_(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[.,()\-_/]/g, '');
}

function dateKey_(value) {
  if (!value) return '';
  if (value instanceof Date) return Utilities.formatDate(value, APP_CONFIG.timeZone, 'yyyy-MM-dd');
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[0] : text;
}

function sha256Hex_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ''), Utilities.Charset.UTF_8);
  return bytes.map(function (byte) {
    const normalized = byte < 0 ? byte + 256 : byte;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('');
}

function sanitizeFilePart_(value) {
  return String(value || 'unknown').trim().replace(/[^a-zA-Z0-9ก-๙_-]+/g, '-').slice(0, 50) || 'unknown';
}

// ===== Database.gs =====
function getSpreadsheet_() {
  if (runtimeSpreadsheetCache_) return runtimeSpreadsheetCache_;
  const config = getRuntimeConfig_();
  if (!config.spreadsheetId) {
    throw new AppError('NOT_CONFIGURED', 'ยังไม่ได้กำหนด Spreadsheet ID');
  }
  runtimeSpreadsheetCache_ = SpreadsheetApp.openById(config.spreadsheetId);
  return runtimeSpreadsheetCache_;
}

function getSheetOrThrow_(sheetName) {
  if (runtimeSheetCache_[sheetName]) return runtimeSheetCache_[sheetName];
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) {
    throw new AppError('SHEET_NOT_FOUND', 'ไม่พบชีต ' + sheetName, { sheetName: sheetName });
  }
  runtimeSheetCache_[sheetName] = sheet;
  return sheet;
}

function readHeaders_(sheet) {
  const cacheKey = String(sheet.getSheetId());
  if (runtimeHeaderCache_[cacheKey]) return runtimeHeaderCache_[cacheKey];
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) return [];
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function (value) {
    return String(value || '').trim();
  });
  runtimeHeaderCache_[cacheKey] = headers;
  return headers;
}

function validateHeaders_(actual, expected) {
  const missing = expected.filter(function (header) { return actual.indexOf(header) < 0; });
  const unexpected = actual.filter(function (header) { return header && expected.indexOf(header) < 0; });
  return { valid: missing.length === 0 && unexpected.length === 0, missing: missing, unexpected: unexpected };
}

function validateDatabaseSchema_() {
  const spreadsheet = getSpreadsheet_();
  const results = {};
  let valid = true;
  Object.keys(APP_CONFIG.requiredSheets).forEach(function (sheetName) {
    const expected = APP_CONFIG.requiredSheets[sheetName];
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      valid = false;
      results[sheetName] = { valid: false, missingSheet: true, missing: expected, unexpected: [] };
      return;
    }
    const result = validateHeaders_(readHeaders_(sheet), expected);
    results[sheetName] = result;
    if (!result.valid) valid = false;
  });
  return {
    valid: valid,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetName: spreadsheet.getName(),
    sheets: results
  };
}

function readSettings_() {
  if (runtimeSettingsCache_) return runtimeSettingsCache_;
  const sheet = getSheetOrThrow_(APP_CONFIG.settingsSheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};
  const rows = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  runtimeSettingsCache_ = rows.reduce(function (settings, row) {
    const key = String(row[0] || '').trim();
    if (key) settings[key] = row[1];
    return settings;
  }, {});
  return runtimeSettingsCache_;
}

function appendObjectRow_(sheetName, record) {
  appendObjectRows_(sheetName, [record]);
  return record;
}

function appendObjectRows_(sheetName, records) {
  if (!records || !records.length) return records || [];
  const sheet = getSheetOrThrow_(sheetName);
  const headers = readHeaders_(sheet);
  const rows = records.map(function (record) {
    return headers.map(function (header) {
      const value = Object.prototype.hasOwnProperty.call(record, header) ? record[header] : '';
      if (value && typeof value === 'object' && !(value instanceof Date)) return safeJsonStringify_(value);
      return value === undefined || value === null ? '' : value;
    });
  });
  const lock = LockService.getScriptLock();
  const ownsLock = !runtimeWriteLockHeld_;
  if (ownsLock) {
    lock.waitLock(10000);
    runtimeWriteLockHeld_ = true;
  }
  try {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  } finally {
    if (ownsLock) {
      runtimeWriteLockHeld_ = false;
      lock.releaseLock();
    }
  }
  return records;
}

function readSheetObjects_(sheetName) {
  const sheet = getSheetOrThrow_(sheetName);
  const lastRow = sheet.getLastRow();
  const headers = readHeaders_(sheet);
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, headers.length).getValues().map(function (row, index) {
    const object = { __rowNumber: index + 2 };
    headers.forEach(function (header, column) { object[header] = row[column]; });
    return object;
  });
}

function findObjectById_(sheetName, idHeader, id) {
  const target = String(id || '');
  return readSheetObjects_(sheetName).filter(function (record) {
    return String(record[idHeader] || '') === target;
  })[0] || null;
}

function updateObjectRow_(sheetName, rowNumber, record) {
  const sheet = getSheetOrThrow_(sheetName);
  const headers = readHeaders_(sheet);
  const values = headers.map(function (header) {
    const value = Object.prototype.hasOwnProperty.call(record, header) ? record[header] : '';
    if (value && typeof value === 'object' && !(value instanceof Date)) return safeJsonStringify_(value);
    return value === null || value === undefined ? '' : value;
  });
  sheet.getRange(rowNumber, 1, 1, values.length).setValues([values]);
  return record;
}

function appendAudit_(saleId, action, changedFields, requestId) {
  return appendObjectRow_('AuditTrail', {
    AuditID: createId_('AUD'),
    SaleID: saleId || '',
    Action: action,
    ChangedFieldsJSON: changedFields || {},
    Actor: 'OWNER',
    Timestamp: nowIso_(),
    RequestID: requestId || ''
  });
}

function replaceDeductions_(saleId, deductions) {
  const sheet = getSheetOrThrow_('Deductions');
  const rows = readSheetObjects_('Deductions').filter(function (row) { return row.SaleID === saleId; })
    .sort(function (a, b) { return b.__rowNumber - a.__rowNumber; });
  rows.forEach(function (row) { sheet.deleteRow(row.__rowNumber); });
  const timestamp = nowIso_();
  const records = (deductions || []).map(function (deduction, index) {
    return {
      DeductionID: createId_('DED'), SaleID: saleId, SortOrder: index + 1,
      DeductionType: deduction.type || 'OTHER', Description: deduction.description || '',
      Quantity: toNumber_(deduction.quantity, 0), Unit: deduction.unit || '', Rate: toNumber_(deduction.rate, 0),
      Amount: toNumber_(deduction.amount, 0), CreatedAt: timestamp, UpdatedAt: timestamp
    };
  });
  appendObjectRows_('Deductions', records);
}

function getIdempotentSale_(requestId) {
  if (!requestId) return null;
  const cache = CacheService.getScriptCache();
  const cacheKey = 'sale-idem-' + sha256Hex_(requestId).slice(0, 48);
  const cachedSaleId = cache.get(cacheKey);
  if (cachedSaleId) {
    const cached = findObjectById_('Sales', 'SaleID', cachedSaleId);
    if (cached) return cached;
  }
  const audits = readSheetObjects_('AuditTrail').filter(function (row) {
    return row.Action === 'CREATE' && String(row.RequestID || '') === String(requestId);
  });
  const salesById = {};
  readSheetObjects_('Sales').forEach(function (row) { salesById[String(row.SaleID)] = row; });
  for (let index = audits.length - 1; index >= 0; index -= 1) {
    const sale = salesById[String(audits[index].SaleID)] || null;
    if (sale) {
      cache.put(cacheKey, String(sale.SaleID), 21600);
      return sale;
    }
  }
  return null;
}

function rememberIdempotentSale_(requestId, saleId) {
  if (!requestId || !saleId) return;
  CacheService.getScriptCache().put('sale-idem-' + sha256Hex_(requestId).slice(0, 48), String(saleId), 21600);
}

// ===== DriveService.gs =====
function ensureReceiptsFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const existingId = properties.getProperty(SCRIPT_PROPERTY_KEYS.receiptsFolderId);
  if (existingId) {
    try {
      return DriveApp.getFolderById(existingId);
    } catch (error) {
      properties.deleteProperty(SCRIPT_PROPERTY_KEYS.receiptsFolderId);
    }
  }
  const config = getRuntimeConfig_();
  if (!config.projectFolderId) {
    throw new AppError('NOT_CONFIGURED', 'ยังไม่ได้กำหนด Project Folder ID');
  }
  const projectFolder = DriveApp.getFolderById(config.projectFolderId);
  const matches = projectFolder.getFoldersByName(APP_CONFIG.receiptsFolderName);
  const receiptsFolder = matches.hasNext() ? matches.next() : projectFolder.createFolder(APP_CONFIG.receiptsFolderName);
  properties.setProperty(SCRIPT_PROPERTY_KEYS.receiptsFolderId, receiptsFolder.getId());
  return receiptsFolder;
}

function ensureMonthlyReceiptFolder_(date) {
  const target = date || new Date();
  const root = ensureReceiptsFolder_();
  const yearName = Utilities.formatDate(target, APP_CONFIG.timeZone, 'yyyy');
  const monthName = Utilities.formatDate(target, APP_CONFIG.timeZone, 'MM');
  const yearFolder = getOrCreateChildFolder_(root, yearName);
  return getOrCreateChildFolder_(yearFolder, monthName);
}

function getOrCreateChildFolder_(parent, name) {
  const iterator = parent.getFoldersByName(name);
  return iterator.hasNext() ? iterator.next() : parent.createFolder(name);
}

function saveReceiptImage_(image, saleId, saleDate, receiptNumber) {
  if (!image || !image.base64) return null;
  const validated = validateImage_(image);
  const bytes = Utilities.base64Decode(validated.base64);
  const blob = Utilities.newBlob(bytes, validated.mimeType);
  const extension = validated.mimeType === 'image/png' ? 'png' : validated.mimeType === 'image/webp' ? 'webp' : 'jpg';
  const date = saleDate ? new Date(String(saleDate) + 'T12:00:00+07:00') : new Date();
  const name = 'PALM_' + Utilities.formatDate(date, APP_CONFIG.timeZone, 'yyyyMMdd') + '_' +
    sanitizeFilePart_(receiptNumber) + '_' + sanitizeFilePart_(saleId) + '.' + extension;
  const folder = ensureMonthlyReceiptFolder_(date);
  const file = folder.createFile(blob.setName(name));
  return {
    file: file,
    id: file.getId(),
    name: name,
    mimeType: validated.mimeType,
    bytes: bytes.length,
    sha256: image.sha256 || sha256Hex_(validated.base64),
    url: file.getUrl()
  };
}

function validateImage_(image) {
  const mimeType = String(image && image.mimeType || '').toLowerCase();
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(mimeType) < 0) {
    throw new AppError('INVALID_IMAGE', 'รองรับเฉพาะรูป JPEG, PNG และ WebP');
  }
  const base64 = String(image.base64 || '').replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  const estimatedBytes = Math.floor(base64.length * 3 / 4);
  if (!base64 || estimatedBytes < 100) throw new AppError('INVALID_IMAGE', 'ไม่พบข้อมูลรูปภาพ');
  if (estimatedBytes > APP_CONFIG.maxImageBytes) {
    throw new AppError('IMAGE_TOO_LARGE', 'รูปภาพมีขนาดเกิน 6.5 MB', { bytes: estimatedBytes });
  }
  return { mimeType: mimeType, base64: base64, bytes: estimatedBytes };
}

// ===== Response.gs =====
function apiSuccess_(data, requestId) {
  return {
    ok: true,
    data: data === undefined ? null : data,
    error: null,
    meta: { requestId: requestId, version: APP_CONFIG.apiVersion, timestamp: nowIso_() }
  };
}

function apiFailure_(error, requestId) {
  return {
    ok: false,
    data: null,
    error: normalizeError_(error),
    meta: { requestId: requestId, version: APP_CONFIG.apiVersion, timestamp: nowIso_() }
  };
}

function jsonOutput_(payload) {
  return ContentService.createTextOutput(safeJsonStringify_(payload)).setMimeType(ContentService.MimeType.JSON);
}

// ===== LogService.gs =====
function logEvent_(level, action, options) {
  const details = options || {};
  const record = {
    LogID: createId_('LOG'),
    RequestID: details.requestId || '',
    Level: String(level || 'INFO').toUpperCase(),
    Action: action || '',
    SaleID: details.saleId || '',
    Description: details.description || '',
    ErrorCode: details.errorCode || '',
    DurationMs: details.durationMs || 0,
    Timestamp: nowIso_()
  };
  try {
    appendObjectRow_(APP_CONFIG.logSheet, record);
  } catch (error) {
    console.error('Unable to write application log', safeJsonStringify_({ action: action, error: error && error.message }));
  }
  return record;
}

// ===== AuthService.gs =====
function setupV1() {
  const foundation = setupProject();
  const token = 'PALM-' + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  PropertiesService.getScriptProperties().setProperty(SCRIPT_PROPERTY_KEYS.accessTokenHash, sha256Hex_(token));
  const result = {
    ok: true,
    version: APP_CONFIG.version,
    accessToken: token,
    message: 'คัดลอก accessToken นี้ไปใส่ในหน้าแอป ระบบจะไม่แสดง token เดิมอีก',
    setup: foundation
  };
  console.log(safeJsonStringify_(result));
  return result;
}

function rotateAccessToken() {
  const token = 'PALM-' + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  PropertiesService.getScriptProperties().setProperty(SCRIPT_PROPERTY_KEYS.accessTokenHash, sha256Hex_(token));
  const result = { ok: true, accessToken: token, rotatedAt: nowIso_() };
  console.log(safeJsonStringify_(result));
  return result;
}

function requireAccessToken_(payload) {
  const expected = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_KEYS.accessTokenHash);
  if (!expected) throw new AppError('SETUP_REQUIRED', 'กรุณารัน setupV1() ใน Apps Script ก่อนใช้งานแอป');
  const token = String(payload && (payload.accessToken || payload.sessionToken) || '');
  if (!token || sha256Hex_(token) !== expected) throw new AppError('UNAUTHORIZED', 'รหัสเชื่อมต่อแอปไม่ถูกต้อง');
  return true;
}

// ===== GeminiService.gs =====
function analyzeReceipt_(payload, requestId) {
  const startedAt = Date.now();
  const image = validateImage_(payload.image || {});
  const settings = readSettings_();
  const model = String(settings.GEMINI_MODEL || 'gemini-3.6-flash');
  const schemaVersion = String(settings.GEMINI_SCHEMA_VERSION || '1.0.0');
  const ocrRunId = createId_('OCR');
  try {
    const extracted = callGeminiReceipt_(image, model, schemaVersion);
    const normalized = normalizeReceipt_(extracted);
    const validation = validateSaleDraft_(normalized, false);
    appendObjectRow_('OCRRuns', {
      OCRRunID: ocrRunId,
      RequestID: requestId,
      ImageSha256: payload.image && payload.image.sha256 || sha256Hex_(image.base64),
      Model: model,
      SchemaVersion: schemaVersion,
      Status: normalized.overallConfidence < Number(settings.LOW_CONFIDENCE_THRESHOLD || 0.75) ? 'LOW_CONFIDENCE' : 'SUCCESS',
      OverallConfidence: normalized.overallConfidence,
      MissingFieldsJSON: normalized.missingFields,
      WarningsJSON: validation.warnings.concat(normalized.warnings || []),
      ExtractedJSON: normalized,
      DurationMs: Date.now() - startedAt,
      ErrorCode: '',
      CreatedAt: nowIso_()
    });
    const lowConfidenceFields = getLowConfidenceFields_(normalized, Number(settings.LOW_CONFIDENCE_THRESHOLD || 0.75));
    if (validation.warnings.some(function (item) { return item.code === 'DATE_OUTLIER'; }) && lowConfidenceFields.indexOf('saleDate') < 0) {
      lowConfidenceFields.push('saleDate');
    }
    return {
      ocrRunId: ocrRunId,
      model: model,
      schemaVersion: schemaVersion,
      receipt: normalized,
      validation: validation,
      lowConfidenceFields: lowConfidenceFields,
      // Duplicate checking is repeated during save, where it is authoritative.
      // Skipping the extra full Sales-sheet scan makes OCR return sooner.
      duplicateCandidates: [],
      durationMs: Date.now() - startedAt
    };
  } catch (error) {
    try {
      appendObjectRow_('OCRRuns', {
        OCRRunID: ocrRunId,
        RequestID: requestId,
        ImageSha256: payload.image && payload.image.sha256 || '',
        Model: model,
        SchemaVersion: schemaVersion,
        Status: 'FAILED',
        OverallConfidence: 0,
        MissingFieldsJSON: [],
        WarningsJSON: [],
        ExtractedJSON: {},
        DurationMs: Date.now() - startedAt,
        ErrorCode: error instanceof AppError ? error.code : 'OCR_FAILED',
        CreatedAt: nowIso_()
      });
    } catch (logError) {
      console.error('Unable to record failed OCR run', logError && logError.message);
    }
    if (error instanceof AppError) throw error;
    throw new AppError('OCR_FAILED', 'Gemini อ่านใบชั่งไม่สำเร็จ', { message: error && error.message });
  }
}

function callGeminiReceipt_(image, model, schemaVersion) {
  const apiKey = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_KEYS.geminiApiKey);
  if (!apiKey) throw new AppError('NOT_CONFIGURED', 'ไม่พบ GEMINI_API_KEY');
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey);
  const prompt = [
    'คุณคือระบบอ่านใบชั่งขายผลปาล์มน้ำมันของประเทศไทย',
    'อ่านข้อความพิมพ์ ลายมือ และตัวเลขจากภาพอย่างระมัดระวัง',
    'ห้ามเดาตัวเลข หากอ่านไม่ได้ให้คืน null และเพิ่มชื่อ field ใน missingFields',
    'วันที่ปัจจุบันคือ ' + Utilities.formatDate(new Date(), APP_CONFIG.timeZone, 'yyyy-MM-dd'),
    'วันที่ใช้ ค.ศ. รูปแบบ YYYY-MM-DD; หากบนเอกสารเป็น พ.ศ. ให้ลบ 543',
    'ถ้าตัวเลขปีเบลอหรืออ่านไม่ชัด ห้ามเดาปี ให้คืน saleDate เป็น null และระบุ saleDate ใน missingFields',
    'น้ำหนักเป็นกิโลกรัม เงินเป็นบาท และตัวเลขต้องไม่มี comma',
    'grossWeightKg คือ น้ำหนักเข้า/น้ำหนักรวม, tareWeightKg คือ น้ำหนักออก/น้ำหนักรถเปล่า',
    'netWeightKg ควรเท่ากับ grossWeightKg - tareWeightKg เมื่อเอกสารรองรับ',
    'ตอบ JSON ตาม schema เท่านั้น schemaVersion=' + schemaVersion
  ].join('\n');
  const body = {
    contents: [{ role: 'user', parts: [
      { text: prompt },
      { inlineData: { mimeType: image.mimeType, data: image.base64 } }
    ] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      responseJsonSchema: getGeminiReceiptJsonSchema_()
    }
  };
  const response = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  let data;
  try { data = JSON.parse(response.getContentText() || '{}'); } catch (ignore) { data = {}; }
  if (status < 200 || status >= 300) {
    const message = data && data.error && data.error.message || 'HTTP ' + status;
    throw new AppError(status === 429 ? 'RATE_LIMITED' : 'OCR_FAILED', 'Gemini API: ' + message);
  }
  const parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts || [];
  const jsonText = parts.map(function (part) { return part.text || ''; }).join('').trim();
  if (!jsonText) throw new AppError('OCR_FAILED', 'Gemini ไม่ได้ส่งข้อมูล JSON กลับมา');
  try { return JSON.parse(jsonText.replace(/^```json\s*/i, '').replace(/```$/, '').trim()); }
  catch (error) { throw new AppError('OCR_FAILED', 'อ่าน JSON จาก Gemini ไม่สำเร็จ'); }
}

function getGeminiReceiptJsonSchema_() {
  const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };
  const nullableNumber = { anyOf: [{ type: 'number' }, { type: 'null' }] };
  return {
    type: 'object', additionalProperties: false,
    properties: {
      schemaVersion: { type: 'string' }, documentType: { type: 'string', enum: ['PALM_WEIGHING_RECEIPT', 'UNKNOWN'] },
      receiptNumber: nullableString, saleDate: nullableString, timeIn: nullableString, timeOut: nullableString,
      buyerName: nullableString, branch: nullableString, customerCode: nullableString, customerName: nullableString,
      vehiclePlate: nullableString, productCode: nullableString, productName: nullableString,
      grossWeightKg: nullableNumber, tareWeightKg: nullableNumber, netWeightKg: nullableNumber,
      deductionWeightKg: nullableNumber, payableWeightKg: nullableNumber, pricePerKg: nullableNumber,
      grossAmount: nullableNumber, totalDeduction: nullableNumber, netAmount: nullableNumber,
      deductions: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
        type: { type: 'string' }, description: nullableString, quantity: nullableNumber,
        unit: nullableString, rate: nullableNumber, amount: nullableNumber
      }, required: ['type', 'description', 'quantity', 'unit', 'rate', 'amount'] } },
      notes: nullableString, handwrittenNotes: nullableString,
      overallConfidence: { type: 'number', minimum: 0, maximum: 1 },
      fieldConfidence: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
        field: { type: 'string' }, confidence: { type: 'number', minimum: 0, maximum: 1 }, evidence: nullableString
      }, required: ['field', 'confidence', 'evidence'] } },
      missingFields: { type: 'array', items: { type: 'string' } },
      warnings: { type: 'array', items: { type: 'string' } },
      imageIssues: { type: 'array', items: { type: 'string' } }
    },
    required: ['schemaVersion', 'documentType', 'receiptNumber', 'saleDate', 'timeIn', 'timeOut', 'buyerName',
      'branch', 'customerCode', 'customerName', 'vehiclePlate', 'productCode', 'productName', 'grossWeightKg',
      'tareWeightKg', 'netWeightKg', 'deductionWeightKg', 'payableWeightKg', 'pricePerKg', 'grossAmount',
      'totalDeduction', 'netAmount', 'deductions', 'notes', 'handwrittenNotes', 'overallConfidence',
      'fieldConfidence', 'missingFields', 'warnings', 'imageIssues']
  };
}

function normalizeReceipt_(input) {
  const data = input || {};
  const receipt = {
    schemaVersion: cleanText_(data.schemaVersion) || '1.0.0',
    documentType: cleanText_(data.documentType) || 'UNKNOWN',
    receiptNumber: cleanText_(data.receiptNumber), saleDate: cleanText_(data.saleDate),
    timeIn: cleanText_(data.timeIn), timeOut: cleanText_(data.timeOut), buyerName: cleanText_(data.buyerName),
    branch: cleanText_(data.branch), customerCode: cleanText_(data.customerCode), customerName: cleanText_(data.customerName),
    vehiclePlate: cleanText_(data.vehiclePlate), productCode: cleanText_(data.productCode),
    productName: cleanText_(data.productName) || 'ทะลายปาล์มน้ำมัน',
    grossWeightKg: toNumber_(data.grossWeightKg), tareWeightKg: toNumber_(data.tareWeightKg),
    netWeightKg: toNumber_(data.netWeightKg), deductionWeightKg: toNumber_(data.deductionWeightKg, 0),
    payableWeightKg: toNumber_(data.payableWeightKg), pricePerKg: toNumber_(data.pricePerKg),
    grossAmount: toNumber_(data.grossAmount), totalDeduction: toNumber_(data.totalDeduction, 0),
    netAmount: toNumber_(data.netAmount), deductions: Array.isArray(data.deductions) ? data.deductions : [],
    notes: cleanText_(data.notes), handwrittenNotes: cleanText_(data.handwrittenNotes),
    overallConfidence: Math.max(0, Math.min(1, toNumber_(data.overallConfidence, 0))),
    fieldConfidence: Array.isArray(data.fieldConfidence) ? data.fieldConfidence : [],
    missingFields: Array.isArray(data.missingFields) ? data.missingFields : [],
    warnings: Array.isArray(data.warnings) ? data.warnings : [], imageIssues: Array.isArray(data.imageIssues) ? data.imageIssues : []
  };
  if (receipt.payableWeightKg === null) receipt.payableWeightKg = receipt.netWeightKg;
  if (receipt.grossAmount === null && receipt.payableWeightKg !== null && receipt.pricePerKg !== null) {
    receipt.grossAmount = Math.round(receipt.payableWeightKg * receipt.pricePerKg * 100) / 100;
  }
  if (receipt.netAmount === null && receipt.grossAmount !== null) {
    receipt.netAmount = Math.round((receipt.grossAmount - receipt.totalDeduction) * 100) / 100;
  }
  return receipt;
}

function getLowConfidenceFields_(receipt, threshold) {
  return (receipt.fieldConfidence || []).filter(function (item) {
    return toNumber_(item.confidence, 0) < threshold;
  }).map(function (item) { return item.field; });
}

function testGeminiReceiptFromDrive() {
  const fileId = '1HKzfIuDwKRH7nv_4tTALv1g-loWlW5s3';
  const file = DriveApp.getFileById(fileId);
  const blob = file.getBlob();
  const result = analyzeReceipt_({ image: {
    mimeType: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()), sha256: sha256Hex_(Utilities.base64Encode(blob.getBytes()))
  } }, createId_('TEST'));
  console.log(safeJsonStringify_(result));
  return result;
}

// ===== ValidationService.gs =====
function validateSaleDraft_(sale, strict) {
  const settings = readSettings_();
  const weightTolerance = Number(settings.WEIGHT_TOLERANCE_KG || 1);
  const moneyTolerance = Number(settings.MONEY_TOLERANCE_THB || 1);
  const errors = [];
  const warnings = [];
  function error(code, field, message) { errors.push({ code: code, field: field, message: message }); }
  function warn(code, field, message) { warnings.push({ code: code, field: field, message: message }); }
  if (strict && !sale.saleDate) error('REQUIRED', 'saleDate', 'กรุณาระบุวันที่ขาย');
  if (strict && !(sale.netWeightKg > 0 || sale.payableWeightKg > 0)) error('INVALID_WEIGHT', 'netWeightKg', 'น้ำหนักสุทธิต้องมากกว่า 0');
  if (strict && !(sale.pricePerKg > 0)) error('INVALID_AMOUNT', 'pricePerKg', 'ราคาต่อกิโลกรัมต้องมากกว่า 0');
  if (sale.saleDate) {
    const saleYear = Number(String(sale.saleDate).slice(0, 4));
    const currentYear = Number(Utilities.formatDate(new Date(), APP_CONFIG.timeZone, 'yyyy'));
    if (saleYear && Math.abs(currentYear - saleYear) > 3) {
      warn('DATE_OUTLIER', 'saleDate', 'วันที่ขายเป็นปี ' + saleYear + ' ซึ่งห่างจากปีปัจจุบัน กรุณาตรวจสอบปีบนใบชั่ง');
    }
  }
  if (sale.grossWeightKg !== null && sale.tareWeightKg !== null) {
    if (sale.grossWeightKg <= sale.tareWeightKg) error('INVALID_WEIGHT', 'grossWeightKg', 'น้ำหนักเข้าต้องมากกว่าน้ำหนักออก');
    if (sale.netWeightKg !== null && Math.abs((sale.grossWeightKg - sale.tareWeightKg) - sale.netWeightKg) > weightTolerance) {
      warn('WEIGHT_MISMATCH', 'netWeightKg', 'น้ำหนักเข้า - น้ำหนักออก ไม่ตรงกับน้ำหนักสุทธิ');
    }
  }
  const payable = sale.payableWeightKg !== null ? sale.payableWeightKg : sale.netWeightKg;
  if (payable !== null && sale.pricePerKg !== null && sale.grossAmount !== null &&
      Math.abs(payable * sale.pricePerKg - sale.grossAmount) > moneyTolerance) {
    warn('GROSS_AMOUNT_MISMATCH', 'grossAmount', 'น้ำหนักที่คิดเงิน × ราคา ไม่ตรงกับยอดก่อนหัก');
  }
  if (sale.grossAmount !== null && sale.netAmount !== null &&
      Math.abs((sale.grossAmount - (sale.totalDeduction || 0)) - sale.netAmount) > moneyTolerance) {
    warn('NET_AMOUNT_MISMATCH', 'netAmount', 'ยอดก่อนหัก - ยอดหัก ไม่ตรงกับยอดรับสุทธิ');
  }
  if (sale.netAmount !== null && sale.netAmount < 0) error('INVALID_AMOUNT', 'netAmount', 'ยอดรับสุทธิติดลบไม่ได้');
  return { valid: errors.length === 0, errors: errors, warnings: warnings };
}

// ===== DuplicateService.gs =====
function findDuplicateCandidates_(sale, imageSha256) {
  const settings = readSettings_();
  const warnScore = Number(settings.DUPLICATE_WARN_SCORE || 0.7);
  return readSheetObjects_('Sales').filter(function (row) { return row.RecordStatus !== 'VOID'; }).map(function (row) {
    let score = 0;
    const reasons = [];
    if (imageSha256 && String(row.ImageSha256 || '') === String(imageSha256)) { score = 1; reasons.push('รูปภาพตรงกัน'); }
    else {
      if (sale.receiptNumber && normalizeName_(row.ReceiptNumber) === normalizeName_(sale.receiptNumber)) { score += 0.35; reasons.push('เลขที่ใบชั่งตรงกัน'); }
      if (sale.saleDate && dateKey_(row.SaleDate) === dateKey_(sale.saleDate)) { score += 0.2; reasons.push('วันที่ตรงกัน'); }
      if (sale.buyerName && normalizeName_(row.BuyerNameRaw) === normalizeName_(sale.buyerName)) { score += 0.15; reasons.push('ลานรับซื้อตรงกัน'); }
      const net = sale.payableWeightKg !== null ? sale.payableWeightKg : sale.netWeightKg;
      const rowNet = toNumber_(row.PayableWeightKg, toNumber_(row.NetWeightKg));
      if (net !== null && rowNet !== null && Math.abs(net - rowNet) <= 1) { score += 0.15; reasons.push('น้ำหนักใกล้กัน'); }
      if (sale.netAmount !== null && toNumber_(row.NetAmount) !== null && Math.abs(sale.netAmount - toNumber_(row.NetAmount)) <= 1) {
        score += 0.15; reasons.push('ยอดเงินใกล้กัน');
      }
    }
    return { saleId: row.SaleID, score: Math.min(1, Math.round(score * 100) / 100), reasons: reasons,
      saleDate: dateKey_(row.SaleDate), receiptNumber: row.ReceiptNumber, buyerName: row.BuyerNameRaw,
      netWeightKg: toNumber_(row.NetWeightKg), netAmount: toNumber_(row.NetAmount) };
  }).filter(function (candidate) { return candidate.score >= warnScore; })
    .sort(function (a, b) { return b.score - a.score; }).slice(0, 5);
}

// ===== BuyersService.gs =====
function listBuyers_() {
  return readSheetObjects_('Buyers').filter(function (row) { return row.Active !== false && String(row.Active).toUpperCase() !== 'FALSE'; })
    .map(stripInternalFields_);
}

function ensureBuyer_(sale) {
  if (!sale.buyerName) return '';
  const normalized = normalizeName_(sale.buyerName + ' ' + (sale.branch || ''));
  const existing = readSheetObjects_('Buyers').filter(function (row) { return row.NormalizedName === normalized; })[0];
  if (existing) return existing.BuyerID;
  const id = createId_('BUY');
  appendObjectRow_('Buyers', {
    BuyerID: id, BuyerName: sale.buyerName, NormalizedName: normalized, Branch: sale.branch || '',
    Address: '', Phone: '', Notes: '', Active: true, CreatedAt: nowIso_(), UpdatedAt: nowIso_()
  });
  return id;
}

function stripInternalFields_(row) {
  const output = {};
  Object.keys(row || {}).forEach(function (key) { if (key.indexOf('__') !== 0) output[key] = row[key]; });
  return output;
}

// ===== SalesService.gs =====
function createSale_(payload, requestId) {
  const sale = normalizeReceipt_(payload.sale || payload.receipt || {});
  const validation = validateSaleDraft_(sale, true);
  if (!validation.valid) throw new AppError(validation.errors[0].code, validation.errors[0].message, validation);
  const idempotencyKey = String(payload.idempotencyKey || requestId);
  const existing = getIdempotentSale_(idempotencyKey);
  if (existing) return { created: false, idempotent: true, sale: stripInternalFields_(existing) };
  const duplicateCandidates = findDuplicateCandidates_(sale, payload.image && payload.image.sha256);
  const blockScore = Number(readSettings_().DUPLICATE_BLOCK_SCORE || 0.9);
  const saleId = createId_('SALE');
  let storedImage = null;
  const saveWarnings = validation.warnings.slice();
  if (payload.image && payload.image.base64) {
    try {
      storedImage = saveReceiptImage_(payload.image, saleId, sale.saleDate, sale.receiptNumber);
    } catch (imageError) {
      // The sale data is more important than the receipt image. Keep saving and
      // make the missing image explicit instead of losing the whole record.
      saveWarnings.push({ code: 'IMAGE_SAVE_FAILED', field: 'image', message: 'บันทึกข้อมูลแล้ว แต่ยังเก็บรูปลง Drive ไม่สำเร็จ' });
      console.error('Receipt image save failed', imageError && imageError.message);
    }
  }
  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); }
  catch (lockError) {
    if (storedImage && storedImage.file) { try { storedImage.file.setTrashed(true); } catch (ignore) {} }
    throw new AppError('RATE_LIMITED', 'ระบบกำลังบันทึกรายการอื่นอยู่ รายการนี้จะลองใหม่อัตโนมัติ');
  }
  runtimeWriteLockHeld_ = true;
  let committed = false;
  try {
    // Recheck after taking the lock: another request may have completed while
    // this request was uploading the image.
    const raced = getIdempotentSale_(idempotencyKey);
    if (raced) {
      if (storedImage && storedImage.file) { try { storedImage.file.setTrashed(true); } catch (ignore) {} }
      return { created: false, idempotent: true, sale: stripInternalFields_(raced) };
    }
    if (duplicateCandidates.length && duplicateCandidates[0].score >= blockScore && !toBoolean_(payload.duplicateOverride)) {
      throw new AppError('DUPLICATE_SUSPECTED', 'พบใบชั่งที่คล้ายกับรายการเดิม', { candidates: duplicateCandidates });
    }
    let buyerId = '';
    try { buyerId = ensureBuyer_(sale); }
    catch (buyerError) {
      saveWarnings.push({ code: 'BUYER_LINK_FAILED', field: 'buyerName', message: 'บันทึกรายการแล้ว แต่ยังเชื่อมประวัติลานรับซื้อไม่สำเร็จ' });
      console.error('Buyer link failed', buyerError && buyerError.message);
    }
    const timestamp = nowIso_();
    const topDuplicate = duplicateCandidates[0] || null;
    const record = {
      SaleID: saleId, RecordStatus: 'ACTIVE', ReceiptNumber: sale.receiptNumber || '', SaleDate: sale.saleDate || '',
      TimeIn: sale.timeIn || '', TimeOut: sale.timeOut || '', BuyerID: buyerId, BuyerNameRaw: sale.buyerName || '',
      BranchRaw: sale.branch || '', CustomerCode: sale.customerCode || '', CustomerName: sale.customerName || '',
      VehiclePlate: sale.vehiclePlate || '', ProductCode: sale.productCode || '', ProductName: sale.productName || '',
      GrossWeightKg: sale.grossWeightKg, TareWeightKg: sale.tareWeightKg, NetWeightKg: sale.netWeightKg,
      DeductionWeightKg: sale.deductionWeightKg || 0, PayableWeightKg: sale.payableWeightKg,
      PricePerKg: sale.pricePerKg, GrossAmount: sale.grossAmount, TotalDeduction: sale.totalDeduction || 0,
      NetAmount: sale.netAmount, Currency: 'THB', Notes: sale.notes || '', HandwrittenNotes: sale.handwrittenNotes || '',
      ImageFileID: storedImage ? storedImage.id : '', ImageName: storedImage ? storedImage.name : '',
      ImageSha256: storedImage ? storedImage.sha256 : (payload.image && payload.image.sha256 || ''),
      ImageMimeType: storedImage ? storedImage.mimeType : (payload.image && payload.image.mimeType || ''),
      ImageBytes: storedImage ? storedImage.bytes : (payload.image && payload.image.bytes || 0), OCRRunID: payload.ocrRunId || '',
      OCRStatus: payload.ocrRunId ? 'REVIEWED' : 'MANUAL', ConfidenceOverall: sale.overallConfidence || 0,
      AIModel: payload.model || readSettings_().GEMINI_MODEL || '', Source: payload.source || 'MANUAL',
      DuplicateScore: topDuplicate ? topDuplicate.score : 0, DuplicateOfSaleID: topDuplicate ? topDuplicate.saleId : '',
      DuplicateOverride: toBoolean_(payload.duplicateOverride), CreatedAt: timestamp, UpdatedAt: timestamp
    };
    // Write the idempotency marker immediately before the sale. If the client
    // connection drops after the sale write, sales.status can still prove that
    // the record was saved and prevent a duplicate retry.
    appendAudit_(saleId, 'CREATE', { sale: record, warnings: saveWarnings }, idempotencyKey);
    appendObjectRow_('Sales', record);
    rememberIdempotentSale_(idempotencyKey, saleId);
    committed = true;
    const deductionRecords = (sale.deductions || []).map(function (deduction, index) {
      return {
        DeductionID: createId_('DED'), SaleID: saleId, SortOrder: index + 1,
        DeductionType: deduction.type || 'OTHER', Description: deduction.description || '',
        Quantity: toNumber_(deduction.quantity, 0), Unit: deduction.unit || '', Rate: toNumber_(deduction.rate, 0),
        Amount: toNumber_(deduction.amount, 0), CreatedAt: timestamp, UpdatedAt: timestamp
      };
    });
    try { appendObjectRows_('Deductions', deductionRecords); }
    catch (deductionError) {
      saveWarnings.push({ code: 'DEDUCTIONS_SAVE_FAILED', field: 'deductions', message: 'บันทึกรายการหลักแล้ว แต่รายการหักบางส่วนยังไม่สำเร็จ' });
      console.error('Deductions save failed', deductionError && deductionError.message);
    }
    const deductionMap = {};
    deductionMap[saleId] = deductionRecords;
    return { created: true, sale: enrichSale_(record, deductionMap), warnings: saveWarnings, duplicateCandidates: duplicateCandidates };
  } catch (error) {
    if (!committed && storedImage && storedImage.file) { try { storedImage.file.setTrashed(true); } catch (ignore) {} }
    throw error;
  } finally {
    runtimeWriteLockHeld_ = false;
    lock.releaseLock();
  }
}

function getSaleSaveStatus_(idempotencyKey) {
  const key = String(idempotencyKey || '').trim();
  if (!key) throw new AppError('INVALID_REQUEST', 'ไม่พบรหัสติดตามการบันทึก');
  const sale = getIdempotentSale_(key);
  return sale ? { state: 'SAVED', saved: true, sale: stripInternalFields_(sale) } : { state: 'PENDING', saved: false };
}

function listSales_(filters) {
  const input = filters || {};
  const limit = Math.min(200, Math.max(1, Number(input.limit || 50)));
  const selected = readSheetObjects_('Sales').filter(function (row) {
    if (!toBoolean_(input.includeVoid) && row.RecordStatus === 'VOID') return false;
    const date = dateKey_(row.SaleDate);
    if (input.fromDate && date < input.fromDate) return false;
    if (input.toDate && date > input.toDate) return false;
    if (input.year && date.slice(0, 4) !== String(input.year)) return false;
    if (input.month && date.slice(5, 7) !== ('0' + input.month).slice(-2)) return false;
    if (input.receiptNumber && normalizeName_(row.ReceiptNumber).indexOf(normalizeName_(input.receiptNumber)) < 0) return false;
    if (input.buyerName && normalizeName_(row.BuyerNameRaw).indexOf(normalizeName_(input.buyerName)) < 0) return false;
    return true;
  }).sort(function (a, b) { return String(b.SaleDate || '').localeCompare(String(a.SaleDate || '')); })
    .slice(0, limit);
  const selectedIds = {};
  selected.forEach(function (row) { selectedIds[row.SaleID] = true; });
  const deductionMap = {};
  readSheetObjects_('Deductions').forEach(function (item) {
    if (!selectedIds[item.SaleID]) return;
    if (!deductionMap[item.SaleID]) deductionMap[item.SaleID] = [];
    deductionMap[item.SaleID].push(item);
  });
  return selected.map(function (row) { return enrichSale_(row, deductionMap); });
}

function getSale_(saleId) {
  const row = findObjectById_('Sales', 'SaleID', saleId);
  if (!row) throw new AppError('NOT_FOUND', 'ไม่พบรายการขาย');
  return enrichSale_(row);
}

function enrichSale_(row, deductionMap) {
  const output = stripInternalFields_(row);
  output.SaleDate = dateKey_(output.SaleDate);
  const source = deductionMap ? (deductionMap[output.SaleID] || []) : readSheetObjects_('Deductions').filter(function (item) { return item.SaleID === output.SaleID; });
  output.deductions = source
    .sort(function (a, b) { return Number(a.SortOrder) - Number(b.SortOrder); }).map(stripInternalFields_);
  output.imageUrl = output.ImageFileID ? 'https://drive.google.com/file/d/' + output.ImageFileID + '/view' : '';
  return output;
}

function updateSale_(payload, requestId) {
  const existing = findObjectById_('Sales', 'SaleID', payload.saleId);
  if (!existing) throw new AppError('NOT_FOUND', 'ไม่พบรายการขาย');
  if (payload.expectedUpdatedAt && String(existing.UpdatedAt) !== String(payload.expectedUpdatedAt)) {
    throw new AppError('CONFLICT', 'รายการนี้ถูกแก้ไขจากที่อื่น กรุณาโหลดข้อมูลใหม่');
  }
  const sale = normalizeReceipt_(payload.sale || {});
  const validation = validateSaleDraft_(sale, true);
  if (!validation.valid) throw new AppError(validation.errors[0].code, validation.errors[0].message, validation);
  const before = stripInternalFields_(existing);
  existing.ReceiptNumber = sale.receiptNumber || ''; existing.SaleDate = sale.saleDate || '';
  existing.TimeIn = sale.timeIn || ''; existing.TimeOut = sale.timeOut || ''; existing.BuyerNameRaw = sale.buyerName || '';
  existing.BranchRaw = sale.branch || ''; existing.CustomerCode = sale.customerCode || ''; existing.CustomerName = sale.customerName || '';
  existing.VehiclePlate = sale.vehiclePlate || ''; existing.ProductCode = sale.productCode || ''; existing.ProductName = sale.productName || '';
  existing.GrossWeightKg = sale.grossWeightKg; existing.TareWeightKg = sale.tareWeightKg; existing.NetWeightKg = sale.netWeightKg;
  existing.DeductionWeightKg = sale.deductionWeightKg || 0; existing.PayableWeightKg = sale.payableWeightKg;
  existing.PricePerKg = sale.pricePerKg; existing.GrossAmount = sale.grossAmount; existing.TotalDeduction = sale.totalDeduction || 0;
  existing.NetAmount = sale.netAmount; existing.Notes = sale.notes || ''; existing.HandwrittenNotes = sale.handwrittenNotes || '';
  existing.BuyerID = ensureBuyer_(sale); existing.UpdatedAt = nowIso_();
  updateObjectRow_('Sales', existing.__rowNumber, existing);
  replaceDeductions_(existing.SaleID, sale.deductions);
  appendAudit_(existing.SaleID, 'UPDATE', { before: before, after: stripInternalFields_(existing) }, requestId);
  return { updated: true, sale: enrichSale_(existing), warnings: validation.warnings };
}

function voidSale_(payload, requestId) {
  const existing = findObjectById_('Sales', 'SaleID', payload.saleId);
  if (!existing) throw new AppError('NOT_FOUND', 'ไม่พบรายการขาย');
  existing.RecordStatus = 'VOID'; existing.UpdatedAt = nowIso_();
  updateObjectRow_('Sales', existing.__rowNumber, existing);
  appendAudit_(existing.SaleID, 'VOID', { reason: payload.reason || '' }, requestId);
  return { voided: true, saleId: existing.SaleID };
}

// ===== DashboardService.gs =====
function getDashboardSummary_(filters) {
  const input = filters || {};
  const requestedYear = String(input.year || 'all').toLowerCase();
  const allYears = requestedYear === 'all' || toBoolean_(input.allYears);
  const year = allYears ? 'all' : requestedYear;
  const month = input.month ? ('0' + input.month).slice(-2) : '';
  const all = readSheetObjects_('Sales').filter(function (row) { return row.RecordStatus !== 'VOID'; });
  const availableYears = Array.from(new Set(all.map(function (row) { return dateKey_(row.SaleDate).slice(0, 4); })
    .filter(function (value) { return /^\d{4}$/.test(value); }))).sort().reverse();
  const selected = all.filter(function (row) {
    const date = dateKey_(row.SaleDate);
    if (input.fromDate && date < input.fromDate) return false;
    if (input.toDate && date > input.toDate) return false;
    if (!allYears && !input.fromDate && date.slice(0, 4) !== year) return false;
    if (month && date.slice(5, 7) !== month) return false;
    return true;
  });
  const totals = summarizeSales_(selected);
  const monthlySeries = [];
  for (let index = 1; index <= 12; index += 1) {
    const key = ('0' + index).slice(-2);
    const summary = summarizeSales_(all.filter(function (row) {
      const date = dateKey_(row.SaleDate);
      return allYears ? date.slice(5, 7) === key : date.slice(0, 7) === year + '-' + key;
    }));
    monthlySeries.push({ month: key, weightKg: summary.totalWeightKg, revenue: summary.totalRevenue,
      averagePricePerKg: summary.averagePricePerKg, saleCount: summary.saleCount });
  }
  const buyerMap = {};
  selected.forEach(function (row) {
    const key = row.BuyerNameRaw || 'ไม่ระบุลาน';
    if (!buyerMap[key]) buyerMap[key] = [];
    buyerMap[key].push(row);
  });
  const buyerComparison = Object.keys(buyerMap).map(function (name) {
    const summary = summarizeSales_(buyerMap[name]);
    return { buyerName: name, totalWeightKg: summary.totalWeightKg, totalRevenue: summary.totalRevenue,
      averagePricePerKg: summary.averagePricePerKg, saleCount: summary.saleCount };
  }).sort(function (a, b) { return b.totalRevenue - a.totalRevenue; });
  return Object.assign({ year: year, allYears: allYears, availableYears: availableYears,
    month: month || null, monthlySeries: monthlySeries, buyerComparison: buyerComparison }, totals);
}

function summarizeSales_(rows) {
  let weight = 0, revenue = 0, weightedPrice = 0;
  rows.forEach(function (row) {
    const rowWeight = toNumber_(row.PayableWeightKg, toNumber_(row.NetWeightKg, 0)) || 0;
    const price = toNumber_(row.PricePerKg, 0) || 0;
    weight += rowWeight; revenue += toNumber_(row.NetAmount, 0) || 0; weightedPrice += rowWeight * price;
  });
  return { totalWeightKg: Math.round(weight * 100) / 100, totalWeightTon: Math.round(weight / 10) / 100,
    totalRevenue: Math.round(revenue * 100) / 100, averagePricePerKg: weight ? Math.round(weightedPrice / weight * 100) / 100 : 0,
    saleCount: rows.length };
}

// ===== HealthService.gs =====
function getHealth_() {
  const startedAt = Date.now();
  const config = getRuntimeConfig_();
  let spreadsheet = false;
  let schema = false;
  let drive = false;
  let settings = false;
  let setupError = null;
  try {
    const schemaResult = validateDatabaseSchema_();
    spreadsheet = true;
    schema = schemaResult.valid;
    settings = Boolean(readSettings_().TIMEZONE);
    drive = Boolean(config.receiptsFolderId && DriveApp.getFolderById(config.receiptsFolderId));
  } catch (error) {
    setupError = error instanceof AppError ? error.code : 'HEALTH_CHECK_FAILED';
  }
  return {
    service: config.serviceName,
    version: config.version,
    apiVersion: config.apiVersion,
    timeZone: config.timeZone,
    status: spreadsheet && schema && settings && drive && config.geminiConfigured && config.accessTokenConfigured ? 'ready' : 'setup_required',
    checks: { spreadsheet: spreadsheet, schema: schema, settings: settings, drive: drive,
      gemini: config.geminiConfigured, accessToken: config.accessTokenConfigured },
    setup: { version: config.setupVersion, at: config.setupAt, error: setupError },
    durationMs: Date.now() - startedAt
  };
}

// ===== Router.gs =====
function routeRequest_(method, action, payload, requestId) {
  const normalized = normalizeAction_(action);
  if (normalized === 'health') return apiSuccess_(getHealth_(), requestId);
  requireAccessToken_(payload || {});
  if (normalized === 'setup.verify') return apiSuccess_(validateDatabaseSchema_(), requestId);
  if (normalized === 'settings.get') return apiSuccess_(readSettings_(), requestId);
  if (normalized === 'sales.analyze' && method === 'POST') return apiSuccess_(analyzeReceipt_(payload, requestId), requestId);
  if (normalized === 'sales.duplicatecheck' && method === 'POST') {
    return apiSuccess_(findDuplicateCandidates_(normalizeReceipt_(payload.sale || {}), payload.imageSha256 || ''), requestId);
  }
  if (normalized === 'sales.create' && method === 'POST') return apiSuccess_(createSale_(payload, requestId), requestId);
  if (normalized === 'sales.status') return apiSuccess_(getSaleSaveStatus_(payload.idempotencyKey), requestId);
  if (normalized === 'sales.update' && method === 'POST') return apiSuccess_(updateSale_(payload, requestId), requestId);
  if (normalized === 'sales.void' && method === 'POST') return apiSuccess_(voidSale_(payload, requestId), requestId);
  if (normalized === 'sales.list') return apiSuccess_(listSales_(payload), requestId);
  if (normalized === 'sales.get') return apiSuccess_(getSale_(payload.saleId), requestId);
  if (normalized === 'dashboard.summary') return apiSuccess_(getDashboardSummary_(payload), requestId);
  if (normalized === 'buyers.list') return apiSuccess_(listBuyers_(), requestId);
  throw new AppError('INVALID_ACTION', 'ไม่รองรับ action: ' + (normalized || '(empty)'), {
    method: method,
    action: normalized
  });
}

// ===== Setup.gs =====
function setupProject() {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperties({
    SPREADSHEET_ID: APP_CONFIG.spreadsheetId,
    PROJECT_FOLDER_ID: APP_CONFIG.projectFolderId
  }, false);
  const schema = validateDatabaseSchema_();
  if (!schema.valid) {
    throw new AppError('INVALID_SCHEMA', 'โครงสร้าง Google Sheets ไม่ตรงกับระบบ', schema.sheets);
  }
  const receiptsFolder = ensureReceiptsFolder_();
  const monthFolder = ensureMonthlyReceiptFolder_(new Date());
  const setupAt = nowIso_();
  properties.setProperties({
    RECEIPTS_FOLDER_ID: receiptsFolder.getId(),
    SETUP_VERSION: APP_CONFIG.version,
    SETUP_AT: setupAt
  }, false);
  const result = {
    ok: true,
    service: APP_CONFIG.serviceName,
    version: APP_CONFIG.version,
    spreadsheetId: schema.spreadsheetId,
    spreadsheetName: schema.spreadsheetName,
    receiptsFolderId: receiptsFolder.getId(),
    currentMonthFolderId: monthFolder.getId(),
    timeZone: APP_CONFIG.timeZone,
    setupAt: setupAt,
    geminiConfigured: getRuntimeConfig_().geminiConfigured
  };
  console.log(safeJsonStringify_(result));
  return result;
}

function verifyProjectSetup() {
  const result = {
    runtime: getRuntimeConfig_(),
    schema: validateDatabaseSchema_(),
    settings: readSettings_(),
    health: getHealth_()
  };
  console.log(safeJsonStringify_(result));
  return result;
}

function resetProjectSetupForDevelopment() {
  const properties = PropertiesService.getScriptProperties();
  [SCRIPT_PROPERTY_KEYS.receiptsFolderId, SCRIPT_PROPERTY_KEYS.setupVersion, SCRIPT_PROPERTY_KEYS.setupAt]
    .forEach(function (key) { properties.deleteProperty(key); });
  return { ok: true, resetAt: nowIso_() };
}

// ===== Tests.gs =====
function runPhase1Tests() {
  const tests = [
    testNormalizeAction_, testValidateHeaders_, testResponseEnvelope_, testDatabaseSchema_,
    testSettings_, testReceiptFolders_, testHealth_
  ];
  const results = tests.map(function (test) {
    const startedAt = Date.now();
    try {
      test();
      return { name: test.name, passed: true, durationMs: Date.now() - startedAt };
    } catch (error) {
      return { name: test.name, passed: false, durationMs: Date.now() - startedAt, error: error && error.message };
    }
  });
  const summary = {
    passed: results.filter(function (item) { return item.passed; }).length,
    failed: results.filter(function (item) { return !item.passed; }).length,
    results: results,
    testedAt: nowIso_()
  };
  console.log(safeJsonStringify_(summary));
  if (summary.failed) throw new Error('Phase 1 tests failed: ' + summary.failed);
  return summary;
}

function testNormalizeAction_() { assertEqual_('health', normalizeAction_(' HEALTH '), 'normalize action'); }

function testValidateHeaders_() {
  const valid = validateHeaders_(['A', 'B'], ['A', 'B']);
  assertTrue_(valid.valid, 'matching headers should be valid');
  const invalid = validateHeaders_(['A', 'C'], ['A', 'B']);
  assertTrue_(!invalid.valid, 'different headers should be invalid');
  assertEqual_('B', invalid.missing[0], 'missing header');
  assertEqual_('C', invalid.unexpected[0], 'unexpected header');
}

function testResponseEnvelope_() {
  const response = apiSuccess_({ ready: true }, 'REQ_TEST');
  assertTrue_(response.ok, 'success envelope');
  assertEqual_('REQ_TEST', response.meta.requestId, 'request ID');
  assertEqual_(APP_CONFIG.apiVersion, response.meta.version, 'API version');
}

function testDatabaseSchema_() {
  const result = validateDatabaseSchema_();
  assertTrue_(result.valid, 'database schema');
}

function testSettings_() {
  const settings = readSettings_();
  assertEqual_('Asia/Bangkok', settings.TIMEZONE, 'settings timezone');
  assertTrue_(Boolean(settings.GEMINI_MODEL), 'Gemini model');
}

function testReceiptFolders_() {
  const root = ensureReceiptsFolder_();
  assertTrue_(Boolean(root.getId()), 'receipt root folder');
  const month = ensureMonthlyReceiptFolder_(new Date());
  assertTrue_(Boolean(month.getId()), 'receipt month folder');
}

function testHealth_() {
  const health = getHealth_();
  assertTrue_(health.checks.spreadsheet, 'health spreadsheet');
  assertTrue_(health.checks.schema, 'health schema');
  assertTrue_(health.checks.settings, 'health settings');
}

function runV1SmokeTests() {
  const health = getHealth_();
  const schema = validateDatabaseSchema_();
  const dashboard = getDashboardSummary_({ year: Utilities.formatDate(new Date(), APP_CONFIG.timeZone, 'yyyy') });
  const sales = listSales_({ limit: 5 });
  const result = {
    ok: health.status === 'ready' && schema.valid,
    health: health,
    schemaValid: schema.valid,
    dashboardShapeValid: typeof dashboard.totalRevenue === 'number' && Array.isArray(dashboard.monthlySeries),
    salesListValid: Array.isArray(sales),
    testedAt: nowIso_()
  };
  console.log(safeJsonStringify_(result));
  if (!result.ok || !result.dashboardShapeValid || !result.salesListValid) throw new Error('V1 smoke tests failed');
  return result;
}

function assertTrue_(condition, message) {
  if (!condition) throw new Error('Assertion failed: ' + message);
}

function assertEqual_(expected, actual, message) {
  if (expected !== actual) {
    throw new Error('Assertion failed: ' + message + '; expected=' + expected + '; actual=' + actual);
  }
}

// ===== Main.gs =====
function doGet(event) {
  const parameters = (event && event.parameter) || {};
  const requestId = createRequestId_(parameters.requestId);
  const action = parameters.action || 'health';
  const startedAt = Date.now();
  try {
    const response = routeRequest_('GET', action, parameters, requestId);
    logEvent_('INFO', normalizeAction_(action), {
      requestId: requestId,
      description: 'GET request completed',
      durationMs: Date.now() - startedAt
    });
    return jsonOutput_(response);
  } catch (error) {
    const normalized = normalizeError_(error);
    logEvent_('ERROR', normalizeAction_(action), {
      requestId: requestId,
      description: normalized.message,
      errorCode: normalized.code,
      durationMs: Date.now() - startedAt
    });
    return jsonOutput_(apiFailure_(error, requestId));
  }
}

function doPost(event) {
  let payload = {};
  let requestId = createRequestId_();
  let action = '';
  const startedAt = Date.now();
  try {
    payload = parseJsonBody_(event);
    requestId = createRequestId_(payload.requestId);
    action = payload.action || '';
    const response = routeRequest_('POST', action, payload, requestId);
    logEvent_('INFO', normalizeAction_(action), {
      requestId: requestId,
      description: 'POST request completed',
      durationMs: Date.now() - startedAt
    });
    return jsonOutput_(response);
  } catch (error) {
    const normalized = normalizeError_(error);
    logEvent_('ERROR', normalizeAction_(action), {
      requestId: requestId,
      description: normalized.message,
      errorCode: normalized.code,
      durationMs: Date.now() - startedAt
    });
    return jsonOutput_(apiFailure_(error, requestId));
  }
}
