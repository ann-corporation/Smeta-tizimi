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
  /** «исключать» position (thickness/size below the norm): counted negative. */
  minus?: boolean;
  holat: IshHolati;
  /** Normative collections to search first (e.g. ["E06"]); a hint, never a filter that hides other results. */
  toplam?: string[];
  /** Coefficient PROPOSALS (technical part of the norm book); applied only after the operator accepts them. */
  koeffitsientlar?: KoefTaklif[];
};
/** What a coefficient multiplies: all resources, labour, machines, labour+machines or materials. */
export const KOEF_QOLLANISH = ['ALL', 'ЧЕЛ', 'МАШ', 'ЧЕЛ+МАШ', 'МАТ'] as const;
export type KoefQollanish = typeof KOEF_QOLLANISH[number];
export type KoefTaklif = { nom: string; qiymat: string; qollanish: KoefQollanish; asos: string };
export type SuhbatJavobi = { javob: string; savollar: string[]; ishlar: IshNiyati[]; amallar?: AgentAmal[] };
/**
 * Studio agent actions (owner 2026-10-16: "AI boshidan oxirigacha ishlay olishi kerak — narxlashdan hujjat tartibigacha").
 * The model only PROPOSES; the user runs them (one click, one undo step). "ish" is a work reference from the estimate
 * summary ([i3]) or a section/resource name; "qiymat" the value; "manba" the source document for a manual price.
 */
export const AMAL_TURLARI = ['material', 'hajm', 'ochir', 'kochir', 'bolim', 'bolim_tartib', 'koef_tanla', 'hudud', 'narxla', 'narx', 'stavka_tasdiq', 'bosqich', 'hujjat'] as const;
export type AgentAmal = { tur: typeof AMAL_TURLARI[number]; ish: string | null; qiymat: string | null; manba: string | null; izoh: string };
export function agentAmallariniTekshir(raw: unknown): AgentAmal[] {
  const s = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
  return (Array.isArray(raw) ? raw : []).slice(0, 30).flatMap((x: unknown) => {
    const r = (x ?? {}) as Record<string, unknown>;
    const tur = AMAL_TURLARI.find(t => t === r.tur);
    return tur ? [{ tur, ish: s(r.ish, 200), qiymat: s(r.qiymat, 400), manba: s(r.manba, 400), izoh: s(r.izoh, 300) ?? '' }] : [];
  });
}
export type SuhbatXabari = { rol: 'user' | 'assistant'; matn: string };

export type TanlovNomzodi = { id: string; kod: string; nom: string; birlik: string | null;
  /** Normative table title and collection — tell the model WHAT KIND of work a variant belongs to. */
  jadval?: string | null; toplam?: string | null };
export type TanlovSorovi = { id: string; tavsif: string; birlik: Birlik; material: string | null; nomzodlar: TanlovNomzodi[] };
export type Tanlov = { id: string; ishId: string | null; sabab: string; /** New normative phrasings when no candidate fits (second search round). */ qidiruv?: string[] };

/** Price choice for one estimate resource among candidates the BROWSER found (catalogue / company estimates). */
export type NarxNomzodi = { id: string; nom: string; birlik: string | null; narx: number; manba: string;
  /** Price is in ANOTHER unit than the resource: choosing it requires a dimensional recalculation formula. */
  birlikBoshqa?: boolean };
export type NarxSorovi = { id: string; nom: string; birlik: string | null; kat: string | null; nomzodlar: NarxNomzodi[] };
export type NarxTanlov = { id: string; tanlov: string | null; ishonch: 'yuqori' | 'orta' | 'past'; sabab: string; qidiruv?: string[];
  /** For a unit-different candidate: estimate price = candidate price × ifoda (numbers only from the names). */
  qayta_hisob?: { ifoda: string; izoh: string } };

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
/** "m3", "м³", "куб.м", "m^3" → "м3"; "t", "тн", "тонна" → "т"; "dona", "sht" → "шт"; unknown → null. */
export function birlikNormal(v: unknown): Birlik | null {
  const s = String(v ?? '').toLowerCase().replace(/\s+/g, '').replace('³', '3').replace('²', '2').replace('^', '').replace(/\.$/, '');
  const MAP: Record<string, Birlik> = { м3: 'м3', m3: 'м3', кубм: 'м3', 'куб.м': 'м3', м2: 'м2', m2: 'м2', 'кв.м': 'м2', квм: 'м2', м: 'м', m: 'м', 'п.м': 'м', пм: 'м', mp: 'м',
    т: 'т', t: 'т', тн: 'т', tn: 'т', тонна: 'т', tonna: 'т', кг: 'кг', kg: 'кг', шт: 'шт', sht: 'шт', dona: 'шт', pcs: 'шт', компл: 'компл', komplekt: 'компл', компл1: 'компл' };
  return MAP[s] ?? null;
}
const ID = /^[A-Za-z0-9_-]{1,40}$/;

/** Matn ichidan birlik: "100 м3", "м³ (куб)" — birinchi tanilgan token. */
function birlikTop(v: unknown): Birlik | null {
  const to = birlikNormal(v);
  if (to) return to;
  for (const t of String(v ?? '').split(/[\s,;()/]+/)) { const b = birlikNormal(t); if (b) return b; }
  return null;
}

/**
 * Har qanday model javobidan JSON obyektini ajratadi: <think>…</think>, ```json bloklari, oldin/keyin izoh matni,
 * bir nechta obyekt. Qavs balansi (satr ichidagi qavslar hisobga olinadi) bilan nomzodlar yig'iladi; kerakli kalitli
 * oxirgisi, bo'lmasa eng kattasi olinadi. Hech narsa topilmasa — null.
 */
export function jsonAjrat(matn: string, kalitlar: readonly string[] = []): Record<string, unknown> | null {
  const t = String(matn ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
  try { const v: unknown = JSON.parse(t); if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>; } catch { /* nomzodlar */ }
  const nomzodlar: Record<string, unknown>[] = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== '{') continue;
    let d = 0, ichida = false, esc = false;
    for (let j = i; j < t.length; j++) {
      const ch = t[j];
      if (ichida) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') ichida = false; continue; }
      if (ch === '"') ichida = true;
      else if (ch === '{') d++;
      else if (ch === '}' && --d === 0) {
        try { const v: unknown = JSON.parse(t.slice(i, j + 1)); if (v && typeof v === 'object' && !Array.isArray(v)) { nomzodlar.push(v as Record<string, unknown>); i = j; } } catch { /* keyingi */ }
        break;
      }
    }
  }
  if (!nomzodlar.length) return null;
  const mos = nomzodlar.filter((o) => kalitlar.some((k) => k in o));
  if (mos.length) return mos[mos.length - 1];
  return nomzodlar.reduce((a, b) => (JSON.stringify(b).length > JSON.stringify(a).length ? b : a));
}

/** "Е06", "E6", "e-06", "Сборник 6" → "E06" (Latin E, two digits); anything else → null. */
export function toplamKodi(v: unknown): string | null {
  const m = ` ${String(v ?? '').toUpperCase().replace(/Е/g, 'E')}`.match(/[^A-ZА-Я](?:E|СБОРНИК|SBORNIK)\s*-?\s*(\d{1,2})(?!\d)/);
  return m ? `E${m[1].padStart(2, '0')}` : null;
}

/** Coefficient proposals: a value within 0.1–5 (not 1), a known scope and a stated basis; anything else is dropped. */
export function koefTakliflari(raw: unknown): KoefTaklif[] {
  const out: KoefTaklif[] = [];
  for (const x of Array.isArray(raw) ? raw.slice(0, 6) : []) {
    const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const v = Number(String(r.qiymat ?? r.value ?? '').replace(',', '.'));
    const q = str(r.qollanish ?? r.scope, 10).toUpperCase().replace(/\s/g, '');
    const qollanish = (KOEF_QOLLANISH as readonly string[]).includes(q) ? q as KoefQollanish : 'ALL';
    const nom = str(r.nom ?? r.name, 160), asos = str(r.asos ?? r.basis ?? r.manba, 300);
    if (!nom || !asos || !Number.isFinite(v) || v < 0.1 || v > 5 || v === 1) continue;
    out.push({ nom, qiymat: String(Math.round(v * 10000) / 10000), qollanish, asos });
  }
  return out;
}

/** Keep only well-formed intents; never trust lengths, ids or units from the model. */
export function suhbatJavobiniTekshir(raw: unknown): SuhbatJavobi {
  // Real models nest the reply ({ javob: { matn, ishlar } }), rename fields (nom/name for tavsif, works/items for ishlar)
  // and attach questions per work. Normalise the shape first; validation stays strict on values.
  const top = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const inner = top.javob && typeof top.javob === 'object' && !Array.isArray(top.javob) ? top.javob as Record<string, unknown> : null;
  const o: Record<string, unknown> = inner ? { ...top, ...inner, javob: inner.matn ?? inner.javob ?? inner.text ?? '' } : top;
  // Works sometimes arrive inside "amallar" (an unknown action type carrying a work description) — they are works, not actions.
  const amalIshlar = (Array.isArray(o.amallar) ? o.amallar as unknown[] : []).filter(x => {
    const r = (x ?? {}) as Record<string, unknown>;
    return !AMAL_TURLARI.some(t => t === r.tur) && (typeof r.tavsif === 'string' || Array.isArray(r.qidiruv));
  });
  const asosiy = [o.ishlar, o.works, o.items, o.ishlar_royxati].find(x => Array.isArray(x) && x.length) as unknown[] | undefined;
  const list = asosiy ?? (amalIshlar.length ? amalIshlar : undefined);
  const extraQ: string[] = [];
  const ishlar: IshNiyati[] = [];
  const seen = new Set<string>();
  for (const x of (list ?? []).slice(0, 60)) {
    const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    // Model farqlari: id yo'q/noto'g'ri bo'lsa — avtomatik; birlik matn ichida bo'lishi mumkin ("100 м3").
    let id = str(r.id, 40);
    if (!ID.test(id) || seen.has(id)) id = `w${ishlar.length + 1}_${seen.size + 1}`;
    const birlik = birlikTop(r.birlik ?? r.unit ?? r.olchov);
    if (!birlik) continue;
    const tavsif = str(r.tavsif ?? r.nom ?? r.name ?? r.description, 300);
    const qXom = r.qidiruv ?? r.search ?? r.qidiruv_iboralari;
    let qidiruv = (Array.isArray(qXom) ? qXom : typeof qXom === 'string' ? qXom.split(/[;|]/) : []).map(q => str(q, 120)).filter(q => q.length >= 3).slice(0, 3);
    if (!qidiruv.length && tavsif.length >= 3) qidiruv = [tavsif.slice(0, 120)];
    for (const q of Array.isArray(r.savollar) ? r.savollar : []) { const t = str(q, 300); if (t && !extraQ.includes(t)) extraQ.push(t); }
    if (!tavsif || !qidiruv.length) continue;
    const h = str(r.holat, 20).toUpperCase();
    let holat = (['TAYYOR', 'HAJM_KERAK', 'ANIQLASH_KERAK'] as const).includes(h as IshHolati) ? h as IshHolati : 'ANIQLASH_KERAK';
    if (/\b(?:agar|taxmin|if|assuming)\b|если|предполож/i.test(str(r.hajmIzoh, 300))) holat = 'ANIQLASH_KERAK';
    const ifoda = str(r.hajmIfoda, 200) || null;
    seen.add(id);
    const toplam = [...new Set((Array.isArray(r.toplam) ? r.toplam : typeof r.toplam === 'string' ? [r.toplam] : []).map(x => toplamKodi(x)).filter((x): x is string => !!x))].slice(0, 4);
    const koeffitsientlar = koefTakliflari(r.koeffitsientlar ?? r.koef ?? r.coefficients);
    ishlar.push({ id, bolim: str(r.bolim, 120) || 'Asosiy', tavsif, qidiruv, birlik, hajmIfoda: ifoda,
      hajmIzoh: str(r.hajmIzoh, 300) || null, material: str(r.material, 120) || null, holat: ifoda ? holat : holat === 'TAYYOR' ? 'HAJM_KERAK' : holat,
      ...(r.minus === true ? { minus: true } : {}),
      ...(toplam.length ? { toplam } : {}), ...(koeffitsientlar.length ? { koeffitsientlar } : {}) });
  }
  const savollar = [...(Array.isArray(o.savollar) ? o.savollar : []).map(q => str(q, 300)).filter(Boolean), ...extraQ];
  return { amallar: agentAmallariniTekshir(o.amallar ?? top.amallar), javob: str(o.javob, 2000) || 'Tushunarli.', savollar: [...new Set(savollar)].slice(0, 5), ishlar };
}

/** A choice survives only if it names one of the candidates the browser sent for that intent. */
export function manbaMaterialiniTekshir(out: SuhbatJavobi, userText: string): SuhbatJavobi {
  const grades = (text: string) => [...text.toUpperCase().matchAll(/(?:^|[^A-ZА-ЯЁ0-9])([ABАВ]\s*\d+(?:[.,]\d+)?)(?=$|[^0-9])/g)]
    .map(m => m[1].replace(/\s/g, '').replace(/А/g, 'A').replace(/В/g, 'B').replace(',', '.'));
  const source = new Set(grades(userText));
  const savollar = [...out.savollar];
  const ishlar = out.ishlar.map(i => {
    if (!i.material || grades(i.material).every(g => source.has(g))) return i;
    savollar.push(`${i.tavsif}: material klassini manbadan aniqlashtiring (${i.material} ko‘rsatilmagan).`);
    return { ...i, material: null, holat: 'ANIQLASH_KERAK' as const };
  });
  return { ...out, ishlar, savollar: [...new Set(savollar)].slice(0, 8) };
}

export function tanlovlarniTekshir(raw: unknown, sorovlar: TanlovSorovi[]): Tanlov[] {
  // Accept the shapes real models produce: { tanlovlar }, { results }, { choices }, a bare array, or nested under javob.
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const inner = o.javob && typeof o.javob === 'object' ? o.javob as Record<string, unknown> : {};
  const list = (Array.isArray(raw) ? raw : [o.tanlovlar, o.results, o.choices, inner.tanlovlar].find(Array.isArray) ?? []) as unknown[];
  const ids = new Set(sorovlar.map(q => q.id));
  const by = new Map(list.map(x => {
    const r = (x ?? {}) as Record<string, unknown>;
    // Some models swap the keys: { ishId: "w1", ... } — treat a request id found under ishId as the row key.
    const key = str(r.id ?? r.ish ?? r.key, 40) || (ids.has(str(r.ishId, 40)) ? str(r.ishId, 40) : '');
    const row = !r.id && ids.has(str(r.ishId, 40)) ? { ...r, ishId: r.tanlov ?? r.nomzod ?? r.workId ?? null } : r;
    return [key, row] as const;
  }));
  return sorovlar.map(s => {
    const r = by.get(s.id);
    const v = r ? str(r.ishId ?? r.tanlov_id ?? r.workId ?? r.tanlov ?? r.chosen, 60) : '';
    // A model may answer with the normative CODE instead of our id — map it, but only within the given candidates.
    const exact = s.nomzodlar.find(n => n.id === v);
    const byCode = s.nomzodlar.filter(n => n.kod === v);
    const ishId = v ? (exact ?? (byCode.length === 1 ? byCode[0] : undefined))?.id ?? null : null;
    const qXom = r?.qidiruv ?? r?.search;
    const qidiruv = ishId ? [] : (Array.isArray(qXom) ? qXom : []).map(q => str(q, 120)).filter(q => q.length >= 3).slice(0, 3);
    return { id: s.id, ishId, sabab: str(r?.sabab, 300) || (ishId ? '' : 'Mos normativ ish tanlanmadi'), ...(qidiruv.length ? { qidiruv } : {}) };
  });
}

/** Price choices: only a candidate id that was sent for that resource survives; confidence is normalised. */
export function narxTanlovlariniTekshir(raw: unknown, sorovlar: NarxSorovi[]): NarxTanlov[] {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = (Array.isArray(raw) ? raw : [o.tanlovlar, o.results, o.choices].find(Array.isArray) ?? []) as unknown[];
  const by = new Map(list.map(x => { const r = (x ?? {}) as Record<string, unknown>; return [str(r.id ?? r.key, 60), r] as const; }));
  return sorovlar.map(s => {
    const r = by.get(s.id);
    const v = r ? str(r.tanlov ?? r.tanlov_id ?? r.nomzod ?? r.choice, 60) : '';
    const tanlov = s.nomzodlar.some(n => n.id === v) ? v : null;
    const i = str(r?.ishonch, 10).toLowerCase();
    const qXom = r?.qidiruv ?? r?.search;
    const qidiruv = tanlov ? [] : (Array.isArray(qXom) ? qXom : []).map(q => str(q, 120)).filter(q => q.length >= 3).slice(0, 3);
    const qh = (r?.qayta_hisob && typeof r.qayta_hisob === 'object' ? r.qayta_hisob : null) as Record<string, unknown> | null;
    const qayta_hisob = tanlov && qh && str(qh.ifoda, 120) ? { ifoda: str(qh.ifoda, 120), izoh: str(qh.izoh, 300) } : null;
    return { id: s.id, tanlov, ishonch: tanlov && (i === 'yuqori' || i === 'orta') ? i : 'past',
      sabab: str(r?.sabab, 300) || (tanlov ? '' : 'Mos nomzod tanlanmadi'), ...(qidiruv.length ? { qidiruv } : {}), ...(qayta_hisob ? { qayta_hisob } : {}) };
  });
}

export const SUHBAT_SXEMA = { name: 'smetachi_suhbat', schema: { type: 'object', additionalProperties: false, required: ['javob', 'savollar', 'ishlar', 'amallar'], properties: {
  javob: { type: 'string' }, savollar: { type: 'array', items: { type: 'string' } },
  amallar: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['tur', 'ish', 'qiymat', 'manba', 'izoh'], properties: {
    tur: { type: 'string', enum: [...AMAL_TURLARI] }, ish: { type: ['string', 'null'] }, qiymat: { type: ['string', 'null'] }, manba: { type: ['string', 'null'] }, izoh: { type: 'string' } } } },
  ishlar: { type: 'array', items: { type: 'object', additionalProperties: false,
    required: ['id', 'bolim', 'tavsif', 'qidiruv', 'birlik', 'hajmIfoda', 'hajmIzoh', 'material', 'minus', 'holat', 'toplam', 'koeffitsientlar'], properties: {
      minus: { type: 'boolean' },
      id: { type: 'string' }, bolim: { type: 'string' }, tavsif: { type: 'string' }, qidiruv: { type: 'array', items: { type: 'string' } },
      birlik: { type: 'string', enum: [...BIRLIKLAR] }, hajmIfoda: { type: ['string', 'null'] }, hajmIzoh: { type: ['string', 'null'] },
      material: { type: ['string', 'null'] }, holat: { type: 'string', enum: ['TAYYOR', 'HAJM_KERAK', 'ANIQLASH_KERAK'] },
      toplam: { type: 'array', items: { type: 'string' } },
      koeffitsientlar: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['nom', 'qiymat', 'qollanish', 'asos'], properties: {
        nom: { type: 'string' }, qiymat: { type: 'string' }, qollanish: { type: 'string', enum: [...KOEF_QOLLANISH] }, asos: { type: 'string' } } } } } } } } } };

export const TANLOV_SXEMA = { name: 'smetachi_tanlov', schema: { type: 'object', additionalProperties: false, required: ['tanlovlar'], properties: {
  tanlovlar: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'ishId', 'sabab', 'qidiruv'], properties: {
    id: { type: 'string' }, ishId: { type: ['string', 'null'] }, sabab: { type: 'string' }, qidiruv: { type: 'array', items: { type: 'string' } } } } } } } };

/** Normative coefficient choice: per work, codes from the list it was sent (anything else is dropped). */
export type KoefSorovi = { id: string; ish: string; nomzodlar: Array<{ kod: string; shart: string }> };
export type KoefTanlov = { ish: string; kodlar: string[]; sabab: string };
export const KOEF_TANLOV_SXEMA = { name: 'smetachi_koef_tanlov', schema: { type: 'object', additionalProperties: false, required: ['tanlovlar', 'savol'], properties: {
  tanlovlar: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['ish', 'kodlar', 'sabab'], properties: {
    ish: { type: 'string' }, kodlar: { type: 'array', items: { type: 'string' } }, sabab: { type: 'string' } } } },
  savol: { type: ['string', 'null'] } } } };
export function koefTanlovlariniTekshir(v: Record<string, unknown> | null, sorovlar: KoefSorovi[]): { tanlovlar: KoefTanlov[]; savol: string | null } {
  const by = new Map(sorovlar.map(s => [s.id, new Set(s.nomzodlar.map(n => n.kod))]));
  const tanlovlar = (Array.isArray(v?.tanlovlar) ? v!.tanlovlar as unknown[] : []).flatMap(x => {
    const r = (x ?? {}) as Record<string, unknown>;
    const ish = typeof r.ish === 'string' ? r.ish : '', ruxsat = by.get(ish);
    if (!ruxsat) return [];
    const kodlar = [...new Set((Array.isArray(r.kodlar) ? r.kodlar : []).filter((k): k is string => typeof k === 'string' && ruxsat.has(k)))];
    return kodlar.length ? [{ ish, kodlar, sabab: typeof r.sabab === 'string' ? r.sabab.slice(0, 300) : '' }] : [];
  });
  return { tanlovlar, savol: typeof v?.savol === 'string' && v.savol.trim() ? v.savol.trim().slice(0, 500) : null };
}

/** Commercial offer / price list read by the model (rows are re-validated here, prices never invented). */
export type KpOqish = { yetkazuvchi: string | null; inn: string | null; raqam: string | null; sana: string | null;
  nds_holati: 'nds_bilan' | 'nds_siz' | 'nomalum'; nds_dalil: string | null; qatorlar: Array<{ nom: string; birlik: string | null; narx: number | null }> };
export const KP_SXEMA = { name: 'smetachi_kp_oqish', schema: { type: 'object', additionalProperties: false,
  required: ['yetkazuvchi', 'inn', 'raqam', 'sana', 'nds_holati', 'nds_dalil', 'qatorlar'], properties: {
    yetkazuvchi: { type: ['string', 'null'] }, inn: { type: ['string', 'null'] }, raqam: { type: ['string', 'null'] }, sana: { type: ['string', 'null'] },
    nds_holati: { type: 'string', enum: ['nds_bilan', 'nds_siz', 'nomalum'] }, nds_dalil: { type: ['string', 'null'] },
    qatorlar: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['nom', 'birlik', 'narx'], properties: {
      nom: { type: 'string' }, birlik: { type: ['string', 'null'] }, narx: { type: ['number', 'null'] } } } } } } };
const kpMatn = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
export function kpJavobiniTekshir(v: Record<string, unknown> | null): KpOqish {
  const o = v ?? {};
  const nds = o.nds_holati === 'nds_bilan' || o.nds_holati === 'nds_siz' ? o.nds_holati : 'nomalum';
  const sana = kpMatn(o.sana, 10);
  const qatorlar = (Array.isArray(o.qatorlar) ? o.qatorlar : []).slice(0, 2000).flatMap((q: unknown) => {
    const r = (q ?? {}) as Record<string, unknown>;
    const nom = kpMatn(r.nom, 600);
    const narx = typeof r.narx === 'number' && Number.isFinite(r.narx) && r.narx > 0 ? Math.round(r.narx * 100) / 100 : null;
    return nom ? [{ nom, birlik: kpMatn(r.birlik, 30), narx }] : [];
  });
  return { yetkazuvchi: kpMatn(o.yetkazuvchi, 200), inn: kpMatn(o.inn, 20)?.replace(/\D/g, '') || null, raqam: kpMatn(o.raqam, 60),
    sana: sana && /^\d{4}-\d{2}-\d{2}$/.test(sana) ? sana : null, nds_holati: nds, nds_dalil: kpMatn(o.nds_dalil, 200), qatorlar };
}

export const NARX_TANLOV_SXEMA = { name: 'smetachi_narx_tanlov', schema: { type: 'object', additionalProperties: false, required: ['tanlovlar'], properties: {
  tanlovlar: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'tanlov', 'ishonch', 'sabab', 'qidiruv', 'qayta_hisob'], properties: {
    id: { type: 'string' }, tanlov: { type: ['string', 'null'] }, ishonch: { type: 'string', enum: ['yuqori', 'orta', 'past'] }, sabab: { type: 'string' },
    qidiruv: { type: 'array', items: { type: 'string' } },
    qayta_hisob: { type: ['object', 'null'], additionalProperties: false, required: ['ifoda', 'izoh'], properties: { ifoda: { type: 'string' }, izoh: { type: 'string' } } } } } } } } };
