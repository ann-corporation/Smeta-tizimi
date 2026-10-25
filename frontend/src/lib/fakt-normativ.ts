/**
 * Fakt oynasidagi zamena uchun NORMATIV KATALOG ko'prigi (egasi 2026-10-25: «faqat nom bo'yicha qidirish yetarli emas —
 * normativ to'plami daraxtidan tanlash; tanlanganda ish o'z normativ resurslari bilan to'lsin»).
 *
 * Manba — Smeta Studio ishlatadigan o'sha o'zgarmas katalog (R2: /api/norm-library), yangi manba yo'q.
 * Hisob Smeta Studio bilan bir xil: resurs hajmi = ish hajmi × norma ÷ masshtab (norma «100 м3» kabi birlikda).
 * Masshtab (birlik asosi) manbada tasdiqlanmagan bo'lsa norma TO'QILMAYDI — bo'sh qoladi va ogohlantiriladi.
 * Narx bu yerda qo'yilmaydi: IshAbcModal mavjud narx takliflari tartibini (shu smeta → shartnoma → boshqa) qo'llaydi.
 */
import type { NormDetail } from './catalog-extraction/norm-remote';
import type { NormWork } from './catalog-extraction/norm-catalog';
import { NormLibraryCatalog, type StudioNormCatalog } from './catalog-extraction/norm-library';
import { catalogueBasis } from './smeta-studio/catalog-bridge';
import { nakrutkaKategoriyasi } from './smeta-studio/narx-yigish';
import { resourceUnitText } from './smeta-studio/resource-units';
import { ishIndeksi } from './smeta-ai/worker';
import { katAniqla, type AbcResurs } from './ish-abc';

type Recipe = NormDetail['recipes'][number];

let ochilmoqda: Promise<StudioNormCatalog> | null = null;
/** Katalogni bir marta ochadi (sahifa davomida kesh); xato bo'lsa keyingi chaqiruv qayta urinadi. */
export function normKatalogOch(): Promise<StudioNormCatalog> {
  if (!ochilmoqda) ochilmoqda = NormLibraryCatalog.open().catch((e) => { ochilmoqda = null; throw e; });
  return ochilmoqda;
}

/** Normativ norma (masshtab birligiga) → ish birligiga norma (norma ÷ masshtab). Noma'lum bo'lsa ''. */
export function normaBirlikka(norm: string | null | undefined, scale: string | null | undefined): string {
  const n = Number(norm); const s = Number(scale);
  if (norm == null || scale == null || !Number.isFinite(n) || !Number.isFinite(s) || !(s > 0)) return '';
  return String(Number((n / s).toFixed(9)));
}

const resursBirligi = (k: Pick<StudioNormCatalog, 'unit'>, code: string | null) => resourceUnitText(code) ?? k.unit(code)?.text ?? '';

/** Bitta normativ resurs → ABC resurs qatori (faqat aniq aniqlangan resurs; noaniq — null). */
export function normativResurs(k: Pick<StudioNormCatalog, 'unit'>, r: Recipe, scale: string | null): AbcResurs | null {
  if (r.resourceStatus !== 'EXACT' || !r.candidates[0]) return null;
  const res = r.candidates[0];
  const birlik = resursBirligi(k, res.unitCode);
  const nk = nakrutkaKategoriyasi(res, (c) => resourceUnitText(c) ?? k.unit(c)?.text ?? null);
  return { kat: katAniqla(nk, null, birlik), kod: res.code ?? '', nom: (res.name ?? '').trim(), birlik, norma: normaBirlikka(r.norm, scale), hajm: '', narx: '', manba: 'qolda' };
}

export type NormativIsh = { ish: { kod: string; nom: string; birlik: string }; resurslar: AbcResurs[]; ogohlantirish: string[] };

/** Tanlangan normativ ish — butun resurs retsepti bilan (barcha sahifalar). */
export async function normativIshOl(k: StudioNormCatalog, workId: string): Promise<NormativIsh> {
  await k.load(workId);
  const first = k.detail(workId, 0);
  const basis = catalogueBasis(k, first.work.unitCode);
  const scale = basis.scale != null ? String(basis.scale) : null;
  const recipes: Recipe[] = [...first.recipes];
  for (let p = 1; p * 25 < first.recipeCount; p++) recipes.push(...k.detail(workId, p).recipes);
  const resurslar: AbcResurs[] = []; let noaniq = 0; let normasiz = 0;
  for (const r of recipes) {
    const x = normativResurs(k, r, scale);
    if (!x) { noaniq++; continue; }
    if (!x.norma) normasiz++;
    resurslar.push(x);
  }
  const ogohlantirish: string[] = [];
  if (scale == null) ogohlantirish.push('NORMA_MASSHTABI_NOMALUM');
  else if (normasiz) ogohlantirish.push('NORMASIZ_RESURS');
  if (noaniq) ogohlantirish.push('NOANIQ_RESURS');
  const birlik = basis.unitLabel ?? k.unit(first.work.unitCode)?.text ?? '';
  return { ish: { kod: first.work.code, nom: (first.work.name ?? '').trim(), birlik }, resurslar, ogohlantirish: [...ogohlantirish, ...(noaniq ? [`n:${noaniq}`] : [])] };
}

/** Katalog ishini id bo'yicha topish (AI taklifi — faqat katalogda BOR pozitsiya). */
export function katalogIshi(k: StudioNormCatalog, id: string, kod?: string): NormWork | null {
  const x = ishIndeksi(k);
  const i = x?.byId.get(id);
  if (x && i != null) return x.works[i];
  if (kod) return k.search(kod, 0).rows.find((w) => w.id === id) ?? null;
  return null;
}
