/**
 * Studio draft → smeta rows (`T2Qator` shape) so the proven document generators (LRV with
 * Ведомость ресурсов, Свод, pivot and nakrutka podval — `lib/lrv-hujjat`) render a studio draft
 * exactly like an imported smeta. No second document engine.
 *
 *   section → 'rz' · occurrence → 'bl' (work) · recipe line → 'rs' | 'mat' | 'ob'
 *
 * NULL ≠ 0: a resource whose quantity is unknown is written without quantity AND without price,
 * so the generator leaves every enclosing total blank instead of printing a fake zero.
 */
import type { T2Qator } from '../../api/supabase';
import type { NakrutkaKat } from '../nakrutka-podval';
import type { DocCalc } from './calc';
import type { CatalogResource, EstimateDoc } from './model';
import { resourceFacts } from '../resource-semantics';

/**
 * Normative catalogue resource → cost category, via the shared resource semantics (Codex): the observed
 * unit (чел-ч / маш-ч) outranks the broad source Tip — Tip=R also contains machines (e.g. excavators).
 * Machine operators' labour stays in the МАШ cost group. Unknown/conflicting → null (never guessed).
 */
export function resourceCategory(r: CatalogResource | null): NakrutkaKat | null {
  return resourceFacts(r).costCategory;
}

const num = (v: string | null | undefined) => (v == null ? null : Number(v));
/** Exact-ish per-work-unit consumption for the "Расход на ед." column (norm × conversion ÷ scale). */
function perUnit(norm: string | null, conversion: string, scale: string | null): number | null {
  if (norm == null || scale == null) return null;
  const v = (Number(norm) * Number(conversion)) / Number(scale);
  return Number.isFinite(v) ? Math.round(v * 1e9) / 1e9 : null;
}

export function studioToRows(doc: EstimateDoc, calc: DocCalc, unitText: (code: string | null) => string | null = c => c): T2Qator[] {
  const rows: T2Qator[] = [];
  const objectId = doc.context.objectId ?? 0, companyId = doc.context.companyId ?? 0;
  const row = (p: Partial<T2Qator> & Pick<T2Qator, 'tur' | 'ota_id' | 'tartib'>): T2Qator => {
    const r: T2Qator = { id: rows.length + 1, obyekt_id: objectId, obyekt: doc.context.objectLabel || null, kompaniya_id: companyId,
      daraja: null, kod: null, nom: null, birlik: null, hajm: null, narx: null, summa: null, kat: null, narx_usul: null,
      qoshimcha: null, zamena: null, d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 0,
      raqam: null, norma: null, ...p };
    rows.push(r);
    return r;
  };
  // Iterative pre-order so very deep or very large drafts never hit a recursion limit.
  const stack: Array<{ id: string; parent: number | null; order: number; depth: number }> =
    doc.rootOrder.map((id, i) => ({ id, parent: null, order: i, depth: 1 })).reverse();
  while (stack.length) {
    const v = stack.pop()!;
    const s = doc.sections[v.id];
    if (!s) throw new Error('SECTION_NOT_FOUND');
    const rz = row({ tur: 'rz', ota_id: v.parent, tartib: v.order, daraja: v.depth, nom: s.name });
    // Works first, then nested sections — the same order the editor shows.
    s.items.forEach((oid, i) => {
      const o = doc.occurrences[oid], c = calc.occurrences[oid];
      if (!o || !c) throw new Error('OCCURRENCE_NOT_FOUND');
      const bl = row({ tur: 'bl', ota_id: rz.id, tartib: i, daraja: v.depth + 1, kod: o.source.code, nom: o.source.name,
        birlik: o.basis.unitLabel ?? unitText(o.source.unitCode), hajm: num(o.quantity), summa: num(c.amount) });
      c.lines.forEach((l, j) => {
        const kat = resourceCategory(l.resource);
        const sub = o.overrides[l.recipeId]?.substitution ?? null;
        const qty = num(l.quantity);
        row({ tur: kat === 'МАТ' ? 'mat' : kat === 'ОБ' ? 'ob' : 'rs', ota_id: bl.id, tartib: j, daraja: v.depth + 2, kat,
          kod: l.resource?.code ?? null, nom: l.resource?.name ?? 'Не определён ресурс (требует выбора)',
          birlik: unitText(l.resource?.unitCode ?? null), norma: perUnit(l.norm, sub?.conversion ?? '1', o.basis.scale),
          hajm: qty, narx: qty == null ? null : num(l.price), summa: num(l.amount), zamena: l.substituted || null,
          narx_usul: l.priceBasis });
      });
    });
    const base = s.items.length;
    for (let i = s.children.length - 1; i >= 0; i--) stack.push({ id: s.children[i], parent: rz.id, order: base + i, depth: v.depth + 1 });
  }
  return rows;
}
