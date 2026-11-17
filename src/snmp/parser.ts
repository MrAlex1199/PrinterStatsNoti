import { PaperTrayItem, PrinterErrorFlag, PrinterStatus, SupplyItem } from '../types.js';

const BYTE0_FLAGS: Array<{ bitMask: number; flag: PrinterErrorFlag }> = [
  { bitMask: 0x80, flag: 'lowPaper' },
  { bitMask: 0x40, flag: 'noPaper' },
  { bitMask: 0x20, flag: 'lowToner' },
  { bitMask: 0x10, flag: 'noToner' },
  { bitMask: 0x08, flag: 'doorOpen' },
  { bitMask: 0x04, flag: 'jammed' },
  { bitMask: 0x02, flag: 'offline' },
  { bitMask: 0x01, flag: 'serviceRequested' },
];

const BYTE1_FLAGS: Array<{ bitMask: number; flag: PrinterErrorFlag }> = [
  { bitMask: 0x80, flag: 'inputTrayMissing' },
  { bitMask: 0x40, flag: 'outputTrayMissing' },
  { bitMask: 0x20, flag: 'markerSupplyMissing' },
  { bitMask: 0x10, flag: 'outputNearFull' },
  { bitMask: 0x08, flag: 'outputFull' },
  { bitMask: 0x04, flag: 'inputTrayEmpty' },
  { bitMask: 0x02, flag: 'overduePreventMaint' },
];

export function decodeErrorStateBitmask(raw: Buffer | number | undefined | null): PrinterErrorFlag[] {
  if (raw === undefined || raw === null) return [];
  let byte0 = 0;
  let byte1 = 0;

  if (Buffer.isBuffer(raw)) {
    byte0 = raw.length > 0 ? raw[0] : 0;
    byte1 = raw.length > 1 ? raw[1] : 0;
  } else if (typeof raw === 'number') {
    if (raw > 0xff) {
      // 16-bit integer representation
      byte0 = (raw >> 8) & 0xff;
      byte1 = raw & 0xff;
    } else {
      byte0 = raw & 0xff;
    }
  }

  const flags: PrinterErrorFlag[] = [];
  for (const entry of BYTE0_FLAGS) {
    if ((byte0 & entry.bitMask) !== 0) {
      flags.push(entry.flag);
    }
  }
  for (const entry of BYTE1_FLAGS) {
    if ((byte1 & entry.bitMask) !== 0) {
      flags.push(entry.flag);
    }
  }
  return flags;
}

/**
 * Infer additional error flags if the printer doesn't populate hrPrinterDetectedErrorState
 * but reports supply or tray status directly.
 */
export function inferErrorFlagsFromLevels(
  currentFlags: PrinterErrorFlag[],
  supplies: SupplyItem[],
  trays: PaperTrayItem[]
): PrinterErrorFlag[] {
  const flags = new Set(currentFlags);

  // If any supply is strictly 0%, infer noToner
  const hasEmptySupply = supplies.some(
    (s) => s.percent !== null && s.percent <= 0 && !s.name.toLowerCase().includes('waste')
  );
  if (hasEmptySupply) {
    flags.add('noToner');
  }

  // If any paper tray is 0%, infer noPaper
  const hasEmptyTray = trays.some((t) => t.percent !== null && t.percent <= 0);
  if (hasEmptyTray) {
    flags.add('noPaper');
  }

  return Array.from(flags);
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
    errorFlags.includes('inputTrayMissing') ||
    errorFlags.includes('outputTrayMissing') ||
    errorFlags.includes('markerSupplyMissing') ||
    errorFlags.includes('outputFull') ||
    errorFlags.includes('inputTrayEmpty') ||
    hrDeviceStatus === 5
  ) {
    return PrinterStatus.Error;
  }
  if (
    errorFlags.includes('lowPaper') ||
    errorFlags.includes('lowToner') ||
    errorFlags.includes('outputNearFull') ||
    errorFlags.includes('overduePreventMaint') ||
    hrDeviceStatus === 3
  ) {
    return PrinterStatus.Warning;
  }
  if (hrPrinterStatus === 4) {
    return PrinterStatus.Printing;
  }
  if (errorFlags.includes('offline') || hrDeviceStatus === 4) {
    return PrinterStatus.Offline;
  }
  return PrinterStatus.Online;
}
