# Animations & Clean Process Shutdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add smooth, accessible UI micro-animations (following `ui-ux-pro-max` guidelines) and guarantee zero lingering processes on shutdown.

**Architecture:**
1. **Clean Shutdown (`src/index.ts`, `src/server/app.ts`, `src/scheduler/runner.ts`)**: Pass an `onShutdown` callback into `createApp` that stops the scheduler, calls `server.closeAllConnections()` + `server.close()`, and exits cleanly on `POST /api/shutdown`, `SIGINT`, and `SIGTERM`.
2. **UI Animations (`public/index.html`, `public/app.js`)**: Add CSS keyframes (`fadeSlideUp`, `modalIn`), staggered card entrance on initial/filter render, smooth 600ms ink-bar width transitions, subtle status pulse on warning/error dots, hover lift & button press micro-interactions, and `@media (prefers-reduced-motion: reduce)`.

**Tech Stack:** Node.js HTTP `server.closeAllConnections()`, Tailwind CSS, Vanilla CSS Keyframes, `vitest`.

---

### Task 1: Clean Shutdown & Zero Lingering Processes

**Files:**
- Modify: `src/scheduler/runner.ts` (unref timers so they never block exit)
- Modify: `src/server/app.ts` (accept optional `onShutdown` callback in `createApp`)
- Modify: `src/index.ts` (wire `server.closeAllConnections()`, `server.close()`, `SIGINT`/`SIGTERM` handlers)
- Test: `tests/api.test.ts`

- [ ] **Step 1: Add shutdown hook test in `tests/api.test.ts`** (verify `POST /api/shutdown` invokes `onShutdown` callback and returns `{ ok: true }`).
- [ ] **Step 2: Implement `onShutdown` in `app.ts`, `.unref()` in `runner.ts`, and `shutdownGracefully()` in `index.ts`**.
- [ ] **Step 3: Run `npx vitest run tests/api.test.ts`**.

### Task 2: UI Micro-Animations (`ui-ux-pro-max`)

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`

- [ ] **Step 1: Add `@keyframes` (`cardEnter`, `modalPop`), smooth transitions, and `@media (prefers-reduced-motion: reduce)` in `public/index.html`**.
- [ ] **Step 2: Apply staggered card entrance (`animation-delay`), ink bar smooth width transition, subtle status ping on warning/error dots, refresh icon spin during poll, and modal pop-in in `public/app.js`**.
- [ ] **Step 3: Run `npm run build && npm test && npm run package:all` and commit**.
