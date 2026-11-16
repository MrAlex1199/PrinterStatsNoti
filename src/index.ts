import 'dotenv/config';
import { AlertEngine } from './alerts/engine.js';
import { LineService } from './line/service.js';
import { PollingScheduler } from './scheduler/runner.js';
import { createApp } from './server/app.js';
import { JsonStore } from './storage/store.js';

async function main() {
  const store = new JsonStore();
  await store.init();

  // Seed one demo simulator printer on first boot if empty
  if (store.getPrinters().length === 0) {
    await store.upsertPrinter({
      id: 'demo-printer-1',
      name: 'Demo Office LaserJet',
      ip: '192.168.1.50',
      community: 'public',
      port: 161,
      enabled: true,
      simulator: true,
      simulatorScenario: 'normal',
    });
  }

  // Allow .env overrides if provided
  const envPatch: Record<string, string> = {};
  if (process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    envPatch.lineChannelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  }
  if (process.env.LINE_CHANNEL_SECRET) {
    envPatch.lineChannelSecret = process.env.LINE_CHANNEL_SECRET;
  }
  if (process.env.LINE_TARGET_ID) {
    envPatch.lineTargetId = process.env.LINE_TARGET_ID;
  }
  if (Object.keys(envPatch).length > 0) {
    await store.updateSettings(envPatch);
  }

  const lineService = new LineService(store);
  const alertEngine = new AlertEngine(store, lineService);
  const scheduler = new PollingScheduler(store, alertEngine);
  const app = createApp(store, scheduler, lineService, alertEngine);

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`🖨️  PrinterStatsNoti running at http://localhost:${port}`);
    scheduler.start();
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
