import { PrinterAssetInfo } from '../types.js';

export interface ParsedImportRow {
  name: string;
  ip: string;
  connectionType: 'network' | 'usb';
  asset: PrinterAssetInfo;
}

function splitDelimitedLine(line: string, delimiter: '\t' | ','): string[] {
  if (delimiter === '\t') {
    return line.split('\t').map((c) => c.trim());
  }
  const cols: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cols.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cols.push(current.trim());
  return cols;
}

function splitContractRange(raw: string): { start?: string; end?: string } {
  const cleaned = raw.trim();
  if (!cleaned) return {};
  const parts = cleaned.split('-').map((p) => p.trim());
  if (parts.length >= 2) {
    return { start: parts[0], end: parts[1] };
  }
  return { end: cleaned };
}

export function parsePrinterSpreadsheetText(rawText: string): ParsedImportRow[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const results: ParsedImportRow[] = [];

  for (const line of lines) {
    const delimiter: '\t' | ',' = line.includes('\t') ? '\t' : ',';
    const cols = splitDelimitedLine(line, delimiter);
    if (cols.length < 5) continue;

    // Skip header row
    const firstCol = cols[0].toLowerCase();
    if (firstCol === 'no' || firstCol === 'no.' || cols[1]?.includes('จุดที่ตั้ง')) {
      continue;
    }

    // Standard 11-column layout:
    // 0:No, 1:Location, 2:Model, 3:Serial, 4:IP, 5:ContractNo, 6:Capabilities, 7:DateRange, 8:Term, 9:MonthlyCost, 10:VendorNote
    const location = cols[1] || '';
    const modelName = cols[2] || '';
    const serialNumber = cols[3] || '';
    const ipRaw = cols[4] || '';
    const contractNumber = cols[5] || '';
    const capabilities = cols[6] || '';
    const dateRange = splitContractRange(cols[7] || '');
    const contractTerm = cols[8] || '';
    const monthlyCost = cols[9] || '';
    const vendorNote = cols[10] || '';

    const isUsb = ipRaw.toUpperCase().includes('USB') || ipRaw === '-';
    const connectionType: 'network' | 'usb' = isUsb ? 'usb' : 'network';
    const ip = isUsb ? '-USB' : ipRaw;
    const name = location || modelName || `Printer (${ip})`;

    results.push({
      name,
      ip,
      connectionType,
      asset: {
        location: location || undefined,
        modelName: modelName || undefined,
        serialNumber: serialNumber || undefined,
        contractNumber: contractNumber || undefined,
        capabilities: capabilities || undefined,
        contractStartDate: dateRange.start || undefined,
        contractEndDate: dateRange.end || undefined,
        contractTerm: contractTerm || undefined,
        monthlyCost: monthlyCost || undefined,
        vendorNote: vendorNote || undefined,
      },
    });
  }

  return results;
}
