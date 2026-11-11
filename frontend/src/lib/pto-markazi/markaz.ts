/**
 * «PTO markazi» (B0): bitta obyekt ekrani uchun SOF hisob — ma'lumot kirish, holat chiqish (React/tarmoq yo'q).
 *
 * Yangi dvigatel YO'Q: hamma raqam mavjud o'qishlardan keladi (`t2_obyekt_jami`, `t2_akt_reestr`, F2 import
 * ishlari, Forma-3 ro'yxati). Noma'lum (o'qilmadi) — `null`, hech qachon 0 emas (ROLE_TRUST_MODEL: NULL ≠ 0).
 */
import { t } from '../../i18n/til';
import { bosqich } from '../f2-reestr/reestr';

/** `t2_akt_reestr` qatorining markazga kerak qismi. */
export type MarkazAkt = {
  tur: string;
  holat: string;
  lifecycle_status?: string | null;
  oy: string;
  yaratildi: string;
  hujjat_jami: number | null;
  yozilgan_jami: number | null;
};

export type MarkazKirish = {
  /** `t2_obyekt_jami.jami` (ustamasiz, NDS siz); null — smeta yo'q/o'qilmadi. */
  smetaJami: number | null;
  /** Narxi topilmagan qatorlar soni (jami to'liq emas). */
  narxsiz: number | null;
  /** Akt reestri; null — o'qilmadi. */
  aktlar: readonly MarkazAkt[] | null;
  /** Ochiq F2 import ishlari (tasdiqlanmagan qoralamalar); null — o'qilmadi. */
  importQoralama: number | null;
  /** Obyektdagi Forma-3 soni; null — o'qilmadi. */
  forma3: number | null;
  /** Joriy davr «YYYY-MM» (tanlangan davr yoki bugungi oy). */
  oy: string;
};

export type MarkazHolat = {
  smetaJami: number | null;
  narxsiz: number | null;
  faktQoralama: number | null;
  faktSaqlangan: number | null;
  /** Faktning saqlangan (qoralamadan tashqari, bekor emas) aktlari yig'indisi; akt yo'q — null. */
  faktJami: number | null;
  faktOxirgiSana: string | null;
  importQoralama: number | null;
  f2Qoralama: number | null;
  f2Tasdiq: number | null;
  /** Tasdiqlangan F2 lar yig'indisi; tasdiqlangani yo'q — null. */
  f2TasdiqJami: number | null;
  /** Shu oyda bekor qilinmagan F2 (qoralama ham, tasdiqlangan ham) bormi. */
  f2BuOyda: boolean | null;
  forma3: number | null;
  oy: string;
};

const oyKaliti = (oy: string): string => String(oy ?? '').slice(0, 7);
const bekormi = (a: MarkazAkt): boolean => bosqich({ holat: a.holat, lifecycle_status: a.lifecycle_status ?? null }) === 'bekor';

/** Aktlar yig'indisi: bitta ham ma'lum summa yo'q bo'lsa — null (0 emas). */
function yigindi(aktlar: readonly MarkazAkt[], qiymat: (a: MarkazAkt) => number | null | undefined): number | null {
  let s = 0; let bor = false;
  for (const a of aktlar) {
    const v = qiymat(a);
    if (v == null || !Number.isFinite(Number(v))) continue;
    s += Number(v); bor = true;
  }
  return bor ? s : null;
}

export function markazHolati(k: MarkazKirish): MarkazHolat {
  const a = k.aktlar;
  const bosh: MarkazHolat = {
    smetaJami: k.smetaJami, narxsiz: k.narxsiz,
    faktQoralama: null, faktSaqlangan: null, faktJami: null, faktOxirgiSana: null,
    importQoralama: k.importQoralama,
    f2Qoralama: null, f2Tasdiq: null, f2TasdiqJami: null, f2BuOyda: null,
    forma3: k.forma3, oy: k.oy,
  };
  if (!a) return bosh;
  const fakt = a.filter((x) => x.tur === 'fakt' && !bekormi(x));
  const faktSaqlangan = fakt.filter((x) => x.holat !== 'qoralama');
  const f2 = a.filter((x) => x.tur === 'f2' && !bekormi(x));
  const f2Tasdiq = f2.filter((x) => bosqich({ holat: x.holat, lifecycle_status: x.lifecycle_status ?? null }) === 'tasdiqlangan');
  const sanalar = fakt.map((x) => String(x.yaratildi ?? '').slice(0, 10)).filter(Boolean).sort();
  return {
    ...bosh,
    faktQoralama: fakt.length - faktSaqlangan.length,
    faktSaqlangan: faktSaqlangan.length,
    faktJami: yigindi(faktSaqlangan, (x) => x.yozilgan_jami ?? x.hujjat_jami),
    faktOxirgiSana: sanalar.length ? sanalar[sanalar.length - 1] : null,
    f2Qoralama: f2.length - f2Tasdiq.length,
    f2Tasdiq: f2Tasdiq.length,
    f2TasdiqJami: yigindi(f2Tasdiq, (x) => x.hujjat_jami),
    f2BuOyda: f2.some((x) => oyKaliti(x.oy) === oyKaliti(k.oy)),
  };
}

/* ── Qadam paneli ── */
export type QadamId = 'smeta' | 'fakt' | 'f2-import' | 'f2-yasash' | 'nakopitelniy' | 'f2-paket' | 'slichitelniy';
export type QadamTon = 'ok' | 'warn' | 'info' | 'neytral';
export type QadamHolati = { ton: QadamTon; matn: string };

const son = (n: number | null): n is number => n != null;
const NOMA_LUM = '—';

/** Har qadamning qisqa holat belgisi (arzon o'qishlardan). Noma'lum — «—», neytral. */
export function qadamHolatlari(h: MarkazHolat): Record<QadamId, QadamHolati> {
  const smeta: QadamHolati = h.smetaJami == null
    ? { ton: 'warn', matn: t('Smeta yo‘q') }
    : (h.narxsiz ?? 0) > 0 ? { ton: 'warn', matn: t('{n} qator narxsiz', { n: h.narxsiz as number }) } : { ton: 'ok', matn: t('Smeta tayyor') };
  const fakt: QadamHolati = !son(h.faktQoralama) ? { ton: 'neytral', matn: NOMA_LUM }
    : h.faktQoralama > 0 ? { ton: 'warn', matn: t('{n} qoralama', { n: h.faktQoralama }) }
      : h.faktOxirgiSana ? { ton: 'ok', matn: t('Oxirgi: {sana}', { sana: h.faktOxirgiSana }) } : { ton: 'neytral', matn: t('Hali yo‘q') };
  const imp: QadamHolati = !son(h.importQoralama) ? { ton: 'neytral', matn: NOMA_LUM }
    : h.importQoralama > 0 ? { ton: 'info', matn: t('{n} ochiq import', { n: h.importQoralama }) } : { ton: 'neytral', matn: t('Ochiq yo‘q') };
  const yasash: QadamHolati = !son(h.f2Qoralama) || !son(h.f2Tasdiq) ? { ton: 'neytral', matn: NOMA_LUM }
    : h.f2Qoralama > 0 ? { ton: 'warn', matn: t('{n} qoralama · {m} tasdiq', { n: h.f2Qoralama, m: h.f2Tasdiq }) }
      : h.f2Tasdiq > 0 ? { ton: 'ok', matn: t('{n} tasdiqlangan', { n: h.f2Tasdiq }) } : { ton: 'neytral', matn: t('Hali yo‘q') };
  const nak: QadamHolati = !son(h.forma3) ? { ton: 'neytral', matn: NOMA_LUM }
    : h.forma3 > 0 ? { ton: 'ok', matn: t('{n} ta Forma 3', { n: h.forma3 }) }
      : (h.f2Tasdiq ?? 0) > 0 ? { ton: 'warn', matn: t('Forma 3 yo‘q') } : { ton: 'neytral', matn: t('F2 kutilmoqda') };
  const paket: QadamHolati = !son(h.f2Tasdiq) ? { ton: 'neytral', matn: NOMA_LUM }
    : h.f2Tasdiq > 0 ? { ton: 'ok', matn: t('{n} F2 tayyor', { n: h.f2Tasdiq }) } : { ton: 'neytral', matn: t('F2 kutilmoqda') };
  const sl: QadamHolati = h.smetaJami == null ? { ton: 'neytral', matn: NOMA_LUM } : { ton: 'neytral', matn: t('Eksport') };
  return { smeta, fakt, 'f2-import': imp, 'f2-yasash': yasash, nakopitelniy: nak, 'f2-paket': paket, slichitelniy: sl };
}
