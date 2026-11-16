import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveDataDir } from '../utils/runtime.js';
import {
  AlertRecord,
  AppSettings,
  DailyPrinterStat,
  DEFAULT_SETTINGS,
  PrinterConfig,
  PrinterSnapshot,
  StoreData,
} from '../types.js';

export class JsonStore {
  private readonly filePath: string;
  private writeChain: Promise<void> = Promise.resolve();
  private data: StoreData = {
    printers: [],
    settings: { ...DEFAULT_SETTINGS },
    snapshots: {},
    alerts: [],
    lastAlertTimes: {},
    dailyStats: {},
  };

  constructor(filePath: string = path.join(resolveDataDir(), 'store.json')) {
    this.filePath = filePath;
  }

  async init(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<StoreData>;
      this.data = {
        printers: parsed.printers ?? [],
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
        snapshots: parsed.snapshots ?? {},
        alerts: parsed.alerts ?? [],
        lastAlertTimes: parsed.lastAlertTimes ?? {},
        dailyStats: parsed.dailyStats ?? {},
      };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        await this.persist();
      } else {
        throw err;
      }
    }
  }

  private persist(): Promise<void> {
    const payload = JSON.stringify(this.data, null, 2);
    const tmpPath = `${this.filePath}.tmp`;
    this.writeChain = this.writeChain.then(async () => {
      await fs.writeFile(tmpPath, payload, 'utf-8');
      await fs.rename(tmpPath, this.filePath);
    });
    return this.writeChain;
  }

  getPrinters(): PrinterConfig[] {
    return [...this.data.printers];
  }

  async upsertPrinter(printer: PrinterConfig): Promise<PrinterConfig> {
    const idx = this.data.printers.findIndex((p) => p.id === printer.id);
    if (idx >= 0) {
      this.data.printers[idx] = { ...printer };
    } else {
      this.data.printers.push({ ...printer });
    }
    await this.persist();
    return printer;
  }

  async deletePrinter(id: string): Promise<boolean> {
    const before = this.data.printers.length;
    this.data.printers = this.data.printers.filter((p) => p.id !== id);
    delete this.data.snapshots[id];
    if (this.data.printers.length !== before) {
      await this.persist();
      return true;
    }
    return false;
  }

  getSettings(): AppSettings {
    return { ...this.data.settings };
  }

  async updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    this.data.settings = { ...this.data.settings, ...partial };
    await this.persist();
    return this.getSettings();
  }

  getSnapshot(printerId: string): PrinterSnapshot | undefined {
    return this.data.snapshots[printerId];
  }

  getAllSnapshots(): Record<string, PrinterSnapshot> {
    return { ...this.data.snapshots };
  }

  async saveSnapshot(snapshot: PrinterSnapshot): Promise<void> {
    this.data.snapshots[snapshot.printerId] = snapshot;
    await this.persist();
  }

  getAlerts(limit = 50): AlertRecord[] {
    return this.data.alerts.slice(0, limit);
  }

  async addAlert(alert: AlertRecord): Promise<void> {
    this.data.alerts.unshift(alert);
    if (this.data.alerts.length > 200) {
      this.data.alerts = this.data.alerts.slice(0, 200);
    }
    await this.persist();
  }

  getLastAlertTime(key: string): number | undefined {
    return this.data.lastAlertTimes[key];
  }

  async setLastAlertTime(key: string, timestampMs: number): Promise<void> {
    this.data.lastAlertTimes[key] = timestampMs;
    await this.persist();
  }

  async clearLastAlertTime(key: string): Promise<void> {
    if (key in this.data.lastAlertTimes) {
      delete this.data.lastAlertTimes[key];
      await this.persist();
    }
  }

  getDailyStat(printerId: string, dateStr: string): DailyPrinterStat | undefined {
    return this.data.dailyStats[`${printerId}:${dateStr}`];
  }

  async updateDailyStat(
    printerId: string,
    dateStr: string,
    currentPageCount: number
  ): Promise<DailyPrinterStat> {
    const key = `${printerId}:${dateStr}`;
    const existing = this.data.dailyStats[key];
    if (!existing) {
      const created: DailyPrinterStat = {
        printerId,
        date: dateStr,
        startOfDayPageCount: currentPageCount,
        latestPageCount: currentPageCount,
        pagesPrintedToday: 0,
      };
      this.data.dailyStats[key] = created;
      await this.persist();
      return created;
    }

    const delta = Math.max(0, currentPageCount - existing.startOfDayPageCount);
    const updated: DailyPrinterStat = {
      ...existing,
      latestPageCount: currentPageCount,
      pagesPrintedToday: delta,
    };
    this.data.dailyStats[key] = updated;
    await this.persist();
    return updated;
  }
}
