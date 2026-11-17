import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { Express, Request, Response } from 'express';
import { validateSignature, WebhookEvent } from '@line/bot-sdk';
import { AlertEngine } from '../alerts/engine.js';
import { LineService } from '../line/service.js';
import { PollingScheduler } from '../scheduler/runner.js';
import { expandIpTargets, getLocalSubnets, scanTargets } from '../snmp/scanner.js';
import { JsonStore } from '../storage/store.js';
import { PrinterConfig } from '../types.js';
import { getContractDaysRemaining } from '../utils/contract.js';
import { parsePrinterSpreadsheetText } from '../utils/csvImport.js';
import { openAppWindow, resolvePublicDir } from '../utils/runtime.js';
import { getStartupStatus, setStartupEnabled } from '../utils/startup.js';

function maskSecret(val: string): string {
  if (!val || val.length <= 8) return val ? '****' : '';
  return `${val.slice(0, 4)}...${val.slice(-4)}`;
}

let cachedVersion: string | null = null;
export function getAppVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const pkgPath = path.join(resolvePublicDir(), '..', 'package.json');
    if (fs.existsSync(pkgPath)) {
      const data = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (data.version) {
        cachedVersion = String(data.version);
        return cachedVersion;
      }
    }
  } catch {
    // fallback
  }
  return '1.0.0';
}

export function createApp(
  store: JsonStore,
  scheduler: PollingScheduler,
  lineService: LineService,
  alertEngine: AlertEngine,
  onShutdown?: () => void
): Express {
  const app = express();

  // LINE webhook needs raw body for signature validation
  app.post('/webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
    try {
      const settings = store.getSettings();
      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf-8') : JSON.stringify(req.body);
      const signature = req.headers['x-line-signature'] as string | undefined;

      if (settings.lineChannelSecret && signature) {
        const isValid = validateSignature(rawBody, settings.lineChannelSecret, signature);
        if (!isValid) {
          res.status(401).json({ error: 'Invalid LINE signature' });
          return;
        }
      }

      const parsed = JSON.parse(rawBody) as { events?: WebhookEvent[] };
      await lineService.handleWebhookEvents(parsed.events ?? []);
      res.status(200).json({ ok: true });
    } catch (err: unknown) {
      console.error('Webhook error:', err);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  app.use(express.json());
  app.use(express.static(resolvePublicDir()));

  app.get('/api/status', (_req: Request, res: Response) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const printers = store.getPrinters().map((printer) => ({
      ...printer,
      snapshot: store.getSnapshot(printer.id) ?? null,
      dailyStat: store.getDailyStat(printer.id, todayStr) ?? null,
      contractDaysRemaining: getContractDaysRemaining(printer.asset?.contractEndDate),
    }));

    const s = store.getSettings();
    res.json({
      version: getAppVersion(),
      printers,
      settings: {
        ...s,
        hasLineToken: Boolean(s.lineChannelAccessToken),
        hasLineSecret: Boolean(s.lineChannelSecret),
        lineChannelAccessTokenMasked: maskSecret(s.lineChannelAccessToken),
        lineChannelSecretMasked: maskSecret(s.lineChannelSecret),
      },
      alerts: store.getAlerts(30),
    });
  });

  app.post('/api/printers', async (req: Request, res: Response) => {
    const body = req.body as Partial<PrinterConfig>;
    if (!body.name || !body.ip) {
      res.status(400).json({ error: 'name and ip are required' });
      return;
    }
    const printer: PrinterConfig = {
      id: body.id || crypto.randomUUID(),
      name: body.name.trim(),
      ip: body.ip.trim(),
      community: body.community?.trim() || 'public',
      port: Number(body.port) || 161,
      enabled: body.enabled ?? true,
      simulator: Boolean(body.simulator),
      simulatorScenario: body.simulatorScenario ?? 'normal',
      connectionType: body.connectionType ?? (body.ip.toUpperCase().includes('USB') ? 'usb' : 'network'),
      asset: body.asset,
    };
    await store.upsertPrinter(printer);
    res.status(201).json(printer);
  });

  app.put('/api/printers/:id', async (req: Request, res: Response) => {
    const existing = store.getPrinters().find((p) => p.id === req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Printer not found' });
      return;
    }
    const body = req.body as Partial<PrinterConfig>;
    const updated: PrinterConfig = {
      ...existing,
      ...body,
      id: existing.id,
    };
    await store.upsertPrinter(updated);
    res.json(updated);
  });

  app.delete('/api/printers/:id', async (req: Request, res: Response) => {
    const deleted = await store.deletePrinter(String(req.params.id));
    if (!deleted) {
      res.status(404).json({ error: 'Printer not found' });
      return;
    }
    res.json({ ok: true });
  });

  app.post('/api/poll', async (_req: Request, res: Response) => {
    await scheduler.pollAllNow();
    res.json({ ok: true });
  });

  app.put('/api/settings', async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (typeof body.pollIntervalSeconds === 'number') patch.pollIntervalSeconds = Math.max(10, body.pollIntervalSeconds);
    if (typeof body.lowInkThresholdPercent === 'number') patch.lowInkThresholdPercent = Math.min(90, Math.max(1, body.lowInkThresholdPercent));
    if (typeof body.alertCooldownMinutes === 'number') patch.alertCooldownMinutes = Math.max(1, body.alertCooldownMinutes);
    if (typeof body.contractExpiryAlertDays === 'number') patch.contractExpiryAlertDays = Math.max(1, body.contractExpiryAlertDays);
    if (typeof body.dailyReportCron === 'string') patch.dailyReportCron = body.dailyReportCron.trim();
    if (typeof body.lineChannelAccessToken === 'string' && body.lineChannelAccessToken.trim()) {
      patch.lineChannelAccessToken = body.lineChannelAccessToken.trim();
    }
    if (typeof body.lineChannelSecret === 'string' && body.lineChannelSecret.trim()) {
      patch.lineChannelSecret = body.lineChannelSecret.trim();
    }
    if (typeof body.lineTargetId === 'string') {
      patch.lineTargetId = body.lineTargetId.trim();
    }
    if (typeof body.lineNotifyRules === 'object' && body.lineNotifyRules !== null) {
      patch.lineNotifyRules = {
        ...store.getSettings().lineNotifyRules,
        ...(body.lineNotifyRules as Record<string, boolean>),
      };
    }

    const updated = await store.updateSettings(patch);
    scheduler.reschedule();
    res.json({ ok: true, pollIntervalSeconds: updated.pollIntervalSeconds });
  });

  app.post('/api/test-line', async (_req: Request, res: Response) => {
    const result = await lineService.sendPushMessage(
      '✅ ทดสอบการแจ้งเตือนจาก PrinterStatsNoti สำเร็จ!'
    );
    await store.addAlert({
      id: crypto.randomUUID(),
      printerId: 'system',
      printerName: 'System Test',
      type: 'test',
      message: 'ทดสอบการแจ้งเตือน LINE',
      deliveryStatus: result.ok ? 'sent' : result.error?.includes('not configured') ? 'skipped' : 'failed',
      errorDetail: result.error,
      createdAt: new Date().toISOString(),
    });
    res.json(result);
  });

  app.post('/api/daily-report', async (_req: Request, res: Response) => {
    const record = await alertEngine.sendDailySummary();
    res.json(record);
  });

  app.get('/api/network-interfaces', (_req: Request, res: Response) => {
    res.json({ subnets: getLocalSubnets() });
  });

  app.post('/api/scan', async (req: Request, res: Response) => {
    const body = req.body as {
      subnets?: string;
      community?: string;
      port?: number;
      useTcpPorts?: boolean;
      useMdns?: boolean;
    };
    const subnetStr = (body.subnets || '').trim();
    if (!subnetStr) {
      res.status(400).json({ error: 'subnets is required (e.g. 192.168.1.0/24)' });
      return;
    }

    let targets: string[];
    try {
      targets = expandIpTargets(subnetStr);
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      return;
    }

    const existingIps = new Set(store.getPrinters().map((p) => p.ip));
    const discovered = await scanTargets(targets, {
      community: body.community?.trim() || 'public',
      port: Number(body.port) || 161,
      useTcpPorts: body.useTcpPorts ?? true,
      useMdns: body.useMdns ?? true,
      existingIps,
    });

    res.json({ scannedCount: targets.length, discovered });
  });

  app.post('/api/printers/bulk', async (req: Request, res: Response) => {
    const body = req.body as {
      printers?: Array<{
        name?: string;
        ip: string;
        community?: string;
        port?: number;
        connectionType?: 'network' | 'usb';
        asset?: PrinterConfig['asset'];
      }>;
    };
    const items = body.printers ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'printers array is required' });
      return;
    }

    const existingIps = new Set(store.getPrinters().filter((p) => p.connectionType !== 'usb').map((p) => p.ip));
    const added: PrinterConfig[] = [];

    for (const item of items) {
      if (!item.ip) continue;
      const ipTrim = item.ip.trim();
      const isUsb = item.connectionType === 'usb' || ipTrim.toUpperCase().includes('USB');
      if (!isUsb && existingIps.has(ipTrim)) continue;
      const printer: PrinterConfig = {
        id: crypto.randomUUID(),
        name: item.name?.trim() || `Printer (${ipTrim})`,
        ip: ipTrim,
        community: item.community?.trim() || 'public',
        port: Number(item.port) || 161,
        enabled: true,
        simulator: false,
        connectionType: isUsb ? 'usb' : 'network',
        asset: item.asset,
      };
      await store.upsertPrinter(printer);
      if (!isUsb) existingIps.add(printer.ip);
      added.push(printer);
    }

    res.status(201).json({ added });
  });

  app.post('/api/printers/import-csv', async (req: Request, res: Response) => {
    const body = req.body as { rawText?: string; dryRun?: boolean };
    if (!body.rawText || !body.rawText.trim()) {
      res.status(400).json({ error: 'rawText is required' });
      return;
    }

    const rows = parsePrinterSpreadsheetText(body.rawText);
    if (body.dryRun) {
      res.json({ rows });
      return;
    }

    const existingIps = new Set(store.getPrinters().filter((p) => p.connectionType !== 'usb').map((p) => p.ip));
    const existingSerials = new Set(
      store.getPrinters().map((p) => p.asset?.serialNumber).filter(Boolean) as string[]
    );
    const added: PrinterConfig[] = [];

    for (const row of rows) {
      const isUsb = row.connectionType === 'usb';
      if (!isUsb && existingIps.has(row.ip)) continue;
      if (row.asset.serialNumber && existingSerials.has(row.asset.serialNumber)) continue;

      const printer: PrinterConfig = {
        id: crypto.randomUUID(),
        name: row.name,
        ip: row.ip,
        community: 'public',
        port: 161,
        enabled: true,
        simulator: false,
        connectionType: row.connectionType,
        asset: row.asset,
      };
      await store.upsertPrinter(printer);
      if (!isUsb) existingIps.add(printer.ip);
      if (row.asset.serialNumber) existingSerials.add(row.asset.serialNumber);
      added.push(printer);
    }

    res.status(201).json({ added });
  });

  app.get('/api/system/startup', async (_req: Request, res: Response) => {
    const status = await getStartupStatus();
    res.json(status);
  });

  app.put('/api/system/startup', async (req: Request, res: Response) => {
    const enabled = Boolean(req.body.enabled);
    const ok = await setStartupEnabled(enabled);
    const status = await getStartupStatus();
    res.json({ ok, ...status });
  });

  app.post('/api/app-window/open', (_req: Request, res: Response) => {
    const port = Number(process.env.PORT) || 3000;
    openAppWindow(`http://localhost:${port}`);
    res.json({ ok: true });
  });

  app.post('/api/shutdown', (_req: Request, res: Response) => {
    res.setHeader('Connection', 'close');
    res.json({ ok: true });
    scheduler.stop();
    if (onShutdown) {
      onShutdown();
    } else {
      setTimeout(() => process.exit(0), 150).unref();
    }
  });

  return app;
}
