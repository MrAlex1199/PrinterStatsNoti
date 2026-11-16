# Multi-Protocol Printer Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand printer auto-discovery to detect printers across SNMPv2c, SNMPv1, TCP 9100/631 (IPP), and mDNS (`_ipp._tcp.local` / `_printer._tcp.local`) so sleeping, legacy, or SNMP-disabled printers are reliably found.

**Architecture:** Refactor `src/snmp/scanner.ts` to run a multi-protocol pipeline per IP (SNMPv2c -> SNMPv1 fallback -> TCP 9100/631 IPP probe) alongside an optional 1.5s UDP mDNS multicast query, merging results by IP with a `protocols` tag list.

**Tech Stack:** Node.js `net`, `dgram`, `http`, `net-snmp`, `vitest`.

---

### Task 1: Multi-Protocol Probe & mDNS Parser

**Files:**
- Modify: `src/types/net-snmp.d.ts` (add `Version1`)
- Modify: `src/snmp/scanner.ts`
- Test: `tests/scanner.test.ts`

- [ ] **Step 1: Write failing tests in `tests/scanner.test.ts`** for:
  - `mergeDiscoveredPrinters` deduplicating and merging protocols by IP (e.g. `SNMPv1` + `mDNS` on same IP).
  - `scanTargets` falling back to TCP/IPP probe when SNMP returns `null`, and labeling `snmpEnabled: false`.
  - `buildMdnsQueryPacket` / `parseMdnsResponseIps` extracting IPv4 A-records from synthetic mDNS DNS response buffers.
- [ ] **Step 2: Run `npx vitest run tests/scanner.test.ts` to verify failure (RED)**
- [ ] **Step 3: Implement SNMPv1 fallback, TCP 9100/631 IPP probe, and mDNS UDP query in `src/snmp/scanner.ts` (GREEN)**
- [ ] **Step 4: Run `npx vitest run tests/scanner.test.ts` to verify pass**

### Task 2: API & Scan Modal UI Integration

**Files:**
- Modify: `src/server/app.ts`
- Modify: `public/index.html`
- Modify: `public/app.js`
- Test: `tests/api.test.ts`

- [ ] **Step 1: Update `POST /api/scan` in `src/server/app.ts`** to accept `communities` (comma-separated), `useTcpPorts` (default `true`), and `useMdns` (default `true`).
- [ ] **Step 2: Update Scan Modal in `public/index.html` & `public/app.js`** with protocol checkboxes (`SNMP v1/v2c`, `TCP 9100/631 IPP`, `mDNS`) and protocol badges in the scan results list.
- [ ] **Step 3: Run `npm run build && npm test && npm run package:all` and commit.**
