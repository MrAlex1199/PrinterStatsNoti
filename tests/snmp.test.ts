import { describe, it, expect } from 'vitest';
import { calculateSupplyPercent, decodeErrorStateBitmask } from '../src/snmp/parser.js';
import { collectPrinterSnapshot } from '../src/snmp/collector.js';
import { PrinterStatus } from '../src/types.js';

describe('SNMP Parser & Simulator', () => {
  it('handles RFC 3805 special supply values (-1, -2, -3)', () => {
    expect(calculateSupplyPercent(45, 100)).toBe(45);
    expect(calculateSupplyPercent(-3, 100)).toBe(100);
    expect(calculateSupplyPercent(-2, 100)).toBeNull();
    expect(calculateSupplyPercent(-1, 100)).toBeNull();
    expect(calculateSupplyPercent(50, 0)).toBeNull();
  });

  it('decodes hrPrinterDetectedErrorState bitmask', () => {
    const flags = decodeErrorStateBitmask(Buffer.from([0xa4]));
    expect(flags).toContain('lowPaper');
    expect(flags).toContain('lowToner');
    expect(flags).toContain('jammed');
  });

  it('returns simulated snapshot when printer.simulator is true', async () => {
    const snap = await collectPrinterSnapshot({
      id: 'sim-1',
      name: 'Demo Laser',
      ip: '127.0.0.1',
      community: 'public',
      port: 161,
      enabled: true,
      simulator: true,
      simulatorScenario: 'low_ink',
    });
    expect(snap.printerId).toBe('sim-1');
    expect(snap.status).toBe(PrinterStatus.Warning);
    expect(snap.supplies.some((s) => s.percent !== null && s.percent <= 15)).toBe(true);
  });
});
