/**
 * lrv-plus-export.ts — T2-LRV-PLUS-EXPORT-003
 *
 * Ustun tartibi HAQIQIY Tizim-1 LRV_PLUS fayli bilan bir xil (Drive'dan
 * yuklab olinib, formulalari bayt darajasida o'rganilgan). Egasining
 * v2 ustidan bergan tuzatishlari (2026-09-09) shu yerda yopilgan:
 *
 *   - «MARKIROVKA I GA KO'CHISHI KERAK»  → ТИП endi I ustunida (T1 dagidek).
 *   - «J K L M N O ham qiymatlarni formula bilan olishi kerak»
 *                                        → kategoriya ustunlari `=H{qator}`.
 *
 * Egasi (2026-09-24): «formulalarda $ dan iloji boricha foydalanmaydigan
 * qilib ber, qayergadir ko'chirsam boshqa joylardan qiymat o'qib qoladi» →
 * hamma formula nisbiy (T1 dagi `$` olib tashlandi). «ish turida summa
 * turgan H dan oldingi bo'sh katakda bir birlik narxi» → bl qatorida G.
 *   - «eng keraklisi H gacha, shu yergacha jadval aniqroq chizilsin»
 *                                        → A..H chegaralari qalinroq.
 *   - «har bir ish turi va razdellar ichidagi bolachalari bilan
 *      gruppirovka bo'lsin»              → Excel outline (yig'iladigan qator).
 *   - «X va Y kerak emas — eski tizim shundan ierarxiya ko'rgan»
 *                                        → РАЗДЕЛ/ВИД РАБОТ ustunlari olib
 *                                          tashlandi; ierarxiya endi guruhlash.
 *
 * Ustunlar:
 *   A №  B КОД  C НАИМЕНОВАНИЕ  D ЕД.ИЗМ.  E ҲАЖМ(ед)  F ҲАЖМ(жами)
 *   G НАРХ  H СУММА  I ТИП  J ЧЕЛ  K МАШ  L МАТ  M ОБ  N КАБ  O М/К
 *   P ФАКТ ҳажм  Q ОСТАТКА ҳажм  R F2 ОЛИНГАН ҳажм  S F2 МУМКИН ҳажм
 *   T ФАКТ сумма  U ОСТАТКА сумма  V F2 ОЛИНГАН сумма  W F2 МУМКИН сумма
 *   X Даража (yashirin — SUMIF ota-bola filtri uchun)
 *
 * Formulalar (T1 naqshi):
 *   F(rs, bl ostida) = E(norma) × F(ota bl)
 *   H(barg)          = F × G
 *   H(bl/rz)         = bevosita bolalar yig'indisi (SUMIF, yashirin X bo'yicha)
 *   G(bl)            = IF(N(F)=0,"",H/F) — ishning bir birlik narxi
 *   J..O             = `=H{qator}` — faqat mos kategoriyada, faqat bargda
 *   Q = F − P        (ostatka ҳажм)
 *   S = P − R        (F2 olinishi mumkin = fakt − olingan)
 *   U = H − T        (ostatka сумма)
 *   W = T − V        (F2 mumkin сумма)
 *
 * `xlsx-js-style` ishlatiladi: oddiy SheetJS Community yozishda katak
 * rangini/chegarasini UMUMAN qo'llab-quvvatlamaydi (Pro xususiyat).
 */
import type { T2Qator, T2QatorHolat } from '../api/supabase';
import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import { lrvKalitYoz } from './lrv-qayta-import';
import { resursVedomostAoa } from './resurs-vedomost';
import { boshKeshQoy, chopNomlariAbsolyut, ogohlantirishlarniOchir, bugunSana, hujjatFaylNomi, imzoMatni, imzoMuhrli, imzoTomonlari, IMZO_IMZO_CHIZIQ, IMZO_IZOH, IMZO_IZOH_SHAXS, IMZO_MP, IMZO_PODPIS, type ImzoNomlar } from './hujjat-yozuvchi';

/**
 * `toliq` — butun LRV_PLUS (A..W + yashirin Даража).
 * `forma2` — egasining talabi (2026-09-09): «forma 2 xuddi lrv plusni O
 * ustunigacha bo'lgan qismi bilan bir xil bo'lishi shart, faqat sarlavha
 * o'zgaradi va tagida nakrutkalarni hisoblangan jadvali qo'shilishi kerak.
 * qolgan hammasi — formuladan tortib shakl-shamoyilgacha — LRV_PLUS bilan
 * bir xil.» Ya'ni bu ALOHIDA hujjat emas, LRV_PLUSning O gacha kesilgani.
 */
export type LrvPlusRejim = 'toliq' | 'forma2';

export type LrvPlusOptions = {
  rejim?: LrvPlusRejim;
  /** Sarlavha matni. Berilmasa — obyekt nomi (LRV_PLUS odatiy holati). */
  sarlavha?: string;
  davr?: string;
  raqam?: string;
  buyurtmachi?: string;
  pudratchi?: string;
  /**
   * Egasi (2026-09-09): «bu nakrutka qatorlari aslida lrv plusda ham
   * bo'lishi hisoblanishi kerak, bo'lmasa butun tizimda summalar faqat
   * primoy zatratda hisoblanib qoladi.» Ya'ni ikkala rejimda ham (`toliq`
   * VA `forma2`) berilsa qo'shiladi — alohida emas.
   *
   * Koeffitsientlar (foizlar) beriladi, hisoblangan kaskad EMAS — jadval
   * Excelning o'zida `t2_nakrutka_hisobla_v1` bilan BAYT-BAYTIGA bir xil
   * formula bilan quriladi (`nakrutkaKaskadYoz`), shunda foizni Excelda
   * o'zgartirsa butun zanjir qayta hisoblanadi.
   */
  nakrutka?: NakrutkaKoeffitsientlar;
  /** Imzo blokidagi tomonlar (saytdan; bo'sh — chiziq). */
  imzo?: ImzoNomlar;
};

export interface LrvPlusQator {
  /** Kanonik `t2_qator.id` — fayl qaytib kelganda ANIQ moslashtirish uchun.
   *  Kod bo'yicha moslashtirib bo'lmaydi: `000001` bitta obyektda 852 marta
   *  uchraydi. Faylga yashirin ustun sifatida yoziladi. */
  id: number;
  /** 1-indeksli chiqish (sheet) qatori. */
  row: number;
  no: number;
  kod: string;
  nom: string;
  birlik: string;
  tur: string;
  kat: string;
  /** E — bir birlikka: rs uchun NORMA, qolganlar uchun o'z hajmi. */
  birlikHajm: number | null;
  /** F — jami hajm. Formula bo'lsa '=' siz matn. */
  obyomFormula: string | null;
  obyomQiymat: number | null;
  /** G — birlik narxi (faqat barglarda). */
  narx: number | null;
  /** H — formula ('=' siz), bo'sh bo'lsa qiymat ishlatiladi. */
  summaFormula: string | null;
  summaQiymat: number | null;
  faktHajm: number;
  faktSumma: number;
  f2Hajm: number;
  f2Summa: number;
  /** X (yashirin) va Excel outline darajasi. */
  daraja: number;
}

export type LrvPlusExportContext = {
  kompaniyaId: number;
  loyihaId: number;
  obyektId: number;
  davrId: string;
  sourceDocumentId: string;
  revisionId: string;
  /** Read model to‘liq ekanini server/read-layer isbotlagan bo‘lishi shart. */
  dataComplete: boolean;
  /** Registry SHA-256 provenance. IXTIYORIY: berilsa "МАНБА" varag'iga
   *  yoziladi, berilmasa eksport to'silmaydi (2026-09-11 dan). */
  sourceChecksum?: string | null;
  /**
   * ⚠️ 2026-09-10 (haqiqiy nosozlik, egasi "Karting2"da topdi): `davrId`
   * ro'yxati F2 akt reestridan olinadi (`PTOWorkspaceContext`) -- YANGI
   * obyektda hali birorta ham F2 akt yo'q bo'lsa, ro'yxat BO'SH bo'ladi va
   * foydalanuvchi hech qachon `davr` tanlay olmaydi -- LRV Excel eksporti
   * ABADIY bloklanib qolardi, aynan F2/Fakt hali boshlanmagan (eng ko'p
   * kerak bo'ladigan) bosqichda. Chaqiruvchi shu bayroqni `false` qilib
   * yuborsa (obyektda haqiqatan ham tanlanadigan davr yo'qligini
   * TASDIQLAB), `davrId` talabi qo'yilmaydi -- chunki "davr tanlash"
   * F2 tarixi mavjud bo'lgandagina ma'noli. Berilmasa (`undefined`) --
   * eski qat'iy xatti-harakat saqlanadi (orqaga moslik).
   */
  periodApplicable?: boolean;
};

export type LrvPlusExportGate =
  | { ok: true }
  | { ok: false; reasons: string[] };

function positiveSafeId(value: number | undefined): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/* ⚠️ 2026-09-11 (egasi ko'rsatmasi, "shu tepadagi belgilanadigan joy naxxuy
 * kerak o'zi ... nima uchun so'rayapdi shuni?" — ikkinchi marta so'radi):
 * eksport gate'i endi FAQAT haqiqiy zaruriy shartlarni talab qiladi —
 * qaysi obyekt (`OBJECT_CONTEXT_REQUIRED`) va ma'lumot to'la yuklanganmi
 * (`READ_MODEL_NOT_COMPLETE`). Kompaniya ham tekshiriladi (jurnal/kontekst
 * uchun, doim mavjud).
 *
 * Avval bu yerda HERM-001 provenance siyosati bor edi: manba hujjat +
 * revision + sha256 tanlanmasa eksport BUTUNLAY bloklanardi. Amalda:
 *   1) bu maydonlar hech qayerga (fayl ichiga ham, jurnal ham) yozilmasdi —
 *      ya'ni talab qilinardi, lekin qiymati yo'q edi;
 *   2) yangi/ko'p obyektda "hujjat markazi"da yozuv bo'lmagani uchun eksport
 *      abadiy bloklanardi (egasi Stella/Karting2'da aynan shunga urildi).
 * Shuning uchun manba/revision/davr endi IXTIYORIY provenance — berilsa,
 * `lrvPlusFaylBaytlari` ularni faylning "МАНБА" varag'iga yozadi (pastga
 * qarang); berilmasa eksport to'silmaydi. Reason-kod satrlari (masalan
 * `SOURCE_CHECKSUM_REQUIRED`) type ichida qoldirilgan — kelajakda siyosat
 * qayta yoqilsa yoki jurnalga yozilsa ishlatiladi. */
export function lrvPlusEksportGate(context: Partial<LrvPlusExportContext> | null | undefined): LrvPlusExportGate {
  const reasons: string[] = [];
  const kompaniyaId = context?.kompaniyaId;
  const obyektId = context?.obyektId;
  if (!positiveSafeId(kompaniyaId)) reasons.push('COMPANY_CONTEXT_REQUIRED');
  if (!positiveSafeId(obyektId)) reasons.push('OBJECT_CONTEXT_REQUIRED');
  if (context?.dataComplete !== true) reasons.push('READ_MODEL_NOT_COMPLETE');
  return reasons.length ? { ok: false, reasons } : { ok: true };
}

export class LrvPlusExportBlockedError extends Error {
  readonly code = 'LRV_PLUS_EXPORT_BLOCKED';
  readonly reasons: string[];

  constructor(reasons: string[]) {
    super('LRV_PLUS eksporti uchun provenance/context yetarli emas: ' + reasons.join(', '));
    this.name = 'LrvPlusExportBlockedError';
    this.reasons = reasons;
  }
}

const LEAF_TUR = new Set(['rs', 'mat', 'ob']);
const OTA_TUR = new Set(['rz', 'bl']);

/** `t2_qator.kat` — migration CHECK bilan tasdiqlangan aniq qiymatlar. */
const KAT_USTUN: Record<string, string> = {
  'ЧЕЛ': 'J', 'МАШ': 'K', 'МАТ': 'L', 'ОБ': 'M', 'КАБ': 'N', 'М/К': 'O',
};
const KAT_TARTIB = ['ЧЕЛ', 'МАШ', 'МАТ', 'ОБ', 'КАБ', 'М/К'];

/** Eksportdagi ko‘rinish uchun ham shu tartib saqlanadi. Qavatlar, bo‘lim
 *  nomining takrorlari yoki qator raqami hech qachon yangi haqiqat sifatida
 *  qo‘shilmaydi — ular TIZIM_02 kanonik daraxtida mavjud emas. */
const KAT_INDEX = new Map(KAT_TARTIB.map((kat, index) => [kat, index]));

/** Yashirin Даража ustuni har doim OXIRGI ustun: to'liq rejimda `X`,
 *  Forma-2 (O gacha kesilgan) rejimda `P`. SUMIF shu ustunga tayanadi. */
export const LRV_DARAJA_USTUN: Record<LrvPlusRejim, string> = { toliq: 'X', forma2: 'Q' };

export function lrvPlusQatorlarniHisobla(
  qatorlar: T2Qator[], holatlar?: T2QatorHolat[], darajaUstun = 'X',
): LrvPlusQator[] {
  const rows = [...qatorlar].sort((a, b) => (a.tartib ?? 0) - (b.tartib ?? 0));
  const DATA_START = 4; // 1: obyekt nomi, 2: sarlavhalar, 3: ЖАМИ, 4+: ma'lumot

  const byId = new Map<number, T2Qator>();
  for (const q of rows) byId.set(q.id, q);

  const holatById = new Map<number, T2QatorHolat>();
  if (holatlar) for (const h of holatlar) holatById.set(h.qator_id, h);

  const rowOf = new Map<number, number>();
  rows.forEach((q, i) => rowOf.set(q.id, DATA_START + i));

  /** Ota (rz/bl) uchun to'liq nasl oralig'i; SUMIF shu oraliqda ishlaydi,
   *  `daraja+1` filtri faqat bevosita bolalarni oladi. */
  const span = new Map<number, { c1: number; c2: number }>();
  for (let i = 0; i < rows.length; i++) {
    const daraja = rows[i].daraja ?? 0;
    let j = i + 1;
    while (j < rows.length && (rows[j].daraja ?? 0) > daraja) j++;
    if (j > i + 1) span.set(rows[i].id, { c1: DATA_START + i + 1, c2: DATA_START + j - 1 });
  }

  const out: LrvPlusQator[] = [];
  for (let i = 0; i < rows.length; i++) {
    const q = rows[i];
    const r = DATA_START + i;
    const daraja = q.daraja ?? 0;
    const tur = q.tur ?? '';
    const parent = q.ota_id != null ? byId.get(q.ota_id) : undefined;
    const parentRow = q.ota_id != null ? rowOf.get(q.ota_id) : undefined;
    const h = holatById.get(q.id);

    // ⚠️ 2026-09-10 (owner): E (ҲАЖМ ед) faqat rs/bl-norma holatida ma'noli
    // ("bir birlikka" normasi) -- boshqa hamma tur uchun (bl/mat/ob va
    // normasiz rs) bu ustun F (ҲАЖМ жами) bilan AYNAN bir xil sonni
    // ikkinchi marta yozardi (formulalar hech qachon E'ga murojaat
    // qilmaydi -- faqat F ishlatiladi). Endi bunday holatda E bo'sh qoladi.
    let birlikHajm: number | null = null;
    let obyomFormula: string | null = null;
    let obyomQiymat: number | null = q.hajm ?? null;
    let narx: number | null = null;
    let summaFormula: string | null = null;
    let summaQiymat: number | null = q.summa ?? null;

    if (tur === 'rs' && parent?.tur === 'bl' && parentRow != null && q.norma != null && q.norma > 0) {
      // T1: ҲАЖМ(жами) = НОРМА × ota bl ning ҲАЖМ(жами)si.
      birlikHajm = q.norma;
      obyomFormula = `E${r}*F${parentRow}`;
    }

    if (LEAF_TUR.has(tur)) {
      narx = q.narx ?? null;
      // Hajm yoki narx noma'lum — natija bo'sh (Excel 0 chiqarmasin: NULL ≠ 0).
      summaFormula = `IF(OR(F${r}="",G${r}=""),"",F${r}*G${r})`;
      // Missing input is unknown, not zero. The formula remains live in
      // Excel, but its cached value stays blank until both inputs are known.
      summaQiymat = obyomQiymat != null && narx != null ? obyomQiymat * narx : null;
    } else if (OTA_TUR.has(tur)) {
      const sp = span.get(q.id);
      // Bevosita bolalardan birortasining summasi noma'lum bo'lsa — ota ham noma'lum.
      if (sp) summaFormula = `IF(COUNTIFS(${darajaUstun}${sp.c1}:${darajaUstun}${sp.c2},${daraja + 1},H${sp.c1}:H${sp.c2},"")>0,"",SUMIF(${darajaUstun}${sp.c1}:${darajaUstun}${sp.c2},${daraja + 1},H${sp.c1}:H${sp.c2}))`;
      // No known children -- unknown, not a fabricated zero (Constitution:
      // NULL is never silently converted to zero).
      else summaQiymat = null;
    }

    out.push({
      id: q.id, row: r, no: i + 1, kod: q.kod ?? '', nom: q.nom ?? '', birlik: q.birlik ?? '', tur,
      kat: q.kat ?? '', birlikHajm, obyomFormula, obyomQiymat, narx, summaFormula, summaQiymat,
      faktHajm: h ? h.fakt_hajm : 0, faktSumma: h ? h.fakt_summa : 0,
      f2Hajm: h ? h.f2_hajm : 0, f2Summa: h ? h.f2_summa : 0,
      daraja,
    });
  }

  // Teskari o'tish: rz/bl ning keshlangan SUMMASI bazadagi `summa`ga emas,
  // o'zi hisoblangan bolalar yig'indisiga tayanadi.
  for (let i = rows.length - 1; i >= 0; i--) {
    const item = out[i];
    if (!OTA_TUR.has(item.tur) || !item.summaFormula) continue;
    let sum = 0;
    let hasChild = false;
    let unknownChild = false;
    // Egasi 2026-09-30: "F2 kiritilgandan keyin LRV Excel da F2 umuman 0" — `t2_qator_holat` fakt/F2
    // pulini faqat barglarda saqlaydi; ota qatorda ham bolalar yig'indisi (Excel da SUMIF formulasi).
    let fakt = 0, f2 = 0;
    for (let j = i + 1; j < rows.length && (rows[j].daraja ?? 0) > item.daraja; j++) {
      if ((rows[j].daraja ?? 0) !== item.daraja + 1) continue;
      hasChild = true;
      const childSum = out[j].summaQiymat;
      if (childSum == null) unknownChild = true;
      else sum += childSum;
      fakt += out[j].faktSumma; f2 += out[j].f2Summa;
    }
    item.summaQiymat = hasChild && !unknownChild ? sum : null;
    if (hasChild) { item.faktSumma = fakt; item.f2Summa = f2; }
  }

  return out;
}

/** Ildiz (daraja=0) qatorlar yig'indisi — ular allaqachon butun naslning
 *  jami qiymati, shuning uchun ikki marta sanalmaydi. */
export function lrvPlusJamiFormula(qatorlar: LrvPlusQator[], ustun: string, darajaUstun = 'X'): string | null {
  if (!qatorlar.length) return null;
  const c1 = qatorlar[0].row, c2 = qatorlar[qatorlar.length - 1].row;
  return `IF(COUNTIFS(${darajaUstun}${c1}:${darajaUstun}${c2},0,${ustun}${c1}:${ustun}${c2},"")>0,"",SUMIF(${darajaUstun}${c1}:${darajaUstun}${c2},0,${ustun}${c1}:${ustun}${c2}))`;
}

/**
 * Ish (bl) qatorining birlik narxi — G katagi, H (summa) dan oldingi bo'sh joy.
 * Hajm bo'sh yoki 0 bo'lsa katak bo'sh qoladi (soxta 0 / #DIV/0! emas).
 */
export function lrvPlusBirlikNarxFormula(row: number): string {
  return `IF(OR(H${row}="",N(F${row})=0),"",H${row}/F${row})`;
}

export const LRV_PLUS_USTUNLAR = [
  '№', 'КОД', 'НАИМЕНОВАНИЕ', 'ЕД.ИЗМ.', 'ҲАЖМ (ед)', 'ҲАЖМ (жами)', 'НАРХ', 'СУММА',
  'ТИП', 'ЧЕЛ', 'МАШ', 'МАТ', 'ОБ', 'КАБ', 'М/К',
  'ФАКТ ҳажм', 'ОСТАТКА ҳажм', 'F2 ОЛИНГАН ҳажм', 'F2 ОЛИНИШИ МУМКИН ҳажм',
  'ФАКТ сумма', 'ОСТАТКА сумма', 'F2 ОЛИНГАН сумма', 'F2 ОЛИНИШИ МУМКИН сумма',
  'Даража', 'КАЛИТ',
] as const;

/** Forma-2: A..O — LRV_PLUS bilan AYNAN bir xil; keyin hujjatning o'z
 *  ustunlari. `ЗАМЕЧАНИЕ` — buyurtmachi qo'lda yozadigan ustun; `Даража` va
 *  `ID` yashirin (`ID` qaytib kelgan faylni aniq moslashtirish uchun). */
export const LRV_FORMA2_USTUNLAR = [
  ...LRV_PLUS_USTUNLAR.slice(0, 15), 'ЗАМЕЧАНИЕ', 'Даража', 'КАЛИТ',
] as const;

/** Fayl qaysi obyekt/davrga tegishli ekanini mashina o'qiy oladigan belgi —
 *  tahrirlangan fayl BOSHQA obyektga import qilinib ketmasligi uchun. */
export const LRV_BELGI_PREFIKS = 'T2-LRV/';
export function lrvBelgiYoz(obyektId: number, davr: string, rejim: LrvPlusRejim): string {
  return `${LRV_BELGI_PREFIKS}${rejim};obyekt=${obyektId};davr=${davr || '-'};v=1`;
}
export function lrvBelgiOqi(matn: unknown): { rejim: string; obyektId: number; davr: string } | null {
  const s = String(matn ?? '');
  if (!s.startsWith(LRV_BELGI_PREFIKS)) return null;
  const q = s.slice(LRV_BELGI_PREFIKS.length);
  const rejim = q.split(';')[0] || '';
  const obyekt = Number(/obyekt=(\d+)/.exec(q)?.[1] ?? NaN);
  const davr = /davr=([^;]*)/.exec(q)?.[1] ?? '';
  return Number.isFinite(obyekt) ? { rejim, obyektId: obyekt, davr } : null;
}

const CHIZIQ = { style: 'thin', color: { rgb: 'D9E1E8' } } as const;
const QALIN = { style: 'medium', color: { rgb: '78909C' } } as const;

/** Guruh chegaralari ichki kataklarni og‘ir panjaraga aylantirmasdan
 *  `ISH / KATEGORIYA / FAKT-F2 / NAZORAT` zonalarini ajratadi. */
const GURUH_BOSHI = new Set([0, 8, 9, 15, 19, 23]);
const GURUH_OXIRI = new Set([7, 8, 14, 18, 22, 24]);

function chegara(c: number) {
  return {
    top: CHIZIQ,
    bottom: CHIZIQ,
    left: GURUH_BOSHI.has(c) ? QALIN : CHIZIQ,
    right: GURUH_OXIRI.has(c) ? QALIN : CHIZIQ,
  };
}

/** T1 `00_Config.js` CFG.RANG: rz sariq, bl ko'k + oq shrift, mat yashil. */
const RANG: Record<string, { fill?: { patternType: string; fgColor: { rgb: string } }; font?: { bold?: boolean; color?: { rgb: string } } }> = {
  rz: { fill: { patternType: 'solid', fgColor: { rgb: 'FFFF00' } }, font: { bold: true } },
  bl: { fill: { patternType: 'solid', fgColor: { rgb: '4A86E8' } }, font: { bold: true, color: { rgb: 'FFFFFF' } } },
  mat: { fill: { patternType: 'solid', fgColor: { rgb: 'D9EAD3' } } },
  ob: { fill: { patternType: 'solid', fgColor: { rgb: 'EDE7F6' } } },
};

const HEADER_RANG: Array<{ from: number; to: number; rgb: string }> = [
  { from: 0, to: 7, rgb: '1F4E78' },   // Ish
  { from: 8, to: 8, rgb: '455A64' },   // Tur
  { from: 9, to: 14, rgb: '2F6F75' },  // Resurs toifalari
  { from: 15, to: 18, rgb: '5B4B8A' }, // Fakt/F2 hajm
  { from: 19, to: 22, rgb: '7A5C2E' }, // Fakt/F2 summa
  { from: 23, to: 24, rgb: '546E7A' }, // Texnik metadata (yashirin)
];

function headerRang(c: number): string {
  return HEADER_RANG.find((g) => c >= g.from && c <= g.to)?.rgb ?? '1F4E78';
}

function qatorBalandligi(nom: string, tur: string): number {
  const matn = String(nom || '').replace(/\r/g, '');
  const satrlar = matn.split('\n').reduce((jami, satr) => jami + Math.max(1, Math.ceil(satr.length / (tur === 'rz' || tur === 'bl' ? 56 : 68))), 0);
  return Math.min(78, Math.max(22, 22 + (Math.min(5, satrlar) - 1) * 13));
}

/**
 * Nakrutka kaskadi jadvalining bitta qatori. `pctKoef` berilsa E ustunida
 * TAHRIRLANADIGAN foiz katagi chiqadi (literal son); `summaFormula` shu
 * foiz katagiga va yuqoridagi qatorlarga/`J3..O3` kategoriya jamilariga
 * tayanadi — Excelning o'zida qayta hisoblanadi.
 */
type NakrutkaQator = {
  label: string;
  pctKoef: keyof NakrutkaKoeffitsientlar | null;
  /** `r` — shu qatorning o'zi yozilayotgan Excel qator raqami. */
  summaFormula: (r: number) => string;
  /**
   * Kutilgan JS qiymati — .v keshi to'g'ri bo'lishi uchun. `summaOldin[i]`
   * — i-INDEKSLI (0-based) OLDINGI qatorning ALLAQACHON hisoblangan
   * summasi (FOIZLAR bu massivga KIRMAYDI — faqat summa, aralashtirilmasin).
   */
  summaJS: (kat: NakrutkaHisob, koef: NakrutkaKoeffitsientlar, summaOldin: number[]) => number;
  jami?: boolean;
};

type NakrutkaHisob = {
  chel: number; mash: number; mat: number; ob: number; kab: number; mk: number;
};

/**
 * `t2_nakrutka_hisobla_v1` (migratsiya `20261014090000`) bilan BAYT-
 * BAYTIGA bir xil kaskad — endi Excel formula sifatida. `mat` bu yerda
 * TO'LIQ bucket (МАТ+КАБ+М/К), server RPC'dagi bilan bir xil semantika;
 * `kab`/`mk` undan formulada QAYTA ayiriladi.
 */
function nakrutkaQatorlarQur(): NakrutkaQator[] {
  return [
    {
      label: 'Прямые затраты (ЧЕЛ+МАШ+МАТ+ОБ)', pctKoef: null,
      summaFormula: () => '=ROUND(J3+K3+L3+M3+N3+O3,2)',
      summaJS: (kat) => kat.chel + kat.mash + kat.mat + kat.ob,
    },
    {
      label: 'Транспорт (материалы)', pctKoef: 'ТРАНСПОРТ_МАТЕРИАЛ',
      summaFormula: (r) => `=ROUND((L3+O3)*E${r}/100,2)`,
      summaJS: (kat, koef) => (kat.mat - kat.kab) * (koef.ТРАНСПОРТ_МАТЕРИАЛ ?? 0) / 100,
    },
    {
      label: 'Складские (материалы)', pctKoef: 'СКЛАДСКИЕ_МАТЕРИАЛ',
      summaFormula: (r) => `=ROUND((L3+N3)*E${r}/100,2)`,
      summaJS: (kat, koef) => (kat.mat - kat.mk) * (koef.СКЛАДСКИЕ_МАТЕРИАЛ ?? 0) / 100,
    },
    {
      label: 'Складские (М/К)', pctKoef: 'СКЛАДСКИЕ_МК',
      summaFormula: (r) => `=ROUND(O3*E${r}/100,2)`,
      summaJS: (kat, koef) => kat.mk * (koef.СКЛАДСКИЕ_МК ?? 0) / 100,
    },
    {
      label: 'Транспорт (кабель)', pctKoef: 'ТРАНСПОРТ_КАБЕЛЬ',
      summaFormula: (r) => `=ROUND(N3*E${r}/100,2)`,
      summaJS: (kat, koef) => kat.kab * (koef.ТРАНСПОРТ_КАБЕЛЬ ?? 0) / 100,
    },
    {
      label: 'ИТОГО-1 (прямые − ОБ + транспорт/склад)', pctKoef: null,
      summaFormula: (r) => `=ROUND(F${r - 5}-M3+F${r - 4}+F${r - 3}+F${r - 2}+F${r - 1},2)`,
      summaJS: (kat, _koef, s) => s[0] - kat.ob + s[1] + s[2] + s[3] + s[4],
      jami: true,
    },
    {
      label: 'Прочие расходы подрядчика', pctKoef: 'ПРОЧИЕ_ПОДРЯДЧИК',
      summaFormula: (r) => `=ROUND(F${r - 1}*E${r}/100,2)`,
      summaJS: (_kat, koef, s) => s[5] * (koef.ПРОЧИЕ_ПОДРЯДЧИК ?? 0) / 100,
    },
    {
      label: 'ИТОГО-2', pctKoef: null,
      summaFormula: (r) => `=ROUND(F${r - 2}+F${r - 1},2)`,
      summaJS: (_kat, _koef, s) => s[5] + s[6],
      jami: true,
    },
    {
      label: 'Транспорт (оборудование)', pctKoef: 'ТРАНСПОРТ_ОБОРУД',
      summaFormula: (r) => `=ROUND(M3*E${r}/100,2)`,
      summaJS: (kat, koef) => kat.ob * (koef.ТРАНСПОРТ_ОБОРУД ?? 0) / 100,
    },
    {
      label: 'Заготовительно-складские (оборудование)', pctKoef: 'ЗАГОТ_СКЛАД_ОБОРУД',
      summaFormula: (r) => `=ROUND(M3*E${r}/100,2)`,
      summaJS: (kat, koef) => kat.ob * (koef.ЗАГОТ_СКЛАД_ОБОРУД ?? 0) / 100,
    },
    {
      label: 'ИТОГО-3 (+ ОБ + транспорт/заготовка)', pctKoef: null,
      summaFormula: (r) => `=ROUND(F${r - 3}+M3+F${r - 2}+F${r - 1},2)`, // ИТОГО-2 + ОБ + транспорт + заготовка
      summaJS: (kat, _koef, s) => s[7] + kat.ob + s[8] + s[9],
      jami: true,
    },
    {
      label: 'Страхование объекта', pctKoef: 'СТРАХОВАНИЕ',
      summaFormula: (r) => `=ROUND(F${r - 1}*E${r}/100,2)`,
      summaJS: (_kat, koef, s) => s[10] * (koef.СТРАХОВАНИЕ ?? 0) / 100,
    },
    {
      label: 'Риск', pctKoef: 'РИСК',
      summaFormula: (r) => `=ROUND(F${r - 2}*E${r}/100,2)`,
      summaJS: (_kat, koef, s) => s[10] * (koef.РИСК ?? 0) / 100,
    },
    {
      label: 'ИТОГО-4', pctKoef: null,
      summaFormula: (r) => `=ROUND(F${r - 3}+F${r - 2}+F${r - 1},2)`,
      summaJS: (_kat, _koef, s) => s[10] + s[11] + s[12],
      jami: true,
    },
    {
      label: 'НДС', pctKoef: 'НДС',
      summaFormula: (r) => `=ROUND(F${r - 1}*E${r}/100,2)`,
      summaJS: (_kat, koef, s) => s[13] * (koef.НДС ?? 0) / 100,
    },
    {
      label: 'ВСЕГО (с учётом накрутки и НДС)', pctKoef: null,
      summaFormula: (r) => `=ROUND(F${r - 2}+F${r - 1},2)`,
      summaJS: (_kat, _koef, s) => s[13] + s[14],
      jami: true,
    },
  ];
}

/**
 * Nakrutka kaskadi jadvalini `ws` ga yozadi, `startRow` dan boshlab.
 * `J3..O3` (kategoriya ЖАМИ formulalari) allaqachon faylda yozilgan
 * bo'lishi shart — bu funksiya faqat ularga HAVOLA qiladi, qayta
 * hisoblamaydi (ikkinchi haqiqat manbai emas).
 */
function nakrutkaKaskadYoz(
  ws: import('xlsx-js-style').WorkSheet, XLSX: typeof import('xlsx-js-style'),
  startRow: number, koef: NakrutkaKoeffitsientlar, kat: NakrutkaHisob,
): number {
  ws[XLSX.utils.encode_cell({ r: startRow - 1, c: 1 })] = {
    t: 's', v: 'НАКРУТКА (накладные расходы и НДС)', s: { font: { bold: true, sz: 12 } },
  };
  const boshQator = startRow + 1;
  const bosh = [['Показатель', 1], ['%', 4], ['Сумма', 5]] as const;
  for (const [matn, ustun] of bosh) {
    const ref = XLSX.utils.encode_cell({ r: boshQator - 1, c: ustun });
    ws[ref] = {
      t: 's', v: matn,
      s: {
        font: { bold: true },
        fill: { patternType: 'solid', fgColor: { rgb: 'EAF0F5' } },
        border: chegara(ustun),
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      },
    };
  }

  const qatorlar = nakrutkaQatorlarQur();
  // FAQAT summa (foizlar aralashtirilmaydi) — `summaJS` shu indekslar
  // bo'yicha OLDINGI qatorlarga murojaat qiladi.
  const summaOldin: number[] = [];
  let r = boshQator + 1;
  for (const q of qatorlar) {
    ws[XLSX.utils.encode_cell({ r: r - 1, c: 1 })] = {
      t: 's', v: q.label,
      s: { font: { bold: !!q.jami }, alignment: { vertical: 'center', wrapText: true } },
    };
    if (q.pctKoef) {
      const pct = koef[q.pctKoef] ?? 0;
      ws[`E${r}`] = {
        t: 'n', v: pct, z: '0.##',
        s: {
          fill: { patternType: 'solid', fgColor: { rgb: 'FFF9E0' } },
          border: chegara(4),
          alignment: { horizontal: 'right', vertical: 'center' },
        },
      };
    }
    const summaJS = Math.round(q.summaJS(kat, koef, summaOldin) * 100) / 100;
    ws[`F${r}`] = {
      t: 'n', f: q.summaFormula(r).replace(/^=/, ''), v: summaJS, z: '#,##0.00',
      s: {
        font: { bold: !!q.jami },
        fill: { patternType: 'solid', fgColor: { rgb: q.jami ? 'FFF2CC' : 'F8FAFC' } },
        border: chegara(5),
        alignment: { horizontal: 'right', vertical: 'center' },
      },
    };
    summaOldin.push(summaJS);
    r++;
  }
  return r; // birinchi bo'sh qator (jadvaldan keyin)
}

/** RESURS_VEDOMOST varag‘ini ishchi hujjat darajasiga olib keladi.
 *
 * Resurs qatorlari — eksport paytidagi kanonik read-model snapshoti. Kategoriya
 * jami qatorlari esa shu snapshotdagi ko‘rinib turgan resurs qatorlaridan
 * Excel formulasi bilan yig‘iladi. Shuning uchun foydalanuvchi vedomostdagi
 * izoh/tahlil uchun sonni o‘zgartirsa, jami qator formula orqali qayta
 * hisoblanadi; bu yangi biznes haqiqatini yaratmaydi va Supabase qiymatini
 * almashtirmaydi.
 */
function resursVedomostUslubla(
  ws: import('xlsx-js-style').WorkSheet,
  XLSX: typeof import('xlsx-js-style'),
  aoa: (string | number)[][],
): void {
  const RV_BORDER = {
    top: CHIZIQ, bottom: CHIZIQ, left: CHIZIQ, right: CHIZIQ,
  };
  const RV_HEADER = {
    font: { bold: true, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '1F4E78' } },
    border: { top: QALIN, bottom: QALIN, left: QALIN, right: QALIN },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  };
  const RV_GROUP = {
    font: { bold: true, color: { rgb: '17365D' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'D9EAF7' } },
    border: { top: QALIN, bottom: CHIZIQ, left: QALIN, right: QALIN },
    alignment: { vertical: 'center', wrapText: true },
  };
  const RV_EVEN = { patternType: 'solid', fgColor: { rgb: 'F8FAFC' } };
  const RV_VOLUME = '#,##0.####';
  const RV_MONEY = '#,##0.00';
  const isGroupRow = (index: number): boolean => {
    const first = String(aoa[index]?.[0] ?? '');
    return index > 0 && /\(\d+\s+ресурс(?:а|ов)?\)$/i.test(first);
  };
  const groupIndexes = aoa.map((_row, index) => index).filter(isGroupRow);

  // Kategoriya jami qiymatlari resurs qatorlarining o‘zidan olinadi.
  for (let i = 0; i < groupIndexes.length; i++) {
    const categoryIndex = groupIndexes[i];
    const nextCategoryIndex = groupIndexes[i + 1] ?? aoa.length;
    const categoryExcelRow = categoryIndex + 1;
    const firstResourceRow = categoryExcelRow + 1;
    const lastResourceRow = nextCategoryIndex;
    if (lastResourceRow < firstResourceRow) continue;
    for (const [column, source] of [['F', 'F'], ['H', 'H'], ['J', 'J']] as const) {
      const ref = `${column}${categoryExcelRow}`;
      const oldValue = ws[ref]?.v;
      ws[ref] = {
        t: 'n',
        f: `SUM(${source}${firstResourceRow}:${source}${lastResourceRow})`,
        ...(typeof oldValue === 'number' ? { v: oldValue } : {}),
        z: RV_MONEY,
      };
    }
  }

  const rowInfo: Array<{ hpt?: number }> = [{ hpt: 34 }];
  for (let r = 1; r <= aoa.length; r++) {
    const group = isGroupRow(r - 1);
    rowInfo[r - 1] = { hpt: group ? 25 : r === 1 ? 34 : 23 };
    for (let c = 0; c < 10; c++) {
      const ref = XLSX.utils.encode_cell({ r: r - 1, c });
      const cell = ws[ref];
      if (!cell) continue;
      if (r === 1) {
        cell.s = RV_HEADER;
      } else if (group) {
        cell.s = RV_GROUP;
      } else {
        cell.s = {
          border: RV_BORDER,
          fill: r % 2 === 0 ? RV_EVEN : undefined,
          alignment: { vertical: 'center', ...(c === 2 ? { wrapText: true } : {}) },
        };
      }
      if (c === 2) {
        cell.s = { ...(cell.s || {}), alignment: { ...(cell.s?.alignment || {}), vertical: 'top', wrapText: true } };
      } else if (cell.t === 'n') {
        cell.z = [4, 6, 8].includes(c) ? RV_VOLUME : RV_MONEY;
        cell.s = { ...(cell.s || {}), alignment: { ...(cell.s?.alignment || {}), horizontal: 'right', vertical: 'center' } };
      }
    }
  }
  ws['!rows'] = rowInfo;
  ws['!cols'] = [
    { wch: 21 }, { wch: 16 }, { wch: 72 }, { wch: 12 },
    { wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 18 },
    { wch: 15 }, { wch: 18 },
  ];
  ws['!autofilter'] = { ref: `A1:J${Math.max(1, aoa.length)}` };
}

export async function lrvPlusFaylBaytlari(
  qatorlar: T2Qator[], obyektNomi: string, holatlar?: T2QatorHolat[],
  options?: LrvPlusOptions, context?: Partial<LrvPlusExportContext>,
): Promise<Uint8Array> {
  if (context) {
    const gate = lrvPlusEksportGate(context);
    if (!gate.ok) throw new LrvPlusExportBlockedError(gate.reasons);
  }
  const rejim = options?.rejim ?? 'toliq';
  const darajaUstun = LRV_DARAJA_USTUN[rejim];
  const ustunlar = rejim === 'forma2' ? LRV_FORMA2_USTUNLAR : LRV_PLUS_USTUNLAR;
  const hisob = lrvPlusQatorlarniHisobla(qatorlar, holatlar, darajaUstun);
  const ildiz = hisob.filter((q) => q.daraja === 0);
  const knownSum = (items: LrvPlusQator[], pick: (row: LrvPlusQator) => number | null): number | null => {
    let sum = 0;
    for (const item of items) {
      const value = pick(item);
      if (value == null) return null;
      sum += value;
    }
    return items.length ? sum : null;
  };
  const jamiSumma = knownSum(ildiz, (q) => q.summaQiymat);
  const jamiFakt = knownSum(ildiz, (q) => q.faktSumma);
  const jamiF2 = knownSum(ildiz, (q) => q.f2Summa);

  // Kategoriya ЖАМИ — J3..O3 keshlangan qiymati va nakrutka kaskadi shu
  // yerdan oladi (faqat barglar, T1 dagidek).
  const katYigindi: Record<string, number> = { 'ЧЕЛ': 0, 'МАШ': 0, 'МАТ': 0, 'ОБ': 0, 'КАБ': 0, 'М/К': 0 };
  const katQatorSoni: Record<string, number> = { 'ЧЕЛ': 0, 'МАШ': 0, 'МАТ': 0, 'ОБ': 0, 'КАБ': 0, 'М/К': 0 };
  for (const q of hisob) {
    if (LEAF_TUR.has(q.tur) && q.kat in katYigindi) {
      katQatorSoni[q.kat] += 1;
      katYigindi[q.kat] += q.summaQiymat ?? 0;
    }
  }

  const XLSX = await import('xlsx-js-style');
  const NCOLS = ustunlar.length;

  const sarlavhaMatn = options?.sarlavha ?? (rejim === 'forma2'
    ? `ФОРМА-2 · Акт выполненных работ${options?.raqam ? ' №' + options.raqam : ''} — ${obyektNomi || 'Smeta'}${options?.davr ? ' — ' + options.davr : ''}`
    : (obyektNomi || 'Smeta'));

  // ⚠️ 2026-09-10 (owner, haqiqiy nosozlik): raqamli ustunlarda noma'lum
  // qiymat uchun `''` (bo'sh MATN) ishlatilsa, Excel'da o'sha katakka
  // murojaat qiluvchi HAR QANDAY jonli formula (masalan Q ustunidagi
  // `F-P`) `#ЗНАЧ!` (#VALUE!) xatosi bilan yiqiladi -- matnni sondan
  // ayirib/ko'paytirib bo'lmaydi. `null`/`undefined` esa `aoa_to_sheet`da
  // katakning O'ZINI umuman yaratmaydi (haqiqiy BO'SH katak), Excel buni
  // arifmetikada xavfsiz 0 deb oladi. Shu sabab quyida `?? ''` emas,
  // `?? null` ishlatiladi.
  const aoa: (string | number | null)[][] = [
    [sarlavhaMatn],
    [...ustunlar],
    Array.from({ length: NCOLS }, () => '' as string | number),
  ];
  aoa[2][2] = 'ЖАМИ';

  for (const q of hisob) {
    const kat: (string | number | null)[] = Array.from({ length: 6 }, () => null);
    if (LEAF_TUR.has(q.tur)) {
      const idx = KAT_INDEX.get(q.kat) ?? -1;
      if (idx >= 0) kat[idx] = q.summaQiymat ?? null;
    }
    const asosiy = [
      q.no, q.kod, q.nom, q.birlik,
      q.birlikHajm ?? null, q.obyomQiymat ?? null, q.narx ?? null, q.summaQiymat ?? null,
      q.tur,
      ...kat,
    ];
    if (rejim === 'forma2') {
      // A..O + ЗАМЕЧАНИЕ (bo'sh, buyurtmachi to'ldiradi) + Даража + КАЛИТ.
      aoa.push([...asosiy, '', q.daraja, lrvKalitYoz(q.id, q.kod, q.nom, q.birlik)]);
    } else {
      aoa.push([
        ...asosiy,
        q.faktHajm, q.obyomQiymat == null ? '' : q.obyomQiymat - q.faktHajm, q.f2Hajm, q.faktHajm - q.f2Hajm,
        q.faktSumma, q.summaQiymat == null ? '' : q.summaQiymat - q.faktSumma, q.f2Summa, q.faktSumma - q.f2Summa,
        q.daraja,
        lrvKalitYoz(q.id, q.kod, q.nom, q.birlik),
      ]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  /** Formula + keshlangan natija (H6). Natija noma'lum bo'lsa — formula ""
   *  qaytaradi va kesh ham bo'sh matn: qayta hisoblamaydigan ko'ruvchi ham 0
   *  emas, bo'sh ko'radi (NULL ≠ 0). */
  const kesh = (f: string, v: number | null) => (v == null ? { t: 's' as const, f, v: '' } : { t: 'n' as const, f, v });

  for (const q of hisob) {
    if (q.obyomFormula) ws[`F${q.row}`] = { t: 'n', f: q.obyomFormula, ...(q.obyomQiymat == null ? {} : { v: q.obyomQiymat }) };
    if (q.summaFormula) ws[`H${q.row}`] = kesh(q.summaFormula, q.summaQiymat);
    // Egasi (2026-09-24): ish qatorida H dan oldingi bo'sh katakda — bir birlik narxi.
    if (q.tur === 'bl') {
      const birlikNarx = q.summaQiymat != null && q.obyomQiymat != null && q.obyomQiymat !== 0
        ? q.summaQiymat / q.obyomQiymat : null;
      ws[`G${q.row}`] = kesh(lrvPlusBirlikNarxFormula(q.row), birlikNarx);
    }
    // Kategoriya ustunlari — H ga havola (faqat bargda).
    if (LEAF_TUR.has(q.tur)) {
      const ustun = KAT_USTUN[q.kat];
      if (ustun) ws[`${ustun}${q.row}`] = kesh(`H${q.row}`, q.summaQiymat);
    }
    if (rejim === 'toliq') {
      ws[`Q${q.row}`] = kesh(`IF(F${q.row}="","",F${q.row}-P${q.row})`, q.obyomQiymat == null ? null : q.obyomQiymat - q.faktHajm);
      ws[`S${q.row}`] = { t: 'n', f: `P${q.row}-R${q.row}`, v: q.faktHajm - q.f2Hajm };
      ws[`U${q.row}`] = kesh(`IF(H${q.row}="","",H${q.row}-T${q.row})`, q.summaQiymat == null ? null : q.summaQiymat - q.faktSumma);
      ws[`W${q.row}`] = { t: 'n', f: `T${q.row}-V${q.row}`, v: q.faktSumma - q.f2Summa };
      // Ota (rz/bl) qatorida Fakt (T) va F2 (V) summasi — bevosita bolalar yig'indisi (tirik formula).
      const sumif = OTA_TUR.has(q.tur) ? q.summaFormula?.match(/SUMIF\(([^,]+),([^,]+),H(\d+):H(\d+)\)\)?$/) : null;
      if (sumif) {
        const [, oraliq, daraja, c1, c2] = sumif;
        ws[`T${q.row}`] = { t: 'n', f: `SUMIF(${oraliq},${daraja},T${c1}:T${c2})`, v: q.faktSumma };
        ws[`V${q.row}`] = { t: 'n', f: `SUMIF(${oraliq},${daraja},V${c1}:V${c2})`, v: q.f2Summa };
      }
    }
  }

  // ЖАМИ — har bir pul ustuni uchun (hajm ustunlari yig'ilmaydi: turli birlik).
  // Noma'lum (null) qo'shiluvchi -- natija ham noma'lum, 0 emas.
  const ayirma = (a: number | null, b: number | null): number | null => a == null || b == null ? null : a - b;
  const jamiUstunlar: Array<[string, number | null]> = [['H', jamiSumma]];
  if (rejim === 'toliq') {
    jamiUstunlar.push(['T', jamiFakt], ['U', ayirma(jamiSumma, jamiFakt)], ['V', jamiF2], ['W', ayirma(jamiFakt, jamiF2)]);
  }
  for (const [ustun, qiymat] of jamiUstunlar) {
    const f = lrvPlusJamiFormula(hisob, ustun, darajaUstun);
    if (f) ws[`${ustun}3`] = kesh(f, qiymat);
  }
  if (hisob.length) {
    const c1 = hisob[0].row, c2 = hisob[hisob.length - 1].row;
    // Kategoriya ustunlari faqat barglarda to'ladi -> butun ustunni yig'ish
    // xavfsiz. Keshlangan qiymat ENDI TO'G'RI (avval 0 edi) — nakrutka
    // kaskadi va SheetJS bilan formula-recalc'siz o'quvchilar shunga tayanadi.
    for (const col of ['J', 'K', 'L', 'M', 'N', 'O'] as const) {
      const kalitlar: Record<string, string> = { J: 'ЧЕЛ', K: 'МАШ', L: 'МАТ', M: 'ОБ', N: 'КАБ', O: 'М/К' };
      ws[`${col}3`] = { t: 'n', f: `SUM(${col}${c1}:${col}${c2})`, v: katYigindi[kalitlar[col]] };
    }
  }

  /* Owner (2026-09-10): «son tekst formatlari yacheyka ichiga kirib
     ketmasligi kerak ideal ko'rinishi». Format berilmasa Excel katta
     summani xom holda chiqaradi (471209797.5111) -- u katakka sig'maydi
     va tor ustunda `#####` bo'lib qoladi. Mingliklar ajratilgan format
     ham kengligini oldindan aytib beradi, ham egasining hujjatlaridagi
     ko'rinishga mos keladi (471,209,797.51).

     Nom ustuni (C) esa o'ralib ko'rsatiladi -- resurs nomlari juda uzun
     («КРАНЫ НА АВТОМОБИЛЬНОМ ХОДУ ПРИ РАБОТЕ НА ДРУГИХ ВИДАХ …»), ular
     qo'shni katak to'la bo'lsa kesilib qolardi. */
  const PUL_FORMAT = '#,##0.00';
  const HAJM_FORMAT = '#,##0.####';
  /** C = nom; E/F = hajm; G/H = narx va summa; J..O = kategoriya summalari. */
  const NOM_USTUN = 2;
  // To'liq rejim: P..S — fakt/ostatka/F2 HAJMLARI, T..W — ularning SUMMALARI (egasi 2026-09-30: formatsiz xom
  // sonlar «2269841167.865» o'qib bo'lmas edi).
  const HAJM_USTUN = new Set(rejim === 'toliq' ? [4, 5, 15, 16, 17, 18] : [4, 5]);
  const PUL_USTUN = new Set(rejim === 'toliq' ? [6, 7, 9, 10, 11, 12, 13, 14, 19, 20, 21, 22] : [6, 7, 9, 10, 11, 12, 13, 14]);

  // ── Uslub: guruhlangan sarlavha + yengil panjara + qator turi rangi ───
  // Sarlavha qiymatlari o'zgarmaydi; guruhlar rang va qalin ajratgich bilan
  // ko'rinadi. Har bir katakka og'ir chegara chizilmaydi.
  for (const q of hisob) {
    const rang = RANG[q.tur];
    for (let c = 0; c < NCOLS; c++) {
      const ref = XLSX.utils.encode_cell({ r: q.row - 1, c });
      const cell = ws[ref];
      if (!cell) continue;
      cell.s = {
        border: chegara(c),
        ...(rang || {}),
        alignment: c === NOM_USTUN
          ? { wrapText: true, vertical: 'top' }
          : { horizontal: cell.t === 'n' ? 'right' : 'center', vertical: 'center' },
      };
      if (cell.t === 'n') {
        cell.z = HAJM_USTUN.has(c) ? HAJM_FORMAT : PUL_USTUN.has(c) ? PUL_FORMAT : cell.z;
      }
    }
  }
  // ЖАМИ qatoridagi va kategoriya jamilaridagi sonlar ham bir xil formatda
  for (let c = 0; c < NCOLS; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 2, c })];
    if (cell && cell.t === 'n') cell.z = PUL_USTUN.has(c) || c === 7 ? PUL_FORMAT : HAJM_FORMAT;
  }
  // 1-qator — hujjat nomi, 2-qator — guruh rangli sarlavha, 3-qator — jami.
  for (let c = 0; c < NCOLS; c++) {
    const titleCell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    if (titleCell) {
      titleCell.s = {
        border: { top: QALIN, bottom: QALIN, left: QALIN, right: QALIN },
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 14 },
        fill: { patternType: 'solid', fgColor: { rgb: '1F4E78' } },
        alignment: { vertical: 'center', horizontal: 'left' },
      };
    }
    const headerCell = ws[XLSX.utils.encode_cell({ r: 1, c })];
    if (headerCell) {
      headerCell.s = {
        border: chegara(c),
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { patternType: 'solid', fgColor: { rgb: headerRang(c) } },
        alignment: { wrapText: true, vertical: 'center', horizontal: 'center' },
      };
    }
    const totalCell = ws[XLSX.utils.encode_cell({ r: 2, c })];
    if (totalCell) {
      totalCell.s = {
        border: chegara(c),
        font: { bold: true, color: { rgb: '5B3A00' } },
        fill: { patternType: 'solid', fgColor: { rgb: 'FFF2CC' } },
        alignment: { vertical: 'center', horizontal: totalCell.t === 'n' ? 'right' : 'left' },
      };
    }
  }
  // Obyekt nomi sarlavha zonasida bitta toza banner sifatida ko'rinadi.
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.min(7, NCOLS - 1) } }];

  // ── Guruhlash: rz > bl > resurs (yig'iladigan qatorlar) ─────────────
  const rowInfo: Array<{ level?: number; hpt?: number }> = [];
  rowInfo[0] = { hpt: 36 };
  rowInfo[1] = { hpt: 38 };
  rowInfo[2] = { hpt: 27 };
  for (const q of hisob) rowInfo[q.row - 1] = {
    level: Math.min(q.daraja, 7),
    hpt: qatorBalandligi(q.nom, q.tur),
  };
  ws['!rows'] = rowInfo;

  /* Uzun resurs nomlari endi satr balandligi bilan to'liq o'qiladi. Bo'sh
     kategoriya ustunlari esa faylda saqlanadi, lekin default ko'rinishni
     keraksiz kengaytirmaslik uchun yashiriladi; foydalanuvchi Excel orqali
     ularni qayta ko'rsatishi mumkin. */
  const asosiyKengliklar = [
    { wch: 6 }, { wch: 16 }, { wch: 62 }, { wch: 12 },
    { wch: 13 }, { wch: 15 }, { wch: 16 }, { wch: 19 },
    { wch: 8 },
  ];
  const kategoriyaKengliklari = KAT_TARTIB.map((kat) => ({
    wch: katQatorSoni[kat] > 0 ? 13 : 9,
    hidden: katQatorSoni[kat] === 0,
  }));
  ws['!cols'] = rejim === 'toliq'
    ? [
        ...asosiyKengliklar, ...kategoriyaKengliklari,
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
        { wch: 19 }, { wch: 19 }, { wch: 19 }, { wch: 19 },
        { wch: 7, hidden: true },   // Даража
        { wch: 18, hidden: true },  // КАЛИТ
      ]
    : [
        ...asosiyKengliklar, ...kategoriyaKengliklari,
        { wch: 32 },                // ЗАМЕЧАНИЕ
        { wch: 7, hidden: true },   // Даража
        { wch: 18, hidden: true },  // КАЛИТ
      ];
  const oxirgiMalumotQator = 3 + hisob.length;
  ws['!autofilter'] = { ref: `A2:${XLSX.utils.encode_col(NCOLS - 1)}${oxirgiMalumotQator}` };

  // ── Nakrutka kaskadi — egasining talabi bo'yicha ikkala rejimda ham,
  // faqat koeffitsientlar berilganda (o'ylab topilgan son bo'lmasin). ──
  if (options?.nakrutka) {
    const kat: NakrutkaHisob = {
      chel: katYigindi['ЧЕЛ'], mash: katYigindi['МАШ'],
      mat: katYigindi['МАТ'] + katYigindi['КАБ'] + katYigindi['М/К'],
      ob: katYigindi['ОБ'], kab: katYigindi['КАБ'], mk: katYigindi['М/К'],
    };
    const oxirgiNakrutkaQator = nakrutkaKaskadYoz(ws, XLSX, oxirgiMalumotQator + 2, options.nakrutka, kat);
    // ⚠️ SheetJS asl `aoa_to_sheet` chegarasidan (`!ref`) TASHQARIDA qo'lda
    // qo'shilgan kataklarni YOZISHDA JIM TASHLAB YUBORADI (tekshirilgan:
    // `XLSX.write` keyin qayta o'qilganda `!ref`dan tashqari katak yo'qoladi).
    // Nakrutka jadvali har doim asl ma'lumot oralig'idan pastda bo'lgani
    // uchun `!ref` shu yerda albatta kengaytiriladi.
    const joriy = XLSX.utils.decode_range(ws['!ref'] as string);
    joriy.e.r = Math.max(joriy.e.r, oxirgiNakrutkaQator - 1);
    ws['!ref'] = XLSX.utils.encode_range(joriy);
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, rejim === 'forma2' ? 'FORMA_2' : 'LRV_PLUS');

  // Owner (2026-09-10): "excel lrv hujjatlari ichida bo'lishi kerak" --
  // resurs vedomosti (ЧЕЛ/МАШ/МАТ/ОБ/КАБ/М-К kesimida) ilova ichidagi
  // alohida ko'rinish (ResursVedomostNative.tsx) bilan cheklanmasin,
  // eksportning O'ZI ichida alohida varaq bo'lib chiqsin. Ekrandagi va
  // shu yerdagi hisob-kitob BITTA manba (resursVedomostAoa/
  // resursVedomostKategoriyalarga) -- ikkinchi haqiqat yaratilmaydi.
  const resursAoa = resursVedomostAoa(holatlar ?? []);
  const resursWs = XLSX.utils.aoa_to_sheet(resursAoa);
  resursVedomostUslubla(resursWs, XLSX, resursAoa);
  XLSX.utils.book_append_sheet(wb, resursWs, 'RESURS_VEDOMOST');

  /* Provenance (ixtiyoriy) — 2026-09-11. Eksport endi manba hujjat tanlashni
     TALAB qilmaydi (egasi so'radi), lekin agar scope'da manba hujjat/revision/
     checksum tanlangan bo'lsa, ular bekorga ketmasin: alohida "МАНБА" varag'iga
     yoziladi, shunda faylning qayerdan kelgani hujjat ichida qoladi. Hech
     qanday provenance bo'lmasa varaq umuman qo'shilmaydi. */
  if (context) {
    const manba: (string | number)[][] = [];
    const q = (kalit: string, qiymat: string | number | null | undefined) => {
      if (qiymat != null && qiymat !== '') manba.push([kalit, qiymat]);
    };
    q('Обект', obyektNomi);
    q('Обект ID', context.obyektId ?? '');
    q('Лойиҳа ID', context.loyihaId ?? '');
    q('Давр', context.davrId ?? '');
    q('Манба ҳужжат ID', context.sourceDocumentId ?? '');
    q('Ревизия', context.revisionId ?? '');
    q('SHA-256', context.sourceChecksum ?? '');
    q('Яратилди (UTC)', new Date().toISOString());
    const provenanceBor = Boolean(
      (context.sourceDocumentId && String(context.sourceDocumentId).trim()) ||
      (context.revisionId && String(context.revisionId).trim()) ||
      (context.sourceChecksum && String(context.sourceChecksum).trim()),
    );
    if (provenanceBor) {
      const manbaWs = XLSX.utils.aoa_to_sheet([['МАНБА (provenance)', ''], ...manba]);
      manbaWs['!cols'] = [{ wch: 22 }, { wch: 70 }];
      manbaWs['!rows'] = [{ hpt: 28 }];
      for (const ref of ['A1', 'B1']) {
        if (manbaWs[ref]) manbaWs[ref].s = {
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          fill: { patternType: 'solid', fgColor: { rgb: '1F4E78' } },
          alignment: { vertical: 'center', wrapText: true },
        };
      }
      XLSX.utils.book_append_sheet(wb, manbaWs, 'МАНБА');
    }
  }

  const raw = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

  /* Freeze panes — egasi (aynan): «freeze qil kerakli joyidan». xlsx-js-style
     buni varaq darajasida yoza olmaydi (XML darajasida tekshirilgan:
     `<sheetView>`ga `<pane>` yozmaydi). Shuning uchun tayyor faylni exceljs
     orqali qayta o'qib, FAQAT muzlatishni qo'shamiz -- exceljs allaqachon
     to'g'ridan-to'g'ri bog'liqlik. Round-trip empirik sinovdan o'tgan: formula,
     uslub/rang, son formati, birlashtirish (`!merges`), outline guruhlash
     (`!rows` level), yashirin ustun/qator va autofilter -- hammasi saqlanadi.
     Sarlavha (1), ustun nomlari (2) va ЖАМИ (3) qatorlari + A..C ustunlari
     (№/КОД/НАИМЕНОВАНИЕ) muzlatiladi, shunda pastga/o'ngga varaqlaganda ular
     ko'rinib turadi. RESURS_VEDOMOST va МАНБА da faqat sarlavha qatori. */
  const ExcelJS = (await import('exceljs')).default;
  const ewb = new ExcelJS.Workbook();
  await ewb.xlsx.load(raw);
  const asosiy = ewb.getWorksheet(rejim === 'forma2' ? 'FORMA_2' : 'LRV_PLUS');
  if (asosiy) {
    asosiy.views = [{ state: 'frozen', xSplit: 3, ySplit: 3 }];
    asosiy.pageSetup = {
      orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      paperSize: 9, printTitlesRow: '1:3', horizontalDpi: 300, verticalDpi: 300,
      margins: { left: 0.25, right: 0.25, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
      showGridLines: false,
    };
  }
  const rv = ewb.getWorksheet('RESURS_VEDOMOST');
  if (rv) {
    rv.views = [{ state: 'frozen', ySplit: 1 }];
    rv.pageSetup = {
      orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      paperSize: 9, printTitlesRow: '1:1', horizontalDpi: 300, verticalDpi: 300,
      margins: { left: 0.25, right: 0.25, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
      showGridLines: false,
    };
  }
  if (asosiy) {
    /* Hujjat standarti (docs/architecture/HUJJAT_STANDARTI_V1.md):
       H7 — narxi/hajmi noma'lum barglar hujjatda ochiq ro'yxat (jamilar bo'sh
       qoladi, taxmin yo'q); H3 — imzo bloki; H4 — chop hududi hujjat + imzo. */
    const nomalumlar = hisob.filter((q) => LEAF_TUR.has(q.tur) && q.summaQiymat == null);
    let r = Math.max(asosiy.rowCount, oxirgiMalumotQator) + 2;
    const matn = (row: number, col: number, v: string, font?: Partial<import('exceljs').Font>) => {
      const c = asosiy.getCell(row, col);
      c.value = v;
      if (font) c.font = font;
      c.alignment = { vertical: 'top', wrapText: false };
    };
    if (nomalumlar.length) {
      matn(r++, 3, `ПОЗИЦИИ, ТРЕБУЮЩИЕ ВНИМАНИЯ (${nomalumlar.length})`, { bold: true });
      const LIMIT = 500;
      nomalumlar.slice(0, LIMIT).forEach((q, i) => {
        const sabab = q.obyomQiymat == null && q.narx == null ? 'нет количества и цены' : q.obyomQiymat == null ? 'нет количества' : 'нет цены';
        matn(r++, 3, `${i + 1}. ${q.kod ? q.kod + ' ' : ''}${q.nom}${q.birlik ? ', ' + q.birlik : ''} (стр. ${q.row}): ${sabab} — сумма и итоги по разделу не определены`, { italic: true });
      });
      if (nomalumlar.length > LIMIT) matn(r++, 3, `… и еще ${nomalumlar.length - LIMIT} позиций (см. строки без суммы в графе «СУММА»)`, { italic: true });
      r++;
    }
    for (const t of imzoTomonlari(['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'СОСТАВИЛ'], options?.imzo)) {
      r++;
      matn(r, 3, imzoMatni(t.rol, t.nom));
      matn(r, 7, IMZO_IMZO_CHIZIQ);
      r++;
      matn(r, 3, imzoMuhrli(t.rol) ? IMZO_IZOH : IMZO_IZOH_SHAXS, { italic: true, size: 8 });
      matn(r, 7, IMZO_PODPIS, { italic: true, size: 8 });
      if (imzoMuhrli(t.rol)) matn(r, 8, IMZO_MP, { italic: true, size: 8 });
      r++;
    }
    // Chop hududi: ko'rinadigan oxirgi ustungacha (yashirin Даража/КАЛИТ kirmaydi) va imzogacha.
    const oxirgiKorinadigan = rejim === 'toliq' ? 'W' : 'P';
    asosiy.pageSetup.printArea = `A1:${oxirgiKorinadigan}${r}`;
  }
  const manbaWs = ewb.getWorksheet('МАНБА');
  // Provenance — texnik ma'lumot (H5): faylda saqlanadi, lekin chop etilmaydi va ko'rinmaydi.
  if (manbaWs) manbaWs.state = 'hidden';

  const out = (await ewb.xlsx.writeBuffer()) as ArrayBuffer;
  return ogohlantirishlarniOchir(chopNomlariAbsolyut(boshKeshQoy(new Uint8Array(out), [rejim === 'forma2' ? 'FORMA_2' : 'LRV_PLUS'])));
}

/** LRV_PLUS / Forma-2 fayl nomi (H8): `<Obyekt>_LRV_PLUS_<sana>.xlsx`. */
export function lrvPlusFaylNomi(obyektNomi: string, rejim: LrvPlusRejim = 'toliq', sana = bugunSana()): string {
  return hujjatFaylNomi({ obyekt: obyektNomi || 'Смета', hujjat: rejim === 'forma2' ? 'ФОРМА-2_ЛРВ' : 'LRV_PLUS', davr: sana });
}

/** Brauzerda faylni yuklab olishga majburlaydi (blob + vaqtinchalik link). */
export function lrvPlusYuklab(bytes: Uint8Array, obyektNomi: string, rejim: LrvPlusRejim = 'toliq'): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = new Blob([bytes as any], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = lrvPlusFaylNomi(obyektNomi, rejim);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(url);
  }
}
