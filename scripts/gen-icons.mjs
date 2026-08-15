import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public");

const crcTable = new Int32Array(256).fill(0).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(size, pixelAt) {
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 3);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixelAt(x, y);
      const o = row + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const BG = [11, 18, 20];
const LINE = [245, 158, 66];

const SEGS = [
  [1, 10, 4.5, 10],
  [4.5, 10, 6.5, 4.5],
  [6.5, 4.5, 9, 15.5],
  [9, 15.5, 11, 8.5],
  [11, 8.5, 12.2, 11.3],
  [12.2, 11.3, 13.2, 10],
  [13.2, 10, 19, 10],
];

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function draw(size) {
  const margin = size * 0.16;
  const scale = (size - margin * 2) / 20;
  const map = (v) => margin + v * scale;
  const lineW = size * 0.06;
  return encodePNG(size, (x, y) => {
    const px = x + 0.5;
    const py = y + 0.5;
    for (const [ax, ay, bx, by] of SEGS) {
      if (distToSeg(px, py, map(ax), map(ay), map(bx), map(by)) < lineW) return LINE;
    }
    return BG;
  });
}

mkdirSync(outDir, { recursive: true });
for (const s of [512, 192, 180]) {
  const p = join(outDir, `icon-${s}.png`);
  writeFileSync(p, draw(s));
  console.log(`✓ ${p} (${(draw(s).length / 1024).toFixed(1)} kB)`);
}
