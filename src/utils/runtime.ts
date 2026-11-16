import { spawn } from 'node:child_process';
import path from 'node:path';

export function isPackagedBinary(): boolean {
  return Boolean((process as unknown as { pkg?: unknown }).pkg);
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
