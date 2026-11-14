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
import { NAKRUTKA_FOIZ_KODLARI, nakrutkaPodvaliniOqi, nakrutkaVaraqlari, type NakrutkaKoefKodi, type NakrutkaPodvalOqish } from './smeta-anatomiya/nakrutka';
import { kitobHamrohlari } from './smeta-anatomiya';
import type { Katak, KirishKitob } from './smeta-anatomiya/turlar';
import { readXlsxFonda } from './f2-import-parse/xlsxFonda';
import { kaskad, kategoriyaKf, podvalNdsFoizi, qqsBilan as yadroQqsBilan, serverCatsdan, standartPodval, yaxlit2, type Kat as NakrutkaKat, type KatSummalar, type Podval, type ServerCats } from './hisob-yadro';
import { svodYaxlitQqs, type SvodYaxlit } from './svod-yaxlit';

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
      const smeta = o.koeffitsientlar[kk];
      // Hujjatda aniq yozilgan 0 ham smeta qiymati (masalan РИСК *0); topilmagan kod — meros (joriy qiymat).
      if (typeof smeta === 'number' && Number.isFinite(smeta)) {
        return { ...q, foiz: smeta, manba: 'smeta' as const, ...(m ? { dalil: m.dalil, katak: `${m.manzil.varaq}!${m.manzil.ustun ? ustun(m.manzil.ustun - 1) : ''}${m.manzil.qator}` } : {}) };
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
  /** null — foiz noma'lum (0 emas). */
  eski: { itogo4: number | null; vsego: number | null };
  yangi: { itogo4: number | null; vsego: number | null };
  /** Kategoriya koeffitsientlari (к оплате, НДС bilan). Noma'lum foiz — null. */
  kfEski: Record<NakrutkaKat, number | null>;
  kfYangi: Record<NakrutkaKat, number | null>;
};

/** Server kategoriya jamilari (`t2_obyekt_nakrutka_v1.cats`) → konstruktor kategoriyalari (yadro). */
export const catsKat: (c: ServerCats) => KatSummalar = serverCatsdan;

/** Obyekt jami summasiga ta'sir (yadro kaskadi): ustamasiz va ustamali (ИТОГО-4, ВСЕГО). yaxlit — svod yaxlit
 *  (server svod_yaxlit): s shunda cats_kaskad bo'lishi kerak; yaxlit ИТОГО-4 ga ustamasiz, QQS bir marta. */
export function ustamaTasiri(s: KatSummalar, eski: Partial<NakrutkaKoeffitsientlar>, yangi: Partial<NakrutkaKoeffitsientlar>, yaxlit?: SvodYaxlit | null): UstamaTasiri {
  const pe = standartPodval(eski), py = standartPodval(yangi);
  // Yaxlit svod — QQS bilan, НДС dan keyin, aynan (egasi 2026-10-30).
  const e = kaskad(s, pe, { yaxlit: svodYaxlitQqs(yaxlit, podvalNdsFoizi(pe)) });
  const y = kaskad(s, py, { yaxlit: svodYaxlitQqs(yaxlit, podvalNdsFoizi(py)) });
  return {
    ustamasiz: e.pryamye + (yaxlit?.barglar ?? 0),
    eski: { itogo4: e.itogo4, vsego: e.vsego },
    yangi: { itogo4: y.itogo4, vsego: y.vsego },
    kfEski: kategoriyaKf(pe),
    kfYangi: kategoriyaKf(py),
  };
}

/**
 * Bir kodli jami qatori faylda bir necha marta uchrashi mumkin: svod varag‘ida «JAMI» ustuni va lokal ustuni (bir xil son),
 * yoki bir necha lokal + umumiy. Eng kattasi qolganlar yig‘indisiga teng bo‘lsa — u umumiy jami (ikki marta sanalmaydi);
 * aks holda qatorlar alohida lokal jamilari: yig‘iladi.
 */
export function jamiQatorlarYigindisi(qiymatlar: readonly number[]): number {
  if (qiymatlar.length < 2) return qiymatlar[0] ?? 0;
  const eng = Math.max(...qiymatlar);
  const qolgan = qiymatlar.reduce((s, x) => s + x, 0) - eng;
  if (eng > 0 && Math.abs(eng - qolgan) <= Math.max(0.05, eng * 0.005)) return eng;
  return qiymatlar.reduce((s, x) => s + x, 0);
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

/* ───────────── «Excel jami ↔ tizim jami» (HISOB_YADRO_V1, sayt auditi band 100) ───────────── */

export type ExcelTizimQator = {
  kod: string; nom: string; excel: number | null; tizim: number | null; farq: number | null;
  /** Farq sababi (bo'sh — mos). */
  izoh: string;
};
export type ExcelTizimTaqqoslash = {
  qatorlar: ExcelTizimQator[];
  excelVsego: number | null; tizimVsego: number | null; farq: number | null; mos: boolean;
  /**
   * Faylda podval zanjiri bor, lekin ba'zi qadam (ПРОЧИЕ/СТРАХОВАНИЕ/РИСК) yo'q: shu qadamlar 0 bo'lsa tizim jami faylnikiga TENG bo'ladimi.
   * Teng bo'lsa — bu isbot (summa nisbati): yo'q qadam = 0%, kompaniya sukut foizi emas. Teng bo'lmasa — null.
   */
  nolTaklif: Partial<Record<NakrutkaKoefKodi, number>> | null;
  /** Fayl podvali umuman yo'q: foizlar kompaniya/sukut qiymatidan — taxminiy. */
  taxminiy: boolean;
};

const KASKAD_QATORLARI: ReadonlyArray<readonly [string, string, NakrutkaKoefKodi | null]> = [
  ['tr_mat', 'Транспортные расходы (материалы)', 'ТРАНСПОРТ_МАТЕРИАЛ'],
  ['skl_mat', 'Заготовительно-складские расходы (материалы)', 'СКЛАДСКИЕ_МАТЕРИАЛ'],
  ['tr_kab', 'Транспортные расходы (кабель)', 'ТРАНСПОРТ_КАБЕЛЬ'],
  ['prochie', 'Прочие расходы подрядчика', 'ПРОЧИЕ_ПОДРЯДЧИК'],
  ['tr_ob', 'Транспортные расходы (оборудование)', 'ТРАНСПОРТ_ОБОРУД'],
  ['zag_ob', 'Заготовительно-складские расходы (оборудование)', 'ЗАГОТ_СКЛАД_ОБОРУД'],
  ['strax', 'Страхование', 'СТРАХОВАНИЕ'],
  ['risk', 'Риск', 'РИСК'],
];
const NOL_ADAYOR: readonly NakrutkaKoefKodi[] = ['ПРОЧИЕ_ПОДРЯДЧИК', 'СТРАХОВАНИЕ', 'РИСК'];

/**
 * Faylning O'Z jami bilan tizim jamini qator-baqator solishtiradi. Tizim — kategoriya summalari (`cats`) × podval
 * (fayl foizlari, yo'q joyda joriy kompaniya/shartnoma foizi). Farq sababi har qatorda yoziladi; yagona hisob — yadro `kaskad`.
 */
export function excelBilanTizim(o: NakrutkaPodvalOqish, cats: KatSummalar, joriy: Partial<NakrutkaKoeffitsientlar>): ExcelTizimTaqqoslash {
  // Egasi qarori: faylning o'z podvali bo'lsa u HAKAM — undagi yo'q ПРОЧИЕ/СТРАХОВАНИЕ/РИСК = 0% (kompaniya foizi emas).
  // Kompaniya/sukut foizi faqat fayl podvali umuman bo'lmaganda (taxminiy).
  const faylPodvali = Object.keys(o.koeffitsientlar).length > 0;
  const yoq = faylPodvali ? NOL_ADAYOR.filter((x) => o.koeffitsientlar[x] == null && Number(joriy[x] ?? 0) !== 0) : [];
  const nolTaklif: ExcelTizimTaqqoslash['nolTaklif'] = yoq.length ? (Object.fromEntries(yoq.map((x) => [x, 0])) as Partial<Record<NakrutkaKoefKodi, number>>) : null;
  const nk: Partial<NakrutkaKoeffitsientlar> = { ...joriy, ...o.koeffitsientlar, ...(nolTaklif ?? {}) };
  const k = kaskad(cats, standartPodval(nk));
  const hujjat = (kod: string): number | null => {
    const q = o.qatorlar.filter((x) => x.kod === kod && x.summa != null);
    return q.length ? jamiQatorlarYigindisi(q.map((x) => (x.summa as number) * x.masshtab)) : null;
  };
  const yaxlit = (x: number | null) => (x == null ? null : yaxlit2(x));
  const qatorlar: ExcelTizimQator[] = [];
  for (const [kod, nom, koef] of KASKAD_QATORLARI) {
    const tizim = k.qiymat[kod] ?? null;
    const excel = hujjat(kod);
    if (excel == null && (tizim == null || Math.abs(tizim) < 0.005)) continue;
    const farq = excel != null && tizim != null ? yaxlit(tizim - excel) : excel == null ? tizim : null;
    const foizFaylda = koef != null ? o.koeffitsientlar[koef] : undefined;
    let izoh = '';
    if (excel == null) izoh = `в файле строки нет; в системе применён ${koef ? `${nk[koef] ?? 0}%` : ''} (${foizFaylda != null ? 'из файла' : koef != null && nolTaklif && koef in nolTaklif ? 'в подвале файла строки нет — принято 0%' : 'процент компании/по умолчанию (файл не задаёт)'})`;
    else if (farq != null && Math.abs(farq) > 1) izoh = `в файле ${foizFaylda ?? '?'}%, в системе ${koef ? nk[koef] ?? 0 : '?'}%`;
    qatorlar.push({ kod, nom, excel, tizim, farq, izoh });
  }
  const nds = hujjat('nds');
  let excelVsego = hujjat('vsego');
  const ndsFoiz = o.koeffitsientlar.НДС;
  if (excelVsego == null && nds != null && ndsFoiz) excelVsego = yadroQqsBilan(yaxlit2(nds * 100 / ndsFoiz), ndsFoiz);
  const tizimVsego = k.vsego;
  qatorlar.push({ kod: 'nds', nom: 'НДС', excel: nds, tizim: k.qqs, farq: nds != null && k.qqs != null ? yaxlit(k.qqs - nds) : null, izoh: '' });
  qatorlar.push({
    kod: 'vsego', nom: 'ВСЕГО С НДС', excel: excelVsego, tizim: tizimVsego,
    farq: excelVsego != null && tizimVsego != null ? yaxlit(tizimVsego - excelVsego) : null, izoh: '',
  });
  const farq = excelVsego != null && tizimVsego != null ? yaxlit(tizimVsego - excelVsego) : null;
  const mos = farq != null && Math.abs(farq) <= Math.max(1, Math.abs(excelVsego ?? 0) * 1e-6);
  const taxminiy = !faylPodvali;
  return { qatorlar, excelVsego, tizimVsego, farq, mos, nolTaklif, taxminiy };
}

/** Isbotlangan nol foizlarni (excelBilanTizim.nolTaklif) fayl o'qishiga qo'shadi: dalil — «summa nisbati» (Excel jami = tizim jami). */
export function oqishNolBilan(o: NakrutkaPodvalOqish, nol: Partial<Record<NakrutkaKoefKodi, number>> | null): NakrutkaPodvalOqish {
  if (!nol) return o;
  const manzil = o.qatorlar.find((q) => q.kod === 'vsego' || q.kod === 'nds')?.manzil ?? o.qatorlar[0]?.manzil;
  const manba = { ...o.manba };
  if (manzil) for (const kod of Object.keys(nol) as NakrutkaKoefKodi[]) manba[kod] = { dalil: 'summa_nisbati', manzil, xom: 'ВСЕГО С НДС (jami nisbati)' };
  return { ...o, koeffitsientlar: { ...o.koeffitsientlar, ...nol }, manba };
}