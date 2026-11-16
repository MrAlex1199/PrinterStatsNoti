/**
 * Patches a Windows PE executable buffer in-place from
 * IMAGE_SUBSYSTEM_WINDOWS_CUI (3) to IMAGE_SUBSYSTEM_WINDOWS_GUI (2)
 * without altering file size or shifting trailing pkg payload offsets.
 */
export function patchPeSubsystemToGui(buf: Buffer): boolean {
  if (buf.length < 0x40 || buf.toString('ascii', 0, 2) !== 'MZ') {
    throw new Error('Not a valid MZ/PE executable');
  }

  const peOffset = buf.readUInt32LE(0x3c);
  if (peOffset + 24 + 70 > buf.length || buf.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') {
    throw new Error('Invalid PE header offset');
  }

  const optionalHeaderOffset = peOffset + 24;
  const magic = buf.readUInt16LE(optionalHeaderOffset);
  if (magic !== 0x010b && magic !== 0x020b) {
    throw new Error(`Unsupported PE OptionalHeader magic: 0x${magic.toString(16)}`);
  }

  const subsystemOffset = optionalHeaderOffset + 68;
  const current = buf.readUInt16LE(subsystemOffset);
  if (current === 2) {
    return false;
  }

  buf.writeUInt16LE(2, subsystemOffset);
  return true;
}
