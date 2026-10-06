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
import type { Birlik, IshNiyati, TanlovNomzodi, TanlovSorovi } from './protokol';

export type AiKatalog = NormDetailSource & {
  search(q: string, page: number): { rows: NormWork[]; total: number };
  unit(code: string | null): UnitEntry | null;
  load(workId: string): Promise<void>;
  tableLabel(workId: string): string | null;
  manifest: { revision: string };
};
export type TanlanganIsh = { workId: string; kod: string; nom: string; birlik: string | null; sabab: string; qolda?: boolean };
export type AiIsh = IshNiyati & { nomzodlar: TanlovNomzodi[]; tanlangan: TanlanganIsh | null; hajm: { qiymat: string; ifoda: string } | null; hajmXato: string | null };

const BIRLIK_KALIT: Record<Birlik, string> = { м3: 'М3', м2: 'М2', м: 'М', т: 'Т', кг: 'КГ', шт: 'ШТ', компл: 'КОМПЛ' };
/** Base unit of a normative work unit ("100 М3" → "М3"), or null if the catalogue did not observe it. */
export function ishAsosBirligi(k: Pick<AiKatalog, 'unit'>, unitCode: string | null): string | null {
  const u = k.unit(unitCode);
  return u?.base ? unitKey(u.base) : null;
}
export function birlikMos(k: Pick<AiKatalog, 'unit'>, w: NormWork, b: Birlik): boolean | null {
  const base = ishAsosBirligi(k, w.unitCode);
  return base == null ? null : base === BIRLIK_KALIT[b];
}

/** Search with the model's normative phrases; fall back to word stems (Russian endings vary). */
export function nomzodlarTop(k: AiKatalog, ish: Pick<IshNiyati, 'qidiruv' | 'birlik'>, limit = 12): TanlovNomzodi[] {
  const found = new Map<string, NormWork>();
  const tryQ = (q: string) => { if (found.size >= 40) return; for (const w of k.search(q, 0).rows.slice(0, 15)) if (!found.has(w.id)) found.set(w.id, w); };
  for (const q of ish.qidiruv) {
    tryQ(q);
    const words = q.toLowerCase().split(/\s+/).filter(x => x.length >= 4);
    const stems = words.map(x => x.slice(0, Math.max(4, x.length - 3)));
    if (stems.length) tryQ(stems.join(' '));
    if (stems.length > 2) tryQ(stems.slice(0, 2).join(' '));
  }
  const allStems = [...new Set(ish.qidiruv.flatMap(q => q.toLowerCase().split(/\s+/).filter(x => x.length >= 4).map(x => x.slice(0, Math.max(4, x.length - 3)))))];
  const hits = (w: NormWork) => { const n = (w.name ?? '').toLowerCase(); return allStems.filter(st => n.includes(st)).length; };
  const ranked = [...found.values()].map(w => ({ w, mos: birlikMos(k, w, ish.birlik), h: hits(w) }))
    .filter(x => x.mos !== false)                     // a known different unit is never offered
    .sort((a, b) => Number(b.mos === true) - Number(a.mos === true) || b.h - a.h);
  return ranked.slice(0, limit).map(({ w }) => ({ id: w.id, kod: w.code, nom: w.name ?? '', birlik: k.unit(w.unitCode)?.text ?? null }));
}

export function tanlovSorovi(ish: AiIsh): TanlovSorovi {
  return { id: ish.id, tavsif: ish.tavsif + (ish.material ? ` (${ish.material})` : ''), birlik: ish.birlik, material: ish.material, nomzodlar: ish.nomzodlar };
}

/** Merge the model's updated intents with what the user already decided (chosen work, manual edits). */
export function birlashtir(eski: AiIsh[], yangi: IshNiyati[]): AiIsh[] {
  const by = new Map(eski.map(i => [i.id, i]));
  return yangi.map(n => {
    const o = by.get(n.id);
    const same = o && o.tavsif === n.tavsif && o.birlik === n.birlik && JSON.stringify(o.qidiruv) === JSON.stringify(n.qidiruv);
    let hajm: AiIsh['hajm'] = null, hajmXato: string | null = null;
    if (n.hajmIfoda) { try { hajm = ifodaHisobla(n.hajmIfoda); } catch (e) { hajmXato = e instanceof Error ? e.message : 'IFODA_NOTOGRI'; } }
    return { ...n, nomzodlar: same ? o!.nomzodlar : [], tanlangan: same || o?.tanlangan?.qolda ? o!.tanlangan : null, hajm, hajmXato };
  });
}

export type QoshishNatija = { commands: StudioCommand[]; qoshildi: string[]; otkazildi: Array<{ id: string; sabab: string }> };

/** Build ONE batch: missing sections, then every ready work with a frozen catalogue snapshot. */
export async function smetagaQoshish(doc: EstimateDoc, ishlar: AiIsh[], k: AiKatalog, newId: () => string): Promise<QoshishNatija> {
  const commands: StudioCommand[] = [], qoshildi: string[] = [], otkazildi: QoshishNatija['otkazildi'] = [];
  const sectionByName = new Map<string, string>();
  for (const s of Object.values(doc.sections)) sectionByName.set(s.name.trim().toLowerCase(), s.id);
  for (const ish of ishlar) {
    if (!ish.tanlangan) { otkazildi.push({ id: ish.id, sabab: 'Normativ ish tanlanmagan' }); continue; }
    if (!ish.hajm) { otkazildi.push({ id: ish.id, sabab: ish.hajmXato ? 'Hajm formulasi noto‘g‘ri' : 'Hajm aniqlanmagan' }); continue; }
    try {
      await k.load(ish.tanlangan.workId);
      const snap = snapshotWork(k, ish.tanlangan.workId, k.manifest.revision, k.tableLabel(ish.tanlangan.workId));
      const basis = suggestedBasis(snap.source.unitCode, k.unit(snap.source.unitCode));
      // Physical quantity must be in the work's base unit (м3 for a "100 м3" norm); otherwise ask, never convert silently.
      if (basis.unitLabel && unitKey(basis.unitLabel) !== BIRLIK_KALIT[ish.birlik]) { otkazildi.push({ id: ish.id, sabab: `Birlik mos emas: hajm ${ish.birlik}, norma ${basis.unitLabel}` }); continue; }
      const nomi = ish.bolim.trim() || 'Asosiy';
      let sectionId = sectionByName.get(nomi.toLowerCase());
      if (!sectionId) { sectionId = newId(); sectionByName.set(nomi.toLowerCase(), sectionId); commands.push({ type: 'ADD_SECTION', sectionId, parentId: null, name: nomi }); }
      commands.push({ type: 'ADD_OCCURRENCE', occurrenceId: newId(), sectionId, source: snap.source, recipe: snap.recipe, quantity: ish.hajm.qiymat, basis });
      qoshildi.push(ish.id);
    } catch (e) {
      otkazildi.push({ id: ish.id, sabab: e instanceof Error && e.message === 'WORK_AMBIGUOUS' ? 'Bir shifrga ikki ish mos — qo‘lda tanlang' : 'Katalog ishi yuklanmadi' });
    }
  }
  return { commands, qoshildi, otkazildi };
}
