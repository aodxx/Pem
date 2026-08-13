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
    console.error('Unable to write application log', safeJsonStringify_({
      action: action,
      error: error && error.message
    }));
  }
  return record;
}
