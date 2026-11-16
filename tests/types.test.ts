import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, PrinterStatus } from '../src/types.js';

describe('Shared Types & Defaults', () => {
  it('provides sensible default settings', () => {
    expect(DEFAULT_SETTINGS.pollIntervalSeconds).toBe(60);
    expect(DEFAULT_SETTINGS.lowInkThresholdPercent).toBe(15);
    expect(DEFAULT_SETTINGS.dailyReportCron).toBe('0 18 * * *');
    expect(DEFAULT_SETTINGS.alertCooldownMinutes).toBe(360);
    expect(PrinterStatus.Online).toBe('online');
  });
});
