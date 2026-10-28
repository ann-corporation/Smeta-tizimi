/**
 * Smeta podvalidan o'qilgan nakrutka (`smeta-anatomiya/nakrutka.ts`) → obyekt podvali (mavjud
 * `t2_nakrutka_podval` modeli, konstruktor tuzilmasi). Yangi parallel model emas.
 *
 *  - isbotli foiz → qator `manba: 'smeta'` (server `t2_obyekt_nakrutka` shu foizni oladi);
 *  - topilmagan/ziddiyatli foiz → `manba: 'meros'` — amaldagi (shartnoma/sukut) qiymat, hisobni o'zgartirmaydi;
 *  - preview: eski / yangi koeffitsientlar va obyekt jami summasiga ta'sir (ustamasiz + ustamali).
 * Avtomatik ommaviy yozish yo'q — saqlash faqat operator tasdig'i bilan.
 */
import type { NakrutkaKoeffitsientlar, NakrutkaKoefKod } from '../api/t2-nakrutka';
import { NAKRUTKA_FOIZ_KODLARI, nakrutkaPodvaliniOqi, nakrutkaVaraqlari, type NakrutkaPodvalOqish } from './smeta-anatomiya/nakrutka';
import { kitobHamrohlari } from './smeta-anatomiya';
import type { Katak, KirishKitob } from './smeta-anatomiya/turlar';
import { readXlsxFonda } from './f2-import-parse/xlsxFonda';
import { standartPodval, type Podval } from './nakrutka-konstruktor';
import { kategoriyaKf, nakrutkaKaskadJS, type KatSummalar, type NakrutkaKat } from './nakrutka-podval';
import { kaskadgaYaxlit, type SvodYaxlit } from './svod-yaxlit';

export const SMETA_PODVAL_NOMI = 'Smeta podvali';

export type SmetaPodvalFarq = {
  kod: NakrutkaKoefKod;
  eski: number;
  yangi: number;
  manba: 'smeta' | 'meros';
  dalil: string | null;
};

/** Smeta podvali qatorlari (konstruktor standarti + manba belgilari). */
export function smetadanPodval(o: NakrutkaPodvalOqish, joriy: Partial<NakrutkaKoeffitsientlar>, fayl?: string): Podval {
  const nk: Partial<NakrutkaKoeffitsientlar> = { ...joriy, ...o.koeffitsientlar };
  const p = standartPodval(nk);
  return {
    versiya: 1,
    nom: `${SMETA_PODVAL_NOMI}: ${(fayl ?? o.fayl).slice(0, 120)}`,
    qatorlar: p.qatorlar.map((q) => {
      if (q.tur !== 'foiz' || !q.koefKod) return q;
      const kk = q.koefKod as (typeof NAKRUTKA_FOIZ_KODLARI)[number];
      const m = o.manba[kk];
      if (o.koeffitsientlar[kk] != null && m) {
        return { ...q, manba: 'smeta' as const, dalil: m.dalil, katak: `${m.manzil.varaq}!${m.manzil.ustun ? ustun(m.manzil.ustun - 1) : ''}${m.manzil.qator}` };
      }
      return { ...q, manba: 'meros' as const };
    }),
  };
}

const ustun = (c: number): string => { let s = ''; let n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); } return s; };

/** Podvalda smetadan olingan foizlar (server `t2_nakrutka_podval_smeta_nk_v1` bilan bir xil qoida). */
export function podvalSmetaNk(p: Podval | { qatorlar: Podval['qatorlar'] } | null | undefined): Partial<NakrutkaKoeffitsientlar> {
  const nk: Partial<NakrutkaKoeffitsientlar> = {};
  for (const q of p?.qatorlar ?? []) if (q.manba === 'smeta' && q.tur === 'foiz' && q.koefKod && typeof q.foiz === 'number') nk[q.koefKod] = q.foiz;
  return nk;
}

/** Eski (amaldagi) va yangi (smeta podvali bilan) koeffitsientlar farqi. */
export function koefFarqi(o: NakrutkaPodvalOqish, joriy: Partial<NakrutkaKoeffitsientlar>): SmetaPodvalFarq[] {
  return NAKRUTKA_FOIZ_KODLARI.map((kod) => {
    const eski = Number(joriy[kod] ?? 0);
    const smeta = o.koeffitsientlar[kod];
    const m = o.manba[kod];
    return { kod, eski, yangi: smeta ?? eski, manba: smeta != null ? 'smeta' as const : 'meros' as const, dalil: m ? `${m.dalil} · ${m.manzil.varaq}!${m.manzil.qator}` : null };
  });
}

/**
 * Smeta podvali shartnoma (yoki kompaniya standarti) foizidan ustun (egasi 2026-10-27): farq qiladigan kodlar —
 * Nakrutka sahifasidagi «shartnomada X%, smetada Y% — smetadagisi ishlatilmoqda» xabari uchun. Faqat ikkalasi ham
 * son bo'lgan va farq qiladigan kodlar (NULL ≠ 0: qiymati yo'q kod taqqoslanmaydi).
 */
export function shartnomaSmetaFarqlari(
  shartnoma: Partial<NakrutkaKoeffitsientlar> | null | undefined,
  amaldagi: Partial<NakrutkaKoeffitsientlar> | null | undefined,
): Array<{ kod: NakrutkaKoefKod; shartnoma: number; smeta: number }> {
  if (!shartnoma || !amaldagi) return [];
  return NAKRUTKA_FOIZ_KODLARI.flatMap((kod) => {
    const s = shartnoma[kod];
    const m = amaldagi[kod];
    if (typeof s !== 'number' || typeof m !== 'number' || !Number.isFinite(s) || !Number.isFinite(m)) return [];
    return Math.abs(s - m) > 1e-9 ? [{ kod, shartnoma: s, smeta: m }] : [];
  });
}

export type UstamaTasiri = {
  ustamasiz: number;
  eski: { itogo4: number; vsego: number };
  yangi: { itogo4: number; vsego: number };
  /** Kategoriya koeffitsientlari (к оплате, НДС bilan). */
  kfEski: Record<NakrutkaKat, number>;
  kfYangi: Record<NakrutkaKat, number>;
};

/** Server kategoriya jamilari (`t2_obyekt_nakrutka_v1.cats`) → konstruktor kategoriyalari. */
export function catsKat(c: { chel: number; mash: number; mat: number; ob: number; mk: number; kab: number; bez: number }): KatSummalar {
  return { ЧЕЛ: c.chel, МАШ: c.mash, МАТ: c.mat - c.kab - c.mk - c.bez, ОБ: c.ob, КАБ: c.kab, 'М/К': c.mk, 'БЕЗ СКЛАД': c.bez };
}

/** Obyekt jami summasiga ta'sir: ustamasiz (to'g'ri xarajat) va ustamali (ИТОГО-4, ВСЕГО). yaxlit — svod yaxlit
 *  (server svod_yaxlit): s shunda cats_kaskad bo'lishi kerak; yaxlit ИТОГО-4 ga ustamasiz, QQS bir marta. */
export function ustamaTasiri(s: KatSummalar, eski: Partial<NakrutkaKoeffitsientlar>, yangi: Partial<NakrutkaKoeffitsientlar>, yaxlit?: SvodYaxlit | null): UstamaTasiri {
  const e = kaskadgaYaxlit(nakrutkaKaskadJS(s, eski), yaxlit?.qqssiz, Number(eski.НДС ?? 0));
  const y = kaskadgaYaxlit(nakrutkaKaskadJS(s, yangi), yaxlit?.qqssiz, Number(yangi.НДС ?? 0));
  return {
    ustamasiz: e.pryamye + (yaxlit?.barglar ?? 0),
    eski: { itogo4: e.itogo4, vsego: e.vsego },
    yangi: { itogo4: y.itogo4, vsego: y.vsego },
    kfEski: kategoriyaKf(eski),
    kfYangi: kategoriyaKf(yangi),
  };
}

/** Fayl (yoki R2 dagi asl fayl) → anatomiya kitobi → podval o'qishi. */
export async function fayldanNakrutkaOqi(nom: string, bytes: ArrayBuffer): Promise<NakrutkaPodvalOqish> {
  const wb = await readXlsxFonda(bytes);
  const kitob: KirishKitob = {
    fayl: nom,
    varaqlar: wb.sheets.flatMap((s) => {
      const sh = wb.sheet(s.name);
      return sh ? [{ nom: s.name, rows: sh.rows as Katak[][], merges: sh.merges, formulalar: sh.formulalar }] : [];
    }),
  };
  const h = kitobHamrohlari(kitob);
  const lrv = h.varaqlar.filter((v) => v.rol === 'lrv' && v.ishlar.length).map((v) => v.varaq);
  return nakrutkaPodvaliniOqi(kitob, { varaqlar: nakrutkaVaraqlari(kitob, { varaqlar: h.varaqlar, asosiyLrv: null, dublikat: [] }, lrv) });
}
