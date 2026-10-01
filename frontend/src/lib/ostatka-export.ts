import type { T2Qator, T2QatorHolat } from '../api/supabase';
import {
  RasmiyVaraq, bugunSana, sumRefs, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, yaxlit2,
  type ImzoNomlar, type Qiymat, type RasmiyUstun,
} from './hujjat-yozuvchi';
import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import { NAKRUTKA_KATLAR, kOplate, kategoriyaKf, nakrutkaKat, nakrutkaPodvaliYoz, podvalKfQatorlari, type KatSummalar } from './nakrutka-podval';
import { podvalgaKoefQoy, type Podval } from './nakrutka-konstruktor';
import { bosRefs } from './hujjat-yozuvchi';

/**
 * OSTATKA — bajarilmay qolgan ishlar smeta shaklida (egasi 2026-09-23: "tizim
 * ostatka ishlarni ham bittada smeta shaklida bera oladigan bo'lishi kerak").
 *
 * Ta'rif LRV_PLUS dagi Q ustuni bilan bir xil: ostatka = smeta hajm − fakt hajm
 * (`t2_qator_holat.fakt_hajm`; rs uchun bl faktidan norma bo'yicha hosila ham).
 * Hujjat LRV_PLUS yozuvchisi (Forma-2 ko'rinishi) orqali chiqadi — formulalar,
 * guruhlash, `$` siz qoidasi va bl birlik narxi o'sha yerda.
 *
 *  - faqat ostatkasi > 0 barglar va ularning RZ/BL otalari (ichma-ich RZ saqlanadi);
 *  - hajm o'rniga ostatka hajm; summa Excel formulasidan (F × G, SUMIF);
 *  - smeta hajmi noma'lum (NULL) qator — ostatka ham noma'lum: kirmaydi, sanaladi;
 *  - fakt smetadan oshgan qator — kirmaydi, sanaladi (jim yashirilmaydi).
 */
export interface OstatkaNatija {
  qatorlar: T2Qator[];
  /** Fakt smetadan oshgan barglar soni. */
  oshibKetgan: number;
  /** Smeta hajmi noma'lum barglar soni. */
  nomalum: number;
  /** Ostatkasi bor barglar soni. */
  barglar: number;
}

const EPS = 1e-9;
const BARG = new Set(['rs', 'mat', 'ob']);

export function ostatkaQatorlari(qatorlar: readonly T2Qator[], holatlar: readonly T2QatorHolat[]): OstatkaNatija {
  const faktOf = new Map(holatlar.map((h) => [h.qator_id, h.fakt_hajm ?? 0]));
  const bolalar = new Map<number, T2Qator[]>();
  for (const q of qatorlar) {
    if (q.ota_id == null) continue;
    const b = bolalar.get(q.ota_id);
    if (b) b.push(q); else bolalar.set(q.ota_id, [q]);
  }
  const ost = new Map<number, number>();
  let oshibKetgan = 0, nomalum = 0, barglar = 0;
  const ostHisobla = (q: T2Qator): number | null => {
    if (q.hajm == null) return null;
    const o = q.hajm - (faktOf.get(q.id) ?? 0);
    return Math.abs(o) < EPS ? 0 : o;
  };
  const qolsin = new Set<number>();
  // Bargdan yuqoriga: barg qolsa — butun ota zanjiri qoladi.
  const byId = new Map(qatorlar.map((q) => [q.id, q]));
  const otalarniQoldir = (q: T2Qator) => {
    for (let o = q.ota_id == null ? undefined : byId.get(q.ota_id); o && !qolsin.has(o.id); o = o.ota_id == null ? undefined : byId.get(o.ota_id)) {
      qolsin.add(o.id);
    }
  };
  for (const q of qatorlar) {
    const tur = q.tur ?? '';
    const bolasiBor = (bolalar.get(q.id)?.length ?? 0) > 0;
    const bargmi = BARG.has(tur) || (tur === 'bl' && !bolasiBor);
    if (!bargmi && tur !== 'bl') continue;
    const o = ostHisobla(q);
    if (o == null) { if (bargmi) nomalum++; continue; }
    if (o < 0) { if (bargmi) oshibKetgan++; continue; }
    if (o === 0) continue;
    ost.set(q.id, o);
    if (bargmi) { barglar++; qolsin.add(q.id); otalarniQoldir(q); }
  }
  // bl ning o'zi ostatkasi bo'lsa-yu, resurslari (norma hosilasi) qolmagan bo'lsa ham bl qoladi.
  for (const q of qatorlar) if (q.tur === 'bl' && ost.has(q.id) && !qolsin.has(q.id)) { qolsin.add(q.id); otalarniQoldir(q); }

  const chiq = qatorlar
    .filter((q) => qolsin.has(q.id))
    .map((q) => (ost.has(q.id) ? { ...q, hajm: ost.get(q.id)!, summa: null } : { ...q, summa: null }));
  return { qatorlar: chiq, oshibKetgan, nomalum, barglar };
}

// ═══════════════════ OSTATKA — rasmiy hujjat (P2, H1–H9) ═══════════════════


/**
 * Ostatkadan chiqarilgan ish (egasi 2026-09-25: "smetada qilinmagan ishlar yoki
 * bekor qilingan ishlar bo'lishi mumkin"). Manba — kanonik o'zgartirish
 * nazorati `t2_smeta_ozgarish` (tur = 'olib_tashlash'):
 *  - `tasdiqlangan`: t2_qator.hajm allaqachon yangi hajmda (0 yoki fakt) —
 *    ostatka o'zi 0; hujjatda «ИСКЛЮЧЕНО ИЗ ОСТАТКА» bo'limida asl hajm,
 *    chiqarilgan hajm va asos bilan ko'rsatiladi, ВСЕГО ga kirmaydi;
 *  - `qoralama`: hali tasdiqlanmagan — ostatkada qoladi, «ТРЕБУЮТ ВНИМАНИЯ».
 * Jim yo'qotish yo'q: har chiqarilgan pozitsiya hujjatda sababi bilan turadi.
 */
export type OstatkaIstisno = {
  qatorId: number;
  holat: 'tasdiqlangan' | 'qoralama';
  /** Smeta hajmi o'zgarishdan oldin (asl). */
  eskiHajm: number | null;
  /** O'zgarishdan keyingi hajm (to'liq bekor — 0, qolgan qismi — fakt). */
  yangiHajm: number | null;
  /** Asos: "изменение № … от dd.mm.yyyy" (+ hujjat izohi). */
  asos: string;
  sabab: string;
};

type OzgarishXom = {
  id: number; raqam?: string | null; tur?: string | null; holat?: string | null; sabab?: string | null;
  evidence_izoh?: string | null; tasdiqlandi?: string | null; yaratildi?: string | null;
  qatorlar?: Array<{ qator_id?: number | null; amal?: string | null; eski_hajm?: number | string | null; yangi_hajm?: number | string | null }>;
};

const sonYoki = (x: unknown): number | null => (x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);
const sanaRu = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');

/** `ozgarish-royxat` javobidan ostatka istisnolari (faqat olib_tashlash, faol holatlar). */
export function ostatkaIstisnolari(ozgarishlar: readonly OzgarishXom[]): OstatkaIstisno[] {
  const out = new Map<number, OstatkaIstisno>();
  // Eskisidan yangisiga: bir qatorga keyingi o'zgarish oldingisini almashtiradi.
  const tartib = [...ozgarishlar].sort((a, b) => String(a.yaratildi ?? '').localeCompare(String(b.yaratildi ?? '')) || a.id - b.id);
  for (const o of tartib) {
    if (o.tur !== 'olib_tashlash' || (o.holat !== 'tasdiqlangan' && o.holat !== 'qoralama')) continue;
    const asos = [`изменение № ${o.raqam || o.id} от ${sanaRu(o.tasdiqlandi || o.yaratildi)}`, o.evidence_izoh?.trim()].filter(Boolean).join(', ');
    for (const z of o.qatorlar ?? []) {
      if (z.qator_id == null || (z.amal !== 'olib_tashlash' && z.amal !== 'hajm')) continue;
      const yangi = z.amal === 'olib_tashlash' ? 0 : sonYoki(z.yangi_hajm);
      const oldin = out.get(z.qator_id);
      // Tasdiqlangan istisno ustiga qoralama kelsa — tasdiqlangani hujjatda qoladi.
      if (oldin?.holat === 'tasdiqlangan' && o.holat === 'qoralama') continue;
      out.set(z.qator_id, { qatorId: z.qator_id, holat: o.holat, eskiHajm: sonYoki(z.eski_hajm), yangiHajm: yangi, asos, sabab: (o.sabab ?? '').trim() });
    }
  }
  return [...out.values()];
}

export type OstatkaIstisnoQator = {
  id: number; kod: string; nom: string; birlik: string; yol: string;
  /** Ish (bl) darajasidagi istisno — summa normali resurslar bo'yicha. */
  bl: boolean;
  eskiHajm: number | null; faktHajm: number | null; chiqarilgan: number | null;
  narx: number | null; summa: number | null; asos: string; sabab: string;
};

export type OstatkaHujjatOpsiya = {
  obyektNomi: string;
  /** "По состоянию на" — sana (YYYY-MM-DD). Berilmasa — bugun. */
  sana?: string;
  imzo?: ImzoNomlar;
  /** Obyekt nakrutka foizlari — остаток к оплате = прямые × Kf. Berilmasa 0 %. */
  nakrutka?: Partial<NakrutkaKoeffitsientlar> | null;
  /** Maxsus nakrutka podvali (konstruktor) — null: standart kaskad. */
  podval?: Podval | null;
  /** НДС stavkasi (sukut: nakrutkadagi НДС, u ham bo'lmasa 12 %). */
  ndsFoiz?: number | null;
};

/** Hujjat modeli qatori — UI va Excel bir xil sonni shu modeldan oladi. */
export type OstatkaModelQator = {
  id: number;
  tur: 'rz' | 'bl' | 'barg' | 'itogo';
  daraja: number;
  tartib: string;
  kod: string;
  nom: string;
  birlik: string;
  smetaHajm: number | null;
  faktHajm: number | null;
  ostatkaHajm: number | null;
  narx: number | null;
  summa: number | null;
  /** Noma'lum pul pozitsiyalari soni (bu qator va uning ostida). */
  nomalum: number;
  /** Resurs kategoriyasi (barg) — к оплате koeffitsienti uchun. */
  kat?: string | null;
  /** Qaysi qatorlar yig'indisi (itogo/bl/rz uchun) — model indekslari. */
  bolalar: number[];
};

export type OstatkaModel = {
  qatorlar: OstatkaModelQator[];
  /** ВСЕГО ОСТАТОК — noma'lum pozitsiya bo'lsa null (taxmin yo'q). */
  jami: number | null;
  /** Yuqori darajadagi qatorlar (ВСЕГО shular yig'indisi). */
  ildizlar: number[];
  oshibKetgan: Array<{ nom: string; birlik: string; smetaHajm: number; faktHajm: number; yol: string }>;
  diqqat: Array<{ nom: string; sabab: string; joy?: string }>;
  barglar: number;
  /** Tasdiqlangan istisnolar — «ИСКЛЮЧЕНО ИЗ ОСТАТКА», ВСЕГО ga kirmaydi. */
  chiqarilgan: OstatkaIstisnoQator[];
  /** Chiqarilganlar jami summasi (noma'lum bo'lsa null). */
  chiqarilganJami: number | null;
};

const OST_BARG = new Set(['rs', 'mat', 'ob']);
const OST_EPS = 1e-9;
const ost = (x: number): number => (Math.abs(x) < OST_EPS ? 0 : x);

/**
 * Kanonik daraxt (ichma-ich RZ) → Ostatka hujjat modeli.
 *  - barg (rs/mat/ob, bolasiz bl): ostatka = smeta hajm − fakt hajm; summa =
 *    ROUND(ostatka × smeta narxi; 2);
 *  - bl: bolalari summasi; bir birlik narxi = summa / bl ostatka hajmi;
 *  - RZ: ichma-ich saqlanadi, har biri "ИТОГО ПО …" bilan yopiladi;
 *  - tugagan (ostatka = 0) barglar kirmaydi; fakt > smeta — alohida ro'yxat;
 *  - smeta hajmi, fakt yoki narx noma'lum — qator jadvalda qoladi, summa bo'sh,
 *    yuqoridagi barcha jamilar ham bo'sh (NULL ≠ 0), "ТРЕБУЮТ ВНИМАНИЯ" da.
 */
export function ostatkaHujjatModeli(qatorlar: readonly T2Qator[], holatlar: readonly T2QatorHolat[], istisnolar: readonly OstatkaIstisno[] = []): OstatkaModel {
  const rows = [...qatorlar].sort((a, b) => (a.tartib ?? 0) - (b.tartib ?? 0) || a.id - b.id);
  const byId = new Map(rows.map((q) => [q.id, q]));
  const holat = new Map(holatlar.map((h) => [h.qator_id, h]));
  const bolalar = new Map<number | null, T2Qator[]>();
  for (const q of rows) {
    const ota = q.ota_id != null && byId.has(q.ota_id) ? q.ota_id : null;
    const a = bolalar.get(ota);
    if (a) a.push(q); else bolalar.set(ota, [q]);
  }
  const yolOf = (q: T2Qator): string => {
    const y: string[] = [];
    for (let o = q.ota_id == null ? undefined : byId.get(q.ota_id); o; o = o.ota_id == null ? undefined : byId.get(o.ota_id)) if (o.tur === 'rz' || o.tur === 'bl') y.unshift(o.nom ?? '');
    return y.join(' › ');
  };
  const istisnoOf = new Map(istisnolar.map((x) => [x.qatorId, x]));
  const out: OstatkaModelQator[] = [];
  const oshib: OstatkaModel['oshibKetgan'] = [];
  const diqqat: OstatkaModel['diqqat'] = [];
  let no = 0;
  let barglar = 0;

  const bargHisob = (q: T2Qator) => {
    const h = holat.get(q.id);
    const smeta = q.hajm ?? null;
    const fakt = h ? Number(h.fakt_hajm ?? 0) : null;
    const o = smeta == null || fakt == null ? null : ost(smeta - fakt);
    return { smeta, fakt, o };
  };

  // Qatorni qayta ishlaydi; model indeksini (yoki kirmasa null) qaytaradi.
  const qayta = (q: T2Qator, daraja: number, blNo: string | null, k: number): number | null => {
    const tur = q.tur ?? '';
    const kids = bolalar.get(q.id) ?? [];
    if (OST_BARG.has(tur) || (tur === 'bl' && !kids.length)) {
      const { smeta, fakt, o } = bargHisob(q);
      if (o != null && o < 0) { oshib.push({ nom: q.nom ?? '', birlik: q.birlik ?? '', smetaHajm: smeta!, faktHajm: fakt!, yol: yolOf(q) }); return null; }
      if (o === 0) return null;
      const narx = q.narx ?? null;
      const summa = o != null && narx != null ? yaxlit2(o * narx) : null;
      const sabablar = [smeta == null ? 'нет количества по смете' : '', fakt == null ? 'нет данных о выполнении' : '', narx == null ? 'нет сметной цены' : ''].filter(Boolean);
      if (sabablar.length) diqqat.push({ nom: `${q.nom ?? ''}${q.birlik ? `, ${q.birlik}` : ''}`, sabab: sabablar.join('; '), joy: yolOf(q) || undefined });
      const kutilmoqda = istisnoOf.get(q.id);
      if (kutilmoqda?.holat === 'qoralama') diqqat.push({ nom: `${q.nom ?? ''}${q.birlik ? `, ${q.birlik}` : ''}`, sabab: `исключение из остатка на согласовании (${kutilmoqda.asos}${kutilmoqda.sabab ? `; ${kutilmoqda.sabab}` : ''}) — до утверждения учитывается в остатке`, joy: yolOf(q) || undefined });
      barglar++;
      const tartib = blNo ? `${blNo}.${k}` : String(++no);
      out.push({ id: q.id, tur: 'barg', daraja, tartib, kod: q.kod ?? '', nom: q.nom ?? '', birlik: q.birlik ?? '', smetaHajm: smeta, faktHajm: fakt, ostatkaHajm: o, narx, summa, nomalum: summa == null ? 1 : 0, kat: q.kat ?? null, bolalar: [] });
      return out.length - 1;
    }
    if (tur === 'bl') {
      const idx = out.length;
      const { smeta, fakt, o } = bargHisob(q);
      const nomer = String(++no);
      out.push({ id: q.id, tur: 'bl', daraja, tartib: nomer, kod: q.kod ?? '', nom: q.nom ?? '', birlik: q.birlik ?? '', smetaHajm: smeta, faktHajm: fakt, ostatkaHajm: o == null ? null : Math.max(o, 0), narx: null, summa: null, nomalum: 0, bolalar: [] });
      let kk = 0;
      const b: number[] = [];
      for (const c of kids) { const i = qayta(c, daraja + 1, nomer, kk + 1); if (i != null) { b.push(i); kk++; } }
      if (!b.length) { out.length = idx; no--; return null; }
      const row = out[idx];
      row.bolalar = b;
      row.nomalum = b.reduce((s, i) => s + out[i].nomalum, 0);
      row.summa = row.nomalum ? null : yaxlit2(b.reduce((s, i) => s + (out[i].summa ?? 0), 0));
      row.narx = row.summa != null && row.ostatkaHajm ? row.summa / row.ostatkaHajm : null;
      return idx;
    }
    // rz (yoki noma'lum tur) — bo'lim; bolalari bo'lmasa kirmaydi.
    const idx = out.length;
    out.push({ id: q.id, tur: 'rz', daraja, tartib: '', kod: '', nom: q.nom ?? '', birlik: '', smetaHajm: null, faktHajm: null, ostatkaHajm: null, narx: null, summa: null, nomalum: 0, bolalar: [] });
    const b: number[] = [];
    for (const c of kids) { const i = qayta(c, daraja + 1, null, 0); if (i != null) b.push(i); }
    if (!b.length) { out.length = idx; return null; }
    const nomalum = b.reduce((s, i) => s + out[i].nomalum, 0);
    const summa = nomalum ? null : yaxlit2(b.reduce((s, i) => s + (out[i].summa ?? 0), 0));
    out.push({ id: q.id, tur: 'itogo', daraja, tartib: '', kod: '', nom: `ИТОГО ПО РАЗДЕЛУ: ${q.nom ?? ''}`, birlik: '', smetaHajm: null, faktHajm: null, ostatkaHajm: null, narx: null, summa, nomalum, bolalar: b });
    out[idx].nomalum = nomalum;
    out[idx].summa = summa;
    return out.length - 1; // ota uchun — ИТОГО qatori
  };

  const ildizlar: number[] = [];
  for (const q of bolalar.get(null) ?? []) { const i = qayta(q, 0, null, 0); if (i != null) ildizlar.push(i); }
  const nomalum = ildizlar.reduce((s, i) => s + out[i].nomalum, 0);
  const jami = !ildizlar.length || nomalum ? null : yaxlit2(ildizlar.reduce((s, i) => s + (out[i].summa ?? 0), 0));
  // Tasdiqlangan istisnolar: chiqarilgan hajm = asl smeta hajmi − yangi hajm.
  const chiqarilgan: OstatkaIstisnoQator[] = [];
  for (const x of istisnolar) {
    if (x.holat !== 'tasdiqlangan') continue;
    const q = byId.get(x.qatorId);
    if (!q) continue;
    const h = holat.get(q.id);
    const fakt = h ? Number(h.fakt_hajm ?? 0) : null;
    const ch = x.eskiHajm == null || x.yangiHajm == null ? null : ost(x.eskiHajm - x.yangiHajm);
    let narx = q.narx ?? null;
    let summa = ch != null && narx != null ? yaxlit2(ch * narx) : null;
    const kids = bolalar.get(q.id) ?? [];
    if (q.tur === 'bl' && kids.length) {
      // Ish (bl) hajmi kamaysa, normali resurslar norma bo'yicha kamayadi
      // (t2_qator_tahrir norma kaskadi): chiqarilgan summa = Σ norma × Δ × narx.
      // Normasiz resurslar o'zgarishda alohida qator bo'lib keladi.
      const normali = kids.filter((k) => OST_BARG.has(k.tur ?? '') && k.norma != null);
      summa = ch == null || !normali.length || normali.some((k) => k.narx == null) ? null
        : yaxlit2(normali.reduce((s2, k) => s2 + yaxlit2(Number(k.norma) * ch * Number(k.narx)), 0));
      narx = summa != null && ch ? summa / ch : null;
    }
    chiqarilgan.push({
      id: q.id, kod: q.kod ?? '', nom: q.nom ?? '', birlik: q.birlik ?? '', yol: yolOf(q), bl: q.tur === 'bl',
      eskiHajm: x.eskiHajm, faktHajm: fakt, chiqarilgan: ch, narx, summa, asos: x.asos, sabab: x.sabab,
    });
  }
  const rowIdx = new Map(rows.map((q, i) => [q.id, i]));
  chiqarilgan.sort((a, b) => (rowIdx.get(a.id) ?? 0) - (rowIdx.get(b.id) ?? 0));
  const chiqarilganJami = chiqarilgan.some((c) => c.summa == null) ? null : yaxlit2(chiqarilgan.reduce((s, c) => s + (c.summa ?? 0), 0));
  return { qatorlar: out, jami, ildizlar, oshibKetgan: oshib, diqqat, barglar, chiqarilgan, chiqarilganJami };
}

const OSTATKA_USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 7, tur: 'tartib' },
  { sarlavha: 'Шифр, код', kenglik: 15, tur: 'kod' },
  { sarlavha: 'Наименование работ и затрат', kenglik: 52, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 9, tur: 'birlik' },
  { sarlavha: 'по смете', kenglik: 13, tur: 'hajm', guruh: 'КОЛИЧЕСТВО' },
  { sarlavha: 'выполнено', kenglik: 13, tur: 'hajm', guruh: 'КОЛИЧЕСТВО' },
  { sarlavha: 'остаток', kenglik: 13, tur: 'hajm', guruh: 'КОЛИЧЕСТВО' },
  { sarlavha: 'цена за ед., сум', kenglik: 15, tur: 'narx', guruh: 'СТОИМОСТЬ ОСТАТКА' },
  { sarlavha: 'сумма, сум', kenglik: 17, tur: 'pul', guruh: 'СТОИМОСТЬ ОСТАТКА' },
  // Yashirin texnik ustun: noma'lum pul pozitsiyalari soni (jamini bo'sh qoldirish uchun).
  { sarlavha: 'Н', kenglik: 4, tur: 'texnik', yashirin: true },
  { sarlavha: 'Стоимость остатка к оплате (с накладными расходами и НДС), сум', kenglik: 19, tur: 'pul' },
  { sarlavha: 'Кат.', kenglik: 6, tur: 'texnik', yashirin: true },
];
// A № B код C наим. D ед. E смета F выполн. G остаток H цена I сумма J Н(яш.) K к оплате L кат(яш.)

/** Ostatka — bajarilmay qolgan ishlar smeta shaklida (.xlsx). */
export function ostatkaHujjatXlsx(model: OstatkaModel, o: OstatkaHujjatOpsiya): { bytes: Uint8Array; faylNomi: string; kOplata: number | null; kOplataVsego: number | null } {
  const sana = o.sana ?? bugunSana();
  const sanaRu = sana.split('-').reverse().join('.');
  const v = new RasmiyVaraq({
    nom: 'Остаток работ',
    sarlavha: 'ВЕДОМОСТЬ ОСТАТКА РАБОТ',
    ostSarlavha: [`(невыполненные объемы работ по смете по состоянию на ${sanaRu})`],
    titul: [
      ['Объект:', o.obyektNomi],
      ['Заказчик:', o.imzo?.zakazchik],
      ['Подрядчик:', o.imzo?.pudratchi],
      ['Основание:', 'ведомость объемов работ и ресурсов (ЛРВ) объекта; выполнение — по учтенным актам факта'],
    ],
    ustunlar: OSTATKA_USTUNLAR,
    yonalish: 'landscape',
  });
  // Har model qatori hujjatda aynan bitta qator: satr raqami oldindan ma'lum,
  // shuning uchun ota (bl/ИТОГО) formulasi bolalar qatoriga havola qila oladi.
  const bosh = v.malumotBoshi;
  const rowOf = (i: number) => bosh + i;
  const qiy = (x: number | null): Qiymat => (x == null ? null : x);
  // Ikki narx: K = ROUND(I × Kf[kat], 2); podval ВСЕГО dan keyin bitta bo'sh qatordan so'ng.
  const nk: Partial<NakrutkaKoeffitsientlar> = { ...(o.nakrutka ?? {}) };
  nk.НДС = o.ndsFoiz ?? nk.НДС ?? 12;
  const podval = o.podval ? podvalgaKoefQoy(o.podval, nk) : null;
  const kfJS = kategoriyaKf(nk, podval);
  const kfQ = podvalKfQatorlari(bosh + model.qatorlar.length + 2, podval);
  const koMemo = new Map<number, number | null>();
  const koOf = (i: number): number | null => {
    if (koMemo.has(i)) return koMemo.get(i)!;
    const q = model.qatorlar[i];
    let val: number | null;
    if (q.tur === 'barg') val = kOplate(q.summa, nakrutkaKat(q.kat), kfJS);
    else if (q.tur === 'rz') val = null;
    else { const vs = q.bolalar.map(koOf); val = !vs.length || vs.some((x) => x == null) ? null : yaxlit2(vs.reduce<number>((a2, b2) => a2 + (b2 ?? 0), 0)); }
    koMemo.set(i, val);
    return val;
  };
  const koYig = (idx: readonly number[]): Qiymat => {
    if (!idx.length) return null;
    const rows = idx.map(rowOf);
    const vs = idx.map(koOf);
    return { f: `IF(${bosRefs('K', rows)}>0,"",${sumRefs('K', rows)})`, v: vs.some((x) => x == null) ? '' : yaxlit2(vs.reduce<number>((a2, b2) => a2 + (b2 ?? 0), 0)) };
  };
  const katsiz: string[] = [];
  model.qatorlar.forEach((q, i) => {
    const kid = (col: string) => sumRefs(col, q.bolalar.map(rowOf));
    let r = 0;
    if (q.tur === 'rz') r = v.bolim(q.nom, { daraja: q.daraja });
    else if (q.tur === 'barg') {
      r = v.qator('oddiy', (n) => [
        q.tartib, q.kod, q.nom, q.birlik, qiy(q.smetaHajm), qiy(q.faktHajm),
        { f: `IF(OR(E${n}="",F${n}=""),"",E${n}-F${n})`, v: q.ostatkaHajm ?? '' },
        qiy(q.narx),
        { f: `IF(OR(G${n}="",H${n}=""),"",ROUND(G${n}*H${n},2))`, v: q.summa ?? '' },
        { f: `IF(I${n}="",1,0)`, v: q.nomalum },
        ...((): Qiymat[] => {
          const kat = nakrutkaKat(q.kat);
          if (!kat) { katsiz.push(`${q.nom}${q.birlik ? `, ${q.birlik}` : ''}`); return [null, null]; }
          return [{ f: `IF(I${n}="","",ROUND(I${n}*H${kfQ[kat]},2))`, v: koOf(i) ?? '' }, kat];
        })(),
      ], { daraja: q.daraja });
    } else if (q.tur === 'bl') {
      r = v.qator('ish', (n) => [
        q.tartib, q.kod, q.nom, q.birlik, qiy(q.smetaHajm), qiy(q.faktHajm),
        { f: `IF(OR(E${n}="",F${n}=""),"",MAX(E${n}-F${n},0))`, v: q.ostatkaHajm ?? '' },
        { f: `IF(OR(I${n}="",N(G${n})=0),"",I${n}/G${n})`, v: q.narx ?? '' },
        { f: `IF(J${n}>0,"",${kid('I')})`, v: q.summa ?? '' },
        { f: kid('J'), v: q.nomalum },
        koYig(q.bolalar), null,
      ], { daraja: q.daraja });
    } else {
      r = v.qator('jami', (n) => [
        null, null, q.nom, null, null, null, null, null,
        { f: `IF(J${n}>0,"",${kid('I')})`, v: q.summa ?? '' },
        { f: kid('J'), v: q.nomalum },
        koYig(q.bolalar), null,
      ], { daraja: q.daraja });
    }
    if (r !== rowOf(i)) throw new Error('OSTATKA_QATOR_SILJIDI');
  });
  if (model.ildizlar.length) {
    const nomalum = model.ildizlar.reduce((s, i) => s + model.qatorlar[i].nomalum, 0);
    v.qator('vsego', (n) => [
      null, null, 'ВСЕГО ОСТАТОК РАБОТ ПО ОБЪЕКТУ', null, null, null, null, null,
      { f: `IF(J${n}>0,"",${sumRefs('I', model.ildizlar.map(rowOf))})`, v: model.jami ?? '' },
      { f: sumRefs('J', model.ildizlar.map(rowOf)), v: nomalum },
      koYig(model.ildizlar), null,
    ]);
  }
  // Nakrutka podvali (остаток к оплате) — ВСЕГО dan keyin.
  let kOplataVsego: number | null = null;
  if (model.ildizlar.length) {
    v.bosh();
    const ks = Object.fromEntries(NAKRUTKA_KATLAR.map((k) => [k, 0])) as KatSummalar;
    for (const q of model.qatorlar) { const kat = q.tur === 'barg' ? nakrutkaKat(q.kat) : null; if (kat && q.summa != null) ks[kat] += q.summa; }
    const p = nakrutkaPodvaliYoz(v, { podval, katUstun: 'L', oraliq: [bosh, bosh + model.qatorlar.length - 1], pulUstunlar: ['I'], foizUstun: 'H', nk, katSummalar: { I: ks } });
    if (p.kfQator.ЧЕЛ !== kfQ.ЧЕЛ) throw new Error('OSTATKA_PODVAL_SILJIDI');
    kOplataVsego = model.jami == null ? null : p.kaskad.I.vsego;
  }
  if (model.chiqarilgan.length) {
    // «ИСКЛЮЧЕНО ИЗ ОСТАТКА» — ВСЕГО dan KEYIN, unga kirmaydi. Графа 5 — объем по
    // смете до изменения, графа 7 — исключенный объем (по утвержденному изменению).
    v.bosh();
    v.bolim('ИСКЛЮЧЕНО ИЗ ОСТАТКА (работы не выполняются / аннулированы по утвержденным изменениям; графа 5 — объем по смете до изменения, графа 7 — исключенный объем)', { daraja: 0 });
    const qatorlar: number[] = [];
    model.chiqarilgan.forEach((c, i) => {
      qatorlar.push(v.qator('oddiy', (n) => [
        `И-${i + 1}`, c.kod, c.nom, c.birlik, qiy(c.eskiHajm), qiy(c.faktHajm),
        qiy(c.chiqarilgan), qiy(c.narx),
        c.bl ? qiy(c.summa) : { f: `IF(OR(G${n}="",H${n}=""),"",ROUND(G${n}*H${n},2))`, v: c.summa ?? '' },
        { f: `IF(I${n}="",1,0)`, v: c.summa == null ? 1 : 0 },
      ], { daraja: 1 }));
    });
    const nomalumCh = model.chiqarilgan.filter((c) => c.summa == null).length;
    v.qator('jami', (n) => [
      null, null, 'ИТОГО ИСКЛЮЧЕНО ИЗ ОСТАТКА (в остаток не включено)', null, null, null, null, null,
      { f: `IF(J${n}>0,"",${sumRefs('I', qatorlar)})`, v: model.chiqarilganJami ?? '' },
      { f: sumRefs('J', qatorlar), v: nomalumCh },
    ], { daraja: 0 });
  }
  v.bosh();
  v.izoh('Графа 9 — стоимость остатка по сметным ценам (прямые затраты), без накладных расходов и НДС; графа 10 — стоимость остатка к оплате: прямые затраты × коэффициент по виду затрат (раздел «Расчет стоимости к оплате»). Позиции с неизвестным количеством, выполнением или ценой оставлены без суммы; итоги по ним не подводятся до уточнения.');
  if (katsiz.length) v.diqqat(katsiz.map((nom) => ({ nom, sabab: 'не указан вид затрат — стоимость к оплате не определена' })), 'ВИД ЗАТРАТ НЕ УКАЗАН');
  if (!o.nakrutka || !Object.keys(o.nakrutka).length) v.izoh('Проценты накладных и прочих расходов для объекта не заданы — в расчете стоимости к оплате приняты 0 % (учтен только НДС).');
  if (model.jami == null && model.ildizlar.length) v.izoh('Итог не определен: есть позиции без суммы — см. перечень ниже.');
  v.diqqat(model.diqqat);
  if (model.oshibKetgan.length) {
    v.diqqat(model.oshibKetgan.map((x) => ({
      nom: `${x.nom}${x.birlik ? `, ${x.birlik}` : ''}`,
      joy: x.yol || undefined,
      sabab: `выполнено ${fmt(x.faktHajm)} при объеме по смете ${fmt(x.smetaHajm)} (превышение ${fmt(x.faktHajm - x.smetaHajm)}); в остаток не включено`,
    })), 'ВЫПОЛНЕНО СВЕРХ СМЕТНОГО ОБЪЕМА');
  }
  if (model.chiqarilgan.length) {
    v.diqqat(model.chiqarilgan.map((c, i) => ({
      nom: `поз. И-${i + 1} ${c.nom}${c.birlik ? `, ${c.birlik}` : ''}`,
      joy: c.yol || undefined,
      sabab: `${c.asos}${c.sabab ? `; причина: ${c.sabab}` : ''}`,
    })), 'ОСНОВАНИЯ ИСКЛЮЧЕНИЯ ИЗ ОСТАТКА');
  }
  v.imzo(imzoTomonlari(['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'СОСТАВИЛ'], o.imzo));
  const { bytes } = rasmiyKitob([v], { tur: 'ostatka' });
  const kv = model.ildizlar.map(koOf);
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNomi, hujjat: 'ОСТАТОК_РАБОТ', davr: sana }), kOplata: kv.length && !kv.some((x) => x == null) ? yaxlit2(kv.reduce<number>((a2, b2) => a2 + (b2 ?? 0), 0)) : null, kOplataVsego };
}

function fmt(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}
