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
  | 'serviceRequested';

export type SimulatorScenario = 'normal' | 'low_ink' | 'paper_jam' | 'offline';

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
  pageCount: number | null;
  errorMessage?: string;
  updatedAt: string;
}

export interface AlertRecord {
  id: string;
  printerId: string;
  printerName: string;
  type:
    | 'low_ink'
    | 'paper_jam'
    | 'no_paper'
    | 'offline'
    | 'hardware_error'
    | 'contract_expiring'
    | 'daily_summary'
    | 'test';
  message: string;
  deliveryStatus: 'sent' | 'skipped' | 'failed';
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

export interface AppSettings {
  pollIntervalSeconds: number;
  lowInkThresholdPercent: number;
  dailyReportCron: string;
  alertCooldownMinutes: number;
  contractExpiryAlertDays: number;
  lineChannelAccessToken: string;
  lineChannelSecret: string;
  lineTargetId: string;
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
};

export interface StoreData {
  printers: PrinterConfig[];
  settings: AppSettings;
  snapshots: Record<string, PrinterSnapshot>;
  alerts: AlertRecord[];
  lastAlertTimes: Record<string, number>;
  dailyStats: Record<string, DailyPrinterStat>;
}
