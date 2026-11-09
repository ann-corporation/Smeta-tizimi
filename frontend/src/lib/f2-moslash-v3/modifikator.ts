/**
 * NORMA MODIFIKATORLARI (F2 import auditi, 2026-11-09, P3/P5): bir xil shifr (kod-kanon) — hali bir xil ish EMAS.
 * Shifr yonidagi koeffitsiyent («К=5», «КзП=1,2»), ШНК qo'shimchasi («ШНК.ДОП.4»), qalinlik/o'lcham («10 СМ», «Т.1,8СМ»,
 * «t>18», «20 ММ») va norma tuzatuvchi yo'nalish («ДОБАВЛЯТЬ» / «ИСКЛЮЧАТЬ») ishning hajm/narx ma'nosini o'zgartiradi:
 * manba «К=5» qatori smetaning «К=15» qatoriga avtomatik ulansa, ish hajmi to'liq olinadi, resurslar esa uch baravar farq qiladi.
 *
 * Qoida: ikki tomonda HAM bor va qiymati farqli modifikator — aniq moslik emas («shubhali»), PTO tasdiqlaydi.
 * Bir tomonda bo'lmasa — taxmin qilinmaydi (farq ham, moslik ham deb olinmaydi).
 */

const LAT: Record<string, string> = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' };

function matn(s: unknown): string {
  return String(s ?? '').toUpperCase().replace(/Ё/g, 'Е').replace(/[ABCEHKMOPTXY]/g, (ch) => LAT[ch] ?? ch);
}

const son = (x: string) => Number(x.replace(',', '.'));
const fmt = (n: number) => String(+n.toFixed(4));

export type ModifikatorKalit = 'koef' | 'shnk_dop' | 'olcham' | 'yonalish';

const NOMLAR: Record<ModifikatorKalit, string> = {
  koef: 'koeffitsiyent (К=)',
  shnk_dop: 'ШНК.ДОП',
  olcham: 'qalinlik/o‘lcham (мм/см)',
  yonalish: 'ДОБАВЛЯТЬ/ИСКЛЮЧАТЬ',
};

/** Kod va nomdan modifikatorlar: kalit → normallashgan qiymat (o'lcham — millimetrlar to'plami). */
export function modifikatorlar(kod: unknown, nom: unknown): Map<ModifikatorKalit, string> {
  const k = matn(kod);
  const n = matn(nom);
  const ikkalasi = `${k} ${n}`;
  const out = new Map<ModifikatorKalit, string>();

  // К=5, К = 15, КЗП=1,2 (kod yoki nomda). «К» oldida harf bo'lmasin (масса «ТКМ» va h.k.).
  const koef: string[] = [];
  for (const m of ikkalasi.matchAll(/(?:^|[^А-Я])(К(?:ЗП)?)\s*=\s*(\d+(?:[.,]\d+)?)/g)) koef.push(`${m[1]}=${fmt(son(m[2]))}`);
  if (koef.length) out.set('koef', [...new Set(koef)].sort().join(','));

  const shnk = ikkalasi.match(/Ш\s*Н\s*К\s*\.?\s*ДОП\s*\.?\s*(\d+)/);
  if (shnk) out.set('shnk_dop', String(Number(shnk[1])));

  // Qalinlik/o'lcham → mm. «Т.1,8СМ», «ТОЛЩ. 10 СМ», «10СМ/15СМ», «20 ММ», «t>18» (mm).
  const mm: number[] = [];
  for (const m of n.matchAll(/(\d+(?:[.,]\d+)?)\s*(СМ|ММ)(?![А-Я])/g)) {
    const v = son(m[1]);
    if (Number.isFinite(v) && v > 0) mm.push(m[2] === 'СМ' ? v * 10 : v);
  }
  for (const m of n.matchAll(/(?:^|[^А-Я])Т\s*[>≥=]\s*(\d+(?:[.,]\d+)?)/g)) {
    const v = son(m[1]);
    if (Number.isFinite(v) && v > 0) mm.push(v);
  }
  if (mm.length) out.set('olcham', [...new Set(mm.map((v) => fmt(v)))].sort((a, b) => Number(a) - Number(b)).join('/'));

  const qosh = /ДОБАВЛЯ|ДОБАВИТ/.test(n);
  const ayir = /ИСКЛЮЧА|ИСКЛЮЧИТ/.test(n);
  if (qosh !== ayir) out.set('yonalish', qosh ? 'ДОБАВЛЯТЬ' : 'ИСКЛЮЧАТЬ');
  return out;
}

export interface ModifikatorFarq { kalit: ModifikatorKalit; nom: string; manba: string; smeta: string }

/** Ikkala tomonda ham bor, qiymati farqli modifikatorlar (bo'sh — farq yo'q yoki aniqlab bo'lmaydi). */
export function modifikatorFarqlari(a: { kod: unknown; nom: unknown }, b: { kod: unknown; nom: unknown }): ModifikatorFarq[] {
  const A = modifikatorlar(a.kod, a.nom);
  const B = modifikatorlar(b.kod, b.nom);
  const out: ModifikatorFarq[] = [];
  for (const [kalit, v] of A) {
    const w = B.get(kalit);
    if (w != null && w !== v) out.push({ kalit, nom: NOMLAR[kalit], manba: v, smeta: w });
  }
  return out;
}

export function modifikatorIzoh(f: readonly ModifikatorFarq[]): string {
  return f.map((x) => `${x.nom}: manba ${x.manba} ↔ smeta ${x.smeta}`).join('; ');
}
