# PrinterStatsNoti Design Specification

**Date:** 2026-11-16  
**Approach:** All-in-One Lightweight Service (Node.js + TypeScript)

## 1. Intent & Why
Provide a self-hosted, lightweight monitoring and mobile alerting system for multiple network document printers (Laser/Inkjet) in a LAN. Users can view live ink/toner levels, paper tray status, error states, and print counts on a Web Dashboard, receive instant mobile alerts via LINE Messaging API, and query printer status interactively through a LINE Bot.

## 2. Goals, Non-Goals, and Anti-Goals
### Goals
- Monitor multiple LAN printers concurrently via SNMP (v1/v2c, Printer-MIB RFC 3805 / Host-Resources-MIB).
- Display real-time status, ink/toner gauges (CMYK + Waste), paper tray status, page counts, and alert history on a responsive Web Dashboard.
- Send LINE Push Notifications for:
  1. Low ink/toner (configurable percentage threshold, default `< 15%`).
  2. Paper out or paper jam.
  3. Printer offline or hardware error (e.g., cover open, service needed).
  4. Scheduled daily summary report (configurable time, default `18:00`).
- Support interactive LINE Bot replies (e.g., user sends `"สถานะ"` or `"status"`) returning a formatted Flex Message card of all printers.
- Include a built-in **Printer Simulator Mode** (mock SNMP data provider) so the system can be demonstrated and tested without physical printers on the network.
- Zero-config persistence using atomic JSON file storage (`data/store.json`) with no native C++ dependencies.

### Non-Goals
- USB-only printer monitoring via OS spoolers (CUPS/Win32).
- 3D printer telemetry (OctoPrint/Klipper/Bambu) or thermal/POS receipt printers.
- User authentication/multi-tenant accounts (intended for trusted LAN usage).

### Anti-Goals
- **Alert Spam**: Repeatedly sending the same "ink low" or "offline" LINE message every polling cycle (must use state-transition + cooldown deduplication).
- **Brittle SNMP Crashes**: A single unreachable or non-standard printer timing out must never crash the polling loop or block other printers.

## 3. Global Constraints
- Runtime: Node.js `>= 22.0.0` (verified on `v24.7.0`), TypeScript `^5.x` (strict mode).
- Port: Default `3000` (configurable via `PORT` env or settings).
- Storage: Atomic JSON persistence in `data/store.json` (no native SQLite compilation).
- Testing: `vitest` for all unit and integration tests.
- Language/UI: Thai & English friendly UI and LINE notifications.

## 4. Architecture & Components
1. **Storage Layer (`src/storage/store.ts`)**: Manages `printers`, `settings`, `printerStates`, `alertHistory`, and `dailyStats` with atomic file writes.
2. **SNMP & Simulator Collector (`src/snmp/collector.ts`, `src/snmp/simulator.ts`)**:
   - Queries standard Printer-MIB OIDs:
     - `1.3.6.1.2.1.1.1.0` (`sysDescr` - Model/System description)
     - `1.3.6.1.2.1.25.3.2.1.5.1` (`hrDeviceStatus`: 2=running, 3=warning, 5=down)
     - `1.3.6.1.2.1.25.3.5.1.1.1` (`hrPrinterStatus`: 3=idle, 4=printing, 5=warmup)
     - `1.3.6.1.2.1.25.3.5.1.2.1` (`hrPrinterDetectedErrorState` bitmask: lowPaper, noPaper, lowToner, noToner, doorOpen, jammed, offline, serviceRequested)
     - `1.3.6.1.2.1.43.10.2.1.4.1.1` (`prtMarkerLifeCount` - total lifetime pages)
     - `1.3.6.1.2.1.43.11.1.1.*` (`prtMarkerSuppliesTable` - supply name, max capacity, current level)
     - `1.3.6.1.2.1.43.8.2.1.*` (`prtInputTable` - paper tray name, max capacity, current level)
   - Normalizes raw SNMP values (including `-1`, `-2`, `-3` unknown/OK markers in RFC 3805) into a clean `PrinterSnapshot`.
3. **Alert & Deduplication Engine (`src/alerts/engine.ts`)**:
   - Compares new `PrinterSnapshot` against previous state & cooldown window.
   - Emits alerts only on state transitions or when cooldown expires (default 6 hours for low ink, 30 mins for jam/offline).
   - Tracks daily page delta (`currentPageCount - startOfDayPageCount`) for daily summary reports.
4. **LINE Bot Service (`src/line/service.ts`)**:
   - Sends Push Messages via `@line/bot-sdk` (gracefully logs/skips if credentials are not configured yet).
   - Formats rich Flex Messages for interactive status queries (`"สถานะ"`, `"status"`).
5. **Scheduler (`src/scheduler/runner.ts`)**:
   - Runs SNMP polling interval (default every 60s).
   - Runs `node-cron` daily summary job (default `0 18 * * *`).
6. **Express Server & Web Dashboard (`src/server/app.ts`, `public/*`)**:
   - REST APIs for CRUD printers, live snapshots, manual poll trigger, test LINE alert, settings update, and alert logs.
   - LINE Webhook endpoint (`/webhook`).
   - Responsive Tailwind CSS Dashboard with live status cards, CMYK ink gauges, paper tray bars, simulator controls, and settings modal.
