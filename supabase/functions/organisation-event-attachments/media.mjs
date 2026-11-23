const wordMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
export const attachmentKinds = {
  poster: [...imageTypes, 'application/pdf'],
  'organiser-kit': ['application/pdf', 'application/msword', wordMime],
  gallery: imageTypes,
  sponsor: imageTypes,
};

const types = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'application/pdf': 'pdf', 'application/msword': 'doc', [wordMime]: 'docx',
};

export const maximumAttachmentBytes = 10 * 1024 * 1024;
const has = (bytes, offset, signature) => signature.every((value, index) => bytes[offset + index] === value);
const textAt = (bytes, offset, value) => {
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) return false;
  }
  return true;
};

function isWordArchive(bytes, view) {
  const required = new Set(['[Content_Types].xml', 'word/document.xml']);
  for (let end = bytes.length - 22; end >= Math.max(0, bytes.length - 65557); end -= 1) {
    if (view.getUint32(end, true) !== 0x06054b50) continue;
    if (view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0
      || end + 22 + view.getUint16(end + 20, true) !== bytes.length) return false;
    const count = view.getUint16(end + 10, true);
    let position = view.getUint32(end + 16, true);
    if (position + view.getUint32(end + 12, true) !== end) return false;
    for (let index = 0; index < count; index += 1) {
      if (position + 46 > end || view.getUint32(position, true) !== 0x02014b50) return false;
      const length = view.getUint16(position + 28, true);
      const next = position + 46 + length + view.getUint16(position + 30, true) + view.getUint16(position + 32, true);
      if (next > end || (view.getUint16(position + 8, true) & 1)) return false;
      const name = new TextDecoder().decode(bytes.subarray(position + 46, position + 46 + length));
      if (name.toLowerCase().includes('vbaproject')) return false;
      if (required.has(name)) {
        const local = view.getUint32(position + 42, true);
        if (local + 30 + length > position || view.getUint32(local, true) !== 0x04034b50
          || view.getUint16(local + 26, true) !== length || !textAt(bytes, local + 30, name)
          || !view.getUint32(position + 24, true)) return false;
        required.delete(name);
      }
      position = next;
    }
    return position === end && required.size === 0;
  }
  return false;
}

function isLegacyWordDocument(bytes, view) {
  if (bytes.length < 1024 || view.getUint16(28, true) !== 0xfffe) return false;
  const shift = view.getUint16(30, true);
  if (shift !== 9 && shift !== 12) return false;
  const sectorSize = 2 ** shift;
  const sectorCount = Math.floor(bytes.length / sectorSize) - 1;
  const seen = new Set();
  let sector = view.getUint32(48, true);
  while (sector < sectorCount && !seen.has(sector)) {
    seen.add(sector);
    const start = (sector + 1) * sectorSize;
    for (let entry = start; entry < start + sectorSize; entry += 128) {
      if (bytes[entry + 66] === 2 && view.getUint16(entry + 64, true) === 26
        && has(bytes, entry, [87,0,111,0,114,0,100,0,68,0,111,0,99,0,117,0,109,0,101,0,110,0,116,0,0,0])) return true;
    }
    const fatIndex = Math.floor(sector / (sectorSize / 4));
    if (fatIndex >= 109) return false;
    const fatSector = view.getUint32(76 + fatIndex * 4, true);
    if (fatSector >= sectorCount) return false;
    sector = view.getUint32((fatSector + 1) * sectorSize + (sector % (sectorSize / 4)) * 4, true);
  }
  return false;
}

function sniffType(bytes) {
  if (bytes.length < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (has(bytes, 0, [255,216,255]) && has(bytes, bytes.length - 2, [255,217])) return 'image/jpeg';
  if (bytes.length >= 45 && has(bytes, 0, [137,80,78,71,13,10,26,10]) && textAt(bytes, 12, 'IHDR')
    && textAt(bytes, bytes.length - 8, 'IEND')) return 'image/png';
  if (bytes.length >= 20 && textAt(bytes, 0, 'RIFF') && textAt(bytes, 8, 'WEBPVP8')
    && [32, 76, 88].includes(bytes[15]) && view.getUint32(4, true) === bytes.length - 8) return 'image/webp';
  if (textAt(bytes, 0, '%PDF-') && (bytes[5] === 49 || bytes[5] === 50) && bytes[6] === 46
    && bytes[7] >= 48 && bytes[7] <= 57 && new TextDecoder().decode(bytes.subarray(-1024)).trimEnd().endsWith('%%EOF')) return 'application/pdf';
  if (has(bytes, 0, [208,207,17,224,161,177,26,225]) && isLegacyWordDocument(bytes, view)) return 'application/msword';
  if (has(bytes, 0, [80,75,3,4]) && isWordArchive(bytes, view)) return wordMime;
  return null;
}

export function detectAttachment(bytes, kind) {
  if (bytes.length > maximumAttachmentBytes) return null;
  const contentType = sniffType(bytes);
  return Object.hasOwn(attachmentKinds, kind) && attachmentKinds[kind].includes(contentType)
    ? { contentType, extension: types[contentType] }
    : null;
}
