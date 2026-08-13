function runPhase1Tests() {
  const tests = [
    testNormalizeAction_,
    testValidateHeaders_,
    testResponseEnvelope_,
    testDatabaseSchema_,
    testSettings_,
    testReceiptFolders_,
    testHealth_
  ];

  const results = tests.map(function (test) {
    const startedAt = Date.now();
    try {
      test();
      return { name: test.name, passed: true, durationMs: Date.now() - startedAt };
    } catch (error) {
      return {
        name: test.name,
        passed: false,
        durationMs: Date.now() - startedAt,
        error: error && error.message
      };
    }
  });

  const summary = {
    passed: results.filter(function (item) { return item.passed; }).length,
    failed: results.filter(function (item) { return !item.passed; }).length,
    results: results,
    testedAt: nowIso_()
  };
  console.log(safeJsonStringify_(summary));
  if (summary.failed) {
    throw new Error('Phase 1 tests failed: ' + summary.failed);
  }
  return summary;
}

function testNormalizeAction_() {
  assertEqual_('health', normalizeAction_(' HEALTH '), 'normalize action');
}

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
  assertEqual_('gemini-3.6-flash', settings.GEMINI_MODEL, 'Gemini model');
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

function assertTrue_(condition, message) {
  if (!condition) throw new Error('Assertion failed: ' + message);
}

function assertEqual_(expected, actual, message) {
  if (expected !== actual) {
    throw new Error('Assertion failed: ' + message + '; expected=' + expected + '; actual=' + actual);
  }
}
