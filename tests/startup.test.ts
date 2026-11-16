import { describe, it, expect } from 'vitest';
import {
  isStartupSupported,
  REG_RUN_KEY,
  REG_VALUE_NAME,
  resolveExecutablePath,
} from '../src/utils/startup.js';

describe('Windows Startup Registry Helpers', () => {
  it('supports win32 platform only', () => {
    expect(isStartupSupported('win32')).toBe(true);
    expect(isStartupSupported('linux')).toBe(false);
    expect(isStartupSupported('darwin')).toBe(false);
  });

  it('uses standard HKCU Run registry path and value name', () => {
    expect(REG_RUN_KEY).toContain('CurrentVersion\\Run');
    expect(REG_VALUE_NAME).toBe('PrinterStatsNoti');
  });

  it('resolves executable path correctly', () => {
    const p = resolveExecutablePath('C:\\app\\PrinterStatsNoti.exe');
    expect(p).toContain('PrinterStatsNoti.exe');
  });
});
