import { PrinterConfig, PrinterSnapshot, PrinterStatus, SimulatorScenario } from '../types.js';

const simPageCounters = new Map<string, number>();

export function generateSimulatedSnapshot(
  printer: PrinterConfig,
  overrideScenario?: SimulatorScenario
): PrinterSnapshot {
  const scenario = overrideScenario ?? printer.simulatorScenario ?? 'normal';
  const prevPages = simPageCounters.get(printer.id) ?? 12450;
  const nextPages = scenario === 'offline' ? prevPages : prevPages + Math.floor(Math.random() * 4);
  simPageCounters.set(printer.id, nextPages);

  const now = new Date().toISOString();

  if (scenario === 'offline') {
    return {
      printerId: printer.id,
      model: 'Simulated Office LaserJet Pro M454dw',
      status: PrinterStatus.Offline,
      supplies: [],
      trays: [],
      errorFlags: ['offline'],
      pageCount: prevPages,
      errorMessage: 'Simulated network timeout (SNMP unreachable)',
      updatedAt: now,
    };
  }

  if (scenario === 'paper_jam') {
    return {
      printerId: printer.id,
      model: 'Simulated Office LaserJet Pro M454dw',
      status: PrinterStatus.Error,
      supplies: [
        { name: 'Black Toner', color: '#1e293b', percent: 72, level: 72, maxCapacity: 100 },
        { name: 'Cyan Toner', color: '#06b6d4', percent: 65, level: 65, maxCapacity: 100 },
        { name: 'Magenta Toner', color: '#ec4899', percent: 58, level: 58, maxCapacity: 100 },
        { name: 'Yellow Toner', color: '#eab308', percent: 81, level: 81, maxCapacity: 100 },
      ],
      trays: [
        { name: 'Tray 1 (A4)', percent: 50, level: 125, maxCapacity: 250 },
        { name: 'Tray 2 (A4)', percent: 80, level: 200, maxCapacity: 250 },
      ],
      errorFlags: ['jammed'],
      alertMessages: ['Paper Jam: Open Tray 1 and clear jam'],
      pageCount: nextPages,
      updatedAt: now,
    };
  }

  if (scenario === 'no_paper') {
    return {
      printerId: printer.id,
      model: 'Simulated Office LaserJet Pro M454dw',
      status: PrinterStatus.Error,
      supplies: [
        { name: 'Black Toner', color: '#1e293b', percent: 72, level: 72, maxCapacity: 100 },
        { name: 'Cyan Toner', color: '#06b6d4', percent: 65, level: 65, maxCapacity: 100 },
        { name: 'Magenta Toner', color: '#ec4899', percent: 58, level: 58, maxCapacity: 100 },
        { name: 'Yellow Toner', color: '#eab308', percent: 81, level: 81, maxCapacity: 100 },
      ],
      trays: [
        { name: 'Tray 1 (A4)', percent: 0, level: 0, maxCapacity: 250 },
        { name: 'Tray 2 (A4)', percent: 0, level: 0, maxCapacity: 250 },
      ],
      errorFlags: ['noPaper', 'inputTrayEmpty'],
      alertMessages: ['Load Paper into Tray 1'],
      pageCount: nextPages,
      updatedAt: now,
    };
  }

  if (scenario === 'door_open') {
    return {
      printerId: printer.id,
      model: 'Simulated Office LaserJet Pro M454dw',
      status: PrinterStatus.Error,
      supplies: [
        { name: 'Black Toner', color: '#1e293b', percent: 72, level: 72, maxCapacity: 100 },
        { name: 'Cyan Toner', color: '#06b6d4', percent: 65, level: 65, maxCapacity: 100 },
      ],
      trays: [
        { name: 'Tray 1 (A4)', percent: 50, level: 125, maxCapacity: 250 },
      ],
      errorFlags: ['doorOpen'],
      alertMessages: ['Front Door is Open'],
      pageCount: nextPages,
      updatedAt: now,
    };
  }

  if (scenario === 'low_ink') {
    return {
      printerId: printer.id,
      model: 'Simulated Office LaserJet Pro M454dw',
      status: PrinterStatus.Warning,
      supplies: [
        { name: 'Black Toner', color: '#1e293b', percent: 9, level: 9, maxCapacity: 100 },
        { name: 'Cyan Toner', color: '#06b6d4', percent: 12, level: 12, maxCapacity: 100 },
        { name: 'Magenta Toner', color: '#ec4899', percent: 64, level: 64, maxCapacity: 100 },
        { name: 'Yellow Toner', color: '#eab308', percent: 78, level: 78, maxCapacity: 100 },
      ],
      trays: [
        { name: 'Tray 1 (A4)', percent: 60, level: 150, maxCapacity: 250 },
      ],
      errorFlags: ['lowToner'],
      pageCount: nextPages,
      updatedAt: now,
    };
  }

  return {
    printerId: printer.id,
    model: 'Simulated Office LaserJet Pro M454dw',
    status: PrinterStatus.Online,
    supplies: [
      { name: 'Black Toner', color: '#1e293b', percent: 84, level: 84, maxCapacity: 100 },
      { name: 'Cyan Toner', color: '#06b6d4', percent: 68, level: 68, maxCapacity: 100 },
      { name: 'Magenta Toner', color: '#ec4899', percent: 71, level: 71, maxCapacity: 100 },
      { name: 'Yellow Toner', color: '#eab308', percent: 90, level: 90, maxCapacity: 100 },
    ],
    trays: [
      { name: 'Tray 1 (A4)', percent: 88, level: 220, maxCapacity: 250 },
      { name: 'Manual Feed', percent: 100, level: 100, maxCapacity: 100 },
    ],
    errorFlags: [],
    pageCount: nextPages,
    updatedAt: now,
  };
}
