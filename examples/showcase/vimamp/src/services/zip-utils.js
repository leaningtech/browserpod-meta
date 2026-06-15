const ZIP_SIGNATURES = {
  localFileHeader: 0x04034b50,
  centralDirectoryFileHeader: 0x02014b50,
  endOfCentralDirectory: 0x06054b50,
};

const UTF8_FLAG = 0x0800;
const STORE_COMPRESSION = 0;
const VERSION_NEEDED = 20;

function toUint8Array(data) {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  }
  if (typeof data === "string") {
    return new TextEncoder().encode(data);
  }
  return new Uint8Array(0);
}

function appendUint16(view, offset, value) {
  view.setUint16(offset, value & 0xffff, true);
  return offset + 2;
}

function appendUint32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
  return offset + 4;
}

function toDosDateTime(date = new Date()) {
  const safeDate = new Date(date);
  const year = Math.min(2107, Math.max(1980, safeDate.getFullYear()));
  const month = safeDate.getMonth() + 1;
  const day = safeDate.getDate();
  const hours = safeDate.getHours();
  const minutes = safeDate.getMinutes();
  const seconds = Math.floor(safeDate.getSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

let crcTable = null;

function getCrcTable() {
  if (crcTable) {
    return crcTable;
  }

  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

function crc32(bytes) {
  const table = getCrcTable();
  let crc = 0xffffffff;

  for (let index = 0; index < bytes.length; index += 1) {
    crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function normalizeZipPath(pathValue, { directory = false } = {}) {
  const normalized = String(pathValue || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .trim();
  if (!normalized) {
    return directory ? "/" : "";
  }
  if (directory) {
    return normalized.endsWith("/") ? normalized : `${normalized}/`;
  }
  return normalized.replace(/\/+$/, "");
}

function concatChunks(chunks, totalLength) {
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function createLocalHeader({
  fileNameBytes,
  crc,
  compressedSize,
  uncompressedSize,
  dosTime,
  dosDate,
}) {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);
  let offset = 0;
  offset = appendUint32(view, offset, ZIP_SIGNATURES.localFileHeader);
  offset = appendUint16(view, offset, VERSION_NEEDED);
  offset = appendUint16(view, offset, UTF8_FLAG);
  offset = appendUint16(view, offset, STORE_COMPRESSION);
  offset = appendUint16(view, offset, dosTime);
  offset = appendUint16(view, offset, dosDate);
  offset = appendUint32(view, offset, crc);
  offset = appendUint32(view, offset, compressedSize);
  offset = appendUint32(view, offset, uncompressedSize);
  offset = appendUint16(view, offset, fileNameBytes.length);
  appendUint16(view, offset, 0);
  return header;
}

function createCentralDirectoryHeader({
  fileNameBytes,
  crc,
  compressedSize,
  uncompressedSize,
  dosTime,
  dosDate,
  localHeaderOffset,
  isDirectory,
}) {
  const header = new Uint8Array(46);
  const view = new DataView(header.buffer);
  let offset = 0;
  offset = appendUint32(view, offset, ZIP_SIGNATURES.centralDirectoryFileHeader);
  offset = appendUint16(view, offset, VERSION_NEEDED);
  offset = appendUint16(view, offset, VERSION_NEEDED);
  offset = appendUint16(view, offset, UTF8_FLAG);
  offset = appendUint16(view, offset, STORE_COMPRESSION);
  offset = appendUint16(view, offset, dosTime);
  offset = appendUint16(view, offset, dosDate);
  offset = appendUint32(view, offset, crc);
  offset = appendUint32(view, offset, compressedSize);
  offset = appendUint32(view, offset, uncompressedSize);
  offset = appendUint16(view, offset, fileNameBytes.length);
  offset = appendUint16(view, offset, 0);
  offset = appendUint16(view, offset, 0);
  offset = appendUint16(view, offset, 0);
  offset = appendUint16(view, offset, 0);
  offset = appendUint32(view, offset, isDirectory ? 0x10 : 0);
  appendUint32(view, offset, localHeaderOffset);
  return header;
}

function createEndOfCentralDirectory({
  totalEntries,
  centralDirectorySize,
  centralDirectoryOffset,
}) {
  const header = new Uint8Array(22);
  const view = new DataView(header.buffer);
  let offset = 0;
  offset = appendUint32(view, offset, ZIP_SIGNATURES.endOfCentralDirectory);
  offset = appendUint16(view, offset, 0);
  offset = appendUint16(view, offset, 0);
  offset = appendUint16(view, offset, totalEntries);
  offset = appendUint16(view, offset, totalEntries);
  offset = appendUint32(view, offset, centralDirectorySize);
  offset = appendUint32(view, offset, centralDirectoryOffset);
  appendUint16(view, offset, 0);
  return header;
}

export function buildZipArchive(entries = []) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let localSize = 0;
  let centralSize = 0;

  for (const rawEntry of entries) {
    const isDirectory = Boolean(rawEntry?.directory);
    const zipPath = normalizeZipPath(rawEntry?.path, { directory: isDirectory });
    if (!zipPath) {
      continue;
    }

    const fileNameBytes = encoder.encode(zipPath);
    const fileData = isDirectory ? new Uint8Array(0) : toUint8Array(rawEntry?.data);
    const checksum = crc32(fileData);
    const compressedSize = fileData.length;
    const uncompressedSize = fileData.length;
    const { dosTime, dosDate } = toDosDateTime(rawEntry?.modifiedAt);

    const localHeaderOffset = localSize;
    const localHeader = createLocalHeader({
      fileNameBytes,
      crc: checksum,
      compressedSize,
      uncompressedSize,
      dosTime,
      dosDate,
    });

    localParts.push(localHeader, fileNameBytes, fileData);
    localSize += localHeader.length + fileNameBytes.length + fileData.length;

    const centralHeader = createCentralDirectoryHeader({
      fileNameBytes,
      crc: checksum,
      compressedSize,
      uncompressedSize,
      dosTime,
      dosDate,
      localHeaderOffset,
      isDirectory,
    });

    centralParts.push(centralHeader, fileNameBytes);
    centralSize += centralHeader.length + fileNameBytes.length;
  }

  const endHeader = createEndOfCentralDirectory({
    totalEntries: centralParts.length / 2,
    centralDirectorySize: centralSize,
    centralDirectoryOffset: localSize,
  });

  const totalLength = localSize + centralSize + endHeader.length;
  const allChunks = [...localParts, ...centralParts, endHeader];
  return concatChunks(allChunks, totalLength);
}

export function createZipBlob(entries = []) {
  const archiveBytes = buildZipArchive(entries);
  return new Blob([archiveBytes], { type: "application/zip" });
}
