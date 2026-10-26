/**
 * QAMROV BO'YICHA % — «Tiklash rejimi» (tadqiqot 02, §3.2 A va §3.8; egasi 2026-10-25: «Sun'iy ko'lda ko'p ish
 * bajarilgan, lekin faktda yo'q — qatorma-qator kiritish imkonsiz»).
 *
 * Qamrov (bo'lim + barcha avlodlari yoki bitta ish) → bitta foiz → har ish / alohida material-uskuna (ixtiyoriy:
 * ish ichidagi mat/ob ham) uchun fakt TAKLIFI: hajm = foiz × OCHIQ qoldiq (yagona `ochiqQoldiq` formulasi,
 * JurnalQator.qoldiq). Mehnat/mashina (rs) server tomonda normadan ergashadi — alohida yozilmaydi.
 *
 * Istisnolar faqat BELGILANADI (avtomatik tashlanmaydi): allaqachon faktli, zamenalangan (asl), zamena qatori,
 * bajarilmaydi, narxsiz, chegirma (manfiy smeta — asosiy ish bilan bir xil foizda olinadi). Egasi oldindan
 * ko'rishda keraksizini olib tashlaydi, so'ng BITTA fakt_yoz_v2 tranzaksiyasi (juda katta qamrov — bo'laklarga).
 * Asl smeta o'zgarmaydi; pul to'qilmaydi (narx NULL → summa NULL, «narxsiz» sanaladi); hajm bloklanmaydi.
 */
import { sbT2AktBekor } from '../api/supabase';
import { bajarilmadiRoyxatOl } from '../api/t2-bajarilmadi';
import { bajarilmadiHajmlar } from './fakt-studio';
import { bosKatKesim, katKesimgaQosh, type KatKesim } from './ustamali-summa';
import type { JurnalHolat, JurnalIsh, JurnalQator } from './fakt-jurnal';

export type QamrovIstisno = 'faktli' | 'zamenalangan' | 'zamena' | 'bajarilmaydi' | 'narxsiz' | 'chegirma';
export const QAMROV_ISTISNOLAR: readonly QamrovIstisno[] = ['faktli', 'zamenalangan', 'zamena', 'bajarilmaydi', 'narxsiz', 'chegirma'];

export type QamrovQator = {
  id: number; tur: JurnalQator['tur']; kod: string | null; nom: string; birlik: string | null;
  /** Ish ichidagi resurs bo'lsa — ota ish id (ish olib tashlansa, u ham tushadi). */
  otaIshId: number | null;
  smeta: number | null; fakt: number; ochiq: number;
  /** Fakt deltasi ("+" rejimi): foiz × ochiq qoldiq. */
  hajm: number;
  /** Ustamasiz summa (NDS siz); narx noma'lum bo'lsa null. */
  summa: number | null; kesim: KatKesim;
  istisnolar: QamrovIstisno[];
};

export type QamrovReja = {
  foiz: number;
  qatorlar: QamrovQator[];
  /** Ochiq qoldig'i yo'q (allaqachon yopilgan / to'liq bajarilmaydi) — yoziladigan narsa yo'q. */
  yopiq: number;
  /** Smetasi noma'lum (NULL) — foiz hisoblanmaydi. */
  smetasiz: number;
  /**
   * Smetadan (ochiq qoldiqdan) OSHGAN qatorlar — foiz/100% ularni HECH QACHON kamaytirmaydi (JQA-03: 120 → 100 yo'q).
   * hajm — faqat alohida «Tuzatish» amali uchun taklif (ochiq qoldiqni 0 ga keltiradigan manfiy delta); avtomatik yozilmaydi.
   */
  oshganlar: QamrovQator[];
};

export type QamrovOpsiya = {
  /** Ish ichidagi mat/ob resurslari ham shu foizda olinsinmi (standart: ha). */
  ichkiResurslar?: boolean;
  /** Resurs birlik narxi (NDS siz); noma'lum bo'lsa null. Berilmasa holat.smeta_narx. */
  narxOl?: (id: number) => number | null;
};

const son = (v: unknown): number | null => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const yaxlit = (x: number) => Math.round(x * 1e6) / 1e6;

/**
 * Qamrov snapshotini JORIY holat bilan yangilash (JQA-09): oyna ochilgandan keyin fakt yozilgan bo'lsa (holat
 * yangilangan), ochiq qoldiq fakt farqiga kamayadi (zamena/bajarilmaydi qismi o'zgarmaydi). Holati yo'q qator — o'zgarishsiz.
 */
export function ishlarniYangila(ishlar: readonly JurnalIsh[], holat: ReadonlyMap<number, JurnalHolat>): JurnalIsh[] {
  const q1 = <T extends JurnalQator>(q: T): T => {
    const f = son(holat.get(q.id)?.fakt_hajm);
    if (f == null || Math.abs(f - q.fakt) < 1e-9) return q;
    return { ...q, fakt: f, qoldiq: q.qoldiq == null ? null : yaxlit(q.qoldiq - (f - q.fakt)) };
  };
  return ishlar.map((ish) => ({ ...q1(ish), resurslar: ish.resurslar.map(q1) }));
}

/**
 * Markirovka (t2_qator.kat) bo'yicha qamrov (Daraxt «Markirovka bo'yicha 100%», JQA-03): shu kat'li ishlar (faqat shu kat'li
 * ichki resurslari bilan) va kat'i mos, lekin ishi mos bo'lmagan resurslar — alohida qator sifatida. Qatorma-qator
 * `fakt_belgila_v2` o'rniga bitta qamrov tranzaksiyasi: oshgan fakt hech qachon kamaytirilmaydi.
 */
export function markirovkaIshlari(bolimIshlari: ReadonlyMap<number, readonly JurnalIsh[]>, marker: string, ildizIshlari: readonly JurnalIsh[] = []): JurnalIsh[] {
  const m = marker.trim();
  const mos = (q: JurnalQator) => (q.kat ?? '').trim() === m;
  const out: JurnalIsh[] = []; const bor = new Set<number>();
  const qosh = (x: JurnalIsh) => { if (!bor.has(x.id)) { bor.add(x.id); out.push(x); } };
  for (const ishlar of [...bolimIshlari.values(), ildizIshlari]) for (const ish of ishlar) {
    if (ish.tur !== 'bl') { if (mos(ish)) qosh(ish); continue; }
    const ichki = ish.resurslar.filter(mos);
    if (mos(ish)) qosh({ ...ish, resurslar: ichki });
    else for (const r of ichki) qosh({ ...r, resurslar: [], avtomatik: [] });
  }
  return out;
}

/** Qamrov rejasi (sof): yozilmaydi, faqat hisoblanadi. `ishlar` — qamrovdagi jurnal ishlari (bo'lim avlodlari bilan). */
export function qamrovReja(ishlar: readonly JurnalIsh[], foiz: number, holat: ReadonlyMap<number, JurnalHolat>, op: QamrovOpsiya = {}): QamrovReja {
  const ichki = op.ichkiResurslar ?? true;
  const narxOl = op.narxOl ?? ((id: number) => son(holat.get(id)?.smeta_narx));
  const out: QamrovQator[] = []; const oshganlar: QamrovQator[] = [];
  let yopiq = 0, smetasiz = 0;
  const korildi = new Set<number>();
  const f = Number.isFinite(foiz) ? foiz : 0;

  const qosh = (q: JurnalQator, otaIshId: number | null, summaHisob: (hajm: number) => { summa: number | null; kesim: KatKesim; narxsiz: boolean }) => {
    if (korildi.has(q.id)) return;
    korildi.add(q.id);
    if (q.smeta == null || q.qoldiq == null) { smetasiz += 1; return; }
    const ochiqBor = q.smeta < 0 ? q.qoldiq < -1e-9 : q.qoldiq > 1e-9;
    if (!ochiqBor) {
      if (Math.abs(q.qoldiq) > 1e-9) { // oshgan: o'zgarmaydi, faqat tuzatish taklifi
        const hajm = yaxlit(q.qoldiq); const s = summaHisob(hajm);
        oshganlar.push({ id: q.id, tur: q.tur, kod: q.kod, nom: q.nom, birlik: q.birlik, otaIshId, smeta: q.smeta, fakt: q.fakt, ochiq: q.qoldiq, hajm, summa: s.summa, kesim: s.kesim, istisnolar: s.narxsiz ? ['narxsiz'] : [] });
      } else yopiq += 1;
      return;
    }
    const hajm = yaxlit(q.qoldiq * f / 100);
    if (Math.abs(hajm) < 1e-9) return;
    const s = summaHisob(hajm);
    const istisnolar: QamrovIstisno[] = [];
    if (Math.abs(q.fakt) > 1e-9) istisnolar.push('faktli');
    if ((q.almashtirilgan ?? 0) > 0) istisnolar.push('zamenalangan');
    if (q.zamena) istisnolar.push('zamena');
    if ((q.bajarilmaydi ?? 0) > 0) istisnolar.push('bajarilmaydi');
    if (s.narxsiz) istisnolar.push('narxsiz');
    if (q.smeta < 0) istisnolar.push('chegirma');
    out.push({ id: q.id, tur: q.tur, kod: q.kod, nom: q.nom, birlik: q.birlik, otaIshId, smeta: q.smeta, fakt: q.fakt, ochiq: q.qoldiq, hajm, summa: s.summa, kesim: s.kesim, istisnolar });
  };

  /** Resurs (mat/ob): hajm × narx; narx noma'lum — summa NULL. */
  const resursSumma = (q: JurnalQator) => (hajm: number) => {
    const kesim = bosKatKesim(); const narx = narxOl(q.id);
    if (narx == null) { katKesimgaQosh(kesim, q.kat, null); return { summa: null, kesim, narxsiz: true }; }
    const summa = yaxlit(hajm * narx); katKesimgaQosh(kesim, q.kat, summa);
    return { summa, kesim, narxsiz: false };
  };
  /** Ish (bl): o'z narxi yo'q — ergashadigan rs qatorlari smeta summasining ish ulushi (mat/ob alohida qator bo'lib sanaladi). */
  const ishSumma = (ish: JurnalIsh) => (hajm: number) => {
    const kesim = bosKatKesim(); let summa: number | null = null; let narxsiz = false;
    const ulush = ish.smeta ? hajm / ish.smeta : 0;
    for (const r of ish.avtomatik) {
      const ss = son(holat.get(r.id)?.smeta_summa);
      if (ss == null) { narxsiz = true; katKesimgaQosh(kesim, r.kat, null); continue; }
      const v = yaxlit(ss * ulush); katKesimgaQosh(kesim, r.kat, v); summa = (summa ?? 0) + v;
    }
    if (!ish.avtomatik.length) summa = 0; // qiymati materiallarda (alohida qator) — summa 0 to'qilma emas, ish o'zi pul olib kelmaydi
    return { summa: summa == null ? null : yaxlit(summa), kesim, narxsiz };
  };

  for (const ish of ishlar) {
    if (ish.tur === 'bl') {
      qosh(ish, null, ishSumma(ish));
      if (ichki) for (const r of ish.resurslar) qosh(r, ish.id, resursSumma(r));
    } else if (ish.tur === 'mat' || ish.tur === 'ob') qosh(ish, null, resursSumma(ish));
  }
  return { foiz: f, qatorlar: out, yopiq, smetasiz, oshganlar };
}

export type QamrovJami = {
  paket: { qator_id: number; hajm: number }[];
  ustamasiz: number | null; kesim: KatKesim; narxsiz: number;
  /** Istisno turi → (tanlanganlar ichida) soni. */
  istisnoSoni: Record<QamrovIstisno, number>;
};

function kesimQosh(a: KatKesim, b: KatKesim) {
  for (const [k, v] of Object.entries(b.summalar) as [keyof KatKesim['summalar'], number][]) a.summalar[k] = (a.summalar[k] ?? 0) + v;
  a.nomalum += b.nomalum; a.nomalumSoni += b.nomalumSoni; a.summasizSoni += b.summasizSoni;
}

/** Olib tashlanganlardan keyingi paket va jamilar. Ish olib tashlansa — uning ichki resurslari ham tushadi. */
export function qamrovJami(reja: QamrovReja, chiqarilgan: ReadonlySet<number>): QamrovJami {
  const paket: QamrovJami['paket'] = [];
  const kesim = bosKatKesim(); let ustamasiz: number | null = null; let narxsiz = 0;
  const istisnoSoni = Object.fromEntries(QAMROV_ISTISNOLAR.map((k) => [k, 0])) as Record<QamrovIstisno, number>;
  for (const q of reja.qatorlar) {
    if (chiqarilgan.has(q.id) || (q.otaIshId != null && chiqarilgan.has(q.otaIshId))) continue;
    paket.push({ qator_id: q.id, hajm: q.hajm });
    for (const i of q.istisnolar) istisnoSoni[i] += 1;
    if (q.istisnolar.includes('narxsiz')) narxsiz += 1;
    if (q.summa != null) ustamasiz = (ustamasiz ?? 0) + q.summa;
    kesimQosh(kesim, q.kesim);
  }
  return { paket, ustamasiz: ustamasiz == null ? null : yaxlit(ustamasiz), kesim, narxsiz, istisnoSoni };
}

/** Bitta fakt hujjatiga sig'adigan qatorlar (undan katta qamrov — bir nechta hujjat, har biri o'z operation_id bilan). */
export const QAMROV_BOLAK = 3000;
export function qamrovBolaklari<T>(paket: readonly T[], hajm = QAMROV_BOLAK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < paket.length; i += hajm) out.push(paket.slice(i, i + hajm));
  return out;
}

/** Qamrov % hujjatini bekor qilish (akt_bekor) — faqat shu fakt hujjati, smeta qatorlariga tegmaydi. */
export const faktQamrovBekor = async (aktId: number): Promise<{ ok: boolean; error?: string }> => {
  const r = await sbT2AktBekor(aktId, 'Qamrov % bekor qilindi');
  return { ok: !!r.ok, error: (r as { error?: string }).error };
};

/** Foiz matnini o'qish: "70", "70%", "12,5" → son (0 < x ≤ 1000); aks holda null. */
export function foizOqi(v: string): number | null {
  const t = v.trim().replace('%', '').replace(',', '.').replace(/\s/g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n <= 1000 ? n : null;
}

/** Holat xaritasi (qator_id → holat) — ochiq qoldiq va narx uchun. */
export function holatXarita(states: readonly JurnalHolat[]): Map<number, JurnalHolat> {
  return new Map(states.map((s) => [s.qator_id, s] as const));
}
/** Faol «bajarilmaydi» hajmlari (ochiq qoldiqdan ayriladi); o'qib bo'lmasa — bo'sh (qoldiq kamroq ayriladi, hech narsa yozilmaydi). */
export async function bajarilmaydiXarita(kompaniyaId: number, obyektId: number): Promise<Map<number, number>> {
  try {
    const r = await bajarilmadiRoyxatOl(kompaniyaId, obyektId);
    return r?.ok ? bajarilmadiHajmlar(r.qatorlar) : new Map();
  } catch { return new Map(); }
}