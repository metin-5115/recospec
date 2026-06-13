// One-shot generator for vscode-extension/icons/recospec.png.
// 128×128 PNG, indigo→pink vertical gradient, geometric white "P".
// No external deps — uses node:zlib for the IDAT chunk only.
//
// Re-run if the icon ever needs to change; otherwise this script can be deleted.

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { deflateSync } from 'node:zlib'

const W = 128
const H = 128

// CRC-32 table for PNG chunk integrity bytes.
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const t = Buffer.from(type, 'ascii')
  const crcVal = Buffer.alloc(4)
  crcVal.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([len, t, data, crcVal])
}

// Indigo (#6366F1) → Pink (#EC4899) vertical gradient.
const startRgb = [99, 102, 241]
const endRgb = [236, 72, 153]

// White "P": chunky vertical bar, top crossbar, right curve, bowl crossbar.
// Rectangle hit-tests give us a blocky-but-readable glyph at 128×128.
const P_RECTS = [
  // vertical stem
  { x0: 36, y0: 24, x1: 56, y1: 108 },
  // top crossbar
  { x0: 36, y0: 24, x1: 92, y1: 44 },
  // right side of bowl
  { x0: 76, y0: 24, x1: 96, y1: 72 },
  // bowl-bottom crossbar
  { x0: 36, y0: 52, x1: 92, y1: 72 },
]

function isPPixel(x, y) {
  for (const r of P_RECTS) {
    if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) return true
  }
  return false
}

// Build raw scanlines: each row starts with a 0x00 filter byte, then RGB triples.
const raw = Buffer.alloc(H * (1 + W * 3))
let off = 0
for (let y = 0; y < H; y++) {
  raw[off++] = 0
  const t = y / (H - 1)
  const gr = Math.round(startRgb[0] * (1 - t) + endRgb[0] * t)
  const gg = Math.round(startRgb[1] * (1 - t) + endRgb[1] * t)
  const gb = Math.round(startRgb[2] * (1 - t) + endRgb[2] * t)
  for (let x = 0; x < W; x++) {
    if (isPPixel(x, y)) {
      raw[off++] = 255
      raw[off++] = 255
      raw[off++] = 255
    } else {
      raw[off++] = gr
      raw[off++] = gg
      raw[off++] = gb
    }
  }
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 2 // RGB
ihdr[10] = 0
ihdr[11] = 0
ihdr[12] = 0

const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const png = Buffer.concat([
  signature,
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
])

const outPath = resolve(process.cwd(), 'vscode-extension/icons/recospec.png')
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, png)
// eslint-disable-next-line no-console
console.log(`wrote ${outPath} (${png.length} bytes)`)
