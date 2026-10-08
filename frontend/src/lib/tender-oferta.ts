/**
 * Tender oferta V2 — deterministik iqtisodiy yadro.
 *
 * Ikki MUSTAQIL o'lchov:
 *   rol        — qatorning hujjatdagi TUZILMAVIY roli (resurs, bo'lim, jami,
 *                hosila transport/sklad, ma'lumot ...);
 *   kategoriya — resursning IQTISODIY toifasi (ЧЕЛ/МАШ/МАТ/ОБ/М/К/КАБ/
 *                БЕЗСКЛАД), nakrutka kaskadi aynan shu bo'yicha ishlaydi.
 *
 * Manba qiymatlari (hajm, birlik narx, summa) HECH QACHON o'zgartirilmaydi.
 * Taklif hajmi va narxi alohida maydonlar: sourceQuantity → override →
 * effectiveOfferQuantity. Pul faqat RESOURCE barglaridan yig'iladi; JAMI
 * qatorlari faqat nazorat/ko'rinish, shuning uchun hech narsa ikki marta
 * sanalmaydi. Hosila xarajatlar (transport/sklad/prochie/sug'urta/QQS) eski
 * podval summalaridan emas, YANGI pudratchi kategoriya asoslaridan kanonik
 * nakrutka kaskadi (nakrutka-kaskad.ts = SQL t2_nakrutka_hisobla_v1) bilan
 * hisoblanadi.
 */
import type { NakrutkaKoefKod, NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import { NAKRUTKA_STANDART, nakrutkaKaskadXom, pulYaxlitla, type NakrutkaAsos, type NakrutkaQadamlar } from './nakrutka-kaskad';
import { mashinistMehnati } from './narx-bildirishnoma';

export type OfertaNarxRejimi = 'foiz' | 'qolda';
export type OfertaFoizYon = 'pasaytirish' | 'oshirish';

export type OfertaRol =
  | 'RESOURCE'
  | 'SECTION'
  | 'SUBTOTAL'
  | 'GRAND_TOTAL'
  | 'TRANSPORT'
  | 'STORAGE'
  | 'MARKUP'
  | 'INFO'
  | 'UNKNOWN';

export const OFERTA_KATEGORIYALAR = ['ЧЕЛ', 'МАШ', 'МАТ', 'ОБ', 'М/К', 'КАБ', 'БЕЗСКЛАД'] as const;
export type OfertaMalumKategoriya = typeof OFERTA_KATEGORIYALAR[number];
export type OfertaKategoriya = OfertaMalumKategoriya | 'UNKNOWN';
export type OfertaKategoriyaManbasi = 'birlik' | 'nom' | 'bolim' | 'podval' | 'vedomost' | 'qolda' | 'guruh' | 'yoq';

/** 'birlik' — taklif = hajm × pudratchi birlik narxi; 'manba_jami' — manbada
 * faqat summa bor (RESURS_VEDOMOST, TN transport varag'i): taklif summasi
 * shu summaga nisbatan beriladi, soxta birlik narx yaratilmaydi. */
export type OfertaHisobTuri = 'birlik' | 'manba_jami' | 'yoq';

export type OfertaQator = {
  /** Bir fayl ichida o'zgarmaydigan manba kaliti: `${varaq}::r${excelQator}`. */
  sourceId: string;
  sourceSheet: string;
  /** Excel qator raqami (1-based) — OOXML `<row r>` bilan bir xil. */
  sourceRow: number;
  tartibRaqami: string | number | null;
  shifr: string | null;
  nom: string;
  birlik: string | null;
  /** sourceQuantity — manba hajmi (o'zgarmaydi). */
  hajm: number | null;
  /** sourceUnitPrice. */
  smetaBirlikNarx: number | null;
  /** Manba summasi — hech qachon hajm × narx bilan almashtirilmaydi. */
  smetaSumma: number | null;
  rol: OfertaRol;
  hisobTuri: OfertaHisobTuri;
  /** Faqat RESOURCE uchun; boshqalarda null. */
  kategoriya: OfertaKategoriya | null;
  kategoriyaManbasi: OfertaKategoriyaManbasi;
  /** Kategoriya dalil bilan aniqlanmagan, lekin bo‘lim nomi ishora beradi
   * (masalan “ИНЕРТНЫЕ МАТЕРИАЛЫ” → БЕЗСКЛАД). Avtomatik qo‘llanmaydi —
   * operator tasdiqlaydi (egasi: БЕЗСКЛАД qoidasi to‘liq isbotlanmagan). */
  kategoriyaTaklifi?: OfertaMalumKategoriya;
  /** TRANSPORT/STORAGE: true — RES ichidagi foizli podval qatori (kaskad
   * qayta hisoblaydi); false — alohida transport hisob varag'i qatori. */
  hosila?: boolean;
  /** SUBTOTAL/GRAND_TOTAL: bevosita bolalar (barg yoki ichki jami) sourceId. */
  jamiBolalari?: string[];
  /** Jami bolalari qanday aniqlandi: manba summasi aynan mos ('summa'),
   * tuzilma bo'yicha ('tuzilma' — manba summasi 0/bo'sh), yoki topilmadi. */
  jamiMoslik?: 'summa' | 'tuzilma' | 'mos_emas';
  /** Original varaqdagi ustunlar (0-based). */
  manbaHajmUstuni?: number;
  manbaNarxUstuni?: number;
  manbaSummaUstuni?: number;
  /** Manba hujayrasi Excelda SON turida (matn emas) — export formulasi
   * faqat shunda unga havola qiladi, aks holda qiymat konstanta yoziladi. */
  manbaHajmSon?: boolean;
  manbaSummaSon?: boolean;
  /** Podval/НДС qatorining NOM EMAS kataklaridagi foizlar (C/D/E: `0,05`,
   * `5%`, НДС qatorida `1,12` → 12). Pomoshnik PTO saboqi: foiz ko'pincha
   * yozuvda emas, alohida katakda turadi. */
  katakFoizlari?: number[];
};

export type OfertaFoiz = { yon: OfertaFoizYon; foiz: number };

export type OfertaNarxSozlamasi = {
  rejim: OfertaNarxRejimi;
  yon?: OfertaFoizYon;
  foiz?: number | null;
  /** Kategoriya bo'yicha alohida foiz (masalan МАТ −15%, МАШ +3%).
   * Qatordagi qo'lda narx undan ustun; u esa global foizdan ustun. */
  kategoriyaFoizlari?: Partial<Record<OfertaMalumKategoriya, OfertaFoiz>>;
};

export type OfertaTransportSiyosati = 'kaskad' | 'varaq';

export type OfertaKirish = {
  sozlama: OfertaNarxSozlamasi;
  manualNarxlar?: Readonly<Record<string, number | null | undefined>>;
  manualHajmlar?: Readonly<Record<string, number | null | undefined>>;
  manualKategoriyalar?: Readonly<Record<string, OfertaMalumKategoriya | undefined>>;
  nakrutka?: Partial<NakrutkaKoeffitsientlar>;
  /** 'kaskad' (standart): material transporti ТРАНСПОРТ_МАТЕРИАЛ % bilan;
   * alohida transport varag'i faqat dalil. 'varaq': transport varag'idagi
   * pudratchi summasi material transporti o'rnida ishlatiladi (ikki marta
   * sanalmasligi uchun foiz qadami almashtiriladi). */
  transportSiyosati?: OfertaTransportSiyosati;
  /** true (standart): ayni material (nom + birlik) barcha varaqlarda BIR XIL
   * taklif narxini oladi — foiz bir xil asos narxga qo‘llanadi. */
  birXilNarx?: boolean;
  /** Operator tanlagan asosiy smeta narxi (guruh kaliti → narx) — "smeta
   * narxi har xil" guruhlarida eng ko'p uchragan narx o'rniga. */
  asosNarxTanlovi?: Readonly<Record<string, number | undefined>>;
};

/** Panelda bir marta ko‘rinadigan resurs: barcha varaqlardagi ayni material. */
export type OfertaGuruh = {
  kalit: string;
  nom: string;
  birlik: string | null;
  hisobTuri: OfertaHisobTuri;
  sourceIds: string[];
  varaqlar: string[];
  /** Taklif hajmlari yig‘indisi; birortasi noma’lum bo‘lsa null. */
  jamiHajm: number | null;
  smetaNarxlar: number[];
  pudratchiNarxlar: number[];
  kategoriyalar: OfertaKategoriya[];
  kategoriyaTaklifi?: OfertaMalumKategoriya;
  jamiSmetaSumma: number;
  /** Birorta qator summasi noma’lum bo‘lsa null. */
  jamiTaklifSumma: number | null;
  muammolar: OfertaMuammo[];
};

export type OfertaMuammo =
  | 'HAJM_YOQ'
  | 'PUDRATCHI_NARXI_YOQ'
  | 'SMETA_NARXI_YOQ'
  | 'SMETA_NARXI_NOL'
  | 'FOIZ_XATO'
  | 'NARX_MANFIY'
  | 'KATEGORIYA_NOMALUM'
  | 'JAMI_MOS_EMAS'
  /** Ogohlantirish: ayni material turli varaqlarda turli smeta narxida —
   * taklif uchun guruhning asosiy (eng ko‘p uchragan) narxi olindi. */
  | 'NARX_HAR_XIL';

export type OfertaQatorNatija = OfertaQator & {
  /** offerQuantityOverride — foydalanuvchi kiritgan taklif hajmi. */
  taklifHajmiOverride: number | null;
  /** effectiveOfferQuantity — UI, hisob, validatsiya va Excel shu qiymatni ishlatadi. */
  taklifHajmi: number | null;
  hajmManbasi: 'manba' | 'qolda' | 'yoq';
  /** offerUnitPrice. */
  pudratchiBirlikNarx: number | null;
  /** Taklif summasi — ROUND(taklifHajmi × pudratchiBirlikNarx; 2). */
  pudratchiSumma: number | null;
  narxManbasi: 'foiz' | 'kategoriya_foiz' | 'qolda' | 'yoq';
  /** Qo'llangan foiz (Excel formulasi uchun), bo'lsa. */
  qollanganFoiz: OfertaFoiz | null;
  /** Foydalanuvchi o'zgartirgan bo'lsa ham shu qiymat hisobga kiradi. */
  samaraliKategoriya: OfertaKategoriya | null;
  muammolar: OfertaMuammo[];
  /** Varaq podvalidagi hosila qator (транспорт 5%, склад 2%, ВСЕГО С УЧЕТОМ…)
   * pudratchi narxlariga AYNAN manbadagidek qo'llanadi. Faqat hujjat
   * ko'rinishi — kanonik kaskad (OFERTA_JAMI) ularni qayta sanamaydi. */
  podval?: OfertaPodval;
};

export type OfertaPodval =
  /** baza × koef. `foiz` — yozuvdan o'qilgan va manba bilan tasdiqlangan foiz;
   * null bo'lsa koef manba nisbatidan (hosila ÷ baza) olingan. */
  | { tur: 'foiz'; baza: string; koef: number; foiz: number | null }
  /** Manbada ham 0 va yozuvda foiz yo'q — taklifda ham 0. */
  | { tur: 'nol' }
  /** Manbada 0, lekin yozuvda foiz bor (`СКЛАДСКИЕ =2% И М/К=0,75%`,
   * `КАБЕЛЬ…=1,5%`): o'sha bo'lim resurslaridan kategoriya bo'yicha —
   * kanonik kaskad qoidasi bilan (sklad: (МАТ+КАБ)×p + М/К×p₂). */
  | { tur: 'kategoriya'; bazaQatorlar: string[]; qismlar: Array<{ kat: OfertaKategoriya[]; foiz: number }> }
  /** Oldingi jami + undan keyingi hosilalar yig'indisi (ВСЕГО С УЧЕТОМ …). */
  | { tur: 'yigindi'; bazalar: string[] };

export type OfertaKategoriyaJami = Record<OfertaKategoriya, number>;

export type OfertaHisoblash = {
  qatorlar: OfertaQatorNatija[];
  /** SOURCE TOTAL — manba RESOURCE barglari summasi (o'zgarmagan). */
  manbaTogridanJami: number;
  manbaKategoriyaJami: OfertaKategoriyaJami;
  /** CONTRACTOR DIRECT TOTAL — pudratchi RESOURCE barglari. */
  togridanJami: number;
  kategoriyaJami: OfertaKategoriyaJami;
  /** Alohida transport varag'i pudratchi summasi (siyosatga qarab ishlatiladi). */
  transportVaraqJami: number;
  asos: NakrutkaAsos;
  koeffitsientlar: NakrutkaKoeffitsientlar;
  transportSiyosati: OfertaTransportSiyosati;
  /** Yaxlitlanmagan kaskad (Excel formulalari bilan bir xil tartib). */
  kaskadXom: NakrutkaQadamlar;
  /** 2 xonali ko'rinish. */
  kaskad: NakrutkaQadamlar;
  /** Manba asoslari bo'yicha ayni kaskad — solishtirish uchun. */
  manbaKaskad: NakrutkaQadamlar;
  /** FINAL OFFER — hal qilinmagan barg bo'lsa null (taxminiy pul yo'q). */
  yakuniyOferta: number | null;
  /** Narxi/hajmi yoki kategoriyasi hal qilinmagan RESOURCE barglari. */
  halQilinmagan: number;
  muammolarSoni: number;
  valid: boolean;
  /** Narxlanadigan qatorlar resurs bo‘yicha guruhlangan (panel uchun). */
  guruhlar: OfertaGuruh[];
};

function finiteNonNegative(value: unknown): number | null {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function normalizePrice(value: unknown): number | null {
  const n = finiteNonNegative(value);
  if (n == null) return null;
  // Suzuvchi nuqta shovqinini kamaytiradi; narx Excelga QIYMAT sifatida
  // yoziladi, shuning uchun UI va Excel ayni double'ni ko'paytiradi.
  return Math.round(n * 1e10) / 1e10;
}

export function foizKoeffitsienti(f: OfertaFoiz): number {
  return f.yon === 'oshirish' ? 1 + f.foiz / 100 : 1 - f.foiz / 100;
}

function adjusted(base: number, f: OfertaFoiz): { value: number | null; muammo?: OfertaMuammo } {
  if (!Number.isFinite(f.foiz) || f.foiz < 0) return { value: null, muammo: 'FOIZ_XATO' };
  const factor = foizKoeffitsienti(f);
  if (!Number.isFinite(factor) || factor < 0) return { value: null, muammo: 'NARX_MANFIY' };
  return { value: base * factor };
}

export const bosKategoriyaJami = (): OfertaKategoriyaJami =>
  ({ ЧЕЛ: 0, МАШ: 0, МАТ: 0, ОБ: 0, 'М/К': 0, КАБ: 0, БЕЗСКЛАД: 0, UNKNOWN: 0 });

/** Kategoriya summalaridan kaskad asosi (SQL t2_obyekt_nakrutka_v1 bilan
 * bir xil xaritalash: mat = МАТ + М/К + КАБ + БЕЗСКЛАД). Qo'shish tartibi
 * Excel OFERTA_JAMI formulalari bilan bir xil. */
export function kategoriyadanAsos(j: OfertaKategoriyaJami): NakrutkaAsos {
  return {
    chel: j['ЧЕЛ'], mash: j['МАШ'], ob: j['ОБ'],
    mat: j['МАТ'] + j['М/К'] + j['КАБ'] + j['БЕЗСКЛАД'],
    mk: j['М/К'], kab: j['КАБ'], bez: j['БЕЗСКЛАД'],
  };
}

function qatorFoizi(kat: OfertaKategoriya | null, sozlama: OfertaNarxSozlamasi): { foiz: OfertaFoiz; manba: 'foiz' | 'kategoriya_foiz' } | null {
  if (kat && kat !== 'UNKNOWN') {
    const kf = sozlama.kategoriyaFoizlari?.[kat];
    if (kf) return { foiz: kf, manba: 'kategoriya_foiz' };
  }
  if (sozlama.rejim !== 'foiz') return null;
  return { foiz: { yon: sozlama.yon ?? 'pasaytirish', foiz: Number(sozlama.foiz ?? 0) }, manba: 'foiz' };
}

/** Resurs nomi/birligi kaliti (Pomoshnik PTO PriceKey tajribasi): NBSP va qator
 * ko'chishi bo'shliq, Ё→Е, `. , ; : -` bo'shliqqa; bo'shliqlar bittaga. "2,0Х2"
 * va "20Х2" farqli qoladi (vergul olib tashlanmaydi, bo'shliqqa aylanadi). */
const kalitMatn = (v: unknown): string => String(v ?? '').toUpperCase().replace(/Ё/g, 'Е').replace(/[ \r\n\t]/g, ' ')
  .replace(/[.,;:-]/g, ' ').replace(/\s+/g, ' ').trim();

/** Ayni resurs kaliti: faqat hajm × narx qatorlari nom + birlik bo‘yicha
 * birlashadi; summa bo‘yicha narxlanadiganlar (manba_jami, transport varag‘i)
 * har biri alohida qoladi — ularning summasini guruhlab bo‘lmaydi. */
export function ofertaResursKaliti(q: Pick<OfertaQator, 'sourceId' | 'nom' | 'birlik' | 'hisobTuri' | 'rol'>): string {
  if (q.rol !== 'RESOURCE' || q.hisobTuri !== 'birlik') return `#${q.sourceId}`;
  return `${kalitMatn(q.nom)}|${kalitMatn(q.birlik)}`;
}

/** Guruh bo‘yicha tayyorlash: yagona fayl-kategoriyani noma’lum qatorlarga
 * yoyish va bir xil taklif narxi uchun guruhning asosiy smeta narxi. */
function guruhTayyorla(qatorlar: readonly OfertaQator[], birXilNarx: boolean, tanlov: Readonly<Record<string, number | undefined>> = {}): { qatorlar: OfertaQator[]; asosNarx: Map<string, number>; harXil: Set<string> } {
  const guruh = new Map<string, OfertaQator[]>();
  for (const q of qatorlar) {
    if (!narxlanadiganmi(q)) continue;
    const k = ofertaResursKaliti(q);
    if (k.startsWith('#')) continue;
    const a = guruh.get(k);
    if (a) a.push(q); else guruh.set(k, [q]);
  }
  const katYoy = new Map<string, OfertaMalumKategoriya>();
  const asosNarx = new Map<string, number>();
  const harXil = new Set<string>();
  for (const [kalit, a] of guruh.entries()) {
    if (a.length < 2) continue;
    const mal = new Set(a.map((q) => q.kategoriya).filter((k): k is OfertaMalumKategoriya => !!k && k !== 'UNKNOWN'));
    if (mal.size === 1) {
      const k = [...mal][0];
      for (const q of a) if (!q.kategoriya || q.kategoriya === 'UNKNOWN') katYoy.set(q.sourceId, k);
    }
    if (!birXilNarx) continue;
    const stat = new Map<number, { soni: number; summa: number }>();
    for (const q of a) {
      if (q.smetaBirlikNarx == null || !Number.isFinite(q.smetaBirlikNarx)) continue;
      const st = stat.get(q.smetaBirlikNarx) ?? { soni: 0, summa: 0 };
      st.soni++; st.summa += q.smetaSumma ?? 0;
      stat.set(q.smetaBirlikNarx, st);
    }
    if (stat.size < 2) continue;
    // Asosiy narx: eng ko‘p uchragani; teng bo‘lsa — smeta summasi kattasi.
    const tanlangan = tanlov[kalit];
    const [asos] = tanlangan != null && stat.has(tanlangan)
      ? [tanlangan]
      : [...stat.entries()].sort((x, y) => y[1].soni - x[1].soni || y[1].summa - x[1].summa || y[0] - x[0])[0];
    for (const q of a) { asosNarx.set(q.sourceId, asos); harXil.add(q.sourceId); }
  }
  const yangi = katYoy.size
    ? qatorlar.map((q) => (katYoy.has(q.sourceId) ? { ...q, kategoriya: katYoy.get(q.sourceId)!, kategoriyaManbasi: 'guruh' as const } : q))
    : [...qatorlar];
  return { qatorlar: yangi, asosNarx, harXil };
}

function guruhlarQur(natijalar: readonly OfertaQatorNatija[]): OfertaGuruh[] {
  const map = new Map<string, OfertaGuruh>();
  for (const n of natijalar) {
    if (!narxlanadiganmi(n)) continue;
    const kalit = ofertaResursKaliti(n);
    let g = map.get(kalit);
    if (!g) {
      g = { kalit, nom: n.nom, birlik: n.birlik, hisobTuri: n.hisobTuri, sourceIds: [], varaqlar: [], jamiHajm: 0, smetaNarxlar: [], pudratchiNarxlar: [], kategoriyalar: [], jamiSmetaSumma: 0, jamiTaklifSumma: 0, muammolar: [] };
      map.set(kalit, g);
    }
    g.sourceIds.push(n.sourceId);
    if (!g.varaqlar.includes(n.sourceSheet)) g.varaqlar.push(n.sourceSheet);
    g.jamiHajm = g.jamiHajm == null || n.taklifHajmi == null ? null : g.jamiHajm + n.taklifHajmi;
    if (n.smetaBirlikNarx != null && !g.smetaNarxlar.includes(n.smetaBirlikNarx)) g.smetaNarxlar.push(n.smetaBirlikNarx);
    if (n.pudratchiBirlikNarx != null && !g.pudratchiNarxlar.includes(n.pudratchiBirlikNarx)) g.pudratchiNarxlar.push(n.pudratchiBirlikNarx);
    const k = n.samaraliKategoriya ?? 'UNKNOWN';
    if (!g.kategoriyalar.includes(k)) g.kategoriyalar.push(k);
    if (n.kategoriyaTaklifi && !g.kategoriyaTaklifi) g.kategoriyaTaklifi = n.kategoriyaTaklifi;
    g.jamiSmetaSumma += n.smetaSumma ?? 0;
    g.jamiTaklifSumma = g.jamiTaklifSumma == null || n.pudratchiSumma == null ? null : g.jamiTaklifSumma + n.pudratchiSumma;
    for (const m of n.muammolar) if (!g.muammolar.includes(m)) g.muammolar.push(m);
  }
  for (const g of map.values()) { g.smetaNarxlar.sort((a, b) => a - b); g.pudratchiNarxlar.sort((a, b) => a - b); }
  return [...map.values()];
}

/** Pul chiqaradigan (narxlanadigan) qatorlar: resurs va alohida transport
 * varag'i qatorlari. Podval hosilalari kaskad bilan qayta hisoblanadi. */
export function narxlanadiganmi(qator: Pick<OfertaQator, 'rol' | 'hosila'>): boolean {
  return qator.rol === 'RESOURCE' || (qator.rol === 'TRANSPORT' && qator.hosila === false);
}

function bargNatija(qator: OfertaQator, kirish: OfertaKirish, asosNarx?: number): OfertaQatorNatija {
  const muammolar: OfertaMuammo[] = [];
  const manualKat = kirish.manualKategoriyalar?.[qator.sourceId];
  const samaraliKategoriya: OfertaKategoriya | null = qator.rol === 'RESOURCE' ? (manualKat ?? qator.kategoriya ?? 'UNKNOWN') : null;
  const hajmOverrideRaw = kirish.manualHajmlar && Object.prototype.hasOwnProperty.call(kirish.manualHajmlar, qator.sourceId)
    ? finiteNonNegative(kirish.manualHajmlar[qator.sourceId]) : null;
  const taklifHajmi = hajmOverrideRaw ?? (qator.hajm != null && Number.isFinite(qator.hajm) ? qator.hajm : null);
  const hajmManbasi: OfertaQatorNatija['hajmManbasi'] = hajmOverrideRaw != null ? 'qolda' : taklifHajmi != null ? 'manba' : 'yoq';

  const manualBerilgan = !!kirish.manualNarxlar && Object.prototype.hasOwnProperty.call(kirish.manualNarxlar, qator.sourceId);
  const manual = manualBerilgan ? normalizePrice(kirish.manualNarxlar![qator.sourceId]) : null;
  let pudratchiBirlikNarx: number | null = null;
  let pudratchiSumma: number | null = null;
  let narxManbasi: OfertaQatorNatija['narxManbasi'] = 'yoq';
  let qollanganFoiz: OfertaFoiz | null = null;

  if (manualBerilgan && manual != null) {
    narxManbasi = 'qolda';
    if (qator.hisobTuri === 'manba_jami') pudratchiSumma = pulYaxlitla(manual);
    else pudratchiBirlikNarx = manual;
  } else if (manualBerilgan) {
    muammolar.push('PUDRATCHI_NARXI_YOQ');
  } else {
    const f = qatorFoizi(samaraliKategoriya, kirish.sozlama);
    if (!f) muammolar.push('PUDRATCHI_NARXI_YOQ');
    else {
      const base = qator.hisobTuri === 'manba_jami' ? qator.smetaSumma : (asosNarx ?? qator.smetaBirlikNarx);
      if (base == null || !Number.isFinite(base)) muammolar.push('SMETA_NARXI_YOQ');
      else if (base < 0) muammolar.push('SMETA_NARXI_NOL');
      else if (base === 0) {
        // Smeta narxni ANIQ 0 deb yozgan (ВОДА, ОЧЕС ЛЬНЯНОЙ…): bu noma'lum
        // pul emas — ma'lum 0. Taklif ham 0, yakuniy summa to'silmaydi;
        // qator ogohlantirish sifatida ko'rinadi (qo'lda narx kiritish mumkin).
        narxManbasi = f.manba;
        qollanganFoiz = f.foiz;
        if (qator.hisobTuri === 'manba_jami') pudratchiSumma = 0;
        else pudratchiBirlikNarx = 0;
        muammolar.push('SMETA_NARXI_NOL');
      } else {
        const r = adjusted(base, f.foiz);
        if (r.value == null) muammolar.push(r.muammo ?? 'FOIZ_XATO');
        else {
          narxManbasi = f.manba;
          qollanganFoiz = f.foiz;
          // manba_jami: Excel `ROUND(manba*(1±p/100);2)` — normalizePrice'siz.
          if (qator.hisobTuri === 'manba_jami') pudratchiSumma = pulYaxlitla(r.value);
          else pudratchiBirlikNarx = normalizePrice(r.value);
        }
      }
    }
  }

  if (qator.hisobTuri !== 'manba_jami') {
    if (taklifHajmi == null) muammolar.push('HAJM_YOQ');
    else if (pudratchiBirlikNarx != null) pudratchiSumma = pulYaxlitla(taklifHajmi * pudratchiBirlikNarx);
  }
  if (samaraliKategoriya === 'UNKNOWN') muammolar.push('KATEGORIYA_NOMALUM');

  return {
    ...qator, taklifHajmiOverride: hajmOverrideRaw, taklifHajmi, hajmManbasi,
    pudratchiBirlikNarx, pudratchiSumma, narxManbasi, qollanganFoiz, samaraliKategoriya, muammolar,
  };
}

const teng = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.5, Math.abs(b) * 1e-9);

/** Podval hosilasini manbaning O'ZIDAN tushunadi (formula bo'lmasa ham):
 *  - manba summasi = oldingi jami + keyingi hosilalar → yig'indi;
 *  - yozuvdagi foiz (`=5%`) manba bilan mos → baza × foiz;
 *  - aks holda manba nisbati (hosila ÷ baza) — xuddi o'sha ulush;
 *  - manbada 0 → taklifda ham 0. Asos yo'q/noma'lum → null (taxmin yo'q). */
/** Jami qatorning barcha RESOURCE barglari (ichki jamilar orqali). */
function jamiBarglari(jami: OfertaQatorNatija, byId: ReadonlyMap<string, OfertaQatorNatija>): OfertaQatorNatija[] {
  const out: OfertaQatorNatija[] = [];
  const yur = (id: string, chuqur: number) => {
    const n = byId.get(id);
    if (!n || chuqur > 20) return;
    if (n.rol === 'RESOURCE') out.push(n);
    else if (n.rol === 'SUBTOTAL' || n.rol === 'GRAND_TOTAL') for (const b of n.jamiBolalari ?? []) yur(b, chuqur + 1);
  };
  for (const b of jami.jamiBolalari ?? []) yur(b, 0);
  return out;
}

const foizlarOqi = (nom: string) => [...nom.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map((m) => ({ foiz: Number(m[1].replace(',', '.')), joy: m.index ?? 0 }));

/** Podval foizlari: avval qatorning alohida kataklaridagi (joy −1 — yozuvdagi
 * "М/К=…" dan oldin turadi, ya'ni asosiy foiz), keyin yozuvdagi. */
function podvalFoizlari(n: Pick<OfertaQator, 'nom' | 'katakFoizlari'>): Array<{ foiz: number; joy: number }> {
  return [...(n.katakFoizlari ?? []).map((foiz) => ({ foiz, joy: -1 })), ...foizlarOqi(n.nom.toUpperCase().replace(/Ё/g, 'Е'))];
}

/** Fayldan o'qilgan nakrutka foizi taklifi (P4.3). Avtomatik qo'llanmaydi. */
export type FayldagiFoiz = { kod: NakrutkaKoefKod; foiz: number; varaqlar: string[] };
export type FayldagiFoizlar = { taklif: FayldagiFoiz[]; ziddiyat: Array<{ kod: NakrutkaKoefKod; qiymatlar: Array<{ foiz: number; varaq: string }> }> };

/**
 * Tanlangan varaqlar podvalidagi foizlarni (транспорт 5%, склад 2%, М/К 0,75%,
 * кабель 1,5%, оборудование 1,2%/2%) nakrutka koeffitsientlariga moslaydi.
 * Kod barcha varaqlarda bir xil bo'lsagina taklif qilinadi; farq bo'lsa —
 * ziddiyat (operator hal qiladi).
 */
export function fayldagiFoizlar(qatorlar: readonly OfertaQator[]): FayldagiFoizlar {
  const topildi = new Map<NakrutkaKoefKod, Array<{ foiz: number; varaq: string }>>();
  const qosh = (kod: NakrutkaKoefKod, foiz: number | undefined, varaq: string) => {
    if (foiz == null || !Number.isFinite(foiz) || foiz <= 0 || foiz >= 100) return;
    const a = topildi.get(kod) ?? [];
    if (!a.some((x) => x.varaq === varaq && x.foiz === foiz)) a.push({ foiz, varaq });
    topildi.set(kod, a);
  };
  for (const q of qatorlar) {
    if (!q.hosila || (q.rol !== 'TRANSPORT' && q.rol !== 'STORAGE')) continue;
    const nom = q.nom.toUpperCase().replace(/Ё/g, 'Е');
    const f = podvalFoizlari(q);
    if (!f.length) continue;
    const ob = /ОБОРУД/.test(nom);
    if (q.rol === 'TRANSPORT') {
      qosh(/КАБЕЛ/.test(nom) ? 'ТРАНСПОРТ_КАБЕЛЬ' : ob ? 'ТРАНСПОРТ_ОБОРУД' : 'ТРАНСПОРТ_МАТЕРИАЛ', f[0].foiz, q.sourceSheet);
    } else {
      const mk = nom.search(/М\s*\/\s*К/);
      const mkFoiz = mk >= 0 ? f.find((x) => x.joy > mk) : undefined;
      const asosiy = f.find((x) => x !== mkFoiz);
      qosh(ob ? 'ЗАГОТ_СКЛАД_ОБОРУД' : 'СКЛАДСКИЕ_МАТЕРИАЛ', asosiy?.foiz, q.sourceSheet);
      if (mkFoiz) qosh('СКЛАДСКИЕ_МК', mkFoiz.foiz, q.sourceSheet);
    }
  }
  const taklif: FayldagiFoiz[] = [];
  const ziddiyat: FayldagiFoizlar['ziddiyat'] = [];
  for (const [kod, a] of topildi) {
    const qiymatlar = new Set(a.map((x) => x.foiz));
    if (qiymatlar.size === 1) taklif.push({ kod, foiz: a[0].foiz, varaqlar: [...new Set(a.map((x) => x.varaq))] });
    else ziddiyat.push({ kod, qiymatlar: a });
  }
  return { taklif, ziddiyat };
}

/** Manbada 0 bo'lgan podval qatori uchun kategoriya qoidasi — kanonik kaskad
 * kabi HAR KATEGORIYAGA o'z foizi: sklad (МАТ+КАБ)×2% + М/К×0,75% + ОБ×1,2%;
 * transport (МАТ+М/К+БЕЗСКЛАД)×5% + ОБ×2%; kabel transporti КАБ×1,5%.
 * Yozuvdagi foiz (`=2% И М/К=0,75%`) koeffitsientdan ustun; yozuvda bo'lmasa —
 * nakrutka koeffitsienti. Bo'limda yo'q kategoriya formulaga kirmaydi. */
function kategoriyaQoidasi(n: OfertaQatorNatija, barglar: readonly OfertaQatorNatija[], nk: NakrutkaKoeffitsientlar): Array<{ kat: OfertaKategoriya[]; foiz: number }> | null {
  const nom = n.nom.toUpperCase().replace(/Ё/g, 'Е');
  const f = podvalFoizlari(n);
  const k = (kod: keyof NakrutkaKoeffitsientlar) => Number(nk[kod] ?? 0);
  const bor = new Set<OfertaKategoriya>(barglar.map((b) => b.samaraliKategoriya ?? 'UNKNOWN'));
  const faqatOb = bor.size > 0 && [...bor].every((x) => x === 'ОБ');
  const q: Array<{ kat: OfertaKategoriya[]; foiz: number }> = [];
  const qosh = (kat: OfertaKategoriya[], foiz: number) => {
    const bori = kat.filter((x) => bor.has(x));
    if (bori.length && foiz > 0) q.push({ kat: bori, foiz });
  };
  if (n.rol === 'TRANSPORT' && /КАБЕЛ/.test(nom)) qosh(['КАБ'], f[0]?.foiz ?? k('ТРАНСПОРТ_КАБЕЛЬ'));
  else if (n.rol === 'STORAGE') {
    const mk = nom.search(/М\s*\/\s*К/);
    const mkFoiz = mk >= 0 ? f.find((x) => x.joy > mk) : undefined;
    const asosiy = f.find((x) => x !== mkFoiz);
    qosh(mkFoiz || !asosiy ? ['МАТ', 'КАБ'] : ['МАТ', 'КАБ', 'М/К'], faqatOb ? 0 : asosiy?.foiz ?? k('СКЛАДСКИЕ_МАТЕРИАЛ'));
    if (mkFoiz || !asosiy) qosh(['М/К'], mkFoiz?.foiz ?? k('СКЛАДСКИЕ_МК'));
    qosh(['ОБ'], faqatOb && asosiy ? asosiy.foiz : k('ЗАГОТ_СКЛАД_ОБОРУД'));
  } else if (n.rol === 'TRANSPORT') {
    qosh(['МАТ', 'М/К', 'БЕЗСКЛАД'], faqatOb ? 0 : f[0]?.foiz ?? k('ТРАНСПОРТ_МАТЕРИАЛ'));
    qosh(['ОБ'], faqatOb && f[0] ? f[0].foiz : k('ТРАНСПОРТ_ОБОРУД'));
  } else return null;
  return q;
}

function podvalniHisobla(n: OfertaQatorNatija, jami: OfertaQatorNatija | null, keyingi: OfertaQatorNatija[], byId: ReadonlyMap<string, OfertaQatorNatija>, nk: NakrutkaKoeffitsientlar): void {
  const src = n.smetaSumma;
  if (src == null || !Number.isFinite(src) || !jami || jami.smetaSumma == null) return;
  const yigindiManba = jami.smetaSumma + keyingi.reduce((a, k) => a + (k.smetaSumma ?? 0), 0);
  if (keyingi.length && teng(src, yigindiManba)) {
    const qism = [jami, ...keyingi];
    if (qism.every((k) => k.pudratchiSumma != null)) {
      n.podval = { tur: 'yigindi', bazalar: qism.map((k) => k.sourceId) };
      n.pudratchiSumma = qism.reduce((a, k) => a + (k.pudratchiSumma as number), 0);
    }
    return;
  }
  if (src === 0) {
    // Egasi (2026-09-25): asl smetada qo'lda 0 bo'lsa ham, yozuvdagi foiz
    // bo'lim resurslaridan hisoblansin — varaq OFERTA_JAMI kaskadi bilan mos.
    const barglar = jamiBarglari(jami, byId);
    const qismlar = kategoriyaQoidasi(n, barglar, nk);
    if (!qismlar?.length) { n.podval = { tur: 'nol' }; n.pudratchiSumma = 0; return; }
    if (barglar.some((b) => b.pudratchiSumma == null)) return;
    let v = 0;
    for (const q of qismlar) {
      const asos = barglar.filter((b) => q.kat.includes(b.samaraliKategoriya ?? 'UNKNOWN')).reduce((a, b) => a + (b.pudratchiSumma as number), 0);
      v += asos * q.foiz / 100;
    }
    n.podval = { tur: 'kategoriya', bazaQatorlar: barglar.map((b) => b.sourceId), qismlar };
    n.pudratchiSumma = pulYaxlitla(v);
    return;
  }
  if (jami.pudratchiSumma == null || !jami.smetaSumma) return;
  const foizlar = podvalFoizlari(n).map((x) => x.foiz);
  const mos = foizlar.find((f) => teng(src, jami.smetaSumma! * f / 100));
  const koef = mos != null ? mos / 100 : src / jami.smetaSumma;
  n.podval = { tur: 'foiz', baza: jami.sourceId, koef, foiz: mos ?? null };
  n.pudratchiSumma = pulYaxlitla(jami.pudratchiSumma * koef);
}

function bosNatija(qator: OfertaQator, muammolar: OfertaMuammo[] = []): OfertaQatorNatija {
  return {
    ...qator, taklifHajmiOverride: null, taklifHajmi: null, hajmManbasi: 'yoq',
    pudratchiBirlikNarx: null, pudratchiSumma: null, narxManbasi: 'yoq', qollanganFoiz: null,
    samaraliKategoriya: null, muammolar,
  };
}

function kaskadYaxlit(q: NakrutkaQadamlar): NakrutkaQadamlar {
  return Object.fromEntries(Object.entries(q).map(([k, v]) => [k, pulYaxlitla(v)])) as NakrutkaQadamlar;
}

/**
 * RES qatorlaridan oferta natijasini quradi. Noma'lum qiymatlar 0 ga
 * aylantirilmaydi; hal qilinmagan barg bo'lsa yakuniy oferta null.
 */
export function ofertaHisobla(qatorlar: readonly OfertaQator[], kirish: OfertaKirish): OfertaHisoblash {
  const nk: NakrutkaKoeffitsientlar = { ...NAKRUTKA_STANDART, ...(kirish.nakrutka ?? {}) } as NakrutkaKoeffitsientlar;
  const transportSiyosati = kirish.transportSiyosati ?? 'kaskad';
  const byId = new Map<string, OfertaQatorNatija>();
  const natijalar: OfertaQatorNatija[] = [];
  const tayyor = guruhTayyorla(qatorlar, kirish.birXilNarx !== false, kirish.asosNarxTanlovi);

  for (const qator of tayyor.qatorlar) {
    const n = narxlanadiganmi(qator) ? bargNatija(qator, kirish, tayyor.asosNarx.get(qator.sourceId)) : bosNatija(qator);
    if (tayyor.harXil.has(qator.sourceId)) n.muammolar.push('NARX_HAR_XIL');
    byId.set(qator.sourceId, n);
    natijalar.push(n);
  }
  // Jami va podval qatorlari — yuqoridan pastga, varaq bo'yicha (Excel SUM /
  // podval formulalari bilan bir tartibda). Ichki jami tashqisidan oldin tayyor.
  let joriyVaraq = '';
  let oxirgiJami: OfertaQatorNatija | null = null;
  let jamidanKeyin: OfertaQatorNatija[] = [];
  for (const n of natijalar) {
    if (n.sourceSheet !== joriyVaraq) { joriyVaraq = n.sourceSheet; oxirgiJami = null; jamidanKeyin = []; }
    if (n.rol === 'SUBTOTAL' || n.rol === 'GRAND_TOTAL') {
      if (n.jamiMoslik === 'mos_emas') { n.muammolar.push('JAMI_MOS_EMAS'); continue; }
      const bolalar = (n.jamiBolalari ?? []).map((id) => byId.get(id)).filter((x): x is OfertaQatorNatija => !!x);
      const qiymatlar = bolalar.map((b) => b.pudratchiSumma).filter((v): v is number => v != null);
      n.pudratchiSumma = qiymatlar.length ? qiymatlar.reduce((a, b) => a + b, 0) : null;
      oxirgiJami = n; jamidanKeyin = [];
      continue;
    }
    if (n.hosila && (n.rol === 'TRANSPORT' || n.rol === 'STORAGE')) {
      podvalniHisobla(n, oxirgiJami, jamidanKeyin, byId, nk);
      jamidanKeyin.push(n);
    }
  }

  return ofertaYigish(natijalar, nk, transportSiyosati);
}

/**
 * Hisoblangan qatorlardan yig'indilar, kanonik kaskad va yakuniy oferta.
 * Paketda har bir obyekt (fayl) o'z qatorlari bilan alohida yig'iladi —
 * narxlar esa butun paket bo'yicha bir marta hisoblangan (bir xil material =
 * bir xil narx).
 */
export function ofertaYigish(natijalar: OfertaQatorNatija[], nk: NakrutkaKoeffitsientlar, transportSiyosati: OfertaTransportSiyosati): OfertaHisoblash {
  // Varaq bo'yicha, keyin varaqlar tartibida yig'amiz (Excel SUMIFS + '+').
  const varaqlar: string[] = [];
  const perSheet = new Map<string, { kat: OfertaKategoriyaJami; manba: OfertaKategoriyaJami; transport: number }>();
  for (const n of natijalar) {
    if (!perSheet.has(n.sourceSheet)) { varaqlar.push(n.sourceSheet); perSheet.set(n.sourceSheet, { kat: bosKategoriyaJami(), manba: bosKategoriyaJami(), transport: 0 }); }
    const s = perSheet.get(n.sourceSheet)!;
    if (n.rol === 'RESOURCE') {
      const kat = n.samaraliKategoriya ?? 'UNKNOWN';
      if (n.pudratchiSumma != null) s.kat[kat] += n.pudratchiSumma;
      if (n.smetaSumma != null && Number.isFinite(n.smetaSumma)) s.manba[kat] += n.smetaSumma;
    } else if (n.rol === 'TRANSPORT' && n.hosila === false && n.pudratchiSumma != null) {
      s.transport += n.pudratchiSumma;
    }
  }
  const kategoriyaJami = bosKategoriyaJami();
  const manbaKategoriyaJami = bosKategoriyaJami();
  let transportVaraqJami = 0;
  for (const v of varaqlar) {
    const s = perSheet.get(v)!;
    for (const key of Object.keys(kategoriyaJami) as OfertaKategoriya[]) {
      kategoriyaJami[key] += s.kat[key];
      manbaKategoriyaJami[key] += s.manba[key];
    }
    transportVaraqJami += s.transport;
  }
  const sumAll = (j: OfertaKategoriyaJami) => (Object.values(j) as number[]).reduce((a, b) => a + b, 0);

  const asos = kategoriyadanAsos(kategoriyaJami);
  const qoshimcha = transportSiyosati === 'varaq' ? { trMatOverride: transportVaraqJami } : {};
  const kaskadXom = nakrutkaKaskadXom(asos, nk, qoshimcha);

  // Egasi qoidasi (2026-10-08): yakuniy summa har doim ko'rinadi; narxsiz/kategoriyasiz qator — faqat o'zi uchun bildirishnoma
  // (mashinist mehnati narxi mashina ichida — sanalmaydi). Narx 0 — haqiqiy 0.
  const halQilinmagan = natijalar.filter((n) => n.rol === 'RESOURCE' && ((n.pudratchiSumma == null && !mashinistMehnati(n)) || n.samaraliKategoriya === 'UNKNOWN')).length;
  const muammolarSoni = natijalar.reduce((a, n) => a + n.muammolar.length, 0);
  const yakuniyOferta = natijalar.some((n) => n.rol === 'RESOURCE') ? pulYaxlitla(kaskadXom.vsego) : null;

  return {
    qatorlar: natijalar,
    manbaTogridanJami: sumAll(manbaKategoriyaJami),
    manbaKategoriyaJami,
    togridanJami: sumAll(kategoriyaJami),
    kategoriyaJami,
    transportVaraqJami,
    asos,
    koeffitsientlar: nk,
    transportSiyosati,
    kaskadXom,
    kaskad: kaskadYaxlit(kaskadXom),
    manbaKaskad: kaskadYaxlit(nakrutkaKaskadXom(kategoriyadanAsos(manbaKategoriyaJami), nk)),
    yakuniyOferta,
    halQilinmagan,
    muammolarSoni,
    valid: muammolarSoni === 0 && yakuniyOferta != null,
    guruhlar: guruhlarQur(natijalar),
  };
}