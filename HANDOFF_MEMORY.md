# PrinterStatsNoti — Project Memory & Handoff Context

> Use this file as the primary context/memory when continuing development on another PC (e.g. Windows PC with Antigravity / AI coding assistant).

## 1. Project Overview & Intent
**PrinterStatsNoti** is a self-hosted, all-in-one Node.js (TypeScript) service for monitoring an organization's LAN/USB printer fleet, displaying real-time status & contract info on a compact Web Dashboard, and sending mobile alerts via **LINE Messaging API**.

## 2. Key Design Decisions (from `/grill-me` & Specs)
- **Target Printers**: Network document printers (Laser/Inkjet — tested with Konica Minolta `BHC251I`/`BH287` and KYOCERA `ECOSYS` models) + manual `-USB` printer asset entries (`connectionType: 'usb'`).
- **Architecture**: All-in-one single-process Node.js (`>=22`, TypeScript strict mode) + Express server + static Web Dashboard (`public/`).
- **Zero Native C++ Dependencies**: Uses atomic JSON persistence (`data/store.json`) via temp-file rename (`JsonStore` in `src/storage/store.ts`) instead of `better-sqlite3`, enabling cross-platform compilation to standalone `.exe` from macOS/Windows/Linux.
- **Notifications (LINE Messaging API)**:
  - Low ink/toner (`<= lowInkThresholdPercent`, default `15%`), Paper Jam, Out of Paper, Offline, Hardware Errors, Contract Expiring (`<= contractExpiryAlertDays`, default `30` days), and scheduled Daily Summary (`node-cron`, default `0 18 * * *`).
  - All alerts use state-transition + cooldown deduplication (`AlertEngine` in `src/alerts/engine.ts`) and include asset context (`location`, `serialNumber`, `contractNumber`, `vendorNote`).
  - Interactive LINE Bot replies with Flex Message Carousel when user sends `"สถานะ"`, `"status"`, or `"เช็คหมึก"`, and returns chat/group ID on `"myid"`.
- **Multi-Protocol Network Scanner** (`src/snmp/scanner.ts`):
  - SNMPv2c + SNMPv1 fallback (handles SNMPv1 `noSuchName` by falling back to single-OID gets; `1500ms` timeout for sleeping printers; comma-separated communities).
  - TCP Port `9100` (RAW) / `631` (IPP) fallback + UDP multicast mDNS (`_ipp._tcp.local`, `_printer._tcp.local`).
  - Max `1,024 IPs` per scan; previews results with `alreadyAdded` and `snmpEnabled` badges before bulk import.
- **Asset, Contract & Excel/CSV Import**:
  - Parses Thai Buddhist Era dates (`dd/mm/25xx` → Gregorian) in `src/utils/contract.ts`.
  - Parses pasted Excel (tab-separated) or `.csv` rows (including `-USB` and date ranges like `01/07/2568-29/06/2573`) in `src/utils/csvImport.ts`.
- **Compact Bento UX/UI** (`public/index.html`, `public/app.js`):
  - Built following `ui-ux-pro-max` guidelines (installed in `.agent/skills/ui-ux-pro-max/`).
  - Compact 4-KPI strip (daily page count stat intentionally removed), grouped by Brand (`Konica Minolta`, `KYOCERA`, etc.), Card/Table view toggle, Search + Brand/Vendor filters, click-card Detail Modal, and accessible micro-animations (`prefers-reduced-motion`).
- **Standalone `.exe` Packaging** (`scripts/build-exe.mjs`, `src/utils/runtime.ts`, `src/utils/pePatch.ts`):
  - Uses `esbuild` + `@yao-pkg/pkg` (Node 22 base, no UPX compression to reduce AV false positives).
  - Patches Windows PE Optional Header `Subsystem` from `WINDOWS_CUI (3)` to `WINDOWS_GUI (2)` in-place so no terminal window appears.
  - Auto-opens `http://localhost:3000` on launch; single-instance `EADDRINUSE` opens existing browser and exits cleanly.
  - `POST /api/shutdown` calls `server.closeAllConnections()` + `scheduler.stop()` + `process.exit(0)` so zero processes linger.
  - Seeds 3 rich demo printers on first boot (`data/store.json` is stored next to the `.exe`).

## 3. Repository Map
- `src/types.ts` — Shared TypeScript interfaces & `DEFAULT_SETTINGS`
- `src/storage/store.ts` — Atomic JSON store (`JsonStore`)
- `src/snmp/parser.ts`, `collector.ts`, `simulator.ts`, `scanner.ts` — SNMP RFC 3805 & Multi-protocol scanner
- `src/alerts/engine.ts` — Alert evaluation, cooldown deduplication, contract expiry, daily summary
- `src/line/service.ts` — LINE Messaging API & Flex Message builder
- `src/scheduler/runner.ts` — Polling interval & `node-cron` daily report
- `src/server/app.ts` — Express REST APIs, `/webhook`, `/api/shutdown`
- `src/utils/` — `contract.ts`, `csvImport.ts`, `runtime.ts`, `pePatch.ts`
- `public/index.html`, `public/app.js` — Compact Bento Web Dashboard
- `scripts/build-exe.mjs` — Standalone binary builder (`release/` is gitignored)
- `docs/superpowers/` — Design specs & implementation plans
- `tests/` — Vitest test suite (11 files, 29 tests)

## 4. Continuing Development on Windows PC
```bash
git clone <YOUR_GITHUB_REPO_URL>
cd PrinterStatsNoti
npm install
npm test          # Run all 29 tests
npm run dev       # Start dev server with hot reload (http://localhost:3000)
npm run package:win  # Build release/PrinterStatsNoti-win-x64.exe
```
