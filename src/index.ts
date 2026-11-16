import dotenv from 'dotenv';
import { AlertEngine } from './alerts/engine.js';
import { LineService } from './line/service.js';
import { PollingScheduler } from './scheduler/runner.js';
import { createApp } from './server/app.js';
import { JsonStore } from './storage/store.js';
import {
  isBackgroundLaunch,
  isPackagedBinary,
  openAppWindow,
  openBrowser,
  resolveEnvPath,
} from './utils/runtime.js';
import { startSystemTray, SystemTrayController } from './utils/tray.js';

dotenv.config({ path: resolveEnvPath() });

async function main() {
  const store = new JsonStore();
  await store.init();

  // Seed 3 rich demo printers on first boot if empty
  if (store.getPrinters().length === 0) {
    const expiringDate = new Date(Date.now() + 15 * 86_400_000);
    const dd = String(expiringDate.getUTCDate()).padStart(2, '0');
    const mm = String(expiringDate.getUTCMonth() + 1).padStart(2, '0');
    const beYear = expiringDate.getUTCFullYear() + 543;

    await store.upsertPrinter({
      id: 'demo-printer-1',
      name: 'อาคารผู้บริหาร 4 ชั้น 2 ธุรการ/IT (Demo)',
      ip: '192.168.0.252',
      community: 'public',
      port: 161,
      enabled: true,
      simulator: true,
      simulatorScenario: 'normal',
      connectionType: 'network',
      asset: {
        location: 'อาคารผู้บริหาร 4 ชั้น 2 ธุรการ/จัดซื้อ/บุคคล/IT',
        modelName: 'Minolta รุ่น BHC251I CPS',
        serialNumber: 'ADXM041005929',
        contractNumber: '04A25240015',
        capabilities: 'สแกน/ถ่ายเอกสาร/พิมพ์ สี/ขาวดำ A4/A3',
        contractStartDate: '01/07/2568',
        contractEndDate: '29/06/2573',
        contractTerm: 'เช่าเครื่อง/บริการ 5 ปี',
        monthlyCost: '2,750.00',
        vendorNote: 'Konica',
      },
    });

    await store.upsertPrinter({
      id: 'demo-printer-2',
      name: 'คลังสินค้า W1 จัดส่ง (Demo หมึก+สัญญา)',
      ip: '192.168.0.226',
      community: 'public',
      port: 161,
      enabled: true,
      simulator: true,
      simulatorScenario: 'low_ink',
      connectionType: 'network',
      asset: {
        location: 'คลังสินค้า W1 จัดส่ง (คลัง 4 เดิม)',
        modelName: 'Minolta รุ่น BH287 CPS',
        serialNumber: 'A7AH04F003981',
        contractNumber: '04A25240015',
        capabilities: 'สแกน/ถ่ายเอกสาร/พิมพ์ ขาวดำ A4/A3',
        contractStartDate: '01/07/2568',
        contractEndDate: `${dd}/${mm}/${beYear}`,
        contractTerm: 'เช่าเครื่อง/บริการ 5 ปี',
        monthlyCost: '1,000.00',
        vendorNote: 'Konica',
      },
    });

    await store.upsertPrinter({
      id: 'demo-printer-3',
      name: 'อาคารผู้บริหาร 4 ชั้น 1 ประชาสัมพันธ์ (Demo -USB)',
      ip: '-USB',
      community: 'public',
      port: 161,
      enabled: true,
      simulator: false,
      connectionType: 'usb',
      asset: {
        location: 'อาคารผู้บริหาร 4 ชั้น 1 ประชาสัมพันธ์',
        modelName: 'KYOCERA รุ่น ECOSYS M2535dn',
        serialNumber: 'LZP5702954',
        contractNumber: '618',
        capabilities: 'สแกน/ถ่ายเอกสาร/พิมพ์ ขาวดำ A4',
        contractStartDate: '15/11/2568',
        contractEndDate: '14/11/2569',
        contractTerm: 'บริการ 1 ปี',
        monthlyCost: 'ตามจริง/0.35/ผ',
        vendorNote: '**ทรัพย์สินบริษัทฯ',
      },
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

  const background = isBackgroundLaunch(process.argv);
  let server: ReturnType<typeof app.listen> | null = null;
  let trayController: SystemTrayController | null = null;
  let isShuttingDown = false;

  const shutdownGracefully = () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    if (trayController) {
      trayController.stop();
      trayController = null;
    }
    scheduler.stop();
    const forceTimer = setTimeout(() => process.exit(0), 500);
    forceTimer.unref();
    if (server) {
      server.closeAllConnections?.();
      server.close(() => {
        clearTimeout(forceTimer);
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  };

  const app = createApp(store, scheduler, lineService, alertEngine, () => {
    setTimeout(shutdownGracefully, 100);
  });

  const port = Number(process.env.PORT) || 3000;
  const url = `http://localhost:${port}`;
  server = app.listen(port, () => {
    console.log(`🖨️  PrinterStatsNoti running at ${url}`);
    scheduler.start();

    // Start Windows system tray
    trayController = startSystemTray({
      url,
      port,
      onOpen: () => openAppWindow(url),
      onPoll: () => {
        scheduler.pollAllNow().catch((err: unknown) => console.error('Tray poll error:', err));
      },
      onExit: () => shutdownGracefully(),
    });

    // Only open app window if not launched in background mode
    if (!background) {
      if (isPackagedBinary() || process.platform === 'win32') {
        openAppWindow(url);
      } else {
        openBrowser(url);
      }
    } else {
      console.log('🔕 Running in background mode (System Tray active).');
    }
  });

  process.on('SIGINT', shutdownGracefully);
  process.on('SIGTERM', shutdownGracefully);

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      // Single-instance native behavior: open existing dashboard and exit cleanly
      if (!background) {
        openAppWindow(url);
      }
      setTimeout(() => process.exit(0), 300);
      return;
    }
    console.error('Server error:', err);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
