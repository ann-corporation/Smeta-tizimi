import type { EstimateDoc } from './model';
import type { StudioCommand } from './commands';
import { ishHavolalari } from './ai-kontekst';
import { ishKoeffitsientlari, koefgaAylantir, qollanadi, type KoefKatalog } from './koef-katalog';

/** AI names an existing rule, never supplies its numeric value. No cross-work fallback or partial batch. */
export function coefficientApplyCommand(doc: EstimateDoc, catalog: KoefKatalog, workRef: string | null, codes: string | null, condition: string | null): StudioCommand {
  const id = ishHavolalari(doc).get((workRef ?? '').replace(/[[\]\s]/g, ''));
  if (!id) throw new Error('COEFFICIENT_WORK_REQUIRED');
  if (!condition?.trim()) throw new Error('COEFFICIENT_CONDITION_REQUIRED');
  const work = doc.occurrences[id];
  const wanted = [...new Set((codes ?? '').split(/[,;\s]+/).filter(Boolean))];
  if (!wanted.length || wanted.length > 10) throw new Error('COEFFICIENT_RULE_REQUIRED');
  const eligible = ishKoeffitsientlari(catalog, work.source.code);
  let coefficients = [...(work.coefficients ?? [])];
  for (const code of wanted) {
    const rule = eligible.find(r => r.kod === code);
    if (!rule || !qollanadi(rule)) throw new Error('COEFFICIENT_NOT_APPLICABLE');
    const added = koefgaAylantir(rule, true).map(c => ({ ...c, evidence: `${c.evidence.slice(0, 190)} · Sharoit: ${condition.trim().slice(0, 90)}` }));
    if (!added.length) throw new Error('COEFFICIENT_NOT_APPLICABLE');
    const ids = new Set(added.map(c => c.id));
    coefficients = [...coefficients.filter(c => !ids.has(c.id)), ...added];
  }
  return { type: 'SET_COEFFICIENTS', occurrenceId: id, coefficients };
}
export function coefficientCandidateSummary(doc: EstimateDoc, catalog: KoefKatalog): string {
  const lines: string[] = ['KOEFFITSIENT NOMZODLARI: faqat shu ish uchun berilgan kodlar; qo‘llash sharti tasdiqlanmasa koef_tanla.'];
  let size = 0;
  for (const [ref, id] of ishHavolalari(doc)) {
    const work = doc.occurrences[id];
    for (const n of ishKoeffitsientlari(catalog, work.source.code)) {
      if (!qollanadi(n)) continue;
      const line = `[${ref}] ${n.kod}: ${n.yozuv.s || n.yozuv.q}; ${JSON.stringify(n.yozuv.k)}; ${n.yozuv.a}`;
      if (size + line.length > 14000) return lines.join('\n') + '\nQolgan ishlar: koef_tanla orqali so‘rang.';
      lines.push(line); size += line.length;
    }
  }
  return lines.join('\n');
}
