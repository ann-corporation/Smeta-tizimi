/**
 * aosr-ilova.ts — АОСР ILOVALARI (sof mantiq, tarmoq/UI yo'q).
 *   1) Ijro hajm hisobi: akt bilan bog'langan ishlar bo'yicha hajm formulasi va o'lchamlar maydoni
 *      (hajm — mavjud fakt jurnalidan; o'lchamlar fakt jadvalida saqlanmaydi — bo'sh to'ldirish chizig'i, o'ylab topilmaydi).
 *   2) Laboratoriya ilovasi: beton (sinf, hajm → kubik sinovi seriyasi), armatura (Ø/klass) va materiallar sertifikat/pasport ro'yxati.
 * Normativ seriya soni YOZILMAYDI (aniq norma PTO tasdig'igacha bo'sh qoladi — ijro-qoida.ts bilan bir xil yondashuv).
 */
import type { AosrCoverage } from '../api/t2-aosr';
import { labTalablari, materialTokenlar, type LabTalab } from './ijro-qoida';

/* ── Hajm hisobi ─────────────────────────────────────────────────── */
export type AosrHajmQator = {
  nom: string;
  birlik: string;
  /** Hajm formulasi (birlikdan): V = L × B × H va h.k. Birlik noma'lum bo'lsa — bo'sh. */
  formula: string;
  /** Fakt jurnali bo'yicha hajm (NULL = noma'lum, 0 emas). */
  faktHajm: number | null;
  /** Aktga bog'langan hajm (t2_aosr_bog.hajm), NULL = ko'rsatilmagan. */
  aktHajmi: number | null;
};

const birlikKaliti = (b: string | null | undefined): string => String(b ?? '').toLowerCase().replace(/[\s.]/g, '').replace(/³/g, '3').replace(/²/g, '2').replace(/m/g, 'м');

/** Birlik → hajm formulasi. Noma'lum birlik — formula yo'q (to'ldirish chizig'i). */
export function hajmFormulasi(birlik: string | null | undefined): string {
  const b = birlikKaliti(birlik);
  if (!b) return '';
  if (/^(м3|куб|кубм)/.test(b)) return 'V = L × B × H';
  if (/^(м2|кв|квм)/.test(b)) return 'S = L × B';
  if (/^(пм|м$|мп|погм)/.test(b)) return 'L = Σ длин';
  if (/^(т|тонн|кг)/.test(b)) return 'M = Σ (L × масса 1 п.м)';
  if (/^(шт|шт\.|ед)/.test(b)) return 'N = количество';
  return '';
}

export function hajmQatorlari(
  ishlar: readonly Pick<AosrCoverage, 'nom' | 'birlik' | 'fakt_hajm' | 'kat'>[],
  aktHajmlari?: ReadonlyMap<number, number | null> | null, qatorIds?: readonly number[],
): AosrHajmQator[] {
  const out: AosrHajmQator[] = [];
  ishlar.forEach((c, i) => {
    if (c.kat === 'mat' || c.kat === 'ob') return; // hajm hisobi — ish qatorlari uchun
    const id = qatorIds?.[i];
    const fakt = c.fakt_hajm == null || !Number.isFinite(Number(c.fakt_hajm)) ? null : Number(c.fakt_hajm);
    const akt = id != null ? aktHajmlari?.get(id) ?? null : null;
    out.push({ nom: String(c.nom ?? ''), birlik: String(c.birlik ?? ''), formula: hajmFormulasi(c.birlik), faktHajm: fakt, aktHajmi: akt == null ? null : Number(akt) });
  });
  return out;
}

/* ── Material belgilari: beton sinfi, armatura Ø/klass ───────────── */
const BETON_SINFLARI = new Set(['7.5', '10', '12.5', '15', '20', '22.5', '25', '27.5', '30', '35', '40', '45', '50', '55', '60']);

/** «Бетон B25 W6 F150», «бетон класса В 30» → { sinf: 'B25', suv: 'W6', sovuq: 'F150' }; marka М350 — faqat «бетон» so'zi bo'lsa. */
export function betonBelgilari(matn: string | null | undefined): { sinf: string | null; marka: string | null; suv: string | null; sovuq: string | null } {
  const s = String(matn ?? '');
  let sinf: string | null = null;
  for (const m of s.matchAll(/(?<![A-Za-zА-Яа-яЁё0-9])[BВ]\s?-?(\d{1,2}(?:[.,]5)?)(?![0-9])/g)) {
    const n = m[1].replace(',', '.');
    if (BETON_SINFLARI.has(n)) { sinf = `B${n.replace('.', ',')}`; break; }
  }
  const bor = /бетон|beton/i.test(s);
  const marka = bor ? /(?<![A-Za-zА-Яа-яЁё0-9])[МM]\s?-?(\d{3})(?![0-9])/.exec(s)?.[1] ?? null : null;
  const suv = /(?<![A-Za-zА-Яа-яЁё0-9])W\s?(\d{1,2})(?![0-9])/.exec(s)?.[1] ?? null;
  const sovuq = /(?<![A-Za-zА-Яа-яЁё0-9])F\s?(\d{2,3})(?![0-9])/.exec(s)?.[1] ?? null;
  return { sinf, marka: marka ? `М${marka}` : null, suv: suv ? `W${suv}` : null, sovuq: sovuq ? `F${sovuq}` : null };
}

const ARM_KLASS = /(?<![A-Za-zА-Яа-яЁё0-9])[АA]\s?-?\s?(240|400|500|600|800|1000|I{1,3}|IV|V)\s?([СC])?(?![A-Za-zА-Яа-яЁё0-9])/g;
/** Armatura: diametrlar (Ø12, ф16, d=10) va klass (А500С, А-III). */
export function armaturaBelgilari(matn: string | null | undefined): { diametrlar: number[]; klasslar: string[] } {
  const s = String(matn ?? '');
  const dia = new Set<number>();
  for (const m of s.matchAll(/(?:Ø|ø|⌀|ф|Ф|d\s?=?\s?)\s?(\d{1,2})(?![0-9])/g)) { const n = Number(m[1]); if (n >= 4 && n <= 40) dia.add(n); }
  const kl = new Set<string>();
  for (const m of s.matchAll(ARM_KLASS)) kl.add(`А${m[1].toUpperCase()}${m[2] ? 'С' : ''}`);
  return { diametrlar: [...dia].sort((a, b) => a - b), klasslar: [...kl] };
}

/* ── Laboratoriya ilovasi ────────────────────────────────────────── */
export type AosrLabIlova = {
  /** Beton ishi bor akt: sinf va hajm (matn, birlik bilan) — kubik sinovi seriyasi shu bo'yicha. */
  beton: { sinf: string | null; qoshimcha: string; hajm: string | null } | null;
  armatura: { diametrlar: number[]; klasslar: string[] } | null;
  /** Sertifikat/pasport talab qilinadigan materiallar (aktning 3-bo'limi). */
  materiallar: string[];
  /** Kalit so'z qoidasidan: qaysi laboratoriya sinovlari kerak (beton/grunt/payvand). */
  talablar: LabTalab[];
};

const hajmMatni = (v: number, birlik: string) => `${v.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ${birlik}`.trim();

export function labIlovaQur(
  akt: { ish_nomi?: string | null; ish_tavsifi?: string | null; materiallar?: string | null },
  ishlar: readonly Pick<AosrCoverage, 'nom' | 'birlik' | 'fakt_hajm' | 'kat'>[] = [],
): AosrLabIlova | null {
  const matn = [akt.ish_nomi, akt.ish_tavsifi, akt.materiallar].filter(Boolean).join('\n');
  const talablar = labTalablari(akt.ish_nomi, akt.ish_tavsifi, akt.materiallar);
  const betonBor = talablar.includes('beton');
  let beton: AosrLabIlova['beton'] = null;
  if (betonBor) {
    const b = betonBelgilari(matn);
    const betonIshlar = ishlar.filter((c) => c.kat !== 'mat' && c.kat !== 'ob' && /бетон|монолит|beton/i.test(String(c.nom ?? '')) && /м3|м³|куб/i.test(String(c.birlik ?? '').replace(/\s/g, '')) && Number(c.fakt_hajm) > 0);
    const jami = betonIshlar.reduce((x, c) => x + Number(c.fakt_hajm), 0);
    beton = {
      sinf: b.sinf,
      qoshimcha: [b.marka, b.suv, b.sovuq].filter(Boolean).join(' '),
      hajm: betonIshlar.length ? hajmMatni(Math.round(jami * 1000) / 1000, 'м3') : null,
    };
  }
  const arm = armaturaBelgilari(matn);
  const armatura = /армир|арматур|armatur/i.test(matn) || arm.klasslar.length || arm.diametrlar.length ? arm : null;
  const materiallar = materialTokenlar(akt.materiallar);
  if (!beton && !armatura && !materiallar.length && !talablar.length) return null;
  return { beton, armatura, materiallar, talablar };
}

/** «Серия контрольных образцов» uchun laboratoriya so'rovi turi (sinov-maslahat.ts kalitlari). Noma'lum tur — undefined. */
export const LAB_SOROV_TURI: Partial<Record<LabTalab, string>> = { beton: 'beton_kub', grunt: 'grunt_zichlik' };
