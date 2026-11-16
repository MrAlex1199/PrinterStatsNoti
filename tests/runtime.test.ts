import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  getAppWindowCommand,
  getBrowserOpenCommand,
  isBackgroundLaunch,
  resolveDataDir,
  resolvePublicDir,
} from '../src/utils/runtime.js';

describe('Runtime Path & Browser Helpers', () => {
  it('detects background launch flag', () => {
    expect(isBackgroundLaunch(['node', 'app.js'])).toBe(false);
    expect(isBackgroundLaunch(['node', 'app.js', '--background'])).toBe(true);
    expect(isBackgroundLaunch(['node', 'app.js', '-b'])).toBe(true);
  });

  it('resolves app window command with --app flag', () => {
    const customBrowser = 'C:\\Program Files\\Edge\\msedge.exe';
    const winCmd = getAppWindowCommand('win32', 'http://localhost:3000', customBrowser);
    expect(winCmd).toEqual({
      command: customBrowser,
      args: ['--app=http://localhost:3000', '--window-size=1280,840'],
    });

    const nonWinCmd = getAppWindowCommand('darwin', 'http://localhost:3000');
    expect(nonWinCmd).toEqual({
      command: 'open',
      args: ['http://localhost:3000'],
    });
  });

  it('resolves data directory next to executable when packaged', () => {
    const execPath = path.join('/opt', 'printer-app', 'PrinterStatsNoti.exe');
    expect(resolveDataDir(true, execPath, '/some/cwd')).toBe(
      path.join('/opt', 'printer-app', 'data')
    );
    expect(resolveDataDir(false, execPath, '/some/cwd')).toBe(
      path.join('/some/cwd', 'data')
    );
  });

  it('resolves public directory inside bundle snapshot when packaged', () => {
    expect(resolvePublicDir(true, '/snapshot/app', '/some/cwd')).toBe(
      path.join('/snapshot/app', 'public')
    );
    expect(resolvePublicDir(false, '/snapshot/app', '/some/cwd')).toBe(
      path.join('/some/cwd', 'public')
    );
  });

  it('selects correct browser launch command per OS', () => {
    expect(getBrowserOpenCommand('win32', 'http://localhost:3000')).toEqual({
      command: 'cmd',
      args: ['/c', 'start', '', 'http://localhost:3000'],
    });
    expect(getBrowserOpenCommand('darwin', 'http://localhost:3000')).toEqual({
      command: 'open',
      args: ['http://localhost:3000'],
    });
    expect(getBrowserOpenCommand('linux', 'http://localhost:3000')).toEqual({
      command: 'xdg-open',
      args: ['http://localhost:3000'],
    });
  });
});
