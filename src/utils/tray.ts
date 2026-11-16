import { ChildProcess, spawn } from 'node:child_process';
import readline from 'node:readline';

export interface SystemTrayOptions {
  url: string;
  port: number;
  onOpen: () => void;
  onPoll?: () => void;
  onExit: () => void;
  execPath?: string;
}

export interface SystemTrayController {
  stop: () => void;
}

export function startSystemTray(
  options: SystemTrayOptions,
  platform: NodeJS.Platform = process.platform
): SystemTrayController | null {
  if (platform !== 'win32' || process.env.NODE_ENV === 'test' || process.env.NO_TRAY === '1') {
    return null;
  }

  const exePath = (options.execPath || process.execPath).replace(/"/g, '`"');
  const port = options.port;

  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$notify = New-Object System.Windows.Forms.NotifyIcon
try {
  $path = "${exePath}"
  if (Test-Path $path) {
    $notify.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon($path)
  } else {
    $notify.Icon = [System.Drawing.SystemIcons]::Application
  }
} catch {
  $notify.Icon = [System.Drawing.SystemIcons]::Application
}

$notify.Text = "PrinterStatsNoti — รันเบื้องหลัง"
$notify.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$itemHeader = New-Object System.Windows.Forms.ToolStripMenuItem("🖨️ PrinterStatsNoti (port ${port})")
$itemHeader.Enabled = $false
$menu.Items.Add($itemHeader) | Out-Null

$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

$itemOpen = New-Object System.Windows.Forms.ToolStripMenuItem("เปิดหน้าต่างโปรแกรม (Open App)")
$itemOpen.Font = New-Object System.Drawing.Font($itemOpen.Font, [System.Drawing.FontStyle]::Bold)
$itemOpen.add_Click({
  [Console]::WriteLine("ACTION_OPEN")
})
$menu.Items.Add($itemOpen) | Out-Null

$itemPoll = New-Object System.Windows.Forms.ToolStripMenuItem("เช็คสถานะเครื่องพิมพ์ทันที (Poll Now)")
$itemPoll.add_Click({
  [Console]::WriteLine("ACTION_POLL")
})
$menu.Items.Add($itemPoll) | Out-Null

$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

$itemExit = New-Object System.Windows.Forms.ToolStripMenuItem("ปิดโปรแกรมถาวร (Exit)")
$itemExit.add_Click({
  [Console]::WriteLine("ACTION_EXIT")
  $notify.Visible = $false
  $notify.Dispose()
  [System.Windows.Forms.Application]::Exit()
})
$menu.Items.Add($itemExit) | Out-Null

$notify.ContextMenuStrip = $menu

$notify.add_DoubleClick({
  [Console]::WriteLine("ACTION_OPEN")
})
$notify.add_MouseClick({
  param($sender, $e)
  if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
    [Console]::WriteLine("ACTION_OPEN")
  }
})

try {
  [System.Windows.Forms.Application]::Run()
} finally {
  $notify.Visible = $false
  $notify.Dispose()
}
`;

  let child: ChildProcess | null = null;
  try {
    child = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', '-'], {
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
    });

    if (child.stdin) {
      child.stdin.write(script);
      child.stdin.end();
    }

    if (child.stdout) {
      const rl = readline.createInterface({ input: child.stdout });
      rl.on('line', (line) => {
        const action = line.trim();
        if (action === 'ACTION_OPEN') {
          options.onOpen();
        } else if (action === 'ACTION_POLL') {
          options.onPoll?.();
        } else if (action === 'ACTION_EXIT') {
          options.onExit();
        }
      });
    }

    child.on('error', (err) => {
      console.warn('System tray failed to start:', err.message);
    });
  } catch (err) {
    console.warn('Could not launch system tray process:', err);
    return null;
  }

  return {
    stop: () => {
      if (child && !child.killed) {
        try {
          child.kill();
        } catch {
          // ignore kill errors
        }
        child = null;
      }
    },
  };
}
