/**
 * FAKT JURNALI KO'RINISHI — vizual hisoblar (egasi 2026-10-25: «har bir smeta/F2/fakt hujjatini bir qarashda tushunish»).
 * Yangi biznes formula YO'Q: faqat `jurnalQur` natijasi (lib/fakt-jurnal) va holat qatorlaridan
 *  - qator chizig'i: smeta = 100%; tasdiqlangan F2 qismi + F2 ga hali olinmagan fakt + bugungi kiritma (oldindan ko'rish);
 *  - holat muhri (so'z bilan, faqat rang emas);
 *  - xulosa: ishlar holat bo'yicha soni, tugagan bo'limlar, obyekt bajarilishi (qanday tortilgani aniq yoziladi).
 * NULL ≠ 0: smeta noma'lum bo'lsa foiz ham noma'lum (null).
 */
import type { JurnalBolim, JurnalIsh, JurnalQator } from './fakt-jurnal';

const EPS = 1e-9;
const qis = (x: number, max = 1) => Math.min(max, Math.max(0, x));

export type FaktMeter = {
  /** fakt / smeta × 100 (chegirma qatorida ham musbat); smeta noma'lum yoki 0 → null. */
  foiz: number | null;
  /** Chizish uchun ulushlar (0..1, yig'indisi ≤ 1): F2 da olingan, F2 ga hali olinmagan fakt, bugungi kiritma. */
  f2Ulush: number; faktUlush: number; yangiUlush: number;
  /** Kiritmadan keyingi foiz (kiritma bo'lsa). */
  yangiFoiz: number | null;
  oshdi: boolean; yangiOshdi: boolean;
  /** Tasdiqlangan F2 hajmi faktdan ko'p («Fakt = F2» kerak bo'lishi mumkin). */
  f2Oldinda: boolean;
};

/**
 * Qator bajarilish chizig'i. `f2` — tasdiqlangan F2 hajmi (noma'lum → 0 deb chizilmaydi, faqat segment yo'q);
 * `yangiFakt` — kiritmadan keyingi jami fakt (kiritma yo'q → null).
 * Chegirma (manfiy smeta) qatorida hamma qiymat smeta ishorasida o'qiladi (holatTur bilan bir xil).
 */
export function faktMeter(smeta: number | null | undefined, fakt: number, f2: number | null | undefined, yangiFakt: number | null = null): FaktMeter {
  const bos: FaktMeter = { foiz: null, f2Ulush: 0, faktUlush: 0, yangiUlush: 0, yangiFoiz: null, oshdi: false, yangiOshdi: false, f2Oldinda: false };
  if (smeta == null || !Number.isFinite(Number(smeta)) || Number(smeta) === 0) return bos;
  const ish = Number(smeta) < 0 ? -1 : 1;
  const s = Math.abs(Number(smeta));
  const fk = Number(fakt) * ish;
  const f2v = f2 == null || !Number.isFinite(Number(f2)) ? 0 : Number(f2) * ish;
  const yv = yangiFakt == null || !Number.isFinite(yangiFakt) ? null : yangiFakt * ish;
  const f2Ulush = qis(Math.min(f2v, fk) / s);
  const faktUlush = qis((fk - Math.max(0, Math.min(f2v, fk))) / s, 1 - f2Ulush);
  const yangiUlush = yv == null ? 0 : qis((yv - Math.max(fk, 0)) / s, 1 - f2Ulush - faktUlush);
  return {
    foiz: (fk / s) * 100, f2Ulush, faktUlush, yangiUlush,
    yangiFoiz: yv == null ? null : (yv / s) * 100,
    oshdi: fk > s + EPS, yangiOshdi: yv != null && yv > s + EPS,
    f2Oldinda: f2v > fk + EPS,
  };
}

/** Foiz matni: 0.4% → «<1%», 99.6% → «99%» (tugamagan ish 100% ko'rinmasin), noma'lum → «—». */
export function foizMatn(foiz: number | null | undefined): string {
  if (foiz == null || !Number.isFinite(foiz)) return '—';
  if (foiz > 0 && foiz < 1) return '<1%';
  if (foiz < 100 && foiz > 99) return '99%';
  return `${Math.round(foiz)}%`;
}

export type Holat = JurnalQator['holat'];
/** Holat muhri: o'zbekcha kalit (t() orqali tarjima) va fz-stamp varianti. Rang yolg'iz ishlatilmaydi — doim so'z. */
export const HOLAT_MUHR: Record<Holat, { matn: string; cls: string }> = {
  yangi: { matn: 'Boshlanmagan', cls: 'fz-stamp--draft' },
  qisman: { matn: 'Jarayonda', cls: 'fz-stamp--info' },
  tugadi: { matn: 'Bajarildi', cls: 'fz-stamp--ok' },
  oshdi: { matn: 'Smetadan oshdi', cls: 'fz-stamp--warn' },
  smetasiz: { matn: 'Smetasiz', cls: '' },
};
export const HOLAT_TARTIB: readonly Holat[] = ['tugadi', 'qisman', 'yangi', 'oshdi', 'smetasiz'];

export type JurnalXulosa = {
  ishlar: Record<Holat, number>; ishJami: number;
  /** Yuqori darajadagi bo'limlar: jami va to'liq bajarilganlari. */
  bolimJami: number; bolimTugagan: number;
};

export const bolimTugadimi = (b: Pick<JurnalBolim, 'ulush'>) => b.ulush != null && b.ulush >= 1 - EPS;

/** Ishlar (bo'limlar bo'yicha, takrorsiz) holat bo'yicha soni va tugagan yuqori bo'limlar. */
export function jurnalXulosa(bolimlar: readonly JurnalBolim[], bolimIshlari: ReadonlyMap<number, readonly JurnalIsh[]>): JurnalXulosa {
  const ishlar: Record<Holat, number> = { yangi: 0, qisman: 0, tugadi: 0, oshdi: 0, smetasiz: 0 };
  let ishJami = 0;
  for (const b of bolimlar) for (const ish of bolimIshlari.get(b.id) ?? []) { ishlar[ish.holat] += 1; ishJami += 1; }
  const top = bolimlar.filter((b) => b.otaId == null);
  return { ishlar, ishJami, bolimJami: top.length, bolimTugagan: top.filter(bolimTugadimi).length };
}

export type ObyektUlushi = { ulush: number | null; usul: 'summa' | 'ish' | null };

/**
 * Obyekt bajarilishi — yuqori bo'limlar ulushining TORTILGAN o'rtachasi (bo'lim ulushining o'zi `jurnalQur` dan):
 *  - hamma bo'limning smeta summasi ma'lum (> 0) → smeta summasi bilan (usul 'summa');
 *  - aks holda → bo'limdagi ishlar soni bilan (usul 'ish'), ekranda shunday deb yoziladi.
 * Ulushi noma'lum bo'limlar hisobga kirmaydi; hech biri qolmasa → null.
 */
export function obyektUlushi(bolimlar: readonly JurnalBolim[], smetaSumma: (id: number) => number | null | undefined): ObyektUlushi {
  const top = bolimlar.filter((b) => b.otaId == null && b.ulush != null);
  if (!top.length) return { ulush: null, usul: null };
  const summalar = top.map((b) => smetaSumma(b.id));
  const hammasi = summalar.every((s) => s != null && Number.isFinite(s) && s > 0);
  const vazn = (i: number) => (hammasi ? summalar[i]! : top[i].ishSoni);
  const w = top.reduce((a, _, i) => a + vazn(i), 0);
  if (!(w > 0)) return { ulush: null, usul: null };
  return { ulush: top.reduce((a, b, i) => a + vazn(i) * Math.min(b.ulush ?? 0, 1), 0) / w, usul: hammasi ? 'summa' : 'ish' };
}

/** «F2 ga olish mumkin» (server: max(fakt − F2, 0)); holatda yo'q bo'lsa noma'lum (null), 0 emas. */
export function f2OlishMumkin(h: { f2_mumkin_hajm?: number | null } | undefined): number | null {
  const v = h?.f2_mumkin_hajm;
  return v == null || !Number.isFinite(Number(v)) ? null : Number(v);
}
