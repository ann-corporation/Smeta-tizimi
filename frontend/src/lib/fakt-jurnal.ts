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
import { numberFormula, type FormulaContext, type FormulaError } from './formula/number-formula';

export type JurnalHolat = {
  qator_id: number; smeta_hajm: number | null; fakt_hajm: number | null;
  smeta_summa?: number | null; fakt_summa?: number | null; f2_mumkin_hajm?: number | null;
};

export type Rejim = '+' | '=';
export type Kiritma = { rejim: Rejim; qiymat: string };

export type JurnalQator = {
  id: number; tur: 'bl' | 'mat' | 'ob' | 'rs'; kod: string | null; nom: string; birlik: string | null;
  smeta: number | null; fakt: number; qoldiq: number | null; f2Mumkin: number;
  /** 0..∞ (1 = 100%). Smeta yo'q bo'lsa null. */
  ulush: number | null;
  holat: 'yangi' | 'qisman' | 'tugadi' | 'oshdi' | 'smetasiz';
  norma: number | null;
  qoshimcha: boolean; zamena: boolean;
  otaId: number | null; otaVersiya: number | null;
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
  if (smeta == null || smeta <= 0) return fakt > 0 ? 'smetasiz' : 'yangi';
  if (fakt <= 0) return 'yangi';
  if (fakt > smeta + 1e-9) return 'oshdi';
  if (fakt >= smeta - 1e-9) return 'tugadi';
  return 'qisman';
}

function qatorQur(r: T2Qator, h: JurnalHolat | undefined, byId: Map<number, T2Qator>): JurnalQator {
  const smeta = son(h?.smeta_hajm) ?? son(r.hajm);
  const fakt = son(h?.fakt_hajm) ?? 0;
  const ota = r.ota_id != null ? byId.get(r.ota_id) : undefined;
  return {
    id: r.id, tur: (r.tur as JurnalQator['tur']), kod: r.kod, nom: r.nom || 'Nomsiz', birlik: r.birlik,
    smeta, fakt, qoldiq: smeta == null ? null : yaxlit(smeta - fakt), f2Mumkin: son(h?.f2_mumkin_hajm) ?? 0,
    ulush: smeta && smeta > 0 ? fakt / smeta : null, holat: holatTur(smeta, fakt),
    norma: son((r as T2Qator & { norma?: number | null }).norma),
    qoshimcha: !!r.qoshimcha && !r.zamena, zamena: !!r.zamena,
    otaId: r.ota_id ?? null, otaVersiya: ota?.versiya ?? null,
  };
}

/** Obyekt daraxtidan jurnal modeli: bo'limlar ro'yxati va bo'lim → ishlar. */
export function jurnalQur(rows: readonly T2Qator[], states: readonly JurnalHolat[]) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const holat = new Map(states.map((s) => [s.qator_id, s]));
  const bolalar = new Map<number | null, T2Qator[]>();
  for (const r of rows) { const k = r.ota_id ?? null; const a = bolalar.get(k); if (a) a.push(r); else bolalar.set(k, [r]); }

  /** Bo'lim → o'ziga TEGISHLI (ichki bo'limlarsiz) ishlar va mustaqil resurslar. */
  const bolimIshlari = new Map<number, JurnalIsh[]>();
  const ishQur = (r: T2Qator): JurnalIsh => {
    const q = qatorQur(r, holat.get(r.id), byId);
    const resurslar: JurnalQator[] = []; const avtomatik: JurnalQator[] = [];
    const yur = (ota: number) => {
      for (const c of bolalar.get(ota) ?? []) {
        if (c.tur === 'mat' || c.tur === 'ob') resurslar.push(qatorQur(c, holat.get(c.id), byId));
        else if (c.tur === 'rs') avtomatik.push(qatorQur(c, holat.get(c.id), byId));
        if (c.tur !== 'bl') yur(c.id);
      }
    };
    yur(r.id);
    return { ...q, resurslar, avtomatik };
  };
  for (const r of rows) {
    if (r.tur !== 'rz') continue;
    const ishlar: JurnalIsh[] = [];
    for (const c of bolalar.get(r.id) ?? []) {
      if (c.tur === 'bl') ishlar.push(ishQur(c));
      else if (c.tur === 'mat' || c.tur === 'ob') ishlar.push({ ...qatorQur(c, holat.get(c.id), byId), resurslar: [], avtomatik: [] });
    }
    bolimIshlari.set(r.id, ishlar);
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
  return { bolimlar, bolimIshlari };
}

/** "12,5" → 12.5; bo'sh → null; noto'g'ri → NaN. */
export function sonOqi(v: string): number | null {
  const t = v.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

export type JurnalXato = 'SON_EMAS' | 'MANFIY' | 'NOL' | FormulaError;
export const JURNAL_XATO_MATN: Record<JurnalXato, string> = {
  SON_EMAS: 'Son emas', MANFIY: 'Jami fakt manfiy bo‘lib qoladi', NOL: '0 qo‘shilmaydi',
  SYNTAX: 'Formula yozilishi noto‘g‘ri', UNKNOWN_NAME: 'Noma’lum nom yoki funksiya', MISSING_VALUE: 'Formula uchun qiymat noma’lum',
  DIVIDE_BY_ZERO: '0 ga bo‘lish mumkin emas', INVALID_NUMBER: 'Son yoki formula kiriting', TOO_COMPLEX: 'Formula juda murakkab',
};

/** Shu qator uchun formula oq ro‘yxati. Boshqa qator/obyektga havola yo‘q. */
export function faktFormulaKonteksti(q: Pick<JurnalQator, 'smeta' | 'fakt' | 'qoldiq' | 'f2Mumkin'>): FormulaContext {
  return { SMETA: q.smeta, FAKT: q.fakt, QOLDIQ: q.qoldiq, F2_MUMKIN: q.f2Mumkin };
}

export function kiritmaSon(value: string, context: FormulaContext = {}): number | null | FormulaError {
  const result = numberFormula(value, context);
  return result.ok ? result.value : (value.trim() ? result.error : null);
}

/**
 * Kiritmalarni bitta delta paketiga: "+" → n; "=" → n − joriy fakt (o'zgarish yo'q bo'lsa tashlanadi).
 * `faktlar` — joriy server qiymatlari (qator_id → fakt).
 */
export function jurnalPaket(kiritmalar: Readonly<Record<number, Kiritma>>, faktlar: ReadonlyMap<number, number>, contexts: ReadonlyMap<number, FormulaContext> = new Map()) {
  const qatorlar: { qator_id: number; hajm: number }[] = [];
  const xatolar = new Map<number, JurnalXato>();
  for (const [k, v] of Object.entries(kiritmalar)) {
    const id = Number(k); const joriy = faktlar.get(id);
    if (joriy == null) continue;
    const n = kiritmaSon(v.qiymat, contexts.get(id));
    if (n == null) continue;
    if (typeof n !== 'number' || !Number.isFinite(n)) { xatolar.set(id, typeof n === 'string' ? n : 'SON_EMAS'); continue; }
    const delta = v.rejim === '+' ? n : yaxlit(n - joriy);
    if (v.rejim === '+' && n === 0) { xatolar.set(id, 'NOL'); continue; }
    if (joriy + delta < -1e-9) { xatolar.set(id, 'MANFIY'); continue; }
    if (delta === 0) continue;
    qatorlar.push({ qator_id: id, hajm: delta });
  }
  return { qatorlar, xatolar, ok: xatolar.size === 0 && qatorlar.length > 0 };
}

/** Qoldiqning ulushi (25/50/100%) — "+" rejimi uchun qiymat. */
export function qoldiqUlushi(q: Pick<JurnalQator, 'qoldiq'>, foiz: number): string | null {
  if (q.qoldiq == null || q.qoldiq <= 0) return null;
  return String(yaxlit(q.qoldiq * foiz / 100));
}
