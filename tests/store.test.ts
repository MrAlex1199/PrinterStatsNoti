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
