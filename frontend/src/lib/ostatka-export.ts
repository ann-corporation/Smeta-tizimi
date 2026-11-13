import type { T2Qator, T2QatorHolat } from '../api/supabase';
import {
  RasmiyVaraq, bugunSana, sumRefs, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, yaxlit2,
  type ImzoNomlar, type Qiymat, type RasmiyUstun,
} from './hujjat-yozuvchi';
import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import { NAKRUTKA_KATLAR, NOMALUM_KAT, kOplate, kategoriyaKf, nakrutkaKat, nakrutkaPodvaliYoz, podvalKfQatorlari, podvalNdsFoiz, podvalQatorRaqami, type KatSummalar } from './nakrutka-podval';
import { YAXLIT_IZOH, YAXLIT_KAT, bolimBarglari, bolimJamilari, bolimQqsBilan, svodQoldigi, type SvodYaxlit } from './svod-yaxlit';
import { NDS_SUKUT_FOIZ, ayirma2, faktSummaF2Narxda, qatorSumma, serverMerosKoefQoy, yaxlit2 as yadroYaxlit2, yaxlitKOplate, yaxlitKOplateTaqsim, yaxlitQatorlarga, yigindi2, yigindi2Qatiy, type Podval } from './hisob-yadro';
import { mashinistMehnati, narxBildirishnomaKerak, narxsizSoni } from './narx-bildirishnoma';
import { bargUslubi } from './qator-uslubi';

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

/** «Fakt smetadan oshib ketdi» — REJA ishorasiga nisbatan (2026-10-20). Musbat reja: qoldiq < 0. Manfiy reja (chegirma,
 *  qaytariladigan material): qoldiq > 0 (fakt rejadan «manfiyroq»). Fakt yo'q manfiy qator oshib ketish EMAS — u qoldiqda
 *  manfiy bo'lib qoladi va jamini kamaytiradi (aks holda Amfiteatrda ostatka smetadan 510,7 mln ga oshib ko'rinardi). */
export const oshibKetdimi = (smeta: number, qoldiq: number): boolean => (smeta >= 0 ? qoldiq < 0 : qoldiq > 0);

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
    if (oshibKetdimi(q.hajm ?? 0, o)) { if (bargmi) oshibKetgan++; continue; }
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
  /** Obyekt nakrutka foizlari — остаток к оплате = прямые × Kf. Berilmasa — к оплате noma'lum (0 % emas). */
  nakrutka?: Partial<NakrutkaKoeffitsientlar> | null;
  /** Maxsus nakrutka podvali (konstruktor) — null: standart kaskad. */
  podval?: Podval | null;
  /** Server `nk_manba` — meros foizlari izohi (yadro `serverMerosKoefQoy`). */
  nkManba?: string | null;
  /** НДС stavkasi (sukut: nakrutkadagi НДС, u ham bo'lmasa 12 %). */
  ndsFoiz?: number | null;
  /** Svod yaxlit bo'limlari va avlodlari (`yaxlitQatorIdlari`): ularga ustama qo'llanmaydi, podvalda alohida qator. */
  yaxlitIdlar?: ReadonlySet<number> | null;
};

/** Hujjat modeli qatori — UI va Excel bir xil sonni shu modeldan oladi. */
export type OstatkaModelQator = {
  id: number;
  tur: 'rz' | 'bl' | 'barg' | 'itogo';
  /** Resurs turi (RS/MAT/OB) - hujjatda qator uslubi uchun (rs: kursiv, mat/ob: qalin). */
  resTur?: 'rs' | 'mat' | 'ob';
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
  /** Tasdiqlangan F2 bor qator: summa = smeta − fakt (F2 narxida) qiymat sifatida yoziladi (F × G formulasi emas). */
  f2Narxda?: boolean;
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
  /** Svod bo'limlari, fakti smetadan (yaxlit summa) oshgan: manfiy qoldiq yo'qolmasin — «ПРЕВЫШЕНИЕ» ro'yxati (QQS siz). */
  svodOshgan: Array<{ nom: string; qatorId: number; smeta: number; fakt: number; oshgan: number }>;
  diqqat: Array<{ nom: string; sabab: string; joy?: string }>;
  barglar: number;
  /** Tasdiqlangan istisnolar — «ИСКЛЮЧЕНО ИЗ ОСТАТКА», ВСЕГО ga kirmaydi. */
  chiqarilgan: OstatkaIstisnoQator[];
  /** Chiqarilganlar jami summasi (noma'lum bo'lsa null). */
  chiqarilganJami: number | null;
  /** Svod yaxlit bo'limi bo'yicha taqsimlangan qatorlar (t2_qator.id) — hujjatda summa qiymat sifatida (formula emas). */
  yaxlitTaqsimlangan?: ReadonlyMap<number, number>;
  /** Svod bo'limlari (qator_id → yaxlit QQS siz, svod summasi QQS bilan, to'liq bo'lim smetasi va fakti). */
  yaxlitBolimlar?: ReadonlyMap<number, { qqssiz: number; svodSumma: number | null; smeta: number; fakt: number }>;
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
export function ostatkaHujjatModeli(qatorlar: readonly T2Qator[], holatlar: readonly T2QatorHolat[], istisnolar: readonly OstatkaIstisno[] = [], svod: SvodYaxlit | null = null): OstatkaModel {
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
  const svodOshgan: OstatkaModel['svodOshgan'] = [];
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
      if (o != null && smeta != null && oshibKetdimi(smeta, o)) { oshib.push({ nom: q.nom ?? '', birlik: q.birlik ?? '', smetaHajm: smeta!, faktHajm: fakt!, yol: yolOf(q) }); return null; }
      if (o === 0) return null;
      const narx = q.narx ?? null;
      // Qoldiq puli: tasdiqlangan F2 bor qatorda = smeta summasi − fakt summasi (F2 narxida, yadro `faktSummaF2Narxda`), MAX yo'q.
      const h = holat.get(q.id);
      const f2Bor = h != null && h.f2_hajm != null && Number(h.f2_hajm) !== 0;
      const summa = f2Bor
        ? ayirma2(qatorSumma(smeta, narx), faktSummaF2Narxda(fakt, Number(h!.f2_hajm), h!.f2_summa == null ? null : Number(h!.f2_summa), qatorSumma(fakt, narx)).summa)
        : qatorSumma(o, narx);
      const sabablar = [smeta == null ? 'нет количества по смете' : '', fakt == null ? 'нет данных о выполнении' : '', narxBildirishnomaKerak(q, narx) ? 'нет сметной цены — строка не включена в сумму' : ''].filter(Boolean);
      if (sabablar.length) diqqat.push({ nom: `${q.nom ?? ''}${q.birlik ? `, ${q.birlik}` : ''}`, sabab: sabablar.join('; '), joy: yolOf(q) || undefined });
      const kutilmoqda = istisnoOf.get(q.id);
      if (kutilmoqda?.holat === 'qoralama') diqqat.push({ nom: `${q.nom ?? ''}${q.birlik ? `, ${q.birlik}` : ''}`, sabab: `исключение из остатка на согласовании (${kutilmoqda.asos}${kutilmoqda.sabab ? `; ${kutilmoqda.sabab}` : ''}) — до утверждения учитывается в остатке`, joy: yolOf(q) || undefined });
      barglar++;
      const tartib = blNo ? `${blNo}.${k}` : String(++no);
      out.push({ id: q.id, tur: 'barg', daraja, tartib, kod: q.kod ?? '', nom: q.nom ?? '', birlik: q.birlik ?? '', smetaHajm: smeta, faktHajm: fakt, ostatkaHajm: o, narx, summa, nomalum: summa == null && !mashinistMehnati(q) ? 1 : 0, kat: q.kat ?? null, bolalar: [], ...(q.tur === 'rs' || q.tur === 'mat' || q.tur === 'ob' ? { resTur: q.tur } : {}), ...(f2Bor ? { f2Narxda: true } : {}) });
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
      row.summa = yigindi2(b.map((i) => out[i].summa));   // egasi qoidasi: summa har doim ko'rinadi
      row.narx = row.summa != null && row.ostatkaHajm ? yadroYaxlit2(row.summa / row.ostatkaHajm) : null;
      return idx;
    }
    // rz (yoki noma'lum tur) — bo'lim; bolalari bo'lmasa kirmaydi.
    const idx = out.length;
    out.push({ id: q.id, tur: 'rz', daraja, tartib: '', kod: '', nom: q.nom ?? '', birlik: '', smetaHajm: null, faktHajm: null, ostatkaHajm: null, narx: null, summa: null, nomalum: 0, bolalar: [] });
    const b: number[] = [];
    for (const c of kids) { const i = qayta(c, daraja + 1, null, 0); if (i != null) b.push(i); }
    if (!b.length) { out.length = idx; return null; }
    const nomalum = b.reduce((s, i) => s + out[i].nomalum, 0);
    const summa = yigindi2(b.map((i) => out[i].summa));
    out.push({ id: q.id, tur: 'itogo', daraja, tartib: '', kod: '', nom: `ИТОГО ПО РАЗДЕЛУ: ${q.nom ?? ''}`, birlik: '', smetaHajm: null, faktHajm: null, ostatkaHajm: null, narx: null, summa, nomalum, bolalar: b });
    out[idx].nomalum = nomalum;
    out[idx].summa = summa;
    return out.length - 1; // ota uchun — ИТОГО qatori
  };

  const ildizlar: number[] = [];
  for (const q of bolalar.get(null) ?? []) { const i = qayta(q, 0, null, 0); if (i != null) ildizlar.push(i); }
  // Svod yaxlit bo'limlari (egasi): bo'lim qoldig'i = smeta (yaxlit) − fakt; fakt TAQSIMLANMAYDI — F-2 bilan bir usul (qator hajm × narx,
  // F-2 bor qatorda F-2 narxida; yagona qoida `svodFaktKesimi`/`svodQoldigi`). Qoldiq qoldiq qatorlariga tiyingacha taqsimlanadi
  // (Σ = bo'lim qoldig'i aynan), so'ng yuqori jamilar qayta yig'iladi.
  const yaxlitTaqsimlangan = new Map<number, number>();
  let yaxlitBolimlar: OstatkaModel['yaxlitBolimlar'] = undefined;
  if (svod?.bolimlar?.length) {
    const bj = bolimJamilari(rows, (id) => { const h = holat.get(id); return h ? Number(h.fakt_hajm ?? 0) : null; }, svod, (id, narx) => {
      const h = holat.get(id);
      if (!h) return null;
      const fakt = Number(h.fakt_hajm ?? 0);
      // F-2 bor qatorda fakt summasi F-2 narxida (yadro `faktSummaF2Narxda`), aks holda hajm × narx.
      return faktSummaF2Narxda(fakt, h.f2_hajm == null ? null : Number(h.f2_hajm), h.f2_summa == null ? null : Number(h.f2_summa), qatorSumma(fakt, narx)).summa;
    });
    yaxlitBolimlar = bj;
    for (const [qatorId, b] of bj) {
      const leaves = bolimBarglari(out, qatorId);
      const qoldiqJami = svodQoldigi(b.qqssiz, b.fakt);
      if (qoldiqJami != null && qoldiqJami < -0.005) svodOshgan.push({ nom: byId.get(qatorId)?.nom ?? `строка ${qatorId}`, qatorId, smeta: b.qqssiz, fakt: b.fakt, oshgan: yadroYaxlit2(-qoldiqJami) });
      if (!leaves?.length || qoldiqJami == null) continue;
      const t = yaxlitQatorlarga(qoldiqJami, leaves.map((i) => ({ id: i, summa: out[i].summa })));
      // Noma'lum (null) qatorlar taqsimga kirmaydi, null qoladi; bo'lim fakti noma'lum qatorlarsiz — diqqatga.
      const bilinmas = leaves.filter((i) => out[i].summa == null).length + b.faktNomalum;
      if (bilinmas) diqqat.push({ nom: `Раздел по своду (строка ${qatorId})`, sabab: `нет данных о выполнении или цене по ${bilinmas} поз. — в распределение суммы свода не включены` });
      if (!t) continue;
      for (const [i, v] of t) { out[i].summa = v; yaxlitTaqsimlangan.set(out[i].id, qatorId); }
    }
    const qayt = (i: number): number | null => {
      const r = out[i];
      if (r.tur === 'barg' || !r.bolalar.length) return r.summa;
      r.summa = yigindi2(r.bolalar.map(qayt));
      if (r.tur === 'bl') r.narx = r.summa != null && r.ostatkaHajm ? yadroYaxlit2(r.summa / r.ostatkaHajm) : null;
      return r.summa;
    };
    out.forEach((r, i) => { if (r.tur === 'itogo') { qayt(i); const rz = out.find((x) => x.tur === 'rz' && x.id === r.id); if (rz) rz.summa = r.summa; } else if (r.tur === 'bl') qayt(i); });
  }
  const nomalum = ildizlar.reduce((s, i) => s + out[i].nomalum, 0);
  const jami = !ildizlar.length ? null : yigindi2(ildizlar.map((i) => out[i].summa));
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
    let summa = qatorSumma(ch, narx);
    const kids = bolalar.get(q.id) ?? [];
    if (q.tur === 'bl' && kids.length) {
      // Ish (bl) hajmi kamaysa, normali resurslar norma bo'yicha kamayadi
      // (t2_qator_tahrir norma kaskadi): chiqarilgan summa = Σ norma × Δ × narx.
      // Normasiz resurslar o'zgarishda alohida qator bo'lib keladi.
      const normali = kids.filter((k) => OST_BARG.has(k.tur ?? '') && k.norma != null);
      // Har resurs summasi yadroda: ROUND(norma × Δ × narx, 2); jami — qat'iy (narxsiz resurs — noma'lum).
      summa = ch == null || !normali.length ? null : yigindi2Qatiy(normali.map((k) => qatorSumma(Number(k.norma) * ch, k.narx)));
      narx = summa != null && ch ? yadroYaxlit2(summa / ch) : null;
    }
    chiqarilgan.push({
      id: q.id, kod: q.kod ?? '', nom: q.nom ?? '', birlik: q.birlik ?? '', yol: yolOf(q), bl: q.tur === 'bl',
      eskiHajm: x.eskiHajm, faktHajm: fakt, chiqarilgan: ch, narx, summa, asos: x.asos, sabab: x.sabab,
    });
  }
  const rowIdx = new Map(rows.map((q, i) => [q.id, i]));
  chiqarilgan.sort((a, b) => (rowIdx.get(a.id) ?? 0) - (rowIdx.get(b.id) ?? 0));
  const chiqarilganJami = yigindi2Qatiy(chiqarilgan.map((c) => c.summa));
  return { qatorlar: out, jami, ildizlar, oshibKetgan: oshib, svodOshgan, diqqat, barglar, chiqarilgan, chiqarilganJami, yaxlitTaqsimlangan, yaxlitBolimlar };
}

const OSTATKA_USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 7, tur: 'tartib' },
  { sarlavha: 'Шифр, код', kenglik: 15, tur: 'kod' },
  { sarlavha: 'Наименование работ и затрат', kenglik: 52, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 9, tur: 'birlik' },
  { sarlavha: 'по смете', kenglik: 13, tur: 'hajm', guruh: 'КОЛИЧЕСТВО' },
  { sarlavha: 'выполнено', kenglik: 13, tur: 'hajm', guruh: 'КОЛИЧЕСТВО' },
  { sarlavha: 'остаток', kenglik: 13, tur: 'hajm', guruh: 'КОЛИЧЕСТВО' },
  { sarlavha: 'цена за ед., сум', kenglik: 16, tur: 'narx', guruh: 'СТОИМОСТЬ ОСТАТКА' },
  { sarlavha: 'сумма, сум', kenglik: 19, tur: 'pul', guruh: 'СТОИМОСТЬ ОСТАТКА' },
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
  nk.НДС = o.ndsFoiz ?? nk.НДС ?? NDS_SUKUT_FOIZ;
  // Foizlar faqat podvaldan (server meros rejimi); noma'lum — к оплате bo'sh, 0 emas.
  const podval = o.podval ? serverMerosKoefQoy(o.podval, nk, o.nkManba) : null;
  const kfJS = kategoriyaKf(nk, podval);
  const ndsFoiz = podvalNdsFoiz(podval, nk);
  const taqsim = model.yaxlitTaqsimlangan;
  const yax = (q: OstatkaModelQator) => q.tur === 'barg' && (!!o.yaxlitIdlar?.has(q.id) || !!taqsim?.has(q.id));
  const yaxlitBor = model.qatorlar.some(yax);
  // Kategoriyasi ko'rsatilmagan barglar: ustamasiz, faqat QQS; podvalda alohida qator (summa yashirilmaydi).
  const katsizmi = (q: OstatkaModelQator) => q.tur === 'barg' && !yax(q) && !nakrutkaKat(q.kat) && q.summa != null;
  const nomalumI = yaxlit2(model.qatorlar.filter(katsizmi).reduce((t, q) => t + (q.summa ?? 0), 0));
  const nomalumBor = Math.abs(nomalumI) >= 0.005;
  const kfQ = podvalKfQatorlari(bosh + model.qatorlar.length + 2, podval, yaxlitBor, nomalumBor);
  const ndsQ = podvalQatorRaqami(bosh + model.qatorlar.length + 2, podval, 'nds', yaxlitBor, nomalumBor);
  const ndsKf = ndsQ != null && ndsFoiz != null ? `(1+H${ndsQ}/100)` : null;
  // Taqsimlangan svod qatorlari к оплате: bo'lim bo'yicha ×(1+QQS), Σ = bo'lim × (1+QQS) aynan.
  const koTaqsim = new Map<number, number>();
  if (taqsim?.size) {
    const guruh = new Map<number, Map<number, number>>();
    model.qatorlar.forEach((q, i) => { const b = taqsim.get(q.id); if (b != null && q.tur === 'barg' && q.summa != null) { if (!guruh.has(b)) guruh.set(b, new Map()); guruh.get(b)!.set(i, q.summa); } });
    for (const [bid, g] of guruh) {
      // Bo'lim qoldig'i QQS BILAN = svod − fakt × (1+QQS) (svod summasi yakuniy, egasi 2026-10-30; fakt taqsimlanmaydi) — qatorlarga taqsim.
      const b = model.yaxlitBolimlar?.get(bid);
      const qb = b ? bolimQqsBilan({ svod_summa: b.svodSumma, qqssiz: b.qqssiz }, ndsFoiz) : null;
      const fq = qb == null || !b ? null : yaxlitKOplate(b.fakt, ndsFoiz);
      const t = fq == null ? yaxlitKOplateTaqsim(g, ndsFoiz) : yaxlitQatorlarga(yadroYaxlit2((qb as number) - fq), [...g].map(([id, summa]) => ({ id, summa })));
      for (const [i, v] of t ?? []) koTaqsim.set(i, v);
    }
  }
  const koMemo = new Map<number, number | null>();
  const koOf = (i: number): number | null => {
    if (koMemo.has(i)) return koMemo.get(i)!;
    const q = model.qatorlar[i];
    let val: number | null;
    if (q.tur === 'barg') val = koTaqsim.has(i) ? koTaqsim.get(i)! : kOplate(q.summa, nakrutkaKat(q.kat), kfJS, yax(q), ndsFoiz);
    else if (q.tur === 'rz') val = null;
    else { const vs = q.bolalar.map(koOf); val = !vs.length || vs.some((x) => x == null) ? null : yaxlit2(vs.reduce<number>((a2, b2) => a2 + (b2 ?? 0), 0)); }
    koMemo.set(i, val);
    return val;
  };
  const koYig = (idx: readonly number[]): Qiymat => {
    if (!idx.length) return null;
    const rows = idx.map(rowOf);
    const vs = idx.map(koOf);
    return { f: sumRefs('K', rows), v: yaxlit2(vs.reduce<number>((a2, b2) => a2 + (b2 ?? 0), 0)) };
  };
  const katsiz: string[] = [];
  model.qatorlar.forEach((q, i) => {
    const kid = (col: string) => sumRefs(col, q.bolalar.map(rowOf));
    let r = 0;
    if (q.tur === 'rz') r = v.bolim(q.nom, { daraja: q.daraja });
    else if (q.tur === 'barg') {
      const us = bargUslubi(q.resTur);
      r = v.qator(us.tur, (n) => [
        q.tartib, q.kod, q.nom, q.birlik, qiy(q.smetaHajm), qiy(q.faktHajm),
        { f: `IF(OR(E${n}="",F${n}=""),"",E${n}-F${n})`, v: q.ostatkaHajm ?? '' },
        qiy(q.narx),
        // Svod bo'limiga taqsimlangan qator — summa qiymat (bo'lim yaxlit summasidan taqsim), formula emas.
        taqsim?.has(q.id) || q.f2Narxda ? qiy(q.summa) : { f: `IF(OR(G${n}="",H${n}=""),"",ROUND(G${n}*H${n},2))`, v: q.summa ?? '' },
        mashinistMehnati(q) ? 0 : { f: `IF(I${n}="",1,0)`, v: q.nomalum },
        ...((): Qiymat[] => {
          // Svod yaxlit bo'limi: ustama yo'q, faqat QQS (к оплате = прямые × (1+НДС)).
          if (koTaqsim.has(i)) return [koTaqsim.get(i)!, YAXLIT_KAT];
          if (yax(q)) return ndsKf == null ? [null, YAXLIT_KAT] : [{ f: `IF(I${n}="","",ROUND(I${n}*${ndsKf},2))`, v: koOf(i) ?? '' }, YAXLIT_KAT];
          const kat = nakrutkaKat(q.kat);
          if (!kat) {
            katsiz.push(`${q.nom}${q.birlik ? `, ${q.birlik}` : ''}`);
            // Vid zatrat ko'rsatilmagan: ustamasiz, faqat QQS (server kabi); podvalda «ВИД ЗАТРАТ НЕ УКАЗАН» qatori.
            return ndsKf == null ? [null, NOMALUM_KAT] : [{ f: `IF(I${n}="","",ROUND(I${n}*${ndsKf},2))`, v: koOf(i) ?? '' }, NOMALUM_KAT];
          }
          if (kfJS[kat] == null) return [null, kat]; // Kf noma'lum — bo'sh, formula yo'q (0 deb olinmaydi)
          return [{ f: `IF(I${n}="","",ROUND(I${n}*H${kfQ[kat]},2))`, v: koOf(i) ?? '' }, kat];
        })(),
      ], { daraja: q.daraja, rang: us.rang });
    } else if (q.tur === 'bl') {
      r = v.qator('ish', (n) => [
        q.tartib, q.kod, q.nom, q.birlik, qiy(q.smetaHajm), qiy(q.faktHajm),
        { f: `IF(OR(E${n}="",F${n}=""),"",MAX(E${n}-F${n},0))`, v: q.ostatkaHajm ?? '' },
        { f: `IF(OR(I${n}="",N(G${n})=0),"",I${n}/G${n})`, v: q.narx ?? '' },
        { f: kid('I'), v: q.summa ?? '' },
        { f: kid('J'), v: q.nomalum },
        koYig(q.bolalar), null,
      ], { daraja: q.daraja });
    } else {
      r = v.qator('jami', (n) => [
        null, null, q.nom, null, null, null, null, null,
        { f: kid('I'), v: q.summa ?? '' },
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
      { f: sumRefs('I', model.ildizlar.map(rowOf)), v: model.jami ?? '' },
      { f: sumRefs('J', model.ildizlar.map(rowOf)), v: nomalum },
      koYig(model.ildizlar), null,
    ]);
  }
  // Nakrutka podvali (остаток к оплате) — ВСЕГО dan keyin.
  let kOplataVsego: number | null = null;
  if (model.ildizlar.length) {
    v.bosh();
    const ks = Object.fromEntries(NAKRUTKA_KATLAR.map((k) => [k, 0])) as KatSummalar;
    for (const q of model.qatorlar) { const kat = q.tur === 'barg' && !yax(q) ? nakrutkaKat(q.kat) : null; if (kat && q.summa != null) ks[kat] += q.summa; }
    // Svod yaxlit podval qatori — QQS BILAN (НДС dan keyin, aynan): yaxlit qatorlar «к оплате» (K) yig'indisi.
    const yk = model.qatorlar.map((q, i) => (yax(q) ? koOf(i) : undefined)).filter((x) => x !== undefined) as Array<number | null>;
    const ykJami = yaxlitBor ? yigindi2Qatiy(yk) : null;
    const yaxlit = ykJami != null ? { I: ykJami } : null;
    const [a1, b1] = [bosh, bosh + model.qatorlar.length - 1];
    const nomalum = nomalumBor ? { I: nomalumI } : null;
    const nomalumF = nomalumBor ? { I: `SUMIF(L${a1}:L${b1},"${NOMALUM_KAT}",I${a1}:I${b1})` } : null;
    const p = nakrutkaPodvaliYoz(v, { podval, katUstun: 'L', oraliq: [a1, b1], pulUstunlar: ['I'], foizUstun: 'H', nk, katSummalar: { I: ks }, yaxlit, yaxlitF: yaxlit ? { I: `SUMIF(L${a1}:L${b1},"${YAXLIT_KAT}",K${a1}:K${b1})` } : null, nomalum, nomalumF });
    if (p.kfQator.ЧЕЛ !== kfQ.ЧЕЛ) throw new Error('OSTATKA_PODVAL_SILJIDI');
    kOplataVsego = model.jami == null ? null : p.natija.I.vsego;
    // Egasi qoidasi (2026-11-06): narxsiz barglar — jamilar yonida «итог неполный» (summa katagi formulali — bo'sh qoladi, ro'yxat diqqat da).
    v.narxsizOgoh(narxsizSoni(model.qatorlar.filter((q) => q.tur === 'barg'), (q) => q.narx ?? q.summa));
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
      { f: sumRefs('I', qatorlar), v: model.chiqarilganJami ?? '' },
      { f: sumRefs('J', qatorlar), v: nomalumCh },
    ], { daraja: 0 });
  }
  v.bosh();
  v.izoh('Графа 9 — стоимость остатка по сметным ценам (прямые затраты), без накладных расходов и НДС; графа 10 — стоимость остатка к оплате: прямые затраты × коэффициент по виду затрат (раздел «Расчет стоимости к оплате»). Позиции с неизвестным количеством, выполнением или ценой оставлены без суммы; итоги по ним не подводятся до уточнения.');
  if (yaxlitBor) v.izoh(YAXLIT_IZOH);
  if (katsiz.length) v.diqqat(katsiz.map((nom) => ({ nom, sabab: 'не указан вид затрат — к оплате без накрутки (только НДС), в расчете отдельной строкой' })), 'ВИД ЗАТРАТ НЕ УКАЗАН');
  if (Object.values(kfJS).some((x) => x == null)) v.izoh('Проценты накладных и прочих расходов для объекта не заданы — стоимость к оплате не определена (проценты не принимаются равными 0).');
  v.diqqat(model.diqqat);
  if (model.oshibKetgan.length) {
    v.diqqat(model.oshibKetgan.map((x) => ({
      nom: `${x.nom}${x.birlik ? `, ${x.birlik}` : ''}`,
      joy: x.yol || undefined,
      sabab: `выполнено ${fmt(x.faktHajm)} при объеме по смете ${fmt(x.smetaHajm)} (превышение ${fmt(x.faktHajm - x.smetaHajm)}); в остаток не включено`,
    })), 'ВЫПОЛНЕНО СВЕРХ СМЕТНОГО ОБЪЕМА');
  }
  if (model.svodOshgan.length) {
    v.diqqat(model.svodOshgan.map((x) => ({
      nom: `Раздел по своду: ${x.nom}`,
      sabab: `ПРЕВЫШЕНИЕ: выполнено ${fmt(x.fakt)} при сумме свода ${fmt(x.smeta)} (без НДС), превышение ${fmt(x.oshgan)}; остаток по разделу отрицательный, в строки не распределён`,
    })), 'ПРЕВЫШЕНИЕ');
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
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNomi, hujjat: 'ОСТАТОК_РАБОТ', davr: sana }), kOplata: kv.length && !kv.some((x) => x == null) ? yadroYaxlit2(kv.reduce<number>((a2, b2) => a2 + (b2 ?? 0), 0)) : null, kOplataVsego };
}

function fmt(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}
