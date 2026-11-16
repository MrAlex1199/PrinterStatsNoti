import { PrinterErrorFlag, PrinterStatus } from '../types.js';

const ERROR_BIT_FLAGS: Array<{ bitMask: number; flag: PrinterErrorFlag }> = [
  { bitMask: 0x80, flag: 'lowPaper' },
  { bitMask: 0x40, flag: 'noPaper' },
  { bitMask: 0x20, flag: 'lowToner' },
  { bitMask: 0x10, flag: 'noToner' },
  { bitMask: 0x08, flag: 'doorOpen' },
  { bitMask: 0x04, flag: 'jammed' },
  { bitMask: 0x02, flag: 'offline' },
  { bitMask: 0x01, flag: 'serviceRequested' },
];

export function decodeErrorStateBitmask(raw: Buffer | number | undefined | null): PrinterErrorFlag[] {
  if (raw === undefined || raw === null) return [];
  const byte0 = typeof raw === 'number' ? raw & 0xff : raw.length > 0 ? raw[0] : 0;
  const flags: PrinterErrorFlag[] = [];
  for (const entry of ERROR_BIT_FLAGS) {
    if ((byte0 & entry.bitMask) !== 0) {
      flags.push(entry.flag);
    }
  }
  return flags;
}

/**
 * Normalizes RFC 3805 prtMarkerSuppliesLevel / prtInputCurrentLevel.
 * -3 = some remaining (OK -> 100%)
 * -2 = unknown (null)
 * -1 = other (null)
 */
export function calculateSupplyPercent(level: number, maxCapacity: number): number | null {
  if (level === -3) return 100;
  if (level < 0 || maxCapacity <= 0) return null;
  const pct = Math.round((level / maxCapacity) * 100);
  return Math.max(0, Math.min(100, pct));
}

export function inferSupplyColor(description: string): string {
  const lower = description.toLowerCase();
  if (lower.includes('cyan')) return '#06b6d4';
  if (lower.includes('magenta')) return '#ec4899';
  if (lower.includes('yellow')) return '#eab308';
  if (lower.includes('waste')) return '#64748b';
  return '#1e293b';
}

export function resolvePrinterStatus(
  hrDeviceStatus: number | null,
  hrPrinterStatus: number | null,
  errorFlags: PrinterErrorFlag[]
): PrinterStatus {
  if (
    errorFlags.includes('jammed') ||
    errorFlags.includes('noPaper') ||
    errorFlags.includes('noToner') ||
    errorFlags.includes('doorOpen') ||
    errorFlags.includes('serviceRequested') ||
    hrDeviceStatus === 5
  ) {
    return PrinterStatus.Error;
  }
  if (
    errorFlags.includes('lowPaper') ||
    errorFlags.includes('lowToner') ||
    hrDeviceStatus === 3
  ) {
    return PrinterStatus.Warning;
  }
  if (hrPrinterStatus === 4) {
    return PrinterStatus.Printing;
  }
  return PrinterStatus.Online;
}
