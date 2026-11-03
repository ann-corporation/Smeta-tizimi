/**
 * Fakt jurnali — sof mantiq (egasi, 2026-10-01: "fakt kiritish juda tez va aniq, funksional kuchli,
 * vizual qulay bo'lishi kerak").
 *
 *  - bo'limlar (rz) daraxti va har birining bajarilish foizi (summa bo'yicha; summa yo'q bo'lsa — hajm);
 *  - bo'lim ichidagi ISHLAR (bl) va ularning resurslari: mat/ob — kiritiladi, rs — norma × ish
 *    faktidan avtomatik (faqat ko'rsatiladi);
 *  - har qatorda ikki rejim: "+" (bugun bajarildi) va "=" (jami fakt). Ikkalasi ham BITTA
 *    `fakt_yoz_v2` paketiga delta sifatida tushadi (bitta tranzaksiya, bitta operation_id).
 */
import type { T2Qator } from '../api/supabase';
import { bosKatKesim, type KatKesim } from './ustamali-summa';
import { ochiqQoldiq } from './zamena-qoldiq';
import { ayirma2, faktSummaF2Narxda, hajmMasshtab, katJami, yigindi2 } from './hisob-yadro';
import { svodKorinishKesimi, yaxlitQatorIdlari, type SvodYaxlit } from './svod-yaxlit';

export type JurnalHolat = {
  qator_id: number; smeta_hajm: number | null; fakt_hajm: number | null;
  smeta_summa?: number | null; fakt_summa?: number | null; f2_mumkin_hajm?: number | null;
  /** «Fakt = F2» uchun: tasdiqlangan F2 hajmi va narxlar. */
  f2_hajm?: number | null; smeta_narx?: number | null; f2_narx?: number | null;
  /** Zamenalar qoplagan hajm (t2_qator_holat.almashtirilgan_hajm, aslning birligida). */
  almashtirilgan_hajm?: number | null;
  /** t2_qator_holat: qoldiq = smeta − F2 − almashtirilgan; summalar (NDS siz). */
  qoldiq_hajm?: number | null; f2_summa?: number | null; qoldiq_summa?: number | null;
  /** t2_qator_holat.f2_summa_yoq > 0 — F2 summasi noma'lum (NULL ≠ 0): fakt F2 narxida baholanmaydi. */
  f2_summa_yoq?: number | string | null;
};

/** Zamena bog'lanishi (ixtiyoriy, alohida o'qiladi): zamena qatori → asl qator; asl → almashtirilgan hajm. */
export type ZamenaBoglanish = { almashtiradi: ReadonlyMap<number, number>; almashtirilgan: ReadonlyMap<number, number> };

export type Rejim = '+' | '=';
export type Kiritma = { rejim: Rejim; qiymat: string };

export type JurnalQator = {
  id: number; tur: 'bl' | 'mat' | 'ob' | 'rs'; kod: string | null; nom: string; birlik: string | null;
  smeta: number | null; fakt: number;
  /** OCHIQ qoldiq (fakt rejimi) = smeta − fakt − almashtirilgan − bajarilmaydi (ochiqQoldiq); smeta yo'q → null. */
  qoldiq: number | null; f2Mumkin: number;
  /** Faol «bajarilmaydi» belgilari hajmi; yo'q bo'lsa null. */
  bajarilmaydi: number | null;
  /** 0..∞ (1 = 100%). Smeta yo'q bo'lsa null. */
  ulush: number | null;
  holat: 'yangi' | 'qisman' | 'tugadi' | 'oshdi' | 'smetasiz';
  norma: number | null;
  qoshimcha: boolean; zamena: boolean;
  otaId: number | null; otaVersiya: number | null;
  /** Smeta kategoriyasi (t2_qator.kat): ЧЕЛ/МАШ/МАТ/ОБ/М/К/КАБ/БЕЗСКЛАД; yo'q bo'lsa null. */
  kat: string | null;
  /** Zamena qatori: qaysi asl qator o'rniga (id) va uning nomi; bog'lanish noma'lum bo'lsa null. */
  almashtiradi: number | null; aslNom: string | null;
  /** Asl qator: zamenalari qoplagan hajm (aslning birligida); yo'q bo'lsa null. */
  almashtirilgan: number | null;
};

export type JurnalIsh = JurnalQator & { resurslar: JurnalQator[]; avtomatik: JurnalQator[] };

export type JurnalBolim = {
  id: number; otaId: number | null; daraja: number; nom: string; versiya: number;
  /** Bo'lim (ichki bo'limlari bilan) bajarilish ulushi 0..1; hisoblab bo'lmasa null. */
  ulush: number | null;
  ishSoni: number; tugaganSoni: number;
};

const son = (v: number | null | undefined) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const yaxlit = (x: number) => Math.round(x * 1e6) / 1e6;

export function holatTur(smeta: number | null, fakt: number): JurnalQator['holat'] {
  // Chegirma ishi (manfiy reja, masalan «ВЫЧИТАЕТСЯ…», «НА КАЖДЫЕ 5 ММ ИЗМЕНЕНИЯ ТОЛЩИНЫ») — absolyut qiymat bo'yicha.
  if (smeta != null && smeta < 0) return holatTur(-smeta, -fakt);
  if (smeta == null || smeta <= 0) return fakt > 0 ? 'smetasiz' : 'yangi';
  if (fakt <= 0) return 'yangi';
  if (fakt > smeta + 1e-9) return 'oshdi';
  if (fakt >= smeta - 1e-9) return 'tugadi';
  return 'qisman';
}

function qatorQur(r: T2Qator, h: JurnalHolat | undefined, byId: Map<number, T2Qator>, zb?: ZamenaBoglanish | null, baj?: ReadonlyMap<number, number> | null): JurnalQator {
  const smeta = son(h?.smeta_hajm) ?? son(r.hajm);
  const fakt = son(h?.fakt_hajm) ?? 0;
  const ota = r.ota_id != null ? byId.get(r.ota_id) : undefined;
  const aslId = r.zamena ? zb?.almashtiradi.get(r.id) ?? null : null;
  const asl = aslId != null ? byId.get(aslId) : undefined;
  const alm = son(h?.almashtirilgan_hajm) ?? zb?.almashtirilgan.get(r.id) ?? null;
  const bj = baj?.get(r.id) ?? null;
  const ochiq = ochiqQoldiq({ smeta, fakt, almashtirilgan: alm != null && alm > 0 ? alm : null, bajarilmaydi: bj }, 'fakt');
  return {
    kat: r.kat?.trim() || null,
    almashtiradi: aslId, aslNom: asl ? [asl.kod, asl.nom].filter(Boolean).join(' ') || null : null,
    almashtirilgan: alm != null && alm > 0 ? alm : null,
    id: r.id, tur: (r.tur as JurnalQator['tur']), kod: r.kod, nom: r.nom || 'Nomsiz', birlik: r.birlik,
    smeta, fakt, qoldiq: ochiq == null ? null : yaxlit(ochiq), f2Mumkin: son(h?.f2_mumkin_hajm) ?? 0,
    bajarilmaydi: bj != null && bj > 0 ? bj : null,
    ulush: smeta ? fakt / smeta : null, holat: holatTur(smeta, fakt),
    norma: son((r as T2Qator & { norma?: number | null }).norma),
    qoshimcha: !!r.qoshimcha && !r.zamena, zamena: !!r.zamena,
    otaId: r.ota_id ?? null, otaVersiya: ota?.versiya ?? null,
  };
}

/** Obyekt daraxtidan jurnal modeli: bo'limlar ro'yxati va bo'lim → ishlar. */
/** Zamena qatorini o'z asl qatoridan KEYIN qo'yadi (asl shu ro'yxatda bo'lsa); qolgan tartib o'zgarmaydi. */
export function zamenaTartibla<T extends { id: number; almashtiradi: number | null }>(arr: readonly T[]): T[] {
  const ids = new Set(arr.map((x) => x.id));
  const ergashuvchi = new Map<number, T[]>();
  for (const x of arr) if (x.almashtiradi != null && x.almashtiradi !== x.id && ids.has(x.almashtiradi)) {
    const a = ergashuvchi.get(x.almashtiradi) ?? []; a.push(x); ergashuvchi.set(x.almashtiradi, a);
  }
  const out: T[] = []; const qoyildi = new Set<number>();
  const qoy = (x: T) => { if (qoyildi.has(x.id)) return; qoyildi.add(x.id); out.push(x); for (const z of ergashuvchi.get(x.id) ?? []) qoy(z); };
  for (const x of arr) if (!(x.almashtiradi != null && ids.has(x.almashtiradi) && x.almashtiradi !== x.id)) qoy(x);
  for (const x of arr) qoy(x); // aylanma bog'lanish bo'lsa ham hech narsa yo'qolmaydi
  return out;
}

/** baj — faol «bajarilmaydi» hajmlari (qator id → hajm): ochiq qoldiqdan ayriladi. */
export function jurnalQur(rows: readonly T2Qator[], states: readonly JurnalHolat[], zb?: ZamenaBoglanish | null, baj?: ReadonlyMap<number, number> | null) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const holat = new Map(states.map((s) => [s.qator_id, s]));
  const bolalar = new Map<number | null, T2Qator[]>();
  for (const r of rows) { const k = r.ota_id ?? null; const a = bolalar.get(k); if (a) a.push(r); else bolalar.set(k, [r]); }
  const qq = (c: T2Qator) => qatorQur(c, holat.get(c.id), byId, zb, baj);

  /** Bo'lim → o'ziga TEGISHLI (ichki bo'limlarsiz) ishlar va mustaqil resurslar. */
  const bolimIshlari = new Map<number, JurnalIsh[]>();
  const ishQur = (r: T2Qator): JurnalIsh => {
    const q = qq(r);
    const resurslar: JurnalQator[] = []; const avtomatik: JurnalQator[] = [];
    const yur = (ota: number) => {
      for (const c of bolalar.get(ota) ?? []) {
        if (c.tur === 'mat' || c.tur === 'ob') resurslar.push(qq(c));
        else if (c.tur === 'rs') avtomatik.push(qq(c));
        if (c.tur !== 'bl') yur(c.id);
      }
    };
    yur(r.id);
    return { ...q, resurslar: zamenaTartibla(resurslar), avtomatik: zamenaTartibla(avtomatik) };
  };
  for (const r of rows) {
    if (r.tur !== 'rz') continue;
    const ishlar: JurnalIsh[] = [];
    for (const c of bolalar.get(r.id) ?? []) {
      if (c.tur === 'bl') ishlar.push(ishQur(c));
      else if (c.tur === 'mat' || c.tur === 'ob') ishlar.push({ ...qq(c), resurslar: [], avtomatik: [] });
    }
    bolimIshlari.set(r.id, zamenaTartibla(ishlar));
  }
  /** Bo'limsiz (ota yo'q) ishlar va alohida mat/ob — jurnal ko'rinishida yo'q, lekin markirovka/qamrov ularni o'tkazib yubormasin. */
  const ildizIshlari: JurnalIsh[] = [];
  for (const c of bolalar.get(null) ?? []) {
    if (c.tur === 'bl') ildizIshlari.push(ishQur(c));
    else if (c.tur === 'mat' || c.tur === 'ob') ildizIshlari.push({ ...qq(c), resurslar: [], avtomatik: [] });
  }

  // Bo'lim ulushi — har ishning HAJM bo'yicha bajarilishi (0..1), smeta summasi bilan tortilgan o'rtacha.
  // Fakt summasi ishlatilmaydi: ish (bl) qatorining o'z narxi yo'q (summa resurslardan), shuning uchun
  // uning "fakt summasi" 0 bo'lib qoladi va hamma ishi 100% bo'lgan bo'lim 12% ko'rinardi (egasi, 2026-10-01).
  // Hammasi 100% → bo'lim ham 100%. Summasi yo'q ishlar teng og'irlik oladi.
  const yigindi = new Map<number, { w: number; wu: number; n: number; t: number }>();
  const hisobla = (id: number): { w: number; wu: number; n: number; t: number } => {
    const bor = yigindi.get(id); if (bor) return bor;
    const acc = { w: 0, wu: 0, n: 0, t: 0 };
    const ishlar = bolimIshlari.get(id) ?? [];
    const summalar = ishlar.map((ish) => son(holat.get(ish.id)?.smeta_summa));
    const ortacha = (() => { const m = summalar.filter((x): x is number => x != null && x > 0); return m.length ? m.reduce((a, b) => a + b, 0) / m.length : 1; })();
    ishlar.forEach((ish, i) => {
      if (ish.ulush != null) {
        const vazn = summalar[i] != null && summalar[i]! > 0 ? summalar[i]! : ortacha;
        acc.w += vazn; acc.wu += vazn * Math.min(ish.ulush, 1);
      }
      acc.n += 1; if (ish.holat === 'tugadi' || ish.holat === 'oshdi') acc.t += 1;
    });
    for (const c of bolalar.get(id) ?? []) if (c.tur === 'rz') {
      const ich = hisobla(c.id); acc.w += ich.w; acc.wu += ich.wu; acc.n += ich.n; acc.t += ich.t;
    }
    yigindi.set(id, acc); return acc;
  };
  const bolimlar: JurnalBolim[] = [];
  const tartibla = (ota: number | null) => {
    for (const r of bolalar.get(ota) ?? []) {
      if (r.tur !== 'rz') continue;
      const a = hisobla(r.id);
      bolimlar.push({
        id: r.id, otaId: r.ota_id ?? null, daraja: r.daraja ?? 0, versiya: r.versiya,
        nom: [r.kod, r.nom].filter(Boolean).join(' ') || 'Bo‘lim',
        ulush: a.w > 0 ? a.wu / a.w : null,
        ishSoni: a.n, tugaganSoni: a.t,
      });
      tartibla(r.id);
    }
  };
  tartibla(null);
  return { bolimlar, bolimIshlari, ildizIshlari };
}

export type SummaKesim = { ustamasiz: number | null; kesim: KatKesim };
export type BolimSumma = {
  smeta: SummaKesim; f2: SummaKesim; fakt: SummaKesim; qoldiq: SummaKesim;
  /** Qo'shimcha/zamena ishlar smetasi (barglar) — «smeta» ga kirmaydi; Nakopitelniy smeta = smeta + qoshimcha. */
  qoshimcha: SummaKesim;
  /** Narx qoidasi: fakt summasi tasdiqlangan F2 birlik narxida hisoblangan pozitsiyalar soni (fakt hajmi o'zgarmaydi). */
  faktF2: { f2Narxda: number };
};
const BARG = new Set(['rs', 'mat', 'ob']);

/**
 * Bo'lim (ichki bo'limlari bilan) va butun obyekt jami summalari — resurs (rs/mat/ob) qatorlari holatidan
 * (t2_qator_holat: smeta/f2/fakt/qoldiq_summa; narx NDS siz). Pul to'qilmaydi: summasi NULL qator 0 emas —
 * kesimning `summasizSoni` da; hammasi NULL bo'lsa ustamasiz ham NULL.
 * «Smeta» — faqat asl smeta qatorlari (qo'shimcha/zamena ostidagilar emas: aks holda zamena asl bilan ikki marta sanalardi).
 * Kalit `0` — butun obyekt.
 *
 * ISH (bl) qatorining O'Z F2/fakt summasi (L0 tekshiruvi 2026-10-26, Sun'iy ko'l: F2 to'g'ridan-to'g'ri ish qatoriga
 * bog'langan, 5,51 mlrd ko'rinmasdi) ham qo'shiladi. t2_qator_holat.f2_summa/fakt_summa — faqat SHU qatorga yozilgan
 * akt qatorlari (bolalarniki emas), shuning uchun ikki marta sanalmaydi: ish darajasidagi summa alohida, bolalarniki
 * alohida. Ish smeta_summa'si bolalar yig'indisi (takror) — smeta/qoldiqqa olinmaydi; qoldiq ish F2 siga kamayadi
 * (Nakopitelniy: qoldiq = smeta − jami tasdiqlangan).
 */
export function bolimSummalari(rows: readonly T2Qator[], states: readonly JurnalHolat[],
  /** Ishdan chiqarilgan resurslar (lib/resurs-amal): norma × ish faktidan hosila FAKT summasi bo'lim/obyekt jamisiga qo'shilmaydi (smeta/F2 o'zgarmaydi). */
  chiqarilgan?: ReadonlySet<number>,
  /** Svod yaxlit (server): bo'lim tarkibi yaxlit summaga masshtablanadi (eksport modeli bilan bir xil, `svodKorinishKesimi`). */
  svod?: SvodYaxlit | null): Map<number, BolimSumma> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const holat = new Map(states.map((s) => [s.qator_id, s]));
  const bos = (): SummaKesim => ({ ustamasiz: null, kesim: bosKatKesim() });
  const out = new Map<number, BolimSumma>();
  // Qiymatlar to'planadi; kesim va jami oxirida YADRODAN (`svodKorinishKesimi` + `yigindi2`). Hammasi NULL — NULL.
  type Element = { id: number; kat: string | null; summa: number | null; smeta: number | null; f2: number | null };
  const elementlar = new Map<SummaKesim, Element[]>();
  const masshtabsiz = new Set<SummaKesim>();
  const qoldiqlar = new Set<SummaKesim>();
  const yaxlitIds = yaxlitQatorIdlari(rows, svod);
  const ol = (id: number) => { let x = out.get(id); if (!x) { x = { smeta: bos(), f2: bos(), fakt: bos(), qoldiq: bos(), qoshimcha: bos(), faktF2: { f2Narxda: 0 } }; masshtabsiz.add(x.f2); qoldiqlar.add(x.qoldiq); out.set(id, x); } return x; };
  const qosh = (s: SummaKesim, kat: string | null, v: number | null, id = 0, smeta: number | null = null, f2: number | null = null) => {
    const l = elementlar.get(s); const e = { id, kat, summa: v, smeta, f2 };
    if (l) l.push(e); else elementlar.set(s, [e]);
  };
  const v = (x: unknown) => son(x as number | null | undefined);
  /** Fakt summasi — yadro narx qoidasi: tasdiqlangan F2 bor qatorda F2 birlik narxida; hajm yozilganidek, NULL — NULL. */
  const faktOl = (h: JurnalHolat | undefined) => faktSummaF2Narxda(v(h?.fakt_hajm), v(h?.f2_hajm), v(h?.f2_summa), v(h?.fakt_summa), v(h?.f2_summa_yoq));
  const belgi = (x: BolimSumma, q: ReturnType<typeof faktOl>) => { if (q.manba === 'f2' && q.summa != null) x.faktF2.f2Narxda++; };
  /** Ota-bobolari: yangi (qo'shimcha/zamena) ekanligi va bo'limlari (0 — obyekt). */
  const yol = (r: T2Qator) => {
    let yangi = !!r.qoshimcha || !!r.zamena; const bolimlar: number[] = [0];
    let p = r.ota_id != null ? byId.get(r.ota_id) : undefined; let n = 0;
    while (p && n++ < 60) { if (p.qoshimcha || p.zamena) yangi = true; if (p.tur === 'rz') bolimlar.push(p.id); p = p.ota_id != null ? byId.get(p.ota_id) : undefined; }
    return { yangi, bolimlar };
  };
  for (const r of rows) {
    if (r.tur === 'bl') {
      const h = holat.get(r.id);
      const f2 = v(h?.f2_summa); const fq = faktOl(h); const fakt = fq.summa;
      if ((f2 == null || f2 === 0) && (fakt == null || fakt === 0)) continue;
      for (const b of yol(r).bolimlar) {
        const x = ol(b);
        if (f2 != null && f2 !== 0) { qosh(x.f2, r.kat, f2, r.id); qosh(x.qoldiq, r.kat, -f2, r.id, null, f2); }
        if (fakt != null && fakt !== 0) { qosh(x.fakt, r.kat, fakt, r.id); belgi(x, fq); }
      }
      continue;
    }
    if (!BARG.has(r.tur ?? '')) continue;
    const h = holat.get(r.id);
    const { yangi, bolimlar } = yol(r);
    const fq = faktOl(h);
    const sm = v(h?.smeta_summa);
    const chiq = !!chiqarilgan?.has(r.id);
    for (const b of bolimlar) {
      const x = ol(b);
      qosh(yangi ? x.qoshimcha : x.smeta, r.kat, sm, r.id, sm);
      qosh(x.f2, r.kat, v(h?.f2_summa), r.id, sm);
      // Chiqarilgan resurs fakti qo'shilmaydi; svod bo'limida esa ulush uchun smetasi bilan 0 (bajarilmaydi) sifatida.
      if (!chiq) { qosh(x.fakt, r.kat, fq.summa, r.id, sm); belgi(x, fq); } else if (yaxlitIds.has(r.id)) qosh(x.fakt, r.kat, 0, r.id, sm);
      qosh(x.qoldiq, r.kat, v(h?.qoldiq_summa), r.id, sm, v(h?.f2_summa));
    }
  }
  const f = { id: (e: Element) => e.id, kat: (e: Element) => e.kat, summa: (e: Element) => e.summa, smeta: (e: Element) => e.smeta };
  const f2Of = (e: Element) => e.f2;
  // Svod bo'limi BUTUN smetasi (barcha barglari) — ichki bo'lim kesimida ulush shunga nisbatan.
  const bolimSmeta = new Map<number, number>();
  for (const b of svod?.bolimlar ?? []) {
    const ids = yaxlitQatorIdlari(rows, { ...svod!, bolimlar: [b] });
    bolimSmeta.set(Number(b.qator_id), yigindi2(rows.filter((r) => ids.has(r.id) && BARG.has(r.tur ?? '')).map((r) => v(holat.get(r.id)?.smeta_summa))));
  }
  for (const [s, l] of elementlar) {
    // F2 — aynan (masshtablanmaydi); qoldiq svod bo'limida = yaxlit − F2 aynan; qolganlari yaxlit × (ko'rinish / smeta).
    s.kesim = svodKorinishKesimi(rows, l, f, svod, { masshtab: !masshtabsiz.has(s), bolimSmeta, ...(qoldiqlar.has(s) ? { qoldiqF2: f2Of } : {}) });
    if (!l.some((e) => e.summa != null && Number.isFinite(e.summa))) { s.ustamasiz = null; continue; }
    s.ustamasiz = yigindi2([katJami(s.kesim.summalar), s.kesim.nomalum, s.kesim.yaxlit?.qqssiz]);
  }
  return out;
}

/**
 * Daraxt jamisi ↔ Nakopitelniy (t2_nakopitelniy_v2.jami) muvofiqligi: Nakopitelniy smeta = daraxt smeta (asl) +
 * qo'shimcha/zamena ishlar; F2 = jami tasdiqlangan. Farq (|Δ| > 1 so'm) — ogohlantirish uchun. NULL ≠ 0: Nakopitelniy
 * qiymati noma'lum bo'lsa farq ham null (solishtirilmaydi).
 */
export type NakMoslik = { smetaJami: number | null; smetaFarq: number | null; f2Farq: number | null; mos: boolean };
export function nakopitelniyMoslik(j: BolimSumma, nak: { smeta_summa?: number | null; jami_tasdiqlangan_summa?: number | null } | null): NakMoslik {
  const s = j.smeta.ustamasiz; const q = j.qoshimcha.ustamasiz;
  // Pul — yadro (ROUND 2); NULL ≠ 0: ikkalasi noma'lum bo'lsagina null.
  const smetaJami = s == null && q == null ? null : yigindi2([s, q]);
  const farq = (a: number | null, b: number | null | undefined) => (b == null || !Number.isFinite(Number(b)) ? null : ayirma2(a, Number(b)));
  const smetaFarq = farq(smetaJami, nak?.smeta_summa);
  const f2Farq = farq(j.f2.ustamasiz ?? 0, nak?.jami_tasdiqlangan_summa);
  return { smetaJami, smetaFarq, f2Farq, mos: Math.abs(smetaFarq ?? 0) <= 1 && Math.abs(f2Farq ?? 0) <= 1 };
}

export type BolimBolak ={ bolim: JurnalBolim; /** Tanlangan bo'limga nisbatan chuqurlik (0 = o'zi). */ nisbiy: number; ishlar: JurnalIsh[] };

/**
 * Tanlangan bo'lim va uning BARCHA avlod bo'limlari (daraxt tartibida), har biri o'z ishlari bilan.
 * Egasi 2026-10-25: «kattaroq bo'limni bossa 'ichi bo'sh' deydi» — endi har darajada hamma ish ko'rinadi.
 * Ishi ham, ishli avlodi ham yo'q bo'limlar tashlanadi (tanlangan bo'limning o'zi doim birinchi).
 */
export function bolimTarkibi(bolimId: number, bolimlar: readonly JurnalBolim[], bolimIshlari: ReadonlyMap<number, JurnalIsh[]>): BolimBolak[] {
  const i0 = bolimlar.findIndex((b) => b.id === bolimId);
  if (i0 < 0) return [];
  const chuqur = new Map<number, number>([[bolimId, 0]]);
  const out: BolimBolak[] = [{ bolim: bolimlar[i0], nisbiy: 0, ishlar: bolimIshlari.get(bolimId) ?? [] }];
  for (const b of bolimlar) {
    if (b.id === bolimId || b.otaId == null || !chuqur.has(b.otaId)) continue;
    const n = chuqur.get(b.otaId)! + 1; chuqur.set(b.id, n);
    out.push({ bolim: b, nisbiy: n, ishlar: bolimIshlari.get(b.id) ?? [] });
  }
  // Ishli avlodi bor-yo'qligi (sarlavha strukturani ko'rsatsin, lekin bo'sh shoxlar shovqin qilmasin).
  const toliq = new Set<number>();
  for (let i = out.length - 1; i >= 0; i--) {
    const x = out[i];
    if (x.ishlar.length || toliq.has(x.bolim.id)) { toliq.add(x.bolim.id); if (x.bolim.otaId != null) toliq.add(x.bolim.otaId); }
  }
  return out.filter((x, i) => i === 0 || toliq.has(x.bolim.id));
}

/** "12,5" → 12.5; bo'sh → null; noto'g'ri → NaN. */
export function sonOqi(v: string): number | null {
  const t = v.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

/** «50%» / «12,5 %» — smeta hajmining foizi (egasi 2026-10-31: foiz bilan tez kiritish). Foiz yozuvi bo'lmasa — null. */
export function foizOqi(v: string): number | null {
  const m = /^(-?\d+(?:\.\d+)?)%$/.exec(v.trim().replace(/\s/g, '').replace(',', '.'));
  return m ? Number(m[1]) : null;
}

/**
 * Kiritma soni: oddiy son (`sonOqi`) yoki smeta foizi — hajm = smeta × foiz (yadro `hajmMasshtab`, 6 xona).
 * '+' rejimda — bugungi hajm (smetaning foizi), '=' rejimda — jami fakt. Foiz, lekin smeta noma'lum/0 — 'SMETASIZ' (to'qilmaydi).
 */
export function kiritmaSoni(v: string, smeta: number | null | undefined): number | null | 'SMETASIZ' {
  const f = foizOqi(v);
  if (f == null) return sonOqi(v);
  if (smeta == null || !Number.isFinite(smeta) || smeta === 0) return 'SMETASIZ';
  return hajmMasshtab(smeta, f / 100);
}

export type JurnalXato = 'SON_EMAS' | 'MANFIY' | 'NOL' | 'ISHORA' | 'FOIZ_SMETASIZ';
export const JURNAL_XATO_MATN: Record<JurnalXato, string> = {
  SON_EMAS: 'Son emas', MANFIY: 'Jami fakt manfiy bo‘lib qoladi', ISHORA: 'Chegirma ishi: fakt smeta kabi manfiy bo‘lishi kerak', NOL: '0 qo‘shilmaydi',
  FOIZ_SMETASIZ: 'Foiz uchun smeta hajmi kerak',
};

/**
 * Kiritmalarni bitta delta paketiga: "+" → n; "=" → n − joriy fakt (o'zgarish yo'q bo'lsa tashlanadi).
 * `faktlar` — joriy server qiymatlari (qator_id → fakt).
 */
export function jurnalPaket(kiritmalar: Readonly<Record<number, Kiritma>>, faktlar: ReadonlyMap<number, number>, smetalar?: ReadonlyMap<number, number | null>) {
  const qatorlar: { qator_id: number; hajm: number }[] = [];
  const xatolar = new Map<number, JurnalXato>();
  for (const [k, v] of Object.entries(kiritmalar)) {
    const id = Number(k); const joriy = faktlar.get(id);
    if (joriy == null) continue;
    const n = kiritmaSoni(v.qiymat, smetalar?.get(id));
    if (n === 'SMETASIZ') { xatolar.set(id, 'FOIZ_SMETASIZ'); continue; }
    if (n == null) continue;
    if (!Number.isFinite(n)) { xatolar.set(id, 'SON_EMAS'); continue; }
    const delta = v.rejim === '+' ? n : yaxlit(n - joriy);
    if (v.rejim === '+' && n === 0) { xatolar.set(id, 'NOL'); continue; }
    // Reja ishorasi: musbat reja — jami fakt manfiy bo'lmaydi; chegirma (manfiy reja) — jami fakt musbat bo'lmaydi.
    const manfiyReja = (smetalar?.get(id) ?? 0) < 0;
    if (!manfiyReja && joriy + delta < -1e-9) { xatolar.set(id, 'MANFIY'); continue; }
    if (manfiyReja && joriy + delta > 1e-9) { xatolar.set(id, 'ISHORA'); continue; }
    if (delta === 0) continue;
    qatorlar.push({ qator_id: id, hajm: delta });
  }
  return { qatorlar, xatolar, ok: xatolar.size === 0 && qatorlar.length > 0 };
}

/** Ochiq qoldiq bormi (smeta ishorasida, 1e-9 dan katta)? Smeta noma'lum bo'lsa — true (yashirilmaydi). «Faqat bajarilmaganlar» filtri. */
export function ochiqBor(q: Pick<JurnalQator, 'qoldiq'> & { smeta?: number | null }): boolean {
  if (q.qoldiq == null) return true;
  return (q.smeta ?? 0) < 0 ? q.qoldiq < -1e-9 : q.qoldiq > 1e-9;
}

/** OCHIQ qoldiqning ulushi (25/50/100%) — "+" rejimi uchun qiymat (zamena va «bajarilmaydi» ayrilgan). */
export function qoldiqUlushi(q: Pick<JurnalQator, 'qoldiq'> & { smeta?: number | null }, foiz: number): string | null {
  if (!ochiqBor(q) || q.qoldiq == null) return null;
  return String(yaxlit(q.qoldiq * foiz / 100));
}
