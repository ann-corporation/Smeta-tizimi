/**
 * SMETA YADROSI — ish ↔ material bog'lanishi va muvofiqligi (egasi 2026-11-06, «ish–material muvofiqligi», PR1 yadro).
 *
 * Ko'p smetalarda material ishning bolasi emas — ishdan keyin alohida qator (mat/ob, ota = bo'lim). Manba hujjatda
 * mat → ish bog'i yozilmaydi, shuning uchun bog'lanish har safar deterministik HISOBLANADI (saqlanmaydi; faqat egasining
 * qarorlari saqlanadi va ustun turadi):
 *   0. Tuzilma: ota (yoki ichki rs/mat orqali ajdod) = ish → shu ish (ishonchli).
 *   1. Nomzod: shu bo'limda tartib bo'yicha eng yaqin oldingi ish (qo'shimcha/zamena/tuzatish ishlari o'tkaziladi,
 *      ichki bo'lim zanjirni uzadi); n — shu ishdan keyingi materiallar soni, orin — material o'rni.
 *   2. Bog'lanmaydi: materialsiz ish (sinov, yuvish, demontaj …); uskuna va ish o'rnatish emas; mustaqil material
 *      (mebel, MDF, elektronika) umumiy o'zaksiz; bo'lim oxiridagi n ≥ 2 «dum» — o'lcham ham, ma'no ham mos emas.
 *   3. k_norm = material (asos birlikda) / ish (asos birlikda). Bir o'lcham: [0,5; 3] me'yorda, tashqarisi — «smeta nisbati
 *      g'ayritabiiy». Farqli o'lcham: faqat ma'lum oraliqlar (`OLCHAM_ORALIQ`), aks holda shubhali.
 *   4. Ma'no: lug'atdagi umumiy o'zak (`ish-material-lugat`).
 *   5. Sinf: A aniq (k=1 yoki butun ШТ) 0,05% xato; B normativ (bir o'lcham, k ∈ (0,9; 1,25]) 1% xato; C hisobiy 5% savol;
 *      D guruh (bir ishga bog'langan bir o'zakli, bir birlikli materiallar) Σ bo'yicha — savol.
 * Har material o'z k si bilan tekshiriladi (Σ faqat D guruhda). Faqat faol versiya qatorlari; tuzatish qatorlari nomzod
 * emas; zamena aslning bog'ini meros oladi va uning fakti asl o'rniga `zamena-qoldiq` qoidasi bilan qo'shiladi.
 * NULL ≠ 0: «kiritilmagan» — fakt yozuvi yo'q (`kiritilgan` bayrog'i), 0 — haqiqiy nol. Toza funksiyalar; hech narsa yozilmaydi.
 */
import { asosgaAylantir, birlikAylantir, type AsosBirlik } from '../ish-kartasi/birlik';
import { tuzatishQatorimi } from './tuzatish';
import { almashtirilganHajmlar, zamenaProgress, type ZamenaQator } from '../zamena-qoldiq';
import { F2_CHANG_PUL } from '../f2-tayyor';
import { hajmMasshtab } from '../hisob-yadro';
import { OLCHAM_ORALIQ, manoKaliti, materialsizIshmi, mustaqilMaterialmi, nomKaliti, ornatishIshimi } from './ish-material-lugat';

export type IshMatQator = {
  id: number; ota_id?: number | null; tur: string | null; tartib?: number | null;
  kod?: string | null; nom?: string | null; birlik?: string | null; kat?: string | null;
  hajm?: number | string | null; narx?: number | string | null;
  qoshimcha?: boolean | null; zamena?: boolean | null;
  change_type?: string | null; replaces_line_id?: number | null; almashtirish_hajm?: number | null;
  /** Smeta versiyasi: faqat 'faol' (yoki maydon yo'q) qatorlar o'qiladi. */
  versiya_holat?: string | null;
};

/** Egasining qarori (PR2 da jadvaldan keladi): bog — aniq ishga; boglanmaydi; guruh — D guruh kaliti; normal — farq me'yorda. */
export type IshMatQaror = { mat_id: number; tur: 'bog' | 'boglanmaydi' | 'guruh' | 'normal'; bl_id?: number | null; guruh?: string | null };

export type IshMatIshonch = 'ishonchli' | 'shubhali' | 'boglanmaydi';
export type IshMatSinf = 'A' | 'B' | 'C' | 'D';
export type IshMatSabab =
  | 'tuzilma' | 'zamena_meros' | 'qaror_bog' | 'qaror_boglanmaydi' | 'qoshimcha' | 'nomzod_yoq' | 'tuzatish_ishi'
  | 'materialsiz_ish' | 'uskuna_ornatish_emas' | 'mustaqil_material' | 'dum_blok'
  | 'mano_mos' | 'yagona_mos' | 'k_gayritabiiy' | 'olcham_nomalum_oraliq' | 'ishora_farqli' | 'hajm_nomalum' | 'faqat_tartib';

export type IshMatBoglanish = {
  mat_id: number;
  bl_id: number | null;
  ishonch: IshMatIshonch;
  sabab: IshMatSabab;
  /** Ishdan keyingi materiallar soni (tuzilmada — ish ichidagi materiallar soni); bog'lanmasa null. */
  n: number | null;
  /** Material o'rni (1 dan). */
  orin: number | null;
  /** Material / ish, asos birliklarda; noma'lum — null. */
  k_norm: number | null;
  sinf: IshMatSinf | null;
  /** D guruh kaliti (sinf D bo'lsa). */
  guruh: string | null;
  /** Umumiy ma'no kaliti (lug'at guruhi yoki `oz:` o'zak). */
  mano: string | null;
  manba: 'tuzilma' | 'tartib' | 'zamena' | 'qaror';
  /** Smeta nisbati g'ayritabiiy (bir o'lchamda k ∉ [0,5; 3] yoki ma'lum oraliqdan tashqari). */
  gayritabiiy: boolean;
  /** Egasi «normal» degan — signal chiqmaydi. */
  normal: boolean;
};

const RESURS = new Set(['mat', 'ob']);
const faolmi = (r: IshMatQator) => r.versiya_holat == null || r.versiya_holat === 'faol';
const zamenami = (r: IshMatQator) => !!r.zamena || r.change_type === 'REPLACEMENT';
const qoshimchami = (r: IshMatQator) => !!r.qoshimcha || r.change_type === 'ADDITIONAL';
const uskunami = (r: IshMatQator) => r.tur === 'ob' || nomKaliti(r.kat) === 'ОБ';
const sonOl = (v: number | string | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const tartibKalit = (r: IshMatQator) => r.tartib ?? Number.MAX_SAFE_INTEGER;
const tartibla = <T extends IshMatQator>(a: readonly T[]) => [...a].sort((x, y) => tartibKalit(x) - tartibKalit(y) || x.id - y.id);

type KHisob = { k: number | null; birOlcham: boolean; ishoraFarqli: boolean; matAsos: AsosBirlik | null; blAsos: AsosBirlik | null };

/** k_norm = material / ish (asos birliklarda). Hajm yoki birlik noma'lum / 0 — k null. */
function kHisobla(mat: IshMatQator, bl: IshMatQator): KHisob {
  const m = asosgaAylantir(sonOl(mat.hajm), mat.birlik);
  const b = asosgaAylantir(sonOl(bl.hajm), bl.birlik);
  const bos: KHisob = { k: null, birOlcham: !!m && !!b && m.asos === b.asos, ishoraFarqli: false, matAsos: m?.asos ?? null, blAsos: b?.asos ?? null };
  if (!m || !b || m.qiymat === 0 || b.qiymat === 0) return bos;
  if (Math.sign(m.qiymat) !== Math.sign(b.qiymat)) return { ...bos, ishoraFarqli: true };
  return { ...bos, k: m.qiymat / b.qiymat };
}

const oraliqda = (k: number, matAsos: AsosBirlik | null, blAsos: AsosBirlik | null): boolean | null => {
  const o = OLCHAM_ORALIQ[`${matAsos}/${blAsos}`];
  return o ? k >= o[0] && k <= o[1] : null;
};

/** Sinf (A/B/C) va g'ayritabiiylik; farqli o'lchamda oraliq noma'lum bo'lsa `malum: false`. */
function sinfAniqla(k: number, birOlcham: boolean, matAsos: AsosBirlik | null, blAsos: AsosBirlik | null): { sinf: IshMatSinf; gayritabiiy: boolean; malum: boolean } {
  if (birOlcham) {
    const butun = (matAsos === 'ШТ' || matAsos === 'КОМПЛЕКТ') && Math.abs(k - Math.round(k)) <= 1e-9 && k >= 1;
    if (Math.abs(k - 1) <= 1e-9 || butun) return { sinf: 'A', gayritabiiy: false, malum: true };
    if (k > 0.9 && k <= 1.25) return { sinf: 'B', gayritabiiy: false, malum: true };
    return { sinf: 'C', gayritabiiy: !(k >= 0.5 && k <= 3), malum: true };
  }
  const o = oraliqda(k, matAsos, blAsos);
  return { sinf: 'C', gayritabiiy: o === false, malum: o === true };
}

const yangi = (mat_id: number, p: Partial<IshMatBoglanish>): IshMatBoglanish => ({
  mat_id, bl_id: null, ishonch: 'boglanmaydi', sabab: 'nomzod_yoq', n: null, orin: null, k_norm: null, sinf: null,
  guruh: null, mano: null, manba: 'tartib', gayritabiiy: false, normal: false, ...p,
});

/**
 * Har faol material (mat/ob) uchun bog'lanish. Natija tartib bo'yicha. Zamena materiallari aslning bog'ini meros oladi
 * (manba 'zamena'); muvofiqlik faqat asl o'rinda tekshiriladi.
 */
export function ishMaterialBoglanishlari(qatorlar: readonly IshMatQator[], qarorlar: readonly IshMatQaror[] = []): IshMatBoglanish[] {
  const rows = qatorlar.filter(faolmi);
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const tuz = new Set(rows.filter((r) => r.tur === 'bl' && tuzatishQatorimi(r)).map((r) => r.id));
  const out = new Map<number, IshMatBoglanish>();
  const nomzodEmas = (r: IshMatQator) => qoshimchami(r) || zamenami(r) || tuz.has(r.id);

  // 0. Tuzilma: ajdodlar ichida ish (qo'shimcha/zamena ota yoki bo'lim zanjirni uzadi).
  const tuzilmaIshi = new Map<number, number[]>();
  for (const r of tartibla(rows)) {
    if (!RESURS.has(r.tur ?? '') || zamenami(r)) continue;
    if (qoshimchami(r)) { out.set(r.id, yangi(r.id, { sabab: 'qoshimcha' })); continue; }
    let p = r.ota_id != null ? byId.get(r.ota_id) : undefined; let qadam = 0;
    while (p && qadam++ < 20) {
      if (qoshimchami(p) || zamenami(p) || p.tur === 'rz') { p = undefined; break; }
      if (p.tur === 'bl') break;
      p = p.ota_id != null ? byId.get(p.ota_id) : undefined;
    }
    if (!p || p.tur !== 'bl') continue;
    if (tuz.has(p.id)) { out.set(r.id, yangi(r.id, { sabab: 'tuzatish_ishi', manba: 'tuzilma' })); continue; }
    const a = tuzilmaIshi.get(p.id); if (a) a.push(r.id); else tuzilmaIshi.set(p.id, [r.id]);
  }
  for (const [blId, ms] of tuzilmaIshi) {
    const bl = byId.get(blId)!;
    ms.forEach((id, i) => out.set(id, yangi(id, {
      bl_id: blId, ishonch: 'ishonchli', sabab: 'tuzilma', manba: 'tuzilma', n: ms.length, orin: i + 1, mano: manoKaliti(bl.nom, byId.get(id)!.nom),
    })));
  }

  // 1–2. Tartib bo'yicha nomzod: bo'lim (ota = rz yoki ildiz) ichida.
  const bolimlar = new Map<number | null, IshMatQator[]>();
  for (const r of rows) {
    const ota = r.ota_id != null ? byId.get(r.ota_id) : undefined;
    if (r.ota_id != null && ota?.tur !== 'rz') continue;
    const k = r.ota_id ?? null; const a = bolimlar.get(k);
    if (a) a.push(r); else bolimlar.set(k, [r]);
  }
  for (const arr of bolimlar.values()) {
    const bloklar: { bl: IshMatQator; mats: IshMatQator[] }[] = [];
    let joriy: { bl: IshMatQator; mats: IshMatQator[] } | null = null;
    for (const r of tartibla(arr)) {
      if (r.tur === 'rz') { joriy = null; continue; }
      if (r.tur === 'bl') {
        if (nomzodEmas(r)) continue; // qo'shimcha/zamena/tuzatish ishi asl tartibni buzmaydi
        joriy = { bl: r, mats: [] }; bloklar.push(joriy); continue;
      }
      if (!RESURS.has(r.tur ?? '') || zamenami(r) || out.has(r.id)) continue;
      if (joriy) joriy.mats.push(r); else out.set(r.id, yangi(r.id, { sabab: 'nomzod_yoq' }));
    }
    bloklar.forEach((b, bi) => {
      const oxirgi = bi === bloklar.length - 1;
      b.mats.forEach((m, i) => out.set(m.id, tartibQarori(m, b.bl, b.mats.length, i + 1, oxirgi)));
    });
  }

  // Egasining qarorlari (avto bog'lanishdan ustun).
  for (const q of qarorlar) {
    const r = byId.get(q.mat_id);
    if (!r || !RESURS.has(r.tur ?? '')) continue;
    const eski = out.get(q.mat_id) ?? yangi(q.mat_id, {});
    if (q.tur === 'boglanmaydi') { out.set(q.mat_id, yangi(q.mat_id, { sabab: 'qaror_boglanmaydi', manba: 'qaror' })); continue; }
    if (q.tur === 'bog') {
      const bl = q.bl_id != null ? byId.get(q.bl_id) : undefined;
      if (!bl || bl.tur !== 'bl') continue;
      out.set(q.mat_id, yangi(q.mat_id, { bl_id: bl.id, ishonch: 'ishonchli', sabab: 'qaror_bog', manba: 'qaror', mano: manoKaliti(bl.nom, r.nom) }));
      continue;
    }
    if (q.tur === 'normal') { out.set(q.mat_id, { ...eski, normal: true }); continue; }
    if (q.tur === 'guruh' && q.guruh && eski.bl_id != null) out.set(q.mat_id, { ...eski, ishonch: 'ishonchli', guruh: `q:${q.guruh}` });
  }

  // 3–5. k, sinf va D guruh (zamena merosidan oldin).
  const kInfo = new Map<number, KHisob>();
  for (const b of out.values()) {
    if (b.bl_id == null) continue;
    const kh = kHisobla(byId.get(b.mat_id)!, byId.get(b.bl_id)!);
    kInfo.set(b.mat_id, kh);
    b.k_norm = kh.k;
  }
  const guruhlar = new Map<string, IshMatBoglanish[]>();
  for (const b of out.values()) {
    const kh = kInfo.get(b.mat_id);
    if (b.bl_id == null || b.ishonch === 'boglanmaydi' || !kh || kh.k == null) continue;
    const kalit = b.guruh ?? (b.mano ? `${b.bl_id}|${b.mano}|${kh.matAsos}` : null);
    if (!kalit) continue;
    const a = guruhlar.get(kalit); if (a) a.push(b); else guruhlar.set(kalit, [b]);
  }
  const guruhda = new Set<number>();
  for (const [kalit, a] of guruhlar) {
    if (a.length < 2 || new Set(a.map((b) => b.bl_id)).size > 1 || new Set(a.map((b) => kInfo.get(b.mat_id)!.matAsos)).size > 1) continue;
    const kh0 = kInfo.get(a[0].mat_id)!;
    const sk = a.reduce((s, b) => s + (b.k_norm ?? 0), 0);
    const s = sinfAniqla(sk, kh0.birOlcham, kh0.matAsos, kh0.blAsos);
    const ishonchli = kh0.birOlcham || s.malum || a.some((b) => b.manba !== 'tartib');
    for (const b of a) {
      guruhda.add(b.mat_id);
      Object.assign(b, { sinf: 'D' as const, guruh: kalit, gayritabiiy: s.gayritabiiy, ...(b.manba === 'tartib' ? { ishonch: ishonchli ? 'ishonchli' : 'shubhali', sabab: ishonchli ? (s.gayritabiiy ? 'k_gayritabiiy' : 'mano_mos') : 'olcham_nomalum_oraliq' } : {}) });
    }
  }
  for (const b of out.values()) {
    const kh = kInfo.get(b.mat_id);
    if (guruhda.has(b.mat_id) || !kh || b.bl_id == null) continue;
    b.guruh = null;
    if (kh.ishoraFarqli) {
      if (b.manba === 'tartib') Object.assign(b, { ishonch: 'shubhali', sabab: 'ishora_farqli' });
      continue;
    }
    if (kh.k == null) {
      if (b.manba === 'tartib' && b.ishonch === 'ishonchli') Object.assign(b, { ishonch: 'shubhali', sabab: 'hajm_nomalum' });
      continue;
    }
    const s = sinfAniqla(kh.k, kh.birOlcham, kh.matAsos, kh.blAsos);
    b.sinf = s.sinf; b.gayritabiiy = s.gayritabiiy;
    if (b.manba !== 'tartib' || b.ishonch !== 'ishonchli' || b.sabab !== 'mano_mos') continue;
    if (!kh.birOlcham && !s.malum) Object.assign(b, { ishonch: 'shubhali', sabab: 'olcham_nomalum_oraliq' });
    else if (s.gayritabiiy) b.sabab = 'k_gayritabiiy';
  }

  // Zamena materiali — aslning bog'i (zanjir bo'lsa ham).
  for (const r of tartibla(rows)) {
    if (!RESURS.has(r.tur ?? '') || !zamenami(r)) continue;
    let asl: IshMatQator | undefined = r; let qadam = 0;
    while (asl && zamenami(asl) && qadam++ < 10) asl = asl.replaces_line_id != null ? byId.get(asl.replaces_line_id) : undefined;
    const ab = asl ? out.get(asl.id) : undefined;
    out.set(r.id, ab ? { ...ab, mat_id: r.id, manba: 'zamena', sabab: 'zamena_meros' } : yangi(r.id, { sabab: 'nomzod_yoq', manba: 'zamena' }));
  }

  // Hech bir qoidaga tushmagan material (masalan, ota — ichki resurs) — nomzodsiz.
  for (const r of rows) if (RESURS.has(r.tur ?? '') && !out.has(r.id)) out.set(r.id, yangi(r.id, { sabab: 'nomzod_yoq' }));

  const tartib = new Map(tartibla(rows).map((r, i) => [r.id, i] as const));
  return [...out.values()].sort((a, b) => (tartib.get(a.mat_id) ?? 0) - (tartib.get(b.mat_id) ?? 0));

  function tartibQarori(mat: IshMatQator, bl: IshMatQator, n: number, orin: number, oxirgiBlok: boolean): IshMatBoglanish {
    const asos = { n, orin, manba: 'tartib' as const };
    if (materialsizIshmi(bl.nom)) return yangi(mat.id, { ...asos, sabab: 'materialsiz_ish' });
    if (uskunami(mat) && !ornatishIshimi(bl.nom)) return yangi(mat.id, { ...asos, sabab: 'uskuna_ornatish_emas' });
    const mano = manoKaliti(bl.nom, mat.nom);
    if (!mano && mustaqilMaterialmi(mat.nom)) return yangi(mat.id, { ...asos, sabab: 'mustaqil_material' });
    const bog = { ...asos, bl_id: bl.id, mano };
    if (mano) return yangi(mat.id, { ...bog, ishonch: 'ishonchli', sabab: 'mano_mos' });
    const kh = kHisobla(mat, bl);
    if (n === 1 && !uskunami(mat) && kh.k != null && kh.birOlcham && kh.k >= 0.5 && kh.k <= 3) {
      return yangi(mat.id, { ...bog, ishonch: 'ishonchli', sabab: 'yagona_mos' });
    }
    if (oxirgiBlok && n >= 2 && !kh.birOlcham) return yangi(mat.id, { ...asos, sabab: 'dum_blok' });
    return yangi(mat.id, { ...bog, ishonch: 'shubhali', sabab: 'faqat_tartib' });
  }
}

// ───────────────────────────── Muvofiqlik tekshiruvi ─────────────────────────────

/** Qator holati: fakt va «kiritilgan» bayrog'i (NULL ≠ 0: yozuv yo'q — kiritilmagan; 0 — haqiqiy nol). `f2` — zamena progressi uchun. */
export type IshMatHolat = { fakt?: number | null; kiritilgan?: boolean; f2?: number | null };

export type IshMatYorliq = 'farq' | 'chiqindisiz' | 'smeta_nisbati_gayritabiiy' | 'material_kiritilmagan' | 'ish_kiritilmagan';
export type IshMatTaraf = 'ish' | 'material';
export type IshMatTuzatish = { qator_id: number; yangiFakt: number };

export type IshMatSignal = {
  /** Asosiy material (D da birinchi a'zo). */
  mat_id: number;
  /** D guruhda barcha a'zolar; aks holda [mat_id]. */
  mat_idlar: number[];
  bl_id: number;
  sinf: IshMatSinf;
  daraja: 'xato' | 'savol';
  yorliq: IshMatYorliq;
  k_norm: number | null;
  /** Miqdorlar birligi: bitta materialda — material birligi; D da — asos birlik. */
  birlik: string | null;
  /** Ish fakti (ish birligida, zamena qismi bilan). */
  ishFakt: number | null;
  /** Kutilgan material = ish fakti × k. */
  kutilgan: number | null;
  /** Material fakti (zamena qismi bilan). */
  fakt: number | null;
  farq: number | null;
  /** |farq| / |kutilgan|. */
  farqUlush: number | null;
  /** |farq| pulda (narx ma'lum bo'lsa), ustamasiz. */
  farqPul: number | null;
  variantlar: { ishniMoslash: IshMatTuzatish | null; materialniMoslash: IshMatTuzatish | null };
  /** Ehtimoliy xato taraf (§6 tartibi): zamena → ish; bir taraf aynan 100% smeta → o'sha taraf; material/k yumaloq → ish. */
  ehtimolTaraf: IshMatTaraf | null;
  ehtimolSabab: 'zamena' | 'smeta_100' | 'yumaloq' | null;
};

export type IshMatOpsiya = { changPul?: number };

const TOLERANS: Record<Exclude<IshMatSinf, 'D'>, number> = { A: 0.0005, B: 0.01, C: 0.05 };
const masshtab = (x: number | null) => (x == null ? null : hajmMasshtab(x, 1));
const teng = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
const yumaloqmi = (x: number) => Math.abs(x) >= 10 && Math.abs(x / 10 - Math.round(x / 10)) <= 1e-6;

/**
 * Bog'lanishlar bo'yicha muvofiqlik signallari. Faqat «ishonchli» bog'lanishlar (shubhali — egasi tasdiqlaydi, signal yo'q);
 * zamena bog'lanishlari alohida tekshirilmaydi (fakti asl o'rinda). Pul farqi `F2_CHANG_PUL` dan kichik — e'tiborsiz.
 */
export function muvofiqlikTekshir(
  boglanishlar: readonly IshMatBoglanish[], qatorlar: readonly IshMatQator[], holat: ReadonlyMap<number, IshMatHolat>, opsiya: IshMatOpsiya = {},
): IshMatSignal[] {
  const changPul = opsiya.changPul ?? F2_CHANG_PUL;
  const rows = qatorlar.filter(faolmi);
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const zamenaAsl = new Set(rows.filter((r) => zamenami(r) && r.replaces_line_id != null).map((r) => r.replaces_line_id as number));
  const alm = almashtirilganHajmlar(rows.map((r): ZamenaQator => {
    const h = holat.get(r.id);
    const z = zamenami(r);
    return {
      id: r.id, ota_id: r.ota_id ?? null, tur: r.tur, birlik: r.birlik ?? null, hajm: sonOl(r.hajm), f2Hajm: 0,
      ...(z ? { change_type: 'REPLACEMENT', replaces_line_id: r.replaces_line_id ?? null, almashtirish_hajm: r.almashtirish_hajm ?? null,
        progress: zamenaProgress({ f2Tasdiq: h?.f2, fakt: h?.kiritilgan ? h.fakt : null }) } : {}),
    };
  }));
  /** Samarali fakt (o'z birligida): o'z fakti + zamena qoplagan qism. */
  const samarali = (id: number) => {
    const h = holat.get(id);
    const oz = h?.kiritilgan && h.fakt != null && Number.isFinite(h.fakt) ? h.fakt : null;
    const a = alm.get(id) ?? 0;
    return { qiymat: (oz ?? 0) + a, kiritilgan: oz != null || a > 0, almashtirilgan: a };
  };

  // Tekshiruv birliklari: bitta material yoki D guruh.
  const birliklar = new Map<string, IshMatBoglanish[]>();
  for (const b of boglanishlar) {
    if (b.ishonch !== 'ishonchli' || b.bl_id == null || b.manba === 'zamena' || b.normal || !byId.has(b.mat_id) || !byId.has(b.bl_id)) continue;
    const kalit = b.sinf === 'D' && b.guruh ? `D:${b.guruh}` : `M:${b.mat_id}`;
    const a = birliklar.get(kalit); if (a) a.push(b); else birliklar.set(kalit, [b]);
  }

  const signallar: IshMatSignal[] = [];
  for (const azolar of birliklar.values()) {
    const b0 = azolar[0];
    const bl = byId.get(b0.bl_id!)!;
    const matlar = azolar.map((b) => byId.get(b.mat_id)!);
    const guruh = b0.sinf === 'D' && azolar.length > 1;
    const sk = azolar.reduce((s, b) => s + (b.k_norm ?? 0), 0);
    if (!azolar.every((b) => b.k_norm != null) || b0.sinf == null) continue;
    const blAsos = asosgaAylantir(1, bl.birlik)?.asos ?? null;
    const matAsos = asosgaAylantir(1, matlar[0].birlik)?.asos ?? null;
    if (!blAsos || !matAsos) continue;

    const blS = samarali(bl.id);
    const mS = matlar.map((m) => samarali(m.id));
    const matKiritilgan = mS.some((x) => x.kiritilgan);
    const blBase = asosgaAylantir(blS.qiymat, bl.birlik)!.qiymat;
    const matBase = matlar.reduce((s, m, i) => s + (asosgaAylantir(mS[i].qiymat, m.birlik)?.qiymat ?? 0), 0);
    const kutBase = blBase * sk;
    /** Asosdan ko'rsatish birligiga (bitta materialda — uning birligi). */
    const korsat = (x: number) => (guruh ? x : birlikAylantir(x, matAsos, matlar[0].birlik));
    const birlik = guruh ? matAsos : (matlar[0].birlik ?? null);
    /** Asos birligidagi 1 birlik narxi; D da eng kichigi (pul changi uchun ehtiyotkor); biror narx noma'lum — null. */
    const narxlar = matlar.map((m) => { const n = sonOl(m.narx); const bir = birlikAylantir(1, m.birlik, matAsos); return n == null || !bir ? null : n / bir; });
    const asosNarx = narxlar.some((x) => x == null) ? null : Math.min(...(narxlar as number[]));
    const pul = (dBase: number) => (asosNarx == null ? null : Math.abs(dBase) * asosNarx);

    const ishniMoslash = (maqsadMatBase: number): IshMatTuzatish | null => {
      const x = birlikAylantir(maqsadMatBase / sk, blAsos, bl.birlik);
      return x == null ? null : { qator_id: bl.id, yangiFakt: masshtab(x - blS.almashtirilgan)! };
    };
    const materialniMoslash = (): IshMatTuzatish | null => {
      if (guruh) return null;
      const x = birlikAylantir(kutBase, matAsos, matlar[0].birlik);
      return x == null ? null : { qator_id: matlar[0].id, yangiFakt: masshtab(x - mS[0].almashtirilgan)! };
    };
    const asosSignal = {
      mat_id: b0.mat_id, mat_idlar: azolar.map((b) => b.mat_id), bl_id: bl.id, sinf: b0.sinf, k_norm: masshtab(sk), birlik,
      ishFakt: blS.kiritilgan ? masshtab(blS.qiymat) : null,
      kutilgan: blS.kiritilgan ? masshtab(korsat(kutBase)) : null,
      fakt: matKiritilgan ? masshtab(korsat(matBase)) : null,
    };
    const bosh = { farq: null, farqUlush: null, farqPul: null, ehtimolTaraf: null, ehtimolSabab: null } as const;

    if (!blS.kiritilgan && !matKiritilgan) continue;
    if (b0.gayritabiiy) {
      signallar.push({ ...asosSignal, ...bosh, daraja: 'savol', yorliq: 'smeta_nisbati_gayritabiiy', variantlar: { ishniMoslash: null, materialniMoslash: null } });
      continue;
    }
    if (blS.kiritilgan && !matKiritilgan) {
      if (blBase === 0) continue;
      const p = pul(kutBase);
      if (p != null && p < changPul) continue;
      signallar.push({ ...asosSignal, ...bosh, farqPul: p, daraja: 'savol', yorliq: 'material_kiritilmagan', ehtimolTaraf: 'material', variantlar: { ishniMoslash: null, materialniMoslash: materialniMoslash() } });
      continue;
    }
    if (!blS.kiritilgan && matKiritilgan) {
      if (matBase === 0) continue;
      const p = pul(matBase);
      if (p != null && p < changPul) continue;
      signallar.push({ ...asosSignal, ...bosh, farqPul: p, daraja: 'savol', yorliq: 'ish_kiritilmagan', ehtimolTaraf: 'ish', variantlar: { ishniMoslash: ishniMoslash(matBase), materialniMoslash: null } });
      continue;
    }

    const farqBase = matBase - kutBase;
    if (Math.abs(farqBase) <= 1e-9 * Math.max(1, Math.abs(kutBase))) continue;
    const ulush = kutBase !== 0 ? Math.abs(farqBase) / Math.abs(kutBase) : Number.POSITIVE_INFINITY;
    const tol = guruh ? (sk > 0.9 && sk <= 1.25 ? 0.01 : 0.05) : TOLERANS[b0.sinf as Exclude<IshMatSinf, 'D'>];
    if (ulush <= tol) continue;
    const p = pul(farqBase);
    if (p != null && p < changPul) continue;

    // Chiqindisiz kiritilgan: material fakti ≈ ish fakti (bir o'lchamda), k > 1,005 — egasi qarori (normativ yoki sof).
    const birOlcham = blAsos === matAsos;
    const chiqindisiz = birOlcham && sk > 1.005 && blBase !== 0 && Math.abs(matBase - blBase) <= 0.005 * Math.abs(blBase);

    // Ehtimoliy taraf (§6).
    let ehtimolTaraf: IshMatTaraf | null = null; let ehtimolSabab: IshMatSignal['ehtimolSabab'] = null;
    if (zamenaAsl.has(bl.id) || matlar.some((m) => zamenaAsl.has(m.id))) { ehtimolTaraf = 'ish'; ehtimolSabab = 'zamena'; }
    else {
      const blH = sonOl(bl.hajm);
      const matH = matlar.reduce<number | null>((s, m) => { const h = sonOl(m.hajm); return s == null || h == null ? null : s + h; }, 0);
      const blTo = blH != null && teng(blS.qiymat, blH);
      const matTo = !guruh && matH != null && teng(mS[0].qiymat, matH);
      if (blTo !== matTo) { ehtimolTaraf = blTo ? 'ish' : 'material'; ehtimolSabab = 'smeta_100'; }
      else {
        const x = birlikAylantir(matBase / sk, blAsos, bl.birlik);
        if (x != null && yumaloqmi(x)) { ehtimolTaraf = 'ish'; ehtimolSabab = 'yumaloq'; }
      }
    }

    signallar.push({
      ...asosSignal,
      daraja: chiqindisiz || guruh || b0.sinf === 'C' ? 'savol' : 'xato',
      yorliq: chiqindisiz ? 'chiqindisiz' : 'farq',
      farq: masshtab(korsat(farqBase)), farqUlush: masshtab(ulush), farqPul: p,
      variantlar: { ishniMoslash: ishniMoslash(matBase), materialniMoslash: materialniMoslash() },
      ehtimolTaraf, ehtimolSabab,
    });
  }
  return signallar;
}
