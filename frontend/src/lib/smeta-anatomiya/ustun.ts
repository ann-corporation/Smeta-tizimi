import { kalit, son, toliqUstunlar } from './matn';
import type { Katak, UstunXaritasi } from './turlar';

/**
 * Sarlavha bloki: nom ustuni kalit so'zi bor qatordan boshlanib, `1 | 2 | 3 | …`
 * tartib qatorigacha (bo'lsa) davom etadi. Ma'lumot qatorlari hech qachon
 * sarlavhaga qo'shilmaydi — oferta parseridagi "kod ustunidagi ЦЕНА narx
 * ustuni bo'lib qoldi" xatosi shu chegara yo'qligidan edi.
 */
const NOM = /НАИМЕНОВАН|NOMI\b/;
const QIDIRUV_CHEGARASI = 60;

/** `1 | 2 | 3 | 4 …` — ketma-ket butun sonlar qatori (kamida 4 ta). Real F2 larda
 *  raqamlash `2` dan boshlanadi (tartib ustuni bo'sh) yoki oxirida takror/ortiqcha
 *  katak bor (`… H=8 | J=8`) — shuning uchun boshidan kamida 4 ta ketma-ket son yetarli,
 *  boshlanishi 1 bo'lishi shart emas (lekin ≤ 3). */
export function tartibRaqamlariQatorimi(row: readonly Katak[]): boolean {
  const idx = toliqUstunlar(row);
  if (idx.length < 4) return false;
  let oldingi: number | null = null;
  let ketma = 0;
  for (const i of idx) {
    const n = son(row[i]);
    if (n == null || !Number.isInteger(n) || typeof row[i] === 'string' && !/^\d+$/.test(String(row[i]).trim())) break;
    if (oldingi == null) { if (n < 1 || n > 3) return false; }
    else if (n !== oldingi + 1) break;
    oldingi = n;
    ketma++;
  }
  return ketma >= 4;
}

function ustunSarlavhalari(rows: readonly Katak[][], bosh: number, oxir: number): string[] {
  let kenglik = 0;
  for (let r = bosh; r <= oxir; r++) kenglik = Math.max(kenglik, rows[r]?.length ?? 0);
  const out: string[] = [];
  for (let c = 0; c < kenglik; c++) {
    const qismlar: string[] = [];
    for (let r = bosh; r <= oxir; r++) {
      const k = kalit(rows[r]?.[c]);
      if (k) qismlar.push(k);
    }
    out.push(qismlar.join(' '));
  }
  return out;
}

function birinchi(sarlavhalar: string[], naqsh: RegExp, taqiq?: RegExp, band?: Set<number>): number {
  for (let i = 0; i < sarlavhalar.length; i++) {
    if (band?.has(i)) continue;
    if (naqsh.test(sarlavhalar[i]) && !(taqiq && taqiq.test(sarlavhalar[i]))) return i;
  }
  return -1;
}

export interface SarlavhaBloki {
  bosh: number;        // 0-asosli
  oxir: number;        // 0-asosli, tartib qatoridan oldingi qator
  malumotBoshi: number;
  sarlavhalar: string[];
}

/** Eng ko'p kalit ustunli sarlavha blokini topadi. Topilmasa null. */
export function sarlavhaBlokiniTop(rows: readonly Katak[][]): SarlavhaBloki | null {
  const chegara = Math.min(rows.length, QIDIRUV_CHEGARASI);
  let eng: { ball: number; blok: SarlavhaBloki } | null = null;
  for (let r = 0; r < chegara; r++) {
    const qator = rows[r] ?? [];
    // Haqiqiy sarlavha qatori kamida 3 ustunli; "(наименование работ …, объекта)"
    // kabi titul izohlari bitta katakli — ular sarlavha bloki boshi bo'lolmaydi.
    if (toliqUstunlar(qator).length < 3 || !qator.some((v) => NOM.test(kalit(v)))) continue;
    // Blok oxiri: tartib qatori (bo'lsa) yoki 3 qatordan keyin.
    let oxir = r;
    let malumotBoshi = r + 1;
    for (let k = r + 1; k <= Math.min(rows.length - 1, r + 4); k++) {
      if (tartibRaqamlariQatorimi(rows[k] ?? [])) { oxir = k - 1; malumotBoshi = k + 1; break; }
      const q = rows[k] ?? [];
      const sonlar = toliqUstunlar(q).filter((i) => son(q[i]) != null).length;
      if (sonlar >= 2) break; // ma'lumot boshlandi — sarlavhaga qo'shilmaydi
      if (toliqUstunlar(q).length) { oxir = k; malumotBoshi = k + 1; }
    }
    const sarlavhalar = ustunSarlavhalari(rows, r, oxir);
    const ball = sarlavhalar.filter((s) => /НАИМЕНОВАН|NOMI|ЕД|BIRLIG|КОЛ|MIQDOR|ЦЕНА|NARX|СУММА|SUMMA|СТОИМ|ШИФР|ОБОСН|ASOS|№|N П/.test(s)).length;
    if (!eng || ball > eng.ball) eng = { ball, blok: { bosh: r, oxir, malumotBoshi, sarlavhalar } };
  }
  return eng?.blok ?? null;
}

/** Ish/resurs varag'i ustunlari. Topilmagan ustun = -1. */
export function ustunXaritasi(blok: SarlavhaBloki): UstunXaritasi {
  const s = blok.sarlavhalar;
  const band = new Set<number>();
  const ol = (i: number) => { if (i >= 0) band.add(i); return i; };
  const PUL = /СТОИМ|ЦЕНА|НАРХ|БАҲО|NARX|СУММА|SUMMA/;
  const hajmBirlikka = ol(birinchi(s, /НА\.? ?ЕД|НА ЕДИНИЦУ|BIRLIGI BO.?YICHA|(?:ҲАЖМ|HAJM)\s*\(?\s*(?:ЕД|ED)(?:\s|\)|$)/, PUL, band));
  const hajmLoyiha = ol(birinchi(s, /ПО ПРОЕКТ|LOYIHA BO.?YICHA|НА ВЕСЬ ОБЪЕМ|КОЛ-?ВО|КОЛИЧЕСТВ|MIQDOR|(?:ҲАЖМ|HAJM).*?(?:ЖАМИ|ЖАМИЙ|JAMI)|^(?:ҲАЖМ|HAJM)\b/, /ЦЕНА|СТОИМ|НАРХ|БАҲО|NARX/, band));
  const nom = ol(birinchi(s, NOM, undefined, band));
  const tartib = ol(birinchi(s, /^(№|N П|NN|№№)|^N$/, undefined, band));
  const shifr = ol(birinchi(s, /ШИФР|ОБОСНОВ|ASOS|^РЕСУРС$|^КОД/, undefined, band));
  const birlik = ol(birinchi(s, /ЕД\.? ?ИЗМ|ЕДИНИЦА ИЗМ|O.?LCHOV|BIRLIK/, /КОЛИЧ|КОЛ-?ВО|MIQDOR|BO.?YICHA/, band));
  const narx = ol(birinchi(s, /ЦЕНА|НАРХ|БАҲО|NARX|СТОИМОСТЬ ЕД|ЕДИНИЦЫ$|СТОИМ.*НА\.? ?ЕД/, /ВСЕГО|ОБЩ|ВЕСЬ/, band));
  const summa = ol(birinchi(s, /СУММА|SUMMA|ВСЕГО|НА ВЕСЬ|СТОИМ|ОБЩАЯ/, undefined, band));
  return {
    tartib, shifr, nom, birlik, hajmBirlikka,
    // Bitta miqdor ustuni bo'lsa ("КОЛ-ВО") — u loyiha hajmi.
    hajmLoyiha: hajmLoyiha >= 0 ? hajmLoyiha : -1,
    narx, summa,
    sarlavhaQatori: blok.bosh,
    malumotBoshi: blok.malumotBoshi,
  };
}
