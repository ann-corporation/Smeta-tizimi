/**
 * Studio smetasining AI uchun matn ko'rinishi (egasi 2026-10-15: "butun yasalayotgan smetani AI o'qib tura olishi kerak").
 * Bo'limlar tartibida har ish: shifr, nom, hajm/birlik, qabul qilingan va taklif qilingan koeffitsientlar, narxlangan resurslar soni;
 * oxirida stavkalar. Faqat o'qish uchun — AI bu matn asosida taklif beradi, smetani foydalanuvchi o'zgartiradi.
 */
import type { EstimateDoc } from './model';

export function smetaXulosasi(doc: EstimateDoc, max = 16000): string {
  const out: string[] = [];
  let ishlar = 0;
  const walk = (id: string, depth: number) => {
    const s = doc.sections[id]; if (!s) return;
    out.push(`${'  '.repeat(depth)}# ${s.name}`);
    for (const oid of s.items) {
      const o = doc.occurrences[oid]; if (!o) continue;
      ishlar++;
      const res = o.recipe.length, narxli = o.recipe.filter(r => o.overrides[r.recipeId]?.price?.value != null).length;
      const koef = (o.coefficients ?? []).map(k => `${k.name}=${k.value} [${k.scope}]${k.accepted ? '' : ' (taklif, qabul qilinmagan)'}`);
      out.push(`${'  '.repeat(depth + 1)}- ${o.source.code} ${o.source.name} | hajm: ${o.quantity ?? '?'} ${o.basis.unitLabel ?? ''} (norma birligi ${o.basis.scale} ${o.basis.unitLabel ?? ''})`
        + ` | resurslar ${res}, narxlangan ${narxli}${koef.length ? ` | koeffitsientlar: ${koef.join('; ')}` : ''}`);
    }
    for (const c of s.children) walk(c, depth + 1);
  };
  for (const id of doc.rootOrder) walk(id, 0);
  if (doc.rates) out.push(`Stavkalar (${doc.rates.source}): ${Object.entries(doc.rates.values).map(([k, v]) => `${k} ${v}%`).join(', ')}`);
  const head = `Smeta: ${doc.context.title || '—'}; obyekt: ${doc.context.objectLabel || '—'}; ishlar: ${ishlar}`;
  const text = [head, ...out].join('\n');
  return text.length > max ? text.slice(0, max - 40) + '\n… (smeta qisqartirildi)' : text;
}
