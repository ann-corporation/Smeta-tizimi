/**
 * F2 tayyorlash — sof mantiq (egasi, 2026-10-01: "fakt kiritishdan ideal F2 gacha").
 *
 * Haqiqiy F2 tuzilishi (production'dagi tasdiqlangan aktlar bo'yicha tekshirilgan):
 *   - ISH (bl): faqat hajm, narxsiz (price_intentionally_absent);
 *   - ishning RESURSLARI (rs: ЧЕЛ/МАШ/МАТ): hajm = ish hajmi × norma, o'z narxi va summasi;
 *   - alohida materiallar (mat/ob): o'z hajmi (fakt bo'yicha), narxi, summasi.
 * Operator faqat ish hajmini tanlaydi — resurslar avtomatik ergashadi. Narx manbasi har doim ko'rinadi:
 * oldingi F2 → smeta (RES) narxi; ikkalasi ham yo'q bo'lsa — operator narx kiritadi yoki ongli ravishda "narxsiz" belgilaydi (NULL ≠ 0).
 * Summa = hajm × narx (Postgres numeric bilan bir xil yaxlitlash), qo'lda o'zgartirilsa — hujjat summasi o'zi saqlanadi.
 */
import type { T2Qator } from '../api/supabase';
import { pulYaxlit } from './ish-abc';
import type { F2NativePayloadRow } from './f2-native-preparation';

export type F2Holat = { qator_id: number; f2_mumkin_hajm?: number | null; f2_hajm?: number | null; fakt_hajm?: number | null; smeta_hajm?: number | null; f2_narx?: number | null };
export type NarxManba = 'oldingi_f2' | 'smeta' | 'qolda' | 'yoq';
export const NARX_MANBA_NOMI: Record<NarxManba, string> = { oldingi_f2: 'oldingi F2', smeta: 'smeta', qolda: 'qo‘lda', yoq: 'narxsiz' };

export type F2Resurs = {
  id: number; tur: 'rs' | 'mat' | 'ob'; kat: string | null; kod: string | null; nom: string; birlik: string | null;
  norma: number | null; mumkin: number; /** avtomatik (rs) — ish hajmi × norma */ avto: boolean;
  taklifNarx: number | null; taklifManba: NarxManba;
};
export type F2Ish = { id: number; kod: string | null; nom: string; birlik: string | null; mumkin: number; smeta: number | null; olingan: number; resurslar: F2Resurs[] };
export type F2Bolim = { id: number | null; nom: string; daraja: number; ishlar: F2Ish[]; alohida: F2Resurs[] };

const son = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
export const y6 = (x: number) => Math.round(x * 1e6) / 1e6;

function narxTaklif(f2Narx: number | null, smetaNarx: number | null): { narx: number | null; manba: NarxManba } {
  // Smeta faylidagi suzuvchi nuqta shovqini (1442.3999999999) — 6 xonagacha tozalanadi.
  if (f2Narx != null) f2Narx = y6(f2Narx);
  if (smetaNarx != null) smetaNarx = y6(smetaNarx);
  if (f2Narx != null && f2Narx > 0) return { narx: f2Narx, manba: 'oldingi_f2' };
  // Smetada aniq 0 (masalan «ЗАТРАТЫ ТРУДА МАШИНИСТОВ» — mashina-soat narxi ichida) — bu ma'lum qiymat, NULL emas.
  if (smetaNarx != null && smetaNarx >= 0) return { narx: smetaNarx, manba: 'smeta' };
  return { narx: null, manba: 'yoq' };
}

/** Smeta daraxti → F2 uchun bo'limlar/ishlar/resurslar (faqat F2 olish mumkin bo'lganlar). */
export function f2Qur(rows: T2Qator[], holat: F2Holat[]): F2Bolim[] {
  const h = new Map(holat.map((x) => [x.qator_id, x]));
  const bolalar = new Map<number | null, T2Qator[]>();
  for (const r of rows) { const k = r.ota_id ?? null; if (!bolalar.has(k)) bolalar.set(k, []); bolalar.get(k)!.push(r); }
  for (const a of bolalar.values()) a.sort((p, q) => (p.tartib ?? 0) - (q.tartib ?? 0) || p.id - q.id);
  const mumkin = (id: number) => Math.max(0, son(h.get(id)?.f2_mumkin_hajm) ?? 0);
  const resurs = (r: T2Qator, avto: boolean): F2Resurs => {
    const t = narxTaklif(son(h.get(r.id)?.f2_narx), son(r.narx));
    return { id: r.id, tur: r.tur as F2Resurs['tur'], kat: r.kat, kod: r.kod, nom: r.nom || 'Nomsiz', birlik: r.birlik, norma: son((r as T2Qator & { norma?: number | null }).norma), mumkin: mumkin(r.id), avto, taklifNarx: t.narx, taklifManba: t.manba };
  };
  const out: F2Bolim[] = [];
  const bolimlar = new Map<number | null, F2Bolim>();
  const bolimOl = (id: number | null, nom: string, daraja: number) => {
    if (!bolimlar.has(id)) { const b = { id, nom, daraja, ishlar: [], alohida: [] }; bolimlar.set(id, b); out.push(b); }
    return bolimlar.get(id)!;
  };
  const yur = (ota: number | null, bolim: F2Bolim | null, daraja: number) => {
    for (const r of bolalar.get(ota) ?? []) {
      if (r.tur === 'rz') { bolimOl(r.id, r.nom || 'Bo‘lim', daraja); yur(r.id, bolimlar.get(r.id)!, daraja + 1); continue; }
      const b = bolim ?? bolimOl(null, 'Bo‘limsiz', 0);
      if (r.tur === 'bl') {
        const res = (bolalar.get(r.id) ?? []).filter((x) => x.tur === 'rs' || x.tur === 'mat' || x.tur === 'ob').map((x) => resurs(x, x.tur === 'rs'));
        const hh = h.get(r.id);
        const ish: F2Ish = { id: r.id, kod: r.kod, nom: r.nom || 'Nomsiz', birlik: r.birlik, mumkin: mumkin(r.id), smeta: son(hh?.smeta_hajm) ?? son(r.hajm), olingan: son(hh?.f2_hajm) ?? 0, resurslar: res };
        if (ish.mumkin > 0 || res.some((x) => !x.avto && x.mumkin > 0)) b.ishlar.push(ish);
      } else if (r.tur === 'mat' || r.tur === 'ob') {
        const x = resurs(r, false); if (x.mumkin > 0) b.alohida.push(x);
      }
    }
  };
  yur(null, null, 0);
  return out.filter((b) => b.ishlar.length || b.alohida.length);
}

/** Operator kiritmalari: ish hajmi, mustaqil resurs hajmi, narx/summa ustidan qo'lda o'zgartirish. */
export type F2Kiritma = {
  hajm: Record<number, string>;           // bl va mat/ob uchun
  narx: Record<number, string>;           // qo'lda narx (rs/mat/ob)
  summa: Record<number, string>;          // qo'lda hujjat summasi
  narxsiz: Record<number, boolean>;       // ataylab narxsiz
};
export const bosKiritma = (): F2Kiritma => ({ hajm: {}, narx: {}, summa: {}, narxsiz: {} });

export const sonOqi = (s: string | undefined): number | null | 'xato' => {
  const t = (s ?? '').replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(t)) return 'xato';
  return Number(t);
};

export type F2Qator = {
  id: number; ishId: number | null; tur: 'bl' | 'rs' | 'mat' | 'ob'; kat: string | null; nom: string; birlik: string | null;
  hajm: number; narx: number | null; summa: number | null; manba: NarxManba; narxsiz: boolean;
  xato?: 'HAJM' | 'OSHDI' | 'NARX' | 'SUMMA'; ogoh?: 'RESURS_CHEGARA' | 'ARIFMETIKA' | 'SMETADAN_OSHDI';
};

function resursQator(r: F2Resurs, hajm: number, ishId: number | null, k: F2Kiritma): F2Qator {
  const qolNarx = sonOqi(k.narx[r.id]);
  const qolSumma = sonOqi(k.summa[r.id]);
  // Narxsizlik — faqat operatorning ongli qarori (H7: ИТОГО bo‘sh bo‘ladi); sukut bo‘yicha narx talab qilinadi.
  const narxsiz = k.narxsiz[r.id] === true;
  const narx = narxsiz ? null : qolNarx === 'xato' ? null : (qolNarx ?? r.taklifNarx);
  const manba: NarxManba = narxsiz ? 'yoq' : qolNarx != null ? 'qolda' : r.taklifManba;
  const q: F2Qator = { id: r.id, ishId, tur: r.tur, kat: r.kat, nom: r.nom, birlik: r.birlik, hajm, narx, summa: null, manba, narxsiz };
  if (narxsiz) return q;
  if (qolNarx === 'xato' || narx == null || narx < 0) { q.xato = 'NARX'; return q; }
  if (qolSumma === 'xato') { q.xato = 'SUMMA'; return q; }
  q.summa = qolSumma ?? pulYaxlit(hajm * narx);
  if (qolSumma != null && Math.abs(hajm * narx - qolSumma) > 0.005) q.ogoh = 'ARIFMETIKA';
  return q;
}

/** Kiritmalardan F2 qatorlari: tanlangan ish + avtomatik resurslar + mustaqil resurslar. */
export function f2Qatorlar(bolimlar: F2Bolim[], k: F2Kiritma): F2Qator[] {
  const out: F2Qator[] = [];
  const mustaqil = (r: F2Resurs, ishId: number | null) => {
    const v = sonOqi(k.hajm[r.id]);
    if (v == null) return;
    if (v === 'xato' || v <= 0) { out.push({ id: r.id, ishId, tur: r.tur, kat: r.kat, nom: r.nom, birlik: r.birlik, hajm: 0, narx: null, summa: null, manba: 'yoq', narxsiz: false, xato: 'HAJM' }); return; }
    if (v > r.mumkin + 1e-9) { out.push({ id: r.id, ishId, tur: r.tur, kat: r.kat, nom: r.nom, birlik: r.birlik, hajm: v, narx: null, summa: null, manba: 'yoq', narxsiz: false, xato: 'OSHDI' }); return; }
    out.push(resursQator(r, v, ishId, k));
  };
  for (const b of bolimlar) {
    for (const ish of b.ishlar) {
      const v = sonOqi(k.hajm[ish.id]);
      if (v != null) {
        if (v === 'xato' || v <= 0) out.push({ id: ish.id, ishId: null, tur: 'bl', kat: null, nom: ish.nom, birlik: ish.birlik, hajm: 0, narx: null, summa: null, manba: 'yoq', narxsiz: true, xato: 'HAJM' });
        else if (v > ish.mumkin + 1e-9) out.push({ id: ish.id, ishId: null, tur: 'bl', kat: null, nom: ish.nom, birlik: ish.birlik, hajm: v, narx: null, summa: null, manba: 'yoq', narxsiz: true, xato: 'OSHDI' });
        else {
          const bl: F2Qator = { id: ish.id, ishId: null, tur: 'bl', kat: null, nom: ish.nom, birlik: ish.birlik, hajm: v, narx: null, summa: null, manba: 'yoq', narxsiz: true };
          if (ish.smeta != null && ish.olingan + v > ish.smeta + 1e-9) bl.ogoh = 'SMETADAN_OSHDI';
          out.push(bl);
          for (const r of ish.resurslar) {
            if (!r.avto || r.norma == null || r.norma <= 0 || r.mumkin <= 0) continue;
            const talab = y6(v * r.norma);
            const hajm = Math.min(talab, r.mumkin);
            const q = resursQator(r, hajm, ish.id, k);
            if (talab > r.mumkin + 1e-9 && !q.ogoh) q.ogoh = 'RESURS_CHEGARA';
            out.push(q);
          }
        }
      }
      for (const r of ish.resurslar) if (!r.avto) mustaqil(r, ish.id);
    }
    for (const r of b.alohida) mustaqil(r, null);
  }
  return out;
}

export type F2Jami = { ish: number; qator: number; xato: number; ogoh: number; narxsiz: number; summa: number; kat: Record<string, number>; manba: Record<NarxManba, number> };

export function f2Jami(q: F2Qator[]): F2Jami {
  const j: F2Jami = { ish: 0, qator: q.length, xato: 0, ogoh: 0, narxsiz: 0, summa: 0, kat: {}, manba: { oldingi_f2: 0, smeta: 0, qolda: 0, yoq: 0 } };
  for (const x of q) {
    if (x.tur === 'bl') j.ish++;
    if (x.xato) j.xato++;
    if (x.ogoh) j.ogoh++;
    if (x.tur !== 'bl') { j.manba[x.manba]++; if (x.narxsiz) j.narxsiz++; }
    if (x.summa != null) {
      j.summa += x.summa;
      const k = x.tur === 'rs' ? (x.kat || 'Boshqa') : 'Materiallar';
      j.kat[k] = (j.kat[k] ?? 0) + x.summa;
    }
  }
  j.summa = pulYaxlit(j.summa);
  return j;
}

/** Hujjatdagi "Основание" ustuni uchun (hujjat tili — rus). */
const NARX_MANBA_HUJJAT: Record<NarxManba, string> = { oldingi_f2: 'цена по предыдущей Ф-2', smeta: 'цена по смете', qolda: 'цена по документу', yoq: 'без цены' };

/** Server yuki (t2_akt_yarat_v2): ish — narxsiz; resurs — hujjat narxi va summasi. Manba — hujjat raqami. */
/** F2 qoralamasida ishlanadigan yacheykalar: har qatorning to'ldirilgan hajm/narx/summa qiymatlari (token hisobi). */
export function f2Yacheykalar(yuk: readonly F2NativePayloadRow[]): number {
  return yuk.reduce((s, r) => s + [r.certifiedQuantity, r.certifiedUnitPrice, r.certifiedAmount].filter((v) => v != null).length, 0);
}

export function f2Yuk(q: F2Qator[], hujjatRaqam: string): F2NativePayloadRow[] {
  const manba = hujjatRaqam.trim() ? `Ф-2 № ${hujjatRaqam.trim()}` : 'Ф-2 (сформирована в системе)';
  return q.filter((x) => !x.xato).map((x) => ({
    qatorId: x.id, certifiedQuantity: x.hajm,
    certifiedUnitPrice: x.narxsiz ? undefined : x.narx ?? undefined,
    certifiedAmount: x.narxsiz ? undefined : x.summa ?? undefined,
    priceIntentionallyAbsent: x.narxsiz,
    rawSnapshot: { source: 'native_f2_preparation', sourceReference: x.tur === 'bl' ? manba : `${manba}; ${NARX_MANBA_HUJJAT[x.manba]}`, enteredQuantity: x.hajm, enteredUnitPrice: x.narxsiz ? undefined : x.narx ?? undefined, enteredAmount: x.narxsiz ? undefined : x.summa ?? undefined },
  }));
}

/** Ish bo'yicha ulush tugmalari (25/50/100% — F2 mumkin hajmdan). */
export function ulushHajm(mumkin: number, foiz: number): string {
  return String(y6(mumkin * foiz / 100));
}

/** Narxi topilmagan resurslar — ommaviy "narxsiz" belgilash uchun. */
export function narxsizNomzodlar(q: F2Qator[]): number[] {
  return q.filter((x) => x.tur !== 'bl' && x.xato === 'NARX').map((x) => x.id);
}
