const fs = require('fs');
const sharp = require('sharp');
const { PNG } = require('pngjs');

async function main() {
  const src = process.argv[2];
  const dest = process.argv[3];
  if (!src || !dest) {
    console.error('Usage: node remove_logo_bg.cjs <src> <dest>');
    process.exit(1);
  }

  const pngBuf = await sharp(src).ensureAlpha().png().toBuffer();
  const png = PNG.sync.read(pngBuf);
const { width, height, data } = png;

function idx(x, y) {
  return (y * width + x) * 4;
}

function isBg(i) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const a = data[i + 3];
  if (a === 0) return true;
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  return min >= 238 && max - min <= 18;
}

const seen = new Uint8Array(width * height);
const queue = [];
function push(x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const p = y * width + x;
  if (seen[p]) return;
  seen[p] = 1;
  queue.push(p);
}

for (let x = 0; x < width; x++) {
  push(x, 0);
  push(x, height - 1);
}
for (let y = 0; y < height; y++) {
  push(0, y);
  push(width - 1, y);
}

let qi = 0;
while (qi < queue.length) {
  const p = queue[qi++];
  const i = p * 4;
  if (!isBg(i)) continue;
  data[i + 3] = 0;
  const x = p % width;
  const y = (p / width) | 0;
  push(x + 1, y);
  push(x - 1, y);
  push(x, y + 1);
  push(x, y - 1);
}

let minX = width;
let minY = height;
let maxX = -1;
let maxY = -1;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (data[idx(x, y) + 3] > 8) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
}

const pad = 8;
minX = Math.max(0, minX - pad);
minY = Math.max(0, minY - pad);
maxX = Math.min(width - 1, maxX + pad);
maxY = Math.min(height - 1, maxY + pad);
const cw = maxX - minX + 1;
const ch = maxY - minY + 1;
const out = new PNG({ width: cw, height: ch });
for (let y = 0; y < ch; y++) {
  for (let x = 0; x < cw; x++) {
    const si = idx(minX + x, minY + y);
    const di = (y * cw + x) * 4;
    out.data[di] = data[si];
    out.data[di + 1] = data[si + 1];
    out.data[di + 2] = data[si + 2];
    out.data[di + 3] = data[si + 3];
  }
}

  fs.writeFileSync(dest, PNG.sync.write(out));
  console.log(`Wrote ${dest} (${cw}x${ch})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
