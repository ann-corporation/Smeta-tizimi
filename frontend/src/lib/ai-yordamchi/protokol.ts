/**
 * Sahifa AI yordamchisi — brauzer va /api/smeta-ai (`sahifa_suhbat`) orasidagi umumiy shartnoma
 * (egasi 2026-10-25: «fakt va F2 tayyorlash oynalarida AI xuddi Smeta Studio'dagi agent kuchida ishlasin»).
 *
 * Smeta Studio agenti bilan bir xil tamoyil: model hech narsani O'ZI yozmaydi. U
 *  (1) o'qish vositalarini so'raydi (`oqish`) — brauzer ularni foydalanuvchining O'Z sessiyasidagi real ma'lumot ustida
 *      bajaradi va natijani keyingi aylanishda modelga qaytaradi (tool-calling, ≤ 3 aylanish);
 *  (2) amallarni TAKLIF qiladi (`amallar`) — foydalanuvchi belgilab «Bajarish» ni bosadi; har yozuv mavjud yozish yo'li
 *      (kiritma + Ctrl+S, mavjud modal «Saqlash») orqali, egasining aniq tasdig'i bilan.
 * Har sahifaning vositalar ro'yxati shu yerda — ro'yxatda yo'q vosita/amal tashlanadi.
 */
export const SAHIFALAR = ['fakt', 'f2', 'buyruq'] as const;
export type SahifaTuri = typeof SAHIFALAR[number];

export const SAHIFA_VOSITALARI: Record<SahifaTuri, { oqish: readonly string[]; amal: readonly string[] }> = {
  fakt: {
    /** qidir — smeta qatorlari (shifr/nom/ma'no, butun obyekt daraxti); holat — obyekt/bo'lim holati; bolim — bo'lim ishlari raqamlari;
     *  normativ — normativ katalogdan pozitsiya nomzodlari (zamena uchun). */
    oqish: ['qidir', 'holat', 'bolim', 'normativ'],
    /** fakt_hajm — kiritmaga ("+5" bugun / "=40" jami); material_ol — ishdan keyingi alohida materiallar taklifi;
     *  zamena — zamena oynasi (qiymat = normativ pozitsiya id); bajarilmaydi — «bajarilmaydi» oynasi; korsat — qatorni ko'rsatish. */
    amal: ['fakt_hajm', 'material_ol', 'zamena', 'bajarilmaydi', 'korsat'],
  },
  f2: {
    oqish: ['qidir', 'holat', 'bolim', 'tekshir', 'narx'],
    amal: ['f2_hajm', 'faktdan_ol', 'narx', 'korsat'],
  },
  /** Ctrl+K buyruq satri (butun obyekt bo'yicha): qidir/holat — umumiy; narxsiz — narxi yo'q qatorlar; qoldiq — smeta/F2/fakt qoldig'i.
   *  Amallar: fakt_hajm (+5 / =40, oddiy yozish), narx_tuzat (qiymat = yangi narx NDS siz, PUL: ikkinchi «Tasdiqlayman»), korsat, och (qiymat = sahifa yo'li — yagona yordamchi Jarvis navigatsiyasi, yozuv emas). */
  buyruq: {
    oqish: ['qidir', 'holat', 'narxsiz', 'qoldiq'],
    amal: ['fakt_hajm', 'narx_tuzat', 'korsat', 'och', 'arxivla'],
  },
};

export type OqishSorovi = { vosita: string; arg: string | null };
export type OqishNatija = OqishSorovi & { natija: string };
export type SahifaAmal = { tur: string; qator: number | null; qiymat: string | null; izoh: string };
export type SahifaJavob = { javob: string; savollar: string[]; oqish: OqishSorovi[]; amallar: SahifaAmal[] };
export type SahifaXabar = { rol: 'user' | 'assistant'; matn: string };

const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');

export function sahifaTuri(v: unknown): SahifaTuri | null {
  return (SAHIFALAR as readonly string[]).includes(String(v)) ? v as SahifaTuri : null;
}

/** Model javobini qat'iy tekshiradi: ro'yxatda yo'q vosita/amal, noto'g'ri qator id tashlanadi; matnlar qisqartiriladi. */
export function sahifaJavobiniTekshir(raw: unknown, sahifa: SahifaTuri): SahifaJavob {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const v = SAHIFA_VOSITALARI[sahifa];
  const oqish: OqishSorovi[] = [];
  for (const x of Array.isArray(o.oqish) ? o.oqish.slice(0, 6) : []) {
    const r = (x ?? {}) as Record<string, unknown>;
    const vosita = str(r.vosita, 30);
    if (!v.oqish.includes(vosita)) continue;
    const arg = str(r.arg, 300) || null;
    if (!oqish.some((q) => q.vosita === vosita && q.arg === arg)) oqish.push({ vosita, arg });
  }
  const amallar: SahifaAmal[] = [];
  for (const x of Array.isArray(o.amallar) ? o.amallar.slice(0, 40) : []) {
    const r = (x ?? {}) as Record<string, unknown>;
    const tur = str(r.tur, 30);
    if (!v.amal.includes(tur)) continue;
    const q = Number(r.qator);
    const qator = r.qator == null || r.qator === '' ? null : Number.isSafeInteger(q) && q > 0 ? q : NaN;
    if (Number.isNaN(qator)) continue;
    amallar.push({ tur, qator, qiymat: str(r.qiymat, 200) || null, izoh: str(r.izoh, 300) });
  }
  const savollar = (Array.isArray(o.savollar) ? o.savollar : []).map((s) => str(s, 300)).filter(Boolean).slice(0, 5);
  return { javob: str(o.javob, 4000) || (oqish.length ? '' : 'Tushunarli.'), savollar, oqish, amallar };
}

/** Sahifa vositalari bilan JSON sxema (enumlar shu sahifaniki). */
export function sahifaSxema(sahifa: SahifaTuri) {
  const v = SAHIFA_VOSITALARI[sahifa];
  return { name: `sahifa_yordam_${sahifa}`, schema: { type: 'object', additionalProperties: false, required: ['javob', 'savollar', 'oqish', 'amallar'], properties: {
    javob: { type: 'string' }, savollar: { type: 'array', items: { type: 'string' } },
    oqish: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['vosita', 'arg'], properties: {
      vosita: { type: 'string', enum: [...v.oqish] }, arg: { type: ['string', 'null'] } } } },
    amallar: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['tur', 'qator', 'qiymat', 'izoh'], properties: {
      tur: { type: 'string', enum: [...v.amal] }, qator: { type: ['integer', 'null'] }, qiymat: { type: ['string', 'null'] }, izoh: { type: 'string' } } } } } } };
}

/** Brauzerdan kelgan o'qish natijalari (server tomonda ham chegaralanadi). */
export function oqishNatijalari(raw: unknown, sahifa: SahifaTuri): OqishNatija[] {
  const v = SAHIFA_VOSITALARI[sahifa];
  return (Array.isArray(raw) ? raw.slice(0, 18) : []).flatMap((x) => {
    const r = (x ?? {}) as Record<string, unknown>;
    const vosita = str(r.vosita, 30);
    return v.oqish.includes(vosita) ? [{ vosita, arg: str(r.arg, 300) || null, natija: str(r.natija, 8000) }] : [];
  });
}
