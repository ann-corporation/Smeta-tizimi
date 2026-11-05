/**
 * PERERASCHET — BITTA F2 hujjat (egasi 2026-11-03): tepada avval olingan F2 lar minus bloklar (har biri O'Z hujjat podvali bilan),
 * pastda yangi smeta/fakt qatorlari (smeta podvali bilan); jami = yangi − eski. Bu modul faqat guruhlaydi va yadroga beradi
 * (`f2Baholash`); pul arifmetikasi `hisob-yadro` da. Storno qatori bloki: `raw_snapshot.stornoOf` = manba akt id (SQL `t2_akt_podval.blok`).
 */
import { bosKesim, f2Baholash, kesimgaQosh, yaxlit2, type AktPodvalNk, type F2Baho, type F2Blok, type HisobKirish, type Kesim } from './hisob-yadro';
import { STORNO_MANBA } from './f2-storno';
import { daraxtTartibida, smetaDaraxtTartibi } from './f2-tayyor';

export type PereraschetAktQator = {
  qator_id: number;
  hajm?: number | string | null;
  certified_quantity?: number | string | null;
  certified_unit_price?: number | string | null;
  certified_amount?: number | string | null;
  raw_snapshot?: unknown;
};

/** Smeta qatorining hujjat uchun maydonlari. */
export type PereraschetSmetaQator = { id: number; kod?: string | null; nom?: string | null; birlik?: string | null; kat?: string | null; tur?: string | null; ota_id?: number | null; tartib?: number | null };

export type PereraschetBlokQator = {
  qatorId: number; kod: string | null; nom: string; birlik: string | null; kat: string | null; tur: string;
  hajm: number | null; narx: number | null; summa: number | null;
};

export type PereraschetBlok = {
  manbaAktId: number;
  raqam: string | null;
  qatorlar: PereraschetBlokQator[];
  kesim: Kesim;
  /** Σ minus summa (faqat ma'lum summalar). */
  jami: number;
  /** Summasi noma'lum qatorlar soni (NULL ≠ 0). */
  nomalum: number;
};

const son = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Storno bloki manba akt id (qator `raw_snapshot.stornoOf`); storno emas — null. */
export function stornoManbaId(x: { raw_snapshot?: unknown }): number | null {
  const s = x.raw_snapshot as { source?: unknown; stornoOf?: unknown } | null | undefined;
  if (!s || typeof s !== 'object' || s.source !== STORNO_MANBA) return null;
  const id = Number(s.stornoOf);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Aktning storno qatorlarini manba akt bo'yicha bloklarga ajratadi (bloklar tartibi: manba akt id ning birinchi uchrashuvi).
 * Blok ichidagi qatorlar MANBA F2 tuzilmasida: smeta daraxti tartibi (rz → bl → uning rs/mat; `smetaDaraxtTartibi`, f2Qur bilan bir xil) —
 * DB qaytargan tasodifiy id tartibi emas. Smetada topilmagan qatorlar blok oxirida asl tartibda.
 */
export function pereraschetBloklari(
  aktQatorlar: readonly PereraschetAktQator[], smeta: ReadonlyMap<number, PereraschetSmetaQator>, raqamlar: ReadonlyMap<number, string | null> = new Map(),
): PereraschetBlok[] {
  const bloklar = new Map<number, PereraschetBlok>();
  for (const x of aktQatorlar) {
    const manba = stornoManbaId(x);
    if (manba == null) continue;
    const b = bloklar.get(manba) ?? { manbaAktId: manba, raqam: raqamlar.get(manba) ?? null, qatorlar: [], kesim: bosKesim(), jami: 0, nomalum: 0 };
    const sq = smeta.get(x.qator_id);
    const summa = son(x.certified_amount);
    b.qatorlar.push({
      qatorId: x.qator_id, kod: sq?.kod ?? null, nom: sq?.nom || `#${x.qator_id}`, birlik: sq?.birlik ?? null, kat: sq?.kat ?? null, tur: sq?.tur ?? 'rs',
      hajm: son(x.certified_quantity) ?? son(x.hajm), narx: son(x.certified_unit_price), summa,
    });
    kesimgaQosh(b.kesim, sq?.kat, summa);
    if (summa == null) b.nomalum++; else b.jami += summa;
    bloklar.set(manba, b);
  }
  const tartib = smetaDaraxtTartibi(smeta.values());
  for (const b of bloklar.values()) {
    b.qatorlar = daraxtTartibida(b.qatorlar, (q) => q.qatorId, tartib);
    b.jami = yaxlit2(b.jami); // faqat ko'rsatish; pul jami yadro f2Baholash dan
  }
  return [...bloklar.values()];
}

export type PereraschetBaho = {
  /** Har blok o'z podvali bilan (eski, minus). */
  bloklar: Array<{ blok: PereraschetBlok; hujjatPodvali: boolean; baho: F2Baho }>;
  /** Barcha eski bloklar (minus). null — blok yo'q. */
  eski: F2Baho | null;
  /** Yangi qatorlar (smeta podvali). null — yangi qator yo'q. */
  yangi: F2Baho | null;
  /** Yagona hujjat jami: yangi − eski (eski minus ishorali, shuning uchun yig'indi). */
  sof: F2Baho;
};

/**
 * `nkOl(manbaAktId)` — manba aktning O'Z podvali foizlari (storno bloki yoki manba akt); null — smeta podvali.
 * `yangiKesim` — yangi qatorlar kesimi (null/bo'sh — yo'q).
 */
export function pereraschetBaholash(
  bloklar: readonly PereraschetBlok[], nkOl: (manbaAktId: number) => AktPodvalNk | null, yangiKesim: Kesim | null, smeta: HisobKirish,
): PereraschetBaho {
  const blokBirlik = (b: PereraschetBlok): F2Blok => ({ kalit: `s:${b.manbaAktId}`, nom: b.raqam ?? String(b.manbaAktId), kesim: b.kesim, nk: nkOl(b.manbaAktId) });
  const yangiBor = !!yangiKesim && (Object.keys(yangiKesim.summalar).length > 0 || yangiKesim.nomalum !== 0 || yangiKesim.nomalumSoni > 0 || yangiKesim.summasizSoni > 0 || !!yangiKesim.yaxlit || yangiKesim.yaxlitQator != null);
  const yangiBlok: F2Blok | null = yangiBor ? { kalit: 'yangi', nom: 'yangi', kesim: yangiKesim! } : null;
  const eskiBloklar = bloklar.map(blokBirlik);
  return {
    bloklar: bloklar.map((b, i) => ({ blok: b, hujjatPodvali: !!eskiBloklar[i].nk, baho: f2Baholash([eskiBloklar[i]], smeta) })),
    eski: eskiBloklar.length ? f2Baholash(eskiBloklar, smeta) : null,
    yangi: yangiBlok ? f2Baholash([yangiBlok], smeta) : null,
    sof: f2Baholash([...eskiBloklar, ...(yangiBlok ? [yangiBlok] : [])], smeta),
  };
}

/** Excel hujjat (`f2Hujjat.eskiBloklar`) uchun eski bloklar: har biri o'z podvali (nk) bilan; podval yo'q - nk null (smeta podvali). */
export function eskiBloklarHujjat(
  bloklar: readonly PereraschetBlok[], nkOl: (manbaAktId: number) => AktPodvalNk | null,
): Array<{ nom: string; nk: Partial<Record<string, number>> | null; qatorlar: Array<{ id: number; kod: string | null; nom: string; birlik: string | null; kat: string | null; tur: string; hajm: number | null; narx: number | null; summa: number | null }> }> {
  return bloklar.map((b) => {
    const nk = nkOl(b.manbaAktId);
    const toza = nk ? Object.fromEntries(Object.entries(nk).filter(([, v]) => v != null && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)])) : null;
    return { nom: b.raqam || String(b.manbaAktId), nk: toza, qatorlar: b.qatorlar.map((q) => ({ id: q.qatorId, kod: q.kod, nom: q.nom, birlik: q.birlik, kat: q.kat, tur: q.tur, hajm: q.hajm, narx: q.narx, summa: q.summa })) };
  });
}