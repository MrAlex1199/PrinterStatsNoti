import snmp from 'net-snmp';
import {
  PaperTrayItem,
  PrinterConfig,
  PrinterSnapshot,
  PrinterStatus,
  SupplyItem,
} from '../types.js';
import {
  calculateSupplyPercent,
  decodeErrorStateBitmask,
  inferSupplyColor,
  resolvePrinterStatus,
} from './parser.js';
import { generateSimulatedSnapshot } from './simulator.js';

const OIDS = {
  sysDescr: '1.3.6.1.2.1.1.1.0',
  hrDeviceStatus: '1.3.6.1.2.1.25.3.2.1.5.1',
  hrPrinterStatus: '1.3.6.1.2.1.25.3.5.1.1.1',
  hrPrinterDetectedErrorState: '1.3.6.1.2.1.25.3.5.1.2.1',
  prtMarkerLifeCount: '1.3.6.1.2.1.43.10.2.1.4.1.1',
  prtMarkerSuppliesDesc: '1.3.6.1.2.1.43.11.1.1.6',
  prtMarkerSuppliesMaxCap: '1.3.6.1.2.1.43.11.1.1.8',
  prtMarkerSuppliesLevel: '1.3.6.1.2.1.43.11.1.1.9',
  prtInputName: '1.3.6.1.2.1.43.8.2.1.13',
  prtInputMaxCap: '1.3.6.1.2.1.43.8.2.1.9',
  prtInputCurrentLevel: '1.3.6.1.2.1.43.8.2.1.10',
};

interface SnmpVarbind {
  oid: string;
  type: number;
  value: unknown;
}

function snmpGet(session: snmp.Session, oids: string[]): Promise<SnmpVarbind[]> {
  return new Promise((resolve, reject) => {
    session.get(oids, (err: Error | null, varbinds?: SnmpVarbind[]) => {
      if (err) return reject(err);
      resolve(varbinds ?? []);
    });
  });
}

function snmpSubtree(session: snmp.Session, oid: string): Promise<SnmpVarbind[]> {
  return new Promise((resolve, reject) => {
    const items: SnmpVarbind[] = [];
    session.subtree(
      oid,
      20,
      (varbinds: SnmpVarbind[]) => {
        items.push(...varbinds);
      },
      (err: Error | null) => {
        if (err) return reject(err);
        resolve(items);
      }
    );
  });
}

function getIndexSuffix(oid: string, baseOid: string): string {
  return oid.startsWith(`${baseOid}.`) ? oid.slice(baseOid.length + 1) : oid;
}

export async function collectPrinterSnapshot(printer: PrinterConfig): Promise<PrinterSnapshot> {
  if (printer.simulator) {
    return generateSimulatedSnapshot(printer);
  }

  const session = snmp.createSession(printer.ip, printer.community || 'public', {
    port: printer.port || 161,
    timeout: 4000,
    retries: 1,
    version: snmp.Version2c,
  });

  try {
    const scalarVbs = await snmpGet(session, [
      OIDS.sysDescr,
      OIDS.hrDeviceStatus,
      OIDS.hrPrinterStatus,
      OIDS.hrPrinterDetectedErrorState,
      OIDS.prtMarkerLifeCount,
    ]);

    const valMap = new Map<string, unknown>();
    for (const vb of scalarVbs) {
      if (!snmp.isVarbindError(vb)) {
        valMap.set(vb.oid, vb.value);
      }
    }

    const modelRaw = valMap.get(OIDS.sysDescr);
    const model = modelRaw ? String(modelRaw).trim() : undefined;
    const hrDeviceStatus = typeof valMap.get(OIDS.hrDeviceStatus) === 'number' ? (valMap.get(OIDS.hrDeviceStatus) as number) : null;
    const hrPrinterStatus = typeof valMap.get(OIDS.hrPrinterStatus) === 'number' ? (valMap.get(OIDS.hrPrinterStatus) as number) : null;
    const errorStateRaw = valMap.get(OIDS.hrPrinterDetectedErrorState);
    const errorFlags = decodeErrorStateBitmask(
      Buffer.isBuffer(errorStateRaw) || typeof errorStateRaw === 'number' ? errorStateRaw : undefined
    );
    const pageCountRaw = valMap.get(OIDS.prtMarkerLifeCount);
    const pageCount = typeof pageCountRaw === 'number' ? pageCountRaw : null;

    // Supplies
    const [supplyDescs, supplyMaxCaps, supplyLevels] = await Promise.all([
      snmpSubtree(session, OIDS.prtMarkerSuppliesDesc).catch(() => []),
      snmpSubtree(session, OIDS.prtMarkerSuppliesMaxCap).catch(() => []),
      snmpSubtree(session, OIDS.prtMarkerSuppliesLevel).catch(() => []),
    ]);

    const suppliesMap = new Map<string, { name?: string; max?: number; level?: number }>();
    for (const vb of supplyDescs) {
      if (snmp.isVarbindError(vb)) continue;
      const idx = getIndexSuffix(vb.oid, OIDS.prtMarkerSuppliesDesc);
      suppliesMap.set(idx, { ...(suppliesMap.get(idx) ?? {}), name: String(vb.value) });
    }
    for (const vb of supplyMaxCaps) {
      if (snmp.isVarbindError(vb)) continue;
      const idx = getIndexSuffix(vb.oid, OIDS.prtMarkerSuppliesMaxCap);
      suppliesMap.set(idx, { ...(suppliesMap.get(idx) ?? {}), max: Number(vb.value) });
    }
    for (const vb of supplyLevels) {
      if (snmp.isVarbindError(vb)) continue;
      const idx = getIndexSuffix(vb.oid, OIDS.prtMarkerSuppliesLevel);
      suppliesMap.set(idx, { ...(suppliesMap.get(idx) ?? {}), level: Number(vb.value) });
    }

    const supplies: SupplyItem[] = [];
    for (const item of suppliesMap.values()) {
      if (!item.name) continue;
      const maxCap = item.max ?? 100;
      const level = item.level ?? -2;
      supplies.push({
        name: item.name,
        color: inferSupplyColor(item.name),
        percent: calculateSupplyPercent(level, maxCap),
        level,
        maxCapacity: maxCap,
      });
    }

    // Paper Trays
    const [trayNames, trayMaxCaps, trayLevels] = await Promise.all([
      snmpSubtree(session, OIDS.prtInputName).catch(() => []),
      snmpSubtree(session, OIDS.prtInputMaxCap).catch(() => []),
      snmpSubtree(session, OIDS.prtInputCurrentLevel).catch(() => []),
    ]);

    const traysMap = new Map<string, { name?: string; max?: number; level?: number }>();
    for (const vb of trayNames) {
      if (snmp.isVarbindError(vb)) continue;
      const idx = getIndexSuffix(vb.oid, OIDS.prtInputName);
      traysMap.set(idx, { ...(traysMap.get(idx) ?? {}), name: String(vb.value) });
    }
    for (const vb of trayMaxCaps) {
      if (snmp.isVarbindError(vb)) continue;
      const idx = getIndexSuffix(vb.oid, OIDS.prtInputMaxCap);
      traysMap.set(idx, { ...(traysMap.get(idx) ?? {}), max: Number(vb.value) });
    }
    for (const vb of trayLevels) {
      if (snmp.isVarbindError(vb)) continue;
      const idx = getIndexSuffix(vb.oid, OIDS.prtInputCurrentLevel);
      traysMap.set(idx, { ...(traysMap.get(idx) ?? {}), level: Number(vb.value) });
    }

    const trays: PaperTrayItem[] = [];
    for (const item of traysMap.values()) {
      if (!item.name) continue;
      const maxCap = item.max ?? 0;
      const level = item.level ?? -2;
      trays.push({
        name: item.name,
        percent: calculateSupplyPercent(level, maxCap),
        level,
        maxCapacity: maxCap,
      });
    }

    return {
      printerId: printer.id,
      model,
      status: resolvePrinterStatus(hrDeviceStatus, hrPrinterStatus, errorFlags),
      supplies,
      trays,
      errorFlags,
      pageCount,
      updatedAt: new Date().toISOString(),
    };
  } catch (err: unknown) {
    return {
      printerId: printer.id,
      status: PrinterStatus.Offline,
      supplies: [],
      trays: [],
      errorFlags: ['offline'],
      pageCount: null,
      errorMessage: err instanceof Error ? err.message : String(err),
      updatedAt: new Date().toISOString(),
    };
  } finally {
    try {
      session.close();
    } catch {
      // ignore close errors
    }
  }
}
