let currentData = null;

const statusBadgeMap = {
  online: { label: 'พร้อมใช้งาน', cls: 'bg-emerald-100 text-emerald-700' },
  printing: { label: 'กำลังพิมพ์', cls: 'bg-blue-100 text-blue-700' },
  warning: { label: 'แจ้งเตือน', cls: 'bg-amber-100 text-amber-800' },
  error: { label: 'มีปัญหา', cls: 'bg-rose-100 text-rose-700' },
  offline: { label: 'ออฟไลน์', cls: 'bg-slate-200 text-slate-700' },
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

async function fetchStatus() {
  const res = await fetch('/api/status');
  currentData = await res.json();
  renderDashboard(currentData);
}

function renderDashboard(data) {
  const printers = data.printers || [];
  const onlineCount = printers.filter((p) => ['online', 'printing'].includes(p.snapshot?.status)).length;
  const issueCount = printers.filter((p) => ['warning', 'error', 'offline'].includes(p.snapshot?.status)).length;
  const pagesToday = printers.reduce((sum, p) => sum + (p.dailyStat?.pagesPrintedToday || 0), 0);

  document.getElementById('stat-total').textContent = printers.length;
  document.getElementById('stat-online').textContent = onlineCount;
  document.getElementById('stat-issues').textContent = issueCount;
  document.getElementById('stat-pages-today').textContent = pagesToday.toLocaleString();
  document.getElementById('last-updated').textContent = `อัปเดตล่าสุด: ${new Date().toLocaleTimeString('th-TH')}`;

  const grid = document.getElementById('printers-grid');
  if (printers.length === 0) {
    grid.innerHTML = `<div class="col-span-full bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">ยังไม่มีเครื่องปริ้น กดปุ่ม <b>เพิ่มเครื่องปริ้น</b> ด้านบนเพื่อเริ่มต้น</div>`;
  } else {
    grid.innerHTML = printers.map(renderPrinterCard).join('');
  }

  const alertsEl = document.getElementById('alerts-list');
  const alerts = data.alerts || [];
  if (alerts.length === 0) {
    alertsEl.innerHTML = `<div class="p-6 text-center text-sm text-slate-400">ยังไม่มีประวัติการแจ้งเตือน</div>`;
  } else {
    alertsEl.innerHTML = alerts
      .map((a) => {
        const deliveryBadge =
          a.deliveryStatus === 'sent'
            ? '<span class="px-2 py-0.5 rounded text-[11px] bg-emerald-100 text-emerald-700">ส่งสำเร็จ</span>'
            : a.deliveryStatus === 'skipped'
              ? '<span class="px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-600">ยังไม่ได้ตั้งค่า LINE</span>'
              : '<span class="px-2 py-0.5 rounded text-[11px] bg-rose-100 text-rose-700">ส่งไม่สำเร็จ</span>';
        return `
          <div class="px-5 py-3 flex items-start justify-between gap-4">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="text-xs font-semibold text-slate-700">${escapeHtml(a.printerName)}</span>
                ${deliveryBadge}
              </div>
              <p class="text-sm text-slate-700 whitespace-pre-line">${escapeHtml(a.message)}</p>
              ${a.errorDetail ? `<p class="text-xs text-rose-500">${escapeHtml(a.errorDetail)}</p>` : ''}
            </div>
            <span class="text-xs text-slate-400 shrink-0">${new Date(a.createdAt).toLocaleString('th-TH')}</span>
          </div>
        `;
      })
      .join('');
  }

  lucide.createIcons();
}

function renderPrinterCard(p) {
  const snap = p.snapshot;
  const status = snap?.status || 'offline';
  const badge = statusBadgeMap[status] || statusBadgeMap.offline;

  const suppliesHtml =
    snap?.supplies?.length > 0
      ? snap.supplies
          .map((s) => {
            const pct = s.percent ?? 0;
            const low = s.percent !== null && s.percent <= (currentData?.settings?.lowInkThresholdPercent ?? 15);
            return `
              <div>
                <div class="flex justify-between text-xs mb-1">
                  <span class="font-medium text-slate-700">${escapeHtml(s.name)}</span>
                  <span class="font-semibold ${low ? 'text-rose-600' : 'text-slate-700'}">${s.percent !== null ? `${pct}%` : 'N/A'}</span>
                </div>
                <div class="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all" style="width: ${s.percent !== null ? pct : 0}%; background-color: ${s.color || '#334155'}"></div>
                </div>
              </div>
            `;
          })
          .join('')
      : `<p class="text-xs text-slate-400">ไม่มีข้อมูลระดับหมึก</p>`;

  const traysHtml =
    snap?.trays?.length > 0
      ? snap.trays
          .map(
            (t) => `
            <div class="flex items-center justify-between text-xs text-slate-600">
              <span>${escapeHtml(t.name)}</span>
              <span class="font-medium">${t.percent !== null ? `${t.percent}%` : 'OK'}</span>
            </div>
          `
          )
          .join('')
      : '';

  const flagsHtml =
    snap?.errorFlags?.length > 0
      ? `<div class="flex flex-wrap gap-1.5 pt-1">${snap.errorFlags
          .map((f) => `<span class="px-2 py-0.5 rounded-md text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">${errorFlagLabels[f] || f}</span>`)
          .join('')}</div>`
      : '';

  const simSelector = p.simulator
    ? `<div class="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
         <span class="text-[11px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">Simulator</span>
         <select onchange="changeScenario('${p.id}', this.value)" class="text-xs border border-slate-200 rounded px-2 py-1 bg-white">
           <option value="normal" ${p.simulatorScenario === 'normal' ? 'selected' : ''}>ปกติ (Normal)</option>
           <option value="low_ink" ${p.simulatorScenario === 'low_ink' ? 'selected' : ''}>หมึกใกล้หมด</option>
           <option value="paper_jam" ${p.simulatorScenario === 'paper_jam' ? 'selected' : ''}>กระดาษติด</option>
           <option value="offline" ${p.simulatorScenario === 'offline' ? 'selected' : ''}>ออฟไลน์</option>
         </select>
       </div>`
    : '';

  return `
    <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between space-y-4">
      <div>
        <div class="flex items-start justify-between gap-2">
          <div>
            <h3 class="font-bold text-slate-900">${escapeHtml(p.name)}</h3>
            <p class="text-xs text-slate-500">${escapeHtml(p.ip)} ${snap?.model ? `• ${escapeHtml(snap.model)}` : ''}</p>
          </div>
          <span class="px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${badge.cls}">${badge.label}</span>
        </div>

        ${flagsHtml}

        <div class="mt-4 space-y-2.5">
          ${suppliesHtml}
        </div>

        ${traysHtml ? `<div class="mt-4 pt-3 border-t border-slate-100 space-y-1">${traysHtml}</div>` : ''}
      </div>

      <div>
        <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>พิมพ์สะสม: <b class="text-slate-800">${snap?.pageCount?.toLocaleString() ?? 'N/A'}</b> หน้า</span>
          <div class="flex items-center gap-2">
            <button onclick="openEditPrinter('${p.id}')" class="text-slate-500 hover:text-indigo-600">แก้ไข</button>
            <button onclick="deletePrinter('${p.id}')" class="text-slate-400 hover:text-rose-600">ลบ</button>
          </div>
        </div>
        ${simSelector}
      </div>
    </div>
  `;
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
  document.getElementById('printer-ip').value = '';
  document.getElementById('printer-port').value = 161;
  document.getElementById('printer-community').value = 'public';
  document.getElementById('printer-simulator').checked = false;
  document.getElementById('simulator-scenario-wrap').classList.add('hidden');
  document.getElementById('printer-modal-title').textContent = 'เพิ่มเครื่องปริ้น';
  document.getElementById('printer-modal').classList.remove('hidden');
  document.getElementById('printer-modal').classList.add('flex');
}

function openEditPrinter(id) {
  const p = currentData?.printers?.find((x) => x.id === id);
  if (!p) return;
  document.getElementById('printer-id').value = p.id;
  document.getElementById('printer-name').value = p.name;
  document.getElementById('printer-ip').value = p.ip;
  document.getElementById('printer-port').value = p.port;
  document.getElementById('printer-community').value = p.community;
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
    ip: document.getElementById('printer-ip').value,
    port: Number(document.getElementById('printer-port').value),
    community: document.getElementById('printer-community').value,
    simulator: document.getElementById('printer-simulator').checked,
    simulatorScenario: document.getElementById('printer-scenario').value,
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
      if (data.subnets?.length > 0) {
        input.value = data.subnets.join(', ');
      } else {
        input.value = '192.168.1.0/24';
      }
    } catch {
      input.value = '192.168.1.0/24';
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
      resultsEl.innerHTML = `<div class="p-4 text-center text-sm text-slate-400">ไม่พบเครื่องปริ้นที่เปิดใช้งาน SNMP ในวง IP นี้</div>`;
      resultsEl.classList.remove('hidden');
      return;
    }

    resultsEl.innerHTML = lastDiscovered
      .map((item, idx) => `
        <label class="flex items-center justify-between gap-3 p-3 hover:bg-slate-50 cursor-pointer">
          <div class="flex items-center gap-3 min-w-0">
            <input type="checkbox" class="scan-checkbox rounded border-slate-300 text-indigo-600" data-index="${idx}" ${item.alreadyAdded ? 'disabled' : 'checked'} />
            <div class="min-w-0">
              <p class="text-sm font-semibold text-slate-800 truncate">${escapeHtml(item.ip)}</p>
              <p class="text-xs text-slate-500 truncate">${escapeHtml(item.model)}</p>
            </div>
          </div>
          ${
            item.alreadyAdded
              ? '<span class="px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-500 shrink-0">มีในระบบแล้ว</span>'
              : '<span class="px-2 py-0.5 rounded text-[11px] bg-emerald-100 text-emerald-700 shrink-0">พบใหม่</span>'
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

fetchStatus();
setInterval(fetchStatus, 10000);
