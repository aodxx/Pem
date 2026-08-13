function getSpreadsheet_() {
  const config = getRuntimeConfig_();
  if (!config.spreadsheetId) {
    throw new AppError('NOT_CONFIGURED', 'ยังไม่ได้กำหนด Spreadsheet ID');
  }
  return SpreadsheetApp.openById(config.spreadsheetId);
}

function getSheetOrThrow_(sheetName) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) {
    throw new AppError('SHEET_NOT_FOUND', 'ไม่พบชีต ' + sheetName, { sheetName: sheetName });
  }
  return sheet;
}

function readHeaders_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) return [];
  return sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function (value) {
    return String(value || '').trim();
  });
}

function validateHeaders_(actual, expected) {
  const missing = expected.filter(function (header) {
    return actual.indexOf(header) < 0;
  });
  const unexpected = actual.filter(function (header) {
    return header && expected.indexOf(header) < 0;
  });
  return {
    valid: missing.length === 0 && unexpected.length === 0,
    missing: missing,
    unexpected: unexpected
  };
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
  const sheet = getSheetOrThrow_(APP_CONFIG.settingsSheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};

  const rows = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  return rows.reduce(function (settings, row) {
    const key = String(row[0] || '').trim();
    if (key) settings[key] = row[1];
    return settings;
  }, {});
}

function appendObjectRow_(sheetName, record) {
  const sheet = getSheetOrThrow_(sheetName);
  const headers = readHeaders_(sheet);
  const row = headers.map(function (header) {
    const value = Object.prototype.hasOwnProperty.call(record, header) ? record[header] : '';
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      return safeJsonStringify_(value);
    }
    return value === undefined || value === null ? '' : value;
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    sheet.appendRow(row);
  } finally {
    lock.releaseLock();
  }
  return record;
}
