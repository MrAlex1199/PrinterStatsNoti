import cron from 'node-cron';
import { AlertEngine } from '../alerts/engine.js';
import { collectPrinterSnapshot } from '../snmp/collector.js';
import { JsonStore } from '../storage/store.js';

export class PollingScheduler {
  private pollTimer: NodeJS.Timeout | null = null;
  private dailyTask: cron.ScheduledTask | null = null;
  private isPolling = false;

  constructor(
    private readonly store: JsonStore,
    private readonly alertEngine: AlertEngine
  ) {}

  start(): void {
    this.reschedule();
    void this.pollAllNow();
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.dailyTask) {
      this.dailyTask.stop();
      this.dailyTask = null;
    }
  }

  reschedule(): void {
    this.stop();
    const settings = this.store.getSettings();
    const intervalMs = Math.max(10, settings.pollIntervalSeconds) * 1000;
    this.pollTimer = setInterval(() => {
      void this.pollAllNow();
    }, intervalMs);
    this.pollTimer.unref();

    const cronExpr = cron.validate(settings.dailyReportCron)
      ? settings.dailyReportCron
      : '0 18 * * *';
    this.dailyTask = cron.schedule(cronExpr, () => {
      void this.alertEngine.sendDailySummary();
    });
  }

  async pollAllNow(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;
    try {
      const printers = this.store.getPrinters().filter((p) => p.enabled);
      await Promise.all(
        printers.map(async (printer) => {
          if (printer.connectionType === 'usb') {
            await this.alertEngine.evaluateContractExpiry(printer);
            return;
          }
          const snapshot = await collectPrinterSnapshot(printer);
          await this.store.saveSnapshot(snapshot);
          await this.alertEngine.evaluate(printer, snapshot);
        })
      );
    } finally {
      this.isPolling = false;
    }
  }
}
