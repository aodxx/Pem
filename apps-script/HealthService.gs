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
    status: spreadsheet && schema && settings ? 'ready' : 'setup_required',
    checks: {
      spreadsheet: spreadsheet,
      schema: schema,
      settings: settings,
      drive: drive,
      gemini: config.geminiConfigured
    },
    setup: {
      version: config.setupVersion,
      at: config.setupAt,
      error: setupError
    },
    durationMs: Date.now() - startedAt
  };
}
