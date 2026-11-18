import crypto from 'node:crypto';
import { JsonStore } from '../storage/store.js';
import {
  AlertRecord,
  AlertSeverity,
  DEFAULT_LINE_NOTIFY_RULES,
  PrinterConfig,
  PrinterSnapshot,
  PrinterStatus,
} from '../types.js';
import { getContractDaysRemaining } from '../utils/contract.js';

export interface AlertNotifier {
  sendPushMessage(text: string): Promise<{ ok: boolean; error?: string }>;
}

export class AlertEngine {
  constructor(
    private readonly store: JsonStore,
    private readonly notifier: AlertNotifier
  ) {}

  private async dispatchAlert(
    printer: PrinterConfig,
    type: AlertRecord['type'],
    dedupKey: string,
    message: string,
    cooldownMinutes: number,
    nowMs: number,
    options?: {
      severity?: AlertSeverity;
      shouldSendLine?: boolean;
    }
  ): Promise<AlertRecord | null> {
    const lastTime = this.store.getLastAlertTime(dedupKey);
    const cooldownMs = cooldownMinutes * 60_000;
    if (lastTime !== undefined && nowMs - lastTime < cooldownMs) {
      return null;
    }

    const shouldSendLine = options?.shouldSendLine !== false;
    let deliveryStatus: AlertRecord['deliveryStatus'] = 'web_only';
    let errorDetail: string | undefined;

    if (shouldSendLine) {
      const result = await this.notifier.sendPushMessage(message);
      deliveryStatus = result.ok ? 'sent' : result.error?.includes('not configured') ? 'skipped' : 'failed';
      errorDetail = result.error;
    }

    await this.store.setLastAlertTime(dedupKey, nowMs);

    const record: AlertRecord = {
      id: crypto.randomUUID(),
      printerId: printer.id,
      printerName: printer.name,
      type,
      severity: options?.severity ?? 'warning',
      message,
      deliveryStatus,
      errorDetail,
      createdAt: new Date(nowMs).toISOString(),
    };
    await this.store.addAlert(record);
    return record;
  }

  private formatAssetSuffix(printer: PrinterConfig): string {
    const a = printer.asset;
    if (!a) return '';
    const parts = [
      a.location ? `📍 ${a.location}` : '',
      a.serialNumber ? `SN: ${a.serialNumber}` : '',
      a.contractNumber ? `สัญญา: ${a.contractNumber}` : '',
      a.vendorNote ? `(${a.vendorNote})` : '',
    ].filter(Boolean);
    return parts.length > 0 ? `\n${parts.join(' | ')}` : '';
  }

  async evaluateContractExpiry(
    printer: PrinterConfig,
    nowMs: number = Date.now()
  ): Promise<AlertRecord | null> {
    const settings = this.store.getSettings();
    const rules = settings.lineNotifyRules ?? DEFAULT_LINE_NOTIFY_RULES;
    const days = getContractDaysRemaining(printer.asset?.contractEndDate, new Date(nowMs));
    const key = `${printer.id}:contractExpiring`;

    if (days === null || days > settings.contractExpiryAlertDays) {
      await this.store.clearLastAlertTime(key);
      return null;
    }

    const statusText =
      days < 0
        ? `หมดสัญญาแล้ว ${Math.abs(days)} วัน`
        : days === 0
          ? 'ครบกำหนดสิ้นสุดสัญญาวันนี้'
          : `สัญญาใกล้หมดอายุในอีก ${days} วัน`;

    return this.dispatchAlert(
      printer,
      'contract_expiring',
      key,
      `📋 [${printer.name}] ${statusText} (สิ้นสุด ${printer.asset?.contractEndDate})${this.formatAssetSuffix(printer)}`,
      1440, // 24 hours cooldown
      nowMs,
      {
        severity: 'warning',
        shouldSendLine: rules.contractExpiring !== false,
      }
    );
  }

  async evaluate(
    printer: PrinterConfig,
    snapshot: PrinterSnapshot,
    nowMs: number = Date.now()
  ): Promise<AlertRecord[]> {
    const settings = this.store.getSettings();
    const rules = settings.lineNotifyRules ?? DEFAULT_LINE_NOTIFY_RULES;
    const emitted: AlertRecord[] = [];
    const todayStr = new Date(nowMs).toISOString().slice(0, 10);

    if (snapshot.pageCount !== null) {
      await this.store.updateDailyStat(printer.id, todayStr, snapshot.pageCount);
    }

    // 1. Offline check
    const offlineKey = `${printer.id}:offline`;
    if (snapshot.status === PrinterStatus.Offline) {
      const rec = await this.dispatchAlert(
        printer,
        'offline',
        offlineKey,
        `🔴 [${printer.name}] เครื่องปริ้นออฟไลน์ / ไม่ตอบสนอง (${printer.ip})${this.formatAssetSuffix(printer)}`,
        30,
        nowMs,
        {
          severity: 'warning',
          shouldSendLine: rules.offline !== false,
        }
      );
      if (rec) emitted.push(rec);
      return emitted;
    } else {
      await this.store.clearLastAlertTime(offlineKey);
    }

    // 2. Paper jam check (Critical)
    const jamKey = `${printer.id}:jammed`;
    if (snapshot.errorFlags.includes('jammed')) {
      const rec = await this.dispatchAlert(
        printer,
        'paper_jam',
        jamKey,
        `🚨 [${printer.name}] กระดาษติด (Paper Jam)! กรุณาเปิดฝาตรวจสอบและดึงกระดาษออก${this.formatAssetSuffix(printer)}`,
        30,
        nowMs,
        {
          severity: 'critical',
          shouldSendLine: rules.paperJam !== false,
        }
      );
      if (rec) emitted.push(rec);
    } else {
      await this.store.clearLastAlertTime(jamKey);
    }

    // 3. No Toner check (Critical)
    const emptySupplies = snapshot.supplies.filter(
      (s) => s.percent !== null && s.percent <= 0 && !s.name.toLowerCase().includes('waste')
    );
    const noTonerKey = `${printer.id}:noToner`;
    if (snapshot.errorFlags.includes('noToner') || emptySupplies.length > 0) {
      const details =
        emptySupplies.length > 0
          ? emptySupplies.map((s) => s.name).join(', ')
          : 'ตลับหมึกหมดเกลี้ยง';
      const rec = await this.dispatchAlert(
        printer,
        'no_toner',
        noTonerKey,
        `💧 [${printer.name}] หมึกหมดเกลี้ยง (0%) ไม่สามารถพิมพ์ได้: ${details}${this.formatAssetSuffix(printer)}`,
        30,
        nowMs,
        {
          severity: 'critical',
          shouldSendLine: rules.noToner !== false,
        }
      );
      if (rec) emitted.push(rec);
    } else {
      await this.store.clearLastAlertTime(noTonerKey);
    }

    // 4. Low ink/toner check (Warning)
    const threshold = settings.lowInkThresholdPercent;
    const lowSupplies = snapshot.supplies.filter(
      (s) => s.percent !== null && s.percent > 0 && s.percent <= threshold
    );
    const lowInkKey = `${printer.id}:lowInk`;
    if (lowSupplies.length > 0) {
      const details = lowSupplies.map((s) => `${s.name} (${s.percent}%)`).join(', ');
      const rec = await this.dispatchAlert(
        printer,
        'low_ink',
        lowInkKey,
        `💧 [${printer.name}] หมึกใกล้หมด (<= ${threshold}%): ${details}${this.formatAssetSuffix(printer)}`,
        settings.alertCooldownMinutes,
        nowMs,
        {
          severity: 'warning',
          shouldSendLine: rules.lowInk !== false,
        }
      );
      if (rec) emitted.push(rec);
    } else {
      await this.store.clearLastAlertTime(lowInkKey);
    }

    const contractAlert = await this.evaluateContractExpiry(printer, nowMs);
    if (contractAlert) emitted.push(contractAlert);

    return emitted;
  }

  async sendDailySummary(now: Date = new Date()): Promise<AlertRecord> {
    const printers = this.store.getPrinters().filter((p) => p.enabled);
    const snapshots = this.store.getAllSnapshots();
    const todayStr = now.toISOString().slice(0, 10);

    const lines: string[] = [`📊 สรุปรายงานเครื่องปริ้นประจำวัน (${todayStr})`];
    if (printers.length === 0) {
      lines.push('ยังไม่มีเครื่องปริ้นในระบบ');
    } else {
      for (const p of printers) {
        const snap = snapshots[p.id];
        const stat = this.store.getDailyStat(p.id, todayStr);
        const printedToday = stat?.pagesPrintedToday ?? 0;
        const inkSummary =
          snap && snap.supplies.length > 0
            ? snap.supplies
                .map((s) => `${s.name.split(' ')[0]} ${s.percent !== null ? `${s.percent}%` : 'N/A'}`)
                .join(' | ')
            : 'ไม่มีข้อมูลหมึก';
        const statusIcon =
          snap?.status === PrinterStatus.Offline
            ? '🔴'
            : snap?.status === PrinterStatus.Error
              ? '❌'
              : snap?.status === PrinterStatus.Warning
                ? '⚠️'
                : '🟢';
        lines.push(`${statusIcon} ${p.name}: พิมพ์วันนี้ ${printedToday} หน้า | ${inkSummary}`);
      }
    }

    const message = lines.join('\n');
    const result = await this.notifier.sendPushMessage(message);
    const record: AlertRecord = {
      id: crypto.randomUUID(),
      printerId: 'system',
      printerName: 'Daily Summary',
      type: 'daily_summary',
      message,
      deliveryStatus: result.ok ? 'sent' : result.error?.includes('not configured') ? 'skipped' : 'failed',
      errorDetail: result.error,
      createdAt: now.toISOString(),
    };
    await this.store.addAlert(record);
    return record;
  }
}
