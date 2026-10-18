import { useEffect, useRef } from 'react';
import type { EstimateDoc } from '../smeta-studio/model';
import type { DocCalc } from '../smeta-studio/calc';
import { smetaXulosasi } from '../smeta-studio/ai-kontekst';
import { STUDIO_CONTEXT_MAX, studioKontekstUla } from './studio-kontekst';

export function studioQoralamaXulosasi(doc: EstimateDoc, calc: DocCalc, unitText: (code: string | null) => string | null): string {
  const parts = [`To‘g‘ri xarajat (qoralama, nakrutkasiz): ${calc.total.amount ?? 'noma’lum'}; ma’lum qismi: ${calc.total.knownAmount}; noma’lum qiymatlar: ${calc.total.unresolved}.`,
    smetaXulosasi(doc, undefined, unitText, STUDIO_CONTEXT_MAX - 1800),
    'RESURS NAMUNALARI (to‘liq ro‘yxat emas; hajm/narx/summa tayyor deterministik hisobdan, qayta hisoblanmaydi):'];
  let length = parts.join('\n').length;
  outer: for (const id in calc.occurrences) for (const line of calc.occurrences[id].lines) {
    const evidence = doc.occurrences[id]?.overrides[line.recipeId]?.price?.evidence;
    const row = `${line.resource?.name?.slice(0, 140) ?? 'resurs noma’lum'} | ${unitText(line.resource?.unitCode ?? null) ?? '?'} | hajm ${line.quantity ?? '?'} | narx ${line.price ?? '?'} | summa ${line.amount ?? '?'} | manba ${evidence?.slice(0, 140) ?? '?'}`;
    if (length + row.length + 1 > STUDIO_CONTEXT_MAX) break outer;
    parts.push(row); length += row.length + 1;
  }
  return parts.join('\n').slice(0, STUDIO_CONTEXT_MAX);
}

/** Reuses the editor's calculation. Summary is generated only on a submitted question. */
export function useStudioKontekst(doc: EstimateDoc, calc: DocCalc, unitText: (code: string | null) => string | null, companyId: number | null) {
  const latest = useRef({ doc, calc, unitText, companyId });
  latest.current = { doc, calc, unitText, companyId };
  useEffect(() => {
    if (!companyId || doc.context.companyId !== companyId) return;
    return studioKontekstUla({ companyId, draftId: doc.draftId, read: () => {
      const now = latest.current;
      if (now.companyId !== companyId || now.doc.context.companyId !== companyId || now.doc.draftId !== doc.draftId) return null;
      return { schema: 1, companyId, draftId: now.doc.draftId, title: now.doc.context.title.slice(0, 240),
        summary: studioQoralamaXulosasi(now.doc, now.calc, now.unitText) };
    } });
  }, [companyId, doc.context.companyId, doc.draftId]);
}
