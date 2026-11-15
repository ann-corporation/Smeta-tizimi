// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { unzlibSync } from 'fflate';
import { qrMatritsa, qrPng } from './qr';
import { belgiNiqobi, QR_BELGI_ICHKI, QR_BELGI_NISBAT, qrBelgiJoyi } from './qr-belgi';
import { dizaynTozala, SUKUT_DIZAYN } from '../hujjat-yozuvchi/dizayn';

const URL = 'https://example.test/t/' + 'T'.repeat(22);

/** Format ma'lumotidan xato tuzatish darajasi (L=1, M=0, Q=3, H=2) - ISO 18004 bo'yicha, birinchi nusxa. */
function ecl(m: boolean[][]): number {
  const pos: [number, number][] = [[0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [7, 8], [8, 8], [8, 7], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0]];
  const raw = pos.reduce((s, [r, c], i) => s | ((m[r][c] ? 1 : 0) << i), 0);
  return ((raw ^ 0x5412) >> 13) & 3;
}

function pikselSatrlar(png: Uint8Array, piksel: number): Uint8Array[] {
  const dv = new DataView(png.buffer, png.byteOffset);
  let o = 8; let idat = new Uint8Array(0);
  while (o < png.length) {
    const n = dv.getUint32(o); const tur = String.fromCharCode(...png.slice(o + 4, o + 8));
    if (tur === 'IDAT') idat = png.slice(o + 8, o + 8 + n);
    o += 12 + n;
  }
  const raw = unzlibSync(idat);
  return Array.from({ length: piksel }, (_, y) => raw.slice(y * (piksel + 1) + 1, (y + 1) * (piksel + 1)));
}

describe('QR markazida QURAI belgisi', () => {
  it('xato tuzatish darajasi H', () => {
    expect(ecl(qrMatritsa(URL))).toBe(2);
    expect(ecl(qrMatritsa(URL, 'M'))).toBe(0);
  });

  it('belgi kvadrati QR kengligining 22 % idan oshmaydi; quiet zone oq qoladi', () => {
    expect(QR_BELGI_NISBAT).toBeLessThanOrEqual(0.22);
    const m = qrMatritsa(URL); const n = m.length; const mash = 6; const quiet = 4;
    const { png, piksel } = qrPng(URL, mash);
    expect(piksel).toBe((n + quiet * 2) * mash);
    const sat = pikselSatrlar(png, piksel);
    const j = qrBelgiJoyi(n); expect(j.tomon / n).toBeLessThanOrEqual(0.22);
    // quiet zone butunlay oq
    for (let y = 0; y < piksel; y++) for (let x = 0; x < piksel; x++) {
      if (y < quiet * mash || x < quiet * mash || y >= piksel - quiet * mash || x >= piksel - quiet * mash) expect(sat[y][x]).toBe(255);
    }
    // belgidan tashqaridagi har modul matritsaga aynan mos
    const simvol = n * mash; const tomon = Math.floor(simvol * QR_BELGI_NISBAT); const x0 = quiet * mash + Math.floor((simvol - tomon) / 2);
    let tashqari = 0; let belgiPikseli = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const y = (r + quiet) * mash + 1; const x = (c + quiet) * mash + 1;
      const ichkarida = x >= x0 && x < x0 + tomon && y >= x0 && y < x0 + tomon;
      if (!ichkarida) { expect(sat[y][x] === 0, `${r},${c}`).toBe(m[r][c]); tashqari++; }
    }
    expect(tashqari).toBeGreaterThan(n * n * 0.9);
    // markazda belgi bor: kvadrat ichida qora piksellar mavjud, burchagi oq
    for (let y = x0; y < x0 + tomon; y++) for (let x = x0; x < x0 + tomon; x++) if (sat[y][x] < 128) belgiPikseli++;
    expect(belgiPikseli).toBeGreaterThan(tomon * tomon * 0.1);
    expect(sat[x0][x0]).toBe(255);
    // yo'qolgan modullar H ning tuzatish imkoniyatidan ancha kam (maydon ulushi)
    expect((tomon * tomon) / (simvol * simvol)).toBeLessThanOrEqual(0.05);
  });

  it('belgi=false: faqat sof QR (matritsa bilan to\'liq mos)', () => {
    const m = qrMatritsa(URL); const mash = 5; const { png, piksel } = qrPng(URL, mash, false);
    const sat = pikselSatrlar(png, piksel);
    for (let r = 0; r < m.length; r++) for (let c = 0; c < m.length; c++) expect(sat[(r + 4) * mash + 1][(c + 4) * mash + 1] === 0).toBe(m[r][c]);
  });

  it('niqob: halqa ichida bo\'sh markaz va chetlari bo\'sh; barqaror (deterministik)', () => {
    const a = belgiNiqobi(40); const b = belgiNiqobi(40);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(a[0]).toBe(0);                       // burchak bo'sh
    expect(a.filter((v) => v > 128).length).toBeGreaterThan(40 * 40 * 0.1);
    expect(QR_BELGI_ICHKI).toBeLessThan(1);
  });

  it('dizayn: «Logo va kolontitul» sukut yoqilgan va saqlanadi', () => {
    expect(SUKUT_DIZAYN.logoKolontitul).toBe(true);
    expect(dizaynTozala({ logoKolontitul: false }).logoKolontitul).toBe(false);
    expect(dizaynTozala({}).logoKolontitul).toBe(true);
    expect(dizaynTozala({ logoKolontitul: 'x' }).logoKolontitul).toBe(true);
  });
});
