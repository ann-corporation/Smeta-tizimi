/**
 * Narxlash bosqichi (egasi 2026-10-13): LRV tayyor bo'lgach resurslar RES kabi bitta ro'yxatga yig'iladi va har biriga
 * MANBALARDAN asoslangan narx topiladi. Smeta nomi va katalog nomi boshqacha yoziladi, shuning uchun:
 *
 *   1. Nomzodlar — uchta manbadan: platforma narx katalogi (BM25 ma'no qidiruvi + xarakteristika darvozasi),
 *      xarakteristika dvigateli (resource-match) va kompaniyaning o'z smetalaridagi narxlar (nom + birlik).
 *      Darvoza (klass, diametr, kesim, marka, fraksiya, birlik) o'tmagan nomzod HECH QACHON taklif qilinmaydi.
 *   2. Aniq moslik (EXACT/HIGH) — darhol; qolganlari AI ga: AI faqat berilgan nomzodlar ichidan tanlaydi,
 *      topa olmasa katalogda qanday yozilishini taklif qiladi va tizim QAYTA qidiradi (2-bosqich).
 *   3. Har narx — dalil bilan (manba, davr, hudud, NDS siz, AI sababi); bitta "Bekor qilish" bilan qaytariladi.
 *
 * Narx hech qachon o'ylab topilmaydi: nomzod bo'lmasa resurs narxsiz qoladi va ro'yxatda ko'rinadi.
 */
import { MatnIndeks } from '../smeta-ai/matn-qidiruv';
import type { NarxNomzodi, NarxSorovi, NarxTanlov } from '../smeta-ai/protokol';
import type { KatalogQatori } from '../narx-katalog/types';
import type { NakrutkaKat } from '../nakrutka-podval';
import { isBezSkladNom } from '../resurs-kategoriyasi/bez-sklad';
import { resourceFacts } from '../resource-semantics';
import type { DocCalc } from './calc';
import type { StudioCommand } from './commands';
import type { CatalogResource, EstimateDoc, PriceBasis } from './model';
import { characteristics, gateFailure, matchResource, normName, priceUnitFactor, type MatchCatalog, type MatchResult } from './resource-match';
import { catalogEvidence } from './price-lookup';

type UnitText = (code: string | null) => string | null;
export type ResursQatori = { occurrenceId: string; recipeId: string };
export type ResursGuruh = {
  key: string; nom: string; birlik: string | null; kat: NakrutkaKat | null; resurs: CatalogResource;
  qatorlar: ResursQatori[]; miqdor: number | null;
  /** Price when every line has the same one; null if none or mixed. */
  narx: string | null; narxsiz: number; aralash: boolean; basis: PriceBasis | null; dalil: string | null;
};

/** Cost category for the markup cascade: ЧЕЛ/МАШ/ОБ from resource semantics, materials split into КАБ, М/К, БЕЗ СКЛАД, МАТ. */
export function nakrutkaKategoriyasi(r: CatalogResource | null, unitText?: UnitText): NakrutkaKat | null {
  const cat = resourceFacts(r, unitText).costCategory;
  if (cat !== 'МАТ') return cat;
  // Same grouping as the RES material sections (abc-hujjat materialGroup): С157 cable products, С121 metal structures.
  const code = (r?.code ?? '').toUpperCase().replace(/^C/, 'С');
  if (/^С157-/.test(code) || /(?:^|\s)КАБЕЛ/.test(normName(r?.name))) return 'КАБ';
  if (/^С121-/.test(code)) return 'М/К';
  if (isBezSkladNom(r?.name ?? '', unitText?.(r?.unitCode ?? null) ?? null)) return 'БЕЗ СКЛАД';
  return 'МАТ';
}

/** LRV → unique resources (name + unit + category), the way an RES lists them. */
export function resursGuruhlari(doc: EstimateDoc, calc: DocCalc, unitText: UnitText): ResursGuruh[] {
  const by = new Map<string, ResursGuruh & { narxlar: Set<string> }>();
  for (const o of Object.values(doc.occurrences)) for (const l of calc.occurrences[o.id]?.lines ?? []) {
    if (!l.resource) continue;
    const birlik = unitText(l.resource.unitCode);
    const kat = nakrutkaKategoriyasi(l.resource, unitText);
    const key = [normName(l.resource.name), normName(birlik), kat ?? ''].join('\u0001');
    let g = by.get(key);
    if (!g) {
      g = { key, nom: l.resource.name ?? '', birlik, kat, resurs: l.resource, qatorlar: [], miqdor: 0, narx: null, narxsiz: 0, aralash: false,
        basis: null, dalil: null, narxlar: new Set() };
      by.set(key, g);
    }
    g.qatorlar.push({ occurrenceId: o.id, recipeId: l.recipeId });
    g.miqdor = g.miqdor == null || l.quantity == null ? null : Math.round((g.miqdor + Number(l.quantity)) * 1e6) / 1e6;
    if (l.price == null) g.narxsiz++;
    else {
      g.narxlar.add(l.price);
      g.basis = l.priceBasis;
      g.dalil = o.overrides[l.recipeId]?.price?.evidence ?? g.dalil;
    }
  }
  const KAT_TARTIB: Array<NakrutkaKat | null> = ['ЧЕЛ', 'МАШ', 'МАТ', 'БЕЗ СКЛАД', 'М/К', 'КАБ', 'ОБ', null];
  return [...by.values()].map(({ narxlar, ...g }) => ({ ...g, narx: !g.narxsiz && narxlar.size === 1 ? [...narxlar][0] : null, aralash: narxlar.size > 1 || (narxlar.size > 0 && g.narxsiz > 0) }))
    .sort((a, b) => KAT_TARTIB.indexOf(a.kat) - KAT_TARTIB.indexOf(b.kat) || a.nom.localeCompare(b.nom, 'ru'));
}

/** Materials and equipment are priced from catalogues; labour/machine hours from the hour catalogue. */
export const katalogdanNarxlanadi = (g: Pick<ResursGuruh, 'kat'>) => g.kat !== 'ЧЕЛ' && g.kat !== 'МАШ';

/** A candidate with its source row (price already in the resource's unit). */
export type NarxNomzod = NarxNomzodi & { tur: 'katalog' | 'kompaniya'; row: KatalogQatori; konversiya: string | null };

const PRICE_INDEX = new WeakMap<MatchCatalog, MatnIndeks>();
/** BM25 over catalogue names (+ group title as context), built once per catalogue view. */
export function narxIndeksi(cat: MatchCatalog): MatnIndeks {
  let x = PRICE_INDEX.get(cat);
  if (!x) {
    const docs = Array.from({ length: cat.size }, (_, i) => ({ id: i, matn: cat.name(i), kontekst: cat.row(i).guruh ?? null }));
    x = new MatnIndeks(docs);
    PRICE_INDEX.set(cat, x);
  }
  return x;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
export function qatorNomzodi(row: KatalogQatori, unit: string | null, tur: NarxNomzod['tur']): NarxNomzod | null {
  if (row.narx == null || row.nds_holati === 'nds_bilan') return null;
  const factor = priceUnitFactor(row.birlik, unit);
  if (unit && row.birlik && factor == null) return null;
  const narx = round2(row.narx * (factor ?? 1));
  const konversiya = factor != null && factor !== 1 ? `${row.narx}/${row.birlik} × ${factor} = ${narx}/${unit}` : null;
  const davr = row.yil ? `${row.yil}${row.kvartal ? `-${row.kvartal}kv` : ''}` : null;
  const manba = tur === 'katalog' ? ['katalog', row.manba_nom, davr, row.hudud].filter(Boolean).join(', ') : `kompaniya smetasi: ${row.manba_nom}`;
  return { id: `${tur === 'katalog' ? 'k' : 's'}${row.id}`, nom: row.nom, birlik: unit ?? row.birlik, narx, manba: manba.slice(0, 160), tur, row, konversiya };
}

/**
 * Candidate pool for one resource: characteristic-gated catalogue rows (deterministic matcher + BM25 meaning search with
 * the resource name and any extra phrasings), and the company's own estimate prices. Region-specific rows win duplicates.
 */
export function narxNomzodlari(g: Pick<ResursGuruh, 'nom' | 'birlik'>, cat: MatchCatalog | null, kompaniya: MatchResult | null,
  hudud: string | null, iboralar: string[] = [], limit = 12): NarxNomzod[] {
  const out = new Map<string, NarxNomzod>();
  const add = (n: NarxNomzod | null, regional: boolean) => {
    if (!n) return;
    const k = `${n.tur}\u0001${normName(n.nom)}\u0001${normName(n.birlik)}`;
    const prev = out.get(k);
    if (!prev || (regional && prev.row.hudud_kalit !== hudud)) out.set(k, n);
  };
  if (cat) {
    const src = characteristics(g.nom);
    for (const c of matchResource(cat, g.nom, g.birlik, hudud, 8).candidates) add(qatorNomzodi({ ...c.row, narx: c.row.unitConversion?.sourcePrice ?? c.row.narx, birlik: c.row.unitConversion?.sourceUnit ?? c.row.birlik }, g.birlik, 'katalog'), c.regional);
    for (const h of narxIndeksi(cat).qidir([g.nom, ...iboralar], 80)) {
      if (cat.price(h.id) == null) continue;
      if (gateFailure(src, characteristics(cat.name(h.id)), g.birlik, cat.unit(h.id), normName(cat.name(h.id)))) continue;
      add(qatorNomzodi(cat.row(h.id), g.birlik, 'katalog'), !!hudud && cat.region(h.id) === hudud);
      if (out.size >= limit * 2) break;
    }
  }
  for (const c of kompaniya?.candidates.slice(0, 5) ?? []) add(qatorNomzodi({ ...c.row, narx: c.row.unitConversion?.sourcePrice ?? c.row.narx, birlik: c.row.unitConversion?.sourceUnit ?? c.row.birlik }, g.birlik, 'kompaniya'), false);
  return [...out.values()].slice(0, limit);
}

/** SET_PRICE for every line of the group, with full provenance (+ the AI's reason when it chose). */
export function narxBuyruqlari(g: Pick<ResursGuruh, 'qatorlar'>, n: NarxNomzod, sabab = ''): StudioCommand[] {
  const evidence = [n.tur === 'katalog' ? catalogEvidence(n.row) : `Kompaniya smetasi · ${n.row.manba_nom} · ${n.row.nom}${n.row.birlik ? `, ${n.row.birlik}` : ''}`,
    n.konversiya ? `birlik konversiyasi: ${n.konversiya}` : null, 'NDS siz', sabab ? `Tanlash sababi: ${sabab}` : null].filter(Boolean).join(' · ').slice(0, 600);
  const basis: PriceBasis = n.tur === 'katalog' ? 'CATALOG_CANDIDATE' : 'CONTRACT_DRAFT';
  const sourcePriceId = n.tur === 'katalog' ? `narx-katalog:${n.row.id}` : `kompaniya-smeta-qator:${n.row.id}`;
  return g.qatorlar.map(q => ({ type: 'SET_PRICE' as const, occurrenceId: q.occurrenceId, recipeId: q.recipeId,
    price: { value: String(n.narx), basis, evidence, sourcePriceId } }));
}

export type AiNarxNatija = { key: string; nomzod: NarxNomzod | null; ishonch: NarxTanlov['ishonch']; sabab: string; nomzodlar: NarxNomzod[] };

/**
 * AI pricing in rounds: (1) candidates from the resource name; (2) for those the model could not match, candidates from the
 * model's own catalogue-style phrasings. Batches of ≤40 resources; the model may only pick a candidate id it was sent.
 */
export async function aiNarxlash(guruhlar: ResursGuruh[], nomzodlar: (g: ResursGuruh, iboralar: string[]) => NarxNomzod[],
  tanla: (sorovlar: NarxSorovi[]) => Promise<NarxTanlov[] | null>, onProgress?: (done: number, total: number) => void): Promise<AiNarxNatija[]> {
  const natija = new Map<string, AiNarxNatija>();
  let navbat = guruhlar.map(g => ({ g, iboralar: [] as string[] }));
  for (let round = 0; round < 2 && navbat.length; round++) {
    const keyingi: typeof navbat = [];
    for (let i = 0; i < navbat.length; i += 40) {
      const part = navbat.slice(i, i + 40).map(x => ({ ...x, n: nomzodlar(x.g, x.iboralar) }));
      const sorov = part.filter(x => x.n.length).map((x, j): NarxSorovi => ({ id: `r${i + j}`, nom: x.g.nom, birlik: x.g.birlik, kat: x.g.kat,
        nomzodlar: x.n.map(({ id, nom, birlik, narx, manba }) => ({ id, nom, birlik, narx, manba })) }));
      const byId = new Map(sorov.map((s, j) => [s.id, part.filter(x => x.n.length)[j]]));
      const javob = sorov.length ? await tanla(sorov) : [];
      if (javob == null) throw new Error('AI_UNAVAILABLE');
      for (const x of part) if (!x.n.length) natija.set(x.g.key, { key: x.g.key, nomzod: null, ishonch: 'past', sabab: 'Manbalarda xarakteristikasi mos nomzod topilmadi', nomzodlar: [] });
      for (const t of javob) {
        const x = byId.get(t.id); if (!x) continue;
        const nomzod = t.tanlov ? x.n.find(n => n.id === t.tanlov) ?? null : null;
        natija.set(x.g.key, { key: x.g.key, nomzod, ishonch: t.ishonch, sabab: t.sabab, nomzodlar: x.n });
        if (!nomzod && t.qidiruv?.length && round === 0) keyingi.push({ g: x.g, iboralar: t.qidiruv });
      }
      onProgress?.(Math.min(i + 40, navbat.length), navbat.length);
    }
    // Phrasings from the model widen the search; resources it could not phrase stay as they are.
    navbat = keyingi;
  }
  return guruhlar.map(g => natija.get(g.key)).filter((x): x is AiNarxNatija => !!x);
}
