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
import type { CatalogResource, EstimateDoc, PriceBasis, PriceJustification } from './model';
import { loyihaBoyicha, talabMateriali } from './loyiha-material';
import { BIRLIK_HISOB_XATO_MATNI, olchamliHisob, olchamliOtkazishMumkin, type BirlikHisob } from './birlik-hisob';
import { characteristics, gateFailure, matchResource, normName, priceUnitFactor, type MatchCatalog, type MatchResult } from './resource-match';
import { catalogEvidence } from './price-lookup';

type UnitText = (code: string | null) => string | null;
export type ResursQatori = { occurrenceId: string; recipeId: string };
export type ResursGuruh = {
  key: string; nom: string; birlik: string | null; kat: NakrutkaKat | null; resurs: CatalogResource;
  qatorlar: ResursQatori[]; miqdor: number | null;
  /** Price when every line has the same one; null if none or mixed. */
  narx: string | null; narxsiz: number; aralash: boolean; basis: PriceBasis | null; dalil: string | null;
  /** Structured «обоснование цены» of the price (when the price has one). */
  asos: PriceJustification | null;
  /** The work's stated material for a «по проекту» resource ("Бетон B20") — what is actually priced. */
  talab?: string | null;
  /** Lines priced automatically before structured justifications existed — re-priced so the documents carry requisites. */
  eskiQatorlar?: ResursQatori[];
};

export { loyihaBoyicha, talabMateriali } from './loyiha-material';
/** Name used to find a price: the stated material when the norm leaves it «по проекту». */
export const narxNomi = (g: Pick<ResursGuruh, 'nom' | 'talab'>) => g.talab ?? g.nom;

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
    // A «по проекту» resource is one product per stated material: B7,5 and B20 concrete are never one price.
    const talab = talabMateriali(o.material, l.resource.name);
    const key = [normName(l.resource.name), normName(birlik), kat ?? '', normName(talab)].join('\u0001');
    let g = by.get(key);
    if (!g) {
      g = { key, nom: l.resource.name ?? '', birlik, kat, resurs: l.resource, qatorlar: [], miqdor: 0, narx: null, narxsiz: 0, aralash: false,
        basis: null, dalil: null, asos: null, talab, narxlar: new Set() };
      by.set(key, g);
    }
    g.qatorlar.push({ occurrenceId: o.id, recipeId: l.recipeId });
    g.miqdor = g.miqdor == null || l.quantity == null ? null : Math.round((g.miqdor + Number(l.quantity)) * 1e6) / 1e6;
    const ov = o.overrides[l.recipeId]?.price;
    if (l.price == null) g.narxsiz++;
    else if (ov && !ov.justification && ov.basis !== 'OPERATOR_MANUAL') (g.eskiQatorlar ??= []).push({ occurrenceId: o.id, recipeId: l.recipeId });
    if (l.price != null) {
      g.narxlar.add(l.price);
      g.basis = l.priceBasis;
      g.dalil = o.overrides[l.recipeId]?.price?.evidence ?? g.dalil;
      g.asos = o.overrides[l.recipeId]?.price?.justification ?? g.asos;
    }
  }
  const KAT_TARTIB: Array<NakrutkaKat | null> = ['ЧЕЛ', 'МАШ', 'МАТ', 'БЕЗ СКЛАД', 'М/К', 'КАБ', 'ОБ', null];
  return [...by.values()].map(({ narxlar, ...g }) => ({ ...g, narx: !g.narxsiz && narxlar.size === 1 ? [...narxlar][0] : null, aralash: narxlar.size > 1 || (narxlar.size > 0 && g.narxsiz > 0) }))
    .sort((a, b) => KAT_TARTIB.indexOf(a.kat) - KAT_TARTIB.indexOf(b.kat) || a.nom.localeCompare(b.nom, 'ru'));
}

/** Materials and equipment are priced from catalogues; labour/machine hours from the hour catalogue. */
export const katalogdanNarxlanadi = (g: Pick<ResursGuruh, 'kat'>) => g.kat !== 'ЧЕЛ' && g.kat !== 'МАШ';

/** A candidate with its source row (price already in the resource's unit). */
export type NarxNomzod = NarxNomzodi & { tur: 'katalog' | 'kompaniya' | 'kp'; row: KatalogQatori;
  /** Recalculation applied to the source price (exact unit factor, or a verified dimensional formula). */
  qayta: BirlikHisob | null;
  /** Source unit differs and only a dimensional recalculation (from sizes in the names) can make it usable. */
  birlikBoshqa?: boolean };

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
const manbaTuriMatni = (t: string) => (t === 'birja' ? 'birja' : t === 'prays' ? 'prays-list' : t === 'asosiy_material' ? 'asosiy materiallar' : t === 'mash_soat' ? 'mash.-soat ro‘yxati' : 'katalog');

/**
 * Which of two rows of the SAME product (name + unit) is offered (owner 2026-10-15: region, the most expensive price,
 * the source): the object's region → a republic-wide quote (birja) → another region; then the newer edition; then MAX price.
 */
export function ustunNomzod(a: KatalogQatori, b: KatalogQatori, hudud: string | null): KatalogQatori {
  const hd = (r: KatalogQatori) => (hudud && r.hudud_kalit === hudud ? 2 : r.hudud_kalit == null ? 1 : 0);
  const davr = (r: KatalogQatori) => `${r.yil ?? 0}-${r.kvartal ?? 0}-${r.manba_sana ?? ''}`;
  if (hd(a) !== hd(b)) return hd(a) > hd(b) ? a : b;
  if (davr(a) !== davr(b)) return davr(a) > davr(b) ? a : b;
  return (b.narx ?? 0) > (a.narx ?? 0) ? b : a;
}
export function qatorNomzodi(row: KatalogQatori, unit: string | null, tur: NarxNomzod['tur'], olchamli = false): NarxNomzod | null {
  if (row.narx == null || row.nds_holati === 'nds_bilan') return null;
  const factor = priceUnitFactor(row.birlik, unit);
  const davr = row.manba_sana !== undefined ? null : row.yil ? `${row.yil}${row.kvartal ? `-${row.kvartal}kv` : ''}` : null;
  const manba = (tur === 'katalog' ? [manbaTuriMatni(row.manba_tur), row.manba_nom, davr, row.hudud, row.ishlab_chiqaruvchi].filter(Boolean).join(', ')
    : tur === 'kp' ? `KP: ${row.manba_nom}` : `kompaniya smetasi (obosnovaniya emas): ${row.manba_nom}`).slice(0, 160);
  const id = `${tur === 'katalog' ? 'k' : tur === 'kp' ? 'p' : 's'}${row.id}`;
  if (unit && row.birlik && factor == null) {
    // Different physical unit: offered only for a dimensional recalculation; the price stays in the SOURCE unit until then.
    if (!olchamli || !olchamliOtkazishMumkin(unit, row.birlik)) return null;
    return { id, nom: row.nom, birlik: row.birlik, narx: round2(row.narx), manba, tur, row, qayta: null, birlikBoshqa: true };
  }
  const narx = round2(row.narx * (factor ?? 1));
  const qayta = factor != null && factor !== 1 ? { formula: String(factor), factor: String(factor), note: `${row.birlik} → ${unit}` } : null;
  return { id, nom: row.nom, birlik: unit ?? row.birlik, narx, manba, tur, row, qayta };
}

/** Applies a verified dimensional recalculation to a unit-different candidate → a candidate priced in the estimate unit. */
export function qaytaHisobla(n: NarxNomzod, resursNom: string, smetaBirlik: string | null, formula: string, izoh: string): NarxNomzod | { xato: string } {
  if (!n.birlikBoshqa) return n;
  const h = olchamliHisob(formula, izoh, smetaBirlik, n.birlik, [resursNom, n.nom]);
  if ('xato' in h) return { xato: BIRLIK_HISOB_XATO_MATNI[h.xato] };
  return { ...n, birlik: smetaBirlik, narx: round2(n.narx * Number(h.factor)), qayta: h, birlikBoshqa: false };
}

/**
 * Candidate pool for one resource: characteristic-gated rows of the platform index (catalogues, birja, price lists — the
 * deterministic matcher + BM25 meaning search with the resource name and any extra phrasings), the company's own КП/price
 * lists, and — ONLY when no justified source has a same-unit candidate — the company's earlier estimate prices (a hint,
 * never a justification; owner 2026-10-15). The same product appears once: region → newer edition → most expensive.
 */
export function narxNomzodlari(g: Pick<ResursGuruh, 'nom' | 'birlik'>, cat: MatchCatalog | null, kompaniya: MatchResult | null,
  hudud: string | null, iboralar: string[] = [], limit = 12, kp: MatchResult | null = null): NarxNomzod[] {
  const out = new Map<string, NarxNomzod>();
  const add = (n: NarxNomzod | null, _regional?: boolean) => {
    if (!n) return;
    const k = `${n.tur}\u0001${normName(n.nom)}\u0001${normName(n.birlik)}`;
    const prev = out.get(k);
    if (!prev || (prev.row !== n.row && ustunNomzod(prev.row, n.row, hudud) === n.row)) out.set(k, n);
  };
  for (const c of kp?.candidates.slice(0, 5) ?? []) add(qatorNomzodi({ ...c.row, narx: c.row.unitConversion?.sourcePrice ?? c.row.narx, birlik: c.row.unitConversion?.sourceUnit ?? c.row.birlik }, g.birlik, 'kp'));
  if (cat) {
    const src = characteristics(g.nom);
    for (const c of matchResource(cat, g.nom, g.birlik, hudud, 8).candidates) add(qatorNomzodi({ ...c.row, narx: c.row.unitConversion?.sourcePrice ?? c.row.narx, birlik: c.row.unitConversion?.sourceUnit ?? c.row.birlik }, g.birlik, 'katalog'), c.regional);
    let boshqaBirlik = 0;
    for (const h of narxIndeksi(cat).qidir([g.nom, ...iboralar], 80)) {
      if (cat.price(h.id) == null) continue;
      const c = characteristics(cat.name(h.id)), cn = normName(cat.name(h.id));
      const sabab = gateFailure(src, c, g.birlik, cat.unit(h.id), cn);
      if (sabab === 'UNIT') {
        // Same product in another unit (m² vs m, sheet vs m²): kept for a dimensional recalculation if every other gate passes.
        if (boshqaBirlik >= 4 || gateFailure(src, c, null, null, cn)) continue;
        const n = qatorNomzodi(cat.row(h.id), g.birlik, 'katalog', true);
        if (n) { boshqaBirlik++; add(n, !!hudud && cat.region(h.id) === hudud); }
        continue;
      }
      if (sabab) continue;
      add(qatorNomzodi(cat.row(h.id), g.birlik, 'katalog'), !!hudud && cat.region(h.id) === hudud);
      if (out.size >= limit * 2) break;
    }
  }
  // Last resort: an earlier estimate's price is offered only when no justified source has a same-unit candidate.
  if (![...out.values()].some(n => !n.birlikBoshqa))
    for (const c of kompaniya?.candidates.slice(0, 5) ?? []) add(qatorNomzodi({ ...c.row, narx: c.row.unitConversion?.sourcePrice ?? c.row.narx, birlik: c.row.unitConversion?.sourceUnit ?? c.row.birlik }, g.birlik, 'kompaniya'));
  // Same-unit candidates first (КП, then the platform index); unit-different ones need a recalculation; estimates last.
  const rank = (n: NarxNomzod) => (n.birlikBoshqa ? 10 : 0) + (n.tur === 'kp' ? 0 : n.tur === 'katalog' ? 1 : 5);
  return [...out.values()].sort((a, b) => rank(a) - rank(b)).slice(0, limit);
}

/** SET_PRICE for every line of the group, with full provenance (+ the AI's reason when it chose). */
/** «Обоснование цены» of a candidate: document details, the source row as written there, the recalculation and the reason. */
/**
 * Requisites of the source document as an expert reads them (owner 2026-10-16: "NAPU yoki ekspertiza qaytarolmasligi uchun manbani
 * aniq tiniq izohlashimiz kerak"): the document, its period, the sheet/region, the section (manufacturer), the position number and
 * the price date; how a VAT-free price was obtained when the document gives it with VAT. No internal wording ("MAX", Uzbek notes).
 */
export function manbaRekviziti(r: KatalogQatori, tur: NarxNomzod['tur'] = 'katalog'): string {
  const sana = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('.') : null);
  const davr = r.manba_sana !== undefined ? null : r.yil ? `${r.kvartal ? `${r.kvartal} кв. ` : ''}${r.yil} г.` : null;
  const poz = r.kod ? `поз. № ${r.kod}` : null;
  if (tur === 'kompaniya') return `Смета компании «${r.manba_nom}» — не является документом-основанием цены`;
  if (tur === 'kp') return [r.manba_nom, r.nds_izoh ?? 'цена без НДС'].filter(Boolean).join('; ');
  if (r.manba_tur === 'birja') return [`${r.manba_nom} (средневзвешенные недельные цены)`, poz, r.nds_izoh].filter(Boolean).join('; ');
  if (r.manba_tur === 'mash_soat') return [r.manba_nom, r.narx_varianti, poz, 'цена без НДС'].filter(Boolean).join(', ');
  const narxSana = sana(r.narx_varianti);
  return [[r.manba_nom, davr].filter(Boolean).join(', '), r.hudud ? `лист «${r.hudud}»` : null, r.ishlab_chiqaruvchi ? `раздел (производитель): ${r.ishlab_chiqaruvchi}` : null,
    poz, narxSana ? `отпускная цена без НДС на ${narxSana}` : 'цена без НДС', r.nds_izoh && /НДС/.test(r.nds_izoh) ? r.nds_izoh : null].filter(Boolean).join('; ');
}

export function narxAsosi(n: NarxNomzod, sabab = ''): PriceJustification {
  const r = n.row;
  const document = manbaRekviziti(r, n.tur);
  // The source row exactly as published: its own unit and price (the estimate price may be recalculated from it).
  const sourcePrice = r.narx == null ? null : String(r.narx);
  const docType: PriceJustification['docType'] = n.tur === 'kompaniya' ? 'COMPANY_ESTIMATE' : n.tur === 'kp' ? (r.manba_tur === 'prays' ? 'PRICE_LIST' : 'COMMERCIAL_OFFER')
    : r.manba_tur === 'birja' ? 'EXCHANGE' : r.manba_tur === 'prays' ? 'PRICE_LIST' : r.manba_tur === 'mash_soat' ? 'MACHINE_HOUR' : 'CATALOG';
  return { docType, document: document.slice(0, 400), sourceName: r.nom,
    sourceUnit: r.birlik, sourcePrice, conversion: n.qayta, reason: sabab ? sabab.slice(0, 400) : null };
}

/** SET_PRICE for every line of the group, with the structured justification (+ a short evidence line for older readers). */
export function narxBuyruqlari(g: Pick<ResursGuruh, 'qatorlar'>, n: NarxNomzod, sabab = ''): StudioCommand[] {
  if (n.birlikBoshqa) throw new Error('PRICE_UNIT_RECALCULATION_REQUIRED');
  const justification = narxAsosi(n, sabab);
  const evidence = [n.tur === 'katalog' ? catalogEvidence(n.row) : n.tur === 'kp' ? `KP · ${n.row.manba_nom} · ${n.row.nom}` : `Kompaniya smetasi · ${n.row.manba_nom} · ${n.row.nom}`,
    n.qayta ? `qayta hisob: ${n.qayta.formula} (${n.qayta.note})` : null, 'NDS siz'].filter(Boolean).join(' · ').slice(0, 300);
  const basis: PriceBasis = n.tur === 'katalog' ? 'CATALOG_CANDIDATE' : 'CONTRACT_DRAFT';
  const sourcePriceId = n.tur === 'katalog' ? `narx-katalog:${n.row.id}` : n.tur === 'kp' ? `narx-manba-qator:${n.row.id}` : `kompaniya-smeta-qator:${n.row.id}`;
  return g.qatorlar.map(q => ({ type: 'SET_PRICE' as const, occurrenceId: q.occurrenceId, recipeId: q.recipeId,
    price: { value: String(n.narx), basis, evidence, sourcePriceId, justification } }));
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
      // First round: a resource with NO candidate is still sent — the model then writes how the catalogue may name it,
      // and the second round searches with those words. (Without this the hardest resources never got a second chance.)
      const yuborish = part.filter(x => x.n.length || round === 0);
      const sorov = yuborish.map((x, j): NarxSorovi => ({ id: `r${i + j}`, nom: x.g.talab ? `${x.g.nom}: ${x.g.talab}` : x.g.nom, birlik: x.g.birlik, kat: x.g.kat,
        nomzodlar: x.n.map(({ id, nom, birlik, narx, manba, birlikBoshqa }) => ({ id, nom, birlik, narx, manba, ...(birlikBoshqa ? { birlikBoshqa: true } : {}) })) }));
      const byId = new Map(sorov.map((s, j) => [s.id, yuborish[j]]));
      for (const x of part) if (!x.n.length) natija.set(x.g.key, { key: x.g.key, nomzod: null, ishonch: 'past', sabab: 'Manbalarda xarakteristikasi mos nomzod topilmadi', nomzodlar: [] });
      const javob = sorov.length ? await tanla(sorov) : [];
      if (javob == null) throw new Error('AI_UNAVAILABLE');
      for (const t of javob) {
        const x = byId.get(t.id); if (!x) continue;
        let nomzod = t.tanlov ? x.n.find(n => n.id === t.tanlov) ?? null : null;
        let sabab = t.sabab, ishonch = t.ishonch;
        if (nomzod?.birlikBoshqa) {
          // The model chose a product in another unit: its formula is verified and computed here, never trusted as a number.
          const q = t.qayta_hisob ? qaytaHisobla(nomzod, narxNomi(x.g), x.g.birlik, t.qayta_hisob.ifoda, t.qayta_hisob.izoh) : { xato: 'qayta hisob formulasi berilmagan' };
          if ('xato' in q) { sabab = `${sabab} — qayta hisob rad etildi: ${q.xato}`; nomzod = null; ishonch = 'past'; }
          else nomzod = q;
        }
        if (x.n.length || !natija.has(x.g.key)) natija.set(x.g.key, { key: x.g.key, nomzod, ishonch, sabab, nomzodlar: x.n });
        if (!nomzod && t.qidiruv?.length && round === 0) keyingi.push({ g: x.g, iboralar: t.qidiruv });
      }
      onProgress?.(Math.min(i + 40, navbat.length), navbat.length);
    }
    // Phrasings from the model widen the search; resources it could not phrase stay as they are.
    navbat = keyingi;
  }
  return guruhlar.map(g => natija.get(g.key)).filter((x): x is AiNarxNatija => !!x);
}
