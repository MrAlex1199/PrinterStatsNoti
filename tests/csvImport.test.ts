import { describe, it, expect } from 'vitest';
import { parsePrinterSpreadsheetText } from '../src/utils/csvImport.js';

describe('CSV / TSV Printer Spreadsheet Parser', () => {
  it('parses tab-separated Excel rows including -USB and Thai B.E. contract ranges', () => {
    const tsv = [
      'No.\tจุดที่ตั้งเครื่อง\tรุ่น\tรหัสเครื่อง\tIP\tเลขสัญญา\tประเภท\tว.ด.ป. สัญญา\tสัญญา/ปี\tค่าเช่า/เดือน\tหมายเหตุ',
      '1\tอาคารผู้บริหาร 4 ชั้น 2 ธุรการ\tMinolta รุ่น BHC251I CPS\tADXM041005929\t192.168.0.252\t04A25240015\tสแกน/พิมพ์ สี/ขาวดำ A4/A3\t01/07/2568-29/06/2573\tเช่าเครื่อง/บริการ 5 ปี\t2,750.00\tKonica',
      '11\tอาคารผู้บริหาร 4 ชั้น 1 ประชาสัมพันธ์\tKYOCERA รุ่น ECOSYS M2535dn\tLZP5702954\t-USB\t618\tสแกน/พิมพ์ ขาวดำ A4\t15/11/2568-14/11/2569\tบริการ 1 ปี\tตามจริง/0.35/ผ\t**ทรัพย์สินบริษัทฯ',
    ].join('\n');

    const rows = parsePrinterSpreadsheetText(tsv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      ip: '192.168.0.252',
      connectionType: 'network',
      asset: {
        location: 'อาคารผู้บริหาร 4 ชั้น 2 ธุรการ',
        modelName: 'Minolta รุ่น BHC251I CPS',
        serialNumber: 'ADXM041005929',
        contractNumber: '04A25240015',
        contractStartDate: '01/07/2568',
        contractEndDate: '29/06/2573',
        contractTerm: 'เช่าเครื่อง/บริการ 5 ปี',
        monthlyCost: '2,750.00',
        vendorNote: 'Konica',
      },
    });

    expect(rows[1]).toMatchObject({
      ip: '-USB',
      connectionType: 'usb',
      asset: {
        serialNumber: 'LZP5702954',
        contractNumber: '618',
        vendorNote: '**ทรัพย์สินบริษัทฯ',
      },
    });
  });

  it('parses comma-separated CSV rows with quoted fields', () => {
    const csv = '1,คลังสินค้า 4,KYOCERA ECOSYS P2040dn,VYD0212101,192.168.0.239,968,"พิมพ์ ขาวดำ A4, ฟรี 2000 แผ่น/เดือน",01/07/2568-29/06/2573,เช่าเครื่อง/บริการ 1 ปี,"ตามจริง/0.35/ผ",JoB Ent.';
    const rows = parsePrinterSpreadsheetText(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].ip).toBe('192.168.0.239');
    expect(rows[0].asset.capabilities).toBe('พิมพ์ ขาวดำ A4, ฟรี 2000 แผ่น/เดือน');
  });
});
