# PrinterStatsNoti

ระบบติดตามสถานะเครื่องพิมพ์ในองค์กร (SNMP / TCP 9100 / IPP / mDNS), จัดการข้อมูลสินทรัพย์และสัญญาเช่า (รองรับ พ.ศ.), และแจ้งเตือนเข้ามือถือผ่าน LINE Messaging API

## Quick Start
```bash
npm install
npm run dev     # รันโหมดพัฒนาที่ http://localhost:3000
npm test        # รันชุดทดสอบ (Vitest)
npm run build   # คอมไพล์ TypeScript
npm run package:win  # สร้างไฟล์ Standalone .exe ใน release/
```

ดูรายละเอียดสถาปัตยกรรมและบริบทสำหรับพัฒนาต่อบนเครื่องอื่นได้ที่ [HANDOFF_MEMORY.md](./HANDOFF_MEMORY.md)
