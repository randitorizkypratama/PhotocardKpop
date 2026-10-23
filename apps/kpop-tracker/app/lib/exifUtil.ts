// Minimal EXIF orientation reader (only the Orientation tag 0x0112)
export async function getOrientation(file: Blob): Promise<number> {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  // JPEG marker 0xFFE1 (APP1) contains EXIF
  let offset = 2;
  while (offset + 4 < view.byteLength) {
    const marker = view.getUint16(offset);
    const size = view.getUint16(offset + 2);
    if (marker === 0xFFE1) { // APP1
      const exifHeader = offset + 4;
      const exifStr = String.fromCharCode(
        view.getUint8(exifHeader),
        view.getUint8(exifHeader + 1),
        view.getUint8(exifHeader + 2),
        view.getUint8(exifHeader + 3),
      );
      if (exifStr !== 'Exif') {
        offset += 2 + size;
        continue;
      }
      const tiffOffset = exifHeader + 6;
      const little = view.getUint16(tiffOffset) === 0x4949;
      const ifdOffset = view.getUint32(tiffOffset + 4, little);
      const entries = view.getUint16(tiffOffset + ifdOffset, little);
      for (let i = 0; i < entries; i++) {
        const entryOffset = tiffOffset + ifdOffset + 2 + i * 12;
        const tag = view.getUint16(entryOffset, little);
        if (tag === 0x0112) { // Orientation tag
          const value = view.getUint16(entryOffset + 8, little);
          return value;
        }
      }
    }
    offset += 2 + size;
  }
  return 1; // default orientation (no rotation)
}
