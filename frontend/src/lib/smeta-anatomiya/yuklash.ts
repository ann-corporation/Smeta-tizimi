/**
 * Smeta yuklash uchun yagona kirish (C4, egasi: "smetani tushunadigan bitta modul,
 * qolgan hamma funksiya faqat shuni ishlatadi — yangilik bir joyga kiritilsa
 * hammasiga ta'sir qiladi").
 *
 * Bu fayl smeta yuklash oqimlari (bitta fayl, paket, RES narxlash) anatomiyadan
 * oladigan uchta narsani beradi:
 *   - varaq roli (LRV / RES / e'tiborsiz / noma'lum) va dalili;
 *   - ustunlar — eski `F2ColumnConfig` shaklida (UI ustun muharriri uchun);
 *   - import daraxti (`AktNode[]`) — `anatomiyadanAktDaraxt`.
 * Eski o'quvchilar (f2-import-parse/treeBuild, columnDetect, smeta-source-analysis
 * ballari) faqat anatomiya varaqni tanimagan yoki operator ustunlarni qo'lda
 * o'zgartirgan holatda zaxira sifatida qoladi.
 */
import { varaqniTahlilQil } from './varaq';
import { anatomiyadanAktDaraxt } from './akt-daraxt';
import type { Katak, UstunXaritasi, VaraqAnatomiyasi } from './turlar';
import type { AktNode } from '../f2-match-engine';
import { resBolimKategoriya } from '../res-kategoriya';

export type YuklashRoli = 'lrv' | 'res' | 'etiborsiz' | 'nomalum';

export interface VaraqRoliXulosa {
  rol: YuklashRoli;
  /** true — anatomiya aniq xulosa berdi; false — zaxira evristika kerak. */
  aniq: boolean;
  ishonch: 'high' | 'medium' | 'low';
  dalil: string[];
  anatomiya: VaraqAnatomiyasi;
}

/** Faqat shakli aniq manba bo'lmagan rollar. "erkin" (miqdorsiz narx ro'yxati ham shunga tushadi) hal qiluvchi emas. */
const ETIBORSIZ_SABAB: Partial<Record<VaraqAnatomiyasi['rol'], string>> = {
  svod: 'svod / obyekt qiymati xulosasi — kanonik LRV yoki RES manbasi emas',
  transport: 'transport hisobi (tn·km) — LRV yoki RES emas',
};

/** Ustun xaritasi (anatomiya) → eski import ustun sozlamasi (UI muharriri shu shaklda ishlaydi). */
export function ustunSozlamasi(u: UstunXaritasi): { kod: number; nom: number; bir: number; norma: number; obyom: number; narx: number; sum: number } {
  return { kod: u.shifr, nom: u.nom, bir: u.birlik, norma: u.hajmBirlikka, obyom: u.hajmLoyiha, narx: u.narx, sum: u.summa };
}

/** Eski import ustun sozlamasi (operator muharriri) → anatomiya ustun xaritasi (teskari `ustunSozlamasi`). */
export function ustunXaritasigaQayt(c: { kod: number; nom: number; bir: number; norma: number; obyom: number; narx: number; sum: number }): Partial<Omit<UstunXaritasi, 'sarlavhaQatori' | 'malumotBoshi'>> {
  return { shifr: c.kod, nom: c.nom, birlik: c.bir, hajmBirlikka: c.norma, hajmLoyiha: c.obyom, narx: c.narx, summa: c.sum };
}

/** Varaqdagi RES bo'lim kategoriyalari (nom ustuni noma'lum bo'lsa — qatorning birinchi matn katagi). */
function resBolimlari(rows: readonly (readonly Katak[])[], nomUstun: number): Set<string> {
  const b = new Set<string>();
  for (const row of rows.slice(0, 20000)) {
    const matn = nomUstun >= 0 ? row[nomUstun] : row.find((x) => typeof x === 'string' && x.trim() !== '');
    if (typeof matn !== 'string' || !matn.trim()) continue;
    const k = resBolimKategoriya(matn.trim());
    if (k && k !== 'YAKUN') b.add(k);
  }
  return b;
}

export function varaqRoli(nom: string, rows: readonly (readonly Katak[])[]): VaraqRoliXulosa {
  const a = varaqniTahlilQil(nom, { nom, rows: rows as Katak[][] });
  const dalil = a.rolDalil.map((d) => d.izoh).filter(Boolean);
  const resursli = a.ishlar.filter((i) => i.resurslar.length).length;
  if (a.rol === 'lrv' && resursli > 0) {
    return { rol: 'lrv', aniq: true, ishonch: resursli >= 3 ? 'high' : 'medium', dalil: [`anatomiya: ${a.ishlar.length} ta ish, ${resursli} tasi resursli`, ...dalil], anatomiya: a };
  }
  if (a.rol === 'res' && a.vedomost.length >= 3) {
    return { rol: 'res', aniq: true, ishonch: a.vedomost.length >= 10 ? 'high' : 'medium', dalil: [`anatomiya: ${a.vedomost.length} ta resurs qatori`, ...dalil], anatomiya: a };
  }
  const sabab = ETIBORSIZ_SABAB[a.rol];
  if (sabab) return { rol: 'etiborsiz', aniq: true, ishonch: 'medium', dalil: [`anatomiya: ${sabab}`, ...dalil], anatomiya: a };
  // Eski import evristikasidan ko'chirildi (egasi Q3; qoidani egasi 2026-09-10 tasdiqlagan):
  // kamida IKKI xil RES bo'lim sarlavhasi (ЗАТРАТЫ ТРУДА / МАШИНЫ / МАТЕРИАЛЫ / ОБОРУДОВАНИЕ …)
  // bo'lsa — bu RES; LRV ish ierarxiyasida bunday bo'limlar bo'lmaydi.
  const bolimlar = resBolimlari(rows, a.ustunlar?.nom ?? -1);
  if (bolimlar.size >= 2) {
    return { rol: 'res', aniq: true, ishonch: 'medium', dalil: [`anatomiya: ${bolimlar.size} xil RES bo'limi (${[...bolimlar].join(', ')})`, ...dalil], anatomiya: a };
  }
  return { rol: 'nomalum', aniq: false, ishonch: 'low', dalil, anatomiya: a };
}

export interface LrvDaraxtNatija {
  tree: AktNode[];
  /** Anatomiya daraxti ishlatildimi (false — zaxira kerak). */
  anatomiya: boolean;
  otkazildi: number;
  vedomost: number;
  sabab: string | null;
}

/** LRV varag'i → import daraxti. Anatomiya ish daraxtini topmasa `anatomiya: false`. */
export function lrvDaraxti(nom: string, rows: readonly (readonly Katak[])[], tayyor?: VaraqAnatomiyasi): LrvDaraxtNatija {
  const a = tayyor ?? varaqniTahlilQil(nom, { nom, rows: rows as Katak[][] });
  if (a.rol !== 'lrv' || !a.ishlar.length) {
    return { tree: [], anatomiya: false, otkazildi: 0, vedomost: 0, sabab: 'anatomiya varaqni LRV deb tanimadi' };
  }
  const d = anatomiyadanAktDaraxt(a);
  if (!d.tree.length) return { tree: [], anatomiya: false, otkazildi: d.otkazildi, vedomost: a.vedomost.length, sabab: 'anatomiya daraxti bo‘sh chiqdi' };
  return { tree: d.tree, anatomiya: true, otkazildi: d.otkazildi, vedomost: a.vedomost.length, sabab: null };
}
