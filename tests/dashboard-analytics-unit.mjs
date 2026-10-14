import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = { window: {} };
vm.runInNewContext(fs.readFileSync('frontend/dashboard-analytics.js', 'utf8'), context, { filename: 'dashboard-analytics.js' });
const analytics = context.window.PalmDashboardAnalytics;
assert.ok(analytics, 'dashboard analytics module should expose its pure helpers');

const fixture = [
  { month: '01', weightKg: 1000, revenue: 11000, averagePricePerKg: 11, saleCount: 1, laborCost: 1000, netAfterLabor: 10000 },
  { month: '02', weightKg: 2000, revenue: 22000, averagePricePerKg: 11, saleCount: 2, laborCost: 2000, netAfterLabor: 20000 },
  { month: '03', weightKg: 1000, revenue: 15000, averagePricePerKg: 15, saleCount: 1, laborCost: 500, netAfterLabor: 14500 }
];

const normalized = analytics.normalizeSeries(fixture);
assert.equal(normalized.length, 12, 'dashboard series should always include all calendar months');
assert.equal(normalized[3].month, '04');
assert.equal(normalized[3].saleCount, 0, 'missing months should be represented as no-data, not fabricated sales');
assert.equal(analytics.metricValue(normalized[1], 'weight'), 2000);
assert.equal(analytics.metricValue(normalized[2], 'price'), 15);

const cards = JSON.parse(JSON.stringify(analytics.insightCards(fixture, false)));
assert.deepEqual(cards.slice(0, 3).map(card => [card.key, card.month, card.value]), [
  ['revenue', 'ก.พ.', 22000],
  ['price', 'มี.ค.', 15],
  ['weight', 'ก.พ.', 2000]
]);
assert.equal(cards[3].key, 'price-change');
assert.equal(cards[3].value, 4);
assert.equal(cards[3].percent, 36.36);

const allYearCards = JSON.parse(JSON.stringify(analytics.insightCards(fixture, true)));
assert.equal(allYearCards.length, 3, 'all-years month aggregation must not be presented as a chronological price change');
assert.deepEqual(JSON.parse(JSON.stringify(analytics.insightCards([], false))), []);

console.log('dashboard analytics unit tests passed');
