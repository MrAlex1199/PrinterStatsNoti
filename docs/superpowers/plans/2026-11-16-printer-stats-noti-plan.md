# PrinterStatsNoti Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an all-in-one Node.js (TypeScript) LAN printer monitoring service with a responsive Web Dashboard, SNMP v1/v2c telemetry collection, Printer Simulator mode, and LINE Messaging API alerts + interactive bot.

**Architecture:** Single-process TypeScript application using Express for REST APIs, static Web Dashboard, and LINE Webhook; `net-snmp` for Printer-MIB polling; an atomic JSON store (`data/store.json`) for zero-dependency persistence; and an alert deduplication engine with `node-cron` daily summaries.

**Tech Stack:** Node.js `>=22` (v24.7.0), TypeScript `^5.x`, Express `^4.x`, `net-snmp`, `@line/bot-sdk`, `node-cron`, `vitest`, Tailwind CSS (CDN) + Lucide Icons.

**Spec:** [2026-11-16-printer-stats-noti-design.md](../../specs/2026-11-16-printer-stats-noti-design.md)

## Global Constraints
- Runtime: Node.js `>= 22.0.0`, TypeScript strict mode (`"strict": true`).
- Zero native C++ dependencies (use atomic JSON persistence in `data/store.json`, not `better-sqlite3`).
- Default HTTP port `3000` (overridable via `process.env.PORT`).
- All tests use `vitest` (`npx vitest run`).
- Never crash the polling loop if a printer is offline, times out, or returns non-standard SNMP values.

## Review Focus
- **SNMP negative/special RFC 3805 values**: Printers frequently return `-1` (other), `-2` (unknown), or `-3` (some remaining/OK) for supply or tray levels instead of `0..max`; parser must map `-3` to an "OK" / `100%` or non-critical status and `-1`/`-2` to `null` (unknown) rather than `-2%` triggering false low-ink alerts.
- **Alert deduplication & recovery**: When ink stays at `10%` across 100 polls, the user must receive only 1 alert until cooldown expires (`alertCooldownMinutes`), and when the cartridge is replaced (`> threshold`), the alert state resets cleanly.
- **Missing LINE credentials**: If `lineChannelAccessToken` or `lineTargetId` is empty, alert dispatch and webhook verification must fail gracefully (log warning + record in alert history as `skipped`) without throwing unhandled rejections.
- **Daily page counter rollover/reset**: If a printer reboots or `startOfDayPageCount` exceeds `currentPageCount`, daily printed pages must clamp to `>= 0` (never negative).
- **Concurrent atomic writes**: Rapid updates to `data/store.json` must serialize through a write queue or temp-file rename so JSON never corrupts.

---

### Task 1: Project Scaffolding & Shared Types

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/types.ts`
- Test: `tests/types.test.ts`

**Interfaces:**
- Produces: `PrinterConfig`, `SupplyItem`, `PaperTrayItem`, `PrinterErrorFlag`, `PrinterSnapshot`, `AlertRecord`, `AppSettings`, `StoreData` in `src/types.ts`

- [ ] **Step 1: Initialize `package.json`, `tsconfig.json`, and `vitest.config.ts`**

Create `package.json` with dependencies (`express`, `net-snmp`, `@line/bot-sdk`, `node-cron`, `dotenv`) and devDependencies (`typescript`, `tsx`, `vitest`, `supertest`, `@types/express`, `@types/node`, `@types/node-cron`, `@types/supertest`). Initialize git repo if not initialized.

- [ ] **Step 2: Write the failing test `tests/types.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, PrinterStatus } from '../src/types.js';

describe('Shared Types & Defaults', () => {
  it('provides sensible default settings', () => {
    expect(DEFAULT_SETTINGS.pollIntervalSeconds).toBe(60);
    expect(DEFAULT_SETTINGS.lowInkThresholdPercent).toBe(15);
    expect(DEFAULT_SETTINGS.dailyReportCron).toBe('0 18 * * *');
    expect(DEFAULT_SETTINGS.alertCooldownMinutes).toBe(360);
    expect(PrinterStatus.Online).toBe('online');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm install && npx vitest run tests/types.test.ts`
Expected: FAIL with module not found `../src/types.js`

- [ ] **Step 4: Implement `src/types.ts`**

Define `PrinterStatus` enum (`online`, `printing`, `warning`, `error`, `offline`), `PrinterErrorFlag` union (`lowPaper`, `noPaper`, `lowToner`, `noToner`, `doorOpen`, `jammed`, `offline`, `serviceRequested`), `PrinterConfig`, `SupplyItem`, `PaperTrayItem`, `PrinterSnapshot`, `AlertRecord`, `DailyPrinterStat`, `AppSettings`, `DEFAULT_SETTINGS`, and `StoreData`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/types.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git init
git add package.json tsconfig.json vitest.config.ts src/types.ts tests/types.test.ts
git commit -m "chore: scaffold TypeScript project and define shared types"
```

---

### Task 2: Atomic JSON Storage Layer

**Files:**
- Create: `src/storage/store.ts`
- Test: `tests/store.test.ts`

**Interfaces:**
- Consumes: `PrinterConfig`, `PrinterSnapshot`, `AlertRecord`, `AppSettings`, `DEFAULT_SETTINGS`, `StoreData`, `DailyPrinterStat` from `src/types.ts`
- Produces: `JsonStore` class in `src/storage/store.ts` with methods:
  - `init(): Promise<void>`
  - `getPrinters(): PrinterConfig[]`
  - `upsertPrinter(printer: PrinterConfig): Promise<PrinterConfig>`
  - `deletePrinter(id: string): Promise<boolean>`
  - `getSettings(): AppSettings`
  - `updateSettings(partial: Partial<AppSettings>): Promise<AppSettings>`
  - `getSnapshot(printerId: string): PrinterSnapshot | undefined`
  - `getAllSnapshots(): Record<string, PrinterSnapshot>`
  - `saveSnapshot(snapshot: PrinterSnapshot): Promise<void>`
  - `getAlerts(limit?: number): AlertRecord[]`
  - `addAlert(alert: AlertRecord): Promise<void>`
  - `getLastAlertTime(key: string): number | undefined`
  - `setLastAlertTime(key: string, timestampMs: number): Promise<void>`
  - `clearLastAlertTime(key: string): Promise<void>`
  - `getDailyStat(printerId: string, dateStr: string): DailyPrinterStat | undefined`
  - `updateDailyStat(printerId: string, dateStr: string, currentPageCount: number): Promise<DailyPrinterStat>`

- [ ] **Step 1: Write the failing test `tests/store.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { JsonStore } from '../src/storage/store.js';

describe('JsonStore', () => {
  let tempDir: string;
  let store: JsonStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'printer-store-'));
    store = new JsonStore(path.join(tempDir, 'store.json'));
    await store.init();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('persists printers and settings across reloads', async () => {
    await store.upsertPrinter({
      id: 'p1',
      name: 'Office HP',
      ip: '192.168.1.50',
      community: 'public',
      port: 161,
      enabled: true,
      simulator: false,
    });
    const reloaded = new JsonStore(path.join(tempDir, 'store.json'));
    await reloaded.init();
    expect(reloaded.getPrinters()).toHaveLength(1);
    expect(reloaded.getPrinters()[0].name).toBe('Office HP');
  });

  it('clamps daily printed pages to >= 0 even if page counter resets', async () => {
    await store.updateDailyStat('p1', '2026-11-16', 1000);
    const stat = await store.updateDailyStat('p1', '2026-11-16', 50);
    expect(stat.pagesPrintedToday).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/store.test.ts`
Expected: FAIL with module not found

- [ ] **Step 3: Implement `JsonStore` in `src/storage/store.ts`**

Use an in-memory `StoreData` cache backed by a serialized write queue (`this.writeChain`) that writes to `<filePath>.tmp` and renames atomically (`fs.rename`). Keep `alertHistory` capped at 200 latest entries.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/storage/store.ts tests/store.test.ts
git commit -m "feat: implement atomic JSON persistence store"
```

---

### Task 3: SNMP MIB Parser & Printer Simulator

**Files:**
- Create: `src/snmp/parser.ts`
- Create: `src/snmp/simulator.ts`
- Create: `src/snmp/collector.ts`
- Test: `tests/snmp.test.ts`

**Interfaces:**
- Consumes: `PrinterConfig`, `PrinterSnapshot`, `PrinterStatus`, `PrinterErrorFlag`, `SupplyItem`, `PaperTrayItem` from `src/types.ts`
- Produces:
  - `decodeErrorStateBitmask(buf: Buffer | number): PrinterErrorFlag[]` in `src/snmp/parser.ts`
  - `calculateSupplyPercent(level: number, maxCapacity: number): number | null` in `src/snmp/parser.ts`
  - `generateSimulatedSnapshot(printer: PrinterConfig, scenario?: string): PrinterSnapshot` in `src/snmp/simulator.ts`
  - `collectPrinterSnapshot(printer: PrinterConfig): Promise<PrinterSnapshot>` in `src/snmp/collector.ts`

- [ ] **Step 1: Write the failing test `tests/snmp.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { calculateSupplyPercent, decodeErrorStateBitmask } from '../src/snmp/parser.js';
import { collectPrinterSnapshot } from '../src/snmp/collector.js';
import { PrinterStatus } from '../src/types.js';

describe('SNMP Parser & Simulator', () => {
  it('handles RFC 3805 special supply values (-1, -2, -3)', () => {
    expect(calculateSupplyPercent(45, 100)).toBe(45);
    expect(calculateSupplyPercent(-3, 100)).toBe(100); // OK / some remaining
    expect(calculateSupplyPercent(-2, 100)).toBeNull(); // unknown
    expect(calculateSupplyPercent(-1, 100)).toBeNull(); // other
    expect(calculateSupplyPercent(50, 0)).toBeNull();
  });

  it('decodes hrPrinterDetectedErrorState bitmask', () => {
    // Bit 0 (0x80) = lowPaper, Bit 2 (0x20) = lowToner, Bit 5 (0x04) = jammed
    const flags = decodeErrorStateBitmask(Buffer.from([0xa4]));
    expect(flags).toContain('lowPaper');
    expect(flags).toContain('lowToner');
    expect(flags).toContain('jammed');
  });

  it('returns simulated snapshot when printer.simulator is true', async () => {
    const snap = await collectPrinterSnapshot({
      id: 'sim-1',
      name: 'Demo Laser',
      ip: '127.0.0.1',
      community: 'public',
      port: 161,
      enabled: true,
      simulator: true,
      simulatorScenario: 'low_ink',
    });
    expect(snap.printerId).toBe('sim-1');
    expect(snap.status).toBe(PrinterStatus.Warning);
    expect(snap.supplies.some((s) => s.percent !== null && s.percent <= 15)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/snmp.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/snmp/parser.ts`, `src/snmp/simulator.ts`, and `src/snmp/collector.ts`**

- `parser.ts`: Implement RFC 3805 `hrPrinterDetectedErrorState` bitmask decoding (MSB bit 0..7 in byte 0: `lowPaper`, `noPaper`, `lowToner`, `noToner`, `doorOpen`, `jammed`, `offline`, `serviceRequested`), supply percent normalization, and supply color inference from description (`Black`/`Cyan`/`Magenta`/`Yellow`/`Waste`).
- `simulator.ts`: Support scenarios `'normal'`, `'low_ink'`, `'paper_jam'`, `'offline'` so users can test every alert state on the dashboard.
- `collector.ts`: If `printer.simulator` is true, return `generateSimulatedSnapshot`. Otherwise use `net-snmp` `session.get` & `session.subtree` with a 4000ms timeout; catch all network/timeout errors and return an `Offline` `PrinterSnapshot` with `errorMessage` instead of throwing.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/snmp.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/snmp/parser.ts src/snmp/simulator.ts src/snmp/collector.ts tests/snmp.test.ts
git commit -m "feat: add RFC 3805 SNMP parser, collector, and simulator"
```

---

### Task 4: Alert & Deduplication Engine

**Files:**
- Create: `src/alerts/engine.ts`
- Test: `tests/alerts.test.ts`

**Interfaces:**
- Consumes: `JsonStore` from `src/storage/store.ts`, `PrinterConfig`, `PrinterSnapshot`, `AlertRecord`, `PrinterStatus` from `src/types.ts`
- Produces: `AlertEngine` class in `src/alerts/engine.ts` with:
  - `constructor(store: JsonStore, notifier: AlertNotifier)`
  - `evaluate(printer: PrinterConfig, snapshot: PrinterSnapshot, nowMs?: number): Promise<AlertRecord[]>`
  - `sendDailySummary(now?: Date): Promise<void>`
  - `AlertNotifier` interface: `{ sendPushMessage(text: string): Promise<{ ok: boolean; error?: string }> }`

- [ ] **Step 1: Write the failing test `tests/alerts.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { JsonStore } from '../src/storage/store.js';
import { AlertEngine } from '../src/alerts/engine.js';
import { PrinterStatus, PrinterSnapshot, PrinterConfig } from '../src/types.js';

describe('AlertEngine', () => {
  let tempDir: string;
  let store: JsonStore;
  const sendPushMessage = vi.fn(async () => ({ ok: true }));

  const printer: PrinterConfig = {
    id: 'p1',
    name: 'Canon Office',
    ip: '192.168.1.20',
    community: 'public',
    port: 161,
    enabled: true,
    simulator: false,
  };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'alert-engine-'));
    store = new JsonStore(path.join(tempDir, 'store.json'));
    await store.init();
    await store.upsertPrinter(printer);
    sendPushMessage.mockClear();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('sends low ink alert once and deduplicates within cooldown', async () => {
    const engine = new AlertEngine(store, { sendPushMessage });
    const lowInkSnap: PrinterSnapshot = {
      printerId: 'p1',
      status: PrinterStatus.Warning,
      supplies: [{ name: 'Black Toner', color: '#111827', percent: 10, level: 10, maxCapacity: 100 }],
      trays: [],
      errorFlags: ['lowToner'],
      pageCount: 500,
      updatedAt: new Date().toISOString(),
    };

    const first = await engine.evaluate(printer, lowInkSnap, 1000);
    expect(first).toHaveLength(1);
    expect(sendPushMessage).toHaveBeenCalledTimes(1);

    // 5 minutes later -> deduplicated
    const second = await engine.evaluate(printer, lowInkSnap, 1000 + 5 * 60_000);
    expect(second).toHaveLength(0);
    expect(sendPushMessage).toHaveBeenCalledTimes(1);

    // Recovered (> 15%), then drops again -> alerts immediately
    const okSnap: PrinterSnapshot = {
      ...lowInkSnap,
      status: PrinterStatus.Online,
      supplies: [{ name: 'Black Toner', color: '#111827', percent: 100, level: 100, maxCapacity: 100 }],
      errorFlags: [],
    };
    await engine.evaluate(printer, okSnap, 1000 + 6 * 60_000);
    const third = await engine.evaluate(printer, lowInkSnap, 1000 + 7 * 60_000);
    expect(third).toHaveLength(1);
    expect(sendPushMessage).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/alerts.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `AlertEngine` in `src/alerts/engine.ts`**

Evaluate:
1. Offline transition (`snapshot.status === PrinterStatus.Offline`)
2. Paper Jam / Out of Paper (`errorFlags` includes `jammed` or `noPaper`)
3. Door Open / Service Requested (`errorFlags` includes `doorOpen` or `serviceRequested`)
4. Low Ink/Toner (any supply with `percent !== null && percent <= settings.lowInkThresholdPercent`)
Clear alert keys when condition resolves. Record every alert in `store.addAlert()` with status `'sent'` or `'skipped'`/`'failed'`. Implement `sendDailySummary` to format Thai summary message with daily page counts and lowest ink levels.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/alerts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/alerts/engine.ts tests/alerts.test.ts
git commit -m "feat: implement alert evaluation and cooldown deduplication engine"
```

---

### Task 5: LINE Messaging API Service & Flex Message Builder

**Files:**
- Create: `src/line/service.ts`
- Test: `tests/line.test.ts`

**Interfaces:**
- Consumes: `JsonStore` from `src/storage/store.ts`, `PrinterConfig`, `PrinterSnapshot` from `src/types.ts`
- Produces:
  - `LineService` class in `src/line/service.ts` implementing `AlertNotifier` with:
    - `sendPushMessage(text: string): Promise<{ ok: boolean; error?: string }>`
    - `buildStatusFlexMessage(printers: PrinterConfig[], snapshots: Record<string, PrinterSnapshot>): Record<string, unknown>`
    - `handleWebhookEvents(events: unknown[]): Promise<void>`

- [ ] **Step 1: Write the failing test `tests/line.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { JsonStore } from '../src/storage/store.js';
import { LineService } from '../src/line/service.js';
import { PrinterStatus } from '../src/types.js';

describe('LineService', () => {
  let tempDir: string;
  let store: JsonStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'line-svc-'));
    store = new JsonStore(path.join(tempDir, 'store.json'));
    await store.init();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('gracefully skips push message when credentials are missing', async () => {
    const svc = new LineService(store);
    const res = await svc.sendPushMessage('Test alert');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('not configured');
  });

  it('builds a valid LINE Flex Carousel message for printer status', () => {
    const svc = new LineService(store);
    const flex = svc.buildStatusFlexMessage(
      [{ id: 'p1', name: 'Office HP', ip: '192.168.1.50', community: 'public', port: 161, enabled: true, simulator: true }],
      {
        p1: {
          printerId: 'p1',
          status: PrinterStatus.Online,
          supplies: [{ name: 'Black', color: '#111827', percent: 80, level: 80, maxCapacity: 100 }],
          trays: [{ name: 'Tray 1', percent: 100, level: 250, maxCapacity: 250 }],
          errorFlags: [],
          pageCount: 1234,
          updatedAt: new Date().toISOString(),
        },
      }
    );
    expect(flex.type).toBe('flex');
    expect((flex.contents as { type: string }).type).toBe('carousel');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/line.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `LineService` in `src/line/service.ts`**

Use `@line/bot-sdk` `messagingApi.MessagingApiClient` dynamically using current `store.getSettings()`. Support webhook commands `"สถานะ"`, `"status"`, `"เช็คหมึก"` by replying with `buildStatusFlexMessage(...)`. Also support `"แจ้งเตือนทดสอบ"` or `"help"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/line.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/line/service.ts tests/line.test.ts
git commit -m "feat: implement LINE Messaging API service and Flex status cards"
```

---

### Task 6: Scheduler & Express REST API Server

**Files:**
- Create: `src/scheduler/runner.ts`
- Create: `src/server/app.ts`
- Create: `src/index.ts`
- Test: `tests/api.test.ts`

**Interfaces:**
- Consumes: `JsonStore`, `collectPrinterSnapshot`, `AlertEngine`, `LineService`
- Produces:
  - `PollingScheduler` in `src/scheduler/runner.ts` (`start()`, `stop()`, `pollAllNow()`, `reschedule()`)
  - `createApp(store: JsonStore, scheduler: PollingScheduler, lineService: LineService, alertEngine: AlertEngine): express.Express` in `src/server/app.ts`

- [ ] **Step 1: Write the failing test `tests/api.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { JsonStore } from '../src/storage/store.js';
import { LineService } from '../src/line/service.js';
import { AlertEngine } from '../src/alerts/engine.js';
import { PollingScheduler } from '../src/scheduler/runner.js';
import { createApp } from '../src/server/app.js';

describe('Express API', () => {
  let tempDir: string;
  let store: JsonStore;
  let scheduler: PollingScheduler;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-test-'));
    store = new JsonStore(path.join(tempDir, 'store.json'));
    await store.init();
    const lineSvc = new LineService(store);
    const alertEngine = new AlertEngine(store, lineSvc);
    scheduler = new PollingScheduler(store, alertEngine);
    // Do not start background interval in unit test
    const app = createApp(store, scheduler, lineSvc, alertEngine);
    (globalThis as unknown as { testApp: typeof app }).testApp = app;
  });

  afterEach(async () => {
    scheduler.stop();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('creates a simulated printer and polls its status', async () => {
    const app = (globalThis as unknown as { testApp: ReturnType<typeof createApp> }).testApp;
    const createRes = await request(app).post('/api/printers').send({
      name: 'Demo Printer',
      ip: '192.168.1.99',
      simulator: true,
      simulatorScenario: 'normal',
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeTruthy();

    const pollRes = await request(app).post('/api/poll');
    expect(pollRes.status).toBe(200);

    const statusRes = await request(app).get('/api/status');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.printers).toHaveLength(1);
    expect(statusRes.body.printers[0].snapshot.supplies.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/scheduler/runner.ts`, `src/server/app.ts`, and `src/index.ts`**

API endpoints in `src/server/app.ts`:
- `GET /api/status` — returns `{ printers: [...with latest snapshot & dailyStat], settings (masked token), alerts }`
- `POST /api/printers` — add printer (validates `name` & `ip`, auto-generates `id`)
- `PUT /api/printers/:id` — update printer (including `simulatorScenario`)
- `DELETE /api/printers/:id` — delete printer
- `POST /api/poll` — trigger immediate poll of all enabled printers
- `PUT /api/settings` — update poll interval, thresholds, LINE credentials, daily cron; calls `scheduler.reschedule()`
- `POST /api/test-line` — send a test LINE push message and return `{ ok, error }`
- `POST /api/daily-report` — manually trigger daily summary report
- `POST /webhook` — LINE Bot webhook receiver (verifies signature if `lineChannelSecret` is set, otherwise returns 200 and logs warning)
- Serve static files from `public/`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/scheduler/runner.ts src/server/app.ts src/index.ts tests/api.test.ts
git commit -m "feat: add polling scheduler, Express API, and LINE webhook"
```

---

### Task 7: Responsive Web Dashboard UI

**Files:**
- Create: `public/index.html`
- Create: `public/app.js`

**Interfaces:**
- Consumes: `/api/status`, `/api/printers`, `/api/poll`, `/api/settings`, `/api/test-line`, `/api/daily-report`

- [ ] **Step 1: Build `public/index.html` and `public/app.js`**

Design a clean, modern, mobile-responsive dashboard in Thai/English using Tailwind CSS (CDN) + Lucide Icons:
- **Header**: App title (`PrinterStatsNoti`), live auto-refresh indicator, "เช็คสถานะทันที (Poll Now)" button, "เพิ่มเครื่องปริ้น" button, and "ตั้งค่า LINE & ระบบ" button.
- **Summary Strip**: Total printers, Online count, Warnings/Errors count, Pages printed today.
- **Printer Cards Grid**:
  - Status badge (Online / Printing / Warning / Error / Offline) + Model name + IP
  - Simulator badge & quick scenario switcher dropdown (`normal`, `low_ink`, `paper_jam`, `offline`) if simulator mode is enabled on that printer
  - **Ink / Toner Level Bars**: Color-coded progress bars (C/M/Y/K) with percentage labels and low-ink warning highlight
  - **Paper Trays & Page Counters**: Tray capacity bars + Total lifetime pages + Today's pages
  - **Error Flags**: Highlighted alert pills (e.g., `Paper Jam`, `Low Toner`, `Door Open`)
- **Alert History Log**: Recent LINE notifications & status (`sent` / `skipped` / `failed`) with timestamps.
- **Modals**:
  - Add/Edit Printer modal (Name, IP, SNMP Community, Port, Enable Simulator checkbox + scenario)
  - Settings modal (LINE Channel Access Token, LINE Target User/Group ID, Channel Secret, Low Ink Threshold %, Poll Interval, Daily Report Time, "ทดสอบส่ง LINE" button, "ส่งรายงานประจำวันทันที" button).

- [ ] **Step 2: Verify full test suite & server startup**

Run:
1. `npx tsc --noEmit` (verify zero TypeScript errors)
2. `npx vitest run` (verify all unit & API tests pass)
3. Start server briefly and verify `GET http://localhost:3000/` returns 200 HTML.

- [ ] **Step 3: Commit**

```bash
git add public/index.html public/app.js
git commit -m "feat: add responsive PrinterStatsNoti Web Dashboard UI"
```
