export function parseContractDate(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // ISO yyyy-mm-dd
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (isoMatch) {
    const yearRaw = Number(isoMatch[1]);
    const year = yearRaw >= 2400 ? yearRaw - 543 : yearRaw;
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    return makeValidUtcDate(year, month, day);
  }

  // Thai/Gregorian dd/mm/yyyy
  const dmyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const yearRaw = Number(dmyMatch[3]);
    const year = yearRaw >= 2400 ? yearRaw - 543 : yearRaw;
    return makeValidUtcDate(year, month, day);
  }

  return null;
}

function makeValidUtcDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return dt;
}

export function getContractDaysRemaining(
  endDateStr?: string,
  now: Date = new Date()
): number | null {
  const endDt = parseContractDate(endDateStr);
  if (!endDt) return null;
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diffMs = endDt.getTime() - todayUtc;
  return Math.round(diffMs / 86_400_000);
}
