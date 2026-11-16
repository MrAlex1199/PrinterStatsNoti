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
