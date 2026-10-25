/**
 * NARX BO'LIMI KO'RINISHI — vizual hisoblar (egasi 2026-10-25: «har ekran o'z-o'zini tushuntirsin»).
 * Yangi biznes formula YO'Q: server qaytargan nakrutka kaskadi, narx dalili takliflari va RES oldindan
 * ko'rish natijasidan faqat chizish uchun ulushlar va belgilar hisoblanadi. NULL ≠ 0 — noma'lum «—».
 */
import type { NarxManbaTur } from '../api/t2-narx-dalil';

/* ---------- 1. Nakrutka kaskadi — zinapoya (waterfall) ---------- */

export type KaskadQadamTur = 'asos' | 'qosh' | 'jami';
export type KaskadQadam = {
  key: string; label: string; tur: KaskadQadamTur;
  /** Qiymat (qo'shimchada — qo'shilgan summa; jamida — jami). Noma'lum → null. */
  qiymat: number | null;
  /** Chizish: 0..1 oralig'ida chiziq boshi va oxiri (eng katta jamiga nisbatan). */
  boshi: number; oxiri: number;
  /** Qo'shimchaning to'g'ridan-to'g'ri xarajatga nisbati (%); jami/asosda — null. */
  foiz: number | null;
  /** Jami qatori oldingi qadamlar yig'indisiga mos kelmasa (yaxlitlashdan katta farq) — farq summasi. */
  farq: number | null;
};

const son = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const jamimi = (key: string) => key.startsWith('itogo') || key === 'vsego';

/**
 * Kaskad qatorlarini zinapoyaga aylantiradi: birinchi qator — asos, `itogo*`/`vsego` — jami (server qiymati),
 * qolganlari — oldingi jamiga qo'shiladigan qadam. Jami oldingilar yig'indisidan > 1 so'm farq qilsa `farq`.
 */
export function kaskadZinapoya(kaskad: Record<string, unknown>, qatorlar: readonly { key: string; label: string }[]): KaskadQadam[] {
  const xom = qatorlar.map((q, i) => ({ ...q, tur: (i === 0 ? 'asos' : jamimi(q.key) ? 'jami' : 'qosh') as KaskadQadamTur, qiymat: son(kaskad[q.key]) }));
  const asos = xom[0]?.qiymat ?? null;
  let joriy = asos ?? 0;
  const oraliq: { boshi: number; oxiri: number; farq: number | null }[] = [];
  for (const q of xom) {
    if (q.tur === 'asos') { oraliq.push({ boshi: 0, oxiri: joriy, farq: null }); continue; }
    if (q.tur === 'jami') {
      const v = q.qiymat;
      const farq = v != null && Math.abs(v - joriy) > 1 ? v - joriy : null;
      if (v != null) joriy = v;
      oraliq.push({ boshi: 0, oxiri: joriy, farq });
      continue;
    }
    const v = q.qiymat ?? 0;
    oraliq.push({ boshi: joriy, oxiri: joriy + v, farq: null });
    joriy += v;
  }
  const max = Math.max(1e-9, ...oraliq.map((o) => Math.max(o.boshi, o.oxiri)));
  return xom.map((q, i) => {
    const o = oraliq[i];
    const a = Math.min(o.boshi, o.oxiri) / max, b = Math.max(o.boshi, o.oxiri) / max;
    return {
      key: q.key, label: q.label, tur: q.tur, qiymat: q.qiymat,
      boshi: Math.max(0, a), oxiri: Math.max(0, b),
      foiz: q.tur === 'qosh' && q.qiymat != null && asos ? (q.qiymat / asos) * 100 : null,
      farq: o.farq,
    };
  });
}

/** Ustama: yakuniy summa to'g'ridan-to'g'ri xarajatdan necha % ko'p (ВСЕГО / прямые − 1). */
export function umumiyUstama(asos: number | null | undefined, vsego: number | null | undefined): number | null {
  const a = son(asos), v = son(vsego);
  return a == null || v == null || a <= 0 ? null : (v / a - 1) * 100;
}

/** Kategoriya koeffitsienti (1.2345) → ustama % (23.45). */
export const kfUstamaFoiz = (kf: number | null | undefined): number | null => (kf == null || !Number.isFinite(kf) ? null : (kf - 1) * 100);

/* ---------- 2. Narx og'ishi (manba narxi smeta narxiga nisbatan) ---------- */

export type OgishDaraja = 'mos' | 'yaqin' | 'katta' | 'nomalum';
export type NarxOgish = { foiz: number | null; daraja: OgishDaraja; /** Chiziq: markazdan (0.5) chap/o'ngga, ±CHEGARA% → 0/1. */ boshi: number; oxiri: number };

/** Chiziq chegarasi (±50% dan ortiq og'ish chiziq chetiga yopishadi, raqam esa haqiqiy). */
export const OGISH_CHEGARA = 50;
/** «Katta og'ish» chegarasi — sahifa ilgari ham 10% dan ortig'ini ogohlantirardi. */
export const OGISH_KATTA = 10;

export function narxOgish(manbaNarx: number | null | undefined, smetaNarx: number | null | undefined): NarxOgish {
  const m = son(manbaNarx), s = son(smetaNarx);
  if (m == null || s == null || s === 0) return { foiz: null, daraja: 'nomalum', boshi: 0.5, oxiri: 0.5 };
  const foiz = Math.round(((m - s) / Math.abs(s)) * 10000) / 100;
  const nuqta = 0.5 + Math.max(-1, Math.min(1, foiz / OGISH_CHEGARA)) / 2;
  const a = Math.abs(foiz);
  return { foiz, daraja: a < 0.5 ? 'mos' : a <= OGISH_KATTA ? 'yaqin' : 'katta', boshi: Math.min(0.5, nuqta), oxiri: Math.max(0.5, nuqta) };
}

/* ---------- 3. Manba turi chipi ---------- */

/** Qisqa nom (o'zbekcha kalit — t() orqali) va fz-chip varianti. Rasmiy to'liq nom — NARX_MANBA_TUR_NOMI (rus). */
export const MANBA_CHIP: Record<NarxManbaTur, { qisqa: string; cls: string }> = {
  katalog: { qisqa: 'Katalog', cls: 'fz-chip--accent' },
  faktura: { qisqa: 'Faktura', cls: 'fz-chip--accent' },
  kp: { qisqa: 'Tijorat taklifi', cls: '' },
  kalkulyatsiya_mash: { qisqa: 'Mash.-soat kalk.', cls: '' },
  chel_chas: { qisqa: 'Chel.-soat', cls: '' },
  boshqa: { qisqa: 'Boshqa hujjat', cls: 'fz-chip--warn' },
};

/* ---------- 4. Qamrov (dalil / RES) — bo'laklarga ajratish ---------- */

export type Bolak = { kalit: string; soni: number; ulush: number };
/** Sonlarni ulushga: manfiylar 0; jami 0 bo'lsa hamma ulush 0. */
export function bolaklar(qismlar: readonly { kalit: string; soni: number }[]): { bolaklar: Bolak[]; jami: number } {
  const jami = qismlar.reduce((a, q) => a + Math.max(0, q.soni), 0);
  return { jami, bolaklar: qismlar.map((q) => ({ kalit: q.kalit, soni: Math.max(0, q.soni), ulush: jami > 0 ? Math.max(0, q.soni) / jami : 0 })) };
}

/** Narx dalili qamrovi: dalil bilan / taklif bor / hech narsa yo'q (resurslar bo'yicha). */
export function dalilQamrovi(resurslar: number, dalilli: number, taklifli: number) {
  return bolaklar([
    { kalit: 'dalil', soni: dalilli },
    { kalit: 'taklif', soni: taklifli },
    { kalit: 'yoq', soni: Math.max(0, resurslar - dalilli - taklifli) },
  ]);
}
