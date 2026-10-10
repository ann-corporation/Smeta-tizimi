/**
 * narx-dalil/taklif.ts — smeta resurslari uchun narx manbasi TAKLIFI (egasi Q4, 2026-10-01).
 *
 * Qoidalar (egasi):
 *   - МАШ (mashina-mexanizm): bazadagi mos kalkulyatsiyalar ichidan ENG QIMMATI taklif qilinadi;
 *   - ЧЕЛ (чел-час): eng yangi e'lon (yil, kvartal); obyekt regioni berilsa — shu region ustun;
 *   - МАТ va boshqalar: eng yangi katalog kvartali; katalog bo'lmasa — eng yangi faktura/КП.
 * Egasi 2026-10-10: kod narx identitysi emas; nom, xarakteristika va birlik tekshiriladi. Taklif AVTOMATIK YOZILMAYDI —
 * operator ko'rib, tanlab tasdiqlaydi (`sbNarxDalilBogla`). Narxsiz pozitsiya taklif qilinmaydi.
 */
import { characteristics, gateFailure, normName } from '../smeta-studio/resource-match';
import { birlikKalit } from './semantik';
import type { NarxTaklif, NarxManbaTur } from '../../api/t2-narx-dalil';

export type TaklifNatija = {
  qator_id: number;
  kat: string | null;
  smeta_narx: number | null;
  tavsiya: NarxTaklif;
  /** Boshqa nomzodlar (tavsiyadan keyingi tartibda). */
  boshqalar: NarxTaklif[];
  /** (manba − smeta) / smeta × 100; smeta narxi yo'q bo'lsa null. */
  farqFoiz: number | null;
  sabab: string;
};

const davr = (t: NarxTaklif) => (t.yil ?? 0) * 10 + (t.kvartal ?? 0);
const sana = (t: NarxTaklif) => t.manba_sana ?? '';
const katNorm = (k: string | null) => (k ?? '').trim().toUpperCase();
const MAT_MANBA_TARTIB: Record<NarxManbaTur, number> = { katalog: 0, faktura: 1, kp: 2, kalkulyatsiya_mash: 3, chel_chas: 4, boshqa: 5 };

function solishtirgich(kat: string, region: string | null): (a: NarxTaklif, b: NarxTaklif) => number {
  // Historical `moslik: kod` is not a matching proof and receives no priority.
  const moslik = (a: NarxTaklif, b: NarxTaklif) => Number(normName(b.nom) === normName(b.manba_nom_qator)) - Number(normName(a.nom) === normName(a.manba_nom_qator));
  const yangi = (a: NarxTaklif, b: NarxTaklif) => davr(b) - davr(a) || sana(b).localeCompare(sana(a));
  if (kat === 'МАШ') return (a, b) => moslik(a, b) || b.manba_narx - a.manba_narx || yangi(a, b);
  if (kat === 'ЧЕЛ') {
    const r = (t: NarxTaklif) => (region && t.region && t.region.trim().toLowerCase() === region.trim().toLowerCase() ? 0 : 1);
    // Bir davrda bir nechta ijtimoiy soliq varianti — amaldagi 12% birinchi, 25% muqobil sifatida qoladi (2026-10-03).
    const v = (t: NarxTaklif) => (t.narx_varianti === 'ijtimoiy_12' ? 0 : t.narx_varianti === 'ijtimoiy_25' ? 2 : 1);
    return (a, b) => moslik(a, b) || r(a) - r(b) || yangi(a, b) || v(a) - v(b);
  }
  return (a, b) => moslik(a, b) || MAT_MANBA_TARTIB[a.manba_tur] - MAT_MANBA_TARTIB[b.manba_tur] || yangi(a, b);
}

const SABAB: Record<string, string> = {
  МАШ: 'маш.-час: наибольшая стоимость среди подтвержденных калькуляций',
  ЧЕЛ: 'чел.-час: регион объекта, последняя публикация (квартал)',
};

/** Qator bo'yicha nomzodlarni guruhlab, qoidaga ko'ra tavsiyani tanlaydi. */
export function narxTakliflari(takliflar: readonly NarxTaklif[], opts: { region?: string | null } = {}): TaklifNatija[] {
  const guruh = new Map<number, NarxTaklif[]>();
  for (const t of takliflar) {
    if (t.manba_narx == null || !Number.isFinite(Number(t.manba_narx))) continue;
    if (!t.nom || !t.manba_nom_qator || !t.birlik || !t.manba_birlik || birlikKalit(t.birlik) !== birlikKalit(t.manba_birlik)) continue;
    const src = characteristics(t.nom), cand = characteristics(t.manba_nom_qator);
    // Published worker-hour tables name rows by region, rather than by a material product.
    // This explicit source kind/unit/worker/region proof never covers machine operators.
    const regionalWorkers = t.manba_tur === 'chel_chas' && t.moslik === 'hudud' && src.family === 'worker-labour'
      && !!t.region && normName(t.manba_nom_qator) === normName(t.region) && birlikKalit(t.birlik) === birlikKalit('чел-ч');
    if (!regionalWorkers && (gateFailure(src, cand, null, null, normName(t.manba_nom_qator)) || !src.words.some(w => cand.words.includes(w)))) continue;
    const g = guruh.get(t.qator_id);
    if (g) g.push(t); else guruh.set(t.qator_id, [t]);
  }
  const natija: TaklifNatija[] = [];
  for (const [qator_id, g] of guruh) {
    const kat = katNorm(g[0].kat);
    const tartib = [...g].sort(solishtirgich(kat, opts.region ?? null));
    const tavsiya = tartib[0];
    const smeta = g[0].smeta_narx == null ? null : Number(g[0].smeta_narx);
    natija.push({
      qator_id, kat: g[0].kat, smeta_narx: smeta, tavsiya, boshqalar: tartib.slice(1),
      farqFoiz: smeta ? Math.round(((Number(tavsiya.manba_narx) - smeta) / smeta) * 10000) / 100 : null,
      sabab: SABAB[kat] ?? (tavsiya.manba_tur === 'katalog' ? 'материал: последний квартал каталога' : 'последний документ поставщика'),
    });
  }
  return natija.sort((a, b) => a.qator_id - b.qator_id);
}
