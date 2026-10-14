(() => {
  'use strict';

  const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const EXPORT_COLUMNS = Object.freeze([
    ['period', 'ช่วงเวลา'], ['month', 'เดือน'], ['saleCount', 'จำนวนใบชั่ง'],
    ['weightKg', 'ผลผลิต (กก.)'], ['revenue', 'ยอดรับจากใบชั่ง (บาท)'],
    ['averagePricePerKg', 'ราคาเฉลี่ย (บาท/กก.)'], ['laborCost', 'ค่าแรง (บาท)'],
    ['netAfterLabor', 'คงเหลือหลังหักค่าแรง (บาท)']
  ].map(column => Object.freeze(column)));

  function numeric(value) {
    const parsed = Number(typeof value === 'string' ? value.replace(/,/g, '').trim() : value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeSeries(series) {
    const byMonth = new Map();
    (Array.isArray(series) ? series : []).forEach((item, index) => {
      const parsedMonth = Number(item && item.month);
      const monthNumber = Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : index + 1;
      const month = String(monthNumber).padStart(2, '0');
      const revenue = numeric(item && item.revenue);
      const laborCost = numeric(item && item.laborCost);
      const hasNet = item && item.netAfterLabor !== undefined && item.netAfterLabor !== null && item.netAfterLabor !== '';
      byMonth.set(month, {
        month,
        weightKg: Math.max(0, numeric(item && item.weightKg)),
        revenue,
        averagePricePerKg: Math.max(0, numeric(item && item.averagePricePerKg)),
        saleCount: Math.max(0, Math.trunc(numeric(item && item.saleCount))),
        laborCost: Math.max(0, laborCost),
        netAfterLabor: hasNet ? numeric(item.netAfterLabor) : revenue - laborCost
      });
    });

    return MONTHS.map((_, index) => {
      const month = String(index + 1).padStart(2, '0');
      return byMonth.get(month) || {
        month, weightKg: 0, revenue: 0, averagePricePerKg: 0, saleCount: 0, laborCost: 0, netAfterLabor: 0
      };
    });
  }

  function monthLabel(month) {
    return MONTHS[Number(month) - 1] || '—';
  }

  function metricValue(item, metric) {
    if (metric === 'price') return numeric(item && item.averagePricePerKg);
    if (metric === 'weight') return numeric(item && item.weightKg);
    return numeric(item && item.revenue);
  }

  function summarizeSeries(series) {
    const months = normalizeSeries(series);
    const totals = months.reduce((result, item) => {
      result.weightKg += item.weightKg;
      result.revenue += item.revenue;
      result.weightedPrice += item.weightKg * item.averagePricePerKg;
      result.saleCount += item.saleCount;
      result.laborCost += item.laborCost;
      result.netAfterLabor += item.netAfterLabor;
      return result;
    }, { weightKg: 0, revenue: 0, weightedPrice: 0, saleCount: 0, laborCost: 0, netAfterLabor: 0 });
    return {
      months,
      totals: {
        weightKg: totals.weightKg,
        revenue: totals.revenue,
        averagePricePerKg: totals.weightKg ? totals.weightedPrice / totals.weightKg : 0,
        saleCount: totals.saleCount,
        laborCost: totals.laborCost,
        netAfterLabor: totals.netAfterLabor
      }
    };
  }

  function exportTable(series, periodLabel) {
    const summary = summarizeSeries(series);
    const rows = summary.months.map(item => {
      const hasSales = item.saleCount > 0;
      return {
        period: String(periodLabel || ''),
        month: monthLabel(item.month),
        saleCount: hasSales ? item.saleCount : '',
        weightKg: hasSales ? item.weightKg : '',
        revenue: hasSales ? item.revenue : '',
        averagePricePerKg: hasSales ? item.averagePricePerKg : '',
        laborCost: hasSales ? item.laborCost : '',
        netAfterLabor: hasSales ? item.netAfterLabor : ''
      };
    });
    const totals = summary.totals;
    rows.push({
      period: String(periodLabel || ''), month: 'รวมช่วงที่เลือก', saleCount: totals.saleCount,
      weightKg: totals.weightKg, revenue: totals.revenue,
      averagePricePerKg: totals.averagePricePerKg, laborCost: totals.laborCost,
      netAfterLabor: totals.netAfterLabor
    });
    return { columns: EXPORT_COLUMNS, rows };
  }

  function csvCell(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return String(Math.round(value * 100) / 100);
    let text = String(value ?? '');
    if (/^[=+@\-]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function toCsv(table) {
    const columns = Array.isArray(table && table.columns) ? table.columns : [];
    const rows = Array.isArray(table && table.rows) ? table.rows : [];
    const csvRows = [
      columns.map(([, label]) => label),
      ...rows.map(row => columns.map(([key]) => row[key]))
    ];
    return '\uFEFF' + csvRows.map(row => row.map(csvCell).join(',')).join('\r\n');
  }

  function insightCards(series, allYears = false) {
    const active = normalizeSeries(series).filter(item => item.saleCount > 0);
    if (!active.length) return [];

    const highest = selector => active.reduce((best, item) => selector(item) > selector(best) ? item : best);
    const bestRevenue = highest(item => item.revenue);
    const bestPrice = highest(item => item.averagePricePerKg);
    const bestWeight = highest(item => item.weightKg);
    const cards = [
      { key: 'revenue', label: allYears ? 'รายรับสะสมสูงสุดตามเดือน' : 'รายรับสูงสุด', month: monthLabel(bestRevenue.month), value: bestRevenue.revenue },
      { key: 'price', label: allYears ? 'ราคาเฉลี่ยสูงสุดตามเดือน' : 'ราคาเฉลี่ยสูงสุด', month: monthLabel(bestPrice.month), value: bestPrice.averagePricePerKg },
      { key: 'weight', label: allYears ? 'ผลผลิตสะสมสูงสุดตามเดือน' : 'ผลผลิตสูงสุด', month: monthLabel(bestWeight.month), value: bestWeight.weightKg }
    ];

    const pricedMonths = active.filter(item => item.averagePricePerKg > 0);
    if (!allYears && pricedMonths.length > 1) {
      const previous = pricedMonths[pricedMonths.length - 2];
      const latest = pricedMonths[pricedMonths.length - 1];
      const change = Math.round((latest.averagePricePerKg - previous.averagePricePerKg) * 100) / 100;
      cards.push({
        key: 'price-change',
        label: 'ราคาเทียบเดือนก่อนหน้าที่มีบิล',
        month: `${monthLabel(previous.month)} → ${monthLabel(latest.month)}`,
        value: change,
        percent: previous.averagePricePerKg ? Math.round(change / previous.averagePricePerKg * 10000) / 100 : null
      });
    }
    return cards;
  }

  window.PalmDashboardAnalytics = Object.freeze({ MONTHS, normalizeSeries, monthLabel, metricValue, summarizeSeries, exportTable, toCsv, insightCards });
})();
