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
