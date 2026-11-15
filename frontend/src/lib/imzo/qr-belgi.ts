/**
 * lib/imzo/qr-belgi.ts - QURAI belgisi (halqa ichida U va R) QR kod MARKAZIGA qo'yish uchun.
 * Belgi chiziqlari `public/brand/qur-belgi.svg` bilan bir xil (viewBox -66.89 -65.5 137.01 137.01, chiziq 9).
 * PNG uchun (qr.ts, xlsx ga rasm) belgi kulrang niqob sifatida shu yerda chiziladi (canvas kerak emas, brauzer va Node da bir xil);
 * SVG uchun (chop ko'rinishi) ChopKorinish xuddi shu yo'llarni ishlatadi.
 * Xato tuzatish darajasi H (30 %): belgi ostidagi oq kvadrat QR kengligining ko'pi bilan QR_BELGI_NISBAT qismini egallaydi.
 */

/** Oq kvadrat tomoni / QR belgisi (quiet zone'siz) kengligi. 0.22 dan oshmasin. */
export const QR_BELGI_NISBAT = 0.2;
/** Belgi oq kvadratning shu qismini egallaydi (chekka qoladi). */
export const QR_BELGI_ICHKI = 0.78;

export const BELGI_VIEWBOX = { x: -66.89, y: -65.5, w: 137.01, h: 137.01 } as const;
export const BELGI_CHIZIQ = 9;
/** SVG yo'llari (qur-belgi.svg bilan bir xil; halqa ikkita yoy sifatida). */
export const BELGI_YOLLAR: readonly string[] = [
  'M-26 -34V12A15 15 0 0 0 4 12V-34',
  'M4 -34H18A14 14 0 0 1 18 -6H4',
  'M13 -6L41.94 37.11',
  'M-56 0A56 56 0 1 0 56 0A56 56 0 1 0 -56 0',
  'M41.94 37.11L60 64',
];

type Nuqta = readonly [number, number];
type Shakl =
  | { t: 'kesma'; a: Nuqta; b: Nuqta }
  | { t: 'yarim'; c: Nuqta; r: number; yon: 'past' | 'ong' }
  | { t: 'halqa'; r: number };

const SHAKLLAR: readonly Shakl[] = [
  { t: 'kesma', a: [-26, -34], b: [-26, 12] },
  { t: 'yarim', c: [-11, 12], r: 15, yon: 'past' },
  { t: 'kesma', a: [4, 12], b: [4, -34] },
  { t: 'kesma', a: [4, -34], b: [18, -34] },
  { t: 'yarim', c: [18, -20], r: 14, yon: 'ong' },
  { t: 'kesma', a: [18, -6], b: [4, -6] },
  { t: 'kesma', a: [13, -6], b: [41.94, 37.11] },
  { t: 'kesma', a: [41.94, 37.11], b: [60, 64] },
  { t: 'halqa', r: 56 },
];

function kesmaMasofa(x: number, y: number, a: Nuqta, b: Nuqta): number {
  const dx = b[0] - a[0]; const dy = b[1] - a[1];
  const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (a[0] + u * dx), y - (a[1] + u * dy));
}

function masofa(x: number, y: number, s: Shakl): number {
  if (s.t === 'kesma') return kesmaMasofa(x, y, s.a, s.b);
  if (s.t === 'halqa') return Math.abs(Math.hypot(x, y) - s.r);
  const [cx, cy] = s.c;
  const tomonda = s.yon === 'past' ? y >= cy : x >= cx;
  if (tomonda) return Math.abs(Math.hypot(x - cx, y - cy) - s.r);
  const uchlar: Nuqta[] = s.yon === 'past' ? [[cx - s.r, cy], [cx + s.r, cy]] : [[cx, cy - s.r], [cx, cy + s.r]];
  return Math.min(...uchlar.map((u) => Math.hypot(x - u[0], y - u[1])));
}

/** Belgi niqobi: olcham x olcham, 255 = belgi (qora), 0 = bo'sh. 4x4 supersampling. */
export function belgiNiqobi(olcham: number): Uint8Array {
  const v = BELGI_VIEWBOX; const yarim = BELGI_CHIZIQ / 2; const ss = 4;
  const out = new Uint8Array(olcham * olcham);
  for (let py = 0; py < olcham; py++) {
    for (let px = 0; px < olcham; px++) {
      let n = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = v.x + ((px + (sx + 0.5) / ss) / olcham) * v.w;
          const y = v.y + ((py + (sy + 0.5) / ss) / olcham) * v.h;
          if (SHAKLLAR.some((s) => masofa(x, y, s) <= yarim)) n++;
        }
      }
      out[py * olcham + px] = Math.round((n / (ss * ss)) * 255);
    }
  }
  return out;
}

/** Oq kvadrat va belgi joyi, `n` modulli QR (quiet zone'siz) uchun modul birligida. */
export function qrBelgiJoyi(n: number): { chap: number; yuqori: number; tomon: number } {
  const tomon = n * QR_BELGI_NISBAT;
  return { chap: (n - tomon) / 2, yuqori: (n - tomon) / 2, tomon };
}
