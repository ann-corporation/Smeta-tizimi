/**
 * OBYEKT PAKETI — mijoz tomoni (ADR docs/architecture/OBYEKT_PAKET_OFFLINE_DESKTOP_V1.md §1.2, §2; PR1a — reviziyasiz).
 *
 * Server (`t2_obyekt_paket_v1`) obyektni USTUNLI JSON bilan beradi. Bu modul:
 *   1) `paketDekod` — struct-of-arrays: raqamlar Float64Array + NULL bitmap (NULL ≠ 0), matnlar lug'at indeksi
 *      (Int32Array, -1 = null), id → indeks xaritasi;
 *   2) `paketdanQatorlar` / `paketdanHolatlar` — mavjud `T2Qator` / `T2QatorHolat` qator shakliga qaytarish
 *      (aynan `T2_DARAXT_USTUNLARI` / `T2_HOLAT_DARAXT_USTUNLARI` ustunlari) — PR2 da `useT2Daraxt` ga ulanadi.
 *
 * Sahifalarga HALI ulanmagan (PR2, bayroq ostida).
 *
 * Hosila holat ustunlari (smeta_*, qoldiq_*, f2_mumkin_*) `t2_qator_holat` formulalari bilan hisoblanadi
 * (faqat faol versiya qatorlari keladi). Hisob `lib/hisob-yadro/holat.ts` orqali, yagona yadroda.
 */
import type { T2Qator, T2QatorHolat } from '../api/supabase';
import { holatHosilalari } from '../lib/hisob-yadro/holat';

export const PAKET_FORMAT = 't2-paket/1';

/** Serverdan kelgan xom paket (JSON). */
export type PaketXom = {
  format: string;
  obyekt_id: number; obyekt_nom: string | null; kompaniya_id: number;
  soni: number;
  lugat: { nom: string[]; kod: string[]; birlik: string[]; tur: string[]; kat: string[] };
  q: {
    id: number[]; ota_id: (number | null)[]; daraja: (number | null)[]; tartib: (number | null)[];
    tur: (number | null)[]; kat: (number | null)[]; kod: (number | null)[]; nom: (number | null)[]; birlik: (number | null)[];
    hajm: (number | null)[]; narx: (number | null)[]; summa: (number | null)[]; norma: (number | null)[];
    narx_usul: (string | null)[]; versiya: number[]; qoshimcha: number[]; zamena: number[];
    xom_qator: Record<string, number>;
    /** Qo'shimcha (F2 tayyorlash/import): siyrak {id: raqam}. Eski serverda yo'q. */
    raqam?: Record<string, string>;
  };
  h: {
    fakt_hajm: (number | null)[]; fakt_summa: (number | null)[]; f2_hajm: (number | null)[]; f2_summa: (number | null)[];
    /** Optional until parent PR2 SQL extension; absent is not a zero count. */
    f2_summa_yoq?: (number | null)[];
    f2_summa_nomalum: (number | null)[]; direct_fakt_hajm: (number | null)[]; fakt_manbasi: number[];
    almashtirilgan_hajm: Record<string, number>; almashtirilgan_summa: Record<string, number | null>;
    /** Qo'shimcha (F2 tayyorlash), eski serverda yo'q: oldingi tasdiqlangan F2 narxi (view f2_narx; NULL = F2 hajmi 0). */
    f2_narx?: (number | null)[];
    /** Siyrak {id: view smeta_hajm}: faqat q.hajm dan farqlisi (zamena reja hajmi); yo'q kalit = q.hajm. */
    smeta_hajm?: Record<string, number>;
  };
  f2: Array<{ akt_id: number; raqam: string | null; oy: string | null; holat: string; lifecycle_status: string | null;
    versiya: number; hujjat_jami: number | null; muhr_xesh: string | null }>;
  meta: Record<string, unknown>;
};

/** Raqamli ustun: qiymatlar + «bor» bitmap (bit = 1 — qiymat bor, 0 — NULL). */
export type SonUstun = { q: Float64Array; bor: Uint8Array };
/** Lug'at ustuni: indeks (-1 = NULL) + lug'at. */
export type LugatUstun = { i: Int32Array; lugat: readonly string[] };

export type Paket = {
  format: string; obyekt_id: number; obyekt_nom: string | null; kompaniya_id: number; soni: number;
  /** id → massiv indeksi. */
  indeks: Map<number, number>;
  id: Float64Array;
  ota_id: SonUstun; daraja: SonUstun; tartib: SonUstun;
  tur: LugatUstun; kat: LugatUstun; kod: LugatUstun; nom: LugatUstun; birlik: LugatUstun;
  hajm: SonUstun; narx: SonUstun; summa: SonUstun; norma: SonUstun;
  narx_usul: (string | null)[]; versiya: Int32Array; qoshimcha: Uint8Array; zamena: Uint8Array;
  xom_qator: SonUstun;
  fakt_hajm: SonUstun; fakt_summa: SonUstun; f2_hajm: SonUstun; f2_summa: SonUstun;
  f2_summa_yoq?: SonUstun;
  f2_summa_nomalum: SonUstun; direct_fakt_hajm: SonUstun;
  /** F2 tayyorlash qo'shimchalari (eski serverda undefined: chaqiruvchi eski yo'lga qaytadi). */
  raqam?: (string | null)[];
  f2_narx?: SonUstun;
  /** Faqat farqli qatorlarda `bor`; qolganida q.hajm. */
  smeta_hajm_farq?: SonUstun;
  /** 0 — DIRECT, 1 — BL_NORMA. */
  fakt_manbasi: Uint8Array;
  /** Siyrak: yo'q kalit — 0. */
  almashtirilgan_hajm: SonUstun;
  /** Siyrak: yo'q kalit — 0; kalit bor, qiymat null — NULL. */
  almashtirilgan_summa: SonUstun;
  f2: PaketXom['f2'];
  meta: Record<string, unknown>;
};

export class PaketXato extends Error {}

export const bormi = (u: SonUstun, i: number) => (u.bor[i >> 3] & (1 << (i & 7))) !== 0;
export const son = (u: SonUstun, i: number): number | null => (bormi(u, i) ? u.q[i] : null);
export const matn = (u: LugatUstun, i: number): string | null => (u.i[i] < 0 ? null : u.lugat[u.i[i]] ?? null);

function sonUstun(n: number, nomi: string, xom: ReadonlyArray<number | null> | undefined): SonUstun {
  if (!Array.isArray(xom) || xom.length !== n) throw new PaketXato(`paket: ${nomi} uzunligi ${xom?.length} (${n} kutilgan)`);
  const q = new Float64Array(n); const bor = new Uint8Array((n + 7) >> 3);
  for (let i = 0; i < n; i++) {
    const v = xom[i];
    if (v == null) continue;
    const x = Number(v);
    if (!Number.isFinite(x)) throw new PaketXato(`paket: ${nomi}[${i}] son emas`);
    q[i] = x; bor[i >> 3] |= 1 << (i & 7);
  }
  return { q, bor };
}

/** Siyrak {id: qiymat} → ustun. `yoqBolsa` — kalit yo'q bo'lsa qiymat (0) yoki null. */
function siyrakUstun(n: number, nomi: string, xom: Record<string, number | null> | undefined, indeks: Map<number, number>, yoqBolsa: 0 | null): SonUstun {
  const q = new Float64Array(n); const bor = new Uint8Array((n + 7) >> 3);
  if (yoqBolsa === 0) bor.fill(0xff);
  for (const [k, v] of Object.entries(xom ?? {})) {
    const i = indeks.get(Number(k));
    if (i == null) throw new PaketXato(`paket: ${nomi} — noma'lum id ${k}`);
    if (v == null) { bor[i >> 3] &= ~(1 << (i & 7)); q[i] = 0; continue; }
    const x = Number(v);
    if (!Number.isFinite(x)) throw new PaketXato(`paket: ${nomi}[${k}] son emas`);
    q[i] = x; bor[i >> 3] |= 1 << (i & 7);
  }
  return { q, bor };
}

function lugatUstun(n: number, nomi: string, xom: ReadonlyArray<number | null> | undefined, lugat: readonly string[] | undefined, majburiy = false): LugatUstun {
  if (!Array.isArray(xom) || xom.length !== n) throw new PaketXato(`paket: ${nomi} uzunligi ${xom?.length} (${n} kutilgan)`);
  const l = Array.isArray(lugat) ? lugat : [];
  const i32 = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const v = xom[i];
    if (v == null) {
      if (majburiy) throw new PaketXato(`paket: ${nomi}[${i}] bo'sh — noma'lum qiymat`);
      i32[i] = -1; continue;
    }
    if (!Number.isInteger(v) || v < 0 || v >= l.length) throw new PaketXato(`paket: ${nomi}[${i}] lug'atda yo'q`);
    i32[i] = v;
  }
  return { i: i32, lugat: l };
}

function bitlar(n: number, nomi: string, xom: ReadonlyArray<number> | undefined): Uint8Array {
  if (!Array.isArray(xom) || xom.length !== n) throw new PaketXato(`paket: ${nomi} uzunligi ${xom?.length} (${n} kutilgan)`);
  const u = new Uint8Array(n);
  for (let i = 0; i < n; i++) u[i] = xom[i] ? 1 : 0;
  return u;
}

/** Xom paket → struct-of-arrays. Shakl buzilgan bo'lsa PaketXato (jim yarim ma'lumot yo'q). */
export function paketDekod(x: PaketXom): Paket {
  if (!x || x.format !== PAKET_FORMAT) throw new PaketXato(`paket: format ${x?.format} (${PAKET_FORMAT} kutilgan)`);
  const n = Number(x.soni);
  if (!Number.isInteger(n) || n < 0 || !Array.isArray(x.q?.id) || x.q.id.length !== n) throw new PaketXato('paket: soni mos emas');
  const id = new Float64Array(n);
  const indeks = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const v = Number(x.q.id[i]);
    if (!Number.isSafeInteger(v) || indeks.has(v)) throw new PaketXato(`paket: id[${i}] noto'g'ri yoki takror`);
    id[i] = v; indeks.set(v, i);
  }
  const versiya = new Int32Array(n);
  if (!Array.isArray(x.q.versiya) || x.q.versiya.length !== n) throw new PaketXato('paket: versiya uzunligi');
  for (let i = 0; i < n; i++) versiya[i] = Number(x.q.versiya[i]);
  if (!Array.isArray(x.q.narx_usul) || x.q.narx_usul.length !== n) throw new PaketXato('paket: narx_usul uzunligi');
  const L = x.lugat;
  return {
    format: x.format, obyekt_id: x.obyekt_id, obyekt_nom: x.obyekt_nom ?? null, kompaniya_id: x.kompaniya_id,
    soni: n, indeks, id,
    ota_id: sonUstun(n, 'ota_id', x.q.ota_id), daraja: sonUstun(n, 'daraja', x.q.daraja), tartib: sonUstun(n, 'tartib', x.q.tartib),
    // tur jim null bo'lmaydi (majburiy) — noma'lum tur xato.
    tur: lugatUstun(n, 'tur', x.q.tur, L?.tur, true), kat: lugatUstun(n, 'kat', x.q.kat, L?.kat), kod: lugatUstun(n, 'kod', x.q.kod, L?.kod),
    nom: lugatUstun(n, 'nom', x.q.nom, L?.nom), birlik: lugatUstun(n, 'birlik', x.q.birlik, L?.birlik),
    hajm: sonUstun(n, 'hajm', x.q.hajm), narx: sonUstun(n, 'narx', x.q.narx), summa: sonUstun(n, 'summa', x.q.summa),
    norma: sonUstun(n, 'norma', x.q.norma), narx_usul: x.q.narx_usul.map((v) => (v == null ? null : String(v))), versiya,
    qoshimcha: bitlar(n, 'qoshimcha', x.q.qoshimcha), zamena: bitlar(n, 'zamena', x.q.zamena),
    xom_qator: siyrakUstun(n, 'xom_qator', x.q.xom_qator, indeks, null),
    fakt_hajm: sonUstun(n, 'fakt_hajm', x.h?.fakt_hajm), fakt_summa: sonUstun(n, 'fakt_summa', x.h?.fakt_summa),
    f2_hajm: sonUstun(n, 'f2_hajm', x.h?.f2_hajm), f2_summa: sonUstun(n, 'f2_summa', x.h?.f2_summa),
    ...(x.h?.f2_summa_yoq === undefined ? {} : { f2_summa_yoq: sonUstun(n, 'f2_summa_yoq', x.h.f2_summa_yoq) }),
    f2_summa_nomalum: sonUstun(n, 'f2_summa_nomalum', x.h?.f2_summa_nomalum), direct_fakt_hajm: sonUstun(n, 'direct_fakt_hajm', x.h?.direct_fakt_hajm),
    fakt_manbasi: bitlar(n, 'fakt_manbasi', x.h?.fakt_manbasi),
    almashtirilgan_hajm: siyrakUstun(n, 'almashtirilgan_hajm', x.h?.almashtirilgan_hajm, indeks, 0),
    almashtirilgan_summa: siyrakUstun(n, 'almashtirilgan_summa', x.h?.almashtirilgan_summa, indeks, 0),
    ...(x.q.raqam === undefined ? {} : { raqam: raqamUstun(n, x.q.raqam, indeks) }),
    ...(x.h?.f2_narx === undefined ? {} : { f2_narx: sonUstun(n, 'f2_narx', x.h.f2_narx) }),
    ...(x.h?.smeta_hajm === undefined ? {} : { smeta_hajm_farq: siyrakUstun(n, 'smeta_hajm', x.h.smeta_hajm, indeks, null) }),
    f2: Array.isArray(x.f2) ? x.f2 : [], meta: x.meta ?? {},
  };
}

function raqamUstun(n: number, xom: Record<string, string>, indeks: Map<number, number>): (string | null)[] {
  const out: (string | null)[] = new Array(n).fill(null);
  for (const [k, v] of Object.entries(xom ?? {})) {
    const i = indeks.get(Number(k));
    if (i == null) throw new PaketXato(`paket: raqam, noma'lum id ${k}`);
    out[i] = v == null ? null : String(v);
  }
  return out;
}

/** F2 tayyorlash o'qiydigan `t2_qator_holat` ustunlari (sbQatorHolatOl(F2_HOLAT_USTUNLAR) bilan bir xil qiymatlar). */
export type F2Holat = {
  qator_id: number; smeta_hajm: number | null; smeta_narx: number | null; fakt_hajm: number | null; f2_hajm: number | null;
  f2_mumkin_hajm: number; f2_narx: number | null; almashtirilgan_hajm: number; fakt_manbasi: 'DIRECT' | 'BL_NORMA';
};

/**
 * F2 tayyorlash holati paketdan (qator_id o'sish tartibida, view kabi). Yangi ustunlar yo'q (eski server) — null:
 * chaqiruvchi eski yo'lga qaytadi. Qoidalar view bilan: smeta_hajm = zamena reja hajmi yoki q.hajm; smeta_narx = q.narx;
 * f2_mumkin_hajm = GREATEST(fakt - f2, 0) (NULL fakt -> 0, postgres GREATEST NULL ni tashlaydi); fakt_manbasi bit -> matn.
 */
export function paketdanF2Holatlar(p: Paket): F2Holat[] | null {
  if (!p.f2_narx || !p.smeta_hajm_farq) return null;
  const tartib = Array.from({ length: p.soni }, (_, i) => i).sort((a, b) => p.id[a] - p.id[b]);
  return tartib.map((i) => {
    const fakt = son(p.fakt_hajm, i), f2 = son(p.f2_hajm, i);
    return {
      qator_id: p.id[i],
      smeta_hajm: bormi(p.smeta_hajm_farq!, i) ? son(p.smeta_hajm_farq!, i) : son(p.hajm, i),
      smeta_narx: son(p.narx, i), fakt_hajm: fakt, f2_hajm: f2,
      f2_mumkin_hajm: fakt == null ? 0 : Math.max(fakt - (f2 ?? 0), 0),
      f2_narx: son(p.f2_narx!, i),
      almashtirilgan_hajm: son(p.almashtirilgan_hajm, i) ?? 0,
      fakt_manbasi: p.fakt_manbasi[i] === 1 ? 'BL_NORMA' : 'DIRECT',
    };
  });
}

/** `T2_DARAXT_USTUNLARI` shaklidagi qatorlar (tartib, id bo'yicha — `sbT2DaraxtOl` bilan bir xil). */
export function paketdanQatorlar(p: Paket): T2Qator[] {
  const out: T2Qator[] = new Array(p.soni);
  for (let i = 0; i < p.soni; i++) {
    out[i] = {
      id: p.id[i], obyekt_id: p.obyekt_id, obyekt: p.obyekt_nom,
      ota_id: son(p.ota_id, i), daraja: son(p.daraja, i), tartib: son(p.tartib, i),
      tur: matn(p.tur, i), kod: matn(p.kod, i), nom: matn(p.nom, i), birlik: matn(p.birlik, i),
      hajm: son(p.hajm, i), narx: son(p.narx, i), summa: son(p.summa, i), kat: matn(p.kat, i),
      narx_usul: p.narx_usul[i], qoshimcha: p.qoshimcha[i] === 1, zamena: p.zamena[i] === 1,
      xom_qator: son(p.xom_qator, i), versiya: p.versiya[i], norma: son(p.norma, i),
    } as T2Qator;
  }
  return out;
}

/** `t2_qator_holat` hosila ustunlari (faol qator uchun; ishorali/NULL qoidasi yagona yadrodan). */
export function holatHosila(i: number, p: Paket) {
  const hajm = son(p.hajm, i), summa = son(p.summa, i);
  const faktH = son(p.fakt_hajm, i), faktS = son(p.fakt_summa, i);
  const f2H = son(p.f2_hajm, i), f2S = son(p.f2_summa, i);
  const alH = son(p.almashtirilgan_hajm, i), alS = son(p.almashtirilgan_summa, i);
  return holatHosilalari({ hajm, summa, faktH, faktS, f2H, f2S, alH, alS,
    f2SummaYoq: p.f2_summa_yoq === undefined ? undefined : son(p.f2_summa_yoq, i) });
}

/** `T2_HOLAT_DARAXT_USTUNLARI` shaklidagi holatlar (qator_id bo'yicha o'sish — `sbT2QatorHolatOl` bilan bir xil). */
export function paketdanHolatlar(p: Paket): T2QatorHolat[] {
  const tartib = Array.from({ length: p.soni }, (_, i) => i).sort((a, b) => p.id[a] - p.id[b]);
  return tartib.map((i) => {
    const d = holatHosila(i, p);
    return {
      qator_id: p.id[i], tur: matn(p.tur, i), kod: matn(p.kod, i), nom: matn(p.nom, i), birlik: matn(p.birlik, i), kat: matn(p.kat, i),
      ...(p.f2_summa_yoq === undefined ? {} : { f2_summa_yoq: son(p.f2_summa_yoq, i) }),
      smeta_hajm: d.smeta_hajm, smeta_summa: d.smeta_summa,
      fakt_hajm: son(p.fakt_hajm, i), fakt_summa: son(p.fakt_summa, i), f2_hajm: son(p.f2_hajm, i), f2_summa: son(p.f2_summa, i),
      qoldiq_hajm: d.qoldiq_hajm, qoldiq_summa: d.qoldiq_summa, f2_mumkin_hajm: d.f2_mumkin_hajm, f2_mumkin_summa: d.f2_mumkin_summa,
    } as T2QatorHolat;
  });
}
