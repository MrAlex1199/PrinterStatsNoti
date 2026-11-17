let currentData = null;
let currentView = 'table';
let currentKpiFilter = 'all';
let currentGroupBy = 'brand';
let currentSortBy = 'status';
let currentSortDir = 'asc';
let lastRenderedSignature = '';

const statusBadgeMap = {
  online: { label: 'พร้อมใช้', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  printing: { label: 'กำลังพิมพ์', cls: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  warning: { label: 'แจ้งเตือน', cls: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  error: { label: 'มีปัญหา', cls: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
  offline: { label: 'ออฟไลน์', cls: 'bg-slate-200 text-slate-700', dot: 'bg-slate-400' },
  usb: { label: 'USB', cls: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500' },
};

const errorFlagLabels = {
  // Byte 0
  lowPaper: 'กระดาษใกล้หมด',
  noPaper: 'กระดาษหมด',
  lowToner: 'หมึกใกล้หมด',
  noToner: 'หมึกหมดเกลี้ยง',
  doorOpen: 'ฝาเครื่องเปิดอยู่',
  jammed: 'กระดาษติด',
  offline: 'ออฟไลน์ / ไม่ตอบสนอง',
  serviceRequested: 'ต้องการซ่อมบำรุง / เรียกช่าง',
  // Byte 1
  inputTrayMissing: 'ถาดกระดาษไม่ถูกใส่',
  outputTrayMissing: 'ถาดรับกระดาษไม่ถูกใส่',
  markerSupplyMissing: 'ตลับหมึกไม่ถูกใส่',
  outputNearFull: 'ถาดรับกระดาษใกล้เต็ม',
  outputFull: 'ถาดรับกระดาษเต็ม',
  inputTrayEmpty: 'ถาดกระดาษว่างเปล่า',
  overduePreventMaint: 'เลยกำหนดการบำรุงรักษา (PM)',
};

function computeSmartStatusBadge(p) {
  if (p.connectionType === 'usb') {
    return { label: 'USB', cls: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500', severity: 'info' };
  }
  const snap = p.snapshot;
  const flags = snap?.errorFlags || [];
  const status = snap?.status || 'offline';

  if (flags.includes('jammed')) {
    return { label: '🚨 กระดาษติด', cls: 'bg-rose-100 text-rose-800 border border-rose-300 font-bold', dot: 'bg-rose-600', severity: 'critical' };
  }
  if (flags.includes('noToner')) {
    return { label: '💧 หมึกหมดเกลี้ยง', cls: 'bg-rose-100 text-rose-800 border border-rose-300 font-bold', dot: 'bg-rose-600', severity: 'critical' };
  }
  if (flags.includes('serviceRequested')) {
    return { label: '🛠️ เรียกช่างบริการ', cls: 'bg-rose-100 text-rose-800 border border-rose-300 font-bold', dot: 'bg-rose-600', severity: 'critical' };
  }
  if (status === 'offline' || flags.includes('offline')) {
    return { label: '🔴 ออฟไลน์', cls: 'bg-slate-200 text-slate-700', dot: 'bg-slate-400', severity: 'warning' };
  }
  if (flags.includes('doorOpen')) {
    return { label: '🚪 ฝาเครื่องเปิด', cls: 'bg-amber-100 text-amber-800 border border-amber-300', dot: 'bg-amber-500', severity: 'info' };
  }
  if (flags.includes('noPaper') || flags.includes('inputTrayEmpty')) {
    return { label: '📄 กระดาษหมด', cls: 'bg-amber-100 text-amber-800 border border-amber-300', dot: 'bg-amber-500', severity: 'info' };
  }
  if (flags.includes('outputFull')) {
    return { label: '📥 ถาดรับเต็ม', cls: 'bg-amber-100 text-amber-800 border border-amber-300', dot: 'bg-amber-500', severity: 'info' };
  }
  if (flags.includes('inputTrayMissing') || flags.includes('outputTrayMissing') || flags.includes('markerSupplyMissing')) {
    return { label: '⚠️ อุปกรณ์ไม่เข้าที่', cls: 'bg-amber-100 text-amber-800 border border-amber-300', dot: 'bg-amber-500', severity: 'info' };
  }
  if (flags.includes('lowToner')) {
    return { label: '💧 หมึกใกล้หมด', cls: 'bg-amber-100 text-amber-800 border border-amber-300', dot: 'bg-amber-500', severity: 'warning' };
  }
  if (flags.includes('lowPaper')) {
    return { label: '📄 กระดาษใกล้หมด', cls: 'bg-amber-100 text-amber-800 border border-amber-300', dot: 'bg-amber-500', severity: 'warning' };
  }
  if (flags.includes('overduePreventMaint')) {
    return { label: '⏳ ถึงรอบตรวจเช็ค', cls: 'bg-amber-100 text-amber-800 border border-amber-300', dot: 'bg-amber-500', severity: 'info' };
  }
  if (status === 'warning') {
    return { label: '⚠️ แจ้งเตือน', cls: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500', severity: 'warning' };
  }
  if (status === 'error') {
    return { label: '❌ มีปัญหา', cls: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500', severity: 'critical' };
  }
  if (status === 'printing') {
    return { label: 'กำลังพิมพ์', cls: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500', severity: 'normal' };
  }
  return { label: 'พร้อมใช้', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', severity: 'normal' };
}

function detectBrand(p) {
  const hay = [p.asset?.modelName, p.snapshot?.model, p.name, p.asset?.vendorNote]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (hay.includes('minolta') || hay.includes('konica') || hay.includes('bhc') || hay.includes('bh287')) {
    return 'Konica Minolta';
  }
  if (hay.includes('kyocera') || hay.includes('ecosys')) return 'KYOCERA';
  if (hay.includes('hp') || hay.includes('laserjet')) return 'HP';
  if (hay.includes('canon')) return 'Canon';
  if (hay.includes('brother')) return 'Brother';
  if (hay.includes('epson')) return 'Epson';
  if (hay.includes('ricoh')) return 'Ricoh';
  if (hay.includes('fuji') || hay.includes('xerox')) return 'Fuji Xerox';
  return 'ยี่ห้ออื่นๆ';
}

function setKpiFilter(filter) {
  if (currentKpiFilter === filter && filter !== 'all') {
    currentKpiFilter = 'all';
  } else {
    currentKpiFilter = filter;
  }
  updateKpiPillsUi();
  renderPrintersList();
}

function updateKpiPillsUi() {
  const pills = {
    all: document.getElementById('kpi-btn-all'),
    online: document.getElementById('kpi-btn-online'),
    issues: document.getElementById('kpi-btn-issues'),
    expiring: document.getElementById('kpi-btn-expiring'),
  };

  const activeClasses = {
    all: ['ring-2', 'ring-indigo-500', 'bg-indigo-100/90', 'border-indigo-300'],
    online: ['ring-2', 'ring-emerald-500', 'bg-emerald-100', 'border-emerald-400'],
    issues: ['ring-2', 'ring-amber-500', 'bg-amber-100', 'border-amber-400'],
    expiring: ['ring-2', 'ring-rose-500', 'bg-rose-100', 'border-rose-400'],
  };

  Object.keys(pills).forEach((k) => {
    if (pills[k] && activeClasses[k]) {
      pills[k].classList.remove(...activeClasses[k]);
    }
  });

  if (pills[currentKpiFilter] && activeClasses[currentKpiFilter]) {
    pills[currentKpiFilter].classList.add(...activeClasses[currentKpiFilter]);
  }
}

async function fetchStatus() {
  const res = await fetch('/api/status');
  currentData = await res.json();
  renderDashboard(currentData);
}

function renderDashboard(data) {
  const printers = data.printers || [];
  const alertDays = data.settings?.contractExpiryAlertDays ?? 30;
  const onlineCount = printers.filter(
    (p) => p.connectionType === 'usb' || ['online', 'printing'].includes(p.snapshot?.status)
  ).length;
  const issueCount = printers.filter(
    (p) => p.connectionType !== 'usb' && ['warning', 'error', 'offline'].includes(p.snapshot?.status)
  ).length;
  const expiringCount = printers.filter(
    (p) => typeof p.contractDaysRemaining === 'number' && p.contractDaysRemaining <= alertDays
  ).length;

  document.getElementById('stat-total').textContent = printers.length;
  document.getElementById('stat-online').textContent = onlineCount;
  document.getElementById('stat-issues').textContent = issueCount;
  document.getElementById('stat-expiring').textContent = expiringCount;
  document.getElementById('last-updated').textContent = `อัปเดต ${new Date().toLocaleTimeString('th-TH')}`;

  const verEl = document.getElementById('app-version');
  if (verEl && data.version) {
    verEl.textContent = `v${data.version}`;
  }

  updateKpiPillsUi();
  updateViewButtonsUi();
  updateSortUi();
  renderActiveIssuesPanel(data);

  // Populate Brand & Vendor filter options
  const brandSelect = document.getElementById('filter-brand');
  const prevBrand = brandSelect.value;
  const brands = [...new Set(printers.map(detectBrand))].sort();
  brandSelect.innerHTML =
    `<option value="">ทุกยี่ห้อ</option>` +
    brands.map((b) => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
  if (brands.includes(prevBrand)) brandSelect.value = prevBrand;

  const vendorSelect = document.getElementById('filter-vendor');
  const prevVendor = vendorSelect.value;
  const vendors = [...new Set(printers.map((p) => p.asset?.vendorNote).filter(Boolean))];
  vendorSelect.innerHTML =
    `<option value="">ทุกผู้ให้บริการ</option>` +
    vendors.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  if (vendors.includes(prevVendor)) vendorSelect.value = prevVendor;

  renderPrintersList();

  const alerts = data.alerts || [];
  document.getElementById('alert-count-badge').textContent = alerts.length;
  const alertsEl = document.getElementById('alerts-list');
  if (alerts.length === 0) {
    alertsEl.innerHTML = `<div class="p-4 text-center text-xs text-slate-400">ยังไม่มีประวัติการแจ้งเตือน</div>`;
  } else {
    alertsEl.innerHTML = alerts
      .map((a) => {
        const badge =
          a.deliveryStatus === 'sent'
            ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">ส่ง LINE แล้ว</span>'
            : a.deliveryStatus === 'web_only'
              ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-700">เฉพาะบนเว็บ (ไม่ส่ง LINE)</span>'
              : a.deliveryStatus === 'skipped'
                ? '<span class="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600">ยังไม่ตั้งค่า LINE</span>'
                : '<span class="px-1.5 py-0.5 rounded text-[10px] bg-rose-100 text-rose-700">ล้มเหลว</span>';
        return `
          <div class="px-4 py-2.5 flex items-start justify-between gap-3 text-xs">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-semibold text-slate-700">${escapeHtml(a.printerName)}</span>
                ${badge}
              </div>
              <p class="text-slate-600 whitespace-pre-line mt-0.5">${escapeHtml(a.message)}</p>
            </div>
            <span class="text-[11px] text-slate-400 shrink-0">${new Date(a.createdAt).toLocaleString('th-TH')}</span>
          </div>
        `;
      })
      .join('');
  }
  lucide.createIcons();
}

function renderActiveIssuesPanel(data) {
  const panel = document.getElementById('active-issues-panel');
  const badge = document.getElementById('active-issues-badge');
  const list = document.getElementById('active-issues-list');
  if (!panel || !badge || !list) return;

  const printers = data.printers || [];
  const rules = data.settings?.lineNotifyRules || {};

  const issueItems = [];
  for (const p of printers) {
    if (p.connectionType === 'usb') continue;
    const snap = p.snapshot;
    if (!snap) continue;
    const flags = snap.errorFlags || [];
    const status = snap.status;
    const b = computeSmartStatusBadge(p);

    if (b.severity === 'critical' || b.severity === 'warning' || (b.severity === 'info' && flags.length > 0)) {
      let lineActive = false;
      let reasonText = '';

      if (flags.includes('jammed')) {
        lineActive = rules.paperJam !== false;
        reasonText = 'กระดาษติดในตัวเครื่อง (Paper Jam)';
      } else if (flags.includes('noToner')) {
        lineActive = rules.noToner !== false;
        reasonText = 'ตลับหมึกหมดเกลี้ยง (0%)';
      } else if (flags.includes('serviceRequested')) {
        lineActive = rules.hardwareError !== false;
        reasonText = 'ฮาร์ดแวร์ขัดข้อง ต้องการเรียกช่างซ่อม';
      } else if (status === 'offline') {
        lineActive = rules.offline !== false;
        reasonText = 'เครื่องออฟไลน์ ไม่ตอบสนองเครือข่าย';
      } else if (flags.includes('noPaper') || flags.includes('inputTrayEmpty')) {
        lineActive = Boolean(rules.noPaper);
        reasonText = 'กระดาษหมด / ถาดกระดาษว่างเปล่า';
      } else if (flags.includes('doorOpen')) {
        lineActive = Boolean(rules.doorOrTray);
        reasonText = 'ฝาครอบตัวเครื่องเปิดอยู่';
      } else if (flags.includes('lowToner')) {
        lineActive = rules.lowInk !== false;
        reasonText = 'หมึกพิมพ์ใกล้หมด';
      } else {
        reasonText = flags.map((f) => errorFlagLabels[f] || f).join(', ') || 'พบข้อความแจ้งเตือน';
      }

      const alertMsg = snap.alertMessages?.length ? snap.alertMessages[0] : '';

      issueItems.push({
        printer: p,
        badgeInfo: b,
        lineActive,
        reasonText,
        alertMsg,
      });
    }
  }

  issueItems.sort((a, b) => getPrinterStatusRank(a.printer) - getPrinterStatusRank(b.printer));

  if (issueItems.length === 0) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  badge.textContent = `${issueItems.length} เครื่อง`;

  list.innerHTML = issueItems
    .map((item) => {
      const p = item.printer;
      const b = item.badgeInfo;
      const isCritical = b.severity === 'critical';
      const borderCls = isCritical ? 'border-rose-200 bg-rose-50/50' : 'border-amber-200 bg-amber-50/50';
      const lineTag = item.lineActive
        ? '<span class="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded font-semibold"><i data-lucide="check" class="w-3 h-3"></i>ส่ง LINE</span>'
        : '<span class="inline-flex items-center gap-1 text-[10px] text-slate-600 bg-slate-200/90 px-1.5 py-0.5 rounded font-medium" title="แสดงเฉพาะบนเว็บ ไม่รบกวนส่ง LINE">เฉพาะบนเว็บ</span>';

      return `
        <div onclick="openDetailModal('${p.id}')" class="p-2.5 rounded-lg border ${borderCls} flex flex-col justify-between gap-1.5 cursor-pointer hover:shadow-xs transition">
          <div class="flex items-start justify-between gap-1.5">
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full ${b.dot} shrink-0"></span>
                <span class="font-bold text-xs text-slate-900 truncate" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>
              </div>
              <p class="text-[11px] text-slate-500 truncate mt-0.5">${escapeHtml(p.asset?.location || p.ip)}</p>
            </div>
            <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${b.cls}">${b.label}</span>
          </div>
          <div class="text-[11px] font-medium text-slate-700">${escapeHtml(item.reasonText)}</div>
          ${item.alertMsg ? `<div class="text-[10px] text-slate-500 font-mono truncate bg-white/70 px-1.5 py-0.5 rounded border border-slate-200/60">${escapeHtml(item.alertMsg)}</div>` : ''}
          <div class="flex items-center justify-between pt-1 border-t border-slate-200/50 text-[10px]">
            <span class="text-slate-400 font-mono">${escapeHtml(p.ip)}</span>
            ${lineTag}
          </div>
        </div>
      `;
    })
    .join('');
}

function getPrinterStatusRank(p) {
  if (p.connectionType === 'usb') return 90;
  const flags = p.snapshot?.errorFlags || [];
  const status = p.snapshot?.status || 'offline';
  if (flags.includes('jammed')) return 1;
  if (flags.includes('noToner')) return 2;
  if (flags.includes('serviceRequested')) return 3;
  if (status === 'offline' || flags.includes('offline')) return 4;
  if (flags.includes('doorOpen')) return 5;
  if (flags.includes('outputFull') || flags.includes('inputTrayMissing')) return 6;
  if (flags.includes('noPaper') || flags.includes('inputTrayEmpty')) return 7;
  if (flags.includes('lowToner')) return 8;
  if (flags.includes('lowPaper') || flags.includes('overduePreventMaint')) return 9;
  if (status === 'warning') return 10;
  if (status === 'error') return 11;
  if (status === 'printing') return 20;
  if (status === 'online') return 30;
  return 99;
}

function getLowestInkPercent(p) {
  if (p.connectionType === 'usb') return 999;
  const supplies = p.snapshot?.supplies;
  if (!supplies || supplies.length === 0) return 998;
  const valid = supplies.map((s) => s.percent).filter((x) => typeof x === 'number');
  if (valid.length === 0) return 998;
  return Math.min(...valid);
}

function parseIpParts(ip) {
  const parts = String(ip || '').split('.').map((x) => parseInt(x, 10));
  if (parts.length === 4 && !parts.some(isNaN)) {
    return parts[0] * 16777216 + parts[1] * 65536 + parts[2] * 256 + parts[3];
  }
  return 9999999999;
}

function sortPrinters(printers) {
  const mult = currentSortDir === 'desc' ? -1 : 1;
  return [...printers].sort((a, b) => {
    let cmp = 0;
    if (currentSortBy === 'status') {
      cmp = getPrinterStatusRank(a) - getPrinterStatusRank(b);
      if (cmp === 0) cmp = getLowestInkPercent(a) - getLowestInkPercent(b);
    } else if (currentSortBy === 'ink') {
      cmp = getLowestInkPercent(a) - getLowestInkPercent(b);
    } else if (currentSortBy === 'contract') {
      const dayA = typeof a.contractDaysRemaining === 'number' ? a.contractDaysRemaining : 99999;
      const dayB = typeof b.contractDaysRemaining === 'number' ? b.contractDaysRemaining : 99999;
      cmp = dayA - dayB;
    } else if (currentSortBy === 'name') {
      cmp = (a.name || '').localeCompare(b.name || '', 'th');
    } else if (currentSortBy === 'brand') {
      cmp = detectBrand(a).localeCompare(detectBrand(b), 'th');
    } else if (currentSortBy === 'ip') {
      cmp = parseIpParts(a.ip) - parseIpParts(b.ip);
    }
    if (cmp === 0) {
      cmp = (a.name || '').localeCompare(b.name || '', 'th');
    }
    return cmp * mult;
  });
}

function toggleTableSort(field) {
  if (currentSortBy === field) {
    currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    currentSortBy = field;
    currentSortDir = 'asc';
  }
  updateSortUi();
  renderPrintersList();
}

function updateSortUi() {
  const sortSelect = document.getElementById('filter-sort');
  if (sortSelect && sortSelect.value !== currentSortBy) {
    sortSelect.value = currentSortBy;
  }
  const sortBtn = document.getElementById('btn-sort-dir');
  if (sortBtn) {
    sortBtn.title = currentSortDir === 'asc' ? 'กำลังเรียง: น้อยไปมาก (คลิกเพื่อสลับ)' : 'กำลังเรียง: มากไปน้อย (คลิกเพื่อสลับ)';
    sortBtn.classList.toggle('text-indigo-600', currentSortDir === 'desc');
    sortBtn.classList.toggle('bg-indigo-50', currentSortDir === 'desc');
  }

  // Update table header indicators
  const fields = ['brand', 'name', 'ip', 'status', 'ink', 'contract'];
  fields.forEach((f) => {
    const el = document.getElementById(`sort-th-${f}`);
    if (!el) return;
    if (currentSortBy === f) {
      el.textContent = currentSortDir === 'asc' ? '▲' : '▼';
      el.className = 'text-[11px] text-indigo-600 font-bold';
    } else {
      el.textContent = '⇅';
      el.className = 'text-[10px] text-slate-300 font-normal opacity-60 hover:opacity-100';
    }
  });
}

function updateViewButtonsUi() {
  const cardsBtn = document.getElementById('view-cards');
  const tableBtn = document.getElementById('view-table');
  if (cardsBtn && tableBtn) {
    if (currentView === 'cards') {
      cardsBtn.className = 'px-2.5 py-1 rounded-md text-xs font-medium bg-white text-indigo-600 shadow-sm';
      tableBtn.className = 'px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900';
    } else {
      tableBtn.className = 'px-2.5 py-1 rounded-md text-xs font-medium bg-white text-indigo-600 shadow-sm';
      cardsBtn.className = 'px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900';
    }
  }
}

function getFilteredPrinters() {
  const printers = currentData?.printers || [];
  const q = (document.getElementById('filter-search')?.value || '').trim().toLowerCase();
  const brand = document.getElementById('filter-brand')?.value;
  const vendor = document.getElementById('filter-vendor')?.value;
  const alertDays = currentData?.settings?.contractExpiryAlertDays ?? 30;

  const result = printers.filter((p) => {
    // KPI Filter
    if (currentKpiFilter === 'online') {
      const isOnline = p.connectionType === 'usb' || ['online', 'printing'].includes(p.snapshot?.status);
      if (!isOnline) return false;
    } else if (currentKpiFilter === 'issues') {
      const isIssue = p.connectionType !== 'usb' && ['warning', 'error', 'offline'].includes(p.snapshot?.status);
      if (!isIssue) return false;
    } else if (currentKpiFilter === 'expiring') {
      const isExpiring = typeof p.contractDaysRemaining === 'number' && p.contractDaysRemaining <= alertDays;
      if (!isExpiring) return false;
    }

    if (brand && detectBrand(p) !== brand) return false;
    if (vendor && p.asset?.vendorNote !== vendor) return false;
    if (!q) return true;
    const hay = [
      p.name,
      p.ip,
      p.snapshot?.model,
      p.asset?.location,
      p.asset?.modelName,
      p.asset?.serialNumber,
      p.asset?.contractNumber,
      p.asset?.vendorNote,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });

  const countBadge = document.getElementById('filter-count-badge');
  if (countBadge) {
    if (result.length !== printers.length || currentKpiFilter !== 'all' || q || brand || vendor) {
      countBadge.textContent = `(แสดง ${result.length}/${printers.length} เครื่อง)`;
      countBadge.classList.remove('hidden');
    } else {
      countBadge.classList.add('hidden');
    }
  }

  return sortPrinters(result);
}

function renderContractPill(p) {
  const days = p.contractDaysRemaining;
  const alertDays = currentData?.settings?.contractExpiryAlertDays ?? 30;
  if (typeof days !== 'number') return '';
  if (days < 0) {
    return `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-700">หมดสัญญา</span>`;
  }
  if (days <= alertDays) {
    return `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">เหลือ ${days} วัน</span>`;
  }
  return `<span class="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600">เหลือ ${days} วัน</span>`;
}

function renderPrintersList() {
  const filtered = getFilteredPrinters();
  const container = document.getElementById('printers-container');
  const tableWrap = document.getElementById('printers-table-wrap');
  const tbody = document.getElementById('printers-table-body');

  if (currentView === 'cards') {
    container.classList.remove('hidden');
    tableWrap.classList.add('hidden');
    if (filtered.length === 0) {
      container.innerHTML = `<div class="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">ไม่พบเครื่องปริ้นที่ตรงกับเงื่อนไข</div>`;
      return;
    }

    const sig = filtered.map((p) => p.id).join(',');
    const shouldAnimate = sig !== lastRenderedSignature;
    lastRenderedSignature = sig;
    let cardIdx = 0;

    if (currentGroupBy === 'none') {
      container.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          ${filtered.map((item) => renderCompactCard(item, shouldAnimate ? cardIdx++ : -1)).join('')}
        </div>
      `;
    } else {
      const groups = new Map();
      for (const p of filtered) {
        let key = '';
        if (currentGroupBy === 'location') {
          key = p.asset?.location?.trim() || 'ไม่ระบุจุดที่ตั้ง';
        } else if (currentGroupBy === 'status') {
          if (p.connectionType === 'usb') {
            key = 'เครื่องพิมพ์ USB';
          } else {
            const st = p.snapshot?.status;
            if (st === 'warning' || st === 'error') key = 'มีปัญหา / เตือนหมึก';
            else if (st === 'offline') key = 'ออฟไลน์';
            else key = 'พร้อมใช้งาน (ปกติ)';
          }
        } else {
          key = detectBrand(p);
        }
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(p);
      }

      container.innerHTML = [...groups.entries()]
        .map(([groupName, items]) => {
          const issueInGroup = items.filter(
            (p) => p.connectionType !== 'usb' && ['warning', 'error', 'offline'].includes(p.snapshot?.status)
          ).length;
          return `
            <div class="space-y-2.5">
              <div class="flex items-center justify-between px-1">
                <div class="flex items-center gap-2">
                  <span class="w-1.5 h-4 rounded-full bg-indigo-600"></span>
                  <h2 class="text-xs font-bold uppercase tracking-wide text-slate-700">${escapeHtml(groupName)}</h2>
                  <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-200/80 text-slate-700">${items.length}</span>
                  ${
                    issueInGroup > 0
                      ? `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">มีแจ้งเตือน ${issueInGroup}</span>`
                      : ''
                  }
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                ${items.map((item) => renderCompactCard(item, shouldAnimate ? cardIdx++ : -1)).join('')}
              </div>
            </div>
          `;
        })
        .join('');
    }
  } else {
    container.classList.add('hidden');
    tableWrap.classList.remove('hidden');
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-400">ไม่พบข้อมูลเครื่องปริ้นที่ตรงกับเงื่อนไข</td></tr>`;
    } else {
      tbody.innerHTML = filtered.map(renderPrinterRow).join('');
    }
  }
  lucide.createIcons();
}

function renderCompactCard(p, animIndex = -1) {
  const snap = p.snapshot;
  const isUsb = p.connectionType === 'usb';
  const badge = computeSmartStatusBadge(p);
  const a = p.asset || {};
  const threshold = currentData?.settings?.lowInkThresholdPercent ?? 15;
  const isAlertStatus = badge.severity === 'critical' || badge.severity === 'warning';
  const animClass = animIndex >= 0 ? 'animate-card-enter' : '';
  const animStyle = animIndex >= 0 ? `style="animation-delay:${Math.min(animIndex, 12) * 35}ms"` : '';

  const modelText = a.modelName || snap?.model || 'ไม่ระบุรุ่น';

  // Ultra-compact inline ink bars (4px height)
  let inkStripHtml = '';
  if (isUsb) {
    inkStripHtml = `<div class="text-[11px] text-sky-600 bg-sky-50/70 rounded-md px-2 py-1">เชื่อมต่อ USB (ติดตามสัญญา/สินทรัพย์)</div>`;
  } else if (snap?.supplies?.length > 0) {
    const colsClass = snap.supplies.length >= 4 ? 'grid-cols-4' : snap.supplies.length === 3 ? 'grid-cols-3' : snap.supplies.length === 2 ? 'grid-cols-2' : 'grid-cols-1';
    inkStripHtml = `
      <div class="grid ${colsClass} gap-1.5">
        ${snap.supplies
          .map((s) => {
            const pct = s.percent ?? 0;
            const low = s.percent !== null && s.percent <= threshold;
            const shortName = s.name.split(' ')[0].slice(0, 5);
            return `
              <div>
                <div class="flex justify-between text-[10px] leading-tight mb-0.5">
                  <span class="text-slate-500 truncate">${escapeHtml(shortName)}</span>
                  <span class="font-semibold ${low ? 'text-rose-600' : 'text-slate-700'}">${s.percent !== null ? `${pct}%` : '-'}</span>
                </div>
                <div class="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div class="ink-bar-fill h-full rounded-full" style="width:${s.percent !== null ? pct : 0}%; background-color:${s.color || '#334155'}"></div>
                </div>
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  } else {
    inkStripHtml = `<div class="text-[11px] text-slate-400">ไม่มีข้อมูลหมึก</div>`;
  }

  const flagsHtml =
    snap?.errorFlags?.length > 0
      ? `<div class="flex flex-wrap gap-1">${snap.errorFlags
          .map((f) => `<span class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-700 border border-rose-200">${errorFlagLabels[f] || f}</span>`)
          .join('')}</div>`
      : '';

  return `
    <div onclick="openDetailModal('${p.id}')" ${animStyle} class="${animClass} card-hover group bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md hover:-translate-y-0.5 p-3.5 transition-all duration-200 cursor-pointer flex flex-col justify-between gap-2.5">
      <div class="space-y-2">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="relative flex h-2 w-2 shrink-0">
              ${isAlertStatus ? `<span class="animate-ping absolute inline-flex h-full w-full rounded-full ${badge.dot} opacity-75"></span>` : ''}
              <span class="relative inline-flex rounded-full h-2 w-2 ${badge.dot}"></span>
            </span>
            <h3 class="text-xs font-bold text-slate-900 truncate" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</h3>
          </div>
          <span class="px-1.5 py-0.5 rounded-md text-[10px] font-semibold shrink-0 ${badge.cls}">${badge.label}</span>
        </div>

        <p class="text-[11px] text-slate-500 truncate">
          <span>${escapeHtml(modelText)}</span> • <span class="font-mono">${escapeHtml(p.ip)}</span>
        </p>

        ${flagsHtml}
        ${inkStripHtml}
      </div>

      <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
        <div class="flex items-center gap-1.5 min-w-0">
          ${a.contractNumber ? `<span class="text-slate-500 truncate">#${escapeHtml(a.contractNumber)}</span>` : ''}
          ${renderContractPill(p)}
        </div>
        <div class="flex items-center gap-1 opacity-70 group-hover:opacity-100 shrink-0" onclick="event.stopPropagation()">
          <button onclick="openEditPrinter('${p.id}')" title="แก้ไข" class="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-indigo-600">
            <i data-lucide="pencil" class="w-3 h-3"></i>
          </button>
          <button onclick="deletePrinter('${p.id}')" title="ลบ" class="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600">
            <i data-lucide="trash-2" class="w-3 h-3"></i>
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderTableSupplies(p) {
  const isUsb = p.connectionType === 'usb';
  if (isUsb) {
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-sky-50 text-sky-700 border border-sky-200">
      <span class="w-1.5 h-1.5 rounded-full bg-sky-500"></span>USB
    </span>`;
  }
  const snap = p.snapshot;
  if (!snap || !snap.supplies || snap.supplies.length === 0) {
    return `<span class="text-[11px] text-slate-400 italic">ไม่มีข้อมูลหมึก</span>`;
  }
  const threshold = currentData?.settings?.lowInkThresholdPercent ?? 15;
  return `
    <div class="flex flex-wrap items-center gap-1.5 max-w-[320px]">
      ${snap.supplies
        .map((s) => {
          const pct = s.percent ?? 0;
          const isLow = s.percent !== null && s.percent <= threshold;
          const color = s.color || '#334155';
          const shortName = s.name.replace(/toner|cartridge|ink/gi, '').trim() || s.name;
          const chipCls = isLow
            ? 'bg-rose-50 border-rose-300 text-rose-700 font-semibold ring-1 ring-rose-200'
            : 'bg-slate-50 border-slate-200/90 text-slate-700';
          return `
            <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] select-none ${chipCls}" title="${escapeHtml(s.name)}: ${s.percent !== null ? `${pct}%` : 'N/A'}">
              <span class="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-300 shadow-xs" style="background-color: ${color}"></span>
              <span class="truncate max-w-[65px] font-medium">${escapeHtml(shortName)}</span>
              <span class="font-mono text-[10px] ${isLow ? 'text-rose-700 font-bold' : 'text-slate-800 font-semibold'}">${s.percent !== null ? `${pct}%` : '-'}</span>
            </span>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderPrinterRow(p) {
  const snap = p.snapshot;
  const isUsb = p.connectionType === 'usb';
  const badge = computeSmartStatusBadge(p);
  const a = p.asset || {};
  const alertMsg = snap?.alertMessages?.length ? snap.alertMessages[0] : '';
  const flagsHtml =
    snap?.errorFlags?.length > 0
      ? `<div class="mt-1 flex flex-wrap gap-1">${snap.errorFlags
          .map((f) => `<span class="px-1.5 py-0.2 rounded text-[10px] font-medium bg-rose-50 text-rose-700 border border-rose-200">${errorFlagLabels[f] || f}</span>`)
          .join('')}</div>`
      : '';

  return `
    <tr class="hover:bg-slate-50 cursor-pointer" onclick="openDetailModal('${p.id}')">
      <td class="py-2.5 px-3 font-medium text-slate-700">${escapeHtml(detectBrand(p))}</td>
      <td class="py-2.5 px-3">
        <div class="font-semibold text-slate-900">${escapeHtml(p.name)}</div>
        ${a.location ? `<div class="text-[11px] text-slate-500">${escapeHtml(a.location)}</div>` : ''}
      </td>
      <td class="py-2.5 px-3">
        <div>${escapeHtml(a.modelName || snap?.model || '-')}</div>
        <div class="text-[11px] font-mono text-slate-400">${escapeHtml(a.serialNumber || '')}</div>
        ${alertMsg ? `<div class="text-[10px] text-amber-700 bg-amber-50 px-1 py-0.5 rounded border border-amber-200 font-mono mt-0.5 max-w-[200px] truncate" title="${escapeHtml(alertMsg)}">${escapeHtml(alertMsg)}</div>` : ''}
      </td>
      <td class="py-2.5 px-3 font-mono text-slate-700">${escapeHtml(p.ip)}</td>
      <td class="py-2.5 px-3">
        <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold ${badge.cls}">${badge.label}</span>
        ${flagsHtml}
      </td>
      <td class="py-2.5 px-3">
        ${renderTableSupplies(p)}
      </td>
      <td class="py-2.5 px-3">${escapeHtml(a.contractNumber || '-')} ${renderContractPill(p)}</td>
      <td class="py-2.5 px-3 text-slate-600">${escapeHtml(a.vendorNote || '-')}</td>
      <td class="py-2.5 px-3 text-right space-x-2" onclick="event.stopPropagation()">
        <button onclick="openEditPrinter('${p.id}')" class="text-indigo-600 hover:underline font-medium">แก้ไข</button>
        <button onclick="deletePrinter('${p.id}')" class="text-rose-500 hover:underline font-medium">ลบ</button>
      </td>
    </tr>
  `;
}

function openDetailModal(id) {
  const p = currentData?.printers?.find((x) => x.id === id);
  if (!p) return;
  const snap = p.snapshot;
  const a = p.asset || {};

  document.getElementById('detail-brand-pill').textContent = detectBrand(p);
  document.getElementById('detail-name').textContent = p.name;
  document.getElementById('detail-sub').textContent = `${p.ip} • ${a.modelName || snap?.model || 'ไม่ระบุรุ่น'}`;

  const suppliesHtml = snap?.supplies?.length
    ? `
      <div class="p-3 rounded-xl bg-slate-50 border border-slate-200/70 space-y-2">
        <div class="text-[11px] font-semibold text-slate-700">ระดับหมึก / วัสดุสิ้นเปลือง</div>
        <div class="grid grid-cols-2 gap-2">
          ${snap.supplies
            .map((s) => {
              const pct = s.percent ?? 0;
              const isLow = s.percent !== null && s.percent <= (currentData?.settings?.lowInkThresholdPercent ?? 15);
              const color = s.color || '#334155';
              return `
                <div class="space-y-1">
                  <div class="flex justify-between text-[11px]">
                    <span class="flex items-center gap-1.5 text-slate-600">
                      <span class="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-300" style="background-color:${color}"></span>
                      <span class="truncate max-w-[85px] font-medium" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</span>
                    </span>
                    <span class="font-semibold ${isLow ? 'text-rose-600 font-bold' : 'text-slate-700'}">${s.percent !== null ? `${pct}%` : '-'}</span>
                  </div>
                  <div class="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div class="h-full rounded-full ${isLow ? 'bg-rose-500' : ''}" style="width:${s.percent !== null ? pct : 0}%; ${!isLow ? `background-color:${color};` : ''}"></div>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `
    : '';

  const simHtml = p.simulator
    ? `<div class="p-2.5 rounded-lg bg-indigo-50/70 border border-indigo-100 flex items-center justify-between">
         <span class="font-medium text-indigo-700">โหมดจำลอง (Simulator)</span>
         <select onchange="changeScenario('${p.id}', this.value)" class="text-xs border border-indigo-200 rounded px-2 py-1 bg-white">
           <option value="normal" ${p.simulatorScenario === 'normal' ? 'selected' : ''}>ปกติ (Normal)</option>
           <option value="paper_jam" ${p.simulatorScenario === 'paper_jam' ? 'selected' : ''}>กระดาษติด (ส่ง LINE)</option>
           <option value="no_paper" ${p.simulatorScenario === 'no_paper' ? 'selected' : ''}>กระดาษหมด (เฉพาะบนเว็บ)</option>
           <option value="door_open" ${p.simulatorScenario === 'door_open' ? 'selected' : ''}>ฝาเครื่องเปิด (เฉพาะบนเว็บ)</option>
           <option value="low_ink" ${p.simulatorScenario === 'low_ink' ? 'selected' : ''}>หมึกใกล้หมด (ส่ง LINE)</option>
           <option value="offline" ${p.simulatorScenario === 'offline' ? 'selected' : ''}>ออฟไลน์ (ส่ง LINE)</option>
         </select>
       </div>`
    : '';

  const alertsBannerHtml = snap?.alertMessages?.length
    ? `<div class="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs space-y-1">
         <div class="font-bold flex items-center gap-1.5"><i data-lucide="alert-circle" class="w-3.5 h-3.5"></i>ข้อความแจ้งเตือนจากหน้าจอเครื่องพิมพ์:</div>
         <ul class="list-disc list-inside font-mono text-[11px]">${snap.alertMessages.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>
       </div>`
    : '';

  document.getElementById('detail-body').innerHTML = `
    ${alertsBannerHtml}
    <div class="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200/70">
      <div><span class="text-slate-400">Serial:</span> <b class="font-mono text-slate-800">${escapeHtml(a.serialNumber || '-')}</b></div>
      <div><span class="text-slate-400">เลขสัญญา:</span> <b class="text-slate-800">${escapeHtml(a.contractNumber || '-')}</b></div>
      <div><span class="text-slate-400">เริ่ม–สิ้นสุด:</span> <b class="text-slate-800">${escapeHtml(a.contractStartDate || '-')} - ${escapeHtml(a.contractEndDate || '-')}</b></div>
      <div><span class="text-slate-400">ระยะเวลา:</span> <b class="text-slate-800">${escapeHtml(a.contractTerm || '-')}</b></div>
      <div><span class="text-slate-400">ค่าเช่า/เดือน:</span> <b class="text-slate-800">${escapeHtml(a.monthlyCost || '-')}</b></div>
      <div><span class="text-slate-400">ผู้ให้บริการ:</span> <b class="text-slate-800">${escapeHtml(a.vendorNote || '-')}</b></div>
      <div class="col-span-2"><span class="text-slate-400">จุดที่ตั้ง:</span> <b class="text-slate-800">${escapeHtml(a.location || '-')}</b></div>
      <div class="col-span-2"><span class="text-slate-400">ประเภท/โควต้า:</span> <b class="text-slate-800">${escapeHtml(a.capabilities || '-')}</b></div>
      <div class="col-span-2"><span class="text-slate-400">มิเตอร์พิมพ์สะสม:</span> <b class="text-slate-800">${snap?.pageCount?.toLocaleString() ?? 'N/A'} หน้า</b></div>
    </div>
    ${suppliesHtml}
    ${simHtml}
  `;

  document.getElementById('detail-edit-btn').onclick = () => {
    closeDetailModal();
    openEditPrinter(p.id);
  };
  document.getElementById('detail-delete-btn').onclick = async () => {
    closeDetailModal();
    await deletePrinter(p.id);
  };

  document.getElementById('detail-modal').classList.remove('hidden');
  document.getElementById('detail-modal').classList.add('flex');
}

function closeDetailModal() {
  document.getElementById('detail-modal').classList.add('hidden');
  document.getElementById('detail-modal').classList.remove('flex');
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function changeScenario(id, scenario) {
  await fetch(`/api/printers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ simulatorScenario: scenario }),
  });
  await fetch('/api/poll', { method: 'POST' });
  await fetchStatus();
}

async function deletePrinter(id) {
  if (!confirm('ยืนยันการลบเครื่องปริ้นนี้?')) return;
  await fetch(`/api/printers/${id}`, { method: 'DELETE' });
  await fetchStatus();
}

function openPrinterModal() {
  document.getElementById('printer-id').value = '';
  document.getElementById('printer-name').value = '';
  document.getElementById('printer-conn-type').value = 'network';
  document.getElementById('printer-ip').value = '';
  document.getElementById('printer-port').value = 161;
  document.getElementById('printer-community').value = 'public';
  document.getElementById('asset-model').value = '';
  document.getElementById('asset-serial').value = '';
  document.getElementById('asset-contract-no').value = '';
  document.getElementById('asset-vendor').value = '';
  document.getElementById('asset-start-date').value = '';
  document.getElementById('asset-end-date').value = '';
  document.getElementById('asset-cost').value = '';
  document.getElementById('asset-term').value = '';
  document.getElementById('asset-capabilities').value = '';
  document.getElementById('printer-simulator').checked = false;
  document.getElementById('simulator-scenario-wrap').classList.add('hidden');
  document.getElementById('printer-modal-title').textContent = 'เพิ่มเครื่องปริ้น';
  document.getElementById('printer-modal').classList.remove('hidden');
  document.getElementById('printer-modal').classList.add('flex');
}

function openEditPrinter(id) {
  const p = currentData?.printers?.find((x) => x.id === id);
  if (!p) return;
  const a = p.asset || {};
  document.getElementById('printer-id').value = p.id;
  document.getElementById('printer-name').value = p.name;
  document.getElementById('printer-conn-type').value = p.connectionType || 'network';
  document.getElementById('printer-ip').value = p.ip;
  document.getElementById('printer-port').value = p.port;
  document.getElementById('printer-community').value = p.community;
  document.getElementById('asset-model').value = a.modelName || '';
  document.getElementById('asset-serial').value = a.serialNumber || '';
  document.getElementById('asset-contract-no').value = a.contractNumber || '';
  document.getElementById('asset-vendor').value = a.vendorNote || '';
  document.getElementById('asset-start-date').value = a.contractStartDate || '';
  document.getElementById('asset-end-date').value = a.contractEndDate || '';
  document.getElementById('asset-cost').value = a.monthlyCost || '';
  document.getElementById('asset-term').value = a.contractTerm || '';
  document.getElementById('asset-capabilities').value = a.capabilities || '';
  document.getElementById('printer-simulator').checked = p.simulator;
  document.getElementById('printer-scenario').value = p.simulatorScenario || 'normal';
  document.getElementById('simulator-scenario-wrap').classList.toggle('hidden', !p.simulator);
  document.getElementById('printer-modal-title').textContent = 'แก้ไขเครื่องปริ้น';
  document.getElementById('printer-modal').classList.remove('hidden');
  document.getElementById('printer-modal').classList.add('flex');
}

function closePrinterModal() {
  document.getElementById('printer-modal').classList.add('hidden');
  document.getElementById('printer-modal').classList.remove('flex');
}

async function openSettingsModal() {
  const s = currentData?.settings || {};
  document.getElementById('set-line-token').value = '';
  document.getElementById('set-line-secret').value = '';
  document.getElementById('set-line-target').value = s.lineTargetId || '';
  document.getElementById('set-low-ink').value = s.lowInkThresholdPercent ?? 15;
  document.getElementById('set-poll-interval').value = s.pollIntervalSeconds ?? 60;
  document.getElementById('set-daily-cron').value = s.dailyReportCron ?? '0 18 * * *';
  document.getElementById('set-cooldown').value = s.alertCooldownMinutes ?? 360;
  document.getElementById('set-contract-days').value = s.contractExpiryAlertDays ?? 30;
  document.getElementById('token-status-hint').textContent = s.hasLineToken
    ? `ตั้งค่า Token แล้ว (${s.lineChannelAccessTokenMasked})`
    : 'ยังไม่ได้ตั้งค่า Channel Access Token';

  // Load LINE Notification Rules
  const rules = s.lineNotifyRules || {};
  const setCheck = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.checked = Boolean(val);
  };
  setCheck('rule-paper-jam', rules.paperJam !== false);
  setCheck('rule-no-toner', rules.noToner !== false);
  setCheck('rule-hardware-error', rules.hardwareError !== false);
  setCheck('rule-low-ink', rules.lowInk !== false);
  setCheck('rule-offline', rules.offline !== false);
  setCheck('rule-contract', rules.contractExpiring !== false);
  setCheck('rule-no-paper', rules.noPaper === true);
  setCheck('rule-door-tray', rules.doorOrTray === true);

  // Load Windows Startup status
  try {
    const res = await fetch('/api/system/startup');
    const startup = await res.json();
    const wrap = document.getElementById('startup-setting-wrap');
    if (wrap) {
      if (startup.supported) {
        wrap.classList.remove('hidden');
        document.getElementById('set-startup').checked = Boolean(startup.enabled);
        document.getElementById('startup-status-hint').textContent = startup.enabled
          ? `เปิดใช้งานแล้ว (${startup.command || 'Windows Startup'})`
          : 'ปิดอยู่ (ไม่เริ่มทำงานอัตโนมัติเมื่อเปิดเครื่อง)';
      } else {
        wrap.classList.add('hidden');
      }
    }
  } catch {
    // ignore
  }

  document.getElementById('settings-modal').classList.remove('hidden');
  document.getElementById('settings-modal').classList.add('flex');
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.add('hidden');
  document.getElementById('settings-modal').classList.remove('flex');
}

document.getElementById('printer-simulator').addEventListener('change', (e) => {
  document.getElementById('simulator-scenario-wrap').classList.toggle('hidden', !e.target.checked);
});

document.getElementById('printer-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('printer-id').value;
  const payload = {
    name: document.getElementById('printer-name').value,
    connectionType: document.getElementById('printer-conn-type').value,
    ip: document.getElementById('printer-ip').value,
    port: Number(document.getElementById('printer-port').value),
    community: document.getElementById('printer-community').value,
    simulator: document.getElementById('printer-simulator').checked,
    simulatorScenario: document.getElementById('printer-scenario').value,
    asset: {
      location: document.getElementById('printer-name').value,
      modelName: document.getElementById('asset-model').value || undefined,
      serialNumber: document.getElementById('asset-serial').value || undefined,
      contractNumber: document.getElementById('asset-contract-no').value || undefined,
      vendorNote: document.getElementById('asset-vendor').value || undefined,
      contractStartDate: document.getElementById('asset-start-date').value || undefined,
      contractEndDate: document.getElementById('asset-end-date').value || undefined,
      monthlyCost: document.getElementById('asset-cost').value || undefined,
      contractTerm: document.getElementById('asset-term').value || undefined,
      capabilities: document.getElementById('asset-capabilities').value || undefined,
    },
  };
  const url = id ? `/api/printers/${id}` : '/api/printers';
  const method = id ? 'PUT' : 'POST';
  await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  closePrinterModal();
  await fetch('/api/poll', { method: 'POST' });
  await fetchStatus();
});

document.getElementById('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const getCheck = (id) => Boolean(document.getElementById(id)?.checked);
  const payload = {
    lineChannelAccessToken: document.getElementById('set-line-token').value,
    lineChannelSecret: document.getElementById('set-line-secret').value,
    lineTargetId: document.getElementById('set-line-target').value,
    lowInkThresholdPercent: Number(document.getElementById('set-low-ink').value),
    pollIntervalSeconds: Number(document.getElementById('set-poll-interval').value),
    dailyReportCron: document.getElementById('set-daily-cron').value,
    alertCooldownMinutes: Number(document.getElementById('set-cooldown').value),
    contractExpiryAlertDays: Number(document.getElementById('set-contract-days').value),
    lineNotifyRules: {
      paperJam: getCheck('rule-paper-jam'),
      noToner: getCheck('rule-no-toner'),
      hardwareError: getCheck('rule-hardware-error'),
      lowInk: getCheck('rule-low-ink'),
      offline: getCheck('rule-offline'),
      contractExpiring: getCheck('rule-contract'),
      noPaper: getCheck('rule-no-paper'),
      doorOrTray: getCheck('rule-door-tray'),
    },
  };
  await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const startupCheckbox = document.getElementById('set-startup');
  if (startupCheckbox) {
    try {
      await fetch('/api/system/startup', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: startupCheckbox.checked }),
      });
    } catch {
      // ignore
    }
  }

  closeSettingsModal();
  await fetchStatus();
});

document.getElementById('btn-add-printer').addEventListener('click', openPrinterModal);
document.getElementById('btn-open-settings').addEventListener('click', openSettingsModal);
document.getElementById('btn-shutdown').addEventListener('click', async () => {
  if (!confirm('ต้องการปิดโปรแกรม PrinterStatsNoti ใช่หรือไม่?')) return;
  try {
    await fetch('/api/shutdown', { method: 'POST' });
  } catch {
    // ignore connection close on exit
  }
  document.body.innerHTML = `<div class="min-h-screen flex items-center justify-center bg-slate-50 p-6"><div class="bg-white border border-slate-200 rounded-2xl p-8 text-center max-w-sm shadow-sm space-y-2"><h2 class="text-lg font-bold text-slate-800">ปิดโปรแกรมเรียบร้อยแล้ว</h2><p class="text-sm text-slate-500">คุณสามารถปิดแท็บเบราว์เซอร์นี้ได้เลย</p></div></div>`;
});

document.getElementById('btn-poll-now').addEventListener('click', async () => {
  const btn = document.getElementById('btn-poll-now');
  const icon = btn.querySelector('svg');
  btn.disabled = true;
  if (icon) icon.classList.add('animate-spin');
  try {
    await fetch('/api/poll', { method: 'POST' });
    await fetchStatus();
  } finally {
    btn.disabled = false;
    if (icon) icon.classList.remove('animate-spin');
  }
});
document.getElementById('btn-test-line').addEventListener('click', async () => {
  const res = await fetch('/api/test-line', { method: 'POST' });
  const data = await res.json();
  alert(data.ok ? 'ส่งข้อความทดสอบสำเร็จ!' : `ไม่สำเร็จ: ${data.error}`);
  await fetchStatus();
});
document.getElementById('btn-daily-report').addEventListener('click', async () => {
  const res = await fetch('/api/daily-report', { method: 'POST' });
  const rec = await res.json();
  alert(rec.deliveryStatus === 'sent' ? 'ส่งรายงานประจำวันเข้า LINE แล้ว!' : `บันทึกแล้ว (สถานะ: ${rec.deliveryStatus})`);
  await fetchStatus();
});

// Scan Network Modal
let lastDiscovered = [];
async function openScanModal() {
  document.getElementById('scan-results').classList.add('hidden');
  document.getElementById('scan-actions').classList.add('hidden');
  document.getElementById('scan-status').classList.add('hidden');
  document.getElementById('scan-modal').classList.remove('hidden');
  document.getElementById('scan-modal').classList.add('flex');

  const input = document.getElementById('scan-subnets');
  if (!input.value) {
    try {
      const res = await fetch('/api/network-interfaces');
      const data = await res.json();
      input.value = data.subnets?.length > 0 ? data.subnets.join(', ') : '192.168.0.0/24';
    } catch {
      input.value = '192.168.0.0/24';
    }
  }
  lucide.createIcons();
}

function closeScanModal() {
  document.getElementById('scan-modal').classList.add('hidden');
  document.getElementById('scan-modal').classList.remove('flex');
}

document.getElementById('btn-scan-network').addEventListener('click', openScanModal);
document.getElementById('scan-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-start-scan');
  const statusEl = document.getElementById('scan-status');
  const resultsEl = document.getElementById('scan-results');
  const actionsEl = document.getElementById('scan-actions');

  btn.disabled = true;
  btn.textContent = 'กำลังสแกน...';
  statusEl.classList.remove('hidden');
  statusEl.textContent = 'กำลังสแกนหาเครื่องปริ้นในเครือข่าย โปรดรอสักครู่...';
  resultsEl.classList.add('hidden');
  actionsEl.classList.add('hidden');

  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subnets: document.getElementById('scan-subnets').value,
        community: document.getElementById('scan-community').value,
        useTcpPorts: document.getElementById('scan-use-tcp').checked,
        useMdns: document.getElementById('scan-use-mdns').checked,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      statusEl.textContent = `เกิดข้อผิดพลาด: ${data.error}`;
      return;
    }

    lastDiscovered = data.discovered || [];
    statusEl.textContent = `สแกนทั้งหมด ${data.scannedCount} IP — พบเครื่องปริ้น ${lastDiscovered.length} เครื่อง`;
    if (lastDiscovered.length === 0) {
      resultsEl.innerHTML = `<div class="p-4 text-center text-xs text-slate-400">ไม่พบเครื่องปริ้นที่เปิดใช้งาน SNMP ในวง IP นี้</div>`;
      resultsEl.classList.remove('hidden');
      return;
    }

    resultsEl.innerHTML = lastDiscovered
      .map((item, idx) => {
        const protoBadges = (item.protocols || [])
          .map((pr) => `<span class="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600">${escapeHtml(pr)}</span>`)
          .join('');
        const snmpWarn = item.snmpEnabled === false
          ? `<span class="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800">SNMP ปิดอยู่</span>`
          : '';
        return `
        <label class="flex items-center justify-between gap-3 p-2.5 hover:bg-slate-50 cursor-pointer text-xs">
          <div class="flex items-center gap-2.5 min-w-0">
            <input type="checkbox" class="scan-checkbox rounded border-slate-300 text-indigo-600" data-index="${idx}" ${item.alreadyAdded ? 'disabled' : 'checked'} />
            <div class="min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <p class="font-semibold text-slate-800">${escapeHtml(item.ip)}</p>
                ${protoBadges}
                ${snmpWarn}
              </div>
              <p class="text-[11px] text-slate-500 truncate">${escapeHtml(item.model)}</p>
            </div>
          </div>
          ${
            item.alreadyAdded
              ? '<span class="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-500 shrink-0">มีแล้ว</span>'
              : '<span class="px-2 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700 shrink-0">พบใหม่</span>'
          }
        </label>
      `;
      })
      .join('');
    resultsEl.classList.remove('hidden');
    if (lastDiscovered.some((d) => !d.alreadyAdded)) {
      actionsEl.classList.remove('hidden');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'เริ่มสแกน';
  }
});

document.getElementById('btn-import-selected').addEventListener('click', async () => {
  const checked = [...document.querySelectorAll('.scan-checkbox:checked')];
  const printers = checked.map((cb) => {
    const item = lastDiscovered[Number(cb.dataset.index)];
    return {
      name: item.model.slice(0, 40) || `Printer (${item.ip})`,
      ip: item.ip,
      community: item.community,
      port: item.port,
      asset: { modelName: item.model },
    };
  });
  if (printers.length === 0) return;
  await fetch('/api/printers/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ printers }),
  });
  closeScanModal();
  await fetch('/api/poll', { method: 'POST' });
  await fetchStatus();
});

// Search, Brand/Vendor Filter, Group By, Sort, and View Toggle
document.getElementById('filter-search').addEventListener('input', renderPrintersList);
document.getElementById('filter-brand').addEventListener('change', renderPrintersList);
document.getElementById('filter-vendor').addEventListener('change', renderPrintersList);
document.getElementById('filter-groupby')?.addEventListener('change', (e) => {
  currentGroupBy = e.target.value;
  renderPrintersList();
});
document.getElementById('filter-sort')?.addEventListener('change', (e) => {
  currentSortBy = e.target.value;
  updateSortUi();
  renderPrintersList();
});
document.getElementById('btn-sort-dir')?.addEventListener('click', () => {
  currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
  updateSortUi();
  renderPrintersList();
});
document.getElementById('view-cards').addEventListener('click', () => {
  currentView = 'cards';
  updateViewButtonsUi();
  renderPrintersList();
});
document.getElementById('view-table').addEventListener('click', () => {
  currentView = 'table';
  updateViewButtonsUi();
  renderPrintersList();
});

// Excel / CSV Import Modal
function openImportModal() {
  document.getElementById('import-raw-text').value = '';
  document.getElementById('import-preview-wrap').classList.add('hidden');
  document.getElementById('btn-confirm-import').classList.add('hidden');
  document.getElementById('import-preview-count').textContent = '';
  document.getElementById('import-modal').classList.remove('hidden');
  document.getElementById('import-modal').classList.add('flex');
}

function closeImportModal() {
  document.getElementById('import-modal').classList.add('hidden');
  document.getElementById('import-modal').classList.remove('flex');
}

document.getElementById('btn-import-csv').addEventListener('click', openImportModal);
document.getElementById('import-file-input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  document.getElementById('import-raw-text').value = await file.text();
});

document.getElementById('btn-preview-import').addEventListener('click', async () => {
  const rawText = document.getElementById('import-raw-text').value;
  if (!rawText.trim()) return;
  const res = await fetch('/api/printers/import-csv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText, dryRun: true }),
  });
  const data = await res.json();
  const rows = data.rows || [];
  document.getElementById('import-preview-count').textContent = `พบ ${rows.length} รายการ`;
  document.getElementById('import-preview-body').innerHTML = rows
    .map(
      (r) => `
      <tr>
        <td class="p-2">${escapeHtml(r.name)}</td>
        <td class="p-2">${escapeHtml(r.asset?.modelName || '-')}</td>
        <td class="p-2 font-mono">${escapeHtml(r.asset?.serialNumber || '-')}</td>
        <td class="p-2 font-mono">${escapeHtml(r.ip)}</td>
        <td class="p-2">${escapeHtml(r.asset?.contractNumber || '-')}</td>
        <td class="p-2">${escapeHtml(r.asset?.contractEndDate || '-')}</td>
        <td class="p-2">${escapeHtml(r.asset?.vendorNote || '-')}</td>
      </tr>`
    )
    .join('');
  document.getElementById('import-preview-wrap').classList.remove('hidden');
  document.getElementById('btn-confirm-import').classList.toggle('hidden', rows.length === 0);
});

document.getElementById('btn-confirm-import').addEventListener('click', async () => {
  const rawText = document.getElementById('import-raw-text').value;
  const res = await fetch('/api/printers/import-csv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText, dryRun: false }),
  });
  const data = await res.json();
  closeImportModal();
  alert(`นำเข้าสำเร็จ ${(data.added || []).length} เครื่อง`);
  await fetch('/api/poll', { method: 'POST' });
  await fetchStatus();
});

fetchStatus();
setInterval(fetchStatus, 10000);
