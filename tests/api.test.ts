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
