export enum PrinterStatus {
  Online = 'online',
  Printing = 'printing',
  Warning = 'warning',
  Error = 'error',
  Offline = 'offline',
}

export type PrinterErrorFlag =
  | 'lowPaper'
  | 'noPaper'
  | 'lowToner'
  | 'noToner'
  | 'doorOpen'
  | 'jammed'
  | 'offline'
  | 'serviceRequested'
  | 'inputTrayMissing'
  | 'outputTrayMissing'
  | 'markerSupplyMissing'
  | 'outputNearFull'
  | 'outputFull'
  | 'inputTrayEmpty'
  | 'overduePreventMaint';

export type SimulatorScenario =
  | 'normal'
  | 'low_ink'
  | 'paper_jam'
  | 'offline'
  | 'no_paper'
  | 'door_open';

export interface PrinterAssetInfo {
  location?: string;
  modelName?: string;
  serialNumber?: string;
  contractNumber?: string;
  capabilities?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  contractTerm?: string;
  monthlyCost?: string;
  vendorNote?: string;
}

export interface PrinterConfig {
  id: string;
  name: string;
  ip: string;
  community: string;
  port: number;
  enabled: boolean;
  simulator: boolean;
  simulatorScenario?: SimulatorScenario;
  connectionType?: 'network' | 'usb';
  asset?: PrinterAssetInfo;
}

export interface SupplyItem {
  name: string;
  color: string;
  percent: number | null;
  level: number;
  maxCapacity: number;
}

export interface PaperTrayItem {
  name: string;
  percent: number | null;
  level: number;
  maxCapacity: number;
}

export interface PrinterSnapshot {
  printerId: string;
  model?: string;
  status: PrinterStatus;
  supplies: SupplyItem[];
  trays: PaperTrayItem[];
  errorFlags: PrinterErrorFlag[];
  alertMessages?: string[];
  pageCount: number | null;
  errorMessage?: string;
  updatedAt: string;
}

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface AlertRecord {
  id: string;
  printerId: string;
  printerName: string;
  type:
    | 'low_ink'
    | 'no_toner'
    | 'paper_jam'
    | 'no_paper'
    | 'offline'
    | 'hardware_error'
    | 'door_open'
    | 'tray_problem'
    | 'contract_expiring'
    | 'daily_summary'
    | 'test';
  severity?: AlertSeverity;
  message: string;
  deliveryStatus: 'sent' | 'web_only' | 'skipped' | 'failed';
  errorDetail?: string;
  createdAt: string;
}

export interface DailyPrinterStat {
  printerId: string;
  date: string; // YYYY-MM-DD
  startOfDayPageCount: number;
  latestPageCount: number;
  pagesPrintedToday: number;
}

export interface LineNotifyRules {
  paperJam: boolean;        // Critical: กระดาษติด (ค่าเริ่มต้น: true)
  noToner: boolean;         // Critical: หมึกหมดเกลี้ยง (ค่าเริ่มต้น: true)
  hardwareError: boolean;   // Critical: ฮาร์ดแวร์เสีย/เรียกช่าง (ค่าเริ่มต้น: true)
  lowInk: boolean;          // Warning: หมึกใกล้หมด (ค่าเริ่มต้น: true)
  offline: boolean;         // Warning: เครื่องออฟไลน์ (ค่าเริ่มต้น: true)
  contractExpiring: boolean;// Warning: สัญญาใกล้หมด (ค่าเริ่มต้น: true)
  noPaper: boolean;         // Info: กระดาษหมด (ค่าเริ่มต้น: false -> แจ้งบนเว็บเท่านั้น)
  doorOrTray: boolean;      // Info: ฝาเปิด/ถาดกระดาษเปิด (ค่าเริ่มต้น: false -> แจ้งบนเว็บเท่านั้น)
}

export const DEFAULT_LINE_NOTIFY_RULES: LineNotifyRules = {
  paperJam: true,
  noToner: true,
  hardwareError: true,
  lowInk: true,
  offline: true,
  contractExpiring: true,
  noPaper: false,
  doorOrTray: false,
};

export interface AppSettings {
  pollIntervalSeconds: number;
  lowInkThresholdPercent: number;
  dailyReportCron: string;
  alertCooldownMinutes: number;
  contractExpiryAlertDays: number;
  lineChannelAccessToken: string;
  lineChannelSecret: string;
  lineTargetId: string;
  lineNotifyRules?: LineNotifyRules;
}

export const DEFAULT_SETTINGS: AppSettings = {
  pollIntervalSeconds: 60,
  lowInkThresholdPercent: 15,
  dailyReportCron: '0 18 * * *',
  alertCooldownMinutes: 360,
  contractExpiryAlertDays: 30,
  lineChannelAccessToken: '',
  lineChannelSecret: '',
  lineTargetId: '',
  lineNotifyRules: { ...DEFAULT_LINE_NOTIFY_RULES },
};

export interface StoreData {
  printers: PrinterConfig[];
  settings: AppSettings;
  snapshots: Record<string, PrinterSnapshot>;
  alerts: AlertRecord[];
  lastAlertTimes: Record<string, number>;
  dailyStats: Record<string, DailyPrinterStat>;
}
