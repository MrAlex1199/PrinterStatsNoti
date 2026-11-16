import crypto from 'node:crypto';
import path from 'node:path';
import express, { Express, Request, Response } from 'express';
import { validateSignature, WebhookEvent } from '@line/bot-sdk';
import { AlertEngine } from '../alerts/engine.js';
import { LineService } from '../line/service.js';
import { PollingScheduler } from '../scheduler/runner.js';
import { JsonStore } from '../storage/store.js';
import { PrinterConfig } from '../types.js';

function maskSecret(val: string): string {
  if (!val || val.length <= 8) return val ? '****' : '';
  return `${val.slice(0, 4)}...${val.slice(-4)}`;
}

export function createApp(
  store: JsonStore,
  scheduler: PollingScheduler,
  lineService: LineService,
  alertEngine: AlertEngine
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
  app.use(express.static(path.resolve(process.cwd(), 'public')));

  app.get('/api/status', (_req: Request, res: Response) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const printers = store.getPrinters().map((printer) => ({
      ...printer,
      snapshot: store.getSnapshot(printer.id) ?? null,
      dailyStat: store.getDailyStat(printer.id, todayStr) ?? null,
    }));

    const s = store.getSettings();
    res.json({
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

  return app;
}
