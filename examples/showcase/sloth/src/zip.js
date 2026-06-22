// Minimal ZIP builder for the browser, no dependencies. Produces a "stored"
// (uncompressed) zip, which is fine for a tiny starter project. Used by the
// page to build a downloadable starter-project structure.

// CRC32 with a lazily-built table.
let CRC_TABLE = null
function crcTable () {
  if (CRC_TABLE) return CRC_TABLE
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c >>> 0
  }
  CRC_TABLE = t
  return t
}

function crc32 (bytes) {
  const t = crcTable()
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const enc = new TextEncoder()

// entries: array of { name, data } where data is a string or Uint8Array.
// A name ending in '/' is a directory entry (empty data).
export function buildZip (entries) {
  const files = entries.map((e) => {
    const data = typeof e.data === 'string' ? enc.encode(e.data) : (e.data || new Uint8Array(0))
    return { name: e.name, nameBytes: enc.encode(e.name), data, crc: crc32(data) }
  })

  const chunks = []
  let offset = 0
  const central = []

  function u16 (n) { return new Uint8Array([n & 0xff, (n >>> 8) & 0xff]) }
  function u32 (n) { return new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]) }

  for (const f of files) {
    const localHeader = concat([
      u32(0x04034b50), // local file header signature
      u16(20), u16(0), u16(0), // version, flags, method (0 = store)
      u16(0), u16(0), // mod time, date
      u32(f.crc),
      u32(f.data.length), u32(f.data.length), // compressed, uncompressed
      u16(f.nameBytes.length), u16(0) // name len, extra len
    ])
    chunks.push(localHeader, f.nameBytes, f.data)
    const localOffset = offset
    offset += localHeader.length + f.nameBytes.length + f.data.length

    central.push(concat([
      u32(0x02014b50), // central directory header signature
      u16(20), u16(20), u16(0), u16(0), // versions, flags, method
      u16(0), u16(0), // time, date
      u32(f.crc),
      u32(f.data.length), u32(f.data.length),
      u16(f.nameBytes.length), u16(0), u16(0), // name, extra, comment len
      u16(0), u16(0), // disk start, internal attrs
      u32(0), // external attrs
      u32(localOffset),
      f.nameBytes
    ]))
  }

  const centralStart = offset
  let centralSize = 0
  for (const c of central) { chunks.push(c); centralSize += c.length }

  const end = concat([
    u32(0x06054b50), // end of central directory
    u16(0), u16(0),
    u16(files.length), u16(files.length),
    u32(centralSize), u32(centralStart),
    u16(0)
  ])
  chunks.push(end)

  return new Blob(chunks, { type: 'application/zip' })
}

function concat (arrs) {
  let len = 0
  for (const a of arrs) len += a.length
  const out = new Uint8Array(len)
  let o = 0
  for (const a of arrs) { out.set(a, o); o += a.length }
  return out
}
