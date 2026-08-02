/**
 * Generates the extension icons from code.
 *
 *   pnpm run icons
 *
 * The mark is the Plimsoll line itself: a circle bisected by a horizontal bar, the
 * load line painted on a ship's hull to show how heavily it is loaded. It is the one
 * shape the product is named after, it reads at 16px, and it is not a generic chart
 * glyph.
 *
 * Drawn and encoded here rather than pulled from a design tool so the icons are
 * reproducible, reviewable as source, and add no image dependency to a project whose
 * whole point is shipping nothing it cannot account for.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(REPO_ROOT, 'apps', 'extension', 'public', 'icon');

const SIZES = [16, 32, 48, 128];

/** Brass. Legible on both a light and a dark browser toolbar. */
const INK: [number, number, number] = [0xc8, 0x8a, 0x2e];

/** Geometry in normalised 0..1 space, so every size is the same drawing. */
const RING_RADIUS = 0.3;
const STROKE = 0.085;
const BAR_HALF_WIDTH = 0.44;

/** 4x4 supersampling gives clean edges without a rasteriser dependency. */
const SS = 4;

function covered(x: number, y: number): boolean {
  const dx = x - 0.5;
  const dy = y - 0.5;
  const half = STROKE / 2;

  // The ring.
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (Math.abs(dist - RING_RADIUS) <= half) return true;

  // The load line running through it and out past the hull on both sides.
  if (Math.abs(dy) <= half && Math.abs(dx) <= BAR_HALF_WIDTH) return true;

  return false;
}

function rasterise(size: number): Buffer {
  const rgba = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          if (covered(x, y)) hits++;
        }
      }
      const alpha = Math.round((hits / (SS * SS)) * 255);
      const offset = (py * size + px) * 4;
      rgba[offset] = INK[0];
      rgba[offset + 1] = INK[1];
      rgba[offset + 2] = INK[2];
      rgba[offset + 3] = alpha;
    }
  }

  return rgba;
}

// --- minimal PNG encoder ---------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

function encodePng(size: number, rgba: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  // One filter byte (0 = None) per scanline, then the row's pixels.
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const size of SIZES) {
    const png = encodePng(size, rasterise(size));
    const file = join(OUT_DIR, `${size}.png`);
    writeFileSync(file, png);
    console.log(`✔ icon/${size}.png (${png.length} bytes)`);
  }
  console.log(`\nWrote ${SIZES.length} icons to apps/extension/public/icon/.`);
}

main();
