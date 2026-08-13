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
  [
    SCRIPT_PROPERTY_KEYS.receiptsFolderId,
    SCRIPT_PROPERTY_KEYS.setupVersion,
    SCRIPT_PROPERTY_KEYS.setupAt
  ].forEach(function (key) {
    properties.deleteProperty(key);
  });
  return { ok: true, resetAt: nowIso_() };
}
