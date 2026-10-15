/**
 * Smetachi AI — browser orchestrator. The model proposes WHAT to do; this code does everything that must
 * be exact: catalogue search over the real normative corpus, unit compatibility, quantity arithmetic and
 * the single undoable batch of studio commands. Nothing is written until the user presses "add".
 */
import type { NormWork } from '../catalog-extraction/norm-catalog';
import type { NormDetailSource } from '../catalog-extraction/norm-remote';
import { unitKey, type UnitEntry } from '../catalog-extraction/norm-shards';
import { snapshotWork, suggestedBasis } from '../smeta-studio/catalog-bridge';
import type { StudioCommand } from '../smeta-studio/commands';
import type { EstimateDoc } from '../smeta-studio/model';
import { ifodaHisobla } from './ifoda';
import { includedWorkReviews } from './included-work';
import type { Birlik, IshNiyati, TanlovNomzodi, TanlovSorovi } from './protokol';
import { MatnIndeks } from './matn-qidiruv';

export type AiKatalog = NormDetailSource & {
  search(q: string, page: number): { rows: NormWork[]; total: number };
  /** Optional ranked any-word search (RemoteNormCatalog). */
  searchAny?(stems: string[], limit?: number, minHits?: number): NormWork[];
  unit(code: string | null): UnitEntry | null;
  load(workId: string): Promise<void>;
  tableLabel(workId: string): string | null;
  manifest: { revision: string };
  /** Optional full work list for ranked (BM25) retrieval — RemoteNormCatalog provides it. */
  allWorks?(): NormWork[];
  collectionTitle?(code: string | null): string | null;
};

type IshIndeksi = { idx: MatnIndeks; works: NormWork[]; byId: Map<string, number> };
const ISH_INDEKS = new WeakMap<object, IshIndeksi>();
/** One BM25 index per catalogue revision: work name + its table title (what kind of work it is). */
export function ishIndeksi(k: AiKatalog): IshIndeksi | null {
  if (!k.allWorks) return null;
  let x = ISH_INDEKS.get(k);
  if (!x) {
    const works = k.allWorks();
    const idx = new MatnIndeks(works.map((w, i) => ({ id: i, matn: w.name ?? '', kontekst: k.tableLabel(w.id) })));
    x = { idx, works, byId: new Map(works.map((w, i) => [w.id, i])) };
    ISH_INDEKS.set(k, x);
  }
  return x;
}
const KOD = /^[EЕЦУCС]\d{1,3}(?:-\d+){1,4}$/i;
/** Ranked retrieval: every phrasing, collection hint as a boost, unit-incompatible works dropped, ≤3 variants per table. */
/** Collections for special structures; a building work never lands there unless the estimator asked for it. */
export const MAXSUS_TOPLAM = new Set(['E29', 'E30', 'E31', 'E35', 'E37', 'E42']);
/** Numbers that distinguish norms (bucket 0,5 м3, soil group 2, 380 мм) taken from the user's own description. */
export function tavsifSonlari(tavsif: string | null | undefined): string[] {
  return [...new Set((tavsif ?? '').match(/\d+(?:[.,]\d+)?/g) ?? [])].map(s => s.replace('.', ',')).slice(0, 6);
}
function bm25Nomzodlar(k: AiKatalog, x: IshIndeksi, ish: Pick<IshNiyati, 'qidiruv' | 'birlik' | 'toplam'> & { tavsif?: string }, limit: number): TanlovNomzodi[] {
  const hint = new Set(ish.toplam ?? []);
  const direct = ish.qidiruv.filter(q => KOD.test(q.trim())).flatMap(q => k.search(q.trim(), 0).rows.slice(0, 3));
  const matnli = ish.qidiruv.filter(q => !KOD.test(q.trim()));
  // The model's phrase plus the description's numbers: "…экскаваторами" + "0,5 2" reaches "КОВШОМ 0,5 … ГРУППА ГРУНТОВ 2".
  const sonlar = tavsifSonlari(ish.tavsif);
  const iboralar = sonlar.length && matnli[0] ? [...matnli, `${matnli[0]} ${sonlar.join(' ')}`] : matnli;
  // Special-purpose collections (tunnels, bridges, airfields, mining, hydro, shore protection) only when the model named them.
  const maxsusRuxsat = (c: string | null | undefined) => !c || !MAXSUS_TOPLAM.has(c.replace(/^Е/, 'E')) || hint.has(c.replace(/^Е/, 'E'));
  const scored = x.idx.qidir(iboralar, 150).filter(h => maxsusRuxsat(x.works[h.id].collection)).map(h => {
    const w = x.works[h.id];
    const mos = birlikMos(k, w, ish.birlik);
    return { w, mos, s: h.ball * (mos === true ? 1.15 : 1) * (w.collection && hint.has(w.collection.replace(/^Е/, 'E')) ? 1.3 : 1) };
  }).filter(r => r.mos !== false).sort((a, b) => b.s - a.s);
  const perTable = new Map<string, number>(), out: NormWork[] = [...direct];
  for (const r of scored) {
    if (out.length >= limit) break;
    if (out.some(w => w.id === r.w.id)) continue;
    const t = r.w.tableCode ?? r.w.id;
    const n = perTable.get(t) ?? 0;
    if (n >= 3) continue;
    perTable.set(t, n + 1); out.push(r.w);
  }
  return out.slice(0, limit).map(w => ({ id: w.id, kod: w.code, nom: w.name ?? '', birlik: k.unit(w.unitCode)?.text ?? null,
    jadval: k.tableLabel(w.id), toplam: k.collectionTitle?.(w.collection) ?? w.collection ?? null }));
}
export type TanlanganIsh = { workId: string; kod: string; nom: string; birlik: string | null; sabab: string; qolda?: boolean };
export type AiIsh = IshNiyati & { nomzodlar: TanlovNomzodi[]; tanlangan: TanlanganIsh | null; hajm: { qiymat: string; ifoda: string } | null; hajmXato: string | null };

const BIRLIK_KALIT: Record<Birlik, string> = { м3: 'М3', м2: 'М2', м: 'М', т: 'Т', кг: 'КГ', шт: 'ШТ', компл: 'КОМПЛ' };
/** Explicit operator search over the catalogue's paginated index, independent of the AI shortlist. */
export function katalogSahifasi(k: AiKatalog, query: string, page: number): { rows: TanlovNomzodi[]; total: number; hasNext: boolean; manoBoyicha?: boolean } {
  const result = k.search(query.trim(), page);
  if (!result.total && query.trim()) {
    // No literal match ("бетонирование ленточного фундамента" vs "УСТРОЙСТВО ЛЕНТОЧНЫХ ФУНДАМЕНТОВ") → closest by meaning.
    const rows = manoBoyichaIshlar(k, query, 75);
    const part = rows.slice(page * 25, (page + 1) * 25);
    return { rows: part, total: rows.length, hasNext: rows.length > (page + 1) * 25, manoBoyicha: true };
  }
  return { total: result.total, hasNext: result.rows.length > 0 && k.search(query.trim(), page + 1).rows.length > 0,
    rows: result.rows.map(w => ({ id: w.id, kod: w.code, nom: w.name ?? '', birlik: k.unit(w.unitCode)?.text ?? null })) };
}
/** Ranked (BM25) works for free text; empty when the catalogue has no full work list. */
export function manoBoyichaIshlar(k: AiKatalog, query: string, limit = 25): TanlovNomzodi[] {
  const x = ishIndeksi(k);
  if (!x) return [];
  return x.idx.qidir([query], limit).map(h => x.works[h.id]).map(w => ({ id: w.id, kod: w.code, nom: w.name ?? '', birlik: k.unit(w.unitCode)?.text ?? null,
    jadval: k.tableLabel(w.id), toplam: k.collectionTitle?.(w.collection) ?? w.collection ?? null }));
}
/** Base unit of a normative work unit ("100 М3" → "М3"), or null if the catalogue did not observe it. */
export function ishAsosBirligi(k: Pick<AiKatalog, 'unit'>, unitCode: string | null): string | null {
  const u = k.unit(unitCode);
  return u?.status === 'OBSERVED' && u.base && u.scale && Number(u.scale) > 0 ? unitKey(u.base) : null;
}
export function birlikMos(k: Pick<AiKatalog, 'unit'>, w: NormWork, b: Birlik): boolean | null {
  const base = ishAsosBirligi(k, w.unitCode);
  return base == null ? null : base === BIRLIK_KALIT[b];
}

/** Search with the model's normative phrases; fall back to word stems (Russian endings vary). */
export function nomzodlarTop(k: AiKatalog, ish: Pick<IshNiyati, 'qidiruv' | 'birlik' | 'toplam'> & { tavsif?: string }, limit = 15): TanlovNomzodi[] {
  const x = ishIndeksi(k);
  if (x) return bm25Nomzodlar(k, x, ish, limit);
  const found = new Map<string, NormWork>();
  const tryQ = (q: string) => { if (found.size >= 40) return; for (const w of k.search(q, 0).rows.slice(0, 15)) if (!found.has(w.id)) found.set(w.id, w); };
  for (const q of ish.qidiruv) {
    tryQ(q);
    const words = q.toLowerCase().split(/\s+/).filter(x => x.length >= 4);
    const stems = words.map(x => x.slice(0, Math.max(4, x.length - 3)));
    if (stems.length) tryQ(stems.join(' '));
    if (stems.length > 2) tryQ(stems.slice(0, 2).join(' '));
    // Normative wording differs from everyday wording ("бетонирование ленточных фундаментов" vs
    // "устройство железобетонных фундаментов"): fall back to ranked any-stem search.
    if (found.size < 5 && k.searchAny) for (const w of k.searchAny(stems, 25, 2)) if (!found.has(w.id)) found.set(w.id, w);
  }
  const allStems = [...new Set(ish.qidiruv.flatMap(q => q.toLowerCase().split(/\s+/).filter(x => x.length >= 4).map(x => x.slice(0, Math.max(4, x.length - 3)))))];
  const hits = (w: NormWork) => { const n = (w.name ?? '').toLowerCase(); return allStems.filter(st => n.includes(st)).length; };
  const ranked = [...found.values()].map(w => ({ w, mos: birlikMos(k, w, ish.birlik), h: hits(w) }))
    .filter(x => x.mos !== false)                     // a known different unit is never offered
    .sort((a, b) => Number(b.mos === true) - Number(a.mos === true) || b.h - a.h);
  return ranked.slice(0, limit).map(({ w }) => ({ id: w.id, kod: w.code, nom: w.name ?? '', birlik: k.unit(w.unitCode)?.text ?? null }));
}

/** System pick when the model declines: the top candidate only if it covers every stem of the first search phrase. */
export function tizimTanlovi(ish: Pick<AiIsh, 'qidiruv' | 'nomzodlar'>): TanlanganIsh | null {
  const top = ish.nomzodlar[0];
  if (!top || !ish.qidiruv[0]) return null;
  const stems = ish.qidiruv[0].toLowerCase().split(/\s+/).filter(x => x.length >= 4).map(x => x.slice(0, Math.max(4, x.length - 3)));
  const name = top.nom.toLowerCase();
  // The action must lead the name ("армирование колонн" ≠ "монтаж анкерных колонн ... армирования"; бетонирование ≠ обетонирование).
  return stems.length && name.startsWith(stems[0]) && stems.every(st => name.includes(st)) ? { workId: top.id, kod: top.kod, nom: top.nom, birlik: top.birlik, sabab: 'tizim tanlovi (nom bo‘yicha eng yaqin) — tekshiring' } : null;
}

export function tanlovSorovi(ish: AiIsh, related: AiIsh[] = []): TanlovSorovi {
  const context = related.filter(i => i.id !== ish.id && i.bolim === ish.bolim).map(i => `${i.tavsif}${i.material ? ` (${i.material})` : ''}`).join('; ');
  return { id: ish.id, tavsif: `${ish.tavsif}${ish.material ? ` (${ish.material})` : ''}${context ? `; Shu bo‘limdagi ishlar: ${context}` : ''}`.slice(0, 1200), birlik: ish.birlik, material: ish.material, nomzodlar: ish.nomzodlar };
}

/** Reject explicit construction/context contradictions, even when the units happen to match. */
export function tanlovZidmi(ish: AiIsh, n: TanlovNomzodi, related: AiIsh[]): boolean {
  const section = [ish, ...related.filter(i => i.bolim === ish.bolim)];
  const context = section.map(i => `${i.tavsif} ${i.material ?? ''}`).join(' ');
  if (/fundament|фундамент/i.test(context)) {
    if (/МОСТ|МОСТОВ/i.test(n.nom) && !/ko[‘'’]?prik|bridge|мост/i.test(context)) return true;
    if (/КОТЛОВ(?:[^А-ЯЁ]|$)|ТРУБОПРОВОД/i.test(n.nom) && !/qozon|boiler|кот[её]л|truboprovod|трубопровод|quvur/i.test(context)) return true;
  }
  return /фундамент|fundament/i.test(ish.tavsif) && /ФУНДАМЕНТОВ БЕТОННЫХ/i.test(n.nom)
    && related.some(i => i.bolim === ish.bolim && /арматур|armatur/i.test(`${i.tavsif} ${i.material ?? ''}`));
}

/** Merge the model's updated intents with what the user already decided (chosen work, manual edits). */
export function birlashtir(eski: AiIsh[], yangi: IshNiyati[]): AiIsh[] {
  const by = new Map(eski.map(i => [i.id, i]));
  const merged = yangi.map(n => {
    const o = by.get(n.id);
    const same = o && o.tavsif === n.tavsif && o.birlik === n.birlik && o.material === n.material && JSON.stringify(o.qidiruv) === JSON.stringify(n.qidiruv);
    let hajm: AiIsh['hajm'] = null, hajmXato: string | null = null;
    if (n.hajmIfoda) { try { hajm = ifodaHisobla(n.hajmIfoda); } catch (e) { hajmXato = e instanceof Error ? e.message : 'IFODA_NOTOGRI'; } }
    return { ...n, nomzodlar: same ? o!.nomzodlar : [], tanlangan: same ? o!.tanlangan : null, hajm, hajmXato };
  });
  return merged.map(i => i.tanlangan && !i.tanlangan.qolda && tanlovZidmi(i, { ...i.tanlangan, id: i.tanlangan.workId }, merged) ? { ...i, tanlangan: null } : i);
}

export type QoshishNatija = { commands: StudioCommand[]; qoshildi: string[]; otkazildi: Array<{ id: string; sabab: string }> };

/** Source facts and model reasoning stay distinct; legal validity requires a reviewed edition. */
export function tanlovDalili(ish: AiIsh, k: AiKatalog): string | null {
  const n = ish.tanlangan;
  if (!n) return null;
  return [`Katalog: ${k.manifest.revision}; norma: ${n.kod}; birlik: ${n.birlik ?? 'noma’lum'}.`,
    `Ish: ${n.nom}. Qidiruv: ${ish.qidiruv.join('; ')}.`,
    ish.material ? `Talab qilingan material: ${ish.material}.` : 'Material xarakteristikasi ko‘rsatilmagan.',
    n.sabab ? `Tanlash sababi: ${n.sabab}.` : 'Tanlash sababi berilmagan — qo‘lda tekshiring.',
    'Nashr amaldaligi va ish sharoitlari alohida tekshiriladi.'].join('\n');
}

/** Build ONE batch: missing sections, then every ready work with a frozen catalogue snapshot. */
export async function smetagaQoshish(doc: EstimateDoc, ishlar: AiIsh[], k: AiKatalog, newId: () => string): Promise<QoshishNatija> {
  const commands: StudioCommand[] = [], qoshildi: string[] = [], otkazildi: QoshishNatija['otkazildi'] = [];
  const overlaps = includedWorkReviews(ishlar, doc);
  const sectionByName = new Map<string, string>();
  for (const s of Object.values(doc.sections)) sectionByName.set(s.name.trim().toLowerCase(), s.id);
  for (const ish of ishlar) {
    const overlap = overlaps.get(ish.id);
    if (overlap) { otkazildi.push({ id: ish.id, sabab: `Norma tarkibi bilan takrorlanish xavfi: ${overlap.code}; ${overlap.document}, ${overlap.page}-sahifa — alohida ish hajmi va qo‘llanishini tekshiring` }); continue; }
    if (!ish.tanlangan) { otkazildi.push({ id: ish.id, sabab: 'Normativ ish tanlanmagan' }); continue; }
    if (!ish.tanlangan.qolda && tanlovZidmi(ish, { ...ish.tanlangan, id: ish.tanlangan.workId }, ishlar)) { otkazildi.push({ id: ish.id, sabab: 'Norma konstruksiya yoki shu bo‘limdagi ishlarga zid — normaning qo‘llanishini tekshiring' }); continue; }
    if (ish.holat === 'ANIQLASH_KERAK') { otkazildi.push({ id: ish.id, sabab: 'Ish sharoiti aniqlashtirilmagan' }); continue; }
    if (!ish.hajm) { otkazildi.push({ id: ish.id, sabab: ish.hajmXato ? 'Hajm formulasi noto‘g‘ri' : 'Hajm aniqlanmagan' }); continue; }
    try {
      await k.load(ish.tanlangan.workId);
      const snap = snapshotWork(k, ish.tanlangan.workId, k.manifest.revision, k.tableLabel(ish.tanlangan.workId));
      if (ishAsosBirligi(k, snap.source.unitCode) == null) { otkazildi.push({ id: ish.id, sabab: 'Norma birligi yoki masshtabi isbotlanmagan' }); continue; }
      const basis = suggestedBasis(snap.source.unitCode, k.unit(snap.source.unitCode));
      // Physical quantity must be in the work's base unit (м3 for a "100 м3" norm); otherwise ask, never convert silently.
      if (basis.unitLabel && unitKey(basis.unitLabel) !== BIRLIK_KALIT[ish.birlik]) { otkazildi.push({ id: ish.id, sabab: `Birlik mos emas: hajm ${ish.birlik}, norma ${basis.unitLabel}` }); continue; }
      const nomi = ish.bolim.trim() || 'Asosiy';
      let sectionId = sectionByName.get(nomi.toLowerCase());
      if (!sectionId) { sectionId = newId(); sectionByName.set(nomi.toLowerCase(), sectionId); commands.push({ type: 'ADD_SECTION', sectionId, parentId: null, name: nomi }); }
      const occurrenceId = newId();
      commands.push({ type: 'ADD_OCCURRENCE', occurrenceId, sectionId, source: snap.source, recipe: snap.recipe, quantity: ish.hajm.qiymat, basis });
      // Coefficients travel as PROPOSALS: visible on the work, applied only when the operator accepts them.
      if (ish.koeffitsientlar?.length) commands.push({ type: 'SET_COEFFICIENTS', occurrenceId, coefficients: ish.koeffitsientlar.map((k, i) => ({
        id: `ai${i + 1}`, name: k.nom, value: k.qiymat, scope: k.qollanish, evidence: k.asos, origin: 'AI' as const, accepted: false })) });
      qoshildi.push(ish.id);
    } catch (e) {
      otkazildi.push({ id: ish.id, sabab: e instanceof Error && e.message === 'WORK_AMBIGUOUS' ? 'Bir shifrga ikki ish mos — qo‘lda tanlang' : 'Katalog ishi yuklanmadi' });
    }
  }
  return { commands, qoshildi, otkazildi };
}
