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
