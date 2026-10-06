/**
 * Smetachi AI — shared contract between the browser orchestrator and /api/smeta-ai.
 * The model never writes the estimate: it returns (1) a reply + questions, (2) work intents with Russian
 * normative search phrases and a quantity FORMULA from the user's own dimensions, (3) a choice among
 * catalogue candidates the browser found. Everything is validated here; invalid parts are dropped.
 */
export const BIRLIKLAR = ['м3', 'м2', 'м', 'т', 'кг', 'шт', 'компл'] as const;
export type Birlik = typeof BIRLIKLAR[number];
export type IshHolati = 'TAYYOR' | 'HAJM_KERAK' | 'ANIQLASH_KERAK';

export type IshNiyati = {
  /** Stable within a conversation ("w1", "w2"...). */
  id: string;
  /** Section in the estimate, e.g. "Fundament". */
  bolim: string;
  /** Plain Uzbek description, e.g. "Beton tayyorlov (podbetonka) B7,5, 100 mm". */
  tavsif: string;
  /** 1–3 Russian phrases in normative (ShNQ/ГЭСН) wording for catalogue search. */
  qidiruv: string[];
  birlik: Birlik;
  /** Quantity formula built ONLY from numbers the user gave (or null if still unknown). */
  hajmIfoda: string | null;
  /** Where the numbers came from / assumptions, shown to the user. */
  hajmIzoh: string | null;
  /** Material characteristic that matters for the resource (e.g. "Бетон B7,5"), optional. */
  material: string | null;
  holat: IshHolati;
};
export type SuhbatJavobi = { javob: string; savollar: string[]; ishlar: IshNiyati[] };
export type SuhbatXabari = { rol: 'user' | 'assistant'; matn: string };

export type TanlovNomzodi = { id: string; kod: string; nom: string; birlik: string | null };
export type TanlovSorovi = { id: string; tavsif: string; birlik: Birlik; material: string | null; nomzodlar: TanlovNomzodi[] };
export type Tanlov = { id: string; ishId: string | null; sabab: string };

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
/** "m3", "м³", "куб.м", "m^3" → "м3"; "t", "тн", "тонна" → "т"; "dona", "sht" → "шт"; unknown → null. */
export function birlikNormal(v: unknown): Birlik | null {
  const s = String(v ?? '').toLowerCase().replace(/\s+/g, '').replace('³', '3').replace('²', '2').replace('^', '').replace(/\.$/, '');
  const MAP: Record<string, Birlik> = { м3: 'м3', m3: 'м3', кубм: 'м3', 'куб.м': 'м3', м2: 'м2', m2: 'м2', 'кв.м': 'м2', квм: 'м2', м: 'м', m: 'м', 'п.м': 'м', пм: 'м', mp: 'м',
    т: 'т', t: 'т', тн: 'т', tn: 'т', тонна: 'т', tonna: 'т', кг: 'кг', kg: 'кг', шт: 'шт', sht: 'шт', dona: 'шт', pcs: 'шт', компл: 'компл', komplekt: 'компл', компл1: 'компл' };
  return MAP[s] ?? null;
}
const ID = /^[A-Za-z0-9_-]{1,40}$/;

/** Keep only well-formed intents; never trust lengths, ids or units from the model. */
export function suhbatJavobiniTekshir(raw: unknown): SuhbatJavobi {
  // Real models nest the reply ({ javob: { matn, ishlar } }), rename fields (nom/name for tavsif, works/items for ishlar)
  // and attach questions per work. Normalise the shape first; validation stays strict on values.
  const top = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const inner = top.javob && typeof top.javob === 'object' && !Array.isArray(top.javob) ? top.javob as Record<string, unknown> : null;
  const o: Record<string, unknown> = inner ? { ...top, ...inner, javob: inner.matn ?? inner.javob ?? inner.text ?? '' } : top;
  const list = [o.ishlar, o.works, o.items, o.ishlar_royxati].find(Array.isArray) as unknown[] | undefined;
  const extraQ: string[] = [];
  const ishlar: IshNiyati[] = [];
  const seen = new Set<string>();
  for (const x of (list ?? []).slice(0, 60)) {
    const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const id = str(r.id, 40), birlik = birlikNormal(r.birlik);
    if (!ID.test(id) || seen.has(id) || !birlik) continue;
    const qidiruv = (Array.isArray(r.qidiruv) ? r.qidiruv : typeof r.qidiruv === 'string' ? r.qidiruv.split(/[;|]/) : []).map(q => str(q, 120)).filter(q => q.length >= 3).slice(0, 3);
    const tavsif = str(r.tavsif ?? r.nom ?? r.name ?? r.description, 300);
    for (const q of Array.isArray(r.savollar) ? r.savollar : []) { const t = str(q, 300); if (t && !extraQ.includes(t)) extraQ.push(t); }
    if (!tavsif || !qidiruv.length) continue;
    const h = str(r.holat, 20).toUpperCase();
    const holat = (['TAYYOR', 'HAJM_KERAK', 'ANIQLASH_KERAK'] as const).includes(h as IshHolati) ? h as IshHolati : 'ANIQLASH_KERAK';
    const ifoda = str(r.hajmIfoda, 200) || null;
    seen.add(id);
    ishlar.push({ id, bolim: str(r.bolim, 120) || 'Asosiy', tavsif, qidiruv, birlik, hajmIfoda: ifoda,
      hajmIzoh: str(r.hajmIzoh, 300) || null, material: str(r.material, 120) || null, holat: ifoda ? holat : holat === 'TAYYOR' ? 'HAJM_KERAK' : holat });
  }
  const savollar = [...(Array.isArray(o.savollar) ? o.savollar : []).map(q => str(q, 300)).filter(Boolean), ...extraQ];
  return { javob: str(o.javob, 2000) || 'Tushunarli.', savollar: [...new Set(savollar)].slice(0, 5), ishlar };
}

/** A choice survives only if it names one of the candidates the browser sent for that intent. */
export function tanlovlarniTekshir(raw: unknown, sorovlar: TanlovSorovi[]): Tanlov[] {
  // Accept the shapes real models produce: { tanlovlar }, { results }, { choices }, a bare array, or nested under javob.
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const inner = o.javob && typeof o.javob === 'object' ? o.javob as Record<string, unknown> : {};
  const list = (Array.isArray(raw) ? raw : [o.tanlovlar, o.results, o.choices, inner.tanlovlar].find(Array.isArray) ?? []) as unknown[];
  const by = new Map(list.map(x => { const r = (x ?? {}) as Record<string, unknown>; return [str(r.id ?? r.ish ?? r.key, 40), r] as const; }));
  return sorovlar.map(s => {
    const r = by.get(s.id);
    const v = r ? str(r.ishId ?? r.tanlov_id ?? r.workId ?? r.tanlov ?? r.chosen, 60) : '';
    // A model may answer with the normative CODE instead of our id — map it, but only within the given candidates.
    const ishId = v ? (s.nomzodlar.find(n => n.id === v) ?? s.nomzodlar.find(n => n.kod === v))?.id ?? null : null;
    return { id: s.id, ishId, sabab: str(r?.sabab, 300) || (ishId ? '' : 'Mos normativ ish tanlanmadi') };
  });
}

export const SUHBAT_SXEMA = { name: 'smetachi_suhbat', schema: { type: 'object', additionalProperties: false, required: ['javob', 'savollar', 'ishlar'], properties: {
  javob: { type: 'string' }, savollar: { type: 'array', items: { type: 'string' } },
  ishlar: { type: 'array', items: { type: 'object', additionalProperties: false,
    required: ['id', 'bolim', 'tavsif', 'qidiruv', 'birlik', 'hajmIfoda', 'hajmIzoh', 'material', 'holat'], properties: {
      id: { type: 'string' }, bolim: { type: 'string' }, tavsif: { type: 'string' }, qidiruv: { type: 'array', items: { type: 'string' } },
      birlik: { type: 'string', enum: [...BIRLIKLAR] }, hajmIfoda: { type: ['string', 'null'] }, hajmIzoh: { type: ['string', 'null'] },
      material: { type: ['string', 'null'] }, holat: { type: 'string', enum: ['TAYYOR', 'HAJM_KERAK', 'ANIQLASH_KERAK'] } } } } } } };

export const TANLOV_SXEMA = { name: 'smetachi_tanlov', schema: { type: 'object', additionalProperties: false, required: ['tanlovlar'], properties: {
  tanlovlar: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'ishId', 'sabab'], properties: {
    id: { type: 'string' }, ishId: { type: ['string', 'null'] }, sabab: { type: 'string' } } } } } } };
