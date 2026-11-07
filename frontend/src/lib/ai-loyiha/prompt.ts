/**
 * Vision model uchun prompt. Model RUS tilidagi loyiha varaqini (КЖ/АС/АР) RASM sifatida ko'radi;
 * matn qatlami (agar PDF da bor va buzilmagan bo'lsa) faqat yordamchi dalil.
 * Prompt modelni hisoblashga emas, O'QISHGA majbur qiladi: jami sonlarni server/klient kesishma
 * tekshiruvi qayta hisoblaydi (`kesishma.ts`).
 */
import { AI_LOYIHA_VERSIYA, type VaraqTuri } from './sxema';

export const MAX_MATN_QATLAMI = 12000;

export type PromptKirish = {
  sahifa: number;
  jamiSahifa: number;
  /** Foydalanuvchi bilgan bo'lsa (fayl nomi/ro'yxatdan), aks holda model o'zi aniqlaydi. */
  varaqTuri?: VaraqTuri | null;
  /** pdf.js `getTextContent` natijasi. Kirill buzilgan bo'lsa (mojibake) — yuborilmaydi. */
  matnQatlami?: string | null;
};

export const AI_LOYIHA_SYSTEM = [
  'You read Russian/Uzbek construction drawings (sheets КЖ, АС, АР) for a quantity surveyor (PTO).',
  'Extract ONLY what is written or dimensioned on the sheet. Never invent values. Unknown → null, never 0.',
  'Return JSON exactly matching the schema. No prose outside JSON.',
].join(' ');

/** Kirill matn qatlami buzilganmi (CID shriftlar, «Ð¡Ñ‚» kabi mojibake, yoki deyarli faqat belgi). */
export function matnQatlamiBuzuqmi(s: string | null | undefined): boolean {
  if (!s) return true;
  const t = s.replace(/\s+/g, '');
  if (t.length < 20) return true;
  const kirill = (t.match(/[А-Яа-яЁё]/g) ?? []).length;
  const mojibake = (t.match(/[ÐÑÃâ€�]/g) ?? []).length;
  const harf = (t.match(/[A-Za-zА-Яа-яЁё]/g) ?? []).length;
  if (mojibake > t.length * 0.05) return true;
  // Loyiha varaqi rus tilida: harflar bor-u kirill deyarli yo'q bo'lsa — shrift kodlash buzilgan.
  return harf > 30 && kirill < harf * 0.2;
}

export function sahifaPrompt(k: PromptKirish): string {
  const matn = k.matnQatlami && !matnQatlamiBuzuqmi(k.matnQatlami) ? k.matnQatlami.slice(0, MAX_MATN_QATLAMI) : null;
  return [
    `Prompt version: ${AI_LOYIHA_VERSIYA}. Page ${k.sahifa} of ${k.jamiSahifa}.`,
    k.varaqTuri ? `Sheet discipline declared by the user: ${k.varaqTuri}.` : 'Determine the sheet discipline (КЖ → KJ, АС/КМ → AS, АР → AR, else boshqa).',
    '',
    'Fill `varaq` from the title block (штамп): shifr (sheet code / лист), nomi, masshtab.',
    'Fill `parametrlar` from the plan / general notes:',
    '- uzunlik_m: TOTAL length of the whole object along its axis (e.g. «Фундамент п.м 1250», «L=1250 м»), in metres. A single span/section dimension (e.g. 3000 between axes 1–2) is NOT the total — leave null if the total is not written;',
    '- qadam_m: distance between neighbouring posts / pillars / stakans (between axes 1 and 2), in metres. NOT the spacing of bars/rods inside a panel («Шаг 100»);',
    '- oraliq_soni: number of spans/sections if written (e.g. «Ограждение ОГ-5 шт 300»), else null;',
    '- yopiq_kontur: true only if the plan is a closed contour; false if an open line; null if unclear;',
    '- belgi_past_m / belgi_yuqori_m: elevation marks such as +0,200 … +2,200 as numbers in metres.',
    '',
    'For EVERY element in specifications (спецификация, ведомость) and every dimensioned element on drawings add one `elementlar` item:',
    '- tur: fundament_stakan | fundament_lenta | fundament_plita | ustun | tusin | toldirma | devor | plita | armatura | beton | qoplama | profil | boshqa;',
    '- marka: mark / position code exactly as drawn (Ф-1, Ст1, Поз.3); nom: name as written (Russian is fine);',
    '- kesim: section text exactly (e.g. «□80×80×4», «□40×30×3», «0,3×0,5»);',
    '- olcham_m: dimensions in METRES (convert mm → m: 600 → 0.6). For a stepped stakan use the lower block only and describe the upper block in izoh, or emit two elements;',
    '- uzunlik_m: length of ONE piece in metres (L=2000 → 2);',
    '- soni / miqdor / birlik: copy the quantity column; birlik one of m, m2, m3, kg, t, dona (п.м / пог.м → m, шт → dona);',
    '- birlik_massa_kg: mass of ONE piece in kg if the table has it;',
    '- doira: «jami» if the quantity is for the whole object; «bir_oraliq» if the table is per span / per section / per N metres (e.g. «Расход на 3 п.м», «на одну секцию»; a header row such as «Ограждение ОГ-5 шт 300» or «Фундамент п.м 1250» followed by component rows means those rows are for ONE section/span); «bir_dona» only for the size of a single piece;',
    '- tayanchga_tegishli: true for posts and everything that exists once per post (its stakan/footing, embedded plate ЗД, anchor bolts, footing cage КП, base plate); false for infill, rails, the strip between footings;',
    '- ota_marka: if the row is a component of an assembly listed just above it (bars of mesh С-4, parts of embedded detail ЗД-3, bars of cage КП-2), the mark of that assembly (e.g. «С-4»); such rows are quantities for ONE assembly — copy them as written; else null;',
    '- if a profile is given with «L=п.м», the Кол. column is metres: miqdor = that number, birlik = m, birlik_massa_kg = mass per metre (do not put it in soni);',
    '- varaq, pozitsiya, jadvaldan: where the number came from (sheet code, table row / mark, true if from a table);',
    '- ishonch: 0..1 — lower it when the scan is blurry, a digit is ambiguous, or you derived a value instead of reading it;',
    '- izoh: anything needed to defend the number (e.g. «2 шт на пролёт — стойки общие с соседним пролётом?»).',
    '',
    'Shared elements: posts and their foundations are shared by two neighbouring spans. If a per-span table lists 2 posts/stakans, copy it AS WRITTEN (soni=2, doira=bir_oraliq) and note the possible double count in izoh. Do not fix totals yourself.',
    'Do not sum across tables. Do not multiply per-span values by the number of spans — the system does that.',
    'Put unclear notes (размеры уточнить по месту, see sheet X) into ogohlantirishlar.',
    matn ? `\nText layer extracted from the PDF (may be incomplete, the image is authoritative):\n${matn}` : '\nNo usable text layer: read the image.',
  ].join('\n');
}
