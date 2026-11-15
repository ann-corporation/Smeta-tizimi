/**
 * QURAI so'z belgisi generatori. Ishga tushirish: `node scripts/brand-qurai.mjs` (frontend/ ichida).
 *
 * Belgi (Q halqa + U + R) o'zgarmaydi — qur-gorizontal.svg dan Q, U, R konturlari olinadi.
 * «A» va «I» harflari shu skript ichida qo'lda chizilgan serif konturlar (Cormorant Garamond uslubiga yaqin,
 * qalin/ingichka kontrast). TODO: Cormorant Garamond (OFL) shrift fayli bo'lsa, A va I ni haqiqiy
 * shrift konturlaridan almashtirish (opentype.js bilan) — hozir shrift fayli omborda yo'q.
 *
 * Chiqish (public/brand/):
 *   qurai-gorizontal.svg        — qora, «AI» yengilroq vaznda (mono)
 *   qurai-gorizontal-oq.svg     — oq fon uchun teskari (oq), «AI» yengilroq
 *   qurai-gorizontal-rangli.svg — navy #14213D + «AI» oltin #B08D57
 * PNG/ICO hosilalar (qur-icon-*, favicon.ico) faqat belgidan iborat — belgi o'zgarmagani uchun qayta yaratilmaydi.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BRAND = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'brand');
const manba = readFileSync(join(BRAND, 'qur-gorizontal.svg'), 'utf8');

const NAVY = '#14213D';
const GOLD = '#B08D57';

/* Q, U, R: mavjud yo'ldagi dastlabki 5 ta kontur (Q tashqi+ichki, U, R tashqi+ichki). */
const yol = manba.match(/<path transform="translate\(([\d.]+) ([\d.]+)\)" fill="#000" d="([^"]+)"/);
if (!yol) throw new Error('qur-gorizontal.svg: matn yo‘li topilmadi');
const [, tx, ty, d] = yol;
const kontur = d.split(/(?<=Z)(?=M)/);
if (kontur.length !== 8) throw new Error(`Kutilgan 8 kontur, topildi ${kontur.length}`);
const QUR = kontur.slice(0, 5).join('');
/* belgi (ring+Q/U/R chiziqlari) — matn yo'lidan oldingi hamma <path>/<circle> */
const belgiQismi = manba.slice(manba.indexOf('<path'), manba.indexOf('<path transform'));

const f = (n) => n.toFixed(2);
const poly = (pts) => 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + 'Z';
const rect = (x0, y0, x1, y1) => poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);

/* Barcha ko'pburchaklar soat yo'nalishida (nonzero to'ldirish, bir-birini yo'q qilmaydi). Baza chizig'i y=0, bosh harf balandligi ~41.25. */
function harfA(w) {
  const xa = 22.5; const serif = 1.4;
  const o = 39.5; // qalin shtrix pastki o'ng chegarasi
  return [
    poly([[xa - 1.1, -42], [xa + 1.7, -42], [o, 0], [o - w, 0]]),            // qalin (o'ng) shtrix
    poly([[xa - 2.2, -41.6], [xa + 0.8, -41.8], [9.2, 0], [6.0, 0]]),        // ingichka (chap) shtrix
    rect(10.0, -15.6, 31.8, -13.2),                                            // ko'ndalang chiziq
    rect(0.2, -serif, 14.4, 0),                                                // chap serif
    rect(o - w - 6.5, -serif, o + 6.5, 0),                                     // o'ng serif
  ].join('');
}
function harfI(w) {
  const sx = 12; const serif = 1.4; const yuqori = -41.25; const pastki = 0;
  return [
    rect(sx, yuqori, sx + w, pastki),
    rect(sx - 9, yuqori, sx + w + 9, yuqori + serif),
    rect(sx - 9, pastki - serif, sx + w + 9, pastki),
  ].join('');
}

/* AI: R tugagan joydan (≈225) keyin xuddi Q-U-R oralig'idek (≈45) bo'shliq. */
const A_X = 270; const I_X = 270 + 46.6 + 45;
/* viewBox kengligi: chap bo'sh joy + matn siljishi + «I» o'ng chegarasi + o'ng bo'sh joy (qur-gorizontal bilan bir xil). */
const KENGLIK = 66.89 + Number(tx) + I_X + 28 + 6.4;
function yig({ belgi, matn, ai, vaznAI }) {
  const rangla = (s) => s.replace(/stroke="#000"/g, `stroke="${belgi.chiziq}"`);
  let b = belgiQismi;
  if (belgi.halqa) {
    b = b.replace(/(<circle[^>]*?)stroke="#000"/, `$1stroke="${belgi.halqa}"`).replace(/(<path d="M41.94 37.11L60 64"[^>]*?)stroke="#000"/, `$1stroke="${belgi.halqa}"`);
  }
  b = rangla(b);
  const w = vaznAI;
  const aiYol = `<g transform="translate(${tx} ${ty})" fill="${ai}"><path transform="translate(${A_X} 0)" d="${harfA(w)}"/><path transform="translate(${I_X} 0)" d="${harfI(w)}"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-66.89 -65.5 ${f(KENGLIK)} 137.01" role="img" aria-label="QURAI">${b}<path transform="translate(${tx} ${ty})" fill="${matn}" d="${QUR}"/>${aiYol}</svg>\n`;
}

const mono = { belgi: { chiziq: '#000' }, matn: '#000', ai: '#000', vaznAI: 6.4 };
const oq = { belgi: { chiziq: '#fff' }, matn: '#fff', ai: '#fff', vaznAI: 6.4 };
const rangli = { belgi: { chiziq: NAVY, halqa: GOLD }, matn: NAVY, ai: GOLD, vaznAI: 7.6 };

writeFileSync(join(BRAND, 'qurai-gorizontal.svg'), yig(mono));
writeFileSync(join(BRAND, 'qurai-gorizontal-oq.svg'), yig(oq));
writeFileSync(join(BRAND, 'qurai-gorizontal-rangli.svg'), yig(rangli));
console.log('QURAI SVG yozildi:', BRAND);
