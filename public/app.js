let currentData = null;
let currentView = 'cards';

const statusBadgeMap = {
  online: { label: 'พร้อมใช้', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  printing: { label: 'กำลังพิมพ์', cls: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  warning: { label: 'แจ้งเตือน', cls: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  error: { label: 'มีปัญหา', cls: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
  offline: { label: 'ออฟไลน์', cls: 'bg-slate-200 text-slate-700', dot: 'bg-slate-400' },
  usb: { label: 'USB', cls: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500' },
};

const errorFlagLabels = {
  lowPaper: 'กระดาษใกล้หมด',
  noPaper: 'กระดาษหมด',
  lowToner: 'หมึกใกล้หมด',
  noToner: 'หมึกหมด',
  doorOpen: 'ฝาเครื่องเปิด',
  jammed: 'กระดาษติด',
  offline: 'ออฟไลน์',
  serviceRequested: 'ต้องการซ่อมบำรุง',
};

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
            ? '<span class="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700">ส่งแล้ว</span>'
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

function getFilteredPrinters() {
  const printers = currentData?.printers || [];
  const q = (document.getElementById('filter-search').value || '').trim().toLowerCase();
  const brand = document.getElementById('filter-brand').value;
  const vendor = document.getElementById('filter-vendor').value;
  return printers.filter((p) => {
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

    // Group by Brand
    const groups = new Map();
    for (const p of filtered) {
      const b = detectBrand(p);
      if (!groups.has(b)) groups.set(b, []);
      groups.get(b).push(p);
    }

    container.innerHTML = [...groups.entries()]
      .map(([brandName, items]) => {
        const issueInGroup = items.filter(
          (p) => p.connectionType !== 'usb' && ['warning', 'error', 'offline'].includes(p.snapshot?.status)
        ).length;
        return `
          <div class="space-y-2.5">
            <div class="flex items-center justify-between px-1">
              <div class="flex items-center gap-2">
                <span class="w-1.5 h-4 rounded-full bg-indigo-600"></span>
                <h2 class="text-xs font-bold uppercase tracking-wide text-slate-700">${escapeHtml(brandName)}</h2>
                <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-200/80 text-slate-700">${items.length}</span>
                ${
                  issueInGroup > 0
                    ? `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">มีแจ้งเตือน ${issueInGroup}</span>`
                    : ''
                }
              </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              ${items.map(renderCompactCard).join('')}
            </div>
          </div>
        `;
      })
      .join('');
  } else {
    container.classList.add('hidden');
    tableWrap.classList.remove('hidden');
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-400">ไม่พบข้อมูลเครื่องปริ้น</td></tr>`;
    } else {
      tbody.innerHTML = filtered.map(renderPrinterRow).join('');
    }
  }
  lucide.createIcons();
}

function renderCompactCard(p) {
  const snap = p.snapshot;
  const isUsb = p.connectionType === 'usb';
  const status = isUsb ? 'usb' : snap?.status || 'offline';
  const badge = statusBadgeMap[status] || statusBadgeMap.offline;
  const a = p.asset || {};
  const threshold = currentData?.settings?.lowInkThresholdPercent ?? 15;

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
                  <div class="h-full rounded-full" style="width:${s.percent !== null ? pct : 0}%; background-color:${s.color || '#334155'}"></div>
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
    <div onclick="openDetailModal('${p.id}')" class="group bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md p-3.5 transition cursor-pointer flex flex-col justify-between gap-2.5">
      <div class="space-y-2">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="w-2 h-2 rounded-full shrink-0 ${badge.dot}"></span>
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

function renderPrinterRow(p) {
  const snap = p.snapshot;
  const isUsb = p.connectionType === 'usb';
  const status = isUsb ? 'usb' : snap?.status || 'offline';
  const badge = statusBadgeMap[status] || statusBadgeMap.offline;
  const a = p.asset || {};
  const minInk = snap?.supplies?.length
    ? snap.supplies.map((s) => `${s.name.split(' ')[0]}:${s.percent ?? '-'}%`).join(' ')
    : isUsb
      ? 'USB'
      : '-';

  return `
    <tr class="hover:bg-slate-50 cursor-pointer" onclick="openDetailModal('${p.id}')">
      <td class="py-2.5 px-3 font-medium text-slate-700">${escapeHtml(detectBrand(p))}</td>
      <td class="py-2.5 px-3 font-semibold text-slate-900">${escapeHtml(p.name)}</td>
      <td class="py-2.5 px-3">
        <div>${escapeHtml(a.modelName || snap?.model || '-')}</div>
        <div class="text-[11px] font-mono text-slate-400">${escapeHtml(a.serialNumber || '')}</div>
      </td>
      <td class="py-2.5 px-3 font-mono text-slate-700">${escapeHtml(p.ip)}</td>
      <td class="py-2.5 px-3">
        <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold ${badge.cls}">${badge.label}</span>
        <span class="text-[11px] text-slate-500 ml-1">${escapeHtml(minInk)}</span>
      </td>
      <td class="py-2.5 px-3">${escapeHtml(a.contractNumber || '-')} ${renderContractPill(p)}</td>
      <td class="py-2.5 px-3 text-slate-600">${escapeHtml(a.vendorNote || '-')}</td>
      <td class="py-2.5 px-3 text-right space-x-2" onclick="event.stopPropagation()">
        <button onclick="openEditPrinter('${p.id}')" class="text-indigo-600 hover:underline">แก้ไข</button>
        <button onclick="deletePrinter('${p.id}')" class="text-rose-500 hover:underline">ลบ</button>
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

  const simHtml = p.simulator
    ? `<div class="p-2.5 rounded-lg bg-indigo-50/70 border border-indigo-100 flex items-center justify-between">
         <span class="font-medium text-indigo-700">โหมดจำลอง (Simulator)</span>
         <select onchange="changeScenario('${p.id}', this.value)" class="text-xs border border-indigo-200 rounded px-2 py-1 bg-white">
           <option value="normal" ${p.simulatorScenario === 'normal' ? 'selected' : ''}>ปกติ (Normal)</option>
           <option value="low_ink" ${p.simulatorScenario === 'low_ink' ? 'selected' : ''}>หมึกใกล้หมด</option>
           <option value="paper_jam" ${p.simulatorScenario === 'paper_jam' ? 'selected' : ''}>กระดาษติด</option>
           <option value="offline" ${p.simulatorScenario === 'offline' ? 'selected' : ''}>ออฟไลน์</option>
         </select>
       </div>`
    : '';

  document.getElementById('detail-body').innerHTML = `
    <div class="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200/70">
      <div><span class="text-slate-400">Serial:</span> <b class="font-mono text-slate-800">${escapeHtml(a.serialNumber || '-')}</b></div>
      <div><span class="text-slate-400">เลขสัญญา:</span> <b class="text-slate-800">${escapeHtml(a.contractNumber || '-')}</b></div>
      <div><span class="text-slate-400">เริ่ม–สิ้นสุด:</span> <b class="text-slate-800">${escapeHtml(a.contractStartDate || '-')} - ${escapeHtml(a.contractEndDate || '-')}</b></div>
      <div><span class="text-slate-400">ระยะเวลา:</span> <b class="text-slate-800">${escapeHtml(a.contractTerm || '-')}</b></div>
      <div><span class="text-slate-400">ค่าเช่า/เดือน:</span> <b class="text-slate-800">${escapeHtml(a.monthlyCost || '-')}</b></div>
      <div><span class="text-slate-400">ผู้ให้บริการ:</span> <b class="text-slate-800">${escapeHtml(a.vendorNote || '-')}</b></div>
      <div class="col-span-2"><span class="text-slate-400">ประเภท/โควต้า:</span> <b class="text-slate-800">${escapeHtml(a.capabilities || '-')}</b></div>
      <div class="col-span-2"><span class="text-slate-400">มิเตอร์พิมพ์สะสม:</span> <b class="text-slate-800">${snap?.pageCount?.toLocaleString() ?? 'N/A'} หน้า</b></div>
    </div>
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

function openSettingsModal() {
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
  const payload = {
    lineChannelAccessToken: document.getElementById('set-line-token').value,
    lineChannelSecret: document.getElementById('set-line-secret').value,
    lineTargetId: document.getElementById('set-line-target').value,
    lowInkThresholdPercent: Number(document.getElementById('set-low-ink').value),
    pollIntervalSeconds: Number(document.getElementById('set-poll-interval').value),
    dailyReportCron: document.getElementById('set-daily-cron').value,
    alertCooldownMinutes: Number(document.getElementById('set-cooldown').value),
    contractExpiryAlertDays: Number(document.getElementById('set-contract-days').value),
  };
  await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
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
  await fetch('/api/poll', { method: 'POST' });
  await fetchStatus();
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
      .map((item, idx) => `
        <label class="flex items-center justify-between gap-3 p-2.5 hover:bg-slate-50 cursor-pointer text-xs">
          <div class="flex items-center gap-2.5 min-w-0">
            <input type="checkbox" class="scan-checkbox rounded border-slate-300 text-indigo-600" data-index="${idx}" ${item.alreadyAdded ? 'disabled' : 'checked'} />
            <div class="min-w-0">
              <p class="font-semibold text-slate-800 truncate">${escapeHtml(item.ip)}</p>
              <p class="text-[11px] text-slate-500 truncate">${escapeHtml(item.model)}</p>
            </div>
          </div>
          ${
            item.alreadyAdded
              ? '<span class="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-500 shrink-0">มีแล้ว</span>'
              : '<span class="px-2 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700 shrink-0">พบใหม่</span>'
          }
        </label>
      `)
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

// Search, Brand/Vendor Filter, and View Toggle
document.getElementById('filter-search').addEventListener('input', renderPrintersList);
document.getElementById('filter-brand').addEventListener('change', renderPrintersList);
document.getElementById('filter-vendor').addEventListener('change', renderPrintersList);
document.getElementById('view-cards').addEventListener('click', () => {
  currentView = 'cards';
  document.getElementById('view-cards').className = 'px-2.5 py-1 rounded-md text-xs font-medium bg-white text-indigo-600 shadow-sm';
  document.getElementById('view-table').className = 'px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900';
  renderPrintersList();
});
document.getElementById('view-table').addEventListener('click', () => {
  currentView = 'table';
  document.getElementById('view-table').className = 'px-2.5 py-1 rounded-md text-xs font-medium bg-white text-indigo-600 shadow-sm';
  document.getElementById('view-cards').className = 'px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900';
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
