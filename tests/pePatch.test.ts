import { describe, it, expect } from 'vitest';
import { patchPeSubsystemToGui } from '../src/utils/pePatch.js';

describe('Windows PE Subsystem Patcher', () => {
  it('patches IMAGE_SUBSYSTEM_WINDOWS_CUI (3) to WINDOWS_GUI (2) in-place', () => {
    // Minimal synthetic PE header: MZ at 0, PE offset at 0x3c -> 0x80, PE\0\0 at 0x80, OptionalHeader at 0x98, Subsystem at 0x98 + 68 = 0xdc
    const buf = Buffer.alloc(256, 0);
    buf.write('MZ', 0, 'ascii');
    buf.writeUInt32LE(0x80, 0x3c);
    buf.write('PE\0\0', 0x80, 'ascii');
    buf.writeUInt16LE(0x020b, 0x98); // PE32+ magic
    buf.writeUInt16LE(3, 0x98 + 68); // Subsystem = CUI (3)

    const patched = patchPeSubsystemToGui(buf);
    expect(patched).toBe(true);
    expect(buf.readUInt16LE(0x98 + 68)).toBe(2); // Subsystem = GUI (2)
  });

  it('throws on non-PE buffers', () => {
    const buf = Buffer.from('not a pe file');
    expect(() => patchPeSubsystemToGui(buf)).toThrow();
  });
});
