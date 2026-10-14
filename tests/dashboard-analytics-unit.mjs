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
const summary = JSON.parse(JSON.stringify(analytics.summarizeSeries(fixture)));
assert.equal(summary.months.length, 12, 'export summary should include all calendar months');
assert.deepEqual(summary.totals, {
  weightKg: 4000, revenue: 48000, averagePricePerKg: 12, saleCount: 4, laborCost: 3500, netAfterLabor: 44500
});
assert.deepEqual(JSON.parse(JSON.stringify(analytics.summarizeSeries([]))).totals, {
  weightKg: 0, revenue: 0, averagePricePerKg: 0, saleCount: 0, laborCost: 0, netAfterLabor: 0
});
const exportData = JSON.parse(JSON.stringify(analytics.exportTable(fixture, 'ปี 2569')));
assert.equal(exportData.rows.length, 13, 'CSV/PDF table should include twelve months and one total row');
assert.equal(exportData.rows[3].saleCount, '', 'months without sales should have blank values in exports');
assert.equal(exportData.rows[12].month, 'รวมช่วงที่เลือก');
assert.equal(exportData.rows[12].averagePricePerKg, 12, 'total average price should be weighted by sold weight');
const csv = analytics.toCsv(exportData);
assert.equal(csv.charCodeAt(0), 0xfeff, 'CSV should include a UTF-8 BOM for Thai spreadsheet compatibility');
assert.ok(csv.includes('"ปี 2569","ม.ค.",1,1000,11000,11,1000,10000'));
assert.ok(csv.includes('"ปี 2569","เม.ย.","","","","","",""'));
assert.ok(csv.endsWith('"ปี 2569","รวมช่วงที่เลือก",4,4000,48000,12,3500,44500'));
assert.ok(analytics.toCsv(analytics.exportTable(fixture, '=2+2')).includes("\"'=2+2\""), 'CSV text cells should be guarded against formula injection');

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
