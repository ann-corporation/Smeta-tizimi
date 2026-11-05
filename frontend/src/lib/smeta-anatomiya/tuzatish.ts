/**
 * SMETA YADROSI — «tuzatish qatori» (qalinlik / norma tuzatishi) va uning ASOSIY ishi (egasi 2026-11-05).
 *
 * Smetada «НА КАЖДЫЙ 1 СМ ИЗМЕНЕНИЯ ТОЛЩИНЫ … ДОБАВЛЯТЬ ИЛИ ИСКЛЮЧАТЬ», «ВЫЧИТАЕТСЯ …» kabi ish (bl) qatorlari
 * o'zidan oldingi asosiy ishni o'zgartiradi (+ yoki −). Prorab faktni faqat asosiy ishga belgilaydi, shuning uchun
 * tuzatish qatorining fakti asosiy ish faktiga ERGASHADI: fakt = tuzatish.hajm × (asos.fakt / asos.hajm).
 *
 * Yagona aniqlagich shu yerda (parallel aniqlagich yozilmaydi). Asl smeta o'zgarmaydi — bu faqat tushunish;
 * fakt qatlami (lib/fakt-tuzatish) shu bog'lanishdan foydalanadi. NULL ≠ 0.
 */
import { hajmMasshtab } from '../hisob-yadro';

export type TuzatishManba = {
  id: number; tur: string | null; kod?: string | null; nom?: string | null; birlik?: string | null;
  hajm?: number | string | null; ota_id?: number | null; tartib?: number | null;
  qoshimcha?: boolean | null; zamena?: boolean | null;
};

/** Matn kaliti: katta harf, Ё→Е, lotin o'xshash harflar (K, H, E …) kirillga, bo'shliqlar bitta. */
const LOTIN: Record<string, string> = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' };
const kalit = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/Ё/g, 'Е').replace(/[ABCEHKMOPTXY]/g, (c) => LOTIN[c] ?? c).replace(/\s+/g, ' ').trim();

/** «НА КАЖДЫЙ/КАЖДЫЕ … / ПРИ ИЗМЕНЕНИИ …» + «ИЗМЕНЕНИ/ТОЛЩИН» (birinchi qism). */
const OZGARISH = /(НА КАЖДЫ[ЙЕ]|ПРИ ИЗМЕНЕНИИ).*(ИЗМЕНЕНИ|ТОЛЩИН)/;
/** «ДОБАВЛЯТЬ / ИСКЛЮЧАТЬ» (shuningdek «ДОБАВЛЯЕТСЯ / ИСКЛЮЧАЕТСЯ» shakli). */
const QOSH_AYIR = /(ДОБАВЛЯ(ТЬ|ЕТСЯ)|ИСКЛЮЧА(ТЬ|ЕТСЯ))/;
const TOLIQ = new RegExp(`${OZGARISH.source}.*${QOSH_AYIR.source}`);
const VYCHITAETSYA = /ВЫЧИТАЕТСЯ/;
const QOSH_YOKI_AYIR = /ДОБАВЛЯТЬ ИЛИ ИСКЛЮЧАТЬ/;
/** Shifrda koeffitsiyent: «К=10», «K = 4» (lotin K ham). */
const KOEF = /К\s*=\s*\d/;

export type TuzatishSabab = 'qalinlik' | 'vychitaetsya' | 'qosh_ayir' | 'koef_qalinlik';

/** Tuzatish qatorimi va qaysi qoida bo'yicha (null — oddiy ish). Faqat asl smeta ishi (bl, qo'shimcha/zamena emas). */
export function tuzatishSababi(q: Pick<TuzatishManba, 'tur' | 'kod' | 'nom' | 'qoshimcha' | 'zamena'>): TuzatishSabab | null {
  if (q.tur !== 'bl' || q.qoshimcha || q.zamena) return null;
  const nom = kalit(q.nom);
  if (!nom) return null;
  if (TOLIQ.test(nom)) return 'qalinlik';
  if (VYCHITAETSYA.test(nom)) return 'vychitaetsya';
  if (QOSH_YOKI_AYIR.test(nom)) return 'qosh_ayir';
  // Shifrda К=n bo'lsa — nomning birinchi qismi yetarli («НА КАЖДЫЕ 5 ММ ИЗМЕНЕНИЯ ТОЛЩИНЫ ЗА 2 РАЗА»).
  if (KOEF.test(kalit(q.kod)) && OZGARISH.test(nom)) return 'koef_qalinlik';
  return null;
}

export function tuzatishQatorimi(q: Pick<TuzatishManba, 'tur' | 'kod' | 'nom' | 'qoshimcha' | 'zamena'>): boolean {
  return tuzatishSababi(q) != null;
}

/** Birlik kaliti: «1000 м2» = «1000М2». */
const birlikKalit = (b: string | null | undefined) => kalit(b).replace(/[\s.]/g, '');
/** Bir xil birlik: aynan teng yoki biri ikkinchisining kesilgan boshi (≥ 6 belgi: «1000М2ОСНОВАНИЯИЛИПОКРЫТИ» = «…ПОКРЫТИЯ»). */
const birlikTeng = (a: string, b: string) => {
  if (a === b) return true;
  const [q, u] = a.length <= b.length ? [a, b] : [b, a];
  return q.length >= 6 && u.startsWith(q);
};
const sonOl = (v: number | string | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
/** |a| va |b| 1% ichida teng. */
const hajmTeng = (a: number | null, b: number | null) => {
  if (a == null || b == null) return false;
  const x = Math.abs(a); const y = Math.abs(b);
  return Math.abs(x - y) <= 0.01 * Math.max(x, y);
};

export type TuzatishBoglanish = {
  tuzatishId: number; sabab: TuzatishSabab;
  /** Asosiy ish id; topilmasa null. */
  asosId: number | null;
  /** 'hajm' — bir xil birlik va |hajm| (1%); 'birlik' — faqat birlik (taxminiy, ko'rib chiqiladi); null — bog'lanmadi. */
  qoida: 'hajm' | 'birlik' | null;
};

export type TuzatishXarita = {
  /** tuzatish id → asos id (faqat bog'langanlar). */
  asos: Map<number, number>;
  /** asos id → unga ergashuvchi tuzatish id'lari. */
  ergashuvchi: Map<number, number[]>;
  barchasi: TuzatishBoglanish[];
  /** Bog'lanmagan tuzatishlar (asos topilmadi) — hisobotda. */
  boglanmagan: TuzatishBoglanish[];
  /** Faqat birlik bo'yicha (hajm mos emas) bog'langanlar — taxminiy. */
  taxminiy: TuzatishBoglanish[];
};

/**
 * Bog'lanish (deterministik): bir xil bo'lim (ota_id) ichida, tartib bo'yicha OLDINGI eng yaqin tuzatish bo'lmagan ish,
 * (1) birligi bir xil va |hajm| 1% ichida teng; bo'lmasa (2) faqat birligi bir xil; bo'lmasa — bog'lanmaydi.
 * Tartib: `tartib`, keyin `id`.
 */
export function tuzatishBoglanishlari(rows: readonly TuzatishManba[]): TuzatishXarita {
  const guruh = new Map<number | null, TuzatishManba[]>();
  for (const r of rows) {
    if (r.tur !== 'bl') continue;
    const k = r.ota_id ?? null; const a = guruh.get(k);
    if (a) a.push(r); else guruh.set(k, [r]);
  }
  const out: TuzatishXarita = { asos: new Map(), ergashuvchi: new Map(), barchasi: [], boglanmagan: [], taxminiy: [] };
  const tartib = (r: TuzatishManba) => r.tartib ?? Number.MAX_SAFE_INTEGER;
  for (const arr of guruh.values()) {
    const s = [...arr].sort((a, b) => tartib(a) - tartib(b) || a.id - b.id);
    const sabablar = s.map((r) => tuzatishSababi(r));
    s.forEach((r, i) => {
      const sabab = sabablar[i];
      if (!sabab) return;
      const bk = birlikKalit(r.birlik); const h = sonOl(r.hajm);
      let asos: TuzatishManba | null = null; let qoida: TuzatishBoglanish['qoida'] = null;
      let birlikli: TuzatishManba | null = null;
      for (let j = i - 1; j >= 0; j--) {
        const c = s[j];
        if (sabablar[j] || c.qoshimcha || c.zamena || !birlikTeng(birlikKalit(c.birlik), bk)) continue;
        if (!birlikli) birlikli = c;
        if (hajmTeng(sonOl(c.hajm), h)) { asos = c; qoida = 'hajm'; break; }
      }
      if (!asos && birlikli) { asos = birlikli; qoida = 'birlik'; }
      const b: TuzatishBoglanish = { tuzatishId: r.id, sabab, asosId: asos?.id ?? null, qoida };
      out.barchasi.push(b);
      if (!asos) { out.boglanmagan.push(b); return; }
      if (qoida === 'birlik') out.taxminiy.push(b);
      out.asos.set(r.id, asos.id);
      const e = out.ergashuvchi.get(asos.id); if (e) e.push(r.id); else out.ergashuvchi.set(asos.id, [r.id]);
    });
  }
  return out;
}

/**
 * Tuzatish qatorining fakti = tuzatish.hajm × (asos.fakt / asos.hajm) — ishora tuzatishniki (hajm o'zi ishorali).
 * NULL ≠ 0: asos fakti NULL → null (yozilmaydi); asos hajmi 0/NULL yoki tuzatish hajmi NULL → null (tarqatilmaydi).
 * Masshtab — yadro `hajmMasshtab` (6 xona).
 */
export function tuzatishFakti(tuzatishHajm: number | null | undefined, asosFakt: number | null | undefined, asosHajm: number | null | undefined): number | null {
  if (asosFakt == null || !Number.isFinite(asosFakt)) return null;
  if (asosHajm == null || !Number.isFinite(asosHajm) || asosHajm === 0) return null;
  const r = hajmMasshtab(tuzatishHajm, asosFakt / asosHajm);
  return r === 0 ? 0 : r; // -0 → 0
}
