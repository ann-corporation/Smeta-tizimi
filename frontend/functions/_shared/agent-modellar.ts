/**
 * Model tanlash yordamchisi: OpenRouter'ning ommaviy ro'yxati (kalitsiz) + har ishchi uchun TALAB + moslik bahosi + kuchsizlik ogohlantirishi.
 *
 * Baholash dalilli va ochiq: (1) tanilgan modellar uchun qo'lda kiritilgan kuch bahosi; (2) boshqalar uchun narx/hajm/imkoniyat bo'yicha
 * TAXMINIY baho (UI «taxminiy» deb belgilaydi). Ishchiga talab: raqamli xulosa chiqaradigan lavozimlar (direktor, PTO, bugalter) — yuqoriroq,
 * oddiy ko'rsatuvchilar (usta, kuzatuvchi) — pastroq. Kuchsiz modelni TANLASH TAQIQLANMAYDI, lekin aniq ogohlantiriladi.
 */

export type OrModel = {
  id: string; nom: string; kirish_usd: number; chiqish_usd: number; kontekst: number;
  vision: boolean; tools: boolean; json: boolean; reasoning: boolean;
};

export type Moslik = 'juda_mos' | 'mos' | 'chegarada' | 'kuchsiz';
export type Baholash = {
  ball: number; manba: 'tanilgan' | 'taxmin'; daraja: Moslik; talab: number;
  sabablar: string[]; ogohlantirish: string | null; javob_narxi_usd: number;
};

/** Ishchi (profil) talabi: minimal kuch bali (0–100), rasm kerakmi. */
export const TALAB: Record<string, { min: number; vision?: boolean; izoh: string }> = {
  direktor: { min: 62, izoh: 'Raqamli xulosa va xavflarni to‘g‘ri aytishi shart' },
  pto_smeta: { min: 62, izoh: 'Smeta/fakt/F2 raqamlarini aralashtirmasligi shart' },
  finance: { min: 62, izoh: 'Pul summalarida xato qilmasligi shart' },
  project_contract: { min: 62, izoh: 'Shartnoma ma’lumotlarini aniq keltirishi kerak' },
  platform_orchestrator: { min: 68, izoh: 'Tizim signallarini tahlil qilib taklif beradi' },
  smeta_ai: { min: 66, izoh: 'Ish va resurslarni aniq moslashtirishi kerak' },
  warehouse: { min: 50, izoh: 'Qoldiq va harakatlarni aniq o‘qishi kerak' },
  procurement: { min: 52, izoh: 'Ombor va grafikni solishtiradi' },
  schedule_execution: { min: 52, izoh: 'Sanalar va foizlar bilan ishlaydi' },
  document_control: { min: 52, izoh: 'Hujjat holatlarini sanaydi' },
  quality_handover: { min: 52, izoh: 'AOSR/laboratoriya holatini sanaydi' },
  prorab: { min: 52, izoh: 'Grafik va ombor bo‘yicha aniq javob' },
  usta: { min: 45, izoh: 'Oddiy savollar va qisqa javob' },
  buyurtmachi: { min: 45, izoh: 'Oddiy holat ko‘rsatkichlari' },
  kuzatuvchi: { min: 42, izoh: 'Oddiy holat ko‘rsatkichlari' },
  company_access: { min: 45, vision: true, izoh: 'Foydalanuvchi fikri va skrinshotini tushunishi kerak (rasm ko‘ra olishi shart)' },
};
const TALAB_STANDART: { min: number; vision?: boolean; izoh: string } = { min: 50, izoh: 'Umumiy ishchi' };

/** Tanilgan modellar (OpenRouter id naqshi → kuch bahosi). Tartib muhim: aniqroq naqsh oldin. */
const TANILGAN: Array<[RegExp, number]> = [
  [/^anthropic\/claude-(opus|3-opus)/, 96], [/^anthropic\/claude-(sonnet|3\.7|3\.5-sonnet)/, 92], [/^anthropic\/claude-.*haiku/, 74],
  [/^openai\/gpt-5(\.\d+)?(-chat)?$/, 96], [/^openai\/gpt-5.*mini/, 82], [/^openai\/gpt-5.*nano/, 60], [/^openai\/gpt-4\.1$/, 90], [/^openai\/gpt-4\.1-mini/, 78], [/^openai\/gpt-4\.1-nano/, 52],
  [/^openai\/gpt-4o-mini/, 66], [/^openai\/gpt-4o/, 86], [/^openai\/gpt-oss-120b/, 72], [/^openai\/gpt-oss-20b/, 58], [/^openai\/o[134]/, 90],
  [/^google\/gemini-2\.5-pro/, 92], [/^google\/gemini-2\.5-flash-lite/, 66], [/^google\/gemini-2\.5-flash/, 84], [/^google\/gemini-2\.0-flash-lite/, 58], [/^google\/gemini-2\.0-flash/, 72],
  [/^google\/gemma-3-27b/, 58], [/^google\/gemma-3-12b/, 48], [/^google\/gemma-3-4b/, 36], [/^google\/gemma-3n/, 32],
  [/^deepseek\/deepseek-r1/, 86], [/^deepseek\/deepseek-(chat|v3)/, 80],
  [/^meta-llama\/llama-3\.3-70b/, 68], [/^meta-llama\/llama-4-maverick/, 76], [/^meta-llama\/llama-4-scout/, 66], [/^meta-llama\/llama-3\.1-405b/, 80], [/^meta-llama\/llama-3\.1-8b/, 38], [/^meta-llama\/llama-3\.2-(1|3)b/, 26],
  [/^mistralai\/mistral-large/, 78], [/^mistralai\/mistral-medium/, 72], [/^mistralai\/mistral-small/, 60], [/^mistralai\/mistral-nemo/, 45], [/^mistralai\/ministral-3b/, 30], [/^mistralai\/ministral-8b/, 40],
  [/^qwen\/qwen3\.7-flash/, 62], [/^qwen\/qwen3\.5-flash/, 62], [/^qwen\/qwen3-(235|max)/, 82], [/^qwen\/qwen3-32b/, 66], [/^qwen\/qwen3-14b/, 58], [/^qwen\/qwen-2\.5-7b/, 38],
  [/^x-ai\/grok-[34]/, 88], [/^z-ai\/glm-/, 72], [/^moonshotai\/kimi/, 82],
];

/** Kuch bahosi: tanilgan jadval, aks holda narx/hajm/imkoniyatdan TAXMIN. */
export function kuchBahosi(m: OrModel): { ball: number; manba: 'tanilgan' | 'taxmin' } {
  for (const [re, b] of TANILGAN) if (re.test(m.id)) return { ball: b, manba: 'tanilgan' };
  const p = m.chiqish_usd;
  let b = p >= 10 ? 92 : p >= 5 ? 88 : p >= 2 ? 82 : p >= 1 ? 74 : p >= 0.5 ? 66 : p >= 0.3 ? 58 : p >= 0.15 ? 50 : 42;
  const q = /(\d+(?:\.\d+)?)b\b/i.exec(m.id);
  if (q) { const x = Number(q[1]); if (x <= 4) b -= 14; else if (x <= 9) b -= 8; else if (x >= 200) b += 10; else if (x >= 70) b += 6; }
  if (!m.json) b -= 25;
  if (m.kontekst < 32000) b -= 8;
  if (m.reasoning) b += 3;
  return { ball: Math.max(5, Math.min(98, Math.round(b))), manba: 'taxmin' };
}

/** Bir javob uchun taxminiy narx (≈3000 kirish + 500 chiqish token). */
export const javobNarxi = (m: Pick<OrModel, 'kirish_usd' | 'chiqish_usd'>): number => (3000 * m.kirish_usd + 500 * m.chiqish_usd) / 1e6;

export function baholash(m: OrModel, profil: string | null): Baholash {
  const t = (profil && TALAB[profil]) || TALAB_STANDART;
  const k = kuchBahosi(m);
  const sabablar: string[] = [];
  let daraja: Moslik = k.ball >= t.min + 12 ? 'juda_mos' : k.ball >= t.min ? 'mos' : k.ball >= t.min - 8 ? 'chegarada' : 'kuchsiz';
  let ogoh: string | null = null;
  if (daraja === 'kuchsiz') ogoh = `Bu model «${profil ?? 'ishchi'}» uchun KUCHSIZ (baho ${k.ball}, talab ${t.min}): raqamlarni noto‘g‘ri aytishi yoki o‘ylab topishi ehtimoli yuqori — tavsiya etilmaydi.`;
  else if (daraja === 'chegarada') ogoh = `Chegarada (baho ${k.ball}, talab ${t.min}): oddiy savollarga yetadi, lekin murakkab hisob-kitobda xato qilishi mumkin — natijani tekshirib turing.`;
  if (!m.json) { sabablar.push('Strukturali (JSON) javobni kafolatlamaydi — harakat takliflari ishlamasligi mumkin'); if (daraja === 'juda_mos' || daraja === 'mos') daraja = 'chegarada'; ogoh = ogoh ?? 'Bu model JSON formatni yaxshi qo‘llamaydi — harakat takliflari va tuzilmali javoblar buzilishi mumkin.'; }
  if (t.vision && !m.vision) { sabablar.push('Rasm (skrinshot) ko‘ra olmaydi'); ogoh = ogoh ?? 'Bu model skrinshotni ko‘ra olmaydi — foydalanuvchi rasmi tahlil qilinmaydi.'; }
  if (m.reasoning) sabablar.push('Fikrlash rejimi: qo‘shimcha (ko‘rinmas) tokenlar sarflashi mumkin — xarajat kutilganidan oshishi mumkin');
  if (k.manba === 'taxmin') sabablar.push('Kuch bahosi TAXMINIY (model tanilgan ro‘yxatda yo‘q) — narx va hajmdan hisoblangan');
  if (m.kontekst < 32000) sabablar.push('Kontekst kichik (<32k) — katta ma’lumot sig‘maydi');
  const narx = javobNarxi(m);
  if (narx > 0.01) { sabablar.push(`Qimmat: har javob ≈ $${narx.toFixed(3)}`); ogoh = ogoh ?? `Qimmat model: har javob ≈ $${narx.toFixed(3)}. Sinov byudjeti tez tugashi mumkin.`; }
  if (daraja === 'juda_mos') sabablar.unshift('Talabdan sezilarli kuchli');
  else if (daraja === 'mos') sabablar.unshift('Talabga mos');
  return { ball: k.ball, manba: k.manba, daraja, talab: t.min, sabablar, ogohlantirish: ogoh, javob_narxi_usd: narx };
}

/** Tavsiya: talabga mos (mos/juda_mos, rasm kerak bo'lsa rasmli) eng ARZON modellar. */
export function tavsiyaEtilgan(royxat: Array<{ id: string; b: Baholash; narx: number }>, n = 3): string[] {
  return royxat.filter((x) => x.b.daraja === 'mos' || x.b.daraja === 'juda_mos').filter((x) => !x.b.ogohlantirish || !/skrinshot|JSON/.test(x.b.ogohlantirish))
    .sort((a, c) => a.narx - c.narx || c.b.ball - a.b.ball).slice(0, n).map((x) => x.id);
}

/** OpenRouter javobidan (https://openrouter.ai/api/v1/models) ixcham modelga. Matn chiqaradigan, narxi aniq modellar. */
export function orModelgaAylantir(x: unknown): OrModel | null {
  const o = (x ?? {}) as { id?: unknown; name?: unknown; context_length?: unknown; pricing?: { prompt?: unknown; completion?: unknown }; architecture?: { input_modalities?: unknown; output_modalities?: unknown }; supported_parameters?: unknown };
  const id = typeof o.id === 'string' ? o.id : '';
  if (!/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/.test(id) || id.length > 120) return null;
  const kir = Number(o.pricing?.prompt) * 1e6; const chiq = Number(o.pricing?.completion) * 1e6;
  if (!Number.isFinite(kir) || !Number.isFinite(chiq) || kir < 0 || chiq < 0 || kir > 1000 || chiq > 1000) return null;
  const chiqish = Array.isArray(o.architecture?.output_modalities) ? o.architecture!.output_modalities as unknown[] : ['text'];
  if (!chiqish.includes('text')) return null;
  const kirish = Array.isArray(o.architecture?.input_modalities) ? o.architecture!.input_modalities as unknown[] : ['text'];
  const sp = Array.isArray(o.supported_parameters) ? o.supported_parameters as unknown[] : [];
  return {
    id, nom: String(o.name ?? id).slice(0, 100), kirish_usd: Math.round(kir * 1e6) / 1e6, chiqish_usd: Math.round(chiq * 1e6) / 1e6,
    kontekst: Number(o.context_length) || 0, vision: kirish.includes('image'), tools: sp.includes('tools'), json: sp.includes('response_format') || sp.includes('structured_outputs'), reasoning: sp.includes('reasoning'),
  };
}

let kesh: { vaqt: number; royxat: OrModel[] } | null = null;
/** OpenRouter ommaviy ro'yxati (kalitsiz, 15 daqiqa keshlanadi). Xato bo'lsa — eski kesh yoki bo'sh ro'yxat. */
export async function openrouterModellar(fetchImpl: typeof fetch = fetch, hozir = Date.now()): Promise<OrModel[]> {
  if (kesh && hozir - kesh.vaqt < 15 * 60_000) return kesh.royxat;
  try {
    const r = await fetchImpl('https://openrouter.ai/api/v1/models', { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json() as { data?: unknown[] };
    const royxat = (Array.isArray(j.data) ? j.data : []).map(orModelgaAylantir).filter((x): x is OrModel => x !== null);
    if (royxat.length) kesh = { vaqt: hozir, royxat };
    return royxat.length ? royxat : (kesh as { royxat: OrModel[] } | null)?.royxat ?? [];
  } catch { return kesh?.royxat ?? []; }
}
export const keshniTozala = () => { kesh = null; };
