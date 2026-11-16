# Standalone Executable (.exe / macOS / Linux) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package PrinterStatsNoti into standalone zero-dependency executables (`PrinterStatsNoti-win-x64.exe`, macOS, and Linux) that embed the Web Dashboard assets, persist `data/store.json` beside the executable, and auto-open the browser on launch.

**Architecture:** Use `esbuild` to bundle the TypeScript backend into a single CommonJS file (`dist-pkg/bundle.cjs`), then use `@yao-pkg/pkg` to compile it with `public/**/*` embedded into the binary snapshot for Windows x64, macOS arm64, and Linux x64.

**Tech Stack:** `esbuild`, `@yao-pkg/pkg` (Node 22 base binaries), `vitest`.

---

### Task 1: Runtime Path Resolution & Browser Auto-Open

**Files:**
- Create: `src/utils/runtime.ts`
- Modify: `src/storage/store.ts`
- Modify: `src/server/app.ts`
- Modify: `src/index.ts`
- Test: `tests/runtime.test.ts`

- [ ] **Step 1: Write failing test `tests/runtime.test.ts`**
  - Verify `resolveDataDir(isPackaged, execPath, cwd)` returns `path.join(path.dirname(execPath), 'data')` when `isPackaged === true`, and `path.join(cwd, 'data')` when `false`.
  - Verify `resolvePublicDir(isPackaged, bundleDir, cwd)` returns `path.join(bundleDir, 'public')` when `isPackaged === true`, and `path.join(cwd, 'public')` when `false`.
  - Verify `getBrowserOpenCommand(platform, url)` returns `cmd` + `['/c', 'start', '', url]` on `win32`, `open` on `darwin`, `xdg-open` on `linux`.
- [ ] **Step 2: Run test to verify failure** (`npx vitest run tests/runtime.test.ts`)
- [ ] **Step 3: Implement `src/utils/runtime.ts` and wire into `store.ts`, `app.ts`, `index.ts`**
- [ ] **Step 4: Run tests to verify pass** (`npx vitest run`)
- [ ] **Step 5: Commit**

### Task 2: esbuild + @yao-pkg/pkg Build Pipeline

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `scripts/build-exe.mjs`

- [ ] **Step 1: Install `esbuild` and `@yao-pkg/pkg` as devDependencies**
- [ ] **Step 2: Add `dist-pkg/` and `release/` to `.gitignore`**
- [ ] **Step 3: Create `scripts/build-exe.mjs` to bundle `src/index.ts` into `dist-pkg/bundle.cjs`, copy `public/` to `dist-pkg/public/`, and run `pkg` for `node22-win-x64`, `node22-macos-arm64`, and `node22-linux-x64` outputting to `release/`**
- [ ] **Step 4: Run `npm run package:all` and verify `.exe` and macOS binary exist in `release/` and smoke-test the macOS binary**
- [ ] **Step 5: Commit**
