/**
 * F2 HUJJAT KO'RINISHI — vizual tahlil uchun sof hisoblar (egasi 2026-10-25: «har bir smeta va F2 ni vizual ko'rib
 * tushunish»). Yangi biznes formula YO'Q: faqat allaqachon yuklangan F2 tafsiloti va smeta daraxtidan
 *  - har smeta qatori bo'yicha: smeta hajmi, oldin tasdiqlangan F2 lardagi hajm, shu hujjatdagi hajm, qoldiq;
 *  - bo'lim (razdel) jamilari va ulushi;
 *  - kategoriya (ЧЕЛ/МАШ/МАТ/ОБ) taqsimoti;
 *  - tekshiruv ro'yxati (arifmetik farq, smetadan oshgan, narxsiz, smetada topilmagan, zamena/qo'shimcha).
 * NULL ≠ 0: smeta hajmi noma'lum bo'lsa foiz ham, qoldiq ham noma'lum (null).
 */

export type F2KorQator = {
  akt_id: number; qator_id: number; oy: string; akt_holat: string;
  hajm: number; narx: number | null; summa: number | null; kat: string | null;
  gorunish_hajm?: number | null; gorunish_narx?: number | null; gorunish_summa?: number | null;
  certified_quantity?: number | null; certified_unit_price?: number | null; certified_amount?: number | null;
};
export type F2KorAkt = { id: number; oy: string; holat: string };

export const f2Miqdor = (l: F2KorQator): number | null => l.gorunish_hajm ?? l.certified_quantity ?? l.hajm ?? null;
export const f2BirlikNarx = (l: F2KorQator): number | null => l.gorunish_narx ?? l.certified_unit_price ?? l.narx ?? null;
export const f2Pul = (l: F2KorQator): number | null => l.gorunish_summa ?? l.certified_amount ?? l.summa ?? null;

const son = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Shu hujjatdan OLDIN tasdiqlangan F2 lar: tasdiqlangan, boshqa akt, davri oldinroq (yoki shu davrda, id kichik). */
export function oldingiTasdiqlanganAktlar(aktlar: readonly F2KorAkt[], joriy: F2KorAkt): Set<number> {
  const out = new Set<number>();
  for (const a of aktlar) {
    if (a.id === joriy.id || a.holat !== 'tasdiqlangan') continue;
    if (a.oy < joriy.oy || (a.oy === joriy.oy && a.id < joriy.id)) out.add(a.id);
  }
  return out;
}

/** qator_id → hajm yig'indisi (berilgan aktlar bo'yicha). */
export function hajmXaritasi(lines: readonly F2KorQator[], aktIdlar: ReadonlySet<number>): Map<number, number> {
  const m = new Map<number, number>();
  for (const l of lines) {
    if (!aktIdlar.has(l.akt_id)) continue;
    const h = son(f2Miqdor(l));
    if (h == null) continue;
    m.set(l.qator_id, (m.get(l.qator_id) ?? 0) + h);
  }
  return m;
}

export type QatorBajarilish = { smeta: number | null; oldin: number; shu: number; jami: number; qoldiq: number | null; foiz: number | null; oldinUlush: number; shuUlush: number; oshdi: boolean };

/** Bitta smeta qatori: smeta=100%. Ulushlar chizish uchun 0..1 oralig'ida (oshganda ham chiziq 100% da to'xtaydi). */
export function qatorBajarilish(smetaHajm: number | null | undefined, oldin: number, shu: number): QatorBajarilish {
  const smeta = son(smetaHajm);
  const jami = oldin + shu;
  if (smeta == null || smeta <= 0) return { smeta, oldin, shu, jami, qoldiq: smeta == null ? null : smeta - jami, foiz: null, oldinUlush: 0, shuUlush: 0, oshdi: false };
  const oldinUlush = Math.min(1, Math.max(0, oldin / smeta));
  const shuUlush = Math.min(1 - oldinUlush, Math.max(0, shu / smeta));
  return { smeta, oldin, shu, jami, qoldiq: smeta - jami, foiz: (jami / smeta) * 100, oldinUlush, shuUlush, oshdi: jami > smeta * 1.0001 };
}

export type KatGuruh = 'chel' | 'mash' | 'mat' | 'ob' | 'nomalum';
export const KAT_GURUH_NOMI: Record<KatGuruh, string> = { chel: 'ЧЕЛ — mehnat', mash: 'МАШ — mexanizmlar', mat: 'МАТ — materiallar', ob: 'ОБ — jihozlar', nomalum: 'Kategoriya noma’lum' };

/** Smeta kategoriyasi → rang guruhi. КАБ, М/К, БЕЗ СКЛАД — material savati. */
export function katGuruh(kat: string | null | undefined): KatGuruh {
  const k = String(kat ?? '').trim().toUpperCase();
  if (k === 'ЧЕЛ') return 'chel';
  if (k === 'МАШ') return 'mash';
  if (k === 'МАТ' || k === 'КАБ' || k === 'М/К' || k === 'М-К' || k === 'БЕЗ СКЛАД' || k === 'БЕЗСКЛАД') return 'mat';
  if (k === 'ОБ') return 'ob';
  return 'nomalum';
}

export type KatTaqsimot = { guruh: KatGuruh; summa: number; ulush: number; soni: number }[];
export function katTaqsimot(lines: readonly F2KorQator[]): { qismlar: KatTaqsimot; jami: number; summasiz: number } {
  const acc = new Map<KatGuruh, { summa: number; soni: number }>();
  let summasiz = 0;
  for (const l of lines) {
    const s = son(f2Pul(l));
    if (s == null) { summasiz++; continue; }
    const g = katGuruh(l.kat);
    const a = acc.get(g) ?? { summa: 0, soni: 0 };
    a.summa += s; a.soni++; acc.set(g, a);
  }
  const jami = [...acc.values()].reduce((x, a) => x + a.summa, 0);
  const tartib: KatGuruh[] = ['chel', 'mash', 'mat', 'ob', 'nomalum'];
  const qismlar = tartib.filter((g) => acc.has(g)).map((g) => ({ guruh: g, summa: acc.get(g)!.summa, soni: acc.get(g)!.soni, ulush: jami > 0 ? Math.max(0, acc.get(g)!.summa) / jami : 0 }));
  return { qismlar, jami, summasiz };
}

export type BolimJami = { qator_id: number; kod: string | null; nom: string | null; summa: number | null; ulush: number };
/** Eng yuqori darajadagi tugunlar (odatda razdel) — summa va hujjatdagi ulushi. */
export function bolimJamilari(ier: readonly { qator_id: number; daraja: number; kod: string | null; nom: string | null; summa: number | null }[]): BolimJami[] {
  const top = ier.filter((q) => q.daraja === 0);
  const jami = top.reduce((x, q) => x + (q.summa != null && q.summa > 0 ? q.summa : 0), 0);
  return top.map((q) => ({ qator_id: q.qator_id, kod: q.kod, nom: q.nom, summa: q.summa, ulush: jami > 0 && q.summa != null && q.summa > 0 ? q.summa / jami : 0 }));
}

export type F2Tekshiruv = { arifmetik: number; oshgan: number; narxsiz: number; topilmagan: number; zamena: number; qoshimcha: number; manfiy: number };
export function f2Tekshiruv(p: {
  lines: readonly F2KorQator[];
  smetaHajm: ReadonlyMap<number, number | null>;
  oldin: ReadonlyMap<number, number>;
  belgilar?: ReadonlyMap<number, { zamena?: boolean | null; qoshimcha?: boolean | null }>;
}): F2Tekshiruv {
  const r: F2Tekshiruv = { arifmetik: 0, oshgan: 0, narxsiz: 0, topilmagan: 0, zamena: 0, qoshimcha: 0, manfiy: 0 };
  const shu = new Map<number, number>();
  for (const l of p.lines) {
    const q = son(f2Miqdor(l)), n = son(f2BirlikNarx(l)), s = son(f2Pul(l));
    if (q != null && n != null && s != null && Math.abs(q * n - s) > 0.005) r.arifmetik++;
    if (n == null || s == null) r.narxsiz++;
    if (s != null && s < 0) r.manfiy++;
    if (!p.smetaHajm.has(l.qator_id)) r.topilmagan++;
    if (q != null) shu.set(l.qator_id, (shu.get(l.qator_id) ?? 0) + q);
  }
  for (const [id, h] of shu) {
    const b = qatorBajarilish(p.smetaHajm.get(id) ?? null, p.oldin.get(id) ?? 0, h);
    if (b.oshdi) r.oshgan++;
    const bel = p.belgilar?.get(id);
    if (bel?.zamena) r.zamena++;
    if (bel?.qoshimcha) r.qoshimcha++;
  }
  return r;
}

const OY_LOTIN = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const OY_KIRILL = ['январ', 'феврал', 'март', 'апрел', 'май', 'июн', 'июл', 'август', 'сентабр', 'октабр', 'ноябр', 'декабр'];

/** «2026-10-01» → «oktabr 2026» (joriy til bo'yicha; o'zbekcha oy nomlari brauzerga bog'liq emas). */
export function davrNomi(oy: string | null | undefined, locale: string): string {
  if (!oy) return '';
  const m = /^(\d{4})-(\d{2})/.exec(oy);
  if (!m) return oy;
  const yil = m[1], i = Number(m[2]) - 1;
  if (i < 0 || i > 11) return oy.slice(0, 7);
  if (/^uz/i.test(locale)) return `${(/cyrl/i.test(locale) ? OY_KIRILL : OY_LOTIN)[i]} ${yil}`;
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(Number(yil), i, 1));
}
