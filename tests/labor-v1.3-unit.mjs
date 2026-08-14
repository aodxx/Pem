import fs from 'node:fs';
import vm from 'node:vm';

const backend = fs.readFileSync('apps-script/Code.gs', 'utf8');
const context = { console };
vm.createContext(context);
vm.runInContext(backend, context, { filename: 'Code.gs' });

const team = context.normalizeLaborDraft_({
  workMode: 'TEAM', contractorName: 'ทีมแดง', calculationMethod: 'PER_KG', rateSnapshot: 1.5
}, { payableWeightKg: 775 });
if (team.laborCost !== 1162.5) throw new Error('Team per-kg calculation failed');

const individual = context.normalizeLaborDraft_({
  workMode: 'INDIVIDUAL', contractorName: 'คนงาน', calculationMethod: 'PER_PERSON',
  headcount: 3, rateSnapshot: 300
}, { payableWeightKg: 775 });
if (individual.laborCost !== 900) throw new Error('Individual per-person calculation failed');

const selfManaged = context.normalizeLaborDraft_({ workMode: 'SELF' }, { payableWeightKg: 775 });
if (selfManaged.laborCost !== 0) throw new Error('Self-managed labor must be zero');

const summary = context.summarizeLaborEntries_([
  { LaborCost: 1162.5, AmountPaid: 500, BalanceDue: 662.5 },
  { LaborCost: 900, AmountPaid: 900, BalanceDue: 0 }
]);
if (summary.totalLaborCost !== 2062.5 || summary.amountPaid !== 1400 ||
    summary.balanceDue !== 662.5 || summary.paymentStatus !== 'PARTIAL') {
  throw new Error('Labor payment summary failed');
}

const frontend = fs.readFileSync('frontend/app.js', 'utf8');
const html = fs.readFileSync('frontend/index.html', 'utf8');
for (const marker of ['collectLaborEntries', "api('contractors.list'", "api('contractors.create'", 'clientLaborSummary']) {
  if (!frontend.includes(marker)) throw new Error(`Missing frontend labor marker: ${marker}`);
}
for (const marker of ['labor-entries-list', 'set-self-managed', 'contractor-dialog', 'sum-labor']) {
  if (!html.includes(marker)) throw new Error(`Missing labor UI marker: ${marker}`);
}

console.log(JSON.stringify({ ok: true, teamCost: team.laborCost,
  individualCost: individual.laborCost, summary }, null, 2));
