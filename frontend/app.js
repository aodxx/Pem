'use strict';

const CONFIG = window.PALM_CONFIG;
const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));
const state = {
  accessToken: localStorage.getItem('palmAccessToken') || '', originalDataUrl: '', previewDataUrl: '', rotation: 0,
  source: 'MANUAL', receipt: null, ocrRunId: '', ocrRequestId: '', model: '', editingSaleId: '', expectedUpdatedAt: '', installPrompt: null,
  syncInProgress: false, viewingSaleId: '', viewingSaleDetail: null, contractors: [], pendingContractorRow: null,
  editingContractorId: '', contractorsLoaded: false,
  dashboardSeries: [], dashboardMetric: 'revenue', dashboardAllYears: false, dashboardYear: ''
};

const QUEUE_DB = 'palm-ledger-offline-v1';
const QUEUE_STORE = 'pending-saves';
let queueDbPromise;
const secretRevealTimers = new Map();
let saveFeedbackTimer;
let loadingAnimation;

document.addEventListener('DOMContentLoaded', init);

function init() {
  $('#api-url').value = CONFIG.apiUrl;
  $('#access-token').value = state.accessToken;
  $('#app-version').textContent = CONFIG.version;
  bindNavigation(); bindCapture(); bindForm(); bindLabor(); bindSettings(); bindFilters(); bindDashboardExport(); bindSaveFeedback(); setupInstall();
  bindReceiptViewer(); bindSaleDetail();
  initLoadingAnimation(); populateYears(); updateConnectionUI(); restoreDraft();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  initSaveQueue().then(async () => { await refreshQueueUI(); processPendingSaves(false); }).catch(() => {});
  if (state.accessToken) loadContractors().catch(() => {});
  window.addEventListener('online', () => { setSyncStatus('ออนไลน์ — กำลังตรวจรายการรอส่ง'); processPendingSaves(false); });
  window.addEventListener('offline', () => setSyncStatus('ออฟไลน์ — แบบร่างยังอยู่'));
  document.addEventListener('visibilitychange', () => { if (document.hidden) hideAllSecrets(); });
}

function bindNavigation() {
  $$('.nav-item').forEach(button => button.addEventListener('click', () => {
    showView(button.dataset.view);
    if (button.classList.contains('capture-nav')) $('#camera-input')?.click();
  }));
  $('#profile-settings-button').addEventListener('click', () => showView('settings'));
}

async function showView(name) {
  $$('.view').forEach(view => view.classList.toggle('active', view.id === `view-${name}`));
  $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === name));
  $('#profile-settings-button').classList.toggle('active', name === 'settings');
  $('#profile-settings-button').setAttribute('aria-current', name === 'settings' ? 'page' : 'false');
  if (name !== 'settings') hideAllSecrets();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'dashboard' && state.accessToken) await loadDashboard();
  if (name === 'history' && state.accessToken) await loadHistory();
}

function bindCapture() {
  $('#camera-input').addEventListener('change', event => selectImage(event, 'CAMERA'));
  $('#gallery-input').addEventListener('change', event => selectImage(event, 'UPLOAD'));
  $('#rotate-left').addEventListener('click', () => rotateImage(-90));
  $('#rotate-right').addEventListener('click', () => rotateImage(90));
  $('#analyze-button').addEventListener('click', analyzeImage);
  $('#manual-button').addEventListener('click', openManualForm);
  $('#cancel-review').addEventListener('click', resetCapture);
}

function bindForm() {
  $('#sale-form').addEventListener('submit', saveSale);
  $('#add-deduction').addEventListener('click', () => addDeductionRow());
  $('#sale-form').addEventListener('input', () => {
    calculateAmounts(); saveDraft();
  });
}

function bindLabor() {
  $('#set-self-managed').addEventListener('click', () => setSelfManaged());
  $('#add-team-labor').addEventListener('click', () => addLaborEntryAfterContractors('TEAM'));
  $('#add-individual-labor').addEventListener('click', () => addLaborEntryAfterContractors('INDIVIDUAL'));
  $('#labor-entries-list').addEventListener('input', event => {
    const row = event.target.closest('.labor-entry-row');
    if (!row) return;
    if (event.target.classList.contains('labor-contractor-search')) filterContractorSelect(row, event.target.value);
    updateLaborRow(row); calculateLaborTotals(); saveDraft();
  });
  $('#labor-entries-list').addEventListener('change', event => {
    const row = event.target.closest('.labor-entry-row');
    if (!row) return;
    if (event.target.classList.contains('labor-contractor-select')) {
      if (event.target.value === '__new__') openContractorDialog(row.dataset.workMode, row);
      else applyContractorToRow(row, event.target.value);
    }
    updateLaborRow(row); calculateLaborTotals(); saveDraft();
  });
  $('#labor-entries-list').addEventListener('click', event => {
    const row = event.target.closest('.labor-entry-row');
    if (!row) return;
    if (event.target.closest('.remove-labor-entry')) {
      row.remove(); calculateLaborTotals(); saveDraft();
    }
    if (event.target.closest('.add-contractor-inline')) openContractorDialog(row.dataset.workMode, row);
    if (event.target.closest('.edit-contractor-inline')) {
      const contractorId = row.querySelector('.labor-contractor-select')?.value;
      const contractor = state.contractors.find(item => String(item.ContractorID) === String(contractorId));
      if (contractor) openContractorDialog(row.dataset.workMode, row, contractor);
      else toast('กรุณาเลือกชื่อที่ต้องการแก้ไขก่อน');
    }
  });
  $('#close-contractor-dialog').addEventListener('click', closeContractorDialog);
  $('#cancel-contractor').addEventListener('click', closeContractorDialog);
  $('#contractor-method').addEventListener('change', updateContractorDialogFields);
  $('#contractor-form').addEventListener('submit', saveContractor);
}

function prepareLaborUI(entries = []) {
  $('#labor-entries-list').innerHTML = '';
  (entries || []).filter(item => String(item.RecordStatus || 'ACTIVE') !== 'VOID').forEach(item => {
    addLaborEntry(String(item.WorkMode || item.workMode || 'SELF').toUpperCase(), item, false);
  });
  calculateLaborTotals();
}

function setSelfManaged() {
  $('#labor-entries-list').innerHTML = '';
  addLaborEntry('SELF');
}

async function addLaborEntryAfterContractors(mode) {
  if (!ensureConnected()) return;
  if (!state.contractorsLoaded) {
    setLoading(true, 'กำลังโหลดรายชื่อทีม…');
    try { await loadContractors(); }
    catch (error) { handleError(error); }
    finally { setLoading(false); }
  }
  addLaborEntry(mode);
}

function addLaborEntry(mode, item = {}, persist = true) {
  const normalizedMode = String(mode || '').toUpperCase();
  if (normalizedMode === 'SELF') $('#labor-entries-list').innerHTML = '';
  else $$('#labor-entries-list .labor-entry-row[data-work-mode="SELF"]').forEach(row => row.remove());
  const row = document.createElement('article');
  row.className = 'labor-entry-row';
  row.dataset.workMode = normalizedMode;
  row.dataset.entryId = item.LaborEntryID || item.laborEntryId || '';
  if (normalizedMode === 'SELF') {
    row.innerHTML = `<div class="labor-entry-heading"><div><strong>จัดการเอง</strong><small>ไม่มีค่าแรงสำหรับรอบนี้</small></div><button class="remove-labor-entry" type="button" aria-label="ลบ">×</button></div><input class="labor-notes" type="hidden" value="">`;
  } else {
    const typeLabel = normalizedMode === 'TEAM' ? 'ทีมแทง' : 'บุคคล';
    const defaultMethod = normalizedMode === 'TEAM' ? 'PER_KG' : 'PER_PERSON';
    const method = item.CalculationMethod || item.calculationMethod || defaultMethod;
    const rate = item.RateSnapshot ?? item.rateSnapshot ?? '';
    const headcount = item.Headcount ?? item.headcount ?? '';
    const contractorId = item.ContractorID || item.contractorId || '';
    const contractorName = item.ContractorNameSnapshot || item.contractorName || '';
    row.innerHTML = `<div class="labor-entry-heading"><div><strong>จ้าง${typeLabel}</strong><small>${normalizedMode === 'TEAM' ? 'คำนวณจากน้ำหนักสุทธิ' : 'คำนวณจากจำนวนคน'}</small></div><button class="remove-labor-entry" type="button" aria-label="ลบ">×</button></div>
      <div class="contractor-picker">
        <label class="contractor-search-label">ค้นหาชื่อ<input class="labor-contractor-search" type="search" placeholder="พิมพ์ชื่อทีม/บุคคล"></label>
        <label>เลือก${typeLabel}ที่เคยใช้<select class="labor-contractor-select">${renderContractorOptions(normalizedMode, contractorId, contractorName)}</select></label>
        <div class="contractor-inline-actions"><button class="add-contractor-inline" type="button">＋ เพิ่มชื่อ</button><button class="edit-contractor-inline" type="button">แก้ไขข้อมูลประจำ</button></div>
      </div>
      <div class="labor-rate-grid">
        <label>วิธีคิด<select class="labor-method"><option value="PER_KG">ตามน้ำหนัก</option><option value="PER_PERSON">ตามจำนวนคน</option></select></label>
        <label>อัตราค่าแรง<input class="labor-rate" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(rate)}"></label>
        <label class="labor-weight-wrap">น้ำหนักสุทธิ<input class="labor-weight" type="number" readonly></label>
        <label class="labor-headcount-wrap">จำนวนคน<input class="labor-headcount" type="number" min="1" step="1" inputmode="numeric" value="${escapeHtml(headcount)}"></label>
      </div>
      <label class="checkbox-label rate-default-choice hidden"><input class="labor-save-default" type="checkbox"> ใช้อัตรานี้เป็นราคาเริ่มต้นใหม่ด้วย</label>
      <label>หมายเหตุ<input class="labor-notes" value="${escapeHtml(item.Notes || item.notes || '')}" placeholder="ไม่บังคับ"></label>
      <div class="labor-row-total"><span>ค่าแรงรายการนี้</span><strong class="labor-cost">฿0</strong></div>`;
    row.querySelector('.labor-method').value = method;
  }
  $('#labor-entries-list').appendChild(row);
  updateLaborRow(row); calculateLaborTotals();
  if (persist) saveDraft();
  if (normalizedMode !== 'SELF' && state.contractorsLoaded && !state.contractors.some(contractor => contractor.ContractorType === normalizedMode)) {
    openContractorDialog(normalizedMode, row);
  }
  return row;
}

function renderContractorOptions(mode, selectedId = '', snapshotName = '', query = '') {
  const needle = normalizeSearch(query);
  const items = state.contractors.filter(item => String(item.ContractorType).toUpperCase() === mode && (!needle || normalizeSearch(item.Name).includes(needle)));
  let html = '<option value="">— เลือกชื่อ —</option>';
  if (mode === 'INDIVIDUAL') html += '<option value="__unnamed__">ไม่ระบุชื่อ • กรอกจำนวนคนอย่างเดียว</option>';
  if (selectedId && !items.some(item => String(item.ContractorID) === String(selectedId))) {
    html += `<option value="${escapeHtml(selectedId)}" selected>${escapeHtml(snapshotName || 'ข้อมูลเดิม')}</option>`;
  }
  html += items.map(item => `<option value="${escapeHtml(item.ContractorID)}"${String(item.ContractorID) === String(selectedId) ? ' selected' : ''}>${escapeHtml(item.Name)} • ${formatLaborRate(item.CalculationMethod, item.DefaultRate)}</option>`).join('');
  return html + '<option value="__new__">＋ เพิ่มชื่อใหม่</option>';
}

function filterContractorSelect(row, query) {
  const select = row.querySelector('.labor-contractor-select');
  const selected = select.value;
  const contractor = state.contractors.find(item => String(item.ContractorID) === String(selected));
  select.innerHTML = renderContractorOptions(row.dataset.workMode, selected, contractor?.Name || '', query);
  if (selected && [...select.options].some(option => option.value === selected)) select.value = selected;
}

async function loadContractors() {
  if (!state.accessToken) return [];
  const items = await api('contractors.list', {}, true, { timeoutMs: 20000 });
  state.contractors = Array.isArray(items) ? items : [];
  state.contractorsLoaded = true;
  $$('.labor-contractor-select').forEach(select => {
    const selected = select.value;
    const row = select.closest('.labor-entry-row');
    select.innerHTML = renderContractorOptions(row.dataset.workMode, selected, 'ข้อมูลเดิม');
    if (selected) select.value = selected;
    rememberContractorDefaults(row, selected);
    updateLaborRow(row);
  });
  refreshContractorFilter();
  return state.contractors;
}

function rememberContractorDefaults(row, contractorId) {
  const contractor = state.contractors.find(item => String(item.ContractorID) === String(contractorId));
  if (!contractor) return;
  row.dataset.defaultMethod = contractor.CalculationMethod || '';
  row.dataset.defaultRate = String(numberOrNull(contractor.DefaultRate) || 0);
  row.dataset.defaultHeadcount = String(numberOrNull(contractor.DefaultHeadcount) || 0);
}

function applyContractorToRow(row, contractorId) {
  const contractor = state.contractors.find(item => String(item.ContractorID) === String(contractorId));
  if (!contractor) return;
  const method = contractor.CalculationMethod || (row.dataset.workMode === 'TEAM' ? 'PER_KG' : 'PER_PERSON');
  row.querySelector('.labor-method').value = method;
  row.querySelector('.labor-rate').value = valueForInput(contractor.DefaultRate);
  if (row.querySelector('.labor-headcount') && contractor.DefaultHeadcount) row.querySelector('.labor-headcount').value = contractor.DefaultHeadcount;
  row.dataset.defaultMethod = method;
  row.dataset.defaultRate = String(numberOrNull(contractor.DefaultRate) || 0);
  row.dataset.defaultHeadcount = String(numberOrNull(contractor.DefaultHeadcount) || 0);
  const choice = row.querySelector('.labor-save-default');
  if (choice) choice.checked = false;
}

function updateLaborRow(row) {
  if (row.dataset.workMode === 'SELF') return;
  const method = row.querySelector('.labor-method').value;
  const payable = numberOrNull($('#sale-form').elements.payableWeightKg.value);
  const net = numberOrNull($('#sale-form').elements.netWeightKg.value);
  const weight = payable ?? net ?? 0;
  row.querySelector('.labor-weight').value = weight || '';
  row.querySelector('.labor-weight-wrap').classList.toggle('hidden', method !== 'PER_KG');
  row.querySelector('.labor-headcount-wrap').classList.toggle('hidden', method !== 'PER_PERSON');
  const rate = numberOrNull(row.querySelector('.labor-rate').value) || 0;
  const headcount = numberOrNull(row.querySelector('.labor-headcount').value) || 0;
  const cost = method === 'PER_KG' ? round2(weight * rate) : round2(headcount * rate);
  row.dataset.laborCost = String(cost);
  row.querySelector('.labor-cost').textContent = formatMoney(cost);
  const defaultChoice = row.querySelector('.rate-default-choice');
  if (defaultChoice) {
    const selectedId = row.querySelector('.labor-contractor-select').value;
    const changed = Boolean(selectedId && selectedId !== '__new__') && (
      method !== (row.dataset.defaultMethod || method) ||
      Math.abs(rate - Number(row.dataset.defaultRate || rate)) > .0001 ||
      (method === 'PER_PERSON' && headcount !== Number(row.dataset.defaultHeadcount || headcount))
    );
    defaultChoice.classList.toggle('hidden', !changed);
    if (!changed) row.querySelector('.labor-save-default').checked = false;
  }
}

function calculateLaborTotals() {
  $$('#labor-entries-list .labor-entry-row').forEach(updateLaborRow);
  const rows = $$('#labor-entries-list .labor-entry-row');
  const total = round2(rows.reduce((sum, row) => sum + Number(row.dataset.laborCost || 0), 0));
  const net = numberOrNull($('#sale-form').elements.netAmount.value) || 0;
  $('#labor-entry-count').textContent = rows.length ? `${rows.length} รายการ` : 'ยังไม่เลือก';
  $('#labor-sale-net').textContent = formatMoney(net);
  $('#labor-total-cost').textContent = formatMoney(total);
  $('#labor-net-after').textContent = formatMoney(net - total);
  return { total, netAfterLabor: round2(net - total) };
}

function collectLaborEntries(allowEmpty = false, allowIncomplete = false) {
  const rows = $$('#labor-entries-list .labor-entry-row');
  if (!rows.length && !allowEmpty) throw appError('LABOR_REQUIRED', 'กรุณาเลือกว่า “จัดการเอง”, “จ้างทีมแทง” หรือ “จ้างบุคคล”');
  return rows.map(row => {
    const workMode = row.dataset.workMode;
    if (workMode === 'SELF') return { laborEntryId: row.dataset.entryId || '', workMode: 'SELF', notes: '' };
    const contractorId = row.querySelector('.labor-contractor-select').value;
    if ((!contractorId || contractorId === '__new__') && !allowIncomplete) throw appError('CONTRACTOR_REQUIRED', 'กรุณาเลือกหรือเพิ่มชื่อทีมงาน/บุคคล');
    const calculationMethod = row.querySelector('.labor-method').value;
    const rateSnapshot = numberOrNull(row.querySelector('.labor-rate').value);
    const headcount = numberOrNull(row.querySelector('.labor-headcount').value) || 0;
    const weightKgSnapshot = numberOrNull(row.querySelector('.labor-weight').value) || 0;
    if ((rateSnapshot === null || rateSnapshot < 0) && !allowIncomplete) throw appError('INVALID_RATE', 'กรุณาระบุอัตราค่าแรงให้ถูกต้อง');
    if (calculationMethod === 'PER_PERSON' && headcount < 1 && !allowIncomplete) throw appError('INVALID_HEADCOUNT', 'กรุณาระบุจำนวนคน');
    return { laborEntryId: row.dataset.entryId || '', workMode, contractorId: ['__new__','__unnamed__'].includes(contractorId) ? '' : contractorId,
      contractorName: contractorId === '__unnamed__' ? 'แรงงานบุคคล' : '', calculationMethod,
      weightKgSnapshot, headcount, rateSnapshot, notes: row.querySelector('.labor-notes').value.trim() };
  });
}

function collectContractorUpdates() {
  return $$('#labor-entries-list .labor-entry-row').flatMap(row => {
    const checkbox = row.querySelector('.labor-save-default');
    const contractorId = row.querySelector('.labor-contractor-select')?.value;
    if (!checkbox?.checked || !contractorId || ['__new__','__unnamed__'].includes(contractorId)) return [];
    return [{ contractorId, calculationMethod: row.querySelector('.labor-method').value,
      defaultRate: numberOrNull(row.querySelector('.labor-rate').value) || 0,
      defaultHeadcount: numberOrNull(row.querySelector('.labor-headcount').value) || 0 }];
  });
}

async function applyContractorUpdates(updates = []) {
  for (const contractor of updates) await api('contractors.update', { contractor }, true, { timeoutMs: 30000 });
  if (updates.length) await loadContractors();
}

function openContractorDialog(mode, row, contractor = null) {
  if (!ensureConnected()) return;
  state.pendingContractorRow = row;
  state.editingContractorId = contractor?.ContractorID || '';
  const type = mode === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'TEAM';
  $('#contractor-id').value = state.editingContractorId;
  $('#contractor-type').value = type;
  $('#contractor-dialog-title').textContent = contractor ? 'แก้ไขข้อมูลประจำ' : (type === 'TEAM' ? 'เพิ่มทีมแทง' : 'เพิ่มบุคคล');
  $('#contractor-name').value = contractor?.Name || '';
  $('#contractor-method').value = contractor?.CalculationMethod || (type === 'TEAM' ? 'PER_KG' : 'PER_PERSON');
  $('#contractor-rate').value = valueForInput(contractor?.DefaultRate);
  $('#contractor-headcount').value = valueForInput(contractor?.DefaultHeadcount);
  $('#contractor-phone').value = contractor?.Phone || '';
  $('#contractor-notes').value = contractor?.Notes || '';
  $('#contractor-active').checked = contractor ? !(contractor.Active === false || String(contractor.Active).toUpperCase() === 'FALSE') : true;
  updateContractorDialogFields();
  const dialog = $('#contractor-dialog');
  if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
}

function closeContractorDialog() {
  const dialog = $('#contractor-dialog');
  if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
  const select = state.pendingContractorRow?.querySelector('.labor-contractor-select');
  if (select?.value === '__new__') select.value = '';
  state.pendingContractorRow = null;
  state.editingContractorId = '';
}

function updateContractorDialogFields() {
  $('#contractor-headcount-label').classList.toggle('hidden', $('#contractor-method').value !== 'PER_PERSON');
}

async function saveContractor(event) {
  event.preventDefault();
  const contractorType = $('#contractor-type').value;
  setLoading(true, 'กำลังบันทึกรายชื่อ…');
  try {
    const action = state.editingContractorId ? 'contractors.update' : 'contractors.create';
    const contractor = await api(action, { contractor: {
      contractorId: state.editingContractorId, contractorType, name: $('#contractor-name').value.trim(), calculationMethod: $('#contractor-method').value,
      defaultRate: numberOrNull($('#contractor-rate').value) || 0,
      defaultHeadcount: numberOrNull($('#contractor-headcount').value) || 0,
      phone: $('#contractor-phone').value.trim(), notes: $('#contractor-notes').value.trim(), active: $('#contractor-active').checked
    } }, true, { timeoutMs: 30000 });
    const existingIndex = state.contractors.findIndex(item => String(item.ContractorID) === String(contractor.ContractorID));
    if (existingIndex >= 0) state.contractors[existingIndex] = contractor; else state.contractors.push(contractor);
    const row = state.pendingContractorRow;
    closeContractorDialog();
    if (row?.isConnected) {
      const select = row.querySelector('.labor-contractor-select');
      select.innerHTML = renderContractorOptions(contractorType, contractor.ContractorID, contractor.Name);
      select.value = contractor.ContractorID;
      applyContractorToRow(row, contractor.ContractorID);
      updateLaborRow(row); calculateLaborTotals(); saveDraft();
    }
    await loadContractors();
    toast(action === 'contractors.update' ? 'แก้ไขข้อมูลประจำแล้ว' : 'บันทึกรายชื่อแล้ว รอบต่อไปเลือกใช้ได้ทันที');
  } catch (error) { handleError(error); }
  finally { setLoading(false); }
}

function formatLaborRate(method, rate) {
  return method === 'PER_KG' ? `${formatNumber(rate, 2)} บ./กก.` : `${formatNumber(rate, 0)} บ./คน`;
}

function bindSettings() {
  $('#save-settings').addEventListener('click', saveSettings);
  $('#retry-pending').addEventListener('click', () => processPendingSaves(true));
  $('#toggle-api-url').addEventListener('click', () => toggleSecretField('api-url', 'toggle-api-url'));
  $('#toggle-access-token').addEventListener('click', () => toggleSecretField('access-token', 'toggle-access-token'));
}

function toggleSecretField(fieldId, buttonId) {
  const field = $(`#${fieldId}`);
  const button = $(`#${buttonId}`);
  const reveal = field.type === 'password';
  field.type = reveal ? 'text' : 'password';
  button.setAttribute('aria-pressed', reveal ? 'true' : 'false');
  button.setAttribute('aria-label', `${reveal ? 'ซ่อน' : 'แสดง'} ${fieldId === 'api-url' ? 'Web App URL' : 'Access Token'}`);
  button.querySelector('.eye-open').classList.toggle('hidden', reveal);
  button.querySelector('.eye-closed').classList.toggle('hidden', !reveal);
  clearTimeout(secretRevealTimers.get(fieldId));
  if (reveal) secretRevealTimers.set(fieldId, setTimeout(() => hideSecret(fieldId, buttonId), 20000));
}

function hideSecret(fieldId, buttonId) {
  const field = $(`#${fieldId}`);
  const button = $(`#${buttonId}`);
  if (!field || !button) return;
  field.type = 'password';
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-label', `แสดง ${fieldId === 'api-url' ? 'Web App URL' : 'Access Token'}`);
  button.querySelector('.eye-open').classList.remove('hidden');
  button.querySelector('.eye-closed').classList.add('hidden');
  clearTimeout(secretRevealTimers.get(fieldId));
  secretRevealTimers.delete(fieldId);
}

function hideAllSecrets() {
  hideSecret('api-url', 'toggle-api-url');
  hideSecret('access-token', 'toggle-access-token');
}

function bindFilters() {
  ['#filter-month','#filter-work-mode','#filter-contractor','#filter-payment-status','#filter-date-from','#filter-date-to']
    .forEach(selector => $(selector).addEventListener('change', () => {
      updateFilterDrawerStatus();
      loadHistory();
    }));
  let timer;
  $('#filter-search').addEventListener('input', () => {
    updateFilterDrawerStatus();
    clearTimeout(timer);
    timer = setTimeout(loadHistory, 300);
  });
  $('#clear-filters').addEventListener('click', () => {
    ['#filter-month','#filter-search','#filter-work-mode','#filter-contractor','#filter-payment-status','#filter-date-from','#filter-date-to']
      .forEach(selector => { $(selector).value = ''; });
    updateFilterDrawerStatus();
    $('#history-filter-drawer').open = false;
    loadHistory();
  });
  $('#dashboard-year').addEventListener('change', loadDashboard);
  $('#dashboard-metric-tabs').addEventListener('click', handleDashboardMetricClick);
  updateFilterDrawerStatus();
}

function bindDashboardExport() {
  $('#export-dashboard-csv').addEventListener('click', exportDashboardCsv);
  $('#export-dashboard-pdf').addEventListener('click', exportDashboardPdf);
}

function setDashboardExportBusy(busy) {
  ['#export-dashboard-csv', '#export-dashboard-pdf'].forEach(selector => {
    const button = $(selector);
    button.disabled = Boolean(busy);
    button.setAttribute('aria-busy', String(Boolean(busy)));
  });
}

function updateFilterDrawerStatus() {
  const selectors = ['#filter-search','#filter-work-mode','#filter-contractor','#filter-payment-status','#filter-date-from','#filter-date-to','#filter-month'];
  const count = selectors.filter(selector => String($(selector).value || '').trim()).length;
  const label = $('#filter-active-count');
  label.textContent = count ? `ใช้งาน ${count} ตัวกรอง` : 'ยังไม่ได้ใช้ตัวกรอง';
  label.classList.toggle('active', count > 0);
  return count;
}

function refreshContractorFilter() {
  const select = $('#filter-contractor');
  if (!select) return;
  const selected = select.value;
  select.innerHTML = '<option value="">ทุกทีมและบุคคล</option>' + state.contractors.map(item =>
    `<option value="${escapeHtml(item.ContractorID)}">${escapeHtml(item.Name)} • ${item.ContractorType === 'TEAM' ? 'ทีมแทง' : 'บุคคล'}</option>`).join('');
  if ([...select.options].some(option => option.value === selected)) select.value = selected;
}

function bindReceiptViewer() {
  const viewer = $('#receipt-viewer');
  $('#close-receipt-viewer').addEventListener('click', closeReceiptViewer);
  $('#viewer-edit-sale').addEventListener('click', () => {
    const saleId = state.viewingSaleId;
    closeReceiptViewer();
    if (saleId) editSale(saleId);
  });
  viewer.addEventListener('click', event => { if (event.target === viewer) closeReceiptViewer(); });
  viewer.addEventListener('cancel', event => { event.preventDefault(); closeReceiptViewer(); });
}

function bindSaleDetail() {
  const dialog = $('#sale-detail-dialog');
  $('#close-sale-detail').addEventListener('click', closeSaleDetail);
  $('#cancel-payment').addEventListener('click', () => $('#labor-payment-form').classList.add('hidden'));
  $('#labor-payment-form').addEventListener('submit', saveLaborPayment);
  $('#detail-edit-sale').addEventListener('click', () => {
    const saleId = state.viewingSaleDetail?.SaleID;
    closeSaleDetail();
    if (saleId) editSale(saleId);
  });
  $('#detail-view-receipt').addEventListener('click', () => {
    const item = state.viewingSaleDetail;
    if (!item?.ImageFileID) return toast('รายการนี้ไม่มีภาพใบชั่ง');
    closeSaleDetail();
    openReceiptViewer({ saleId:item.SaleID, fileId:item.ImageFileID, driveUrl:item.imageUrl,
      meta:`ใบชั่ง ${item.ReceiptNumber || '—'} • ${formatThaiDate(item.SaleDate)}` });
  });
  $('#sale-detail-content').addEventListener('click', event => {
    const button = event.target.closest('.pay-labor-button');
    if (button) openPaymentPanel(button.dataset);
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) closeSaleDetail(); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeSaleDetail(); });
}

async function openSaleDetail(saleId) {
  if (!ensureConnected()) return;
  setLoading(true, 'กำลังเปิดรายละเอียดรอบขาย…');
  try {
    const [item, payments] = await Promise.all([
      api('sales.get', { saleId }),
      api('labor.payments.list', { saleId })
    ]);
    state.viewingSaleDetail = item;
    $('#sale-detail-title').textContent = `รอบขาย ${formatThaiDate(item.SaleDate)}`;
    $('#sale-detail-meta').textContent = `ใบชั่ง ${item.ReceiptNumber || '—'} • ${item.BuyerNameRaw || 'ไม่ระบุลาน'}`;
    $('#detail-view-receipt').disabled = !item.ImageFileID;
    $('#labor-payment-form').classList.add('hidden');
    renderSaleDetail(item, payments || []);
    const dialog = $('#sale-detail-dialog');
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  } catch (error) { handleError(error); }
  finally { setLoading(false); }
}

function closeSaleDetail() {
  const dialog = $('#sale-detail-dialog');
  if (typeof dialog.close === 'function' && dialog.open) dialog.close(); else dialog.removeAttribute('open');
  state.viewingSaleDetail = null;
  $('#labor-payment-form').classList.add('hidden');
}

function renderSaleDetail(item, payments) {
  const labor = item.laborSummary || { totalLaborCost:0, amountPaid:0, balanceDue:0 };
  const entries = (item.laborEntries || []).filter(entry => String(entry.RecordStatus || 'ACTIVE') !== 'VOID');
  const entryHtml = entries.length ? entries.map(entry => {
    const mode = String(entry.WorkMode || 'SELF').toUpperCase();
    const method = entry.CalculationMethod === 'PER_KG'
      ? `${formatNumber(entry.WeightKgSnapshot, 0)} กก. × ${formatNumber(entry.RateSnapshot, 2)} บาท`
      : entry.CalculationMethod === 'PER_PERSON'
        ? `${formatNumber(entry.Headcount, 0)} คน × ${formatNumber(entry.RateSnapshot, 2)} บาท`
        : 'ไม่มีค่าแรง';
    const status = paymentStatusLabel(entry.PaymentStatus, Number(entry.LaborCost || 0));
    const payButton = Number(entry.BalanceDue || 0) > 0
      ? `<button class="pay-labor-button" type="button" data-entry-id="${escapeHtml(entry.LaborEntryID)}" data-name="${escapeHtml(entry.ContractorNameSnapshot || 'ค่าแรง')}" data-balance="${escapeHtml(entry.BalanceDue)}">บันทึกการจ่าย</button>` : '';
    return `<article class="detail-labor-row"><div><strong>${escapeHtml(entry.ContractorNameSnapshot || (mode === 'SELF' ? 'จัดการเอง' : 'ไม่ระบุชื่อ'))}</strong><small>${escapeHtml(method)} • ${escapeHtml(status)}</small></div><div><b>${formatMoney(entry.LaborCost)}</b><small>จ่ายแล้ว ${formatMoney(entry.AmountPaid)}</small>${payButton}</div></article>`;
  }).join('') : '<p class="detail-empty">ยังไม่มีข้อมูลทีมและค่าแรง</p>';
  const paymentHtml = payments.length ? payments.map(payment => `<li><span>${formatThaiDate(payment.PaymentDate)} • ${paymentMethodLabel(payment.PaymentMethod)}</span><strong>${formatMoney(payment.Amount)}</strong>${payment.Notes ? `<small>${escapeHtml(payment.Notes)}</small>` : ''}</li>`).join('') : '<li class="detail-empty">ยังไม่มีประวัติการจ่าย</li>';
  $('#sale-detail-content').innerHTML = `
    <div class="detail-summary-grid">
      <div><span>น้ำหนักสุทธิ</span><strong>${formatNumber(item.NetWeightKg, 0)} กก.</strong></div>
      <div><span>ราคาปาล์ม</span><strong>${formatNumber(item.PricePerKg, 2)} บ./กก.</strong></div>
      <div><span>ยอดขายสุทธิ</span><strong>${formatMoney(item.NetAmount)}</strong></div>
      <div><span>ค่าแรงรวม</span><strong>${formatMoney(labor.totalLaborCost)}</strong></div>
      <div><span>จ่ายค่าแรงแล้ว</span><strong>${formatMoney(labor.amountPaid)}</strong></div>
      <div><span>ค้างจ่าย</span><strong>${formatMoney(labor.balanceDue)}</strong></div>
      <div class="detail-net"><span>คงเหลือหลังหักค่าแรง</span><strong>${formatMoney(item.netAfterLabor)}</strong></div>
    </div>
    <section class="detail-section"><h3>ทีมงานและค่าแรง</h3>${entryHtml}</section>
    <section class="detail-section"><h3>ประวัติการจ่ายค่าแรง</h3><ul class="payment-history">${paymentHtml}</ul></section>`;
}

function openPaymentPanel(data) {
  const balance = Number(data.balance || 0);
  $('#payment-labor-entry-id').value = data.entryId || '';
  $('#payment-contractor-name').textContent = data.name || 'บันทึกการจ่ายค่าแรง';
  $('#payment-balance-label').textContent = `ยอดค้าง ${formatMoney(balance)}`;
  $('#payment-amount').max = String(balance);
  $('#payment-amount').value = balance || '';
  $('#payment-date').value = new Date().toLocaleDateString('en-CA', { timeZone:'Asia/Bangkok' });
  $('#payment-method').value = 'CASH';
  $('#payment-notes').value = '';
  $('#labor-payment-form').classList.remove('hidden');
  $('#labor-payment-form').scrollIntoView({ behavior:'smooth', block:'center' });
}

async function saveLaborPayment(event) {
  event.preventDefault();
  const item = state.viewingSaleDetail;
  if (!item) return;
  setLoading(true, 'กำลังบันทึกการจ่ายค่าแรง…');
  try {
    await api('labor.payments.create', {
      laborEntryId:$('#payment-labor-entry-id').value,
      amount:numberOrNull($('#payment-amount').value),
      paymentDate:$('#payment-date').value,
      paymentMethod:$('#payment-method').value,
      notes:$('#payment-notes').value.trim()
    }, true, { timeoutMs:30000 });
    const saleId = item.SaleID;
    closeSaleDetail();
    toast('บันทึกการจ่ายค่าแรงแล้ว');
    await loadHistory();
    await openSaleDetail(saleId);
  } catch (error) { handleError(error); }
  finally { setLoading(false); }
}

function paymentStatusLabel(status, laborCost = 1) {
  if (laborCost <= 0) return 'จัดการเอง';
  return status === 'PAID' ? 'จ่ายครบแล้ว' : status === 'PARTIAL' ? 'จ่ายบางส่วน' : 'ยังไม่จ่าย';
}

function paymentMethodLabel(method) {
  return method === 'CASH' ? 'เงินสด' : method === 'TRANSFER' ? 'โอนเงิน' : (method || 'ไม่ระบุวิธี');
}

async function selectImage(event, source) {
  const input = event.target;
  const file = input.files && input.files[0];
  if (!file) return;
  try {
    if (file.size > 14 * 1024 * 1024) return toast('รูปต้นฉบับใหญ่เกิน 14 MB กรุณาเลือกรูปอื่น');
    const mimeType = imageMimeTypeForFile(file);
    if (!mimeType) return toast('ไฟล์นี้ไม่ใช่รูปภาพที่รองรับ กรุณาเลือกไฟล์รูป');
    const dataUrl = normalizeImageDataUrl(await readFileAsDataUrl(file), mimeType);
    const previewDataUrl = await renderImage(dataUrl, 0);
    state.source = source; state.rotation = 0; state.originalDataUrl = dataUrl;
    state.previewDataUrl = previewDataUrl; state.ocrRequestId = '';
    $('#image-preview').src = state.previewDataUrl;
    $('#preview-panel').classList.remove('hidden'); $('#review-panel').classList.add('hidden');
    $('#preview-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    console.error('Image selection failed', error);
    toast('เปิดรูปนี้ไม่สำเร็จ กรุณาลองเลือกรูปอื่นหรือถ่ายใหม่');
  } finally {
    input.value = '';
  }
}

async function rotateImage(amount) {
  if (!state.originalDataUrl) return;
  state.rotation = (state.rotation + amount + 360) % 360;
  state.previewDataUrl = await renderImage(state.originalDataUrl, state.rotation);
  $('#image-preview').src = state.previewDataUrl;
}

async function renderImage(dataUrl, rotation) {
  const image = await loadImage(dataUrl);
  const swap = rotation === 90 || rotation === 270;
  const sourceWidth = swap ? image.height : image.width;
  const sourceHeight = swap ? image.width : image.height;
  const scale = Math.min(1, 2400 / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, width, height);
  context.translate(width / 2, height / 2); context.rotate(rotation * Math.PI / 180);
  const drawWidth = image.width * scale; const drawHeight = image.height * scale;
  context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  return canvas.toDataURL('image/jpeg', .9);
}

async function enhanceReceiptImage(dataUrl) {
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, 2000 / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  const frame = context.getImageData(0, 0, width, height);
  const pixels = frame.data;
  const histogram = new Uint32Array(256);
  const total = width * height;
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = Math.round(.299 * pixels[i] + .587 * pixels[i + 1] + .114 * pixels[i + 2]);
    histogram[gray] += 1;
  }
  const percentile = fraction => {
    const target = Math.floor(total * fraction);
    let count = 0;
    for (let value = 0; value < histogram.length; value += 1) {
      count += histogram[value];
      if (count >= target) return value;
    }
    return 255;
  };
  const low = percentile(.015);
  const high = Math.max(low + 24, percentile(.99));
  const span = high - low;
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = .299 * pixels[i] + .587 * pixels[i + 1] + .114 * pixels[i + 2];
    const normalized = Math.max(0, Math.min(255, Math.round((gray - low) * 255 / span)));
    pixels[i] = normalized; pixels[i + 1] = normalized; pixels[i + 2] = normalized;
  }
  context.putImageData(frame, 0, 0);
  return canvas.toDataURL('image/jpeg', .88);
}

async function analyzeImage() {
  if (!ensureConnected()) return;
  if (!state.previewDataUrl) return toast('กรุณาเลือกรูปใบชั่งก่อน');
  const requestId = state.ocrRequestId || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  state.ocrRequestId = requestId;
  setLoading(true, 'กำลังส่งบิลให้ AI อ่าน…');
  try {
    const image = await imagePayload(state.previewDataUrl);
    let imageAlternates = [];
    try {
      imageAlternates = [await imagePayload(await enhanceReceiptImage(state.previewDataUrl))];
    } catch (enhancementError) {
      console.warn('Receipt contrast enhancement skipped; sending original image only', enhancementError);
    }
    const payload = { image, imageAlternates, source: state.source, schemaVersion: '1.0.0' };
    const maxAttempts = 45;
    let lastError = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        if (attempt > 0) setLoading(true, 'AI ยังประมวลผลอยู่… กำลังตรวจผลให้อัตโนมัติ');
        const data = await api('sales.analyze', payload, true, { timeoutMs: attempt === 0 ? 90000 : 20000, requestId });
        if (data && data.state === 'PROCESSING') {
          await new Promise(resolve => setTimeout(resolve, 4000));
          continue;
        }
        if (data && data.state === 'FAILED') {
          state.ocrRequestId = '';
          throw appError(data.errorCode || 'OCR_FAILED', data.message || 'AI อ่านบิลไม่สำเร็จ');
        }
        state.receipt = data.receipt; state.ocrRunId = data.ocrRunId; state.model = data.model;
        state.ocrRequestId = '';
        openReview(data.receipt, data.lowConfidenceFields || [], data.validation, false);
        if (data.duplicateCandidates && data.duplicateCandidates.length) showValidation({ warnings: [{ message: 'พบรายการเดิมที่คล้ายกัน โปรดตรวจสอบก่อนบันทึก' }] });
        return;
      } catch (error) {
        lastError = error;
        if (!['REQUEST_TIMEOUT', 'NETWORK_ERROR', 'INVALID_RESPONSE'].includes(error.code)) {
          state.ocrRequestId = '';
          throw error;
        }
        if (attempt === maxAttempts - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    if (lastError) throw lastError;
    throw appError('OCR_STILL_PROCESSING', 'ระบบยังประมวลผลภาพอยู่ คำขอเดิมยังถูกเก็บไว้ กดปุ่มอีกครั้งภายหลังเพื่อตรวจผลโดยไม่วิเคราะห์ซ้ำ');
  } catch (error) { handleError(error); }
  finally { setLoading(false); }
}

function openManualForm() {
  state.source = 'MANUAL'; state.receipt = emptyReceipt(); state.ocrRunId = ''; state.ocrRequestId = ''; state.model = '';
  openReview(state.receipt, [], { warnings: [] }, false);
}

function openReview(receipt, lowFields, validation, editing, laborEntries = []) {
  state.receipt = receipt;
  $('#review-title').textContent = editing ? 'แก้ไขรายการขาย' : (state.source === 'MANUAL' ? 'เพิ่มข้อมูลด้วยตนเอง' : 'ข้อมูลจากใบชั่ง');
  const confidence = Math.round(Number(receipt.overallConfidence || 0) * 100);
  $('#confidence-badge').textContent = state.source === 'MANUAL' ? 'กรอกเอง' : `มั่นใจ ${confidence}%`;
  $('#confidence-badge').classList.toggle('low', confidence < 75 && state.source !== 'MANUAL');
  $$('#sale-form [name]').forEach(input => { if (input.name !== 'deductionType' && input.name !== 'deductionAmount') input.value = valueForInput(receipt[input.name]); });
  $('#deductions-list').innerHTML = '';
  (receipt.deductions || []).forEach(addDeductionRow);
  prepareLaborUI(laborEntries);
  loadContractors().catch(() => {});
  $$('#sale-form label').forEach(label => label.classList.remove('low-confidence'));
  lowFields.forEach(field => { const input = $(`#sale-form [name="${cssEscape(field)}"]`); if (input) input.closest('label').classList.add('low-confidence'); });
  showValidation(validation || { warnings: [] });
  $('#preview-panel').classList.add('hidden'); $('#review-panel').classList.remove('hidden');
  $('#review-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); saveDraft();
}

function addDeductionRow(item = {}) {
  const row = document.createElement('div'); row.className = 'deduction-row';
  row.innerHTML = `<label>ประเภท<select name="deductionType"><option value="WEIGHT">หักน้ำหนัก</option><option value="PERCENT">หักเปอร์เซ็นต์</option><option value="TRANSPORT">ค่าขนส่ง</option><option value="LABOR">ค่าแรง</option><option value="SERVICE">ค่าบริการ</option><option value="OTHER">อื่น ๆ</option></select></label><label>จำนวนเงิน<input name="deductionAmount" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(item.amount ?? '')}"></label><button class="remove" type="button" aria-label="ลบรายการ">×</button>`;
  row.querySelector('select').value = item.type || 'OTHER';
  row.querySelector('.remove').addEventListener('click', () => { row.remove(); calculateAmounts(); saveDraft(); });
  $('#deductions-list').appendChild(row); calculateAmounts();
}

function calculateAmounts() {
  const form = $('#sale-form');
  const net = numberOrNull(form.elements.netWeightKg.value);
  const deductedWeight = numberOrNull(form.elements.deductionWeightKg.value) || 0;
  if (net !== null && !form.elements.payableWeightKg.value) form.elements.payableWeightKg.value = Math.max(0, net - deductedWeight);
  const payable = numberOrNull(form.elements.payableWeightKg.value);
  const price = numberOrNull(form.elements.pricePerKg.value);
  if (payable !== null && price !== null && !form.elements.grossAmount.dataset.userEdited) form.elements.grossAmount.value = round2(payable * price);
  const total = $$('#deductions-list [name="deductionAmount"]').reduce((sum, input) => sum + (numberOrNull(input.value) || 0), 0);
  if (total || !form.elements.totalDeduction.value) form.elements.totalDeduction.value = round2(total);
  const gross = numberOrNull(form.elements.grossAmount.value);
  if (gross !== null) form.elements.netAmount.value = round2(gross - (numberOrNull(form.elements.totalDeduction.value) || 0));
  calculateLaborTotals();
}

function collectReceipt() {
  const form = $('#sale-form');
  const text = name => form.elements[name].value.trim() || null;
  const number = name => numberOrNull(form.elements[name].value);
  return {
    schemaVersion: '1.0.0', documentType: 'PALM_WEIGHING_RECEIPT', receiptNumber: text('receiptNumber'),
    saleDate: text('saleDate'), timeIn: text('timeIn'), timeOut: text('timeOut'), buyerName: text('buyerName'),
    branch: text('branch'), customerName: text('customerName'), vehiclePlate: text('vehiclePlate'),
    customerCode: state.receipt?.customerCode || null, productCode: state.receipt?.productCode || null,
    productName: state.receipt?.productName || 'ทะลายปาล์มน้ำมัน', grossWeightKg: number('grossWeightKg'),
    tareWeightKg: number('tareWeightKg'), netWeightKg: number('netWeightKg'),
    deductionWeightKg: number('deductionWeightKg') || 0, payableWeightKg: number('payableWeightKg'),
    pricePerKg: number('pricePerKg'), grossAmount: number('grossAmount'), totalDeduction: number('totalDeduction') || 0,
    netAmount: number('netAmount'), deductions: $$('.deduction-row').map(row => ({
      type: row.querySelector('[name="deductionType"]').value, description: null, quantity: null, unit: null, rate: null,
      amount: numberOrNull(row.querySelector('[name="deductionAmount"]').value) || 0
    })), notes: text('notes'), handwrittenNotes: state.receipt?.handwrittenNotes || null,
    overallConfidence: Number(state.receipt?.overallConfidence || 0), fieldConfidence: state.receipt?.fieldConfidence || [],
    missingFields: [], warnings: [], imageIssues: state.receipt?.imageIssues || []
  };
}

async function saveSale(event, duplicateOverride = false) {
  event?.preventDefault();
  if (!ensureConnected()) return;
  const sale = collectReceipt();
  let laborEntries;
  try { laborEntries = collectLaborEntries(); }
  catch (error) { handleError(error); $('#labor-fieldset').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const contractorUpdates = collectContractorUpdates();
  const saveButton = $('#save-button');
  saveButton.disabled = true;
  saveButton.setAttribute('aria-busy', 'true');
  if (state.editingSaleId) {
    saveButton.textContent = 'กำลังบันทึกการแก้ไข…';
    setSyncStatus('กำลังบันทึกการแก้ไข…');
    showSaveFeedback('working', 'กำลังบันทึกการแก้ไข', 'กรุณารอสักครู่ ระบบกำลังตรวจสอบและอัปเดตข้อมูล');
    try {
      const data = await api('sales.update', { saleId: state.editingSaleId, expectedUpdatedAt: state.expectedUpdatedAt, sale, laborEntries }, true, { timeoutMs: 45000 });
      await applyContractorUpdates(contractorUpdates);
      localStorage.removeItem('palmDraft'); resetCapture();
      await showView('history');
      showSaveFeedback('success', data.updated ? 'แก้ไขข้อมูลสำเร็จ' : 'บันทึกข้อมูลสำเร็จ', 'ข้อมูลล่าสุดแสดงอยู่ในหน้ารายการแล้ว', 4200);
    } catch (error) {
      showSaveFeedback('error', 'แก้ไขข้อมูลไม่สำเร็จ', error.message || 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง', 6500);
      handleError(error);
    } finally {
      saveButton.disabled = false;
      saveButton.removeAttribute('aria-busy');
      saveButton.innerHTML = 'ยืนยันและบันทึก <span>→</span>';
    }
    return;
  }

  saveButton.textContent = 'กำลังเก็บไว้ในเครื่อง…';
  setSyncStatus('กำลังบันทึกรายการ…');
  showSaveFeedback('working', 'กำลังบันทึกรายการ', 'กำลังเก็บข้อมูลและภาพใบชั่งไว้ในเครื่องอย่างปลอดภัย');
  try {
    const image = state.previewDataUrl ? await imagePayload(state.previewDataUrl) : null;
    const idempotencyKey = getIdempotencyKey();
    await queuePut({
      id: idempotencyKey,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      attempts: 0,
      status: 'pending',
      lastError: '',
      payload: { sale, laborEntries, contractorUpdates, image, source: state.source, ocrRunId: state.ocrRunId, model: state.model,
        idempotencyKey, duplicateOverride }
    });
    localStorage.removeItem('palmDraft');
    localStorage.removeItem('palmIdempotencyKey');
    resetCapture();
    await refreshQueueUI();
    showSaveFeedback('queued', 'เก็บรายการไว้ในเครื่องแล้ว', 'ระบบกำลังส่งเข้า Google Sheets อัตโนมัติ คุณปิดหน้านี้ได้', 5200);
    processPendingSaves(true);
  } catch (error) {
    showSaveFeedback('error', 'บันทึกรายการไม่สำเร็จ', 'ข้อมูลยังอยู่ในแบบฟอร์ม กรุณาอย่าเพิ่งปิดหน้านี้แล้วลองอีกครั้ง', 7000);
    handleError(appError('LOCAL_SAVE_FAILED', 'เก็บรายการไว้ในเครื่องไม่สำเร็จ กรุณาอย่าเพิ่งปิดหน้านี้', { message: error.message }));
  } finally {
    saveButton.disabled = false;
    saveButton.removeAttribute('aria-busy');
    saveButton.innerHTML = 'ยืนยันและบันทึก <span>→</span>';
  }
}

function resetCapture() {
  Object.assign(state, { originalDataUrl: '', previewDataUrl: '', rotation: 0, source: 'MANUAL', receipt: null,
    ocrRunId: '', ocrRequestId: '', model: '', editingSaleId: '', expectedUpdatedAt: '' });
  $('#preview-panel').classList.add('hidden'); $('#review-panel').classList.add('hidden'); $('#sale-form').reset();
  $('#deductions-list').innerHTML = ''; $('#labor-entries-list').innerHTML = ''; localStorage.removeItem('palmDraft');
}

async function loadDashboard() {
  if (!ensureConnected(false)) return;
  setDashboardExportBusy(true);
  setLoading(true, 'กำลังสรุปข้อมูล…');
  try {
    const selectedYear = $('#dashboard-year').value || 'all';
    let data = await api('dashboard.summary', { year: selectedYear });
    // Older backend versions do not understand the special `all` scope.
    if (selectedYear === 'all' && data.allYears === undefined) {
      data = await api('dashboard.summary', { year: new Date().getFullYear() });
      data.availableYears = data.availableYears || [];
    }
    updateDashboardYears(data.availableYears || [], data.year || selectedYear);
    const allYears = Boolean(data.allYears || data.year === 'all');
    state.dashboardSeries = Array.isArray(data.monthlySeries) ? data.monthlySeries : [];
    state.dashboardAllYears = allYears;
    state.dashboardYear = String(data.year || selectedYear);
    $('#sum-weight-label').textContent = allYears ? 'ผลผลิตทั้งหมด' : `ผลผลิตปี ${Number(data.year) + 543}`;
    $('#sum-revenue-label').textContent = allYears ? 'คงเหลือหลังค่าแรงทั้งหมด' : `คงเหลือหลังค่าแรงปี ${Number(data.year) + 543}`;
    $('#sum-weight').textContent = formatNumber(data.totalWeightTon, 2); $('#sum-revenue').textContent = formatMoney(data.netAfterLabor);
    $('#sum-labor').textContent = formatMoney(data.totalLaborCost);
    $('#sum-labor-balance').textContent = `ค้างจ่าย ${formatMoney(data.laborBalanceDue)}`;
    $('#sum-gross-revenue').textContent = formatMoney(data.totalRevenue);
    $('#sum-price').textContent = formatNumber(data.averagePricePerKg, 2); $('#sum-count').textContent = formatNumber(data.saleCount, 0);
    $('#monthly-period-label').textContent = allYears ? 'สรุปแยกตามเดือนจากทุกปี' : `รายเดือน ปี ${Number(data.year || selectedYear) + 543}`;
    $('#dashboard-data-note').textContent = allYears
      ? 'นับเฉพาะรายการขายที่บันทึกแล้ว • มุมมองทุกปีรวมเดือนชื่อเดียวกันเข้าด้วยกัน จึงใช้ดูฤดูกาล ไม่ใช่เส้นเวลาเรียงปีต่อปี'
      : 'รายรับคือยอดสุทธิจากใบชั่งก่อนหักค่าแรง • ราคาเฉลี่ยถ่วงน้ำหนักตามกิโลกรัม • นับเฉพาะรายการขายที่บันทึกแล้ว';
    renderDashboardAnalytics(); renderBuyers(data.buyerComparison || []);
  } catch (error) { handleError(error); } finally { setLoading(false); setDashboardExportBusy(false); }
}

function renderDashboardAnalytics() {
  renderMonthlyChart(state.dashboardSeries, state.dashboardMetric, state.dashboardAllYears);
  renderMonthlyInsights(state.dashboardSeries, state.dashboardAllYears);
  renderMonthlyBreakdown(state.dashboardSeries, state.dashboardAllYears);
}

function handleDashboardMetricClick(event) {
  const button = event.target.closest('[data-dashboard-metric]');
  if (!button) return;
  const metric = button.dataset.dashboardMetric;
  if (!['revenue', 'price', 'weight'].includes(metric)) return;
  state.dashboardMetric = metric;
  $$('#dashboard-metric-tabs [data-dashboard-metric]').forEach(item => {
    item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
  });
  renderMonthlyChart(state.dashboardSeries, state.dashboardMetric, state.dashboardAllYears);
}

function formatChartAxis(value, metric) {
  const number = Number(value || 0);
  if (metric === 'price') return formatNumber(number, 2);
  return new Intl.NumberFormat('th-TH', { notation: 'compact', maximumFractionDigits: 1 }).format(number);
}

function renderMonthlyChart(series, metric, allYears) {
  const analytics = window.PalmDashboardAnalytics;
  const items = analytics.normalizeSeries(series);
  const config = {
    revenue: { title: 'ยอดรับจากใบชั่ง', unit: 'บาท' },
    price: { title: 'ราคาเฉลี่ยต่อกิโลกรัม', unit: 'บาท/กก.' },
    weight: { title: 'ผลผลิตที่ขายได้', unit: 'กิโลกรัม' }
  }[metric] || { title: 'ยอดรับจากใบชั่ง', unit: 'บาท' };
  const values = items.map(item => analytics.metricValue(item, metric));
  const max = Math.max(0, ...values);
  const scaleMax = max || 1;
  const hasSales = items.some(item => item.saleCount > 0);
  const hasMetricData = hasSales && max > 0;
  const chart = $('#monthly-chart');
  const axis = $('#monthly-chart-axis');
  const months = $('#monthly-chart-months');
  $('#monthly-chart-title').textContent = config.title;
  $('#monthly-chart-unit').textContent = config.unit;
  axis.innerHTML = [max, max / 2, 0].map(value => `<span>${escapeHtml(formatChartAxis(value, metric))}</span>`).join('');
  months.innerHTML = items.map(item => `<span title="${escapeHtml(analytics.monthLabel(item.month))}">${escapeHtml(analytics.monthLabel(item.month))}</span>`).join('');
  chart.setAttribute('aria-label', `${config.title} ${allYears ? 'รวมแยกตามเดือนจากทุกปี' : `ปี ${Number(state.dashboardYear) + 543}`}`);

  const grid = '<span class="chart-gridline top"></span><span class="chart-gridline middle"></span><span class="chart-gridline bottom"></span>';
  if (!hasMetricData) {
    chart.innerHTML = `${grid}<div class="chart-empty-state">${hasSales ? 'มีรายการขาย แต่ช่วงนี้ไม่มีค่าของตัวชี้วัดนี้' : 'ยังไม่มีรายการขายในช่วงที่เลือก'}</div>`;
    return;
  }

  if (metric === 'price') {
    const width = 1200;
    const height = 184;
    const points = items.map((item, index) => {
      const value = analytics.metricValue(item, metric);
      if (item.saleCount <= 0 || value <= 0) return null;
      return {
        x: ((index + .5) / items.length) * width,
        y: height - 8 - (value / scaleMax) * (height - 20),
        label: `${analytics.monthLabel(item.month)}: ${formatNumber(value, 2)} บาท/กก. • ${formatNumber(item.saleCount)} ใบ`
      };
    });
    const segments = [];
    let segment = [];
    points.forEach(point => {
      if (point) segment.push(point);
      else if (segment.length) { segments.push(segment); segment = []; }
    });
    if (segment.length) segments.push(segment);
    const line = segments.map(group => {
      const polyline = group.length > 1
        ? `<polyline points="${group.map(point => `${point.x},${point.y}`).join(' ')}"></polyline>` : '';
      const circles = group.map(point => `<circle cx="${point.x}" cy="${point.y}" r="7"><title>${escapeHtml(point.label)}</title></circle>`).join('');
      return `${polyline}${circles}`;
    }).join('');
    chart.innerHTML = `${grid}<svg class="price-line-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${line}</svg>`;
    return;
  }

  const bars = items.map(item => {
    const value = analytics.metricValue(item, metric);
    const barHeight = value > 0 ? Math.max(1.5, Math.min(100, value / scaleMax * 100)) : 0;
    const valueLabel = metric === 'revenue' ? formatMoney(value) : `${formatNumber(value, 0)} กก.`;
    const title = `${analytics.monthLabel(item.month)} • ${valueLabel} • ${formatNumber(item.saleCount)} ใบ`;
    return `<div class="chart-bar-column"><div class="chart-bar" style="height:${barHeight}%" title="${escapeHtml(title)}"></div></div>`;
  }).join('');
  chart.innerHTML = `${grid}<div class="chart-bars" aria-hidden="true">${bars}</div>`;
}

function renderMonthlyInsights(series, allYears) {
  const analytics = window.PalmDashboardAnalytics;
  const cards = analytics.insightCards(series, allYears);
  const container = $('#monthly-insights');
  if (!cards.length) {
    container.innerHTML = '<div class="analytics-empty">ยังไม่มีรายการขายที่บันทึกในช่วงนี้</div>';
    return;
  }
  container.innerHTML = cards.map(card => {
    if (card.key === 'price-change') {
      const direction = card.value > 0 ? 'เพิ่มขึ้น' : card.value < 0 ? 'ลดลง' : 'ไม่เปลี่ยน';
      const className = card.value > 0 ? 'change-up' : card.value < 0 ? 'change-down' : 'change-flat';
      const percent = Number.isFinite(card.percent) ? ` • ${card.percent > 0 ? '+' : ''}${formatNumber(card.percent, 1)}%` : '';
      return `<article class="insight-card ${className}"><span>${escapeHtml(card.label)}</span><strong>${direction} ${formatNumber(Math.abs(card.value), 2)}</strong><small>${escapeHtml(card.month)}${percent} บาท/กก.</small></article>`;
    }
    const value = card.key === 'revenue' ? formatMoney(card.value)
      : card.key === 'price' ? `${formatNumber(card.value, 2)} บาท/กก.`
        : `${formatNumber(card.value / 1000, 2)} ตัน`;
    return `<article class="insight-card"><span>${escapeHtml(card.label)}</span><strong>${value}</strong><small>${escapeHtml(card.month)}</small></article>`;
  }).join('');
}

function renderMonthlyBreakdown(series) {
  const analytics = window.PalmDashboardAnalytics;
  const { months: items, totals } = analytics.summarizeSeries(series);
  $('#monthly-breakdown-body').innerHTML = items.map(item => {
    const hasSales = item.saleCount > 0;
    return `<tr><th scope="row">${analytics.monthLabel(item.month)}</th><td>${hasSales ? formatNumber(item.saleCount) : '—'}</td><td>${hasSales ? `${formatNumber(item.weightKg, 0)} กก.` : '—'}</td><td>${hasSales ? formatMoney(item.revenue) : '—'}</td><td>${hasSales ? `${formatNumber(item.averagePricePerKg, 2)} บาท` : '—'}</td><td>${hasSales ? formatMoney(item.laborCost) : '—'}</td><td>${hasSales ? formatMoney(item.netAfterLabor) : '—'}</td></tr>`;
  }).join('');
  const averagePrice = totals.averagePricePerKg;
  $('#monthly-breakdown-total').innerHTML = `<tr><th scope="row">รวมช่วงที่เลือก</th><td>${formatNumber(totals.saleCount)}</td><td>${formatNumber(totals.weightKg, 0)} กก.</td><td>${formatMoney(totals.revenue)}</td><td>${formatNumber(averagePrice, 2)} บาท</td><td>${formatMoney(totals.laborCost)}</td><td>${formatMoney(totals.netAfterLabor)}</td></tr>`;
}

function getDashboardExportReport() {
  if (!Array.isArray(state.dashboardSeries) || !state.dashboardSeries.length) {
    toast('กรุณารอให้แดชบอร์ดโหลดข้อมูลก่อนส่งออก');
    return null;
  }
  const selectedScope = $('#dashboard-year').value || 'all';
  const loadedScope = state.dashboardAllYears ? 'all' : state.dashboardYear;
  if (String(selectedScope) !== String(loadedScope)) {
    toast('กำลังโหลดข้อมูลของช่วงเวลาที่เลือก กรุณารอสักครู่');
    return null;
  }
  const allYears = Boolean(state.dashboardAllYears);
  const selectedYear = Number(state.dashboardYear) || new Date().getFullYear();
  return {
    ...window.PalmDashboardAnalytics.summarizeSeries(state.dashboardSeries),
    allYears,
    periodLabel: allYears ? 'ทุกปี — รวมเดือนชื่อเดียวกันจากทุกปี' : `ปี ${selectedYear + 543}`,
    filePeriod: allYears ? 'all-years' : String(selectedYear),
    generatedAt: new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
  };
}

function getDashboardExportTable(report) {
  return window.PalmDashboardAnalytics.exportTable(report.months, report.periodLabel);
}

function exportDashboardCsv() {
  try {
    const report = getDashboardExportReport();
    if (!report) return;
    const { columns, rows } = getDashboardExportTable(report);
    const csv = window.PalmDashboardAnalytics.toCsv({ columns, rows });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `palm-ledger-monthly-${report.filePeriod}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('ดาวน์โหลด CSV สรุปรายเดือนแล้ว');
  } catch (error) {
    console.error('Dashboard CSV export failed', error);
    toast('ส่งออก CSV ไม่สำเร็จ กรุณาลองอีกครั้ง');
  }
}

function formatDashboardExportCell(key, value) {
  if (value === '' || value === null || value === undefined) return '—';
  if (key === 'saleCount') return formatNumber(value, 0);
  if (key === 'weightKg') return `${formatNumber(value, 2)} กก.`;
  if (key === 'averagePricePerKg') return `${formatNumber(value, 2)} บาท`;
  if (['revenue', 'laborCost', 'netAfterLabor'].includes(key)) return formatMoney(value);
  return String(value);
}

function exportDashboardPdf() {
  let cleanup;
  try {
    const report = getDashboardExportReport();
    if (!report) return;
    if (typeof window.print !== 'function') {
      toast('เบราว์เซอร์นี้ไม่รองรับการพิมพ์เป็น PDF');
      return;
    }
    const { columns, rows } = getDashboardExportTable(report);
    const printColumns = columns.filter(([key]) => key !== 'period');
    const note = report.allYears
      ? 'มุมมองทุกปีรวมเดือนชื่อเดียวกันจากหลายปี จึงใช้ดูฤดูกาล ไม่ใช่แนวโน้มเรียงตามปี'
      : 'รวมเฉพาะรายการขายที่บันทึกแล้ว • ราคาเฉลี่ยถ่วงน้ำหนักตามกิโลกรัม';
    let reportElement = $('#dashboard-print-report');
    if (!reportElement) {
      reportElement = document.createElement('section');
      reportElement.id = 'dashboard-print-report';
      reportElement.setAttribute('role', 'document');
      document.body.appendChild(reportElement);
    }
    reportElement.innerHTML = `
      <header class="dashboard-print-header">
        <div class="dashboard-print-brand">PALM LEDGER <span>สมุดสวนปาล์ม</span></div>
        <h1>รายงานสรุปรายเดือน</h1>
        <p>ช่วงเวลา: ${escapeHtml(report.periodLabel)} <span>•</span> สร้างเมื่อ ${escapeHtml(report.generatedAt)}</p>
        <p class="dashboard-print-note">${escapeHtml(note)}<br>ยอดรับจากใบชั่งเป็นยอดก่อนหักค่าแรง และยอดคงเหลือหลังค่าแรงยังไม่ใช่กำไรสุทธิ</p>
      </header>
      <table aria-label="สรุปข้อมูลรายเดือน">
        <thead><tr>${printColumns.map(([, label]) => `<th scope="col">${escapeHtml(label)}</th>`).join('')}</tr></thead>
        <tbody>${rows.slice(0, -1).map(row => `<tr>${printColumns.map(([key]) => `<td>${escapeHtml(formatDashboardExportCell(key, row[key]))}</td>`).join('')}</tr>`).join('')}</tbody>
        <tfoot><tr>${printColumns.map(([key]) => `<td>${escapeHtml(formatDashboardExportCell(key, rows[rows.length - 1][key]))}</td>`).join('')}</tr></tfoot>
      </table>
      <footer class="dashboard-print-footer">รายงานนี้สร้างจากข้อมูลสรุปในแดชบอร์ด PALM LEDGER</footer>`;
    reportElement.setAttribute('aria-hidden', 'false');

    const previousTitle = document.title;
    document.title = `PALM_LEDGER_monthly_${report.filePeriod}`;
    let cleanupTimer;
    cleanup = () => {
      reportElement.setAttribute('aria-hidden', 'true');
      document.title = previousTitle;
      window.removeEventListener('afterprint', cleanup);
      window.clearTimeout(cleanupTimer);
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    cleanupTimer = window.setTimeout(cleanup, 120000);
    window.print();
    toast('ในหน้าพิมพ์ เลือก “บันทึกเป็น PDF” เพื่อดาวน์โหลดรายงาน');
  } catch (error) {
    if (cleanup) cleanup();
    console.error('Dashboard PDF export failed', error);
    toast('เปิดรายงาน PDF ไม่สำเร็จ กรุณาลองอีกครั้ง');
  }
}

function renderBuyers(items) {
  const container = $('#buyer-comparison');
  container.classList.toggle('empty', !items.length);
  container.innerHTML = items.length ? items.map(item => `<article class="buyer-row"><strong>${escapeHtml(item.buyerName)}</strong><span>${formatNumber(item.totalWeightKg, 0)} กก. • ${item.saleCount} ครั้ง • เฉลี่ย ${formatNumber(item.averagePricePerKg, 2)} บาท/กก. • ค่าแรง ${formatMoney(item.totalLaborCost)}</span><b>${formatMoney(item.netAfterLabor ?? item.totalRevenue)}</b></article>`).join('') : 'ยังไม่มีข้อมูล';
}

async function loadHistory() {
  if (!ensureConnected(false)) return;
  updateFilterDrawerStatus();
  setLoading(true, 'กำลังโหลดประวัติ…');
  try {
    if (!state.contractorsLoaded) await loadContractors();
    const monthValue = $('#filter-month').value;
    const query = normalizeSearch($('#filter-search').value);
    const workMode = $('#filter-work-mode').value;
    const contractorId = $('#filter-contractor').value;
    const paymentStatus = $('#filter-payment-status').value;
    const fromDate = $('#filter-date-from').value;
    const toDate = $('#filter-date-to').value;
    const filters = { limit: 100 };
    if (monthValue) { filters.year = monthValue.slice(0, 4); filters.month = monthValue.slice(5, 7); }
    if (fromDate) filters.fromDate = fromDate;
    if (toDate) filters.toDate = toDate;
    const items = await api('sales.list', filters);
    const filtered = items.filter(item => {
      const laborEntries = item.laborEntries || [];
      const searchable = normalizeSearch(`${item.ReceiptNumber || ''} ${item.BuyerNameRaw || ''} ${laborEntries.map(entry => entry.ContractorNameSnapshot || '').join(' ')}`);
      if (query && !searchable.includes(query)) return false;
      if (workMode && !laborEntries.some(entry => String(entry.WorkMode).toUpperCase() === workMode)) return false;
      if (contractorId && !laborEntries.some(entry => String(entry.ContractorID) === contractorId)) return false;
      if (paymentStatus && String(item.laborSummary?.paymentStatus || '').toUpperCase() !== paymentStatus) return false;
      return true;
    });
    const pending = (await queueGetAll().catch(() => [])).filter(job => {
      const sale = job.payload?.sale || {};
      const laborEntries = job.payload?.laborEntries || [];
      if (monthValue && String(sale.saleDate || '').slice(0, 7) !== monthValue) return false;
      if (fromDate && String(sale.saleDate || '') < fromDate) return false;
      if (toDate && String(sale.saleDate || '') > toDate) return false;
      if (query && !normalizeSearch(`${sale.receiptNumber || ''} ${sale.buyerName || ''}`).includes(query)) return false;
      if (workMode && !laborEntries.some(entry => String(entry.workMode || '').toUpperCase() === workMode)) return false;
      if (contractorId && !laborEntries.some(entry => String(entry.contractorId || '') === contractorId)) return false;
      if (paymentStatus && paymentStatus !== 'UNPAID') return false;
      return true;
    });
    const totalVisible = filtered.length + pending.length;
    const hasFilters = monthValue || query || workMode || contractorId || paymentStatus || fromDate || toDate;
    $('#history-count').textContent = hasFilters ? `ล่าสุดอยู่บนสุด • แสดง ${totalVisible} รายการตามตัวกรอง` : `ล่าสุดอยู่บนสุด • พบ ${totalVisible} รายการ`;
    renderHistory(filtered, pending);
  } catch (error) { $('#history-count').textContent = 'โหลดรายการไม่สำเร็จ'; handleError(error); } finally { setLoading(false); }
}

function renderHistory(items, pending = []) {
  const container = $('#history-list'); container.classList.toggle('empty', !items.length && !pending.length);
  if (!items.length && !pending.length) { container.textContent = 'ยังไม่มีข้อมูลการขาย'; return; }
  const entries = [
    ...items.map((item, index) => ({ kind: 'saved', item, date: saleDateValue(item.SaleDate), order: Date.parse(item.UpdatedAt || item.CreatedAt || '') || -index })),
    ...pending.map((job, index) => ({ kind: 'pending', job, date: saleDateValue(job.payload?.sale?.saleDate), order: Number(job.createdAt || 0) || -index }))
  ].sort((a, b) => b.date - a.date || b.order - a.order);

  container.innerHTML = entries.map((entry, index) => {
    const latestBadge = index === 0 ? '<span class="latest-badge">ล่าสุด</span>' : '';
    const card = entry.kind === 'pending' ? renderPendingHistoryCard(entry.job, latestBadge) : renderSavedHistoryCard(entry.item, latestBadge);
    if (index === entries.length - 1) return card;
    return card + renderSaleGap(entry.date, entries[index + 1].date);
  }).join('');
  $$('.view-receipt').forEach(button => button.addEventListener('click', () => openReceiptViewer(button.dataset)));
  $$('.edit-sale').forEach(button => button.addEventListener('click', () => editSale(button.dataset.saleId)));
  $$('.view-sale-detail').forEach(button => button.addEventListener('click', () => openSaleDetail(button.dataset.saleId)));
}

function renderPendingHistoryCard(job, latestBadge) {
  const sale = job.payload?.sale || {};
  const labor = clientLaborSummary(job.payload?.laborEntries || [], sale);
  return `<article class="history-card pending"><div class="history-main"><div><div class="history-date-row"><h3>${escapeHtml(formatThaiDate(sale.saleDate))}</h3>${latestBadge}</div><p>${escapeHtml(sale.buyerName || 'ไม่ระบุลาน')} • ${formatNumber(sale.netWeightKg, 0)} กก.</p><p>ค่าแรง ${formatMoney(labor.totalLaborCost)} • คงเหลือ ${formatMoney(labor.netAfterLabor)}</p></div><div class="amount"><strong>เก็บไว้แล้ว</strong><small>${job.status === 'blocked' ? 'รอยืนยันรายการซ้ำ' : 'กำลังส่งอัตโนมัติ'}</small></div></div></article>`;
}

function renderSavedHistoryCard(item, latestBadge) {
    const imageButton = item.ImageFileID ? `<button class="history-action view-receipt" type="button" data-sale-id="${escapeHtml(item.SaleID)}" data-file-id="${escapeHtml(item.ImageFileID)}" data-drive-url="${escapeHtml(item.imageUrl || '')}" data-meta="${escapeHtml(`ใบชั่ง ${item.ReceiptNumber || '—'} • ${formatThaiDate(item.SaleDate)}`)}"><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3"/></svg> ดูภาพใบชั่ง</button>` : `<span class="no-receipt-image">ไม่มีรูปภาพ</span>`;
  const labor = item.laborSummary || { totalLaborCost: 0, balanceDue: 0, paymentStatus: 'PAID' };
  const status = labor.totalLaborCost <= 0 ? 'จัดการเอง' : (labor.paymentStatus === 'PAID' ? 'จ่ายครบแล้ว' : labor.paymentStatus === 'PARTIAL' ? 'จ่ายบางส่วน' : 'ยังไม่จ่าย');
  const contractorNames = (item.laborEntries || []).filter(entry => String(entry.WorkMode) !== 'SELF').map(entry => entry.ContractorNameSnapshot).filter(Boolean).join(', ');
  return `<article class="history-card" data-sale-id="${escapeHtml(item.SaleID)}"><div class="history-main"><div><div class="history-date-row"><h3>${escapeHtml(formatThaiDate(item.SaleDate))}</h3>${latestBadge}</div><p>${escapeHtml(item.BuyerNameRaw || 'ไม่ระบุลาน')} • ${formatNumber(item.NetWeightKg, 0)} กก.</p><p>${contractorNames ? `${escapeHtml(contractorNames)} • ` : ''}ค่าแรง ${formatMoney(labor.totalLaborCost)} • ${escapeHtml(status)}</p></div><div class="amount"><strong>${formatMoney(item.netAfterLabor ?? item.NetAmount)}</strong><small>คงเหลือหลังค่าแรง</small></div></div><div class="history-actions">${imageButton}<button class="history-action view-sale-detail" type="button" data-sale-id="${escapeHtml(item.SaleID)}">ดูรายละเอียด</button><button class="history-action edit-sale" type="button" data-sale-id="${escapeHtml(item.SaleID)}"><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg> แก้ไขข้อมูล</button></div></article>`;
}

function renderSaleGap(newerDate, olderDate) {
  if (!Number.isFinite(newerDate) || !Number.isFinite(olderDate)) return '<div class="sale-gap"><span>ระยะรอบไม่ทราบ</span></div>';
  const days = Math.max(0, Math.round((newerDate - olderDate) / 86400000));
  const label = days === 0 ? 'รอบเดียวกัน • วันเดียวกัน' : `ระยะรอบ ${formatNumber(days, 0)} วัน`;
  return `<div class="sale-gap" aria-label="${escapeHtml(label)}"><i aria-hidden="true"></i><span>${escapeHtml(label)}</span><i aria-hidden="true"></i></div>`;
}

function saleDateValue(value) {
  const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : Number.NEGATIVE_INFINITY;
}

function clientLaborSummary(entries, sale) {
  const weight = numberOrNull(sale.payableWeightKg) ?? numberOrNull(sale.netWeightKg) ?? 0;
  const totalLaborCost = round2((entries || []).reduce((sum, entry) => {
    const mode = String(entry.workMode || entry.WorkMode || '').toUpperCase();
    if (mode === 'SELF') return sum;
    const method = entry.calculationMethod || entry.CalculationMethod;
    const rate = numberOrNull(entry.rateSnapshot ?? entry.RateSnapshot) || 0;
    const amount = method === 'PER_KG' ? weight * rate : (numberOrNull(entry.headcount ?? entry.Headcount) || 0) * rate;
    return sum + amount;
  }, 0));
  return { totalLaborCost, netAfterLabor: round2((numberOrNull(sale.netAmount) || 0) - totalLaborCost) };
}

function openReceiptViewer(data) {
  const fileId = String(data.fileId || '');
  if (!/^[a-zA-Z0-9_-]+$/.test(fileId)) return toast('ไม่พบไฟล์ภาพของรายการนี้');
  state.viewingSaleId = data.saleId || '';
  $('#receipt-viewer-meta').textContent = data.meta || 'ภาพใบชั่ง';
  $('#receipt-frame').src = `https://drive.google.com/file/d/${fileId}/preview`;
  $('#open-receipt-drive').href = data.driveUrl || `https://drive.google.com/file/d/${fileId}/view`;
  const viewer = $('#receipt-viewer');
  if (typeof viewer.showModal === 'function') viewer.showModal();
  else viewer.setAttribute('open', '');
}

function closeReceiptViewer() {
  const viewer = $('#receipt-viewer');
  $('#receipt-frame').src = 'about:blank';
  state.viewingSaleId = '';
  if (typeof viewer.close === 'function' && viewer.open) viewer.close();
  else viewer.removeAttribute('open');
}

async function editSale(saleId) {
  setLoading(true, 'กำลังเปิดรายการ…');
  try {
    const item = await api('sales.get', { saleId });
    state.editingSaleId = item.SaleID; state.expectedUpdatedAt = item.UpdatedAt; state.source = 'MANUAL';
    const receipt = recordToReceipt(item); showView('home'); openReview(receipt, [], { warnings: [] }, true, item.laborEntries || []);
  } catch (error) { handleError(error); } finally { setLoading(false); }
}

function recordToReceipt(item) {
  return { receiptNumber:item.ReceiptNumber||null,saleDate:item.SaleDate||null,timeIn:item.TimeIn||null,timeOut:item.TimeOut||null,
    buyerName:item.BuyerNameRaw||null,branch:item.BranchRaw||null,customerName:item.CustomerName||null,vehiclePlate:item.VehiclePlate||null,
    productName:item.ProductName||null,grossWeightKg:numberOrNull(item.GrossWeightKg),tareWeightKg:numberOrNull(item.TareWeightKg),
    netWeightKg:numberOrNull(item.NetWeightKg),deductionWeightKg:numberOrNull(item.DeductionWeightKg),payableWeightKg:numberOrNull(item.PayableWeightKg),
    pricePerKg:numberOrNull(item.PricePerKg),grossAmount:numberOrNull(item.GrossAmount),totalDeduction:numberOrNull(item.TotalDeduction),
    netAmount:numberOrNull(item.NetAmount),notes:item.Notes||null,overallConfidence:Number(item.ConfidenceOverall||0),fieldConfidence:[],
    deductions:(item.deductions||[]).map(d=>({type:d.DeductionType,amount:d.Amount})) };
}

async function saveSettings() {
  const token = $('#access-token').value.trim();
  if (!token) return toast('กรุณาใส่ Access Token');
  state.accessToken = token; localStorage.setItem('palmAccessToken', token); updateConnectionUI();
  setLoading(true, 'กำลังทดสอบการเชื่อมต่อ…');
  try {
    const health = await api('health', {}, false, { timeoutMs: 20000 });
    await api('settings.get', {}, true, { timeoutMs: 20000 });
    await loadContractors();
    const box = $('#connection-result'); box.className = 'notice success'; box.textContent = `เชื่อมต่อสำเร็จ — Backend ${health.version}`;
    toast('เชื่อมต่อระบบเรียบร้อยแล้ว');
    hideAllSecrets();
    processPendingSaves(false);
  } catch (error) {
    const box = $('#connection-result'); box.className = 'notice error'; box.textContent = error.message; handleError(error);
  } finally { setLoading(false); }
}

async function api(action, payload = {}, includeToken = true, options = {}) {
  const body = { ...payload, action, requestId: options.requestId || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`) };
  if (includeToken && action !== 'health') body.accessToken = state.accessToken;
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || (action === 'sales.analyze' ? 90000 : 45000));
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(CONFIG.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow', signal: controller.signal });
    const text = await response.text(); let envelope;
    try { envelope = JSON.parse(text); } catch (error) { throw appError('INVALID_RESPONSE', 'Backend ส่งผลลัพธ์ที่อ่านไม่ได้'); }
    if (!envelope.ok) throw appError(envelope.error?.code || 'API_ERROR', envelope.error?.message || 'ระบบเกิดข้อผิดพลาด', envelope.error?.details);
    return envelope.data;
  } catch (error) {
    if (error.code) throw error;
    if (error.name === 'AbortError') throw appError('REQUEST_TIMEOUT', 'ระบบตอบกลับช้า รายการยังเก็บอยู่ในเครื่องและจะตรวจสอบให้อัตโนมัติ');
    throw appError('NETWORK_ERROR', navigator.onLine ? 'เชื่อมต่อ Backend ไม่สำเร็จ รายการยังเก็บอยู่ในเครื่อง' : 'ขณะนี้ออฟไลน์ รายการยังเก็บอยู่ในเครื่อง');
  } finally { clearTimeout(timeout); }
}

function initSaveQueue() {
  if (queueDbPromise) return queueDbPromise;
  queueDbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('อุปกรณ์นี้ไม่รองรับพื้นที่เก็บคิว'));
    const request = indexedDB.open(QUEUE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('เปิดคิวบันทึกไม่สำเร็จ'));
  });
  return queueDbPromise;
}

async function queuePut(job) {
  const db = await initSaveQueue();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(QUEUE_STORE, 'readwrite');
    transaction.objectStore(QUEUE_STORE).put(job);
    transaction.oncomplete = () => resolve(job);
    transaction.onerror = () => reject(transaction.error || new Error('เก็บคิวไม่สำเร็จ'));
  });
}

async function queueDelete(id) {
  const db = await initSaveQueue();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(QUEUE_STORE, 'readwrite');
    transaction.objectStore(QUEUE_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('ลบคิวไม่สำเร็จ'));
  });
}

async function queueGetAll() {
  const db = await initSaveQueue();
  return new Promise((resolve, reject) => {
    const request = db.transaction(QUEUE_STORE, 'readonly').objectStore(QUEUE_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('อ่านคิวไม่สำเร็จ'));
  });
}

async function refreshQueueUI() {
  const jobs = await queueGetAll().catch(() => []);
  const banner = $('#pending-banner');
  banner.classList.toggle('hidden', jobs.length === 0);
  $('#retry-pending').disabled = state.syncInProgress;
  if (!jobs.length) {
    if (state.accessToken) setSyncStatus(navigator.onLine ? 'เชื่อมต่อแล้ว — บันทึกครบ' : 'ออฟไลน์ — ไม่มีรายการค้าง');
    return jobs;
  }
  const blocked = jobs.filter(job => job.status === 'blocked' || job.status === 'error').length;
  $('#pending-title').textContent = state.syncInProgress ? `กำลังส่ง ${jobs.length} รายการ` : `เก็บไว้ในเครื่องแล้ว ${jobs.length} รายการ`;
  $('#pending-message').textContent = blocked ? `${blocked} รายการต้องกด “ส่งอีกครั้ง” เพื่อตรวจสอบ` : (navigator.onLine ? 'ระบบจะส่งขึ้น Google Sheets อัตโนมัติ' : 'จะส่งอัตโนมัติเมื่ออินเทอร์เน็ตกลับมา');
  setSyncStatus(state.syncInProgress ? `กำลังส่ง ${jobs.length} รายการ…` : `รอส่ง ${jobs.length} รายการ`);
  return jobs;
}

async function verifyQueuedSave(job) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await delay(1500 + attempt * 1000);
    try {
      const status = await api('sales.status', { idempotencyKey: job.id }, true, { timeoutMs: 15000 });
      if (status.saved) return true;
    } catch (error) {
      if (error.code === 'UNAUTHORIZED') throw error;
    }
  }
  return false;
}

async function processPendingSaves(interactive = false) {
  if (state.syncInProgress || !state.accessToken || !navigator.onLine) { await refreshQueueUI(); return; }
  state.syncInProgress = true;
  await refreshQueueUI();
  let savedCount = 0;
  try {
    const jobs = (await queueGetAll()).sort((a, b) => a.createdAt - b.createdAt);
    for (const job of jobs) {
      if ((job.status === 'blocked' || job.status === 'error') && !interactive) continue;
      if (job.status === 'blocked') {
        const approved = confirm('รายการนี้คล้ายกับใบชั่งเดิม\n\nหากตรวจแล้วว่าเป็นคนละรายการ ให้กด OK เพื่อบันทึกต่อ');
        if (!approved) continue;
        job.payload.duplicateOverride = true;
      }
      let sending = true;
      while (sending) {
        job.status = 'sending'; job.attempts = Number(job.attempts || 0) + 1; job.updatedAt = Date.now();
        await queuePut(job); await refreshQueueUI();
        try {
          await api('sales.create', job.payload, true, { timeoutMs: 50000 });
          try { await applyContractorUpdates(job.payload.contractorUpdates || []); }
          catch (contractorError) { console.warn('Unable to update contractor defaults', contractorError); }
          await queueDelete(job.id); savedCount += 1; sending = false;
        } catch (error) {
          if (error.code === 'DUPLICATE_SUSPECTED') {
            if (interactive && confirm('พบข้อมูลคล้ายกับใบชั่งเดิม\n\nยืนยันว่าเป็นรายการใหม่และบันทึกต่อหรือไม่?')) {
              job.payload.duplicateOverride = true;
              continue;
            }
            job.status = 'blocked'; job.lastError = error.message; job.updatedAt = Date.now();
            await queuePut(job);
            if (interactive) showSaveFeedback('queued', 'รายการยังไม่ถูกส่ง', 'พบข้อมูลคล้ายรายการเดิม รายการนี้ยังเก็บอยู่ในเครื่องและรอให้คุณยืนยัน', 7000);
            sending = false; continue;
          }
          if (['NETWORK_ERROR', 'REQUEST_TIMEOUT', 'INVALID_RESPONSE', 'RATE_LIMITED'].includes(error.code)) {
            const saved = await verifyQueuedSave(job);
            if (saved) { await queueDelete(job.id); savedCount += 1; }
            else {
              job.status = 'pending'; job.lastError = error.message; job.updatedAt = Date.now();
              await queuePut(job);
              if (interactive) showSaveFeedback('queued', 'เก็บรายการไว้แล้ว แต่ยังส่งไม่สำเร็จ', 'ระบบจะส่งเข้า Google Sheets ให้อัตโนมัติเมื่อการเชื่อมต่อพร้อม', 6500);
            }
            sending = false; continue;
          }
          job.status = error.code === 'UNAUTHORIZED' ? 'pending' : 'error';
          job.lastError = error.message; job.updatedAt = Date.now();
          await queuePut(job); sending = false;
          if (interactive) showSaveFeedback('error', 'ส่งข้อมูลไม่สำเร็จ', `${error.message || 'เกิดข้อผิดพลาด'} — รายการยังเก็บอยู่ในเครื่อง`, 7000);
          if (error.code === 'UNAUTHORIZED') { handleError(error); return; }
        }
      }
    }
  } finally {
    state.syncInProgress = false;
    const remaining = await refreshQueueUI();
    if (savedCount) showSaveFeedback('success', 'บันทึกสำเร็จ', `ส่งเข้า Google Sheets เรียบร้อยแล้ว ${savedCount} รายการ`, 4500);
    if (!remaining.length && $('#view-history').classList.contains('active')) loadHistory();
  }
}

function ensureConnected(showMessage = true) {
  if (state.accessToken) return true;
  if (showMessage) { toast('กรุณาใส่ Access Token ในเมนูตั้งค่าก่อน'); showView('settings'); }
  return false;
}

function updateConnectionUI() { $('#setup-alert').classList.toggle('hidden', Boolean(state.accessToken)); setSyncStatus(state.accessToken ? 'เชื่อมต่อแล้ว' : 'รอการเชื่อมต่อ'); }
function setSyncStatus(text) { $('#sync-status').textContent = text; }
function showValidation(validation) { const warnings = validation?.warnings || []; const errors = validation?.errors || []; $('#validation-messages').innerHTML = [...errors.map(x=>`<div class="notice error">${escapeHtml(x.message)}</div>`),...warnings.map(x=>`<div class="notice warning">${escapeHtml(x.message || x)}</div>`)].join(''); }
function initLoadingAnimation() {
  const container = $('#loading-animation');
  if (!container || !window.lottie) return;
  try {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    loadingAnimation = window.lottie.loadAnimation({
      container,
      renderer: 'svg',
      loop: true,
      autoplay: !reduceMotion,
      path: 'assets/loading.json',
      rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true }
    });
    loadingAnimation.addEventListener('DOMLoaded', () => {
      container.classList.add('ready');
      if (reduceMotion || $('#loading').classList.contains('hidden')) loadingAnimation.goToAndStop(0, true);
    });
    loadingAnimation.addEventListener('data_failed', () => container.classList.remove('ready'));
  } catch (error) { console.warn('Unable to start loading animation', error); }
}
function bindSaveFeedback() { $('#save-feedback-close').addEventListener('click', hideSaveFeedback); }
function showSaveFeedback(status, title, message, autoHideMs = 0) {
  const node = $('#save-feedback');
  clearTimeout(saveFeedbackTimer);
  node.className = `save-feedback ${status}`;
  node.setAttribute('aria-busy', status === 'working' ? 'true' : 'false');
  $('#save-feedback-title').textContent = title;
  $('#save-feedback-message').textContent = message;
  $('#save-feedback-close').classList.toggle('hidden', status === 'working');
  if (autoHideMs) saveFeedbackTimer = setTimeout(hideSaveFeedback, autoHideMs);
}
function hideSaveFeedback() {
  clearTimeout(saveFeedbackTimer);
  $('#save-feedback').classList.add('hidden');
  $('#save-feedback').setAttribute('aria-busy', 'false');
}
function setLoading(show, text) {
  $('#loading').classList.toggle('hidden', !show);
  if (text) $('#loading-text').textContent = text;
  if (loadingAnimation) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (show && !reduceMotion) loadingAnimation.goToAndPlay(0, true);
    else loadingAnimation.goToAndStop(0, true);
  }
}
function toast(message) { const node=$('#toast'); node.textContent=message; node.classList.remove('hidden'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>node.classList.add('hidden'),3500); }
function handleError(error) { console.error(error); toast(error.message || 'เกิดข้อผิดพลาด'); if (error.code === 'UNAUTHORIZED') showView('settings'); }
function appError(code,message,details){const error=new Error(message);error.code=code;error.details=details;return error;}
function emptyReceipt(){return{saleDate:new Date().toISOString().slice(0,10),deductionWeightKg:0,totalDeduction:0,overallConfidence:0,deductions:[]};}
function numberOrNull(value){if(value===''||value===null||value===undefined)return null;const number=Number(String(value).replace(/,/g,''));return Number.isFinite(number)?number:null;}
function round2(value){return Math.round(Number(value)*100)/100;}
function valueForInput(value){return value===null||value===undefined?'':value;}
function formatNumber(value,digits=0){return new Intl.NumberFormat('th-TH',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(Number(value||0));}
function formatMoney(value){return new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB',maximumFractionDigits:2}).format(Number(value||0));}
function formatThaiDate(value){if(!value)return 'ไม่ระบุวันที่';const date=new Date(`${String(value).slice(0,10)}T12:00:00+07:00`);return new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'short',year:'numeric'}).format(date);}
function normalizeSearch(value){return String(value||'').trim().toLocaleLowerCase('th-TH').replace(/\s+/g,' ');}
function escapeHtml(value){return String(value??'').replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));}
function cssEscape(value){return window.CSS?.escape?CSS.escape(value):String(value).replace(/[^a-zA-Z0-9_-]/g,'\\$&');}
function imageMimeTypeForFile(file) {
  const declared = String(file && file.type || '').trim().toLowerCase();
  if (declared.indexOf('image/') === 0) return declared;
  if (declared && declared !== 'application/octet-stream') return '';
  const extension = String(file && file.name || '').split('.').pop().toLowerCase();
  const byExtension = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
  return byExtension[extension] || 'image/jpeg';
}
function normalizeImageDataUrl(dataUrl, mimeType) {
  const value = String(dataUrl || '');
  const comma = value.indexOf(',');
  if (comma < 0) throw new Error('Invalid image data URL');
  return `data:${mimeType};base64,${value.slice(comma + 1)}`;
}
function readFileAsDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error||new Error('อ่านไฟล์รูปไม่สำเร็จ'));reader.readAsDataURL(file);});}
function loadImage(url){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=url;});}
async function imagePayload(dataUrl){const [header,base64]=dataUrl.split(',');const bytes=Uint8Array.from(atob(base64),char=>char.charCodeAt(0));const digest=await crypto.subtle.digest('SHA-256',bytes);const sha256=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');return{mimeType:(header.match(/data:([^;]+)/)||[])[1]||'image/jpeg',base64,sha256,bytes:bytes.length};}
function getIdempotencyKey(){let key=localStorage.getItem('palmIdempotencyKey');if(!key){key=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;localStorage.setItem('palmIdempotencyKey',key);}return key;}
function saveDraft(){if(!$('#review-panel').classList.contains('hidden'))localStorage.setItem('palmDraft',JSON.stringify({receipt:collectReceipt(),laborEntries:collectLaborEntries(true,true),source:state.source,ocrRunId:state.ocrRunId,model:state.model,savedAt:Date.now()}));}
function restoreDraft(){try{const draft=JSON.parse(localStorage.getItem('palmDraft'));if(draft?.receipt){state.source=draft.source||'MANUAL';state.ocrRunId=draft.ocrRunId||'';state.model=draft.model||'';openReview(draft.receipt,[],{warnings:[{message:'กู้คืนแบบร่างที่ยังไม่ได้บันทึก'}]},false,draft.laborEntries||[]);}}catch(error){localStorage.removeItem('palmDraft');}}
function populateYears(){const current=new Date().getFullYear();$('#dashboard-year').innerHTML=`<option value="all">ทุกปี</option>${Array.from({length:6},(_,i)=>`<option value="${current-i}">${current-i+543}</option>`).join('')}`;$('#dashboard-year').value=String(current);}
function updateDashboardYears(years,selected){const current=new Date().getFullYear();const source=years.length?years:Array.from({length:6},(_,i)=>current-i);const values=Array.from(new Set(source.map(String))).sort().reverse();const select=$('#dashboard-year');select.innerHTML=`<option value="all">ทุกปี</option>${values.map(year=>`<option value="${escapeHtml(year)}">${Number(year)+543}</option>`).join('')}`;select.value=values.includes(String(selected))?String(selected):'all';}
function setupInstall(){window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();state.installPrompt=event;$('#install-button').classList.remove('hidden');});$('#install-button').addEventListener('click',async()=>{if(!state.installPrompt)return;state.installPrompt.prompt();await state.installPrompt.userChoice;state.installPrompt=null;$('#install-button').classList.add('hidden');});}
function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
