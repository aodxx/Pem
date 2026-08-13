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
  if (!raw) {
    return {};
  }

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
