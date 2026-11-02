/**
 * F2 TAYYORLASH KO'RINISHI — qoralama F2 ni hujjat sifatida ko'rsatish uchun sof hisoblar (egasi 2026-10-25:
 * «har bir F2 ni tayyorlash paytida vizual tushunish»). Yangi biznes formula YO'Q: faqat lib/f2-tayyor natijalari
 * (F2Ish, F2Qator, F2Jami) va lib/f2-hujjat-korinish yordamchilari (qatorBajarilish, katTaqsimot) qayta ishlatiladi.
 *  - har ish bo'yicha «smeta = 100%» chizig'i: tasdiqlangan F2 + boshqa qoralamalar + shu F2;
 *  - qoralama summasining kategoriya taqsimoti;
 *  - BITTA tekshiruv ro'yxati: xato (saqlashni to'sadi) → ogohlantirish → ma'lumot, har bandda qator idlari (o'tish uchun);
 *  - keyingi F2 raqami taklifi (faqat taklif — operator bosmasa hech narsa o'zgarmaydi).
 * NULL ≠ 0: smeta hajmi noma'lum bo'lsa foiz ham noma'lum.
 */
import type { F2Ish, F2Qator, NarxManba } from './f2-tayyor';
import { katTaqsimot, qatorBajarilish, type F2KorQator, type QatorBajarilish } from './f2-hujjat-korinish';
import { mashinistMehnati } from './narx-bildirishnoma';
import type { DAkt, Masala } from './f2-dublikat/tekshiruv';

export type IshMeterQiymat = {
  /** oldin = tasdiqlangan F2 + boshqa qoralamalar; shu = shu F2. */
  b: QatorBajarilish;
  /** Chizish uchun 0..1: tasdiqlangan va qoralama ulushlari (b.oldinUlush = ikkalasining yig'indisi). */
  tasdiqUlush: number;
  qoralamaUlush: number;
  /** Smetadan oshgan foiz (butun, ≥1) — oshmagan yoki smeta noma'lum bo'lsa null. */
  oshish: number | null;
  /** Asl hajmlar: tasdiqlangan F2 va boshqa qoralamalar. */
  tasdiq: number; qoralama: number;
};

/** Ish bo'yicha bajarilish chizig'i: smeta = 100%. `shu` — shu F2 dagi ish hajmi (kiritilmagan/xato bo'lsa 0). */
export function ishMeter(ish: Pick<F2Ish, 'smeta' | 'olingan' | 'qoralama'>, shu: number): IshMeterQiymat {
  const tasdiq = Math.max(0, ish.olingan || 0);
  const qor = Math.max(0, ish.qoralama ?? 0);
  const b = qatorBajarilish(ish.smeta, tasdiq + qor, Math.max(0, shu));
  const tasdiqUlush = b.smeta != null && b.smeta > 0 ? Math.min(b.oldinUlush, tasdiq / b.smeta) : 0;
  const qoralamaUlush = Math.max(0, b.oldinUlush - tasdiqUlush);
  const oshish = b.oshdi && b.foiz != null ? Math.max(1, Math.round(b.foiz - 100)) : null;
  return { b, tasdiqUlush, qoralamaUlush, oshish, tasdiq, qoralama: qor };
}

/** Narx manbasi nishoni — bir xil ko'rinish: tasdiqlangan asos (protokol/oldingi F2) — firuza; smeta — neytral; qo'lda — neytral; narxsiz — sariq. */
export const NARX_MANBA_CHIP: Record<NarxManba, string> = {
  protokol: 'fz-chip--accent', oldingi_f2: 'fz-chip--accent', smeta: '', qolda: '', yoq: 'fz-chip--warn',
};
export const NARX_MANBA_TARTIB: readonly NarxManba[] = ['protokol', 'oldingi_f2', 'smeta', 'qolda', 'yoq'];

/** Qoralama summasining ЧЕЛ/МАШ/МАТ/ОБ taqsimoti (ish qatorlari narxsiz — hisobga kirmaydi; narxsiz resurs — «summasiz»). */
export function qoralamaKatTaqsimot(qatorlar: readonly F2Qator[]): ReturnType<typeof katTaqsimot> {
  const lines: F2KorQator[] = qatorlar.filter((x) => x.tur !== 'bl' && !x.xato)
    .map((x) => ({ akt_id: 0, qator_id: x.id, oy: '', akt_holat: 'qoralama', hajm: x.hajm, narx: x.narx, summa: x.summa, kat: x.kat }));
  return katTaqsimot(lines);
}

/** Shu obyektdagi faol F2 larning eng katta butun raqami + 1 (raqamlar butun son bo'lmasa — taklif yo'q). */
export function keyingiF2Raqam(aktlar: readonly Pick<DAkt, 'raqam' | 'holat'>[]): string | null {
  let max = 0;
  for (const a of aktlar) {
    if (a.holat === 'bekor') continue;
    const r = String(a.raqam ?? '').trim();
    if (/^\d{1,9}$/.test(r)) max = Math.max(max, Number(r));
  }
  return max > 0 ? String(max + 1) : null;
}

export type TekshiruvDaraja = 'bad' | 'warn' | 'info';
export type TekshiruvKod =
  | 'xato_hajm' | 'xato_narx' | 'xato_summa' | 'dublikat_blok'
  | 'smetadan_oshdi' | 'qoldiqdan_oshdi' | 'qoralama_takror' | 'resurs_chegara' | 'arifmetika' | 'dublikat_ogoh' | 'aosr' | 'uchastka' | 'korinmagan'
  | 'narxsiz' | 'axborot' | 'raqamsiz' | 'bosh';
export type TekshiruvBand = {
  kod: TekshiruvKod; daraja: TekshiruvDaraja; soni: number;
  /** Shu bandga tegishli F2 qator idlari (bosilganda birinchisiga o'tiladi). */
  ids: number[];
  /** Dublikat bandlari uchun: tayyor matn va bog'liq aktlar. */
  matn?: string; aktIdlar?: number[];
  /** Uchastka bandi: «nom (soni)» ro'yxati. */
  nomlar?: string[];
};

const XATO_KOD: Record<NonNullable<F2Qator['xato']>, TekshiruvKod> = { HAJM: 'xato_hajm', NARX: 'xato_narx', SUMMA: 'xato_summa' };
const OGOH_KOD: Record<NonNullable<F2Qator['ogoh']>, TekshiruvKod> = {
  SMETADAN_OSHDI: 'smetadan_oshdi', QOLDIQDAN_OSHDI: 'qoldiqdan_oshdi', QORALAMA_TAKROR: 'qoralama_takror',
  RESURS_CHEGARA: 'resurs_chegara', ARIFMETIKA: 'arifmetika', AXBOROT_NARXSIZ: 'axborot',
};
const DARAJA: Record<TekshiruvKod, TekshiruvDaraja> = {
  xato_hajm: 'bad', xato_narx: 'bad', xato_summa: 'bad', dublikat_blok: 'bad',
  smetadan_oshdi: 'warn', qoldiqdan_oshdi: 'warn', qoralama_takror: 'warn', resurs_chegara: 'warn', arifmetika: 'warn',
  dublikat_ogoh: 'warn', aosr: 'warn', uchastka: 'warn', korinmagan: 'warn',
  narxsiz: 'info', axborot: 'info', raqamsiz: 'info', bosh: 'info',
};
const TARTIB: TekshiruvKod[] = ['xato_hajm', 'xato_narx', 'xato_summa', 'dublikat_blok', 'smetadan_oshdi', 'qoldiqdan_oshdi', 'qoralama_takror',
  'resurs_chegara', 'arifmetika', 'dublikat_ogoh', 'aosr', 'uchastka', 'korinmagan', 'narxsiz', 'axborot', 'raqamsiz', 'bosh'];

/**
 * Barcha xato/ogohlantirishlar BITTA ro'yxatda (avval sahifada tarqoq bannerlar edi). Qarorlar o'zgarmaydi:
 * xato — f2Qatorlar dagi `xato` (saqlash to'sig'i), dublikat bloki — lib/f2-dublikat; qolgani faqat ko'rsatiladi.
 */
export function tekshiruvBandlari(p: {
  qatorlar: readonly F2Qator[];
  dublikatlar?: readonly Masala[];
  aosrsizSoni?: number;
  uchastkalar?: readonly { nom: string; soni: number }[];
  korinmagan?: number;
  raqam?: string;
  /** Tahrir rejimida raqam o'zgarmaydi — «raqamsiz» bandi chiqmaydi. */
  raqamQulf?: boolean;
}): TekshiruvBand[] {
  const acc = new Map<TekshiruvKod, TekshiruvBand>();
  const qosh = (kod: TekshiruvKod, id?: number) => {
    const b = acc.get(kod) ?? { kod, daraja: DARAJA[kod], soni: 0, ids: [] };
    b.soni++; if (id != null) b.ids.push(id); acc.set(kod, b);
  };
  for (const x of p.qatorlar) {
    if (x.xato) { qosh(XATO_KOD[x.xato], x.id); continue; }
    // Mashinistlar mehnati (narxi mashina narxi ichida) — f2Jami dagi kabi ogohlantirishga kirmaydi.
    const mashinist = x.tur !== 'bl' && x.ogoh === 'AXBOROT_NARXSIZ' && mashinistMehnati({ nom: x.nom });
    if (x.ogoh && !mashinist) qosh(OGOH_KOD[x.ogoh], x.id);
    if (x.tur !== 'bl' && x.narxsiz && !x.ogoh) qosh('narxsiz', x.id);
  }
  const out: TekshiruvBand[] = [];
  for (const kod of TARTIB) { const b = acc.get(kod); if (b) out.push(b); }
  const dub = (p.dublikatlar ?? []).map((m): TekshiruvBand => ({ kod: m.daraja === 'blok' ? 'dublikat_blok' : 'dublikat_ogoh', daraja: m.daraja === 'blok' ? 'bad' : 'warn', soni: 1, ids: [], matn: m.matn, aktIdlar: [...m.aktIdlar] }));
  if (p.aosrsizSoni) out.push({ kod: 'aosr', daraja: 'warn', soni: p.aosrsizSoni, ids: [] });
  if ((p.uchastkalar?.length ?? 0) > 1) out.push({ kod: 'uchastka', daraja: 'warn', soni: p.uchastkalar!.length, ids: [], nomlar: p.uchastkalar!.map((u) => `${u.nom} (${u.soni})`) });
  if (p.korinmagan) out.push({ kod: 'korinmagan', daraja: 'warn', soni: p.korinmagan, ids: [] });
  if (!p.qatorlar.length) out.push({ kod: 'bosh', daraja: 'info', soni: 0, ids: [] });
  else if (!p.raqamQulf && !String(p.raqam ?? '').trim()) out.push({ kod: 'raqamsiz', daraja: 'info', soni: 1, ids: [] });
  out.push(...dub);
  const og: Record<TekshiruvDaraja, number> = { bad: 0, warn: 1, info: 2 };
  return out.map((b, i) => [b, i] as const).sort((a, c) => og[a[0].daraja] - og[c[0].daraja] || a[1] - c[1]).map(([b]) => b);
}

export function tekshiruvSanoq(b: readonly TekshiruvBand[]): Record<TekshiruvDaraja, number> {
  const r: Record<TekshiruvDaraja, number> = { bad: 0, warn: 0, info: 0 };
  for (const x of b) r[x.daraja] += Math.max(1, x.soni);
  return r;
}
