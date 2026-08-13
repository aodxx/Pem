'use strict';

const CONFIG = window.PALM_CONFIG;
const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));
const state = {
  accessToken: localStorage.getItem('palmAccessToken') || '', originalDataUrl: '', previewDataUrl: '', rotation: 0,
  source: 'MANUAL', receipt: null, ocrRunId: '', model: '', editingSaleId: '', expectedUpdatedAt: '', installPrompt: null,
  syncInProgress: false
};

const QUEUE_DB = 'palm-ledger-offline-v1';
const QUEUE_STORE = 'pending-saves';
let queueDbPromise;

document.addEventListener('DOMContentLoaded', init);

function init() {
  $('#api-url').value = CONFIG.apiUrl;
  $('#access-token').value = state.accessToken;
  $('#app-version').textContent = CONFIG.version;
  bindNavigation(); bindCapture(); bindForm(); bindSettings(); bindFilters(); setupInstall();
  populateYears(); updateConnectionUI(); restoreDraft();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  initSaveQueue().then(async () => { await refreshQueueUI(); processPendingSaves(false); }).catch(() => {});
  window.addEventListener('online', () => { setSyncStatus('ออนไลน์ — กำลังตรวจรายการรอส่ง'); processPendingSaves(false); });
  window.addEventListener('offline', () => setSyncStatus('ออฟไลน์ — แบบร่างยังอยู่'));
}

function bindNavigation() {
  $$('.nav-item').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
}

async function showView(name) {
  $$('.view').forEach(view => view.classList.toggle('active', view.id === `view-${name}`));
  $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === name));
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

function bindSettings() {
  $('#save-settings').addEventListener('click', saveSettings);
  $('#retry-pending').addEventListener('click', () => processPendingSaves(true));
}

function bindFilters() {
  $('#filter-month').addEventListener('change', loadHistory);
  let timer;
  $('#filter-search').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(loadHistory, 300); });
  $('#clear-filters').addEventListener('click', () => { $('#filter-month').value = ''; $('#filter-search').value = ''; loadHistory(); });
  $('#dashboard-year').addEventListener('change', loadDashboard);
}

async function selectImage(event, source) {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return toast('รองรับเฉพาะรูป JPEG, PNG และ WebP');
  if (file.size > 14 * 1024 * 1024) return toast('รูปต้นฉบับใหญ่เกิน 14 MB กรุณาเลือกรูปอื่น');
  state.source = source; state.rotation = 0; state.originalDataUrl = await readFileAsDataUrl(file);
  state.previewDataUrl = await renderImage(state.originalDataUrl, 0);
  $('#image-preview').src = state.previewDataUrl;
  $('#preview-panel').classList.remove('hidden'); $('#review-panel').classList.add('hidden');
  $('#preview-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  const scale = Math.min(1, 1600 / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, width, height);
  context.translate(width / 2, height / 2); context.rotate(rotation * Math.PI / 180);
  const drawWidth = image.width * scale; const drawHeight = image.height * scale;
  context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  return canvas.toDataURL('image/jpeg', .8);
}

async function analyzeImage() {
  if (!ensureConnected()) return;
  if (!state.previewDataUrl) return toast('กรุณาเลือกรูปใบชั่งก่อน');
  setLoading(true, 'Gemini กำลังอ่านใบชั่ง…');
  try {
    const image = await imagePayload(state.previewDataUrl);
    const data = await api('sales.analyze', { image, source: state.source, schemaVersion: '1.0.0' }, true, { timeoutMs: 90000 });
    state.receipt = data.receipt; state.ocrRunId = data.ocrRunId; state.model = data.model;
    openReview(data.receipt, data.lowConfidenceFields || [], data.validation, false);
    if (data.duplicateCandidates && data.duplicateCandidates.length) showValidation({ warnings: [{ message: 'พบรายการเดิมที่คล้ายกัน โปรดตรวจสอบก่อนบันทึก' }] });
  } catch (error) { handleError(error); }
  finally { setLoading(false); }
}

function openManualForm() {
  state.source = 'MANUAL'; state.receipt = emptyReceipt(); state.ocrRunId = ''; state.model = '';
  openReview(state.receipt, [], { warnings: [] }, false);
}

function openReview(receipt, lowFields, validation, editing) {
  state.receipt = receipt;
  $('#review-title').textContent = editing ? 'แก้ไขรายการขาย' : (state.source === 'MANUAL' ? 'เพิ่มข้อมูลด้วยตนเอง' : 'ข้อมูลจากใบชั่ง');
  const confidence = Math.round(Number(receipt.overallConfidence || 0) * 100);
  $('#confidence-badge').textContent = state.source === 'MANUAL' ? 'กรอกเอง' : `มั่นใจ ${confidence}%`;
  $('#confidence-badge').classList.toggle('low', confidence < 75 && state.source !== 'MANUAL');
  $$('#sale-form [name]').forEach(input => { if (input.name !== 'deductionType' && input.name !== 'deductionAmount') input.value = valueForInput(receipt[input.name]); });
  $('#deductions-list').innerHTML = '';
  (receipt.deductions || []).forEach(addDeductionRow);
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
  if (state.editingSaleId) {
    setLoading(true, 'กำลังบันทึกการแก้ไข…');
    try {
      const data = await api('sales.update', { saleId: state.editingSaleId, expectedUpdatedAt: state.expectedUpdatedAt, sale }, true, { timeoutMs: 45000 });
      localStorage.removeItem('palmDraft'); resetCapture();
      toast(data.updated ? 'แก้ไขข้อมูลเรียบร้อยแล้ว' : 'บันทึกเรียบร้อยแล้ว');
      await showView('history');
    } catch (error) { handleError(error); }
    finally { setLoading(false); }
    return;
  }

  const saveButton = $('#save-button');
  saveButton.disabled = true;
  saveButton.textContent = 'กำลังเก็บไว้ในเครื่อง…';
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
      payload: { sale, image, source: state.source, ocrRunId: state.ocrRunId, model: state.model,
        idempotencyKey, duplicateOverride }
    });
    localStorage.removeItem('palmDraft');
    localStorage.removeItem('palmIdempotencyKey');
    resetCapture();
    await refreshQueueUI();
    toast('รับข้อมูลแล้ว — ปิดหน้าได้ ระบบจะส่งให้อัตโนมัติ');
    processPendingSaves(true);
  } catch (error) {
    handleError(appError('LOCAL_SAVE_FAILED', 'เก็บรายการไว้ในเครื่องไม่สำเร็จ กรุณาอย่าเพิ่งปิดหน้านี้', { message: error.message }));
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'ยืนยันและบันทึก';
  }
}

function resetCapture() {
  Object.assign(state, { originalDataUrl: '', previewDataUrl: '', rotation: 0, source: 'MANUAL', receipt: null,
    ocrRunId: '', model: '', editingSaleId: '', expectedUpdatedAt: '' });
  $('#preview-panel').classList.add('hidden'); $('#review-panel').classList.add('hidden'); $('#sale-form').reset();
  $('#deductions-list').innerHTML = ''; localStorage.removeItem('palmDraft');
}

async function loadDashboard() {
  if (!ensureConnected(false)) return;
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
    $('#sum-weight-label').textContent = allYears ? 'ผลผลิตทั้งหมด' : `ผลผลิตปี ${Number(data.year) + 543}`;
    $('#sum-revenue-label').textContent = allYears ? 'รายได้ทั้งหมด' : `รายได้ปี ${Number(data.year) + 543}`;
    $('#sum-weight').textContent = formatNumber(data.totalWeightTon, 2); $('#sum-revenue').textContent = formatMoney(data.totalRevenue);
    $('#sum-price').textContent = formatNumber(data.averagePricePerKg, 2); $('#sum-count').textContent = formatNumber(data.saleCount, 0);
    renderMonthlyChart(data.monthlySeries || []); renderBuyers(data.buyerComparison || []);
  } catch (error) { handleError(error); } finally { setLoading(false); }
}

function renderMonthlyChart(series) {
  const max = Math.max(1, ...series.map(item => Number(item.weightKg || 0)));
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  $('#monthly-chart').innerHTML = series.map((item, index) => `<div class="chart-column" title="${escapeHtml(formatNumber(item.weightKg, 0))} กก."><div class="chart-bar-wrap"><div class="chart-bar" style="height:${Math.max(2, Number(item.weightKg || 0) / max * 100)}%"></div></div><span>${months[index]}</span></div>`).join('');
}

function renderBuyers(items) {
  const container = $('#buyer-comparison');
  container.classList.toggle('empty', !items.length);
  container.innerHTML = items.length ? items.map(item => `<article class="buyer-row"><strong>${escapeHtml(item.buyerName)}</strong><span>${formatNumber(item.totalWeightKg, 0)} กก. • ${item.saleCount} ครั้ง</span><b>${formatMoney(item.totalRevenue)}</b></article>`).join('') : 'ยังไม่มีข้อมูล';
}

async function loadHistory() {
  if (!ensureConnected(false)) return;
  setLoading(true, 'กำลังโหลดประวัติ…');
  try {
    const monthValue = $('#filter-month').value;
    const query = $('#filter-search').value.trim();
    const filters = { limit: 100 };
    if (monthValue) { filters.year = monthValue.slice(0, 4); filters.month = monthValue.slice(5, 7); }
    const items = await api('sales.list', filters);
    const filtered = items.filter(item => !query || `${item.ReceiptNumber || ''} ${item.BuyerNameRaw || ''}`.toLowerCase().includes(query.toLowerCase()));
    const pending = await queueGetAll().catch(() => []);
    $('#history-count').textContent = (monthValue || query) ? `แสดง ${filtered.length} รายการตามตัวกรอง` : `พบ ${filtered.length} รายการใน Google Sheets`;
    renderHistory(filtered, pending);
  } catch (error) { $('#history-count').textContent = 'โหลดรายการไม่สำเร็จ'; handleError(error); } finally { setLoading(false); }
}

function renderHistory(items, pending = []) {
  const container = $('#history-list'); container.classList.toggle('empty', !items.length && !pending.length);
  if (!items.length && !pending.length) { container.textContent = 'ยังไม่มีข้อมูลการขาย'; return; }
  const pendingHtml = pending.map(job => { const sale = job.payload?.sale || {}; return `<article class="history-card pending"><div><h3>${escapeHtml(formatThaiDate(sale.saleDate))}</h3><p>${escapeHtml(sale.buyerName || 'ไม่ระบุลาน')} • ${formatNumber(sale.netWeightKg, 0)} กก.</p><p>ใบชั่ง ${escapeHtml(sale.receiptNumber || '—')}</p></div><div class="amount"><strong>เก็บไว้แล้ว</strong><small>${job.status === 'blocked' ? 'รอยืนยันรายการซ้ำ' : 'กำลังส่งอัตโนมัติ'}</small></div></article>`; }).join('');
  const savedHtml = items.map(item => `<article class="history-card" data-sale-id="${escapeHtml(item.SaleID)}"><div><h3>${escapeHtml(formatThaiDate(item.SaleDate))}</h3><p>${escapeHtml(item.BuyerNameRaw || 'ไม่ระบุลาน')} • ${formatNumber(item.NetWeightKg, 0)} กก.</p><p>ใบชั่ง ${escapeHtml(item.ReceiptNumber || '—')} • ${formatNumber(item.PricePerKg, 2)} บาท/กก.</p></div><div class="amount"><strong>${formatMoney(item.NetAmount)}</strong><small>แตะเพื่อดู/แก้ไข</small></div></article>`).join('');
  container.innerHTML = pendingHtml + savedHtml;
  $$('.history-card').forEach(card => card.addEventListener('click', () => editSale(card.dataset.saleId)));
}

async function editSale(saleId) {
  setLoading(true, 'กำลังเปิดรายการ…');
  try {
    const item = await api('sales.get', { saleId });
    state.editingSaleId = item.SaleID; state.expectedUpdatedAt = item.UpdatedAt; state.source = 'MANUAL';
    const receipt = recordToReceipt(item); showView('home'); openReview(receipt, [], { warnings: [] }, true);
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
    const box = $('#connection-result'); box.className = 'notice success'; box.textContent = `เชื่อมต่อสำเร็จ — Backend ${health.version}`;
    toast('เชื่อมต่อระบบเรียบร้อยแล้ว');
    processPendingSaves(false);
  } catch (error) {
    const box = $('#connection-result'); box.className = 'notice error'; box.textContent = error.message; handleError(error);
  } finally { setLoading(false); }
}

async function api(action, payload = {}, includeToken = true, options = {}) {
  const body = { ...payload, action, requestId: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}` };
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
          await queueDelete(job.id); savedCount += 1; sending = false;
        } catch (error) {
          if (error.code === 'DUPLICATE_SUSPECTED') {
            if (interactive && confirm('พบข้อมูลคล้ายกับใบชั่งเดิม\n\nยืนยันว่าเป็นรายการใหม่และบันทึกต่อหรือไม่?')) {
              job.payload.duplicateOverride = true;
              continue;
            }
            job.status = 'blocked'; job.lastError = error.message; job.updatedAt = Date.now();
            await queuePut(job); sending = false; continue;
          }
          if (['NETWORK_ERROR', 'REQUEST_TIMEOUT', 'INVALID_RESPONSE', 'RATE_LIMITED'].includes(error.code)) {
            const saved = await verifyQueuedSave(job);
            if (saved) { await queueDelete(job.id); savedCount += 1; }
            else {
              job.status = 'pending'; job.lastError = error.message; job.updatedAt = Date.now();
              await queuePut(job);
            }
            sending = false; continue;
          }
          job.status = error.code === 'UNAUTHORIZED' ? 'pending' : 'error';
          job.lastError = error.message; job.updatedAt = Date.now();
          await queuePut(job); sending = false;
          if (error.code === 'UNAUTHORIZED') { handleError(error); return; }
        }
      }
    }
  } finally {
    state.syncInProgress = false;
    const remaining = await refreshQueueUI();
    if (savedCount) toast(`ส่งเข้า Google Sheets สำเร็จ ${savedCount} รายการ`);
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
function setLoading(show, text) { $('#loading').classList.toggle('hidden', !show); if (text) $('#loading-text').textContent = text; }
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
function escapeHtml(value){return String(value??'').replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));}
function cssEscape(value){return window.CSS?.escape?CSS.escape(value):String(value).replace(/[^a-zA-Z0-9_-]/g,'\\$&');}
function readFileAsDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});}
function loadImage(url){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=url;});}
async function imagePayload(dataUrl){const [header,base64]=dataUrl.split(',');const bytes=Uint8Array.from(atob(base64),char=>char.charCodeAt(0));const digest=await crypto.subtle.digest('SHA-256',bytes);const sha256=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');return{mimeType:(header.match(/data:([^;]+)/)||[])[1]||'image/jpeg',base64,sha256,bytes:bytes.length};}
function getIdempotencyKey(){let key=localStorage.getItem('palmIdempotencyKey');if(!key){key=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;localStorage.setItem('palmIdempotencyKey',key);}return key;}
function saveDraft(){if(!$('#review-panel').classList.contains('hidden'))localStorage.setItem('palmDraft',JSON.stringify({receipt:collectReceipt(),source:state.source,ocrRunId:state.ocrRunId,model:state.model,savedAt:Date.now()}));}
function restoreDraft(){try{const draft=JSON.parse(localStorage.getItem('palmDraft'));if(draft?.receipt){state.source=draft.source||'MANUAL';state.ocrRunId=draft.ocrRunId||'';state.model=draft.model||'';openReview(draft.receipt,[],{warnings:[{message:'กู้คืนแบบร่างที่ยังไม่ได้บันทึก'}]},false);}}catch(error){localStorage.removeItem('palmDraft');}}
function populateYears(){const current=new Date().getFullYear();$('#dashboard-year').innerHTML=`<option value="all">ทุกปี</option>${Array.from({length:6},(_,i)=>`<option value="${current-i}">${current-i+543}</option>`).join('')}`;$('#dashboard-year').value='all';}
function updateDashboardYears(years,selected){const current=new Date().getFullYear();const source=years.length?years:Array.from({length:6},(_,i)=>current-i);const values=Array.from(new Set(source.map(String))).sort().reverse();const select=$('#dashboard-year');select.innerHTML=`<option value="all">ทุกปี</option>${values.map(year=>`<option value="${escapeHtml(year)}">${Number(year)+543}</option>`).join('')}`;select.value=values.includes(String(selected))?String(selected):'all';}
function setupInstall(){window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();state.installPrompt=event;$('#install-button').classList.remove('hidden');});$('#install-button').addEventListener('click',async()=>{if(!state.installPrompt)return;state.installPrompt.prompt();await state.installPrompt.userChoice;state.installPrompt=null;$('#install-button').classList.add('hidden');});}
function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
