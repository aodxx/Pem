import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const backendPath = fs.existsSync('apps-script/Code.gs') ? 'apps-script/Code.gs' : 'Palm-Yield-Ledger-Code.gs';
const code = fs.readFileSync(backendPath, 'utf8');
const context = {
  console,
  isFinite,
  Date,
  JSON,
  Math,
  Object,
  Array,
  String,
  Number,
  Error,
  Utilities: {
    formatDate(date, zone, format) {
      if (format === 'yyyy-MM-dd') return date.toISOString().slice(0, 10);
      if (format === 'yyyy') return date.toISOString().slice(0, 4);
      return date.toISOString();
    },
    getUuid: () => crypto.randomUUID(),
    computeDigest: (algorithm, value) => [...crypto.createHash('sha256').update(value).digest()].map(n => n > 127 ? n - 256 : n),
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' }
  }
};
vm.createContext(context);
vm.runInContext(code, context, { filename: 'Code.gs' });

context.readSettings_ = () => ({
  WEIGHT_TOLERANCE_KG: 1,
  MONEY_TOLERANCE_THB: 1,
  DUPLICATE_WARN_SCORE: .7,
  DUPLICATE_BLOCK_SCORE: .9
});

const normalized = context.normalizeReceipt_({
  grossWeightKg: '2,000', tareWeightKg: 500, netWeightKg: 1500,
  pricePerKg: 8.2, totalDeduction: 10, deductions: [], overallConfidence: .9
});
if (normalized.grossAmount !== 12300 || normalized.netAmount !== 12290) throw new Error('Receipt amount normalization failed');

const valid = context.validateSaleDraft_({ ...normalized, saleDate: '2026-08-13' }, true);
if (!valid.valid || valid.errors.length) throw new Error('Valid sale rejected');

const mismatch = context.validateSaleDraft_({ ...normalized, saleDate: '2026-08-13', netWeightKg: 1400 }, true);
if (!mismatch.warnings.some(item => item.code === 'WEIGHT_MISMATCH')) throw new Error('Weight mismatch not detected');

context.readSheetObjects_ = sheet => sheet === 'Sales' ? [{
  SaleID: 'SALE_1', RecordStatus: 'ACTIVE', ReceiptNumber: 'A-100', SaleDate: '2026-08-13',
  BuyerNameRaw: 'ลานปาล์มดี', NetWeightKg: 1500, PayableWeightKg: 1500, NetAmount: 12290, ImageSha256: 'abc'
}] : [];
const duplicates = context.findDuplicateCandidates_({
  receiptNumber: 'A-100', saleDate: '2026-08-13', buyerName: 'ลานปาล์มดี',
  netWeightKg: 1500, payableWeightKg: 1500, netAmount: 12290
}, '');
if (!duplicates.length || duplicates[0].score < .9) throw new Error('Duplicate detection failed');

const summary = context.summarizeSales_([
  { PayableWeightKg: 1000, PricePerKg: 8, NetAmount: 8000 },
  { PayableWeightKg: 500, PricePerKg: 9, NetAmount: 4500 }
]);
if (summary.totalWeightKg !== 1500 || summary.totalRevenue !== 12500 || summary.saleCount !== 2) throw new Error('Dashboard summary failed');

context.readSheetObjects_ = sheet => sheet === 'Sales' ? [
  { SaleID: 'SALE_2026', RecordStatus: 'ACTIVE', SaleDate: '2026-08-09', PayableWeightKg: 335, PricePerKg: 8.2, NetAmount: 2747, BuyerNameRaw: 'ลานหนึ่ง' },
  { SaleID: 'SALE_2020', RecordStatus: 'ACTIVE', SaleDate: '2020-08-05', PayableWeightKg: 775, PricePerKg: 8.4, NetAmount: 6510, BuyerNameRaw: 'ลานสอง' }
] : [];
const allYearsSummary = context.getDashboardSummary_({ year: 'all' });
if (!allYearsSummary.allYears || allYearsSummary.saleCount !== 2 || !allYearsSummary.availableYears.includes('2020')) throw new Error('All-years dashboard failed');

const dateOutlier = context.validateSaleDraft_({ ...normalized, saleDate: '2020-08-05' }, true);
if (!dateOutlier.warnings.some(item => item.code === 'DATE_OUTLIER')) throw new Error('Outlier date warning failed');

const schema = context.getGeminiReceiptJsonSchema_();
if (!schema.required.includes('netWeightKg') || !schema.properties.deductions) throw new Error('Gemini schema incomplete');

context.getIdempotentSale_ = key => key === 'saved-key' ? { SaleID: 'SALE_SAVED', NetAmount: 12500 } : null;
const savedStatus = context.getSaleSaveStatus_('saved-key');
const pendingStatus = context.getSaleSaveStatus_('pending-key');
if (!savedStatus.saved || savedStatus.sale.SaleID !== 'SALE_SAVED' || pendingStatus.saved) throw new Error('Save status lookup failed');

console.log(JSON.stringify({ ok: true, validationWarnings: mismatch.warnings.length, duplicateScore: duplicates[0].score, summary, saveStatus: savedStatus.state }, null, 2));

