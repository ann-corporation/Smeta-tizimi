/**
 * Internet narxi → «Обоснование цен» (egasi 2026-10-17: "havolalar bilan obosnovat qilib bersin"). Faqat sahifasi ochilib,
 * narx va mahsulot belgilari sahifada TEKSHIRILGAN manbalar; ular bir nechta bo'lsa — arifmetik o'rtacha.
 */
import type { InternetNatija } from '../smeta-ai/internet-narx';
import type { StudioCommand } from './commands';
import type { PriceJustification } from './model';
import type { ResursQatori } from './narx-yigish';

const fmt = (v: number) => String(Math.round(v * 100) / 100);

export function internetAsosi(n: InternetNatija, sana = new Date()): PriceJustification | null {
  const ok = n.manbalar.filter(m => m.tekshirildi && m.smetaNarx != null);
  if (!ok.length || n.narx == null) return null;
  const kun = sana.toISOString().slice(0, 10).split('-').reverse().join('.');
  const qqs = ok.some(m => m.nds !== 'siz');
  const document = [`Цены поставщиков в сети Интернет на ${kun} (страницы открыты и цена сверена)`,
    ok.length > 1 ? `среднее арифметическое ${ok.length} источников` : null,
    qqs ? 'цены с НДС приведены к цене без НДС (÷ 1,12)' : 'цена без НДС'].filter(Boolean).join('; ');
  return { docType: 'INTERNET', document: document.slice(0, 400), sourceName: ok[0].nom || null, sourceUnit: ok[0].birlik,
    sourcePrice: fmt(ok[0].narx), conversion: ok[0].koef != null && ok[0].koef !== 1 ? { formula: String(ok[0].koef), factor: String(ok[0].koef), note: `${ok[0].birlik} → ед. сметы` } : null,
    reason: n.izoh ? n.izoh.slice(0, 400) : null,
    sources: ok.map(m => ({ url: m.url, name: (m.sotuvchi || m.domen).slice(0, 160), price: fmt(m.narx), unit: m.birlik, vat: m.nds === 'bilan' ? true : m.nds === 'siz' ? false : null })) };
}

export function internetBuyruqlari(qatorlar: ResursQatori[], n: InternetNatija): StudioCommand[] {
  const j = internetAsosi(n);
  if (!j || n.narx == null) return [];
  const domenlar = [...new Set(n.manbalar.filter(m => m.tekshirildi).map(m => m.domen))].join(', ');
  return qatorlar.map(q => ({ type: 'SET_PRICE' as const, occurrenceId: q.occurrenceId, recipeId: q.recipeId,
    price: { value: fmt(n.narx as number), basis: 'CATALOG_CANDIDATE' as const, evidence: `Internet · ${domenlar} · NDS siz`.slice(0, 300),
      sourcePriceId: `internet:${domenlar}`.slice(0, 200), justification: j } }));
}
