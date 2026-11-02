/**
 * PERERASCHET (egasi 2026-10-25: «nakopitelniyga erishganimizdan keyin pereraschet uchun nimadir qila olamizmi?
 * olmay qolib ketgan obyomim yoki ortiqcha olganim bordir … shuncha pul ziyod olasan yoki shuncha minus kirasan»).
 *
 * Sof funksiyalar (UI'siz): `t2_qator_holat` barg qatorlari (rs/mat/ob) → tasnif:
 *  - MINUS «ortiqcha»   : F2 hajm (+ almashtirilgan) > smeta hajm → (F2 − smeta) × smeta narx;
 *  - ± «narx_farqi"     : F2 summa − F2 hajm × smeta narx (F2 qimmatroq — qaytarish, arzonroq — olish);
 *  - PLYUS «olinmagan"  : fakt > F2 → (min(fakt, smeta − almashtirilgan) − F2) × smeta narx. Smetadan tashqari fakt
 *                         pulga kirmaydi (DS kerak) — alohida eslatma.
 *  - TEKSHIRISH (pulga KIRMAYDI, faqat taxminiy ko'rsatiladi): birlik shubhasi, smetada hajm yo'q/0, smeta narxi yo'q,
 *    manfiy smeta qatori, «(ekspertizagacha)» bo'limdagi F2 (tuzatish bilan yopilmagan — sof F2 ≠ 0), zamena juftligi.
 * Qoidalar: asl smeta va tasdiqlangan aktlar O'ZGARMAYDI (bu faqat hisob); NULL ≠ 0 — narx/hajm noma'lum qator pulga
 * kirmaydi; narx 0 = 0. Summalar NDS SIZ; ustamali (kaskad) va NDS — chaqiruvchida (`ustamaliHisobla`), NDS faqat oxirida.
 */
import { katKesimgaQosh, bosKatKesim, type KatKesim } from './ustamali-summa';
import { yaxlit2 } from './hisob-yadro';
import { mashinistMehnati } from './narx-bildirishnoma';
import { ESKI_SMETA } from './f2-dublikat/tekshiruv';

/** `t2_qator_holat` dan o'qiladigan ustunlar (25k qatorli obyekt uchun ham — faqat keraklilari). */
export const PERERASCHET_USTUNLAR = 'qator_id,ota_id,tur,kod,nom,birlik,kat,smeta_hajm,smeta_narx,smeta_summa,fakt_hajm,fakt_summa,f2_hajm,f2_summa,f2_summa_nomalum,almashtirilgan_hajm,fakt_manbasi';

export type PQator = {
  qator_id: number; ota_id: number | null; tur: string | null;
  kod: string | null; nom: string | null; birlik: string | null; kat: string | null;
  smeta_hajm: number | string | null; smeta_narx: number | string | null; smeta_summa?: number | string | null;
  fakt_hajm: number | string | null; fakt_summa?: number | string | null;
  f2_hajm: number | string | null; f2_summa: number | string | null;
  f2_summa_nomalum?: number | string | null; almashtirilgan_hajm?: number | string | null;
  fakt_manbasi?: string | null;
};

export type BandTur = 'ortiqcha' | 'narx_farqi' | 'olinmagan' | 'chegirma';
export type TekshirSabab = 'birlik_shubha' | 'smeta_hajm_yoq' | 'narx_yoq' | 'chegirma_asosiy_yoq' | 'eski_smeta' | 'zamena';
export type Eslatma = 'fakt_norma' | 'smetadan_tashqari' | 'narx_farqi_hisoblanmadi';

/** `summa` ishorali: + olish mumkin, − qaytarish kerak. `hajm` ishorali (ortiqcha — manfiy, narx farqi — 0). */
export type PBand = { tur: BandTur; hajm: number; summa: number };

export type PNatijaQator = {
  qatorId: number; kod: string | null; nom: string; birlik: string | null; kat: string | null; tur: string;
  smetaHajm: number | null; smetaNarx: number | null; faktHajm: number; f2Hajm: number; f2Summa: number;
  /** F2 o'rtacha narxi (F2 summa / F2 hajm) — noma'lum bo'lsa null. */
  f2Narx: number | null;
  almashtirilgan: number;
  /** Eng yaqin razdel (rz) id va ildizdan yo'li. */
  bolimId: number | null; bolimYol: string[];
  /** Barcha ajdod razdellar (filtr uchun). */
  ajdodlar: number[];
  bandlar: PBand[];
  /** Bandlar yig'indisi (ishorali). */
  sof: number;
  tekshir: TekshirSabab[];
  eslatma: Eslatma[];
  /** Pulga kiradimi (tekshirish sababi yo'q va kamida bitta band bor). */
  hisobda: boolean;
  /** Smetadan tashqari fakt hajmi (pulga kirmaydi). */
  tashqariHajm: number;
  /** Chegirma (manfiy smeta, «исключать») qatori: asosiy ish (X — uning F2 ulushi) va chegirma qo'llangan ulushi Y. */
  chegirma?: { asosiy: ChegirmaAsosiy | null; y: number };
};

export type ChegirmaAsosiy = { qatorId: number; kod: string | null; nom: string; ulush: number };

export type PJami = { plus: number; minus: number; sof: number; soni: number };
export type PBolimJami = PJami & { bolimId: number | null; yol: string[] };

export type PNatija = {
  qatorlar: PNatijaQator[];
  /** Pulga kirgan qatorlar (|sof| bo'yicha kamayish). */
  hisobda: PNatijaQator[];
  /** Tekshirish kerak qatorlar (taxminiy |sof| bo'yicha kamayish). */
  tekshirish: PNatijaQator[];
  jami: PJami;
  turBoyicha: Record<BandTur, { plus: number; minus: number; soni: number }>;
  /** Ustamali hisob uchun kategoriya kesimlari: plus va minus (MUTLAQ qiymatda). */
  plusKesim: KatKesim; minusKesim: KatKesim;
  /** BL norma bo'yicha hosila faktdan kelgan plus summa (shundan). */
  faktNormaPlus: number;
  tekshirTaxminiy: { plus: number; minus: number; soni: number };
  bolimlar: PBolimJami[];
};

export type PKontekst = {
  /** Zamena qatorlari (replaces_line_id bor) id lari. */
  zamenaIdlar?: ReadonlySet<number>;
  /** Zamena qilingan asl qatorlar id lari (replaces_line_id qiymatlari). */
  aslIdlar?: ReadonlySet<number>;
  /** Filtr: faqat shu razdel (rz id) ostidagilar. */
  bolimId?: number | null;
  /** Svod yaxlit bo'limlari va avlodlari (yaxlitQatorIdlari): ustamali summada koeffitsient qo'llanmaydi. */
  yaxlitIdlar?: ReadonlySet<number>;
};

const BARG = new Set(['rs', 'mat', 'ob']);
const EPS = 1e-6;
/** Shu summadan kichik band yozilmaydi (yaxlitlash shovqini). */
export const PUL_CHEGARA = 0.5;
/** Birlik shubhasi chegarasi: hajm yoki narx nisbati shundan katta (yoki 1/shundan kichik narx nisbati). */
export const BIRLIK_NISBAT = 5;

const son = (x: unknown): number | null => {
  if (x == null || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
export { yaxlit2 };


/** Bitta barg qatorni tasnif qiladi (kontekst — razdel/eski/zamena belgilari tashqaridan). Tasnifga kirmasa null. */
export function qatorTasnif(q: PQator, o: { eski: boolean; zamena: boolean; bolimId: number | null; bolimYol: string[]; ajdodlar: number[]; asosiy?: ChegirmaAsosiy | null }): PNatijaQator | null {
  const tur = q.tur ?? '';
  if (!BARG.has(tur) || mashinistMehnati({ nom: q.nom })) return null;
  const f2 = son(q.f2_hajm) ?? 0;
  const fakt = son(q.fakt_hajm) ?? 0;
  const smeta = son(q.smeta_hajm);
  const chegirmami = smeta != null && smeta < -EPS;
  // Chegirma F2 da umuman olinmagan bo'lsa ham, asosiy ish olingan bo'lsa — hisobga kiradi.
  if (Math.abs(f2) < EPS && Math.abs(fakt) < EPS && !(chegirmami && (o.asosiy?.ulush ?? 0) > EPS)) return null;
  const narx = son(q.smeta_narx);
  const f2s = son(q.f2_summa) ?? 0;
  const nomalum = (son(q.f2_summa_nomalum) ?? 0) > 0;
  const alm = Math.max(0, son(q.almashtirilgan_hajm) ?? 0);
  const f2Narx = !nomalum && Math.abs(f2) > EPS ? f2s / f2 : null;

  const tekshir: TekshirSabab[] = [];
  const eslatma: Eslatma[] = [];
  if (chegirmami && !o.asosiy) tekshir.push('chegirma_asosiy_yoq');
  else if (!chegirmami && (smeta == null || Math.abs(smeta) < EPS)) tekshir.push('smeta_hajm_yoq');
  if (narx == null) tekshir.push('narx_yoq');
  const shubha = (smeta != null && Math.abs(smeta) > EPS &&((f2 / smeta) > BIRLIK_NISBAT || (fakt / smeta) > BIRLIK_NISBAT))
    || (narx != null && narx > 0 && f2Narx != null && f2Narx > 0 && (f2Narx / narx > BIRLIK_NISBAT || f2Narx / narx < 1 / BIRLIK_NISBAT));
  if (shubha) tekshir.push('birlik_shubha');
  if (o.eski && Math.abs(f2) > EPS) tekshir.push('eski_smeta');
  if (o.zamena || alm > EPS) tekshir.push('zamena');
  if (q.fakt_manbasi === 'BL_NORMA' && fakt > EPS) eslatma.push('fakt_norma');

  const bandlar: PBand[] = [];
  let tashqariHajm = 0;
  let chegirma: PNatijaQator['chegirma'];
  if (chegirmami) {
    // CHEGIRMA («исключать», manfiy smeta hajmi; egasi/koordinator 2026-10-25, Sun'iy ko'l): asosiy ish X% olingan,
    // chegirma Y% qo'llangan → (X − Y) × smeta hajmi × narx. X > Y — chegirma qo'llanmagan (MINUS, buyurtmachi ayiradi);
    // X < Y — ortiqcha ayirilgan (PLYUS). Oddiy «smeta − F2 < 0 → ortiqcha» bu yerda ISHLATILMAYDI (soxta ortiqcha beradi).
    const y = f2 / (smeta as number);
    chegirma = { asosiy: o.asosiy ?? null, y };
    if (o.asosiy && narx != null) {
      const x = Math.min(1, Math.max(0, o.asosiy.ulush));
      const d = x - y;
      if (Math.abs(d) > 1e-9) { const hajm = Number((d * (smeta as number)).toPrecision(12)); bandlar.push({ tur: 'chegirma', hajm, summa: yaxlit2(hajm * narx) }); }
      if (Math.abs(f2) > EPS) {
        if (nomalum) eslatma.push('narx_farqi_hisoblanmadi');
        else bandlar.push({ tur: 'narx_farqi', hajm: 0, summa: yaxlit2(-(f2s - f2 * narx)) });
      }
    }
  } else if (smeta != null && smeta > EPS && narx != null) {
    const ortiqcha = f2 + alm - smeta;
    if (ortiqcha > EPS) bandlar.push({ tur: 'ortiqcha', hajm: -ortiqcha, summa: yaxlit2(-ortiqcha * narx) });
    const chegara = Math.max(0, smeta - alm);
    const olin = Math.min(fakt, chegara) - f2;
    if (olin > EPS) bandlar.push({ tur: 'olinmagan', hajm: olin, summa: yaxlit2(olin * narx) });
    const tashqari = fakt - Math.max(f2, chegara);
    if (tashqari > EPS) { tashqariHajm = tashqari; eslatma.push('smetadan_tashqari'); }
    if (Math.abs(f2) > EPS) {
      if (nomalum) eslatma.push('narx_farqi_hisoblanmadi');
      else {
        const farq = f2s - f2 * narx;
        bandlar.push({ tur: 'narx_farqi', hajm: 0, summa: yaxlit2(-farq) });
      }
    }
  }
  const pul = bandlar.filter((b) => Math.abs(b.summa) >= PUL_CHEGARA);
  const sof = yaxlit2(pul.reduce((s, b) => s + b.summa, 0));
  if (!pul.length && !tekshir.length) return null;
  return {
    qatorId: q.qator_id, kod: q.kod, nom: q.nom ?? '', birlik: q.birlik, kat: q.kat, tur,
    smetaHajm: smeta, smetaNarx: narx, faktHajm: fakt, f2Hajm: f2, f2Summa: f2s, f2Narx, almashtirilgan: alm,
    bolimId: o.bolimId, bolimYol: o.bolimYol, ajdodlar: o.ajdodlar,
    bandlar: pul, sof, tekshir, eslatma, hisobda: tekshir.length === 0 && pul.length > 0, tashqariHajm,
    ...(chegirma ? { chegirma } : {}),
  };
}

/** «добавлять/исключать к норме 27-6-2-17» kabi havola (nomda). */
const NORMA_HAVOLA = /НОРМ[ЕАЫ]?\s*(?:№\s*)?([0-9]+(?:-[0-9]+)+)/i;
/** Kod: bo'shliqsiz, katta harf, kirill Е → lotin E. */
const kodNorm = (k: string | null | undefined) => String(k ?? '').toUpperCase().replace(/\s+/g, '').replace(/Е/g, 'E');
const kodPrefiks = (k: string | null | undefined) => { const s = kodNorm(k); const i = s.lastIndexOf('-'); return i > 0 ? s.slice(0, i) : ''; };

export type Ajdod = { bolimId: number | null; yol: string[]; ajdodlar: number[]; eski: boolean };

/**
 * Daraxt bo'yicha ajdod ma'lumoti (eng yaqin razdel, yo'l, barcha razdel ajdodlar, «(ekspertizagacha)» belgisi).
 * `ajdodOl(id)` — tugunning O'ZI va ajdodlari (iterativ, memo bilan). Fakt asosidagi pereraschet ham shuni ishlatadi.
 */
export function ajdodlarQur(rows: readonly PQator[]): { byId: Map<number, PQator>; ajdodOl: (id: number | null) => Ajdod } {
  const byId = new Map<number, PQator>();
  for (const r of rows) byId.set(r.qator_id, r);
  const memo = new Map<number, Ajdod>();
  const BOSH: Ajdod = { bolimId: null, yol: [], ajdodlar: [], eski: false };
  /** Tugunning O'ZI va ajdodlari bo'yicha ma'lumot (iterativ — chuqur daraxtda stek toshmaydi). */
  const ajdodOl = (id: number | null): Ajdod => {
    if (id == null) return BOSH;
    const c = memo.get(id);
    if (c) return c;
    const zanjir: number[] = [];
    let p: number | null = id;
    while (p != null && !memo.has(p) && byId.has(p) && zanjir.length < 64) { zanjir.push(p); p = byId.get(p)!.ota_id ?? null; }
    let ota = p != null && memo.has(p) ? memo.get(p)! : BOSH;
    for (let i = zanjir.length - 1; i >= 0; i--) {
      const q = byId.get(zanjir[i])!;
      const rz = q.tur === 'rz';
      const a: Ajdod = {
        bolimId: rz ? q.qator_id : ota.bolimId,
        yol: rz ? [...ota.yol, q.nom || 'Bo‘lim'] : ota.yol,
        ajdodlar: rz ? [...ota.ajdodlar, q.qator_id] : ota.ajdodlar,
        eski: ota.eski || ESKI_SMETA.test(String(q.nom ?? '')),
      };
      memo.set(q.qator_id, a);
      ota = a;
    }
    return memo.get(id) ?? BOSH;
  };
  return { byId, ajdodOl };
}

/** Butun obyekt: barcha qatorlar (rz/bl ham — daraxt uchun) → pereraschet natijasi. O(n). */
export function pereraschetHisobla(rows: readonly PQator[], k: PKontekst = {}): PNatija {
  const { byId, ajdodOl } = ajdodlarQur(rows);

  const bolalar = new Map<number | null, PQator[]>();
  for (const r of rows) { const kk = r.ota_id ?? null; const x = bolalar.get(kk); if (x) x.push(r); else bolalar.set(kk, [r]); }
  for (const x of bolalar.values()) x.sort((p, q) => p.qator_id - q.qator_id);
  const asosiyMemo = new Map<number, ChegirmaAsosiy | null>();
  /** Chegirma ishining asosiy ishi: (1) nomidagi «к норме 27-…» havolasi; (2) kod prefiksi bir xil oldingi ish; (3) shu bo'limdagi oldingi musbat ish. */
  const asosiyOl = (ish: PQator): ChegirmaAsosiy | null => {
    const c = asosiyMemo.get(ish.qator_id);
    if (c !== undefined) return c;
    const aka = (bolalar.get(ish.ota_id ?? null) ?? []).filter((x) => x.qator_id !== ish.qator_id && x.tur === ish.tur && (son(x.smeta_hajm) ?? 0) > EPS);
    const oldin = aka.filter((x) => x.qator_id < ish.qator_id);
    const ref = NORMA_HAVOLA.exec(String(ish.nom ?? ''))?.[1];
    const prefiks = kodPrefiks(ish.kod);
    const topildi = (ref ? aka.find((x) => kodNorm(x.kod).includes(ref)) : undefined)
      ?? (prefiks ? [...oldin].reverse().find((x) => kodPrefiks(x.kod) === prefiks) : undefined)
      ?? oldin[oldin.length - 1];
    let natija: ChegirmaAsosiy | null = null;
    if (topildi) {
      const sm = son(topildi.smeta_hajm)!;
      let ulush = (son(topildi.f2_hajm) ?? 0) / sm;
      if (Math.abs(ulush) < EPS && topildi.tur === 'bl') {
        // Ish qatoriga F2 hajmi yozilmagan bo'lsa — resurslari ulushining o'rtachasi.
        const u = (bolalar.get(topildi.qator_id) ?? []).filter((x) => (son(x.smeta_hajm) ?? 0) > EPS && !mashinistMehnati({ nom: x.nom }))
          .map((x) => (son(x.f2_hajm) ?? 0) / son(x.smeta_hajm)!).filter((v) => Math.abs(v) > EPS);
        if (u.length) ulush = u.reduce((s, v) => s + v, 0) / u.length;
      }
      natija = { qatorId: topildi.qator_id, kod: topildi.kod, nom: topildi.nom ?? '', ulush };
    }
    asosiyMemo.set(ish.qator_id, natija);
    return natija;
  };

  const zamena = k.zamenaIdlar ?? new Set<number>();
  const asl = k.aslIdlar ?? new Set<number>();
  const qatorlar: PNatijaQator[] = [];
  for (const r of rows) {
    if (!BARG.has(r.tur ?? '')) continue;
    const a = ajdodOl(r.ota_id ?? null);
    if (k.bolimId != null && !a.ajdodlar.includes(k.bolimId)) continue;
    const z = zamena.has(r.qator_id) || asl.has(r.qator_id) || (r.ota_id != null && (zamena.has(r.ota_id) || asl.has(r.ota_id)));
    let asosiy: ChegirmaAsosiy | null | undefined;
    if ((son(r.smeta_hajm) ?? 0) < -EPS) {
      const ota = r.ota_id != null ? byId.get(r.ota_id) : undefined;
      asosiy = asosiyOl(ota && ota.tur === 'bl' ? ota : r);
    }
    const n = qatorTasnif(r, { eski: a.eski || ESKI_SMETA.test(String(r.nom ?? '')), zamena: z, bolimId: a.bolimId, bolimYol: a.yol, ajdodlar: a.ajdodlar, asosiy });
    if (n) qatorlar.push(n);
  }

  const hisobda = qatorlar.filter((q) => q.hisobda).sort((a, b) => Math.abs(b.sof) - Math.abs(a.sof));
  const tekshirish = qatorlar.filter((q) => q.tekshir.length > 0).sort((a, b) => Math.abs(b.sof) - Math.abs(a.sof));
  const turBoyicha: PNatija['turBoyicha'] = { ortiqcha: { plus: 0, minus: 0, soni: 0 }, narx_farqi: { plus: 0, minus: 0, soni: 0 }, olinmagan: { plus: 0, minus: 0, soni: 0 }, chegirma: { plus: 0, minus: 0, soni: 0 } };
  const plusKesim = bosKatKesim(); const minusKesim = bosKatKesim();
  const jami: PJami = { plus: 0, minus: 0, sof: 0, soni: hisobda.length };
  let faktNormaPlus = 0;
  const bolimMap = new Map<string, PBolimJami>();
  for (const q of hisobda) {
    const bk = String(q.bolimId ?? 'yoq');
    const bj = bolimMap.get(bk) ?? { bolimId: q.bolimId, yol: q.bolimYol, plus: 0, minus: 0, sof: 0, soni: 0 };
    bj.soni++;
    for (const b of q.bandlar) {
      const t = turBoyicha[b.tur];
      t.soni++;
      if (b.summa > 0) { t.plus += b.summa; jami.plus += b.summa; bj.plus += b.summa; katKesimgaQosh(plusKesim, q.kat, b.summa, !!k.yaxlitIdlar?.has(q.qatorId)); if (b.tur === 'olinmagan' && q.eslatma.includes('fakt_norma')) faktNormaPlus += b.summa; }
      else { t.minus += -b.summa; jami.minus += -b.summa; bj.minus += -b.summa; katKesimgaQosh(minusKesim, q.kat, -b.summa, !!k.yaxlitIdlar?.has(q.qatorId)); }
    }
    bolimMap.set(bk, bj);
  }
  jami.plus = yaxlit2(jami.plus); jami.minus = yaxlit2(jami.minus); jami.sof = yaxlit2(jami.plus - jami.minus);
  for (const t of Object.values(turBoyicha)) { t.plus = yaxlit2(t.plus); t.minus = yaxlit2(t.minus); }
  const bolimlar = [...bolimMap.values()].map((b) => ({ ...b, plus: yaxlit2(b.plus), minus: yaxlit2(b.minus), sof: yaxlit2(b.plus - b.minus) }))
    .sort((a, b) => Math.abs(b.sof) - Math.abs(a.sof));
  const tekshirTaxminiy = { plus: 0, minus: 0, soni: tekshirish.length };
  for (const q of tekshirish) for (const b of q.bandlar) { if (b.summa > 0) tekshirTaxminiy.plus += b.summa; else tekshirTaxminiy.minus += -b.summa; }
  tekshirTaxminiy.plus = yaxlit2(tekshirTaxminiy.plus); tekshirTaxminiy.minus = yaxlit2(tekshirTaxminiy.minus);
  return { qatorlar, hisobda, tekshirish, jami, turBoyicha, plusKesim, minusKesim, faktNormaPlus: yaxlit2(faktNormaPlus), tekshirTaxminiy, bolimlar };
}

/** Uchastka/razdel filtri uchun razdellar ro'yxati (daraxt tartibida, chuqurlik bilan). Faqat ostida barg bor razdellar. */
export function pereraschetBolimlari(rows: readonly PQator[]): Array<{ id: number; nom: string; daraja: number }> {
  const bolalar = new Map<number | null, PQator[]>();
  for (const r of rows) { const k = r.ota_id ?? null; const a = bolalar.get(k); if (a) a.push(r); else bolalar.set(k, [r]); }
  const bargBor = new Map<number, boolean>();
  const bor = (id: number): boolean => {
    const c = bargBor.get(id);
    if (c != null) return c;
    bargBor.set(id, false);
    const v = (bolalar.get(id) ?? []).some((r) => BARG.has(r.tur ?? '') || bor(r.qator_id));
    bargBor.set(id, v);
    return v;
  };
  const out: Array<{ id: number; nom: string; daraja: number }> = [];
  // DFS, id tartibida (chuqurlik 12 bilan cheklangan).
  const yur = (ota: number | null, daraja: number) => {
    const rz = (bolalar.get(ota) ?? []).filter((r) => r.tur === 'rz').sort((a, b) => a.qator_id - b.qator_id);
    for (const r of rz) { if (!bor(r.qator_id)) continue; out.push({ id: r.qator_id, nom: r.nom || 'Bo‘lim', daraja }); if (daraja < 12) yur(r.qator_id, daraja + 1); }
  };
  yur(null, 0);
  return out;
}

export type TuzatuvchiQator = {
  qatorId: number; certifiedQuantity: number; certifiedUnitPrice: number; certifiedAmount: number;
  rawSnapshot: Record<string, unknown>; izoh: string;
};

const BAND_RU: Record<BandTur, string> = { ortiqcha: 'излишне предъявлено', narx_farqi: 'разница в цене', olinmagan: 'не предъявлено (по факту)', chegirma: 'исключение (вычет) не применено пропорционально основной работе' };

/**
 * «Tuzatuvchi F2 qoralamasi» yuki (t2_akt_yarat_v2): tanlangan HISOBDAGI qatorlardan; bir qator — bitta yozuv
 * (server bir qatorni ikki marta qabul qilmaydi): hajm = bandlar hajmlari yig'indisi (ortiqcha — manfiy), summa = bandlar
 * summasi, narx — smeta narxi. Narx farqi hajmsiz (0) summa sifatida kiradi. Tekshirish qatorlari KIRMAYDI.
 */
export function tuzatuvchiYuk(natija: readonly PNatijaQator[], tanlangan: ReadonlySet<number>, turlar?: ReadonlySet<BandTur>): TuzatuvchiQator[] {
  const out: TuzatuvchiQator[] = [];
  for (const q of natija) {
    if (!q.hisobda || !tanlangan.has(q.qatorId) || q.smetaNarx == null) continue;
    const b = q.bandlar.filter((x) => !turlar || turlar.has(x.tur));
    if (!b.length) continue;
    const hajm = Number(b.reduce((s, x) => s + x.hajm, 0).toPrecision(12));
    const summa = yaxlit2(b.reduce((s, x) => s + x.summa, 0));
    if (Math.abs(summa) < PUL_CHEGARA && Math.abs(hajm) < EPS) continue;
    const izoh = `Перерасчёт: ${b.map((x) => `${BAND_RU[x.tur]} ${x.summa.toFixed(2)}`).join('; ')}`;
    out.push({
      qatorId: q.qatorId, certifiedQuantity: hajm, certifiedUnitPrice: q.smetaNarx, certifiedAmount: summa,
      rawSnapshot: { source: 'pereraschet', sourceReference: 'Перерасчёт (накопительная ведомость)', bandlar: b, enteredQuantity: hajm, enteredUnitPrice: q.smetaNarx, enteredAmount: summa },
      izoh,
    });
  }
  return out;
}
