import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { patchPeSubsystemToGui } from '../dist/utils/pePatch.js';

const rootDir = process.cwd();
const pkgWorkDir = path.join(rootDir, 'dist-pkg');
const releaseDir = path.join(rootDir, 'release');
const mode = process.argv[2] || 'all';

const targetMap = {
  win: ['node22-win-x64'],
  all: ['node22-win-x64', 'node22-macos-arm64', 'node22-linux-x64'],
};

const targets = targetMap[mode] || targetMap.all;

async function main() {
  console.log('1. Preparing dist-pkg and release directories...');
  await fs.rm(pkgWorkDir, { recursive: true, force: true });
  await fs.mkdir(pkgWorkDir, { recursive: true });
  await fs.mkdir(releaseDir, { recursive: true });

  console.log('2. Bundling TypeScript application with esbuild...');
  await esbuild.build({
    entryPoints: [path.join(rootDir, 'src', 'index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outfile: path.join(pkgWorkDir, 'bundle.cjs'),
    sourcemap: false,
    minify: false, // Keep readable JS inside bundle to reduce AV heuristic false positives
  });

  console.log('3. Copying public/ web dashboard assets...');
  await fs.cp(path.join(rootDir, 'public'), path.join(pkgWorkDir, 'public'), {
    recursive: true,
  });

  await fs.writeFile(
    path.join(pkgWorkDir, 'package.json'),
    JSON.stringify(
      {
        name: 'printer-stats-noti',
        version: '1.0.0',
        description: 'LAN Printer SNMP Monitor and LINE Notification Service',
        author: 'PrinterStatsNoti',
        license: 'MIT',
        bin: 'bundle.cjs',
        pkg: {
          assets: ['public/**/*'],
        },
      },
      null,
      2
    )
  );

  console.log(`4. Packaging standalone binaries for: ${targets.join(', ')}...`);
  const pkgBin = path.join(rootDir, 'node_modules', '.bin', 'pkg');
  for (const target of targets) {
    const outName = target.includes('win')
      ? 'PrinterStatsNoti-win-x64.exe'
      : target.includes('macos')
        ? 'PrinterStatsNoti-macos-arm64'
        : 'PrinterStatsNoti-linux-x64';
    const outPath = path.join(releaseDir, outName);

    // Avoid --compress (UPX/GZip) to minimize Antivirus false-positive triggers
    execFileSync(pkgBin, [pkgWorkDir, '--targets', target, '--output', outPath], {
      stdio: 'inherit',
    });

    if (target.includes('win')) {
      const exeBuf = await fs.readFile(outPath);
      if (patchPeSubsystemToGui(exeBuf)) {
        await fs.writeFile(outPath, exeBuf);
        console.log('   Patched PE subsystem -> WINDOWS_GUI (no console window)');
      }
    }
  }

  console.log('5. Generating SHA256SUMS.txt for binary verification...');
  const files = await fs.readdir(releaseDir);
  const checksumLines = [];
  for (const file of files.sort()) {
    if (file === 'SHA256SUMS.txt') continue;
    const fullPath = path.join(releaseDir, file);
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) continue;
    const buf = await fs.readFile(fullPath);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    checksumLines.push(`${hash}  ${file}`);
  }
  await fs.writeFile(path.join(releaseDir, 'SHA256SUMS.txt'), checksumLines.join('\n') + '\n');

  console.log('✅ Standalone packaging complete! Output in release/:');
  for (const line of checksumLines) {
    console.log('  ', line);
  }
}

main().catch((err) => {
  console.error('Packaging failed:', err);
  process.exit(1);
});
