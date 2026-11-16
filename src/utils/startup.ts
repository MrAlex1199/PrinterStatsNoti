import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { isPackagedBinary } from './runtime.js';

const execFileAsync = promisify(execFile);

export const REG_RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
export const REG_VALUE_NAME = 'PrinterStatsNoti';

export function isStartupSupported(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'win32';
}

export function resolveExecutablePath(execPath: string = process.execPath): string {
  // If running inside pkg standalone binary, process.execPath is the .exe path
  // If running in node dev mode, point to release/PrinterStatsNoti-win-x64.exe if exists, or process.execPath
  return path.resolve(execPath);
}

export async function getStartupStatus(
  execPath: string = process.execPath,
  platform: NodeJS.Platform = process.platform
): Promise<{ supported: boolean; enabled: boolean; command?: string }> {
  if (!isStartupSupported(platform)) {
    return { supported: false, enabled: false };
  }

  try {
    const { stdout } = await execFileAsync('reg', ['query', REG_RUN_KEY, '/v', REG_VALUE_NAME]);
    const match = stdout.match(new RegExp(`${REG_VALUE_NAME}\\s+REG_SZ\\s+(.+)`, 'i'));
    const command = match ? match[1].trim() : undefined;
    return { supported: true, enabled: Boolean(match), command };
  } catch {
    return { supported: true, enabled: false };
  }
}

export async function setStartupEnabled(
  enabled: boolean,
  execPath: string = process.execPath,
  platform: NodeJS.Platform = process.platform
): Promise<boolean> {
  if (!isStartupSupported(platform)) {
    return false;
  }

  if (enabled) {
    const targetExe = resolveExecutablePath(execPath);
    // Wrap in quotes and append --background flag
    const regValue = `"${targetExe}" --background`;
    try {
      await execFileAsync('reg', [
        'add',
        REG_RUN_KEY,
        '/v',
        REG_VALUE_NAME,
        '/t',
        'REG_SZ',
        '/d',
        regValue,
        '/f',
      ]);
      return true;
    } catch (err) {
      console.error('Failed to set Windows startup registry:', err);
      return false;
    }
  } else {
    try {
      await execFileAsync('reg', ['delete', REG_RUN_KEY, '/v', REG_VALUE_NAME, '/f']);
      return true;
    } catch {
      // If already absent, treat as success
      return true;
    }
  }
}
