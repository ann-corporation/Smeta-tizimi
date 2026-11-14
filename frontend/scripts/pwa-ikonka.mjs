/**
 * PWA ikonkalari generatori: public/favicon.svg dagi belgini (qobiq + S harfi + chiziq) PNG ga chizadi.
 * Tashqi paket kerak emas (faqat node:zlib). Ishga tushirish: `node scripts/pwa-ikonka.mjs`.
 * Chiqish: public/ikonlar/{icon-192,icon-512,icon-maskable-512,apple-touch-icon}.png
 *
 * Shakllar favicon.svg bilan bir xil; maskable variantda fon to'liq (kvadrat), belgi esa xavfsiz zonaga (60%) sig'diriladi.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHIQISH = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'ikonlar');

/** Minimal SVG path (M,m,c,s,h,H,v,V,L,l,Z) -> ko'pburchak (egri chiziq bo'laklarga bo'linadi). */
function yolPoligon(d) {
  const tok = d.match(/[a-zA-Z]|-?\d*\.?\d+/g);
  let i = 0; let x = 0; let y = 0; let bx = 0; let by = 0; let oxirgiEgri = null; let kom = '';
  const nuqta = []; const son = () => parseFloat(tok[i++]);
  const kub = (x0, y0, x1, y1, x2, y2, x3, y3) => {
    for (let k = 1; k <= 12; k++) {
      const u = k / 12; const v = 1 - u;
      nuqta.push([v ** 3 * x0 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u ** 3 * x3, v ** 3 * y0 + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u ** 3 * y3]);
    }
  };
  while (i < tok.length) {
    if (/[a-zA-Z]/.test(tok[i])) kom = tok[i++];
    switch (kom) {
      case 'M': x = son(); y = son(); bx = x; by = y; nuqta.push([x, y]); kom = 'L'; oxirgiEgri = null; break;
      case 'L': x = son(); y = son(); nuqta.push([x, y]); oxirgiEgri = null; break;
      case 'H': x = son(); nuqta.push([x, y]); oxirgiEgri = null; break;
      case 'h': x += son(); nuqta.push([x, y]); oxirgiEgri = null; break;
      case 'V': y = son(); nuqta.push([x, y]); oxirgiEgri = null; break;
      case 'v': y += son(); nuqta.push([x, y]); oxirgiEgri = null; break;
      case 'c': { const a = [x + son(), y + son(), x + son(), y + son(), x + son(), y + son()]; kub(x, y, a[0], a[1], a[2], a[3], a[4], a[5]); oxirgiEgri = [a[2], a[3]]; x = a[4]; y = a[5]; break; }
      case 's': { const r = oxirgiEgri ? [2 * x - oxirgiEgri[0], 2 * y - oxirgiEgri[1]] : [x, y]; const a = [x + son(), y + son(), x + son(), y + son()]; kub(x, y, r[0], r[1], a[0], a[1], a[2], a[3]); oxirgiEgri = [a[0], a[1]]; x = a[2]; y = a[3]; break; }
      case 'Z': case 'z': x = bx; y = by; break;
      default: throw new Error(`Noma'lum buyruq: ${kom}`);
    }
  }
  return nuqta;
}

const S_HARF = yolPoligon('M18 20c0-4 4-7 9-7h18v8H28c-2 0-3 1-3 2s1 2 3 2h9c7 0 12 4 12 10s-5 11-13 11H18v-8h18c3 0 5-1 5-3s-2-3-5-3h-9c-6 0-9-4-9-10Z');
const CHIZIQ = [[18, 49], [46, 49], [46, 53], [18, 53]];

function ichida(poly, px, py) {
  let ich = false;
  for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
    const [xa, ya] = poly[a]; const [xb, yb] = poly[b];
    if ((ya > py) !== (yb > py) && px < ((xb - xa) * (py - ya)) / (yb - ya) + xa) ich = !ich;
  }
  return ich;
}

function yumaloqKvadrat(px, py, r) { // 0..64 qobiq, burchak radiusi r
  const cx = Math.min(Math.max(px, r), 64 - r); const cy = Math.min(Math.max(py, r), 64 - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

const hex = (s) => [1, 3, 5].map((k) => parseInt(s.slice(k, k + 2), 16));
const FON = hex('#0b1220'); const KOK = hex('#4f8cff'); const YASHIL = hex('#2dd4a8');

/** @param {number} olcham piksel; @param {boolean} maskable to'liq fon + kichraytirilgan belgi */
function chiz(olcham, maskable) {
  const SS = 3; const buf = Buffer.alloc(olcham * olcham * 4);
  const masshtab = maskable ? 0.6 : 1; const siljish = (64 - 64 * masshtab) / 2;
  for (let py = 0; py < olcham; py++) for (let px = 0; px < olcham; px++) {
    let r = 0; let g = 0; let b = 0; let a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const ux = ((px + (sx + 0.5) / SS) / olcham) * 64; const uy = ((py + (sy + 0.5) / SS) / olcham) * 64;
      if (!maskable && !yumaloqKvadrat(ux, uy, 14)) continue;
      let rang = FON;
      const gx = (ux - siljish) / masshtab; const gy = (uy - siljish) / masshtab;
      if (ichida(S_HARF, gx, gy)) rang = KOK; else if (ichida(CHIZIQ, gx, gy)) rang = YASHIL;
      r += rang[0]; g += rang[1]; b += rang[2]; a += 255;
    }
    const n = SS * SS; const o = (py * olcham + px) * 4;
    const kv = a / n;
    buf[o] = a ? Math.round(r / (a / 255)) : 0; buf[o + 1] = a ? Math.round(g / (a / 255)) : 0; buf[o + 2] = a ? Math.round(b / (a / 255)) : 0; buf[o + 3] = Math.round(kv);
  }
  return png(olcham, buf);
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (b) => { let c = 0xffffffff; for (const v of b) c = CRC[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function bolak(tur, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(tur, 'ascii'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function png(n, rgba) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((n * 4 + 1) * n);
  for (let y = 0; y < n; y++) { raw[y * (n * 4 + 1)] = 0; rgba.copy(raw, y * (n * 4 + 1) + 1, y * n * 4, (y + 1) * n * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bolak('IHDR', ihdr), bolak('IDAT', deflateSync(raw, { level: 9 })), bolak('IEND', Buffer.alloc(0))]);
}

mkdirSync(CHIQISH, { recursive: true });
const FAYLLAR = [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true], ['apple-touch-icon.png', 180, true]];
for (const [nom, olcham, maskable] of FAYLLAR) writeFileSync(join(CHIQISH, nom), chiz(olcham, maskable));
console.log(`PWA ikonkalari yozildi: ${CHIQISH}`);
