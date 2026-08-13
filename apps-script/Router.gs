function routeRequest_(method, action, payload, requestId) {
  const normalized = normalizeAction_(action);

  if (method === 'GET' && normalized === 'health') {
    return apiSuccess_(getHealth_(), requestId);
  }

  if (method === 'GET' && normalized === 'settings.get') {
    return apiSuccess_(readSettings_(), requestId);
  }

  if (method === 'POST' && normalized === 'setup.verify') {
    return apiSuccess_(validateDatabaseSchema_(), requestId);
  }

  throw new AppError('INVALID_ACTION', 'ไม่รองรับ action: ' + (normalized || '(empty)'), {
    method: method,
    action: normalized
  });
}
