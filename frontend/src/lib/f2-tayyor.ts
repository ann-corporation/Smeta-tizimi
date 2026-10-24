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
import { katKesimYigish, type KatKesim } from './ustamali-summa';
import type { F2NativePayloadRow } from './f2-native-preparation';

export type F2Holat = { qator_id: number; f2_mumkin_hajm?: number | null; f2_hajm?: number | null; fakt_hajm?: number | null; smeta_hajm?: number | null; f2_narx?: number | null };
/** Hajm manbai: akt — Fakt jurnali qoldig'i (sukut); smeta — faktsiz rejim: chegara = smeta qoldig'i, oshsa faqat ogohlantirish (egasi 2026-10-24: hajm bo'yicha blok yo'q). */
export type F2Manba = 'fakt' | 'smeta';
export type NarxManba = 'protokol' | 'oldingi_f2' | 'smeta' | 'qolda' | 'yoq';
export const NARX_MANBA_NOMI: Record<NarxManba, string> = { protokol: 'protokol', oldingi_f2: 'oldingi F2', smeta: 'smeta', qolda: 'qo‘lda', yoq: 'narxsiz' };
/** Shu oyda kuchga kirgan Протокол согласования цен narxlari: qator_id → narx va rekvizit (api/t2-narx-protokol). */
export type ProtokolNarxlari = ReadonlyMap<number, { narx: number; raqam: string; sana: string }>;

export type F2Resurs = {
  id: number; tur: 'rs' | 'mat' | 'ob'; kat: string | null; kod: string | null; nom: string; birlik: string | null;
  norma: number | null; mumkin: number; /** avtomatik (rs) — ish hajmi × norma */ avto: boolean;
  /** Faktsiz rejim: chegara bloklamaydi (mumkin 0 bo'lsa ham kiritiladi, oshsa ogohlantirish). */
  erkin?: boolean;
  /** Tasdiqlanmagan (qoralama) F2 dagi hajm - `mumkin` dan allaqachon ayirilgan. */
  qoralama?: number;
  taklifNarx: number | null; taklifManba: NarxManba;
  /** Narx protokoldan olingan bo'lsa — hujjatdagi asos: «№ … от …». */
  protokol?: string;
};
export type F2Ish = { id: number; kod: string | null; nom: string; birlik: string | null; mumkin: number; smeta: number | null; olingan: number; resurslar: F2Resurs[]; erkin?: boolean; /** qoralamadagi F2 hajmi (mumkin dan ayirilgan) */ qoralama?: number };
export type F2Bolim = { id: number | null; nom: string; daraja: number; ishlar: F2Ish[]; alohida: F2Resurs[] };

const son = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
export const y6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** Narx ustuvorligi (egasi 2026-10-03): imzolangan protokol → oldingi F2 → smeta. */
function narxTaklif(f2Narx: number | null, smetaNarx: number | null, protokolNarx?: number | null): { narx: number | null; manba: NarxManba } {
  if (protokolNarx != null && Number.isFinite(protokolNarx) && protokolNarx >= 0) return { narx: y6(protokolNarx), manba: 'protokol' };
  // Smeta faylidagi suzuvchi nuqta shovqini (1442.3999999999) — 6 xonagacha tozalanadi.
  if (f2Narx != null) f2Narx = y6(f2Narx);
  if (smetaNarx != null) smetaNarx = y6(smetaNarx);
  if (f2Narx != null && f2Narx > 0) return { narx: f2Narx, manba: 'oldingi_f2' };
  // Smetada aniq 0 (masalan «ЗАТРАТЫ ТРУДА МАШИНИСТОВ» — mashina-soat narxi ichida) — bu ma'lum qiymat, NULL emas.
  if (smetaNarx != null && smetaNarx >= 0) return { narx: smetaNarx, manba: 'smeta' };
  return { narx: null, manba: 'yoq' };
}

/** Smeta daraxti → F2 uchun bo'limlar/ishlar/resurslar (faqat F2 olish mumkin bo'lganlar). */
export function f2Qur(rows: T2Qator[], holat: F2Holat[], protokol?: ProtokolNarxlari, manba: F2Manba = 'fakt', qoralama?: ReadonlyMap<number, number>): F2Bolim[] {
  const h = new Map(holat.map((x) => [x.qator_id, x]));
  const erkin = manba === 'smeta';
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const bolalar = new Map<number | null, T2Qator[]>();
  for (const r of rows) { const k = r.ota_id ?? null; if (!bolalar.has(k)) bolalar.set(k, []); bolalar.get(k)!.push(r); }
  for (const a of bolalar.values()) a.sort((p, q) => (p.tartib ?? 0) - (q.tartib ?? 0) || p.id - q.id);
  // Faktsiz rejim: smeta hajmi − shu qatorning barcha F2 lari (RPC o'zgarmaydi: smeta_hajm/f2_hajm bor).
  const baza = (id: number) => erkin
    ? Math.max(0, (son(h.get(id)?.smeta_hajm) ?? son(rowById.get(id)?.hajm) ?? 0) - (son(h.get(id)?.f2_hajm) ?? 0))
    : Math.max(0, son(h.get(id)?.f2_mumkin_hajm) ?? 0);
  // Qoralamadagi (tasdiqlanmagan) F2 hajmi qoldiqdan AYIRILADI - bir ishni ikki marta F2 qilish xavfi bo'lmasin.
  const qor = (id: number) => Math.max(0, qoralama?.get(id) ?? 0);
  const mumkin = (id: number) => Math.max(0, baza(id) - qor(id));
  const smetaHajm = (id: number) => son(h.get(id)?.smeta_hajm) ?? son(rowById.get(id)?.hajm);
  const resurs = (r: T2Qator, avto: boolean): F2Resurs => {
    const p = protokol?.get(r.id);
    const t = narxTaklif(son(h.get(r.id)?.f2_narx), son(r.narx), p?.narx);
    const x: F2Resurs = { id: r.id, tur: r.tur as F2Resurs['tur'], kat: r.kat, kod: r.kod, nom: r.nom || 'Nomsiz', birlik: r.birlik, norma: son((r as T2Qator & { norma?: number | null }).norma), mumkin: mumkin(r.id), avto, taklifNarx: t.narx, taklifManba: t.manba, ...(erkin ? { erkin: true } : {}), ...(qor(r.id) > 0 ? { qoralama: qor(r.id) } : {}) };
    if (p && t.manba === 'protokol') x.protokol = `№ ${p.raqam} от ${p.sana.slice(0, 10).split('-').reverse().join('.')}`;
    return x;
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
        const ish: F2Ish = { id: r.id, kod: r.kod, nom: r.nom || 'Nomsiz', birlik: r.birlik, mumkin: mumkin(r.id), smeta: son(hh?.smeta_hajm) ?? son(r.hajm), olingan: son(hh?.f2_hajm) ?? 0, resurslar: res, ...(erkin ? { erkin: true } : {}), ...(qor(r.id) > 0 ? { qoralama: qor(r.id) } : {}) };
        // Fakt rejimida qoralama qoldiqni 0 ga tushirsa ham ish ro'yxatda qoladi (tasdiqlangan va qoralama alohida ko'rinsin).
        if (erkin ? (smetaHajm(r.id) ?? 0) > 0 : (baza(r.id) > 0 || res.some((x) => !x.avto && baza(x.id) > 0))) b.ishlar.push(ish);
      } else if (r.tur === 'mat' || r.tur === 'ob') {
        const x = resurs(r, false); if (erkin ? (smetaHajm(r.id) ?? 0) > 0 : baza(r.id) > 0) b.alohida.push(x);
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
  protokol?: string;
  /** Hajm hech qachon xato emas (egasi: hajmni bloklama) - oshsa `ogoh`. */
  xato?: 'HAJM' | 'NARX' | 'SUMMA';
  ogoh?: 'RESURS_CHEGARA' | 'ARIFMETIKA' | 'SMETADAN_OSHDI' | 'QOLDIQDAN_OSHDI' | 'QORALAMA_TAKROR' | 'AXBOROT_NARXSIZ';
};

/** Kiritilgan hajm qoldiqdan oshsa - faqat ogohlantirish kodi (blok emas). */
function oshOgoh(v: number, x: { mumkin: number; qoralama?: number; erkin?: boolean }): F2Qator['ogoh'] {
  if (v <= x.mumkin + 1e-9) return undefined;
  if ((x.qoralama ?? 0) > 0 && v <= x.mumkin + (x.qoralama ?? 0) + 1e-9) return 'QORALAMA_TAKROR';
  return x.erkin ? 'SMETADAN_OSHDI' : 'QOLDIQDAN_OSHDI';
}

/** Narxi umuman bo'lmagan axborot qatori (masalan ЗАТРАТЫ ТРУДА МАШИНИСТОВ) - xato emas, narxsiz + bildirishnoma. */
export const axborotResursmi = (nom: string): boolean => /^\s*(ЗАТРАТЫ\s+ТРУДА|ЗП\s+МАШИНИСТ|В\s+Т\.?\s*Ч|ОПЛАТА\s+ТРУДА\s+МАШИНИСТ)/i.test(nom);

function resursQator(r: F2Resurs, hajm: number, ishId: number | null, k: F2Kiritma): F2Qator {
  const qolNarx = sonOqi(k.narx[r.id]);
  const qolSumma = sonOqi(k.summa[r.id]);
  // Narxsizlik — faqat operatorning ongli qarori (H7: ИТОГО bo‘sh bo‘ladi); sukut bo‘yicha narx talab qilinadi.
  const avtoAxborot = k.narxsiz[r.id] == null && qolNarx == null && r.taklifNarx == null && axborotResursmi(r.nom);
  const narxsiz = k.narxsiz[r.id] === true || avtoAxborot;
  const narx = narxsiz ? null : qolNarx === 'xato' ? null : (qolNarx ?? r.taklifNarx);
  const manba: NarxManba = narxsiz ? 'yoq' : qolNarx != null ? 'qolda' : r.taklifManba;
  const q: F2Qator = { id: r.id, ishId, tur: r.tur, kat: r.kat, nom: r.nom, birlik: r.birlik, hajm, narx, summa: null, manba, narxsiz };
  if (manba === 'protokol' && r.protokol) q.protokol = r.protokol;
  if (narxsiz) { if (avtoAxborot) q.ogoh = 'AXBOROT_NARXSIZ'; return q; }
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
    const q = resursQator(r, v, ishId, k);
    if (!q.ogoh) q.ogoh = oshOgoh(v, r); // blok emas, ogohlantirish
    out.push(q);
  };
  for (const b of bolimlar) {
    for (const ish of b.ishlar) {
      const v = sonOqi(k.hajm[ish.id]);
      if (v != null) {
        if (v === 'xato' || v <= 0) out.push({ id: ish.id, ishId: null, tur: 'bl', kat: null, nom: ish.nom, birlik: ish.birlik, hajm: 0, narx: null, summa: null, manba: 'yoq', narxsiz: true, xato: 'HAJM' });
        else {
          const bl: F2Qator = { id: ish.id, ishId: null, tur: 'bl', kat: null, nom: ish.nom, birlik: ish.birlik, hajm: v, narx: null, summa: null, manba: 'yoq', narxsiz: true };
          if (ish.smeta != null && ish.olingan + (ish.qoralama ?? 0) + v > ish.smeta + 1e-9) bl.ogoh = 'SMETADAN_OSHDI';
          else bl.ogoh = oshOgoh(v, ish);
          out.push(bl);
          // Ish hajmi qoldiqdan oshgan bo'lsa (ongli) - resurslar normadan to'liq; aks holda fakt qoldig'i bilan cheklanadi.
          const ustida = v > ish.mumkin + 1e-9;
          for (const r of ish.resurslar) {
            if (!r.avto || r.norma == null || r.norma <= 0 || (r.mumkin + (r.qoralama ?? 0) <= 0 && !r.erkin)) continue;
            const talab = y6(v * r.norma);
            const hajm = r.erkin || ustida ? talab : Math.min(talab, r.mumkin);
            const q = resursQator(r, hajm, ish.id, k);
            if (talab > r.mumkin + 1e-9 && !q.ogoh) q.ogoh = r.erkin || ustida ? oshOgoh(talab, r) : 'RESURS_CHEGARA';
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
  const j: F2Jami = { ish: 0, qator: q.length, xato: 0, ogoh: 0, narxsiz: 0, summa: 0, kat: {}, manba: { protokol: 0, oldingi_f2: 0, smeta: 0, qolda: 0, yoq: 0 } };
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
const NARX_MANBA_HUJJAT: Record<NarxManba, string> = { protokol: 'цена по протоколу согласования цен', oldingi_f2: 'цена по предыдущей Ф-2', smeta: 'цена по смете', qolda: 'цена по документу', yoq: 'без цены' };

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
    rawSnapshot: { source: 'native_f2_preparation', sourceReference: x.tur === 'bl' ? manba : `${manba}; ${NARX_MANBA_HUJJAT[x.manba]}${x.protokol ? ` ${x.protokol}` : ''}`, enteredQuantity: x.hajm, enteredUnitPrice: x.narxsiz ? undefined : x.narx ?? undefined, enteredAmount: x.narxsiz ? undefined : x.summa ?? undefined },
  }));
}

/** Ishning 1 birlik taklif narxi (NDS siz) = Σ norma × taklif narx avtomatik resurslar bo'yicha; narxi yo'q resurslar soni alohida (0 deb olinmaydi). */
export function ishBirlikNarxi(i: Pick<F2Ish, 'resurslar'>): { summa: number; narxsiz: number } {
  let summa = 0; let narxsiz = 0;
  for (const r of i.resurslar) {
    if (!r.avto || r.norma == null || r.norma <= 0) continue;
    if (r.taklifNarx == null) narxsiz++; else summa += r.norma * r.taklifNarx;
  }
  return { summa: pulYaxlit(summa), narxsiz };
}

/** Bo'limlar yig'iq daraxti: har bo'lim uchun ota kaliti va farzandi bor-yo'qligi (`daraja` bo'yicha ketma-ket ro'yxatdan). Kalit: id ?? -1. */
export type BolimDaraxtGuruh = { b: F2Bolim; kalit: number; ota: number | null; farzand: boolean };
export function bolimDaraxti(bolimlar: readonly F2Bolim[]): BolimDaraxtGuruh[] {
  const stek: Array<{ daraja: number; kalit: number }> = [];
  const out: BolimDaraxtGuruh[] = [];
  bolimlar.forEach((b, i) => {
    while (stek.length && stek[stek.length - 1].daraja >= b.daraja) stek.pop();
    const kalit = b.id ?? -1;
    out.push({ b, kalit, ota: stek.length ? stek[stek.length - 1].kalit : null, farzand: (bolimlar[i + 1]?.daraja ?? -1) > b.daraja });
    stek.push({ daraja: b.daraja, kalit });
  });
  return out;
}
/** Ko'rinadigan bo'limlar: ota-ona zanjiri to'liq kengaytirilgan yoki tanlangan bo'limning ajdodi. */
export function korinadiganBolimlar(d: readonly BolimDaraxtGuruh[], kengaygan: ReadonlySet<number>, tanlangan: number | null): BolimDaraxtGuruh[] {
  const ota = new Map(d.map((x) => [x.kalit, x.ota]));
  const ochiq = new Set(kengaygan);
  for (let k: number | null | undefined = tanlangan ?? -1; k != null; k = ota.get(k)) if (k !== (tanlangan ?? -1)) ochiq.add(k);
  return d.filter((x) => { for (let o = x.ota; o != null; o = ota.get(o) ?? null) if (!ochiq.has(o)) return false; return true; });
}

/** Ish bo'yicha ulush tugmalari (25/50/100% — F2 mumkin hajmdan). */
export function ulushHajm(mumkin: number, foiz: number): string {
  return String(y6(mumkin * foiz / 100));
}

/** Narxi topilmagan resurslar — ommaviy "narxsiz" belgilash uchun. */
export function narxsizNomzodlar(q: F2Qator[]): number[] {
  return q.filter((x) => x.tur !== 'bl' && x.xato === 'NARX').map((x) => x.id);
}

/** Ustamali jami uchun kategoriya kesimi (egasi 2026-10-24): kat - smeta qatoridan; kat'siz qator "kat noma'lum" bo'lib qoladi (yagona qatlam: lib/ustamali-summa). */
export function f2KatKesim(q: F2Qator[]): KatKesim {
  return katKesimYigish(q.filter((x) => x.tur !== 'bl' && x.summa != null), (x) => x.kat, (x) => x.summa);
}
