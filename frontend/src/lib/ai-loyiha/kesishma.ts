/**
 * KESISHMA TEKSHIRUVI — spetsifikatsiya jami ↔ chizma geometriyasi.
 *
 * AI raqamni O'QIYDI, tizim esa uni QAYTA HISOBLAYDI va solishtiradi. Bu yerda faqat deterministik
 * qoidalar; model chaqirilmaydi. Har tekshiruv kod + parametr qaytaradi (matn `xabar.ts` da, t() orqali),
 * shunda egasi har raqamni varaq/pozitsiya va formula bilan himoya qila oladi.
 *
 * Qoidalar:
 *  1. UZUNLIK_QADAM      — plan uzunligi / tayanch qadami → oraliqlar va tayanchlar soni;
 *  2. TAYANCH_SONI       — «jami» ustun/stakan soni geometriyaga mosmi;
 *  3. IKKI_MARTA_SANALGAN — oraliq spetsifikatsiyasidagi umumiy tayanchlar (ustun/stakan va ularning detallari
 *                           ikki qo'shni oraliq uchun bitta) ikki marta sanalganmi (haqiqiy keys: «2 стакана на пролёт»);
 *                           yig'ma birlik tarkibi (ota_marka) ota soniga ko'paytiriladi;
 *  4. TAYANCH_MOSLIGI    — ustunlar soni = stakanlar soni (har ustun ostida bitta stakan);
 *  5. LENTA_ORALIQ       — stakanlar orasidagi lenta = qadam − stakan eni;
 *  6. PROFIL_MASSA       — □a×b×t profil massasi uzunlikka mosmi (birlik/o'qish xatosi);
 *  7. HAJM_OLCHAM        — m3 hajm = o'lchamlar ko'paytmasi × soni;
 *  8. BIRLIK             — miqdor birliksiz yoki turga mos bo'lmagan birlik;
 *  9. ISHONCH_PAST / MANBA_YOQ — himoyalab bo'lmaydigan raqam.
 */
import type { Birlik, ElementTuri, LoyihaElement, SahifaNatija } from './sxema';

export type TekshiruvKod =
  | 'UZUNLIK_QADAM' | 'UZUNLIK_QADAMGA_KARRALI_EMAS' | 'PARAMETR_ZIDDIYAT' | 'ORALIQ_SONI_MOS'
  | 'TAYANCH_SONI' | 'IKKI_MARTA_SANALGAN' | 'TAYANCH_MOSLIGI'
  | 'LENTA_ORALIQ' | 'LENTA_STAKAN_AYIRILMAGAN'
  | 'PROFIL_MASSA' | 'HAJM_OLCHAM' | 'BIRLIK_YOQ' | 'BIRLIK_TURGA_MOS_EMAS'
  | 'ORALIQ_SONI_NOMALUM' | 'OTA_TOPILMADI' | 'TAYANCH_KASR' | 'ISHONCH_PAST' | 'MANBA_YOQ';

export type Daraja = 'xato' | 'ogohlantirish' | 'ok';

export type Tekshiruv = {
  kod: TekshiruvKod;
  daraja: Daraja;
  elementlar: string[];
  qiymat: Record<string, number | string | null>;
};

export type ElementHisobi = {
  element_id: string;
  /** Butun obyekt bo'yicha dona soni (oraliq → × oraliqlar, umumiy tayanch tuzatilgan). */
  jami_soni: number | null;
  /** Butun obyekt bo'yicha miqdor `birlik` da. */
  jami_miqdor: number | null;
  birlik: Birlik | null;
  /** Ko'rsatish uchun formula: «2 / 2 × 301 = 301». */
  formula: string | null;
  /** Yakuniy ishonch: model ishonchi, tekshiruvlar natijasida pasaytirilgan. */
  ishonch: number;
};

export type KesishmaNatija = {
  uzunlik_m: number | null;
  qadam_m: number | null;
  oraliqlar: number | null;
  /** Mumkin bo'lgan tayanchlar soni: yopiq kontur → [n]; ochiq → [n+1]; noma'lum → [n, n+1]. */
  tayanchlar: number[];
  tekshiruvlar: Tekshiruv[];
  hisob: ElementHisobi[];
  holat: 'toza' | 'korib_chiqish' | 'xato';
};

export const ISHONCH_CHEGARA = 0.6;
const PROFIL_TOLERANS = 0.08; // radiusli burchaklar: GOST profili o'tkir burchakli hisobdan ~3–5 % yengil
const HAJM_TOLERANS = 0.05;
const LENTA_TOLERANS_M = 0.05;
const KARRALI_TOLERANS = 0.02;
const PORLAT_ZICHLIK = 7850; // kg/m3

const TAYANCH: ReadonlySet<ElementTuri> = new Set(['ustun', 'fundament_stakan']);

const MOS_BIRLIK: Partial<Record<ElementTuri, readonly Birlik[]>> = {
  fundament_stakan: ['m3', 'dona'],
  fundament_lenta: ['m3', 'm', 'm2'],
  fundament_plita: ['m3', 'm2'],
  beton: ['m3'],
  ustun: ['dona', 'kg', 't', 'm'],
  tusin: ['m', 'kg', 't', 'dona'],
  toldirma: ['m', 'm2', 'kg', 't', 'dona'],
  profil: ['m', 'kg', 't', 'dona'],
  armatura: ['kg', 't', 'm', 'dona'],
  qoplama: ['m2', 'm', 'm3'],
  devor: ['m2', 'm3', 'm'],
  plita: ['m2', 'm3', 'dona', 'kg', 't'],
};

const yaxlit = (n: number, k = 3) => Math.round(n * 10 ** k) / 10 ** k;

/** «□60×60×3», «60x60x3», «Тр. кв. 60х60х3», «□40×20×2» → mm {a,b,t}; topilmasa null. */
export function profilKesim(kesim: string | null): { a: number; b: number; t: number } | null {
  if (!kesim) return null;
  const m = kesim.replace(/,/g, '.').match(/(\d+(?:\.\d+)?)\s*[×xхX*]\s*(\d+(?:\.\d+)?)\s*[×xхX*]\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const [a, b, t] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!(a > 0 && b > 0 && t > 0) || t * 2 >= Math.min(a, b)) return null;
  return { a, b, t };
}

/** To'g'ri burchakli quvur profilining 1 m massasi, kg (o'tkir burchak bo'yicha, yuqori chegara). */
export function profilKgM(p: { a: number; b: number; t: number }): number {
  const maydonMm2 = 2 * p.t * (p.a + p.b) - 4 * p.t * p.t;
  return (maydonMm2 / 1e6) * PORLAT_ZICHLIK;
}

function geometriya(sahifalar: SahifaNatija[], tk: Tekshiruv[]) {
  const ol = (k: 'uzunlik_m' | 'qadam_m') => {
    const qiymat = [...new Set(sahifalar.map((s) => s.parametrlar[k]).filter((v): v is number => v != null && v > 0))];
    if (qiymat.length > 1) tk.push({ kod: 'PARAMETR_ZIDDIYAT', daraja: 'xato', elementlar: [], qiymat: { parametr: k, qiymatlar: qiymat.join('; ') } });
    return qiymat.length === 1 ? qiymat[0] : null;
  };
  const uzunlik_m = ol('uzunlik_m');
  const qadam_m = ol('qadam_m');
  const yopiqlar = [...new Set(sahifalar.map((s) => s.parametrlar.yopiq_kontur).filter((v): v is boolean => v != null))];
  const yopiq = yopiqlar.length === 1 ? yopiqlar[0] : null;
  const soniQiymat = [...new Set(sahifalar.map((s) => s.parametrlar.oraliq_soni).filter((v): v is number => v != null && v > 0))];
  if (soniQiymat.length > 1) tk.push({ kod: 'PARAMETR_ZIDDIYAT', daraja: 'xato', elementlar: [], qiymat: { parametr: 'oraliq_soni', qiymatlar: soniQiymat.join('; ') } });
  const yozilganSoni = soniQiymat.length === 1 ? soniQiymat[0] : null;
  let oraliqlar: number | null = null;
  if (uzunlik_m && qadam_m) {
    const xom = uzunlik_m / qadam_m;
    oraliqlar = Math.abs(xom - Math.round(xom)) <= KARRALI_TOLERANS ? Math.round(xom) : Math.ceil(xom);
    if (Math.abs(xom - Math.round(xom)) > KARRALI_TOLERANS) {
      tk.push({ kod: 'UZUNLIK_QADAMGA_KARRALI_EMAS', daraja: 'ogohlantirish', elementlar: [], qiymat: { uzunlik_m, qadam_m, nisbat: yaxlit(xom), oraliqlar } });
    }
  }
  if (yozilganSoni != null) {
    // Varaqda yozilgan seksiyalar soni <-> uzunlik/qadam: bir-birini tasdiqlaydi yoki ziddiyat.
    if (oraliqlar != null) tk.push({ kod: 'ORALIQ_SONI_MOS', daraja: oraliqlar === yozilganSoni ? 'ok' : 'xato', elementlar: [], qiymat: { yozilgan: yozilganSoni, hisoblangan: oraliqlar } });
    else oraliqlar = yozilganSoni;
  }
  const tayanchlar = oraliqlar == null ? [] : yopiq === true ? [oraliqlar] : yopiq === false ? [oraliqlar + 1] : [oraliqlar, oraliqlar + 1];
  if (oraliqlar != null) tk.push({ kod: 'UZUNLIK_QADAM', daraja: 'ok', elementlar: [], qiymat: { uzunlik_m, qadam_m, oraliqlar, tayanchlar: tayanchlar.join(' / ') } });
  return { uzunlik_m, qadam_m, oraliqlar, tayanchlar, yopiq };
}

type Sahifadosh = { ota: Map<string, LoyihaElement>; tayanchOraliqda: number | null };

/** Sahifa ichidagi bog'lanishlar: yig'ma birlik (ota marka) va oraliq spetsifikatsiyasida nechta tayanch sanalgani. */
function sahifaKonteksti(s: SahifaNatija, oraliqlar: number | null): Sahifadosh {
  const ota = new Map<string, LoyihaElement>();
  for (const e of s.elementlar) {
    for (const k of [e.marka, e.nom]) if (k) { const kk = markaKalit(k); if (kk && !ota.has(kk)) ota.set(kk, e); }
  }
  // Tayanch soni oraliqda: ustun/stakan, bo'lmasa tayanchga tegishli yig'ma birlik (ЗД, КП) qatori.
  const sarlavha = (e: LoyihaElement) => { const o = e.ota_marka ? ota.get(markaKalit(e.ota_marka)) : null; return !o || (o.doira === 'jami' && o.soni === oraliqlar); };
  const oraliqda = (e: LoyihaElement) => e.doira === 'bir_oraliq' || (!!e.ota_marka && sarlavha(e) && ota.get(markaKalit(e.ota_marka))?.doira === 'jami');
  const tayanch = s.elementlar.find((e) => oraliqda(e) && TAYANCH.has(e.tur) && e.soni != null && Number.isInteger(e.soni) && e.soni >= 1)
    ?? s.elementlar.find((e) => oraliqda(e) && e.tayanchga_tegishli && sarlavha(e) && e.soni != null && Number.isInteger(e.soni) && e.soni >= 1);
  return { ota, tayanchOraliqda: tayanch?.soni ?? null };
}

const markaKalit = (s: string) => s.normalize('NFKC').toUpperCase().replace(/[\s.]/g, '').replace(/[–—]/g, '-')
  .replace(/^(СЕТКА|КАРКАС|ЗАКЛАДНОЙДЕТАЛЬ|ЗАКЛАДНАЯДЕТАЛЬ|ДЕТАЛЬ)/, '').replace(/(ШТ|ШТ\.Т|\(ПМ\)|ПМ)$/, '');

function elementHisobi(e: LoyihaElement, g: ReturnType<typeof geometriya>, ctx: Sahifadosh, tk: Tekshiruv[]): ElementHisobi {
  const asos = { element_id: e.id, birlik: e.birlik, ishonch: e.ishonch };
  // Yig'ma birlik tarkibi (С-4 ning sterjenlari, ЗД-3 detallari): qiymat BITTA yig'ma birlik uchun → ota soniga ko'paytiriladi.
  const ota = e.ota_marka ? ctx.ota.get(markaKalit(e.ota_marka)) ?? null : null;
  if (e.ota_marka && !ota) tk.push({ kod: 'OTA_TOPILMADI', daraja: 'ogohlantirish', elementlar: [e.id], qiymat: { ota_marka: e.ota_marka } });
  // Sarlavha qatori «Ограждение ОГ-5 — N шт» (jami, soni = oraliqlar): uning tarkibi — BITTA oraliq uchun.
  const otaOraliq = !!ota && ota.doira === 'jami' && ota.soni != null && ota.soni === g.oraliqlar;
  const doira = otaOraliq ? 'bir_oraliq' : ota ? ota.doira : e.doira;
  const otaSoni = otaOraliq ? 1 : ota ? (ota.soni ?? null) : 1;
  if (ota && otaSoni == null) {
    tk.push({ kod: 'OTA_TOPILMADI', daraja: 'xato', elementlar: [e.id, ota.id], qiymat: { ota_marka: e.ota_marka } });
    return { ...asos, jami_soni: null, jami_miqdor: null, formula: null };
  }
  if (doira !== 'bir_oraliq') {
    const jami = doira === 'jami' && otaSoni != null;
    return { ...asos, jami_soni: jami && e.soni != null ? yaxlit(e.soni * otaSoni, 4) : null,
      jami_miqdor: jami && e.miqdor != null ? yaxlit(e.miqdor * otaSoni, 4) : null, formula: ota && jami ? `${e.miqdor ?? e.soni} × ${otaSoni}` : null };
  }
  const n = g.oraliqlar;
  if (n == null || otaSoni == null) {
    tk.push({ kod: 'ORALIQ_SONI_NOMALUM', daraja: 'xato', elementlar: [e.id], qiymat: { uzunlik_m: g.uzunlik_m, qadam_m: g.qadam_m } });
    return { ...asos, jami_soni: null, jami_miqdor: null, formula: null };
  }
  // Noma'lum kontur — yopiq (n) qabul qilinadi; TAYANCH_SONI ikkala variantni ko'rsatadi.
  const tayanchlar = n + (g.yopiq === false ? 1 : 0);
  const umumiy = TAYANCH.has(e.tur) || e.tayanchga_tegishli || (!!ota && !otaOraliq && (TAYANCH.has(ota.tur) || ota.tayanchga_tegishli));
  const oraliqSoni = e.soni != null ? e.soni * otaSoni : null;
  const oraliqMiqdor = e.miqdor != null ? e.miqdor * otaSoni : null;
  const kopaytma = (v: number | null, m: number) => (v == null ? null : yaxlit(v * m, 4));
  const S = ctx.tayanchOraliqda;
  // Dona soni tayanchlar orasida butun bo'linmasa (1 ta list 2 tayanchga) — bu umumiy detal emas, oraliqniki.
  const kasr = umumiy && S != null && S >= 2 && oraliqSoni != null && !Number.isInteger(oraliqSoni / S);
  if (kasr) tk.push({ kod: 'TAYANCH_KASR', daraja: 'ogohlantirish', elementlar: [e.id], qiymat: { oraliqda: oraliqSoni, tayanch: S } });
  if (umumiy && !kasr && S != null && S >= 1 && (oraliqSoni != null || oraliqMiqdor != null)) {
    // Oraliq spetsifikatsiyasi S ta tayanchni sanaydi, lekin ular qo'shni oraliq bilan umumiy:
    // bitta tayanchga = oraliqdagi qiymat / S; jami = shu × tayanchlar soni (n yoki n+1).
    const omil = tayanchlar / S;
    const asl = (oraliqSoni ?? oraliqMiqdor) as number;
    const f = `${yaxlit(asl, 4)} / ${S} × ${tayanchlar}`;
    if (S >= 2) {
      tk.push({ kod: 'IKKI_MARTA_SANALGAN', daraja: 'xato', elementlar: [e.id],
        qiymat: { oraliqda: S, oraliqlar: n, sodda: yaxlit(asl * n, 3), tuzatilgan: yaxlit(asl * omil, 3) } });
    }
    return { ...asos, jami_soni: kopaytma(oraliqSoni, omil), jami_miqdor: kopaytma(oraliqMiqdor, omil),
      formula: `${f} = ${yaxlit(asl * omil, 3)}`, ishonch: S >= 2 ? Math.min(e.ishonch, ISHONCH_CHEGARA) : e.ishonch };
  }
  const asos2 = oraliqMiqdor ?? oraliqSoni;
  return { ...asos, jami_soni: kopaytma(oraliqSoni, n), jami_miqdor: kopaytma(oraliqMiqdor, n),
    formula: asos2 == null ? null : `${yaxlit(asos2, 4)} × ${n}` };
}

export function kesishmaTekshir(sahifalar: SahifaNatija[]): KesishmaNatija {
  const tk: Tekshiruv[] = [];
  const g = geometriya(sahifalar, tk);
  const elementlar = sahifalar.flatMap((s) => s.elementlar);
  const hisob = sahifalar.flatMap((s) => { const ctx = sahifaKonteksti(s, g.oraliqlar); return s.elementlar.map((e) => elementHisobi(e, g, ctx, tk)); });
  const hisobId = new Map(hisob.map((h) => [h.element_id, h]));

  // 2. Jami tayanch soni geometriyaga mosmi.
  for (const e of elementlar) {
    if (!TAYANCH.has(e.tur) || e.doira !== 'jami' || e.ota_marka || e.soni == null || !g.tayanchlar.length) continue;
    const mos = g.tayanchlar.includes(e.soni);
    tk.push({ kod: 'TAYANCH_SONI', daraja: mos ? 'ok' : 'xato', elementlar: [e.id], qiymat: { topilgan: e.soni, kutilgan: g.tayanchlar.join(' / ') } });
  }

  // 4. Ustunlar soni = stakanlar soni.
  const jamiTur = (tur: ElementTuri) => elementlar.filter((e) => e.tur === tur).map((e) => hisobId.get(e.id)?.jami_soni).filter((v): v is number => v != null);
  const ustun = jamiTur('ustun');
  const stakan = jamiTur('fundament_stakan');
  if (ustun.length && stakan.length) {
    const u = Math.max(...ustun);
    const s = Math.max(...stakan);
    tk.push({ kod: 'TAYANCH_MOSLIGI', daraja: u === s ? 'ok' : 'xato',
      elementlar: elementlar.filter((e) => TAYANCH.has(e.tur)).map((e) => e.id), qiymat: { ustun: u, stakan: s } });
  }

  // 5. Lenta = qadam − stakan eni (stakanlar orasida).
  const stakanEni = elementlar.find((e) => e.tur === 'fundament_stakan' && e.olcham_m?.length)?.olcham_m?.[0] ?? null;
  for (const e of elementlar) {
    if (e.tur !== 'fundament_lenta' || e.doira !== 'bir_oraliq' || e.uzunlik_m == null || g.qadam_m == null || stakanEni == null) continue;
    const kutilgan = yaxlit(g.qadam_m - stakanEni);
    const farq = Math.abs(e.uzunlik_m - kutilgan);
    if (farq <= LENTA_TOLERANS_M) tk.push({ kod: 'LENTA_ORALIQ', daraja: 'ok', elementlar: [e.id], qiymat: { topilgan: e.uzunlik_m, kutilgan } });
    else if (Math.abs(e.uzunlik_m - g.qadam_m) <= LENTA_TOLERANS_M) tk.push({ kod: 'LENTA_STAKAN_AYIRILMAGAN', daraja: 'ogohlantirish', elementlar: [e.id], qiymat: { topilgan: e.uzunlik_m, kutilgan, stakan_eni: stakanEni } });
    else tk.push({ kod: 'LENTA_ORALIQ', daraja: 'ogohlantirish', elementlar: [e.id], qiymat: { topilgan: e.uzunlik_m, kutilgan } });
  }

  for (const e of elementlar) {
    // 6. Profil massasi.
    const p = profilKesim(e.kesim);
    if (p && e.uzunlik_m && e.birlik_massa_kg && ['ustun', 'profil', 'tusin', 'toldirma'].includes(e.tur)) {
      const hisoblangan = yaxlit(profilKgM(p) * e.uzunlik_m, 2);
      const nisbiy = (e.birlik_massa_kg - hisoblangan) / hisoblangan;
      tk.push({ kod: 'PROFIL_MASSA', daraja: Math.abs(nisbiy) <= PROFIL_TOLERANS ? 'ok' : 'xato', elementlar: [e.id],
        qiymat: { topilgan: e.birlik_massa_kg, hisoblangan, farq_foiz: yaxlit(nisbiy * 100, 1) } });
    }
    // 7. Hajm = o'lchamlar ko'paytmasi.
    if (e.birlik === 'm3' && e.miqdor != null && e.olcham_m?.length === 3) {
      const birHajm = e.olcham_m[0] * e.olcham_m[1] * e.olcham_m[2];
      const kutilgan = yaxlit(birHajm * (e.doira === 'bir_dona' ? 1 : (e.soni ?? 1)), 4);
      const nisbiy = kutilgan ? Math.abs(e.miqdor - kutilgan) / kutilgan : 1;
      tk.push({ kod: 'HAJM_OLCHAM', daraja: nisbiy <= HAJM_TOLERANS ? 'ok' : 'ogohlantirish', elementlar: [e.id], qiymat: { topilgan: e.miqdor, kutilgan } });
    }
    // 8. Birlik.
    if ((e.miqdor != null) && e.birlik == null) tk.push({ kod: 'BIRLIK_YOQ', daraja: 'xato', elementlar: [e.id], qiymat: { miqdor: e.miqdor } });
    const mos = MOS_BIRLIK[e.tur];
    if (e.birlik && mos && !mos.includes(e.birlik)) tk.push({ kod: 'BIRLIK_TURGA_MOS_EMAS', daraja: 'ogohlantirish', elementlar: [e.id], qiymat: { tur: e.tur, birlik: e.birlik } });
    // 9. Himoya.
    if (e.ishonch < ISHONCH_CHEGARA) tk.push({ kod: 'ISHONCH_PAST', daraja: 'ogohlantirish', elementlar: [e.id], qiymat: { ishonch: e.ishonch } });
    if (!e.manba.varaq && !e.manba.pozitsiya) tk.push({ kod: 'MANBA_YOQ', daraja: 'ogohlantirish', elementlar: [e.id], qiymat: { sahifa: e.manba.sahifa } });
  }

  // Tekshiruv natijasi ishonchga ta'sir qiladi: xato → ≤ 0,3; ogohlantirish → ≤ 0,6.
  for (const t of tk) {
    if (t.daraja === 'ok') continue;
    const chek = t.daraja === 'xato' ? 0.3 : ISHONCH_CHEGARA;
    for (const id of t.elementlar) { const h = hisobId.get(id); if (h) h.ishonch = Math.min(h.ishonch, chek); }
  }
  // IKKI_MARTA_SANALGAN tuzatildi: tuzatilgan son taklif qilinadi, lekin baribir inson tasdig'i shart.
  const holat = tk.some((t) => t.daraja === 'xato') ? 'xato' : tk.some((t) => t.daraja === 'ogohlantirish') ? 'korib_chiqish' : 'toza';
  return { ...g, tekshiruvlar: tk, hisob, holat };
}

/** Ish kartasiga taklif (Phase 1 `t2_ish_kartasi` bilan bog'lanish — tasdiqdan keyin, `manba='ai_loyiha'`). */
export type IshKartasiTaklifi = {
  manba: 'ai_loyiha';
  element_id: string;
  nom: string;
  marka: string | null;
  birlik: Birlik | null;
  hajm: number | null;
  formula: string | null;
  dalil: { sahifa: number; varaq: string | null; pozitsiya: string | null; jadvaldan: boolean };
  ishonch: number;
  /** true — kamida bitta xato/ogohlantirish yoki past ishonch: inson ko'rmaguncha saqlanmaydi. */
  tasdiq_kerak: boolean;
};

export function ishKartasiTakliflari(sahifalar: SahifaNatija[], k: KesishmaNatija): IshKartasiTaklifi[] {
  const muammoli = new Set(k.tekshiruvlar.filter((t) => t.daraja !== 'ok').flatMap((t) => t.elementlar));
  const hisobId = new Map(k.hisob.map((h) => [h.element_id, h]));
  return sahifalar.flatMap((s) => s.elementlar).map((e) => {
    const h = hisobId.get(e.id);
    const hajm = h?.jami_miqdor ?? (e.birlik === 'dona' ? h?.jami_soni ?? null : null);
    return {
      manba: 'ai_loyiha' as const, element_id: e.id, nom: e.nom, marka: e.marka, birlik: e.birlik, hajm,
      formula: h?.formula ?? null, dalil: { ...e.manba }, ishonch: h?.ishonch ?? e.ishonch,
      tasdiq_kerak: muammoli.has(e.id) || (h?.ishonch ?? e.ishonch) < ISHONCH_CHEGARA || hajm == null,
    };
  });
}
