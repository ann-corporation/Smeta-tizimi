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
import { qqsSizNarx, yaxlit2 } from '../hisob-yadro';
import { varaqniTahlilQil } from './varaq';
import { anatomiyadanAktDaraxt } from './akt-daraxt';
import type { ErkinVaraq, Katak, SvodQatori, SvodVaraq, TransportQatori, UstunXaritasi, VaraqAnatomiyasi } from './turlar';
import type { AktNode } from '../f2-match-engine';
import { resBolimKategoriya } from '../res-kategoriya';

/**
 * `hamroh` (C4 PR-1, 2026-10-26) — svod / tn·km transport varag'i: LRV yoki RES manbasi EMAS, lekin tashlab ham
 * yuborilmaydi. Anatomiya uning qatorlarini o'qiydi (`KitobAnatomiyasi.erkin` / `.svod`), operator ularni
 * «hamroh varaqlar» panelida ko'radi va qaysisi smetaga kirishini O'ZI tanlaydi (avtomatik yozilmaydi).
 * `etiborsiz` hozircha anatomiyada ishlatilmaydi (tur iste'molchilar uchun saqlanadi).
 */
export type YuklashRoli = 'lrv' | 'res' | 'hamroh' | 'etiborsiz' | 'nomalum';

export interface VaraqRoliXulosa {
  rol: YuklashRoli;
  /** true — anatomiya aniq xulosa berdi; false — zaxira evristika kerak. */
  aniq: boolean;
  ishonch: 'high' | 'medium' | 'low';
  dalil: string[];
  anatomiya: VaraqAnatomiyasi;
}

/** LRV/RES manbasi bo'lmagan, lekin o'qiladigan hamroh rollar. "erkin" (miqdorsiz narx ro'yxati ham shunga tushadi) hal qiluvchi emas. */
const HAMROH_SABAB: Partial<Record<VaraqAnatomiyasi['rol'], string>> = {
  svod: 'svod / xarajat moddalari — LRV yoki RES manbasi emas, qatorlari hamroh panelda (operator tanlaydi)',
  transport: 'transport hisobi (tn·km) — LRV yoki RES emas, material qatorlari hamroh panelda (operator tanlaydi)',
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
  // Sarlavhasiz RES (`16.Перевоз`: 2 resurs) — ustunlar arifmetika bilan isbotlangan, kam qator ham yetarli.
  if (a.rol === 'res' && a.vedomost.length >= 1 && a.rolDalil.some((d) => d.qoida === 'res:sarlavhasiz_arifmetika')) {
    return { rol: 'res', aniq: true, ishonch: 'medium', dalil: [`anatomiya: sarlavhasiz RES, ${a.vedomost.length} ta resurs qatori`, ...dalil], anatomiya: a };
  }
  const sabab = HAMROH_SABAB[a.rol];
  if (sabab) return { rol: 'hamroh', aniq: true, ishonch: 'medium', dalil: [`anatomiya: ${sabab}`, ...dalil], anatomiya: a };
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

// ─── Hamroh varaqlar → import daraxti (faqat operator tanlovi bilan) ──────────

/**
 * Svod xat lump-sum qatorining smetaga kiradigan narxi (so'm, НДС siz — tizimda narx doim НДС siz).
 * Faqat hujjat dalili bilan: ming so'm masshtabi ustun sarlavhasidan, НДС holati ustundan (yoki formula o'qigan svod
 * ustunidan), НДС stavkasi svodning o'zidan (`*1.12` / «НДС 12%»). Biror dalil yetmasa — narx null va sabab (taxmin yo'q).
 */
export function xatQatoriNarxi(svod: SvodVaraq, q: SvodQatori): { narx: number | null; ndsBilan: number | null; sabab: string | null } {
  const s = q.summa;
  if (!s) return { narx: null, ndsBilan: null, sabab: 'summa yo‘q' };
  if (s.masshtab == null) return { narx: null, ndsBilan: null, sabab: 'ustun birligi (so‘m / ming so‘m) aniqlanmadi' };
  const somda = s.qiymat * s.masshtab;
  if (s.ndsBilan === false) return { narx: yaxlit2(somda), ndsBilan: null, sabab: null };
  if (s.ndsBilan == null) return { narx: null, ndsBilan: somda, sabab: 'НДС holati (с НДС / без НДС) aniqlanmadi' };
  if (!svod.nds) return { narx: null, ndsBilan: somda, sabab: 'svodda НДС stavkasi topilmadi' };
  return { narx: qqsSizNarx(somda, svod.nds.stavka * 100), ndsBilan: somda, sabab: null };
}

export interface HamrohTanlov {
  /** Smetaga qo'shiladigan tn·km varaqlari: har material — alohida perevozka resursi (egasi qarori, F2 da qisman bajarish uchun). */
  transport: readonly ErkinVaraq[];
  /** Smeta tarkibiga yaxlit (resurssiz) ish bo'lib kiradigan svod xat qatorlari. */
  xatlar: ReadonlyArray<{ svod: SvodVaraq; qator: SvodQatori }>;
}

/**
 * Rus hujjat son formati (smeta nomlari uchun): bo'sh joy — minglik, vergul — kasr, oxirgi nollar kesiladi.
 * `7469.8158` → «7 469,8158», `14.5` → «14,5», `1000` → «1 000». Kasr 4 xonagacha (Excel float shovqini kesiladi).
 * `toLocaleString` ishlatilmaydi: ICU turli muhitda NBSP/U+202F beradi, nom esa bazada barqaror bo'lishi kerak.
 */
export function ruSon(x: number, kasr = 4): string {
  const m = 10 ** kasr;
  const y = Math.round(Math.abs(x) * m) / m;
  const [butun, qoldiq = ''] = y.toFixed(kasr).split('.');
  const minglik = butun.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const k = qoldiq.replace(/0+$/, '');
  return `${x < 0 && y !== 0 ? '-' : ''}${minglik}${k ? `,${k}` : ''}`;
}

const TONNA_BIRLIK = /^(Т|ТН|ТОНН[АЫ]?|T|TN)\.?$/;

/** tn·km qatori nomi: «ПЕРЕВОЗКА: ГПС — 7 469,8158 М3 = 11 204,7237 Т × 14,5 КМ» (birlik tonna bo'lsa « = … Т» yo'q). */
export function perevozkaNomi(q: Pick<TransportQatori, 'xom' | 'birlik' | 'miqdor' | 'tonna' | 'masofa'>): string {
  const material = q.xom.replace(/\s+/g, ' ').trim().toUpperCase();
  const birlik = (q.birlik ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  const tonnada = TONNA_BIRLIK.test(birlik);
  const qismlar: string[] = [];
  if (q.miqdor != null && q.miqdor !== 0 && birlik) qismlar.push(`${ruSon(q.miqdor)} ${birlik}`);
  if (q.tonna != null && q.tonna !== 0 && !(tonnada && qismlar.length)) qismlar.push(`${ruSon(q.tonna)} Т`);
  let tavsif = qismlar.join(' = ');
  if (q.masofa != null && q.masofa !== 0) tavsif = tavsif ? `${tavsif} × ${ruSon(q.masofa)} КМ` : `${ruSon(q.masofa)} КМ`;
  return tavsif ? `ПЕРЕВОЗКА: ${material} — ${tavsif}` : `ПЕРЕВОЗКА: ${material}`;
}

type HamrohTugun = AktNode & { norma?: number; kat?: string; kat_manba?: 'hujjat_blok' };

/**
 * Bitta tn·km varag'i → bitta perevozka ishi (egasi: «perevozka hech qachon 1 komplekt yoki shtukda emas — aniq
 * o'lchovlari bilan, smetadagidek»): `bl` hajm = Σ т·км, summa = Σ qator summasi (= varaq ИТОГО, tiyin yaxlitlash farqi
 * eng katta qatorga), ostida har material `rs` (т·км, narx, summa, norma = ulush). tn·km 0/bo'sh — kirmaydi.
 */
function transportIshi(e: ErkinVaraq, yorliq: string | null): { ish: HamrohTugun | null; otkazildi: number } {
  let otkazildi = 0;
  const rs: HamrohTugun[] = [];
  for (const q of e.qatorlar ?? []) {
    if (!q.tnKm) { otkazildi++; continue; }
    rs.push({
      uid: `hamroh_t_${e.varaq}_${q.manzil.qator}`, type: 'rs', kod: 'Т·КМ', nom: perevozkaNomi(q), bir: 'Т·КМ', hajm: q.tnKm,
      ...(q.narx != null ? { narx: q.narx } : {}), ...(q.summa != null ? { summa: yaxlit2(q.summa) } : {}),
      kat: 'М/К', kat_manba: 'hujjat_blok', children: [],
    });
  }
  if (!rs.length) return { ish: null, otkazildi };
  const hajm = Math.round(rs.reduce((s, x) => s + (x.hajm ?? 0), 0) * 1e6) / 1e6;
  for (const x of rs) x.norma = Math.round(((x.hajm ?? 0) / hajm) * 1e10) / 1e10;
  const summali = rs.filter((x) => x.summa != null);
  let summa: number | undefined = summali.length ? yaxlit2(summali.reduce((s, x) => s + x.summa!, 0)) : undefined;
  // Varaq ИТОГО — hujjat summasi: qatorlar yig'indisi undan faqat yaxlitlash qadar farq qilsa, farq eng katta qatorga.
  const itogo = e.yakuniy?.qiymat;
  if (summa != null && itogo != null && summali.length === rs.length) {
    const farq = yaxlit2(itogo - summa);
    if (farq !== 0 && Math.abs(farq) <= Math.max(1, rs.length)) {
      const eng = summali.reduce((a, b) => (Math.abs(b.summa!) > Math.abs(a.summa!) ? b : a));
      eng.summa = yaxlit2(eng.summa! + farq);
      summa = yaxlit2(itogo);
    }
  }
  const narxlar = [...new Set(rs.map((x) => x.narx))];
  const umumiy = narxlar.length === 1 && narxlar[0] != null ? narxlar[0] : null;
  const narx = umumiy ?? (summa != null && hajm ? yaxlit2(summa / hajm) : undefined);
  const narxMatn = narx == null ? '' : `, ${umumiy == null ? 'СРЕДНЯЯ ' : ''}${ruSon(narx, 2)} СУМ ЗА 1 Т·КМ`;
  const ish: HamrohTugun = {
    uid: `hamroh_t_${e.varaq}_ish`, type: 'bl', kod: 'РАСЧЁТ Т·КМ',
    nom: `ПЕРЕВОЗКА МЕСТНЫХ МАТЕРИАЛОВ АВТОСАМОСВАЛАМИ (РАСЧЁТ ЗАТРАТ ТРАНСПОРТА${narxMatn})${yorliq ? ` — ${yorliq}` : ''}`,
    bir: 'Т·КМ', hajm, ...(narx != null ? { narx } : {}), ...(summa != null ? { summa } : {}), norma: 0, children: rs,
  };
  return { ish, otkazildi };
}

/**
 * Operator tanlagan hamroh qatorlari → import daraxti (`AktNode`), LRV daraxtiga QO'SHIMCHA ildizlar.
 *  - tn·km: `rz «ПЕРЕВОЗКА ГРУЗОВ (<varaq>)»` → bitta `bl` «ПЕРЕВОЗКА МЕСТНЫХ МАТЕРИАЛОВ …» (hajm Σ т·км, summa = ИТОГО)
 *    → har material `rs` («ПЕРЕВОЗКА: <MATERIAL> — <miqdor> <birlik> = <tonna> Т × <km> КМ», т·км, narx/summa hujjatdan);
 *    tn·km bo'sh yoki 0 bo'lgan qator kirmaydi (`otkazildi`). Bir nechta varaq tanlansa — ish nomi oxirida varaq nomi.
 *  - xat lump-sum: `rz «СВОДНЫЕ ПОЗИЦИИ … (<varaq>)»` → har xat `bl` (resurssiz yaxlit ish, f2-yaxlit odati: birlik «сум»,
 *    hajm 1, narx = НДС siz summa). Belgisi kod ustunida: «ПИСЬМО ЗАКАЗЧИКА №133 ОТ 02.05.2026» (qoshimcha = false,
 *    change_type NULL — smeta tarkibi, qo'shimcha ish EMAS). Narxi dalilsiz bo'lsa yoki nusxa bo'lsa — kirmaydi.
 * Hech narsa avtomatik tanlanmaydi; bo'sh tanlov — bo'sh massiv (bo'sh bo'lim yaratilmaydi).
 */
export function hamrohDaraxti(tanlov: HamrohTanlov): { tree: AktNode[]; otkazildi: number } {
  const tree: AktNode[] = [];
  let otkazildi = 0;
  const kopVaraq = tanlov.transport.length > 1;
  for (const e of tanlov.transport) {
    const t = transportIshi(e, kopVaraq ? e.varaq.toUpperCase() : null);
    otkazildi += t.otkazildi;
    if (t.ish) tree.push({ uid: `hamroh_t_${e.varaq}`, type: 'rz', nom: `ПЕРЕВОЗКА ГРУЗОВ (${e.varaq})`, children: [t.ish] });
  }
  const svodlar = new Map<string, AktNode>();
  for (const { svod, qator: q } of tanlov.xatlar) {
    if (q.tur !== 'xat_lumpsum' || q.nusxa) { otkazildi++; continue; }
    const n = xatQatoriNarxi(svod, q);
    if (n.narx == null) { otkazildi++; continue; }
    let rz = svodlar.get(svod.varaq);
    if (!rz) {
      rz = { uid: `hamroh_s_${svod.varaq}`, type: 'rz', nom: `СВОДНЫЕ ПОЗИЦИИ ПО ПИСЬМАМ ЗАКАЗЧИКА (${svod.varaq})`, children: [] };
      svodlar.set(svod.varaq, rz);
      tree.push(rz);
    }
    rz.children!.push({
      uid: `hamroh_s_${svod.varaq}_${q.manzil.qator}`, type: 'bl',
      kod: `ПИСЬМО ЗАКАЗЧИКА №${q.xat?.raqam ?? ''}${q.xat?.sana ? ` ОТ ${q.xat.sana}` : ''}`,
      nom: q.xom, bir: 'сум', hajm: 1, narx: n.narx, summa: n.narx, children: [],
    });
  }
  return { tree, otkazildi };
}

/** UI tanlov kalitlari (holatda saqlanadi): tn·km varaq nomlari va xat qatorlari `${varaq}!${qator}`. */
export interface HamrohTanlovKalitlari {
  transport: string[];
  xatlar: string[];
}

export const xatKaliti = (s: SvodVaraq, q: SvodQatori): string => `${s.varaq}!${q.manzil.qator}`;

/** UI kalitlari → `hamrohDaraxti` tanlovi. Faqat belgilangan va anatomiya o'qigan qatorlar. */
export function hamrohTanlovniYig(h: { erkin: readonly ErkinVaraq[]; svod: readonly SvodVaraq[] }, k: HamrohTanlovKalitlari): HamrohTanlov {
  return {
    transport: h.erkin.filter((e) => e.rol === 'transport' && k.transport.includes(e.varaq)),
    xatlar: h.svod.flatMap((s) => s.qatorlar.filter((q) => q.tur === 'xat_lumpsum' && k.xatlar.includes(xatKaliti(s, q))).map((qator) => ({ svod: s, qator }))),
  };
}
