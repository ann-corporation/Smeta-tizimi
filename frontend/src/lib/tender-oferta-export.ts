/**
 * Tender oferta V2 eksporti — ASL workbookni SAQLAB, unga oferta qo'shadi.
 *
 * XLSX/XLSM uchun "surgical" OOXML patch: ZIP ichidagi tanlanmagan qismlar
 * (varaqlar, formulalar, stil, vbaProject.bin …) BAYT-BAYT o'zgarmaydi.
 * Tanlangan RES varaqlarida esa hujjat asl shaklda DAVOM etadi:
 *   - asl jadvalning oxirgi ustunidan (СУММА) keyin darhol 3 ta ustun:
 *     КОЛ-ВО / ЦЕНА ЗА ЕД. / СУММА (оферта) — uslub asl D/E/F kataklaridan,
 *     ustun raqamlari (7, 8, 9), kengliklar, bo‘lim/sarlavha birlashmalari
 *     davom etadi; qiymatli asl katakka tegilmaydi;
 *   - yashirin texnik КАТЕГОРИЯ ustuni (yakuniy SUMIFS uchun);
 *   - varaq oxirida ЗАКАЗЧИК / ПОДРЯДЧИК imzo bloki; print area kengayadi;
 *   - styles.xml ga faqat rangsiz zaxira xf'lar qo'shiladi (fill yo'q);
 *   - yangi `OFERTA_JAMI` varag'i — egasining uslublarida svod hujjat.
 * Formulalar sayt hisobining aynan o'zi: ROUND(taklifHajmi*narx;2),
 * SUMIFS kategoriya asoslari va nakrutka kaskadi ayni tartibda. Keshlangan
 * <v> qiymatlar ham yoziladi, shuning uchun qayta hisoblamaydigan
 * ko'ruvchilar ham sayt bilan bir xil sonni ko'radi.
 *
 * .xls (BIFF8) ni bayt darajasida patch qilib bo'lmaydi: u SheetJS orqali
 * .xlsx ga o'giriladi va keyin xuddi shu patch qo'llanadi — bu holat
 * `saqlanish: 'qisman'` deb halol belgilanadi.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { OFERTA_KATEGORIYALAR, narxlanadiganmi, type OfertaHisoblash, type OfertaKategoriya, type OfertaQatorNatija } from './tender-oferta';
import type { OfertaSheetTahlili } from './tender-oferta-parser';
import { NAKRUTKA_KOEF_KODLAR, type NakrutkaKoefKod } from '../api/t2-nakrutka';

/** H9: hujjatdagi начисления nomlari — rus tilida (UI dagi o'zbekcha izoh hujjatga chiqmaydi). */
const NAKRUTKA_KOEF_RU: Record<NakrutkaKoefKod, string> = {
  ЗТР_СОЦСТРАХ: 'Отчисления на соцстрах в составе ЗТР, % (справочно, в расчет не входит)',
  ТРАНСПОРТ_МАТЕРИАЛ: 'Транспортные расходы — материалы, %',
  СКЛАДСКИЕ_МАТЕРИАЛ: 'Заготовительно-складские расходы — материалы, %',
  СКЛАДСКИЕ_МК: 'Заготовительно-складские расходы — металлоконструкции (М/К), %',
  ТРАНСПОРТ_КАБЕЛЬ: 'Транспортные расходы — кабель и провод, %',
  ПРОЧИЕ_ПОДРЯДЧИК: 'Прочие расходы подрядчика, %',
  ТРАНСПОРТ_ОБОРУД: 'Транспортные расходы — оборудование, %',
  ЗАГОТ_СКЛАД_ОБОРУД: 'Заготовительно-складские расходы — оборудование, %',
  СТРАХОВАНИЕ: 'Страхование объекта, %',
  РИСК: 'Риск, %',
  НДС: 'НДС, %',
};
import {
  aslFormula, sahifaEnigaSigdir, bosCell, boshUstun, colAttr, colsOqi, engOngUstun, fCell, formulaKochir, isZip, numCell, num, printAreaKengaytir,
  sheetRef, strCell, sumRefs, ustunHarfi, varaqniPatchla, varaqXaritasi, varaqYollari, workbookgaVaraqQosh, xfNusxa, xlsdanXlsx,
  zaxiraStillarQosh, imzoMatni, bugunSana, definedNameQosh, printAreaQiymati, printTitlesQiymati, IMZO_IZOH, IMZO_PODPIS, IMZO_MP, IMZO_IMZO_CHIZIQ,
  type VaraqPatch, type VaraqXarita, type YangiHujayra, type ZaxiraStillar,
} from './hujjat-yozuvchi';

// Oferta V3 API si o'zgarmaydi: umumiy qismlar hujjat-yozuvchi modulidan qayta eksport.
export { ustunHarfi, engOngUstun, formulaKochir } from './hujjat-yozuvchi';

export type OfertaEksportInput = {
  obyektNomi?: string;
  manbaFaylNomi: string;
  manbaBytes: ArrayBuffer | Uint8Array;
  tanlanganVaraqlar: readonly string[];
  tahlillar: readonly OfertaSheetTahlili[];
  hisob: OfertaHisoblash;
  /** UI'da ko'rsatiladigan koeffitsient manbasi (kompaniya/standart). */
  koeffitsientManbasi?: string;
  /** Imzo blokidagi tomonlar nomi (tashkilot, F.I.O.) — bo'sh bo'lsa chiziq. */
  imzo?: { zakazchik?: string; pudratchi?: string };
  /** Fayl nomidagi sana (YYYY-MM-DD); sukut — bugun. */
  sana?: string;
};

/** Yangi ustunlar: hajm/narx/summa — asl D/E/F davomi; kategoriya — yashirin texnik ustun (SUMIFS uchun). */
export type OfertaUstunHarflari = { hajm: string; narx: string; summa: string; kategoriya: string };

export type OfertaEksportNatija = {
  bytes: Uint8Array;
  faylNomi: string;
  /** 'toliq' — asl OOXML qismlari bayt-bayt saqlangan; 'qisman' — .xls
   * SheetJS orqali .xlsx ga o'girilgan (stil/format qisman yo'qolishi mumkin). */
  saqlanish: 'toliq' | 'qisman';
  /** Yangi ustunlar qaysi varaqda qaysi harfda (tekshiruv/test uchun). */
  ustunlar: Record<string, OfertaUstunHarflari>;
  jamiVaraq: string;
  /** OFERTA_JAMI dagi yakuniy oferta hujayrasi (masalan "B52"). */
  yakuniyHujayra: string;
};


const MUAMMO_MATNI: Record<string, string> = {
  HAJM_YOQ: 'hajm yo‘q',
  PUDRATCHI_NARXI_YOQ: 'pudratchi narxi kiritilmagan',
  SMETA_NARXI_YOQ: 'smeta narxi yo‘q',
  SMETA_NARXI_NOL: 'smeta narxi 0 — taklif 0 (kerak bo‘lsa narx kiriting)',
  FOIZ_XATO: 'foiz noto‘g‘ri',
  NARX_MANFIY: 'narx manfiy chiqdi',
  KATEGORIYA_NOMALUM: 'kategoriya noma’lum — kaskadga kirmaydi',
  JAMI_MOS_EMAS: 'manba jamisi bolalar yig‘indisiga mos emas',
  NARX_HAR_XIL: 'varaqlarda smeta narxi har xil — asosiy narx olindi',
};

export function ofertaMuammoMatni(m: string): string {
  return MUAMMO_MATNI[m] ?? m;
}

export function ofertaHolatMatni(q: OfertaQatorNatija): string {
  if (q.rol === 'INFO') return 'ma’lumot uchun — narxlanmaydi';
  if (q.hosila) return 'hosila xarajat — OFERTA_JAMI kaskadida qayta hisoblanadi';
  if (q.rol === 'SUBTOTAL' || q.rol === 'GRAND_TOTAL') {
    if (q.jamiMoslik === 'mos_emas') return MUAMMO_MATNI.JAMI_MOS_EMAS;
    return 'to‘g‘ridan-to‘g‘ri xarajat jami';
  }
  if (!q.muammolar.length) return 'TAYYOR';
  return q.muammolar.map(ofertaMuammoMatni).join('; ');
}

// ───────────────────────── yordamchilar ─────────────────────────

function safeFilePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'resurs';
}

/** H8: `<Obyekt (asl fayl nomi)>_ОФЕРТА_<sana>.xlsx|xlsm` — .xls manba .xlsx bo'ladi. */
export function ofertaFaylNomi(manbaFaylNomi?: string, xlsdanOgirilgan = false, sana = bugunSana()): string {
  const source = safeFilePart(manbaFaylNomi || 'resurs.xlsx');
  const match = source.match(/\.(xlsx|xlsm|xls)$/i);
  const stem = match ? source.slice(0, -match[0].length) : source;
  let ext = match?.[1].toLowerCase() ?? 'xlsx';
  if (ext === 'xls' || xlsdanOgirilgan) ext = 'xlsx';
  return `${stem}_ОФЕРТА_${sana}.${ext}`;
}

// ───────────────────────── formulalar ─────────────────────────

function foizFormula(f: { yon: string; foiz: number }): string {
  return `(1${f.yon === 'oshirish' ? '+' : '-'}${num(f.foiz)}/100)`;
}

export const OFERTA_USTUN_SARLAVHALARI = ['КОЛ-ВО\n(оферта)', 'ЦЕНА ЗА ЕД.\n(оферта)', 'СУММА\n(оферта), сум', 'КАТЕГОРИЯ'] as const;

/** Ikki tomon imzosi — har bir oferta varag‘i va yakuniy varaq oxirida (H3). */
const IMZO_TOMONLARI = ['ЗАКАЗЧИК', 'ПОДРЯДЧИК'] as const;

function ofertaImzoMatni(tomon: typeof IMZO_TOMONLARI[number], imzo?: OfertaEksportInput['imzo']): string {
  return imzoMatni(tomon, tomon === 'ЗАКАЗЧИК' ? imzo?.zakazchik : imzo?.pudratchi);
}

/** Asl jadvaldan uslub namunalari — yakuniy varaq ham egasining shrifti,
 * chegarasi va son formatida chiqadi (yangi rang yo‘q). */
type UslubNamuna = { sarlavha?: number; raqam?: number; matn?: number; son?: number; jamiMatn?: number; jamiSon?: number; bolim?: number; oddiy?: number };

function varaqPatchQur(tahlil: OfertaSheetTahlili, qatorlar: readonly OfertaQatorNatija[], x: VaraqXarita, xml: string, s: ZaxiraStillar, imzo?: OfertaEksportInput['imzo']): { patch: VaraqPatch; harflar: OfertaUstunHarflari; namuna: UslubNamuna; sarlavha: [number, number] } {
  const u = tahlil.ustunlar!;
  const cols = colsOqi(xml);
  const cF = u.smetaSumma, cD = u.hajm >= 0 ? u.hajm : cF, cE = u.smetaNarx >= 0 ? u.smetaNarx : cF;
  const cQ = boshUstun(x, cF, 4, engOngUstun(xml));
  const [cP, cS, cK] = [cQ + 1, cQ + 2, cQ + 3];
  const L: OfertaUstunHarflari = { hajm: ustunHarfi(cQ), narx: ustunHarfi(cP), summa: ustunHarfi(cS), kategoriya: ustunHarfi(cK) };
  const rows = new Map<number, YangiHujayra[]>();
  const add = (r: number, c: YangiHujayra) => { const a = rows.get(r) ?? []; if (!a.some((o) => o.col === c.col)) a.push(c); rows.set(r, a); };
  const aslS = (r: number, c: number) => { const v = x.qatorlar.get(r)?.find((k) => k.col === c)?.s; return v == null ? undefined : Number(v); };
  const namuna: UslubNamuna = {};

  // Sarlavha: asl sarlavha katagi uslubida; asl sarlavha bir necha qatorga
  // birlashtirilgan bo‘lsa (F4:F5) — yangi ustunlar ham ayni shaklda.
  const headerRow = u.sarlavhaBoshlanishi + 1;
  const hMerge = x.merges.find((m) => m.c1 === cF && m.c2 === cF && m.r1 === headerRow && m.r2 > m.r1);
  OFERTA_USTUN_SARLAVHALARI.forEach((t, i) => {
    add(headerRow, strCell(cQ + i, s.header, t, cF));
    if (hMerge) for (let r = headerRow + 1; r <= hMerge.r2; r++) add(r, bosCell(cQ + i, s.header, cF));
  });
  const yangiMerge = hMerge ? [cQ, cP, cS, cK].map((c) => `${ustunHarfi(c)}${hMerge.r1}:${ustunHarfi(c)}${hMerge.r2}`) : [];
  namuna.sarlavha = aslS(headerRow, cF);

  // Ustun raqamlari qatori (1 | 2 | … | 6) — 7, 8, 9 bo‘lib davom etadi.
  let raqamQatori: number | undefined;
  for (let r = headerRow; r <= u.malumotBoshlanishi + 1; r++) {
    const f = x.qatorlar.get(r)?.find((c) => c.col === cF);
    const d = x.qatorlar.get(r)?.find((c) => c.col === cD);
    const n = f?.v != null ? Number(f.v) : NaN;
    if (Number.isInteger(n) && n > 0 && n < 100 && d?.v != null && Number(d.v) === n - (cF - cD)) {
      add(r, numCell(cQ, s.header, n + 1, cD)); add(r, numCell(cP, s.header, n + 2, cE)); add(r, numCell(cS, s.header, n + 3, cF));
      namuna.raqam = aslS(r, cF);
      raqamQatori = r;
      break;
    }
  }

  const byId = new Map(qatorlar.map((q) => [q.sourceId, q]));
  for (const q of qatorlar) {
    const r = q.sourceRow;
    const narxlanadi = q.rol === 'RESOURCE' || (q.rol === 'TRANSPORT' && q.hosila === false);
    if (narxlanadi) {
      if (namuna.matn == null && q.rol === 'RESOURCE') { namuna.matn = aslS(r, u.nom); namuna.son = aslS(r, cF); }
      add(r, strCell(cK, s.text, q.rol === 'RESOURCE' ? String(q.samaraliKategoriya ?? 'UNKNOWN') : 'TRANSPORT'));
      if (q.hisobTuri === 'birlik') {
        // effectiveOfferQuantity: override → konstanta, aks holda manba hajm
        // katagiga havola (manba o'zgarmaydi, qayta yozilmaydi).
        if (q.taklifHajmiOverride != null) add(r, numCell(cQ, s.son, q.taklifHajmiOverride, cD));
        else if (q.taklifHajmi != null && q.manbaHajmUstuni != null && q.manbaHajmUstuni >= 0 && q.manbaHajmSon) {
          add(r, fCell(cQ, s.son, `${ustunHarfi(q.manbaHajmUstuni)}${r}`, q.taklifHajmi, cD));
        } else if (q.taklifHajmi != null) add(r, numCell(cQ, s.son, q.taklifHajmi, cD));
        if (q.pudratchiBirlikNarx != null) add(r, numCell(cP, s.son, q.pudratchiBirlikNarx, cE));
        if (q.pudratchiSumma != null && q.taklifHajmi != null && q.pudratchiBirlikNarx != null) {
          add(r, fCell(cS, s.son, `ROUND(${L.hajm}${r}*${L.narx}${r},2)`, q.pudratchiSumma, cF));
        }
      } else if (q.hisobTuri === 'manba_jami' && q.pudratchiSumma != null) {
        const src = q.manbaSummaUstuni != null && q.manbaSummaUstuni >= 0 && q.manbaSummaSon ? `${ustunHarfi(q.manbaSummaUstuni)}${r}` : null;
        if (q.narxManbasi !== 'qolda' && q.qollanganFoiz && src) add(r, fCell(cS, s.son, `ROUND(${src}*${foizFormula(q.qollanganFoiz)},2)`, q.pudratchiSumma, cF));
        else add(r, numCell(cS, s.son, q.pudratchiSumma, cF));
      }
    } else if ((q.rol === 'SUBTOTAL' || q.rol === 'GRAND_TOTAL') && q.pudratchiSumma != null) {
      const kids = (q.jamiBolalari ?? []).map((id) => byId.get(id)).filter((k): k is OfertaQatorNatija => !!k)
        .filter((k) => k.pudratchiSumma != null && (k.rol === 'RESOURCE' || k.rol === 'TRANSPORT' || k.rol === 'STORAGE' || k.rol === 'SUBTOTAL' || k.rol === 'GRAND_TOTAL'));
      if (kids.length) add(r, fCell(cS, s.jami, sumRefs(L.summa, kids.map((k) => k.sourceRow)), q.pudratchiSumma, cF));
      if (namuna.jamiSon == null) { namuna.jamiSon = aslS(r, cF); namuna.jamiMatn = aslS(r, u.nom) ?? aslS(r, 0); }
    } else if (q.podval && q.pudratchiSumma != null) {
      // Podval (транспорт 5%, склад, ВСЕГО С УЧЕТОМ …): asl formula bo'lsa —
      // ustunlari ko'chiriladi; bo'lmasa tizim tushungan qoida yoziladi.
      const asl = aslFormula(x.qatorlar.get(r)?.find((c) => c.col === cF));
      // Faqat SUMMA ustuniga havola ko'chadi; koeffitsient kataklari (=F237*E238,
      // E238 = 0,05) asl joyida qoladi — ular manba varaqda o'zgarmay turadi.
      const kochirilgan = asl ? formulaKochir(asl, new Map([[cF, cS]]), true) : null;
      const pv = q.podval;
      const bazaQator = (id: string) => byId.get(id)?.sourceRow;
      let f: string | null = null;
      if (pv.tur === 'kategoriya') {
        // Asl'da 0 — bo'lim resurslaridan kategoriya bo'yicha (yashirin КАТЕГОРИЯ ustuni).
        const qr = pv.bazaQatorlar.map(bazaQator).filter((n): n is number => n != null);
        if (qr.length) {
          const [a, b] = [Math.min(...qr), Math.max(...qr)];
          const sumif = (k: string) => `SUMIFS(${L.summa}${a}:${L.summa}${b},${L.kategoriya}${a}:${L.kategoriya}${b},"${k}")`;
          f = `ROUND(${pv.qismlar.map((qq) => `(${qq.kat.map(sumif).join('+')})*${num(qq.foiz)}/100`).join('+')},2)`;
        }
      } else if (kochirilgan) f = /^\s*SUM\(/i.test(kochirilgan) ? kochirilgan : `ROUND(${kochirilgan},2)`;
      else if (pv.tur === 'yigindi') f = sumRefs(L.summa, pv.bazalar.map(bazaQator).filter((n): n is number => n != null));
      else if (pv.tur === 'foiz' && bazaQator(pv.baza) != null) {
        f = pv.foiz != null ? `ROUND(${L.summa}${bazaQator(pv.baza)}*${num(pv.foiz)}/100,2)` : `ROUND(${L.summa}${bazaQator(pv.baza)}*${num(pv.koef)},2)`;
      }
      add(r, f ? fCell(cS, s.son, f, q.pudratchiSumma, cF) : numCell(cS, s.son, q.pudratchiSumma, cF));
    } else if (q.rol === 'SECTION' && namuna.bolim == null) {
      namuna.bolim = aslS(r, 0) ?? aslS(r, u.nom);
    }
    // Jadval chegarasi va bo‘lim rangi yangi ustunlarda ham davom etadi.
    add(r, bosCell(cQ, s.text, cD)); add(r, bosCell(cP, s.text, cE)); add(r, bosCell(cS, s.text, cF));
  }

  // Ikki tomon imzosi — varaq oxirida, egasining ustun shriftida (chegarasiz).
  const oddiy = Number(colAttr(cols, u.nom, 'style') ?? 0);
  namuna.oddiy = oddiy;
  let r0 = Math.max(x.oxirgiQator, ...rows.keys()) + 3;
  for (const tomon of IMZO_TOMONLARI) {
    add(r0, strCell(u.nom, oddiy, ofertaImzoMatni(tomon, imzo)));
    add(r0, strCell(cP, oddiy, IMZO_IMZO_CHIZIQ));
    add(r0 + 1, strCell(u.nom, oddiy, IMZO_IZOH));
    add(r0 + 1, strCell(cP, oddiy, IMZO_PODPIS));
    add(r0 + 1, strCell(cS, oddiy, IMZO_MP));
    r0 += 3;
  }

  const patch: VaraqPatch = {
    rows,
    ustunlar: [{ col: cQ, nusxa: cD }, { col: cP, nusxa: cE }, { col: cS, nusxa: cF }, { col: cK, width: 12, hidden: true }],
    oraliq: [cQ, cS, cK],
    mergeChoz: { dan: cQ === cF + 1 ? cF : -1, gacha: cS },
    aslOxirgi: cF,
    yangiMerge,
  };
  return { patch, harflar: L, namuna, sarlavha: [headerRow, raqamQatori ?? (hMerge ? hMerge.r2 : headerRow)] };
}
// ───────────────────────── OFERTA_JAMI ─────────────────────────

/** Tartib `ofertaHisobla` dagi kategoriya yig'ish tartibi bilan bir xil. */
const KAT_TARTIB: OfertaKategoriya[] = ['ЧЕЛ', 'МАШ', 'МАТ', 'ОБ', 'М/К', 'КАБ', 'БЕЗСКЛАД', 'UNKNOWN'];

const KAT_NOMI: Record<OfertaKategoriya, string> = {
  ЧЕЛ: 'Затраты труда рабочих-строителей',
  МАШ: 'Строительные машины и механизмы',
  МАТ: 'Строительные материалы',
  ОБ: 'Оборудование',
  'М/К': 'Металлоконструкции',
  КАБ: 'Кабельно-проводниковая продукция',
  БЕЗСКЛАД: 'Материалы без складских расходов',
  UNKNOWN: 'Категория не определена',
};

const SABAB_RU: Partial<Record<string, string>> = {
  HAJM_YOQ: 'нет количества',
  PUDRATCHI_NARXI_YOQ: 'не указана цена подрядчика',
  SMETA_NARXI_YOQ: 'нет цены в смете',
  SMETA_NARXI_NOL: 'цена в смете 0 — принята 0',
  FOIZ_XATO: 'неверный процент',
  NARX_MANFIY: 'отрицательная цена',
  KATEGORIYA_NOMALUM: 'категория не определена',
  NARX_HAR_XIL: 'разные сметные цены на листах — принята основная',
};

type JamiStil = { sarlavha: number; raqam: number; matn: number; son: number; jamiMatn: number; jamiSon: number; bolim: number; foiz: number; oddiy: number };

function jamiVaraqXml(
  input: OfertaEksportInput,
  varaqlar: Array<{ nom: string; L: OfertaUstunHarflari }>,
  st: JamiStil,
): { xml: string; yakuniyHujayra: string; sarlavhaQatori: number; oxirgiQator: number } {
  const h = input.hisob;
  const rows: Array<YangiHujayra[]> = [];
  const put = (cells: YangiHujayra[]) => { rows.push(cells); return rows.length; };
  const sumifs = (kat: string) => varaqlar.length
    ? varaqlar.map((v) => `SUMIFS(${sheetRef(v.nom)}!${v.L.summa}:${v.L.summa},${sheetRef(v.nom)}!${v.L.kategoriya}:${v.L.kategoriya},"${kat}")`).join('+')
    : '0';
  const qator = (n: number | string, nom: string, oferta: YangiHujayra | null, manba: number | null, izoh = '', jami = false) => put([
    typeof n === 'number' ? numCell(0, jami ? st.jamiMatn : st.matn, n) : strCell(0, jami ? st.jamiMatn : st.matn, n),
    strCell(1, jami ? st.jamiMatn : st.matn, nom),
    oferta ?? bosCell(2, jami ? st.jamiSon : st.son),
    manba == null ? bosCell(3, jami ? st.jamiSon : st.son) : numCell(3, jami ? st.jamiSon : st.son, manba),
    strCell(4, jami ? st.jamiMatn : st.matn, izoh),
  ]);
  const bolim = (nom: string) => put([bosCell(0, st.bolim), strCell(1, st.bolim, nom), bosCell(2, st.bolim), bosCell(3, st.bolim), bosCell(4, st.bolim)]);

  put([strCell(1, st.jamiMatn, 'СВОДНЫЙ РАСЧЕТ ОФЕРТЫ ПОДРЯДЧИКА')]);
  put([strCell(1, st.oddiy, input.obyektNomi || '')]);
  put([strCell(1, st.oddiy, `Основание: ${input.manbaFaylNomi}`)]);
  put([]);
  const rSarlavha = rows.length + 1;
  put(['№ п/п', 'НАИМЕНОВАНИЕ', 'ОФЕРТА ПОДРЯДЧИКА, сум', 'ПО СМЕТЕ, сум', 'ПРИМЕЧАНИЕ'].map((t, i) => strCell(i, st.sarlavha, t)));
  put([1, 2, 3, 4, 5].map((n, i) => numCell(i, st.raqam, n)));

  bolim('ПРЯМЫЕ ЗАТРАТЫ ПО ВИДАМ РЕСУРСОВ');
  const katRow: Partial<Record<OfertaKategoriya, number>> = {};
  let n = 0;
  for (const kat of KAT_TARTIB) {
    if (kat === 'UNKNOWN' && !h.kategoriyaJami.UNKNOWN && !h.manbaKategoriyaJami.UNKNOWN && !h.qatorlar.some((q) => q.rol === 'RESOURCE' && q.samaraliKategoriya === 'UNKNOWN')) continue;
    katRow[kat] = qator(++n, KAT_NOMI[kat], fCell(2, st.son, sumifs(kat), h.kategoriyaJami[kat]), h.manbaKategoriyaJami[kat],
      kat === 'UNKNOWN' ? 'не входит в расчет — укажите категорию' : '');
  }
  const katQatorlari = Object.values(katRow) as number[];
  const rPr = qator('', 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', fCell(2, st.jamiSon, `SUM(C${Math.min(...katQatorlari)}:C${Math.max(...katQatorlari)})`, h.togridanJami), h.manbaTogridanJami, '', true);
  let rTransport: number | null = null;
  if (h.transportVaraqJami > 0 || h.transportSiyosati === 'varaq') {
    rTransport = qator('', 'Транспортные расходы по расчету (лист перевозки)', fCell(2, st.son, sumifs('TRANSPORT'), h.transportVaraqJami), null,
      h.transportSiyosati === 'varaq' ? 'принято вместо % транспорта материалов' : 'справочно — в расчет не входит');
  }

  put([]);
  bolim('НАЧИСЛЕНИЯ, %');
  const kRow: Record<string, number> = {};
  for (const kod of NAKRUTKA_KOEF_KODLAR) {
    kRow[kod] = put([bosCell(0, st.matn), strCell(1, st.matn, NAKRUTKA_KOEF_RU[kod]), numCell(2, st.foiz, h.koeffitsientlar[kod]), bosCell(3, st.son), bosCell(4, st.matn)]);
  }
  const K = (kod: string) => `C${kRow[kod]}`;
  const B = (kat: OfertaKategoriya) => (katRow[kat] ? `C${katRow[kat]}` : '0');
  const pct = (kod: string) => `${num(h.koeffitsientlar[kod as keyof typeof h.koeffitsientlar] as number)}%`;

  put([]);
  bolim('РАСЧЕТ СТОИМОСТИ');
  const x = h.kaskadXom, m = h.manbaKaskad;
  const c = (r: number) => `C${r}`;
  const step = (nom: string, f: string, v: number, mv: number | null, izoh: string, jami = false) =>
    qator('', nom, fCell(2, jami ? st.jamiSon : st.son, f, v), mv, izoh, jami);
  const rMat = step('Материалы всего (МАТ + М/К + КАБ + без склада)', `${B('МАТ')}+${B('М/К')}+${B('КАБ')}+${B('БЕЗСКЛАД')}`, h.asos.mat, null, '');
  const rPryam = step('Прямые затраты', c(rPr), x.pryamye, m.pryamye, 'труд + машины + материалы + оборудование');
  const rTrMat = step('Транспортные расходы — материалы',
    h.transportSiyosati === 'varaq' && rTransport ? c(rTransport) : `(${c(rMat)}-${B('КАБ')})*${K('ТРАНСПОРТ_МАТЕРИАЛ')}/100`,
    x.tr_mat, m.tr_mat, h.transportSiyosati === 'varaq' ? 'по листу перевозки' : `(материалы − кабель) × ${pct('ТРАНСПОРТ_МАТЕРИАЛ')}`);
  const rSkl = step('Заготовительно-складские расходы — материалы', `(${c(rMat)}-${B('БЕЗСКЛАД')}-${B('М/К')})*${K('СКЛАДСКИЕ_МАТЕРИАЛ')}/100+${B('М/К')}*${K('СКЛАДСКИЕ_МК')}/100`,
    x.skl_mat, m.skl_mat, `× ${pct('СКЛАДСКИЕ_МАТЕРИАЛ')}; М/К × ${pct('СКЛАДСКИЕ_МК')}`);
  const rTrKab = step('Транспортные расходы — кабель', `${B('КАБ')}*${K('ТРАНСПОРТ_КАБЕЛЬ')}/100`, x.tr_kab, m.tr_kab, `кабель × ${pct('ТРАНСПОРТ_КАБЕЛЬ')}`);
  const rI1 = step('ИТОГО 1 (без оборудования)', `${c(rPryam)}-${B('ОБ')}+${c(rTrMat)}+${c(rSkl)}+${c(rTrKab)}`, x.itogo1, m.itogo1, '', true);
  const rPro = step('Прочие расходы подрядчика', `${c(rI1)}*${K('ПРОЧИЕ_ПОДРЯДЧИК')}/100`, x.prochie, m.prochie, `ИТОГО 1 × ${pct('ПРОЧИЕ_ПОДРЯДЧИК')}`);
  const rI2 = step('ИТОГО 2', `${c(rI1)}+${c(rPro)}`, x.itogo2, m.itogo2, '', true);
  const rTrOb = step('Транспортные расходы — оборудование', `${B('ОБ')}*${K('ТРАНСПОРТ_ОБОРУД')}/100`, x.tr_ob, m.tr_ob, `оборудование × ${pct('ТРАНСПОРТ_ОБОРУД')}`);
  const rZag = step('Заготовительно-складские — оборудование', `${B('ОБ')}*${K('ЗАГОТ_СКЛАД_ОБОРУД')}/100`, x.zag_ob, m.zag_ob, `оборудование × ${pct('ЗАГОТ_СКЛАД_ОБОРУД')}`);
  const rI3 = step('ИТОГО 3', `${c(rI2)}+${B('ОБ')}+${c(rTrOb)}+${c(rZag)}`, x.itogo3, m.itogo3, 'ИТОГО 2 + оборудование', true);
  const rSt = step('Страхование', `${c(rI3)}*${K('СТРАХОВАНИЕ')}/100`, x.strax, m.strax, `ИТОГО 3 × ${pct('СТРАХОВАНИЕ')}`);
  const rRisk = step('Риск', `${c(rI3)}*${K('РИСК')}/100`, x.risk, m.risk, `ИТОГО 3 × ${pct('РИСК')}`);
  const rI4 = step('ИТОГО 4', `${c(rI3)}+${c(rSt)}+${c(rRisk)}`, x.itogo4, m.itogo4, '', true);
  const rNds = step('НДС', `${c(rI4)}*${K('НДС')}/100`, x.nds, m.nds, `ИТОГО 4 × ${pct('НДС')}`);
  const rVs = step('ВСЕГО', `${c(rI4)}+${c(rNds)}`, x.vsego, m.vsego, '', true);

  const unresolved = varaqlar.length ? varaqlar.map((v) => {
    const kat = `${sheetRef(v.nom)}!${v.L.kategoriya}:${v.L.kategoriya}`;
    const sum = `${sheetRef(v.nom)}!${v.L.summa}:${v.L.summa}`;
    return [`COUNTIFS(${kat},"UNKNOWN")`, ...OFERTA_KATEGORIYALAR.map((k) => `COUNTIFS(${kat},"${k}",${sum},"")`)].join('+');
  }).join('+') : '0';
  put([]);
  const rUn = put([bosCell(0, st.matn), strCell(1, st.matn, 'Позиции без цены или категории, шт.'), fCell(2, st.son, unresolved, h.halQilinmagan), bosCell(3, st.son),
    strCell(4, st.matn, h.halQilinmagan ? 'не включены в итог — см. перечень ниже' : '')]);
  const rFinal = put([bosCell(0, st.jamiMatn), strCell(1, st.jamiMatn, 'ИТОГО ОФЕРТА С НДС'),
    fCell(2, st.jamiSon, `ROUND(${c(rVs)},2)`, h.yakuniyOferta ?? ''), numCell(3, st.jamiSon, h.manbaKaskad.vsego), bosCell(4, st.jamiMatn)]);

  // Diqqat talab qiladigan pozitsiyalar — hujjatda ochiq ko‘rinadi.
  const diqqat = h.qatorlar.filter((q) => narxlanadiganmi(q) && q.muammolar.length);
  if (diqqat.length) {
    put([]);
    bolim(`ПОЗИЦИИ, ТРЕБУЮЩИЕ ВНИМАНИЯ (${diqqat.length})`);
    let i = 0;
    for (const q of diqqat) {
      qator(++i, `${q.nom}${q.birlik ? `, ${q.birlik}` : ''}`, null, q.smetaSumma, `${q.sourceSheet}, стр. ${q.sourceRow}: ${q.muammolar.map((mm) => SABAB_RU[mm] ?? mm).join('; ')}`);
    }
  }

  put([]); put([]);
  for (const tomon of IMZO_TOMONLARI) {
    put([strCell(1, st.oddiy, ofertaImzoMatni(tomon, input.imzo)), strCell(2, st.oddiy, IMZO_IMZO_CHIZIQ)]);
    put([strCell(1, st.oddiy, IMZO_IZOH), strCell(2, st.oddiy, `${IMZO_PODPIS}          ${IMZO_MP}`)]);
    put([]);
  }

  const sheetData = rows.map((cells, i) => {
    const r = i + 1;
    if (!cells.length) return `<row r="${r}"/>`;
    return `<row r="${r}">${[...cells].sort((a, b) => a.col - b.col).map((cl) => cl.xml(`${ustunHarfi(cl.col)}${r}`, cl.s)).join('')}</row>`;
  }).join('');
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
    + `<dimension ref="A1:E${rows.length}"/>`
    + '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + '<cols><col min="1" max="1" width="6" customWidth="1"/><col min="2" max="2" width="58" customWidth="1"/><col min="3" max="4" width="22" customWidth="1"/><col min="5" max="5" width="46" customWidth="1"/></cols>'
    + `<sheetData>${sheetData}</sheetData>`
    + '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>'
    + '<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>'
    + '</worksheet>';
  return { xml, yakuniyHujayra: `C${rFinal}`, sarlavhaQatori: rSarlavha, oxirgiQator: rows.length };
}

// ───────────────────────── workbook darajasi ─────────────────────────

/** Workbook varaqlari (nom → yo'l). Eski nom — mavjud chaqiruvchilar uchun. */
export const ofertaVaraqYollari = varaqYollari;


/**
 * Asl RES workbookini saqlagan holda oferta ustunlari va OFERTA_JAMI
 * varag'ini qo'shadi. Manba hujayralar o'zgarmaydi.
 */
export async function tenderOfertaXlsx(input: OfertaEksportInput): Promise<OfertaEksportNatija> {
  const src = input.manbaBytes instanceof Uint8Array ? input.manbaBytes : new Uint8Array(input.manbaBytes);
  const qisman = !isZip(src);
  const base = qisman ? await xlsdanXlsx(src) : src;
  const files = unzipSync(base);
  if (!files['xl/workbook.xml'] || !files['xl/styles.xml']) throw new Error('OOXML_TUZILMA_TOLIQ_EMAS: workbook.xml yoki styles.xml topilmadi');

  const st = zaxiraStillarQosh(strFromU8(files['xl/styles.xml']));
  let stylesXml = st.xml;

  const paths = ofertaVaraqYollari(files);
  let wbXml = strFromU8(files['xl/workbook.xml']);
  const selected = new Set(input.tanlanganVaraqlar);
  const ustunlar: OfertaEksportNatija['ustunlar'] = {};
  const jamiUchun: Array<{ nom: string; L: OfertaUstunHarflari }> = [];
  let namuna: UslubNamuna | null = null;
  for (const tahlil of input.tahlillar) {
    if (!selected.has(tahlil.nom) || tahlil.role === 'lrv' || !tahlil.ustunlar) continue;
    if (tahlil.alternativVaraq && selected.has(tahlil.alternativVaraq)) continue;
    const qatorlar = input.hisob.qatorlar.filter((q) => q.sourceSheet === tahlil.nom);
    if (!qatorlar.length) continue;
    const idx = paths.findIndex((pp) => pp.name === tahlil.nom);
    const path = paths[idx]?.path;
    if (!path || !files[path]) throw new Error(`VARAQ_TOPILMADI: ${tahlil.nom}`);
    const xml = strFromU8(files[path]);
    const xarita = varaqXaritasi(xml);
    const q = varaqPatchQur(tahlil, qatorlar, xarita, xml, st.s, input.imzo);
    files[path] = strToU8(sahifaEnigaSigdir(varaqniPatchla(xml, q.patch, xarita)));
    const jadvalOxiri = Math.max(...qatorlar.map((r) => r.sourceRow));
    wbXml = printAreaKengaytir(wbXml, idx, q.patch.oraliq[1], jadvalOxiri, Math.max(...q.patch.rows.keys()));
    // H4: egasi sarlavha takrorini qo'ymagan bo'lsa — jadval sarlavhasi (1-2-3 raqam qatorigacha) har sahifada.
    wbXml = definedNameQosh(wbXml, '_xlnm.Print_Titles', idx, printTitlesQiymati(tahlil.nom, q.sarlavha[0], q.sarlavha[1]));
    namuna ??= q.namuna;
    ustunlar[tahlil.nom] = q.harflar;
    jamiUchun.push({ nom: tahlil.nom, L: q.harflar });
  }
  files['xl/workbook.xml'] = strToU8(wbXml);

  const n = namuna ?? {};
  const foiz = xfNusxa(stylesXml, n.son ?? st.s.son, 2);
  stylesXml = foiz.xml;
  files['xl/styles.xml'] = strToU8(stylesXml);
  const jamiStil: JamiStil = {
    sarlavha: n.sarlavha ?? st.s.header, raqam: n.raqam ?? n.sarlavha ?? st.s.header, matn: n.matn ?? st.s.text, son: n.son ?? st.s.son,
    jamiMatn: n.jamiMatn ?? st.s.jamiMatn, jamiSon: n.jamiSon ?? st.s.jami, bolim: n.bolim ?? n.jamiMatn ?? st.s.jamiMatn,
    foiz: foiz.s ?? st.s.foiz, oddiy: n.oddiy ?? 0,
  };

  const mavjud = new Set(paths.map((pp) => pp.name.toUpperCase()));
  let jamiVaraq = 'OFERTA_JAMI';
  for (let i = 2; mavjud.has(jamiVaraq.toUpperCase()); i++) jamiVaraq = `OFERTA_JAMI_${i}`;
  const jami = jamiVaraqXml(input, jamiUchun, jamiStil);
  workbookgaVaraqQosh(files, jamiVaraq, jami.xml);
  // H4: yakuniy varaq — chop hududi butun hujjat + imzo, sarlavha har sahifada.
  let wb2 = strFromU8(files['xl/workbook.xml']);
  wb2 = definedNameQosh(wb2, '_xlnm.Print_Area', paths.length, printAreaQiymati(jamiVaraq, 4, jami.oxirgiQator));
  wb2 = definedNameQosh(wb2, '_xlnm.Print_Titles', paths.length, printTitlesQiymati(jamiVaraq, jami.sarlavhaQatori, jami.sarlavhaQatori + 1));
  files['xl/workbook.xml'] = strToU8(wb2);

  // Asl ZIP'dagi yozuvlar tartibi saqlanadi; yangi qismlar oxirida.
  const zippable: Zippable = {};
  for (const [k, v] of Object.entries(files)) zippable[k] = [v, { level: 6 }];
  const bytes = zipSync(zippable);
  return { bytes, faylNomi: ofertaFaylNomi(input.manbaFaylNomi, qisman, input.sana), saqlanish: qisman ? 'qisman' : 'toliq', ustunlar, jamiVaraq, yakuniyHujayra: jami.yakuniyHujayra };
}
