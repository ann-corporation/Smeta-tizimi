/**
 * lib/imzo/qr.ts - QR kod: matritsa (qrcode-generator 1.4.4, MIT) va PNG rasm (xlsx ga HAQIQIY rasm sifatida joylanadi,
 * chop etilganda ham chiqadi). PNG kodlagich kichik o'z kodimiz: 8 bit kulrang, fflate zlib.
 */
import qrcode from 'qrcode-generator';
import { zlibSync } from 'fflate';
import { belgiNiqobi, QR_BELGI_ICHKI, QR_BELGI_NISBAT } from './qr-belgi';

/** QR matritsasi (true = qora). Xato tuzatish H (markazga QURAI belgisi qo'yiladi); versiya matn uzunligiga qarab avtomatik. */
export function qrMatritsa(matn: string, daraja: 'L' | 'M' | 'Q' | 'H' = 'H'): boolean[][] {
  const qr = qrcode(0, daraja);
  qr.addData(matn, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const u32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
function bolak(tur: string, data: Uint8Array): Uint8Array {
  const t = new TextEncoder().encode(tur);
  const body = new Uint8Array(t.length + data.length); body.set(t); body.set(data, t.length);
  const out = new Uint8Array(12 + data.length);
  out.set(u32(data.length), 0); out.set(body, 4); out.set(u32(crc32(body)), 8 + data.length);
  return out;
}

/** QR PNG: `masshtab` px har modulga, atrofida 4 modul bo'sh joy (skaner uchun shart). */
export function qrPng(matn: string, masshtab = 6, belgi = true): { png: Uint8Array; piksel: number } {
  const m = qrMatritsa(matn);
  const n = m.length; const quiet = 4; const w = (n + quiet * 2) * masshtab;
  const raw = new Uint8Array((w + 1) * w).fill(255);
  for (let y = 0; y < w; y++) {
    raw[y * (w + 1)] = 0;   // filtr: yo'q
    const r = Math.floor(y / masshtab) - quiet;
    if (r < 0 || r >= n) continue;
    for (let x = 0; x < w; x++) {
      const c = Math.floor(x / masshtab) - quiet;
      if (c >= 0 && c < n && m[r][c]) raw[y * (w + 1) + 1 + x] = 0;
    }
  }
  if (belgi) belgiQoy(raw, w, quiet * masshtab, n * masshtab);
  const ihdr = new Uint8Array(13); ihdr.set(u32(w), 0); ihdr.set(u32(w), 4); ihdr[8] = 8; ihdr[9] = 0;   // 8 bit, kulrang
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), bolak('IHDR', ihdr), bolak('IDAT', zlibSync(raw, { level: 9 })), bolak('IEND', new Uint8Array(0))];
  const png = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of parts) { png.set(p, o); o += p.length; }
  return { png, piksel: w };
}

/** QR markaziga oq yumaloq kvadrat + QURAI belgisi (kulrang 8 bit): kvadrat QR kengligining QR_BELGI_NISBAT qismi (<= 22 %). */
export function qrBelgiKvadrati(simvolPx: number): number { return Math.floor(simvolPx * QR_BELGI_NISBAT); }
function belgiQoy(raw: Uint8Array, w: number, chet: number, simvol: number): void {
  const tomon = qrBelgiKvadrati(simvol);
  const x0 = chet + Math.floor((simvol - tomon) / 2);
  const rad = tomon * 0.16;
  for (let y = 0; y < tomon; y++) {
    for (let x = 0; x < tomon; x++) {
      const dx = Math.max(rad - x - 0.5, x + 0.5 - (tomon - rad), 0); const dy = Math.max(rad - y - 0.5, y + 0.5 - (tomon - rad), 0);
      if (dx * dx + dy * dy <= rad * rad) raw[(x0 + y) * (w + 1) + 1 + x0 + x] = 255;
    }
  }
  const b = Math.floor(tomon * QR_BELGI_ICHKI); const off = x0 + Math.floor((tomon - b) / 2);
  const niqob = belgiNiqobi(b);
  for (let y = 0; y < b; y++) for (let x = 0; x < b; x++) raw[(off + y) * (w + 1) + 1 + off + x] = 255 - niqob[y * b + x];
}
