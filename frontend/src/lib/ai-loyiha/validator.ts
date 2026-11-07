/**
 * AI javobini fail-closed tekshiradi va kanonik `SahifaNatija` ga aylantiradi.
 * Qoidalar: noma'lum qiymat — null (0 EMAS); manfiy/NaN o'lcham rad etiladi; birlik kanonik ro'yxatga
 * keltiriladi, keltirilmasa null + ogohlantirish; elementsiz yoki tuzilmasi buzuq javob — xato.
 */
import {
  BIRLIKLAR, DOIRALAR, ELEMENT_TURLARI, VARAQ_TURLARI,
  type Birlik, type Doira, type ElementTuri, type LoyihaElement, type SahifaNatija, type VaraqTuri,
} from './sxema';

export const MAX_ELEMENT_SAHIFADA = 200;

export type ValidatorNatija =
  | { ok: true; natija: SahifaNatija; ogohlantirishlar: string[] }
  | { ok: false; kod: 'JSON_EMAS' | 'TUZILMA_BUZUQ' | 'JUDA_KOP_ELEMENT'; tafsilot: string };

type Obj = Record<string, unknown>;
const obj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** «0,6», «2 400», 0.6 → son; bo'sh/yaroqsiz → null. */
export function sonYokiNull(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/[\s ]/g, '').replace(',', '.');
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const musbatYokiNull = (v: unknown): number | null => {
  const n = sonYokiNull(v);
  return n == null || n < 0 ? null : n;
};

const matn = (v: unknown, max = 300): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/\s+/g, ' ');
  return s ? s.slice(0, max) : null;
};

const BIRLIK_TAXALLUS: Record<string, Birlik> = {
  'm': 'm', 'м': 'm', 'p.m': 'm', 'pm': 'm', 'п.м': 'm', 'пм': 'm', 'пог.м': 'm', 'м.п': 'm', 'мп': 'm', 'пог.м.': 'm', 'lm': 'm',
  'm2': 'm2', 'м2': 'm2', 'кв.м': 'm2', 'm²': 'm2', 'м²': 'm2',
  'm3': 'm3', 'м3': 'm3', 'куб.м': 'm3', 'm³': 'm3', 'м³': 'm3',
  'kg': 'kg', 'кг': 'kg',
  't': 't', 'т': 't', 'tn': 't', 'тн': 't', 'тонна': 't',
  'dona': 'dona', 'шт': 'dona', 'шт.': 'dona', 'pcs': 'dona', 'ta': 'dona', 'компл': 'dona',
};

/** Chizmadagi birlik yozuvini kanonik birlikka keltiradi; keltirilmasa null. */
export function birlikKanon(v: unknown): Birlik | null {
  if (typeof v !== 'string') return null;
  const k = v.trim().toLowerCase().replace(/\s+/g, '').replace(/\.$/, '');
  if ((BIRLIKLAR as readonly string[]).includes(k)) return k as Birlik;
  return BIRLIK_TAXALLUS[k] ?? BIRLIK_TAXALLUS[k + '.'] ?? null;
}

const enumOl = <T extends string>(ruxsat: readonly T[], v: unknown, zaxira: T): T =>
  typeof v === 'string' && (ruxsat as readonly string[]).includes(v) ? (v as T) : zaxira;

function elementOl(x: Obj, sahifa: number, i: number, ogoh: string[], varaqShifr: string | null, hujjat: string | null): LoyihaElement | null {
  const nom = matn(x.nom, 200);
  if (!nom) { ogoh.push(`ELEMENT_NOMSIZ:${i}`); return null; }
  const birlikXom = x.birlik;
  const birlik = birlikKanon(birlikXom);
  if (birlikXom != null && birlikXom !== '' && !birlik) ogoh.push(`BIRLIK_NOMALUM:${i}:${String(birlikXom).slice(0, 20)}`);
  const olcham = Array.isArray(x.olcham_m) ? x.olcham_m.map(musbatYokiNull) : null;
  const olcham_m = olcham && olcham.length && olcham.every((n): n is number => n != null && n > 0) ? olcham.slice(0, 4) : null;
  if (olcham && !olcham_m) ogoh.push(`OLCHAM_YAROQSIZ:${i}`);
  const ishXom = sonYokiNull(x.ishonch);
  const ishonch = ishXom == null ? 0 : Math.min(Math.max(ishXom, 0), 1);
  return {
    id: `${hujjat ? hujjat + ':' : ''}s${sahifa}-e${i + 1}`,
    marka: matn(x.marka, 40),
    tur: enumOl<ElementTuri>(ELEMENT_TURLARI, x.tur, 'boshqa'),
    nom,
    kesim: matn(x.kesim, 60),
    olcham_m,
    uzunlik_m: musbatYokiNull(x.uzunlik_m),
    soni: musbatYokiNull(x.soni),
    miqdor: musbatYokiNull(x.miqdor),
    birlik,
    birlik_massa_kg: musbatYokiNull(x.birlik_massa_kg),
    doira: enumOl<Doira>(DOIRALAR, x.doira, 'jami'),
    tayanchga_tegishli: x.tayanchga_tegishli === true,
    ota_marka: matn(x.ota_marka, 40),
    // Element varaq ko'rsatmasa — sahifa shtampidagi shifr (bitta sahifa = bitta varaq).
    manba: { varaq: matn(x.varaq, 40) ?? varaqShifr, sahifa, pozitsiya: matn(x.pozitsiya, 40), jadvaldan: x.jadvaldan === true },
    ishonch,
    izoh: matn(x.izoh, 300),
  };
}

/** `raw` — model matni (JSON) yoki allaqachon parse qilingan obyekt. */
export function sahifaJavobiniTekshir(raw: unknown, sahifa: number, hujjat: string | null = null): ValidatorNatija {
  const h = hujjat && /^[0-9a-z]{1,16}$/i.test(hujjat) ? hujjat.toLowerCase() : null;
  let v: unknown = raw;
  if (typeof raw === 'string') {
    const s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try { v = JSON.parse(s); } catch { return { ok: false, kod: 'JSON_EMAS', tafsilot: 'model javobi JSON emas' }; }
  }
  if (!obj(v) || !Array.isArray(v.elementlar)) return { ok: false, kod: 'TUZILMA_BUZUQ', tafsilot: 'elementlar massivi yo‘q' };
  if (v.elementlar.length > MAX_ELEMENT_SAHIFADA) return { ok: false, kod: 'JUDA_KOP_ELEMENT', tafsilot: String(v.elementlar.length) };
  const ogoh: string[] = [];
  const varaqX = obj(v.varaq) ? v.varaq : {};
  const parX = obj(v.parametrlar) ? v.parametrlar : {};
  const elementlar = v.elementlar.flatMap((e, i) => {
    if (!obj(e)) { ogoh.push(`ELEMENT_OBYEKT_EMAS:${i}`); return []; }
    const el = elementOl(e, sahifa, i, ogoh, matn(varaqX.shifr, 40), h);
    return el ? [el] : [];
  });
  const qadam = musbatYokiNull(parX.qadam_m);
  const oraliqSoni = musbatYokiNull(parX.oraliq_soni);
  return {
    ok: true,
    ogohlantirishlar: ogoh,
    natija: {
      hujjat: h,
      sahifa,
      varaq: {
        shifr: matn(varaqX.shifr, 40),
        nomi: matn(varaqX.nomi, 200),
        turi: enumOl<VaraqTuri>(VARAQ_TURLARI, varaqX.turi, 'boshqa'),
        masshtab: matn(varaqX.masshtab, 20),
      },
      parametrlar: {
        uzunlik_m: musbatYokiNull(parX.uzunlik_m),
        qadam_m: qadam && qadam > 0 ? qadam : null,
        oraliq_soni: oraliqSoni && Number.isInteger(oraliqSoni) ? oraliqSoni : null,
        yopiq_kontur: typeof parX.yopiq_kontur === 'boolean' ? parX.yopiq_kontur : null,
        belgi_past_m: sonYokiNull(parX.belgi_past_m),
        belgi_yuqori_m: sonYokiNull(parX.belgi_yuqori_m),
      },
      elementlar,
      ogohlantirishlar: Array.isArray(v.ogohlantirishlar) ? v.ogohlantirishlar.flatMap((s) => matn(s, 300) ?? []).slice(0, 30) : [],
    },
  };
}
