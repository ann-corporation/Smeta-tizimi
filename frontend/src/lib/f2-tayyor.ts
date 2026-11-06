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
import { qatorSumma, yaxlit2, yigindi2 } from './hisob-yadro';
import { katKesimYigish, type KatKesim } from './ustamali-summa';
import type { F2NativePayloadRow } from './f2-native-preparation';
import { mashinistMehnati } from './narx-bildirishnoma';
import { qoralamaAlmashtirilgan, type QoralamaQator } from './zamena-qoldiq';

export type F2Holat = { qator_id: number; f2_mumkin_hajm?: number | null; f2_hajm?: number | null; fakt_hajm?: number | null; smeta_hajm?: number | null; f2_narx?: number | null; smeta_narx?: number | null };
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
  /** Smeta hajmi (t2_qator_holat.smeta_hajm ?? t2_qator.hajm); noma'lum — null. */
  smeta?: number | null;
  /** Resurs ishdan CHIQARILGAN (faol «bajarilmaydi» butun smeta hajmini qoplaydi) — F2 ga kirmaydi (lib/resurs-amal). */
  chiqarilgan?: boolean;
  /** Qo'shilgan resurs / zamena qatori; zamena bo'lsa — almashtirgan asl qator id. */
  qoshimcha?: boolean; zamena?: boolean; almashtiradi?: number | null;
  /** `ortiqchaChegir` yoqilgan: tasdiqlangan F2 faktdan ko'p — `mumkin` manfiy (ortiqchani chegirish). */
  ortiqchaF2?: boolean;
  /** Ortiqcha F2 qatorida fakt aynan 0 — butun F2 chegiriladi (operator alohida tekshirsin). */
  faktNol?: boolean;
  /** `smetaNarxda`: shu qatorning oldingi (tasdiqlangan) F2 narxi — eski narx ↔ yangi narx solishtirish uchun; yo'q — null. */
  eskiNarx?: number | null;
  /** `smetaNarxda` va smeta narxi NULL: operator tanlashi mumkin bo'lgan zaxira (oldingi F2 narxi); avtomatik QO'YILMAYDI. */
  zaxiraNarx?: number | null;
};
/** f2Qur qo'shimcha kontekst: chiqarilgan resurslar va zamena → asl bog'lanishi (zamena asl yonida turishi uchun). */
export type F2QurKontekst = {
  chiqarilgan?: ReadonlySet<number>; zamenaAsl?: ReadonlyMap<number, number>;
  /**
   * Pereraschet: tahrirlanayotgan qoralamadagi storno bloki qaytaradigan eski F2 hajmi (qator_id → hajm; `stornoQaytarHajm`).
   * Shu hajm «tasdiqlangan F2» (f2_hajm) dan chiqariladi: stornolanayotgan eski F2 sof 0, yangi hajm = fakt − BOSHQA tasdiqlangan F2.
   */
  stornoQaytar?: ReadonlyMap<number, number>;
  /**
   * Fakt F2 dan kam (egasi 2026-11-05) — IXTIYORIY, sukut o'chiq: F2 faktdan oldinda bo'lishi normal (avans moliyalash),
   * shuning uchun hech qachon avtomatik chegirilmaydi. Yoqilsa (faqat fakt rejimi): fakt ≥ 0 va tasdiqlangan F2 > fakt bo'lgan
   * qatorda qoldiq = fakt − F2 (manfiy) — ortiqcha F2 minus qator bilan chegiriladi. Fakt NULL — qator yo'q (NULL ≠ 0).
   */
  ortiqchaChegir?: boolean;
  /**
   * «Yangi qatorlar smeta narxida» (egasi 2026-11-05, pereraschet): eski F2 arzon material narxida bo'lgan — storno (eski narxda minus)
   * dan keyin yangi hajmlar SMETA narxida olinadi. Taklif narxi: protokol → smeta (oldingi F2 narxi taklif qilinmaydi).
   * Smeta narxi NULL — taklif yo'q (xato NARX, 0 emas); oldingi F2 narxi `zaxiraNarx` da ochiq ko'rsatiladi, operator tanlaydi.
   * Storno qatorlari bunga tegmaydi (o'z eski narxida saqlanadi — lib/f2-storno).
   */
  smetaNarxda?: boolean;
};
export type F2Ish = { id: number; kod: string | null; nom: string; birlik: string | null; mumkin: number; smeta: number | null; olingan: number; resurslar: F2Resurs[]; erkin?: boolean; /** qoralamadagi F2 hajmi (mumkin dan ayirilgan) */ qoralama?: number;
  /** Shu qoralamada storno qilinayotgan eski F2 hajmi (`olingan` dan allaqachon chiqarilgan; ko'rsatish uchun). */
  storno?: number;
  /** `ortiqchaChegir`: tasdiqlangan F2 faktdan ko'p — `mumkin` manfiy (chegirma); fakt aynan 0 bo'lsa `faktNol`. */
  ortiqchaF2?: boolean; faktNol?: boolean };
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

/** Smeta daraxtidagi aka-uka tartibi (YAGONA: f2Qur va storno bloklari shu bilan): `tartib`, keyin id. */
export type DaraxtTugun = { id: number; ota_id?: number | null; tartib?: number | null };
export const daraxtSolishtir = (p: DaraxtTugun, q: DaraxtTugun): number => (p.tartib ?? 0) - (q.tartib ?? 0) || p.id - q.id;

/**
 * Smeta daraxti tartibi: qator id → o'rin (chuqurlik bo'yicha: rz → bl → uning rs/mat/ob → keyingi bl …), f2Qur bilan aynan bir xil.
 * Daraxtda yo'q (ota zanjiri uzilgan) qatorlar kalitsiz qoladi — chaqiruvchi ularni oxirida asl tartibda qoldiradi.
 */
export function smetaDaraxtTartibi(rows: Iterable<DaraxtTugun>): Map<number, number> {
  const bolalar = new Map<number | null, DaraxtTugun[]>();
  for (const r of rows) { const k = r.ota_id ?? null; if (!bolalar.has(k)) bolalar.set(k, []); bolalar.get(k)!.push(r); }
  for (const a of bolalar.values()) a.sort(daraxtSolishtir);
  const out = new Map<number, number>();
  const stek: DaraxtTugun[] = [...(bolalar.get(null) ?? [])].reverse();
  while (stek.length) {
    const r = stek.pop()!;
    if (out.has(r.id)) continue;
    out.set(r.id, out.size);
    for (const b of [...(bolalar.get(r.id) ?? [])].reverse()) stek.push(b);
  }
  return out;
}

/** Elementlarni smeta daraxti tartibida (barqaror); daraxtda yo'qlari oxirida asl tartibda. */
export function daraxtTartibida<T>(items: readonly T[], id: (x: T) => number, tartib: ReadonlyMap<number, number>): T[] {
  return items.map((x, i) => ({ x, i, k: tartib.get(id(x)) })).sort((a, b) => (a.k ?? Infinity) - (b.k ?? Infinity) || a.i - b.i).map((e) => e.x);
}

/**
 * Ishorali qoldiq (chegirma qatori, chegara < 0): chegara − olingan, lekin chegaradan oshmaydi va ishorasi o'zgarmaydi —
 * |F2| ≤ |fakt|, ishorasi bir xil. Masalan fakt −4,6535, olingan 0 → −4,6535; olingan −5 → 0.
 */
export function ishoraliQoldiq(chegara: number, olingan: number): number {
  return Math.min(0, Math.max(chegara, chegara - olingan));
}
/** Nolga teng emas (minus ham F2 ga olinadi). */
/** Chang chegarasi: eski F2 hisobidan qolgan 1e-7 kabi kasr qoldiqlar (egasi 2026-11-06, Amfiteatr) F2 ga taklif qilinmaydi. */
const CHANG = 1e-6;
const nol = (x: number) => Math.abs(x) > CHANG;

/** Smeta daraxti → F2 uchun bo'limlar/ishlar/resurslar (faqat F2 olish mumkin bo'lganlar). */
export function f2Qur(rows: T2Qator[], holat: F2Holat[], protokol?: ProtokolNarxlari, manba: F2Manba = 'fakt', qoralama?: ReadonlyMap<number, number>, ktx?: F2QurKontekst): F2Bolim[] {
  const h = new Map(holat.map((x) => [x.qator_id, x]));
  const chiq = (id: number) => ktx?.chiqarilgan?.has(id) === true;
  const erkin = manba === 'smeta';
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const bolalar = new Map<number | null, T2Qator[]>();
  for (const r of rows) { const k = r.ota_id ?? null; if (!bolalar.has(k)) bolalar.set(k, []); bolalar.get(k)!.push(r); }
  for (const a of bolalar.values()) a.sort(daraxtSolishtir);
  /** Shu qoralamadagi storno qaytaradigan eski F2 hajmi (0 — storno yo'q). */
  const sq = (id: number) => ktx?.stornoQaytar?.get(id) ?? 0;
  /** Tasdiqlangan F2 hajmi, shu qoralamada stornolanayotgan eski F2 chiqarilgan holda (= BOSHQA tasdiqlangan F2 lar). */
  const olinganF2 = (id: number) => (son(h.get(id)?.f2_hajm) ?? 0) - sq(id);
  /** Ortiqcha F2 (ixtiyoriy, faqat fakt rejimi): fakt ≥ 0 va F2 > fakt → fakt − F2 (manfiy; |…| ≤ F2 o'z-o'zidan); aks holda null. */
  const ortiqcha = (id: number): number | null => {
    if (!ktx?.ortiqchaChegir || erkin) return null;
    const f = son(h.get(id)?.fakt_hajm);
    if (f == null || f < 0) return null;
    const o = olinganF2(id);
    return o > f + 1e-6 ? y6(f - o) : null;
  };
  // Faktsiz rejim: smeta hajmi − shu qatorning barcha F2 lari (RPC o'zgarmaydi: smeta_hajm/f2_hajm bor).
  const faktBaza = (id: number) => {
    const s0 = sq(id);
    const mum = son(h.get(id)?.f2_mumkin_hajm);
    // CHEGIRMA (egasi 2026-11-05): manfiy fakt (qalinlik/istisno tuzatish) — manfiy F2 qatori; server f2_mumkin (>= 0) uni 0 qiladi.
    const faktM = son(h.get(id)?.fakt_hajm);
    if (faktM != null && faktM < 0) return ishoraliQoldiq(faktM, olinganF2(id));
    const orq = ortiqcha(id);
    if (orq != null) return orq;
    if (s0 === 0) return Math.max(0, mum ?? 0);
    // Storno bor: server f2_mumkin (= max(0, fakt − f2)) eski F2 ni ham ayirgan — fakt va f2 dan qayta: fakt − (f2 − storno).
    const fakt = son(h.get(id)?.fakt_hajm);
    return Math.max(0, fakt != null ? fakt - olinganF2(id) : (mum ?? 0) + s0);
  };
  const baza = (id: number) => {
    if (!erkin) return faktBaza(id);
    const sm = son(h.get(id)?.smeta_hajm) ?? son(rowById.get(id)?.hajm) ?? 0;
    return sm < 0 ? ishoraliQoldiq(sm, olinganF2(id)) : Math.max(0, sm - olinganF2(id));
  };
  // Qoralamadagi (tasdiqlanmagan) F2 hajmi qoldiqdan AYIRILADI - bir ishni ikki marta F2 qilish xavfi bo'lmasin.
  const qor = (id: number) => Math.max(0, qoralama?.get(id) ?? 0);
  /** Manfiy (chegirma) qoldiqda qoralamadagi manfiy hajm ayiriladi, ishora o'zgarmaydi. */
  const mumkin = (id: number) => { const m = mumkinXom(id); return Math.abs(m) < CHANG ? 0 : y6(m); };
  const mumkinXom = (id: number) => {
    const b0 = baza(id);
    // Ortiqcha F2 chegirmasi: qoralamadagi hajm ishorasidan qat'i nazar ayiriladi (sof F2 = fakt); natija ≤ 0, ishora o'zgarmaydi.
    if (b0 < 0 && ortiqcha(id) != null) return Math.min(0, y6(b0 - (qoralama?.get(id) ?? 0)));
    return b0 < 0 ? Math.min(0, b0 - Math.min(0, qoralama?.get(id) ?? 0)) : Math.max(0, b0 - qor(id)); };
  const smetaHajm = (id: number) => son(h.get(id)?.smeta_hajm) ?? son(rowById.get(id)?.hajm);
  /** Ortiqcha F2 belgilari (UI: «F2 faktdan ko'p — chegirma»). */
  const ortiqchaBelgi = (id: number): { ortiqchaF2?: true; faktNol?: true } =>
    ortiqcha(id) == null ? {} : { ortiqchaF2: true, ...(son(h.get(id)?.fakt_hajm) === 0 ? { faktNol: true as const } : {}) };
  const resurs = (r: T2Qator, avto: boolean): F2Resurs => {
    const p = protokol?.get(r.id);
    const f2Narx = son(h.get(r.id)?.f2_narx);
    const smetaNarx = son(r.narx) ?? (ktx?.smetaNarxda ? son(h.get(r.id)?.smeta_narx) : null);
    // Smeta narxida: oldingi F2 narxi taklif zanjiridan chiqariladi (null beriladi), lekin eski/zaxira sifatida ko'rinadi.
    const t = narxTaklif(ktx?.smetaNarxda ? null : f2Narx, smetaNarx, p?.narx);
    const x: F2Resurs = { id: r.id, tur: r.tur as F2Resurs['tur'], kat: r.kat, kod: r.kod, nom: r.nom || 'Nomsiz', birlik: r.birlik, norma: son((r as T2Qator & { norma?: number | null }).norma), mumkin: mumkin(r.id), avto, taklifNarx: t.narx, taklifManba: t.manba, ...(erkin ? { erkin: true } : {}), ...(qor(r.id) > 0 ? { qoralama: qor(r.id) } : {}), ...ortiqchaBelgi(r.id) };
    if (p && t.manba === 'protokol') x.protokol = `№ ${p.raqam} от ${p.sana.slice(0, 10).split('-').reverse().join('.')}`;
    if (ktx?.smetaNarxda) {
      x.eskiNarx = f2Narx != null && f2Narx > 0 ? y6(f2Narx) : null;
      if (t.narx == null) x.zaxiraNarx = x.eskiNarx;
    }
    if (ktx) {
      x.smeta = smetaHajm(r.id);
      if (r.zamena) { x.zamena = true; x.almashtiradi = ktx.zamenaAsl?.get(r.id) ?? null; } else if (r.qoshimcha) x.qoshimcha = true;
      // Chiqarilgan resurs ko'rinadi (belgi bilan), lekin F2 ga olinmaydi: mumkin = 0, f2Qatorlar uni tashlaydi.
      if (chiq(r.id)) { x.chiqarilgan = true; x.mumkin = 0; }
    }
    return x;
  };
  /** Zamena o'z asl resursidan keyin turadi (asl o'rnida ko'rinadi); qolgan tartib o'zgarmaydi. */
  const zamenaYonida = (arr: F2Resurs[]): F2Resurs[] => {
    if (!ktx?.zamenaAsl?.size) return arr;
    const ids = new Set(arr.map((x) => x.id));
    const ergash = new Map<number, F2Resurs[]>();
    for (const x of arr) if (x.almashtiradi != null && x.almashtiradi !== x.id && ids.has(x.almashtiradi)) ergash.set(x.almashtiradi, [...(ergash.get(x.almashtiradi) ?? []), x]);
    if (!ergash.size) return arr;
    const out: F2Resurs[] = []; const qoyildi = new Set<number>();
    const qoy = (x: F2Resurs) => { if (qoyildi.has(x.id)) return; qoyildi.add(x.id); out.push(x); for (const z of ergash.get(x.id) ?? []) qoy(z); };
    for (const x of arr) if (!(x.almashtiradi != null && ids.has(x.almashtiradi) && x.almashtiradi !== x.id)) qoy(x);
    for (const x of arr) qoy(x);
    return out;
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
        const res = zamenaYonida((bolalar.get(r.id) ?? []).filter((x) => x.tur === 'rs' || x.tur === 'mat' || x.tur === 'ob').map((x) => resurs(x, x.tur === 'rs')));
        const hh = h.get(r.id);
        const ish: F2Ish = { id: r.id, kod: r.kod, nom: r.nom || 'Nomsiz', birlik: r.birlik, mumkin: mumkin(r.id), smeta: son(hh?.smeta_hajm) ?? son(r.hajm), olingan: olinganF2(r.id), resurslar: res, ...(erkin ? { erkin: true } : {}), ...(sq(r.id) !== 0 ? { storno: sq(r.id) } : {}), ...(qor(r.id) > 0 ? { qoralama: qor(r.id) } : {}), ...ortiqchaBelgi(r.id) };
        // Fakt rejimida qoralama qoldiqni 0 ga tushirsa ham ish ro'yxatda qoladi (tasdiqlangan va qoralama alohida ko'rinsin).
        if (erkin ? (smetaHajm(r.id) ?? 0) !== 0 : (nol(baza(r.id)) || res.some((x) => !x.avto && !x.chiqarilgan && nol(baza(x.id))))) b.ishlar.push(ish);
      } else if (r.tur === 'mat' || r.tur === 'ob') {
        const x = resurs(r, false); if (!x.chiqarilgan && (erkin ? (smetaHajm(r.id) ?? 0) !== 0 : nol(baza(r.id)))) b.alohida.push(x);
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
  // Chegirma (manfiy qoldiq): undan «ko'proq manfiy» yoki ishorasi teskari bo'lsa — oshdi.
  if (x.mumkin < -1e-9) return v >= x.mumkin - 1e-9 && v <= 1e-9 ? undefined : (x.erkin ? 'SMETADAN_OSHDI' : 'QOLDIQDAN_OSHDI');
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
  const avtoAxborot = k.narxsiz[r.id] == null && qolNarx == null && r.taklifNarx == null && (axborotResursmi(r.nom) || mashinistMehnati({ nom: r.nom }));
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
    if (r.chiqarilgan) return; // ishdan chiqarilgan resurs F2 ga kirmaydi
    const v = sonOqi(k.hajm[r.id]);
    if (v == null) return;
    /* Egasi: minus hajm ham mumkin — faqat aynan 0 yoki son bo'lmagan kiritma xato. */
    if (v === 'xato' || v === 0) { out.push({ id: r.id, ishId, tur: r.tur, kat: r.kat, nom: r.nom, birlik: r.birlik, hajm: 0, narx: null, summa: null, manba: 'yoq', narxsiz: false, xato: 'HAJM' }); return; }
    const q = resursQator(r, v, ishId, k);
    if (!q.ogoh) q.ogoh = oshOgoh(v, r); // blok emas, ogohlantirish
    out.push(q);
  };
  for (const b of bolimlar) {
    for (const ish of b.ishlar) {
      const v = sonOqi(k.hajm[ish.id]);
      if (v != null) {
        if (v === 'xato' || v === 0) out.push({ id: ish.id, ishId: null, tur: 'bl', kat: null, nom: ish.nom, birlik: ish.birlik, hajm: 0, narx: null, summa: null, manba: 'yoq', narxsiz: true, xato: 'HAJM' });
        else {
          const bl: F2Qator = { id: ish.id, ishId: null, tur: 'bl', kat: null, nom: ish.nom, birlik: ish.birlik, hajm: v, narx: null, summa: null, manba: 'yoq', narxsiz: true };
          if (ish.smeta != null && (ish.smeta < 0 ? ish.olingan + v < ish.smeta - 1e-9 : ish.olingan + (ish.qoralama ?? 0) + v > ish.smeta + 1e-9)) bl.ogoh = 'SMETADAN_OSHDI';
          else bl.ogoh = oshOgoh(v, ish);
          out.push(bl);
          // Ish hajmi qoldiqdan oshgan bo'lsa (ongli) - resurslar normadan to'liq; aks holda fakt qoldig'i bilan cheklanadi.
          const ustida = ish.mumkin < 0 ? v < ish.mumkin - 1e-9 : v > ish.mumkin + 1e-9;
          const minus = v < 0; // minus ish: resurslari ham minus (norma bo'yicha), qoldiqqa bog'lanmaydi
          for (const r of ish.resurslar) {
            if (!r.avto || r.chiqarilgan || r.norma == null || r.norma <= 0 || (!minus && r.mumkin + (r.qoralama ?? 0) <= 0 && !r.erkin)) continue;
            const talab = y6(v * r.norma);
            const hajm = r.erkin || ustida || minus ? talab : Math.min(talab, r.mumkin);
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

/**
 * Zamena qoldig'i F2 tayyorlashda (egasi 2026-10-27: «asl resurs hajmi zamena hajmiga qarab yopiladi»).
 * Yagona formula — `qoralamaAlmashtirilgan` (lib/zamena-qoldiq; SQL t2_almashtirilgan_hajm bilan bir xil):
 * birlik bir xil → 1:1; `almashtirish_hajm` bo'lsa → proporsional; aks holda zamenaning bajarilgan ulushida.
 * Shu F2 dagi zamena hajmi aslning F2 hajmidan AYIRILADI (aks holda asl va zamena ikki marta olinadi);
 * asl to'liq yopilsa — F2 ga kirmaydi, zamena uning o'rnida turadi. Asl smeta qatori o'zgarmaydi; pul to'qilmaydi.
 */
export type F2ZamenaKontekst = {
  /** Smeta qatorlari: id, ota_id, tur, birlik, hajm (= smeta hajmi). */
  rows: readonly QoralamaQator[];
  /** zamena qator id → asl qator id (t2_qator.replaces_line_id). */
  zamenaAsl: ReadonlyMap<number, number>;
  /** zamena qator id → almashtirish_hajm (aslning birligida); yo'q bo'lsa kalit yo'q. */
  miqdor: ReadonlyMap<number, number>;
  /** qator id → tasdiqlangan F2 hajmi. */
  oldingi: ReadonlyMap<number, number>;
  /** asl qator id → serverdagi almashtirilgan hajm (t2_qator_holat.almashtirilgan_hajm). */
  serverAlm: ReadonlyMap<number, number>;
};
export type F2ZamenaNatija = { qatorlar: F2Qator[]; /** asl qator id → shu F2 da zamena yopgan hajm */ yopildi: Map<number, number>; /** to'liq yopilib F2 dan tushgan asl qatorlar */ tashlandi: Set<number> };

export function f2ZamenaQolla(q: F2Qator[], bolimlar: readonly F2Bolim[], k: F2Kiritma, z?: F2ZamenaKontekst | null): F2ZamenaNatija {
  const bosh: F2ZamenaNatija = { qatorlar: q, yopildi: new Map(), tashlandi: new Set() };
  if (!z || !z.zamenaAsl.size) return bosh;
  const shu = new Map<number, number>();
  for (const x of q) if (!x.xato && x.hajm > 0 && z.zamenaAsl.has(x.id)) shu.set(x.id, (shu.get(x.id) ?? 0) + x.hajm);
  if (!shu.size) return bosh;
  const d = qoralamaAlmashtirilgan(z.rows, z.zamenaAsl, z.miqdor, z.oldingi, shu, z.serverAlm);
  if (!d.size) return bosh;
  const resById = new Map<number, F2Resurs>();
  for (const b of bolimlar) { for (const i of b.ishlar) for (const r of i.resurslar) resById.set(r.id, r); for (const r of b.alohida) resById.set(r.id, r); }
  const out: F2Qator[] = []; const yopildi = new Map<number, number>(); const tashlandi = new Set<number>();
  for (const x of q) {
    const y = d.get(x.id);
    const r = x.tur === 'bl' ? null : resById.get(x.id);
    if (y == null || y <= 1e-9 || x.xato || x.hajm <= 0 || (x.tur !== 'bl' && !r)) { out.push(x); continue; }
    const qoldi = y6(x.hajm - y);
    yopildi.set(x.id, y6(Math.min(y, x.hajm)));
    if (qoldi <= 1e-9) { tashlandi.add(x.id); continue; }
    if (x.tur === 'bl') { out.push({ ...x, hajm: qoldi }); continue; }
    const n = resursQator(r!, qoldi, x.ishId, k);
    if (!n.ogoh && x.ogoh && x.ogoh !== 'RESURS_CHEGARA') n.ogoh = x.ogoh;
    out.push(n);
  }
  return { qatorlar: out, yopildi, tashlandi };
}

export type F2Jami = { ish: number; qator: number; xato: number; ogoh: number; narxsiz: number; summa: number; kat: Record<string, number>; manba: Record<NarxManba, number> };

export function f2Jami(q: F2Qator[]): F2Jami {
  const j: F2Jami = { ish: 0, qator: q.length, xato: 0, ogoh: 0, narxsiz: 0, summa: 0, kat: {}, manba: { protokol: 0, oldingi_f2: 0, smeta: 0, qolda: 0, yoq: 0 } };
  for (const x of q) {
    if (x.tur === 'bl') j.ish++;
    if (x.xato) j.xato++;
    // Mashinistlar mehnati (narxi mashina narxi ichida) - ma'lumot qatori: ogohlantirish va narx-asosi-yo'q hisobiga kirmaydi.
    const mashinist = x.tur !== 'bl' && x.ogoh === 'AXBOROT_NARXSIZ' && mashinistMehnati({ nom: x.nom });
    if (x.ogoh && !mashinist) j.ogoh++;
    if (x.tur !== 'bl') { j.manba[x.manba]++; if (x.narxsiz && !mashinist) j.narxsiz++; }
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
    if (!r.avto || r.chiqarilgan || r.norma == null || r.norma <= 0) continue;
    if (r.taklifNarx == null) { if (!mashinistMehnati({ nom: r.nom })) narxsiz++; } else summa += r.norma * r.taklifNarx;
  }
  return { summa: pulYaxlit(summa), narxsiz };
}

/**
 * «Fakt F2 dan kam» xulosasi (`ortiqchaChegir: true` bilan qurilgan bo'limlardan): nechta qatorda F2 faktdan ko'p va
 * to'liq chegirilsa taxminiy summa (ustamasiz, NDS siz; manfiy). Ish — mumkin × 1 birlik narxi (avto resurslar), mat/ob — mumkin × taklif narx.
 * Narxi noma'lum qatorlar summaga 0 deb QO'SHILMAYDI — `nomalum` da sanaladi.
 */
export function ortiqchaXulosa(bolimlar: readonly F2Bolim[]): { soni: number; faktNol: number; summa: number; nomalum: number } {
  let soni = 0; let faktNol = 0; let summa = 0; let nomalum = 0;
  const resurs = (r: F2Resurs) => {
    if (!r.ortiqchaF2 || r.chiqarilgan || r.avto) return;
    soni++; if (r.faktNol) faktNol++;
    if (r.taklifNarx == null) nomalum++; else summa += r.mumkin * r.taklifNarx;
  };
  for (const b of bolimlar) {
    for (const i of b.ishlar) {
      if (i.ortiqchaF2) {
        soni++; if (i.faktNol) faktNol++;
        const bn = ishBirlikNarxi(i);
        if (bn.narxsiz > 0) nomalum++;
        summa += i.mumkin * bn.summa;
      }
      for (const r of i.resurslar) resurs(r);
    }
    for (const r of b.alohida) resurs(r);
  }
  return { soni, faktNol, summa: pulYaxlit(summa), nomalum };
}

/**
 * «Yangi qatorlar smeta narxida» xulosasi (pereraschet): storno jami (eski narxda, minus), yangi qatorlar jami (smeta narxida),
 * farq = yangi + storno (egasi: narx farqi ataylab — pul 0 bo'lishi shart emas). Eski narx ma'lum yangi qatorlar uchun
 * «eski narxda bo'lganida» summasi va narx farqi alohida. Narxi noma'lum qatorlar summaga 0 deb QO'SHILMAYDI — `smetaNarxsiz`.
 * Pul faqat yadro (`qatorSumma`, `yigindi2`).
 */
export type SmetaNarxXulosa = { storno: number; yangi: number; farq: number; eskiNarxda: number; yangiSolishtirma: number; narxFarqi: number; solishtirildi: number; smetaNarxsiz: number };
export function smetaNarxXulosa(qatorlar: readonly F2Qator[], bolimlar: readonly F2Bolim[], stornoJami: number): SmetaNarxXulosa {
  const res = new Map<number, F2Resurs>();
  for (const b of bolimlar) { for (const i of b.ishlar) for (const r of i.resurslar) res.set(r.id, r); for (const r of b.alohida) res.set(r.id, r); }
  const yangiS: number[] = []; const eskiS: number[] = []; const solS: number[] = []; let smetaNarxsiz = 0;
  for (const q of qatorlar) {
    if (q.tur === 'bl' || (q.xato != null && q.xato !== 'NARX')) continue;
    const r = res.get(q.id);
    if (q.summa != null) yangiS.push(q.summa);
    if (r && r.zaxiraNarx !== undefined && q.manba !== 'qolda' && !q.narxsiz && q.summa == null) smetaNarxsiz++;
    const eski = r?.eskiNarx;
    if (eski != null && q.summa != null) { const s = qatorSumma(q.hajm, eski); if (s != null) { eskiS.push(s); solS.push(q.summa); } }
  }
  const yangi = yigindi2(yangiS); const storno = yaxlit2(stornoJami);
  const eskiNarxda = yigindi2(eskiS); const yangiSolishtirma = yigindi2(solS);
  return { storno, yangi, farq: yigindi2([yangi, storno]), eskiNarxda, yangiSolishtirma, narxFarqi: yigindi2([yangiSolishtirma, -eskiNarxda]), solishtirildi: eskiS.length, smetaNarxsiz };
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

/** Pul bo'yicha chang chegarasi (egasi 2026-11-06): «Barcha / bo'limni to'liq olish» bundan kichik qiymatli ishni olmaydi. */
export const F2_CHANG_PUL = 1000;
/**
 * Ish qolgan qiymati (ustamasiz, taxmin): avtomatik resurslar (ish mumkin × norma × narx) + ichidagi mustaqil materiallar
 * (mumkin × narx). Resurs ishdan sug'urib olinmaydi — qaror BUTUN ish uchun. Biror pulli qism narxi noma'lum → null
 * (qiymati noma'lum: pul bo'yicha tashlanmaydi, NULL ≠ 0). Mashinist mehnati (smetada narxsiz) hisobga olinmaydi.
 */
export function ishQoldiqQiymati(i: Pick<F2Ish, 'mumkin' | 'resurslar'>): number | null {
  let s = 0;
  for (const r of i.resurslar) {
    if (r.chiqarilgan) continue;
    const h = r.avto ? (r.norma == null ? null : i.mumkin * r.norma) : r.mumkin;
    if (h == null || Math.abs(h) < 1e-9) continue;
    if (r.taklifNarx == null) { if (mashinistMehnati(r)) continue; return null; }
    s += h * r.taklifNarx;
  }
  return s;
}
/** Mustaqil material/jihoz qolgan qiymati: narx noma'lum → null. */
export function resursQoldiqQiymati(r: Pick<F2Resurs, 'mumkin' | 'taklifNarx'>): number | null {
  return r.taklifNarx == null ? null : r.mumkin * r.taklifNarx;
}
/** Pul changi: qiymati ma'lum va |qiymat| < chegara. Noma'lum qiymat chang emas. */
export function pulChangmi(qiymat: number | null, chegara = F2_CHANG_PUL): boolean {
  return qiymat != null && Math.abs(qiymat) < chegara;
}
/** Boʻlimdagi mumkin hajmlarni qoʻshadi, avvalgi kiritmalarni saqlaydi. */
export function f2MumkinHajmlarniOl(bolimlar: readonly F2Bolim[], k: F2Kiritma): F2Kiritma {
  const hajm = { ...k.hajm };
  for (const b of bolimlar) {
    for (const i of b.ishlar) {
      if (pulChangmi(ishQoldiqQiymati(i))) continue;
      if (i.mumkin !== 0) hajm[i.id] = String(i.mumkin);
      for (const r of i.resurslar) {
        if (!r.avto && r.mumkin !== 0) hajm[r.id] = String(r.mumkin);
      }
    }
    for (const r of b.alohida) {
      if (r.mumkin !== 0 && !pulChangmi(resursQoldiqQiymati(r))) hajm[r.id] = String(r.mumkin);
    }
  }
  return { ...k, hajm };
}
