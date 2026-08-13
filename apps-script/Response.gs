function apiSuccess_(data, requestId) {
  return {
    ok: true,
    data: data === undefined ? null : data,
    error: null,
    meta: {
      requestId: requestId,
      version: APP_CONFIG.apiVersion,
      timestamp: nowIso_()
    }
  };
}

function apiFailure_(error, requestId) {
  return {
    ok: false,
    data: null,
    error: normalizeError_(error),
    meta: {
      requestId: requestId,
      version: APP_CONFIG.apiVersion,
      timestamp: nowIso_()
    }
  };
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(safeJsonStringify_(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
