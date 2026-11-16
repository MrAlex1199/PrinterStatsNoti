import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function isPackagedBinary(): boolean {
  return Boolean((process as unknown as { pkg?: unknown }).pkg);
}

export function isBackgroundLaunch(argv: string[] = process.argv): boolean {
  return argv.includes('--background') || argv.includes('-b') || process.env.RUN_BACKGROUND === '1';
}

export function resolveDataDir(
  packaged: boolean = isPackagedBinary(),
  execPath: string = process.execPath,
  cwd: string = process.cwd()
): string {
  const baseDir = packaged ? path.dirname(execPath) : cwd;
  return path.join(baseDir, 'data');
}

export function resolveEnvPath(
  packaged: boolean = isPackagedBinary(),
  execPath: string = process.execPath,
  cwd: string = process.cwd()
): string {
  const baseDir = packaged ? path.dirname(execPath) : cwd;
  return path.join(baseDir, '.env');
}

export function resolvePublicDir(
  packaged: boolean = isPackagedBinary(),
  bundleDir: string = typeof __dirname !== 'undefined' ? __dirname : process.cwd(),
  cwd: string = process.cwd()
): string {
  return packaged ? path.join(bundleDir, 'public') : path.join(cwd, 'public');
}

export function findWindowsAppBrowser(): string | null {
  const candidates = [
    process.env['PROGRAMFILES(X86)'] ? path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe') : null,
    process.env['PROGRAMFILES'] ? path.join(process.env['PROGRAMFILES'], 'Microsoft/Edge/Application/msedge.exe') : null,
    process.env['LOCALAPPDATA'] ? path.join(process.env['LOCALAPPDATA'], 'Microsoft/Edge/Application/msedge.exe') : null,
    process.env['PROGRAMFILES'] ? path.join(process.env['PROGRAMFILES'], 'Google/Chrome/Application/chrome.exe') : null,
    process.env['PROGRAMFILES(X86)'] ? path.join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe') : null,
    process.env['LOCALAPPDATA'] ? path.join(process.env['LOCALAPPDATA'], 'Google/Chrome/Application/chrome.exe') : null,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

export function getBrowserOpenCommand(
  platform: NodeJS.Platform,
  url: string
): { command: string; args: string[] } {
  if (platform === 'win32') {
    return { command: 'cmd', args: ['/c', 'start', '', url] };
  }
  if (platform === 'darwin') {
    return { command: 'open', args: [url] };
  }
  return { command: 'xdg-open', args: [url] };
}

export function getAppWindowCommand(
  platform: NodeJS.Platform,
  url: string,
  browserPath?: string | null
): { command: string; args: string[] } {
  if (platform === 'win32') {
    const appBrowser = browserPath !== undefined ? browserPath : findWindowsAppBrowser();
    if (appBrowser) {
      return {
        command: appBrowser,
        args: [`--app=${url}`, '--window-size=1280,840'],
      };
    }
    return getBrowserOpenCommand(platform, url);
  }
  return getBrowserOpenCommand(platform, url);
}

export function openBrowser(url: string): void {
  if (process.env.NO_OPEN === '1' || process.env.NODE_ENV === 'test') return;
  const { command, args } = getBrowserOpenCommand(process.platform, url);
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.unref();
  } catch {
    // ignore browser launch errors on headless servers
  }
}

export function openAppWindow(url: string, browserPath?: string | null): void {
  if (process.env.NO_OPEN === '1' || process.env.NODE_ENV === 'test') return;
  const { command, args } = getAppWindowCommand(process.platform, url, browserPath);
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.unref();
  } catch {
    openBrowser(url);
  }
}
