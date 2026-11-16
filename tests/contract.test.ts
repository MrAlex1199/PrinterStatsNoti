import { describe, it, expect } from 'vitest';
import { getContractDaysRemaining, parseContractDate } from '../src/utils/contract.js';

describe('Contract Date Utils', () => {
  it('parses Thai Buddhist Era dd/mm/yyyy dates accurately', () => {
    const dt = parseContractDate('29/06/2573');
    expect(dt).not.toBeNull();
    expect(dt?.getUTCFullYear()).toBe(2030);
    expect(dt?.getUTCMonth()).toBe(5); // June (0-indexed)
    expect(dt?.getUTCDate()).toBe(29);
  });

  it('parses ISO yyyy-mm-dd and Gregorian dd/mm/yyyy dates', () => {
    const iso = parseContractDate('2026-12-31');
    expect(iso?.getUTCFullYear()).toBe(2026);
    expect(iso?.getUTCMonth()).toBe(11);
    expect(iso?.getUTCDate()).toBe(31);

    const greg = parseContractDate('14/11/2026');
    expect(greg?.getUTCFullYear()).toBe(2026);
  });

  it('returns null for invalid dates and calculates days remaining', () => {
    expect(parseContractDate('invalid')).toBeNull();
    const now = new Date(Date.UTC(2026, 10, 16)); // 2026-11-16
    expect(getContractDaysRemaining('2026-11-26', now)).toBe(10);
    expect(getContractDaysRemaining('14/11/2569', now)).toBe(-2); // 2026-11-14
  });
});
