/**
 * Studio smetasining AI uchun matn ko'rinishi (egasi 2026-10-15/16: "butun yasalayotgan smetani AI o'qib tura olishi kerak",
 * "AI boshidan oxirigacha ishlay olishi kerak"). Bo'limlar tartibida har ish [iN] havolasi bilan: shifr, nom, hajm, material,
 * «по проекту» resurslar uchun material holati, koeffitsientlar; keyin resurslar (narx va obosnovaniya hujjati) va stavkalar.
 * Faqat o'qish — AI shu matn asosida javob beradi va «amallar» taklif qiladi; smetani foydalanuvchi o'zgartiradi.
 */
import type { DocCalc } from './calc';
import type { EstimateDoc } from './model';
import { loyihaBoyicha, resursNomi, talabMateriali } from './loyiha-material';

/** Work references used in the summary ([i1], [i2] …) in document order → occurrence ids. */
export function ishHavolalari(doc: EstimateDoc): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (id: string) => {
    const s = doc.sections[id]; if (!s) return;
    for (const oid of s.items) if (doc.occurrences[oid]) out.set(`i${out.size + 1}`, oid);
    for (const c of s.children) walk(c);
  };
  for (const id of doc.rootOrder) walk(id);
  return out;
}

export function smetaXulosasi(doc: EstimateDoc, calc?: DocCalc, unitText?: (code: string | null) => string | null, max = 16000): string {
  const refs = new Map([...ishHavolalari(doc)].map(([r, id]) => [id, r]));
  const out: string[] = [];
  const walk = (id: string, depth: number) => {
    const s = doc.sections[id]; if (!s) return;
    out.push(`${'  '.repeat(depth)}# ${s.name}`);
    for (const oid of s.items) {
      const o = doc.occurrences[oid]; if (!o) continue;
      const loyiha = o.recipe.map(r => o.overrides[r.recipeId]?.substitution?.resource ?? r.resource).filter(r => r && loyihaBoyicha(r.name));
      const kerak = loyiha.filter(r => !talabMateriali(o.material, r!.name)).map(r => r!.name);
      const koef = (o.coefficients ?? []).map(k => `${k.name}=${k.value} [${k.scope}]${k.accepted ? '' : ' (taklif)'}`);
      out.push(`${'  '.repeat(depth + 1)}[${refs.get(oid)}] ${o.source.code} ${o.source.name} | hajm: ${o.quantity ?? '?'} ${o.basis.unitLabel ?? ''}`
        + (o.material ? ` | material: ${o.material}` : '') + (kerak.length ? ` | LOYIHA MATERIALI KERAK: ${kerak.join('; ')}` : '')
        + (koef.length ? ` | koeffitsientlar: ${koef.join('; ')}` : ''));
    }
    for (const c of s.children) walk(c, depth + 1);
  };
  for (const id of doc.rootOrder) walk(id, 0);
  if (calc) {
    // One line per resource and price: what the RES will show, with the price document (for "qaysi manbadan?" questions).
    const by = new Map<string, { nom: string; birlik: string; miqdor: number; narx: string | null; hujjat: string | null }>();
    for (const o of Object.values(doc.occurrences)) for (const l of calc.occurrences[o.id]?.lines ?? []) {
      if (!l.resource) continue;
      const nom = resursNomi(l.resource.name, o.material), birlik = unitText?.(l.resource.unitCode) ?? '';
      const key = `${nom}\u0001${birlik}\u0001${l.price ?? ''}`;
      const g = by.get(key) ?? { nom, birlik, miqdor: 0, narx: l.price, hujjat: o.overrides[l.recipeId]?.price?.justification?.document ?? o.overrides[l.recipeId]?.price?.evidence ?? null };
      g.miqdor += Number(l.quantity ?? 0);
      by.set(key, g);
    }
    out.push('RESURSLAR (nom | birlik | miqdor | narx QQSsiz | obosnovaniya):');
    for (const g of by.values()) out.push(`- ${g.nom} | ${g.birlik} | ${Math.round(g.miqdor * 1e4) / 1e4} | ${g.narx ?? 'narx yo‘q'}${g.hujjat ? ` | ${g.hujjat.slice(0, 160)}` : ''}`);
  }
  if (doc.rates) out.push(`Stavkalar (${doc.rates.source}): ${Object.entries(doc.rates.values).map(([k, v]) => `${k} ${v}%`).join(', ')}`);
  else out.push('Stavkalar: tasdiqlanmagan');
  const head = `Smeta: ${doc.context.title || '—'}; obyekt: ${doc.context.objectLabel || '—'}; ishlar: ${refs.size}`;
  const text = [head, ...out].join('\n');
  return text.length > max ? text.slice(0, max - 40) + '\n… (smeta qisqartirildi)' : text;
}
