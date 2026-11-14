import { nomIzohBilan } from './smeta-model';
/**
 * НАКОПИТЕЛЬНАЯ ВЕДОМОСТЬ ВЫПОЛНЕННЫХ РАБОТ — rasmiy hujjat (P3, H1–H9).
 *
 * Manba: `t2_nakopitelniy_v1` qatorlari (kanonik, tasdiqlangan F2 lar davr
 * kesimida). Bu yerda yangi biznes hisobi yo'q — hujjat qatorlari RPC
 * qiymatlari; hosila ustunlar (с начала строительства, остаток, можно
 * предъявить) Excelning o'zida RPC bilan AYNAN bir xil formula bilan:
 *   с начала = ранее + за период;   остаток = по смете − с начала;
 *   можно предъявить = факт − с начала.
 *
 * Qoidalar:
 *  - pul faqat barglarda (rs/mat/ob) yig'iladi — ish (bl) va bo'lim (rz)
 *    qatorlarining o'z `summa` si bolalarini takrorlaydi, ikki marta sanalmaydi;
 *  - smeta hajmi/summasi noma'lum (NULL) — остаток ham bo'sh (0 emas);
 *  - RPC ro'yxati qirqilgan bo'lsa (`truncated`) hujjat yasalmaydi — chala
 *    hujjat rasmiy hujjat bo'la olmaydi;
 *  - НДС (egasi qarori Q2, 2026-09-25): F2 resurs qatorlari НДС siz; НДС
 *    hujjat OXIRIDA bir marta — ВСЕГО ostida «НДС n %» va «ВСЕГО С НДС»
 *    (принято ранее / за период / с начала). Stavka sukuti 12 %, UI da
 *    o'zgartiriladi; `ndsFoiz` berilmasa НДС qatorlari chiqmaydi;
 *  - smeta nakrutka kaskadi (t2_obyekt_nakrutka) izohda ma'lumot sifatida;
 *  - Forma-3 yuridik jami qoidasi hal qilinmagan (FORMA3_RULE_UNRESOLVED) —
 *    hujjatga KS-3 jami chiqarilmaydi (ops/handoff/PTO_EGASI_QARORLARI_2026-09-25.md).
 */
import type { NakopitelniyQator, SmetaNakrutka } from '../api/t2-nakopitelniy';
import {
  RasmiyVaraq, bugunSana, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, sumFormula, ustunHarfi, yaxlit2,
  type ImzoNomlar, type Qiymat, type RasmiyUstun,
} from './hujjat-yozuvchi';
import { shartnomaSvodi, somga, svodJami, sverkaHisobla, tiyin, type SvodShartnoma } from './nakopitelniy-svod';
import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import type { F3DavrAkt } from './forma3-export';
import { diqqatGuruh, zamechaniyaVaraq } from './hujjat-yozuvchi/zamechaniya';
import {
  NAKRUTKA_KATLAR, NOMALUM_KAT, kategoriyaKf, nakrutkaKat, nakrutkaPodvaliYoz, podvalNdsFoiz, podvalQatorRaqami,
  type KatSummalar, type NakrutkaHisobJS,
} from './nakrutka-podval';
import { aktPodvaliPodval, f2YaxlitdanChiqadi, serverMerosKoefQoy, yaxlitKOplate, yaxlitQatorlarga, type AktPodvalNk, type Podval } from './hisob-yadro';
import { narxBildirishnomaKerak, narxsizSoni } from './narx-bildirishnoma';
import { bargUslubi } from './qator-uslubi';
import { bajarilmadiSababRu } from './bajarilmadi-export';
import { YAXLIT_IZOH, YAXLIT_KAT, YAXLIT_PODVAL_NOM, svodYaxlitQqs, yaxlitQatorIdlari, type SvodYaxlit } from './svod-yaxlit';
import { raqamTozala } from './raqam-belgi';

export interface NakopitelniyVedomostExportOptions {
  obyektNom: string;
  /** Hisobot davri: "2026-09-01" yoki "2026-09". */
  davr: string;
  imzo?: ImzoNomlar;
  /** RPC ro'yxati qirqilganmi (t2_nakopitelniy_v2.truncated). */
  truncated?: boolean;
  /** НДС stavkasi, % (sukut UI da 12) — nakrutka kaskadidagi НДС ni almashtiradi.
   *  null/undefined — kaskaddagi (obyekt/shartnoma) НДС foizi. */
  ndsFoiz?: number | null;
  /** Obyekt nakrutka foizlari (t2_obyekt_nakrutka_v1.koeffitsientlar). Berilmasa — foizlar noma'lum (podval bo'sh, 0 emas). */
  nakrutka?: Partial<NakrutkaKoeffitsientlar> | null;
  /** Server `nk_manba` — meros foizlari izohi (yadro `serverMerosKoefQoy`). */
  nkManba?: string | null;
  /** Maxsus nakrutka podvali (konstruktor) — null: standart kaskad. */
  podval?: Podval | null;
  /** Smeta nakrutka kaskadi (RPC jami.smeta_nakrutka) — izohda ko'rsatiladi. */
  smetaNakrutka?: SmetaNakrutka | null;
  /** Har F-2 alohida ustun (egasi 2026-11-14: `aktlar` berilsa — har akt o'z podvali bilan; yo'q — oy kesimi, bitta umumiy podval). */
  oylar?: NakopitelniyOylar | null;
  /** Svod yaxlit bo'limlari (t2_obyekt_nakrutka_v1.svod_yaxlit): avlod qatorlariga ustama qo'llanmaydi, podvalda alohida qator. */
  svodYaxlit?: SvodYaxlit | null;
  /** Hisobot oyigacha HAMMA tasdiqlangan F2 aktlari (har biri O'Z podvali bilan): eski rejimda «ИТОГО К ОПЛАТЕ ПО АКТАМ» qatori. */
  aktlarKOplate?: ReadonlyArray<F3DavrAkt> | null;
}

/** Bitta tasdiqlangan F-2 (ustun) haqida: o'z podvali va imzolangan ВСЕГО. */
export interface NakopitelniyAktMeta {
  /** Ustun kaliti (`NakopitelniyOylar.oylar` / `qiymat` bilan bir xil). */
  kalit: string;
  aktId: number;
  /** Akt oyi «YYYY-MM». */
  oy: string;
  raqam: string | null;
  /** Aktning o'z podvali (t2_akt_podval, blok ''). null — obyekt smeta podvali (yadro bahosidagi `smeta` birlik). */
  nk: AktPodvalNk | null;
  /** Imzolangan aktning ВСЕГО (yadro bahosi `f2AktBaho`, server `_t2_summa_paket_v1` bilan tiyinigacha). null — noma'lum. */
  qqsBilan: number | null;
  /** Aktning o'z podvalidagi IMZOLANGAN hujjat ВСЕГО (t2_akt_podval.hujjat_vsego): berilsa — nazorat qatori shu bilan solishtiradi (yadro bahosi o'rniga). */
  imzolangan?: number | null;
  /** Akt bir necha podval birligidan iborat (storno bloklari) — nazorat qatorida izohlanadi. */
  birlikSoni?: number;
}

/** Tasdiqlangan F2 qatorlari ustunlar bo'yicha: `oylar` — ustun kalitlari (oy 'YYYY-MM' yoki akt kaliti) o'sish tartibida. */
export interface NakopitelniyOylar {
  oylar: string[];
  /** summa: null — tasdiqlangan F2 da summa noma'lum (0 emas). */
  qiymat: ReadonlyMap<number, ReadonlyMap<string, { hajm: number; summa: number | null }>>;
  /** Har ustun — alohida F-2 (o'z podvali bilan). Berilmasa ustun = oy. */
  aktlar?: ReadonlyArray<NakopitelniyAktMeta>;
  /** Bekor qilingan F-2 lar: jamiga kirmaydi, faqat «Свод изменений» dagi ma'lumot ilovasida (raqam, oy, qaysi akt bilan almashtirilgan). */
  bekorAktlar?: ReadonlyArray<{ aktId: number; raqam: string | null; oy: string; almashtirgan?: { aktId: number; raqam: string | null } | null }>;
}

/** НДС stavkasi sukuti (egasi qarori Q2) — yadrodagi yagona manba. */
export { NDS_SUKUT_FOIZ } from './hisob-yadro';

export class HujjatToliqEmasXato extends Error {
  readonly sabab: string;
  constructor(sabab: string) { super(`HUJJAT_TOLIQ_EMAS: ${sabab}`); this.sabab = sabab; }
}

const OYLAR = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

/** "2026-09-01" → "сентябрь 2026 г." */
export function davrMatni(davr: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(davr || '');
  if (!m) return davr || '';
  return `${OYLAR[Number(m[2]) - 1] ?? m[2]} ${m[1]} г.`;
}

const BARG = new Set(['rs', 'mat', 'ob']);

/** Smetadagi o'zgarish belgisi (yashirin ustun «Изм.»): Свод изменений varag'i SUMIFS shu bo'yicha yig'adi. */
export const IZM_ASL = 'ASL';
export const IZM_ZAMENA = 'ZAM';
export const IZM_QOSHIMCHA = 'QOSH';
export const IZM_ISKLYUCHAEMAYA = 'ISKL';
export const izmBelgisi = (q: Pick<NakopitelniyQator, 'qator_id' | 'zamena' | 'qoshimcha'>): string =>
  q.qator_id < 0 ? IZM_ISKLYUCHAEMAYA : q.zamena ? IZM_ZAMENA : q.qoshimcha ? IZM_QOSHIMCHA : IZM_ASL;

/** «Bajarilmadi» (t2_qator_bajarilmadi, faol) belgilangan qator: hujjatdan yo'qolmaydi, belgi bilan o'z joyida. */
export const bajarilmadiMi = (q: Pick<NakopitelniyQator, 'bajarilmadi_hajm' | 'bajarilmadi_sabab'>): boolean => (q.bajarilmadi_hajm ?? 0) > 1e-12 || q.bajarilmadi_sabab != null;

/** Zamena almashtirgan asl qatorning «исключаемая часть» (minus) qatori kerakmi: qoplangan hajm va summa ma'lum va nolga teng emas. */
const minusKerak = (q: NakopitelniyQator): boolean =>
  q.qator_id > 0 && !q.zamena && (q.almashtirilgan_hajm ?? 0) > 1e-12 && q.almashtirilgan_summa != null && Math.abs(q.almashtirilgan_summa) >= 0.005;

/** Davr ustun guruhi: har tasdiqlangan F2 (yoki oy; yoki eski ko'rinishda "ранее / за период"). */
type DavrUstun = { sarlavha: string; hajm: (q: NakopitelniyQator) => number; summa: (q: NakopitelniyQator) => number | null; akt?: NakopitelniyAktMeta };

/** Ustunlar va ularning harflari — davrlar soniga qarab. Qatorlarda «К оплате» ustunlari YO'Q (egasi 2026-11-14): ustama faqat podvalda. */
function ustunRejasi(davrlar: readonly DavrUstun[]) {
  const u: RasmiyUstun[] = [
    { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
    { sarlavha: 'Шифр, код', kenglik: 13, tur: 'kod' },
    { sarlavha: 'Наименование работ и затрат', kenglik: 44, tur: 'matn' },
    { sarlavha: 'Ед. изм.', kenglik: 8, tur: 'birlik' },
    { sarlavha: 'кол-во', kenglik: 13, tur: 'hajm', guruh: 'ПО СМЕТЕ' },
    { sarlavha: 'цена, сум', kenglik: 16, tur: 'narx', guruh: 'ПО СМЕТЕ' },
    { sarlavha: 'сумма, сум', kenglik: 19, tur: 'pul', guruh: 'ПО СМЕТЕ' },
    { sarlavha: 'кол-во', kenglik: 13, tur: 'hajm', guruh: 'ВЫПОЛНЕНО (ФАКТ)' },
  ];
  const faktS = ustunHarfi(u.length); u.push({ sarlavha: 'сумма, сум', kenglik: 19, tur: 'pul', guruh: 'ВЫПОЛНЕНО (ФАКТ)' });
  const davrH: string[] = [], davrS: string[] = [];
  for (const d of davrlar) {
    davrH.push(ustunHarfi(u.length)); u.push({ sarlavha: 'кол-во', kenglik: 13, tur: 'hajm', guruh: d.sarlavha });
    davrS.push(ustunHarfi(u.length)); u.push({ sarlavha: 'сумма, сум', kenglik: 19, tur: 'pul', guruh: d.sarlavha });
  }
  const at = (s: RasmiyUstun) => { const h = ustunHarfi(u.length); u.push(s); return h; };
  const JAMI_GURUH = davrlar.length > 2 || !davrlar[0]?.sarlavha.startsWith('ПРИНЯТО') ? (davrlar.some((d) => d.akt) ? 'С НАЧАЛА СТРОИТЕЛЬСТВА (ИТОГО ЗА ВСЕ Ф-2)' : 'С НАЧАЛА СТРОИТЕЛЬСТВА (ИТОГО ЗА ВСЕ МЕСЯЦЫ)') : 'С НАЧАЛА СТРОИТЕЛЬСТВА';
  const jamiH = at({ sarlavha: 'кол-во', kenglik: 13, tur: 'hajm', guruh: JAMI_GURUH });
  const jamiS = at({ sarlavha: 'сумма, сум', kenglik: 19, tur: 'pul', guruh: JAMI_GURUH });
  const ostH = at({ sarlavha: 'кол-во', kenglik: 13, tur: 'hajm', guruh: 'ОСТАТОК ПО СМЕТЕ' });
  const ostS = at({ sarlavha: 'сумма, сум', kenglik: 19, tur: 'pul', guruh: 'ОСТАТОК ПО СМЕТЕ' });
  const mozhno = at({ sarlavha: 'Можно предъявить (факт − принято), кол-во', kenglik: 13, tur: 'hajm' });
  // Yashirin texnik ustunlar: kategoriya (podval SUMIF), barg belgisi (jamilar SUMIF(belgi,1,…)), o'zgarish belgisi (Свод изменений).
  const kat = at({ sarlavha: 'Кат.', kenglik: 6, tur: 'texnik', yashirin: true });
  const belgi = at({ sarlavha: 'Т', kenglik: 4, tur: 'texnik', yashirin: true });
  const izm = at({ sarlavha: 'Изм.', kenglik: 6, tur: 'texnik', yashirin: true });
  const nev = at({ sarlavha: 'Не вып.', kenglik: 6, tur: 'texnik', yashirin: true });
  const idx = (h: string) => u.findIndex((_, i) => ustunHarfi(i) === h);
  return { ustunlar: u, faktS, davrH, davrS, jamiH, jamiS, ostH, ostS, mozhno, kat, belgi, izm, nev, idx, pul: ['G', faktS, ...davrS, jamiS, ostS] };
}

/** Davr ustunlari: aktlar/oylar berilsa — har biri; berilmasa — "принято ранее" va "за отчетный период". */
function davrUstunlari(o: NakopitelniyVedomostExportOptions): DavrUstun[] {
  const m = o.oylar;
  if (m && m.oylar.length) {
    const meta = new Map((m.aktlar ?? []).map((a) => [a.kalit, a] as const));
    const oyD = o.davr.slice(0, 7);
    return m.oylar.map((oy, i) => {
      const akt = meta.get(oy);
      const sarlavha = akt
        ? `Ф-2${akt.raqam ? ` № ${akt.raqam}` : ''} — ${davrMatni(akt.oy).toUpperCase()}${akt.oy.slice(0, 7) === oyD ? ' — ОТЧЕТНЫЙ ПЕРИОД' : ''}`
        : `${davrMatni(oy).toUpperCase()}${i === m.oylar.length - 1 ? ' — ОТЧЕТНЫЙ ПЕРИОД' : ''}`;
      return {
        sarlavha, akt,
        hajm: (q: NakopitelniyQator) => m.qiymat.get(q.qator_id)?.get(oy)?.hajm ?? 0,
        /* Oyda (aktda) F2 yo'q — haqiqiy 0; F2 bor, summa noma'lum — null (bo'sh katak). */
        summa: (q: NakopitelniyQator) => { const v = m.qiymat.get(q.qator_id)?.get(oy); return v ? v.summa : 0; },
      };
    });
  }
  return [
    { sarlavha: 'ПРИНЯТО РАНЕЕ', hajm: (q) => q.oldingi_hajm, summa: (q) => q.oldingi_summa },
    { sarlavha: 'ЗА ОТЧЕТНЫЙ ПЕРИОД', hajm: (q) => q.joriy_hajm, summa: (q) => q.joriy_summa },
  ];
}

export type NakopitelniyJamilar = { smeta: number; oldingi: number; joriy: number; jami: number; qoldiq: number };

/** Hujjat jamilari — barglar bo'yicha (UI shu sonni ko'rsatadi, Excel ВСЕГО bilan teng). Zamena qoplagan asl qism — minus (smeta «после изменений»). */
export function nakopitelniyJamilar(qatorlar: readonly NakopitelniyQator[]): NakopitelniyJamilar {
  let smeta = 0, oldingi = 0, joriy = 0;
  // Resurssiz ish (daraxtda bolasi yo'q `bl`) ham o'z pulini olib yuradi — barg kabi sanaladi (hujjat qatorlari bilan bir xil qoida).
  const ota = new Set(qatorlar.map((q) => q.ota_id).filter((x): x is number => x != null));
  const daraxtBor = ota.size > 0;
  for (const q of qatorlar) {
    if (!BARG.has(q.tur) && !(q.tur === 'bl' && daraxtBor && !ota.has(q.qator_id))) continue;
    smeta += q.smeta_summa ?? 0;   // egasi qoidasi: narxsiz qator jamini bo'shatmaydi (bildirishnoma alohida)
    if (minusKerak(q)) smeta -= q.almashtirilgan_summa!;
    oldingi += q.oldingi_summa;
    joriy += q.joriy_summa;
  }
  const jami = oldingi + joriy;
  return { smeta, oldingi, joriy, jami, qoldiq: smeta - jami };
}

/** Накопительная ведомость (.xlsx). */
export async function nakopitelniyVedomostExportXlsx(
  qatorlar: readonly NakopitelniyQator[],
  options: NakopitelniyVedomostExportOptions,
): Promise<Uint8Array> {
  return nakopitelniyVedomostHujjat(qatorlar, options).bytes;
}

/** Podval bloki: qaysi pul ustunlari, qaysi foizlar bilan. */
type Blok = { sarlavha: string; cols: string[]; nk: Partial<NakrutkaKoeffitsientlar>; podval: Podval | null; akt?: NakopitelniyAktMeta; smetaTuri: boolean };

export function nakopitelniyVedomostHujjat(
  qatorlarXom: readonly NakopitelniyQator[],
  o: NakopitelniyVedomostExportOptions,
): { bytes: Uint8Array; faylNomi: string; jamilar: NakopitelniyJamilar; kaskad: Record<string, NakrutkaHisobJS | null> | null; kOplata: { davr: number | null; jami: number | null } } {
  if (o.truncated) throw new HujjatToliqEmasXato('ro‘yxat server chegarasida qirqilgan');
  const davrlar = davrUstunlari(o);
  const aktRejim = davrlar.some((d) => d.akt);
  const U = ustunRejasi(davrlar);
  const oyKesimi = Boolean(o.oylar?.oylar.length);
  const v = new RasmiyVaraq({
    nom: 'Накопительная ведомость',
    sarlavha: 'НАКОПИТЕЛЬНАЯ ВЕДОМОСТЬ ВЫПОЛНЕННЫХ РАБОТ',
    ostSarlavha: [`за отчетный период: ${davrMatni(o.davr)} (учтены только утвержденные акты формы № 2${oyKesimi ? (aktRejim ? '; принято — по каждому акту Ф-2 отдельно' : '; принято — по каждому месяцу отдельно') : ''})`],
    titul: [['Объект:', o.obyektNom], ['Заказчик:', o.imzo?.zakazchik], ['Подрядчик:', o.imzo?.pudratchi]],
    ustunlar: U.ustunlar,
    yonalish: 'landscape',
  });
  const bosh = v.malumotBoshi;

  /* Smeta o'zgarishlari: zamena almashtirgan asl qatori tagida, asl qismi minus qatori bilan (egasi 2026-11-14). */
  const idlar = new Set(qatorlarXom.map((q) => q.qator_id));
  const otaSet = new Set(qatorlarXom.map((q) => q.ota_id).filter((x): x is number => x != null));
  const canonicalTree = qatorlarXom.some((q) => q.ota_id != null || q.daraja != null);
  const bargQator = (q: NakopitelniyQator) => BARG.has(q.tur) || (q.tur === 'bl' && canonicalTree && !otaSet.has(q.qator_id));
  const minusQator = (q: NakopitelniyQator): NakopitelniyQator => ({
    ...q, qator_id: -q.qator_id, tur: q.tur === 'bl' ? 'mat' : q.tur, kod: null, zamena: false, qoshimcha: false, ozgarish_izoh: null, norma: null,
    smeta_hajm: -(q.almashtirilgan_hajm ?? 0), smeta_summa: -(q.almashtirilgan_summa ?? 0), fakt_hajm: 0, fakt_summa: 0,
    oldingi_hajm: 0, oldingi_summa: 0, joriy_hajm: 0, joriy_summa: 0, joriy_qoralama_summa: 0, jami_hajm: 0, jami_summa: 0, f2_mumkin_hajm: 0,
    qoldiq_hajm: 0, qoldiq_summa: 0, almashtirilgan_hajm: 0, almashtirilgan_summa: null, jami_baseline_summa: 0, jami_actual_summa: null, narx_variance_summa: 0, bajarilish_foiz: null,
  });
  const qatorlar: NakopitelniyQator[] = [];
  for (const q of qatorlarXom) { qatorlar.push(q); if (bargQator(q) && minusKerak(q)) qatorlar.push(minusQator(q)); }
  const asliBy = new Map(qatorlarXom.map((q) => [q.qator_id, q] as const));
  /** asl qator id → uni almashtirgan zamena qatorlari. */
  const zamenalari = new Map<number, NakopitelniyQator[]>();
  for (const q of qatorlarXom) if (q.zamena && q.almashtirgan_id != null && idlar.has(q.almashtirgan_id)) zamenalari.set(q.almashtirgan_id, [...(zamenalari.get(q.almashtirgan_id) ?? []), q]);

  // Qatorlar canonical daraxtdan (ota_id) plan qilinadi; parent metadata berilmagan eski RPC uchun depth-stack.
  type Rej = { tur: 'rz' | 'bl' | 'barg' | 'itogo' | 'vsego'; q?: NakopitelniyQator; bolalar: number[]; nom?: string; daraja?: number; ota?: number };
  type PlanNode = { tur: 'rz' | 'bl' | 'barg'; q: NakopitelniyQator; bolalar: PlanNode[]; daraja: number };
  const parentTur = (tur: PlanNode['tur']) => tur === 'rz' || tur === 'bl';
  const qatorTur = (q: NakopitelniyQator): PlanNode['tur'] => q.tur === 'rz' ? 'rz' : q.tur === 'bl' ? 'bl' : 'barg';
  const nodes: PlanNode[] = qatorlar.map((q) => ({
    tur: qatorTur(q), q, bolalar: [],
    daraja: Number.isFinite(q.daraja) ? Math.max(0, Number(q.daraja)) : 0,
  }));
  const byId = new Map<number, PlanNode>();
  for (const node of nodes) if (!byId.has(node.q.qator_id)) byId.set(node.q.qator_id, node);
  const roots: PlanNode[] = [];
  if (canonicalTree) {
    for (const node of nodes) {
      const parent = node.q.ota_id == null ? undefined : byId.get(node.q.ota_id);
      if (parent && parentTur(parent.tur)) {
        if (node.q.daraja == null) node.daraja = parent.daraja + 1;
        parent.bolalar.push(node);
      } else {
        if (node.q.daraja == null) node.daraja = 0;
        roots.push(node);
      }
    }
  } else {
    const stack: PlanNode[] = [];
    for (const node of nodes) {
      const depth = Number.isFinite(node.q.daraja)
        ? Math.max(0, Number(node.q.daraja))
        : (node.tur === 'rz' ? 0 : (stack.at(-1)?.daraja ?? -1) + 1);
      node.daraja = depth;
      while (stack.length && stack.at(-1)!.daraja >= depth) stack.pop();
      const parent = stack.at(-1);
      if (parent && parentTur(parent.tur)) parent.bolalar.push(node); else roots.push(node);
      if (parentTur(node.tur)) stack.push(node);
    }
  }

  // Resurssiz ish (bolasi yo'q `bl`: КСМ transport, М/К ...) o'z puli bilan qiymat qatori — barg kabi sanaladi. Aks holda uning F2 summasi
  // jamidan jim tushib qolardi (real obyektda server jamisidan kam chiqqan). Ish hajmi ogohlantirishi `q.tur === 'bl'` bo'yicha qoladi.
  if (canonicalTree) for (const node of nodes) if (node.tur === 'bl' && !node.bolalar.length) node.tur = 'barg';
  /** Qator bo'yicha: davrlar yig'indisi (с начала) va hisobot davri (oxirgi davr). */
  const jamiH = (q: NakopitelniyQator) => davrlar.reduce((s, d) => s + d.hajm(q), 0);
  /* Noma'lum oy summasi (null) jamiga qo'shilmaydi — faqat ma'lum qism (katak bo'sh, diqqat ro'yxatida aytiladi). */
  const jamiS = (q: NakopitelniyQator) => davrlar.reduce((s, d) => s + (d.summa(q) ?? 0), 0);
  /** Ko'rsatiladigan fakt hajmi — yozilganidek (egasi: F2 dan fakt chiqarilmaydi, fakt < F2 — normal). */
  const faktKor = (q: NakopitelniyQator): number => q.fakt_hajm;
  /** Fakt summasi = fakt hajmi × smeta narxi (tirik formula `=H*F`); narx noma'lum va fakt bor — noma'lum (null). */
  const faktSumma = (q: NakopitelniyQator): number | null => (q.fakt_hajm === 0 ? 0 : q.smeta_narx == null ? null : yaxlit2(q.fakt_hajm * q.smeta_narx));

  const reja: Rej[] = [];
  const bargRows: number[] = [];
  const diqqat: Array<{ nom: string; sabab: string }> = [];
  const nomi = (q: NakopitelniyQator) => `${q.nom ?? ''}${q.birlik ? `, ${q.birlik}` : ''}`;
  const emit = (node: PlanNode, ota?: number): number => {
    const i = reja.length;
    const row: Rej = { tur: node.tur, q: node.q, bolalar: [], daraja: node.daraja, ota };
    reja.push(row);
    if (node.q.tur === 'bl' && node.q.smeta_hajm != null && node.q.smeta_hajm >= 0 && jamiH(node.q) > node.q.smeta_hajm + 1e-9) {
      diqqat.push({ nom: nomi(node.q), sabab: `объем по утвержденным Ф-2 (${fmt(jamiH(node.q))}) превышает объем сметы (${fmt(node.q.smeta_hajm)} ${node.q.birlik ?? ''}); проверьте привязку, единицы и корректировочные акты` });
    }
    if (node.tur === 'barg') {
      bargRows.push(i);
      const q = node.q;
      if (q.zamena && (q.almashtirgan_id == null || !idlar.has(q.almashtirgan_id))) diqqat.push({ nom: nomi(q), sabab: 'замена не привязана к заменяемой позиции сметы — «взамен поз.» не указано' });
      if (q.qator_id > 0 && !q.zamena && (q.almashtirilgan_hajm ?? 0) > 1e-12 && !minusKerak(q)) diqqat.push({ nom: nomi(q), sabab: 'часть позиции заменена, но стоимость исключаемой части неизвестна — вычитание не показано' });
      if (q.qator_id > 0 && (q.smeta_hajm == null || (q.smeta_summa == null && narxBildirishnomaKerak(q, null)))) diqqat.push({ nom: nomi(q), sabab: 'нет объема или стоимости по смете — строка не включена в сумму' });
      if (!nakrutkaKat(q.kat)) diqqat.push({ nom: nomi(q), sabab: 'не указан вид затрат (ЧЕЛ/МАШ/МАТ/ОБ/КАБ/М/К) — накрутка не применяется (только НДС), в расчете отдельной строкой' });
      const mozhno = q.fakt_hajm - jamiH(q);
      // Reja ishorasiga nisbatan: chegirma ishida (manfiy smeta) akt fakt’dan «manfiyroq» bo‘lsa — ortiqcha qabul.
      if ((q.smeta_hajm ?? 0) < 0 ? mozhno > 1e-9 : mozhno < -1e-9) diqqat.push({ nom: nomi(q), sabab: `принято по актам больше, чем выполнено по факту (на ${fmt(Math.abs(mozhno))})` });
      // NULL ≠ 0 (ADR-4): tasdiqlangan F2 da summasi yo'q oy — katak bo'sh, jamiga faqat ma'lum qism; ochiq aytiladi.
      const nomalumOy = davrlar.filter((d) => d.summa(q) == null).length;
      if (nomalumOy) diqqat.push({ nom: nomi(q), sabab: `сумма по утвержденным Ф-2 неизвестна за ${nomalumOy} ${aktRejim ? 'акт(ов)' : 'мес.'} — ячейка пустая, итог только по известным суммам` });
      // Oy kesimi RPC jamisi bilan mos bo'lishi shart — farq bo'lsa ochiq aytiladi (to'qilmaydi).
      else if (oyKesimi && q.qator_id > 0 && Math.abs(jamiS(q) - (q.oldingi_summa + q.joriy_summa)) > 0.01) {
        diqqat.push({ nom: nomi(q), sabab: `сумма по ${aktRejim ? 'актам' : 'месяцам'} (${fmt2(jamiS(q))}) не совпадает с итогом ведомости (${fmt2(q.oldingi_summa + q.joriy_summa)})` });
      }
      return i;
    }
    row.bolalar = node.bolalar.map((b) => emit(b, i));
    if (node.tur === 'rz' && row.bolalar.length) {
      reja.push({ tur: 'itogo', bolalar: row.bolalar, nom: `ИТОГО ПО РАЗДЕЛУ: ${node.q.nom ?? ''}`, daraja: node.daraja + 1 });
    }
    return i;
  };
  roots.forEach((r) => emit(r));

  /* Pozitsiya raqamlari: ish qatorlari va zamena bilan bog'liq qatorlar raqamlanadi («взамен поз. N» havolasi uchun). */
  const zamenaBogliq = (q: NakopitelniyQator) => q.qator_id > 0 && (zamenalari.has(q.qator_id) || (q.zamena && q.almashtirgan_id != null && idlar.has(q.almashtirgan_id)));
  const poz = new Map<number, string>();
  { let no = 0; for (const x of reja) { if (x.q && (x.tur === 'bl' || (x.tur === 'barg' && (x.q.tur === 'bl' || zamenaBogliq(x.q))))) poz.set(x.q.qator_id, String(++no)); } }
  const pozMatn = (q: NakopitelniyQator) => poz.get(q.qator_id) ?? (q.kod ? `[${q.kod}]` : '?');
  /** Qatorning o'zgarish izohi: kelib chiqishi (qayerdan qayerga) ko'rinib tursin. */
  const izohOf = (q: NakopitelniyQator): string | null => {
    if (q.qator_id < 0) {
      const asl = asliBy.get(-q.qator_id);
      return `ИСКЛЮЧАЕТСЯ ИЗ СМЕТЫ: часть поз. ${asl ? pozMatn(asl) : '?'}, замененная${asl && zamenalari.get(asl.qator_id)?.length ? ` (замена: поз. ${zamenalari.get(asl.qator_id)!.map(pozMatn).join(', ')})` : ''}`;
    }
    if (q.zamena) {
      const asl = q.almashtirgan_id != null ? asliBy.get(q.almashtirgan_id) : undefined;
      return asl ? `ЗАМЕНА: ВЗАМЕН ПОЗ. ${pozMatn(asl)} «${`${asl.kod ? asl.kod + ' ' : ''}${asl.nom ?? ''}`.trim()}»` : (q.ozgarish_izoh ?? 'ЗАМЕНА позиции сметы');
    }
    const z = zamenalari.get(q.qator_id);
    const bj = bajarilmadiMi(q)
      ? `НЕ ВЫПОЛНЯЕТСЯ${q.bajarilmadi_hajm ? ` (${fmt(q.bajarilmadi_hajm)} ${q.birlik ?? ''})`.replace(/ \)$/, ')') : ''}: ${bajarilmadiSababRu(q.bajarilmadi_sabab ?? 'boshqa')}${q.bajarilmadi_izoh ? `, ${q.bajarilmadi_izoh}` : ''}${q.bajarilmadi_zamena_id != null && asliBy.has(q.bajarilmadi_zamena_id) ? ` (взамен — поз. ${pozMatn(asliBy.get(q.bajarilmadi_zamena_id)!)})` : ''}`
      : null;
    const asosiy = z?.length ? `ИСКЛЮЧАЕТСЯ / ЗАМЕНЕНО ПОЗ. ${z.map(pozMatn).join(', ')}` : (q.ozgarish_izoh ?? (q.qoshimcha ? 'ДОП. РАБОТА (не предусмотрена сметой)' : null));
    return [asosiy, bj].filter(Boolean).join('; ') || null;
  };

  const j = nakopitelniyJamilar(qatorlarXom);
  const rowOf = (i: number) => bosh + i;
  const nk: Partial<NakrutkaKoeffitsientlar> = { ...(o.nakrutka ?? {}) };
  if (o.ndsFoiz != null && Number.isFinite(o.ndsFoiz) && o.ndsFoiz >= 0) nk.НДС = o.ndsFoiz;
  // Foizlar faqat podvaldan (server meros rejimi); noma'lum foiz — podval bo'sh, 0 emas.
  const podval = o.podval ? serverMerosKoefQoy(o.podval, nk, o.nkManba) : null;
  const kfJS = kategoriyaKf(nk, podval);
  const ndsFoiz = podvalNdsFoiz(podval, nk);
  const yaxIds = yaxlitQatorIdlari(qatorlar.map((q) => ({ id: q.qator_id, ota_id: q.ota_id })), o.svodYaxlit);
  /* Svod yaxlit bo'limi: SMETA ustunida (G va остаток) bo'limning BARCHA avlodlari yaxlit; F2/fakt ustunlarida ЧЕЛ/МАШ
   * oddiy kategoriya — server `_t2_summa_agg_v1` va F3 bilan aynan (`f2YaxlitdanChiqadi`). */
  const yaxlitmiG = (q: NakopitelniyQator) => yaxIds.has(q.qator_id);
  const yaxlitmi = (q: NakopitelniyQator) => yaxIds.has(q.qator_id) && !f2YaxlitdanChiqadi(q.kat);
  /* Aralash bo'lim (yaxlit bo'lim ichida ЧЕЛ/МАШ bor): kategoriya belgisi smeta va F2 ustunlari uchun har xil bo'la olmaydi —
   * podval kategoriya yig'indilari SUMIF o'rniga qiymat bilan yoziladi (F3 podvali kabi). */
  const aralash = qatorlar.some((q) => (BARG.has(q.tur) || q.qator_id < 0) && yaxlitmiG(q) && !yaxlitmi(q));
  const yaxlitBor = !!o.svodYaxlit && bargRows.length > 0;
  // Svod yaxlit (egasi): bo'lim smetasi qatorlarga tiyingacha taqsimlanadi (Σ = yaxlit aynan). Svod bir marta: G ustunida taqsim, podvalda alohida qator.
  const gTaqsim = new Map<number, number>();
  for (const b of o.svodYaxlit?.bolimlar ?? []) {
    const ids = yaxlitQatorIdlari(qatorlar.map((q) => ({ id: q.qator_id, ota_id: q.ota_id })), { ...o.svodYaxlit!, bolimlar: [b] });
    const lq = bargRows.map((i) => reja[i].q!).filter((q) => ids.has(q.qator_id));
    if (!lq.length) continue;
    for (const [id, x] of yaxlitQatorlarga(Number(b.qqssiz), lq.map((q) => ({ id: q.qator_id, summa: q.smeta_summa }))) ?? []) gTaqsim.set(id, x);
    // Smetasi noma'lum qatorlar taqsimga kirmaydi (null qoladi) — diqqatga.
    const bilinmas = lq.filter((q) => q.smeta_summa == null).length;
    if (bilinmas) diqqat.push({ nom: `Раздел по своду: ${b.nom ?? b.qator_id}`, sabab: `нет сметной стоимости по ${bilinmas} поз. — в распределение суммы свода не включены` });
  }
  const smetaOf = (q: NakopitelniyQator): number | null => gTaqsim.get(q.qator_id) ?? q.smeta_summa;
  // Kategoriyasi ko'rsatilmagan barglar: ustamasiz, faqat QQS (server kabi); podvalda alohida qator.
  const katsizmi = (q: NakopitelniyQator) => !yaxlitmi(q) && !nakrutkaKat(q.kat);
  /** Barg qatorining pul ustuni qiymati. */
  const pulOf = (q: NakopitelniyQator, c: string): number | null => {
    if (c === 'G') return smetaOf(q);
    if (c === U.faktS) return faktSumma(q);
    if (c === U.jamiS) return jamiS(q);
    if (c === U.ostS) return smetaOf(q) == null ? null : smetaOf(q)! - jamiS(q);
    const k = U.davrS.indexOf(c);
    return k >= 0 ? davrlar[k].summa(q) : null;
  };
  const smetaUstunmi = (c: string) => c === 'G' || c === U.ostS;
  /** Barglar (idx) yig'indisi — oraliq + belgi bo'yicha; narxsiz barg jamini bo'shatmaydi (egasi qoidasi). */
  const yig = (c: string, idx: readonly number[], val: number | null): Qiymat => {
    if (!idx.length) return null;
    const a = rowOf(Math.min(...idx)), b = rowOf(Math.max(...idx));
    const rng = `${c}${a}:${c}${b}`, m = `${U.belgi}${a}:${U.belgi}${b}`;
    return { f: `ROUND(SUMIF(${m},1,${rng}),2)`, v: yaxlit2(val ?? 0) };
  };
  const bargIdx = (idx: readonly number[]): number[] => {
    const out: number[] = [];
    const w = (k: number) => { if (reja[k].tur === 'barg') out.push(k); else reja[k].bolalar.forEach(w); };
    idx.forEach(w);
    return out;
  };
  const pulYig = (c: string, idx: readonly number[]): Qiymat => {
    const bl = bargIdx(idx);
    const vals = bl.map((k) => pulOf(reja[k].q!, c));
    return yig(c, bl, vals.reduce<number>((a2, b2) => a2 + (b2 ?? 0), 0));
  };
  const ostatok = (idx: readonly number[]): number | string => {
    const bl = bargIdx(idx);
    return bl.reduce((s, k) => s + (smetaOf(reja[k].q!) ?? 0) - jamiS(reja[k].q!), 0);
  };
  const n = (x: number | null | undefined): Qiymat => (x == null ? null : x);
  // Excel читает числа с 15 значащими цифрами; сравнение должно использовать ту же точность.
  const excelSource = (x: number) => Number(x.toPrecision(15));
  const col = (h: string) => U.idx(h);
  const jamiHF = (rr: number) => U.davrH.map((h) => `${h}${rr}`).join('+');
  const jamiSF = (rr: number) => U.davrS.map((h) => `${h}${rr}`).join('+');
  reja.forEach((x, i) => {
    let r = 0;
    const q = x.q;
    if (x.tur === 'rz') r = v.qator('jami', () => {
      const c: Qiymat[] = Array(U.ustunlar.length).fill(null);
      c[2] = nomIzohBilan(q!.nom ?? '', q!.ozgarish_izoh);
      for (const p of U.pul) {
        if (p === U.ostS) { c[col(p)] = ostatok(x.bolalar); continue; }
        c[col(p)] = pulYig(p, x.bolalar);
      }
      return c;
    }, { daraja: x.daraja ?? 0 });
    else if (x.tur === 'barg' || x.tur === 'bl') {
      const barg = x.tur === 'barg';
      const ishQ = q!.tur === 'bl'; // resurssiz ish (barg sifatida sanalgan) — hujjatda ish qatori kabi raqamlanadi va ajratiladi
      const tartib = poz.get(q!.qator_id) ?? '';
      const us = barg && !ishQ ? bargUslubi(q!.tur === 'rs' || q!.tur === 'mat' || q!.tur === 'ob' ? q!.tur : null) : { tur: 'ish' as const, rang: undefined };
      r = v.qator(us.tur, (rr) => {
        const c: Qiymat[] = Array(U.ustunlar.length).fill(null);
        c[0] = tartib; c[1] = q!.kod ?? ''; c[2] = nomIzohBilan(q!.nom ?? '', izohOf(q!)); c[3] = q!.birlik ?? '';
        // Egasi 2026-09-30: tirik smeta — ish hajmi (E) o'zgarsa resurs hajmi = norma × ish hajmi,
        // resurs summasi = hajm × narx (F2 ustunlari esa hujjatdagidek, qiymat).
        const ota = barg && x.ota != null ? reja[x.ota] : undefined;
        const normaF = barg && q!.norma != null && ota?.tur === 'bl' && ota.q?.smeta_hajm != null && q!.smeta_hajm != null;
        const normFormula = `ROUND(${q!.norma}*E${rowOf(x.ota ?? 0)},6)`;
        // Сохранённый источник важнее округлённой нормы. При изменении работы формула остаётся живой.
        c[4] = normaF ? { f: `IF(E${rowOf(x.ota!)}=${excelSource(ota!.q!.smeta_hajm!)},${excelSource(q!.smeta_hajm!)},${normFormula})`, v: q!.smeta_hajm! } : n(q!.smeta_hajm);
        c[5] = barg ? n(q!.smeta_narx) : null;
        c[6] = barg && gTaqsim.has(q!.qator_id) ? smetaOf(q!) // svod bo'limiga taqsim — qiymat (formula emas)
          : barg
          ? (q!.smeta_narx != null && q!.smeta_hajm != null && q!.smeta_summa != null ? { f: `IF(OR(E${rr}="",F${rr}=""),"",IF(AND(E${rr}=${excelSource(q!.smeta_hajm)},F${rr}=${excelSource(q!.smeta_narx)}),${q!.smeta_summa},ROUND(E${rr}*F${rr},2)))`, v: q!.smeta_summa } : n(q!.smeta_summa))
          : pulYig('G', x.bolalar);
        const faktK = faktKor(q!);
        c[7] = faktK;
        // Fakt summasi — tirik formula (hajm × narx); ish/bo'lim qatorlari — barglar yig'indisi.
        c[col(U.faktS)] = barg
          ? (q!.smeta_narx != null ? { f: `IF(OR(H${rr}="",F${rr}=""),"",ROUND(H${rr}*F${rr},2))`, v: faktSumma(q!) ?? 0 } : n(faktSumma(q!)))
          : pulYig(U.faktS, x.bolalar);
        davrlar.forEach((d, k) => {
          c[col(U.davrH[k])] = d.hajm(q!);
          c[col(U.davrS[k])] = barg ? d.summa(q!) : pulYig(U.davrS[k], x.bolalar);
        });
        const jh = jamiH(q!);
        c[col(U.jamiH)] = { f: jamiHF(rr), v: jh };
        c[col(U.jamiS)] = barg ? { f: jamiSF(rr), v: jamiS(q!) } : pulYig(U.jamiS, x.bolalar);
        c[col(U.ostH)] = { f: `IF(E${rr}="","",E${rr}-${U.jamiH}${rr})`, v: q!.smeta_hajm == null ? '' : q!.smeta_hajm - jh };
        c[col(U.ostS)] = barg || x.bolalar.length ? { f: `IF(G${rr}="","",G${rr}-${U.jamiS}${rr})`, v: barg ? (smetaOf(q!) == null ? '' : smetaOf(q!)! - jamiS(q!)) : ostatok(x.bolalar) } : null;
        c[col(U.mozhno)] = { f: `H${rr}-${U.jamiH}${rr}`, v: faktK - jh };
        if (barg) {
          c[col(U.kat)] = yaxlitmiG(q!) ? YAXLIT_KAT : nakrutkaKat(q!.kat) ?? NOMALUM_KAT;
          c[col(U.belgi)] = 1;
          c[col(U.izm)] = izmBelgisi(q!);
          if (bajarilmadiMi(q!)) c[col(U.nev)] = 1;
        }
        return c;
      }, { daraja: x.daraja ?? (barg ? 2 : 1), rang: us.rang });
    } else {
      r = v.qator('jami', (rr) => {
        const c: Qiymat[] = Array(U.ustunlar.length).fill(null);
        c[2] = x.nom;
        for (const p of U.pul) {
          if (p === U.ostS) { c[col(p)] = { f: `IF(G${rr}="","",G${rr}-${U.jamiS}${rr})`, v: ostatok(x.bolalar) }; continue; }
          c[col(p)] = pulYig(p, x.bolalar);
        }
        return c;
      }, { daraja: x.daraja ?? 0 });
    }
    if (r !== rowOf(i)) throw new Error('NAKOPITELNIY_QATOR_SILJIDI');
  });
  const a1 = bosh, b1 = bosh + reja.length - 1;
  let vsegoR = 0;
  let kaskad: Record<string, NakrutkaHisobJS | null> | null = null;
  let kOplataJami: { davr: number | null; jami: number | null } = { davr: null, jami: null };
  if (bargRows.length) {
    vsegoR = v.qator('vsego', (rr) => {
      const c: Qiymat[] = Array(U.ustunlar.length).fill(null);
      c[2] = 'ВСЕГО ПО ОБЪЕКТУ';
      for (const p of U.pul) {
        if (p === U.ostS) { c[col(p)] = { f: `IF(G${rr}="","",G${rr}-${U.jamiS}${rr})`, v: ostatok(bargRows) }; continue; }
        c[col(p)] = pulYig(p, bargRows);
      }
      return c;
    });
    kaskad = {};
    const natijalar: Record<string, { vsego: number | null; qiymat: Record<string, number | null> }> = {};
    const blokInfo = new Map<string, { bosh: number; vsegoQator: number; yaxlitBor: boolean; nomalumBor: boolean; podval: Podval | null; nk: Partial<NakrutkaKoeffitsientlar>; yaxlitQator: number | null }>();
    const colQiymat = (q: NakopitelniyQator, c: string): number => (pulOf(q, c) ?? 0);

    /** Bitta podval bloki: har pul ustuni uchun kaskad (foiz × asos — tirik formulalar). */
    const blokYoz = (b: Blok) => {
      const bPodval = b.podval;
      const bNds = podvalNdsFoiz(bPodval, b.nk);
      const katSummalar: Record<string, KatSummalar> = {};
      for (const p of b.cols) {
        const ks = Object.fromEntries(NAKRUTKA_KATLAR.map((k) => [k, 0])) as KatSummalar;
        for (const i of bargRows) {
          const q = reja[i].q!;
          const kat = nakrutkaKat(q.kat);
          // Smeta (G) va остаток — bo'limning barcha avlodlari yaxlit; F2/fakt ustunlari — ЧЕЛ/МАШ oddiy kategoriya.
          if (!kat || (smetaUstunmi(p) ? yaxlitmiG(q) : yaxlitmi(q))) continue;
          ks[kat] += colQiymat(q, p);
        }
        katSummalar[p] = ks;
      }
      // Svod yaxlit podval qatori — QQS BILAN (НДС dan keyin, aynan): smeta ustunida svod summasi, F2/fakt ustunlarida F2 × (1+QQS), остаток = svod − с начала.
      const svQ = svodYaxlitQqs(o.svodYaxlit, bNds);
      let yaxlit: Record<string, number> | null = null;
      if (yaxlitBor && svQ && bNds != null) {
        const yq = bargRows.map((i) => reja[i].q!).filter(yaxlitmi);
        const qb = (x: number) => yaxlitKOplate(x, bNds) as number;
        const jamiQb = qb(bargRows.map((i) => reja[i].q!).filter(yaxlitmiG).reduce((t, q) => t + jamiS(q), 0));
        const y: Record<string, number> = {};
        for (const c of b.cols) y[c] = c === 'G' ? svQ.qqsBilan : c === U.ostS ? yaxlit2(svQ.qqsBilan - jamiQb) : qb(yq.reduce((t, q) => t + colQiymat(q, c), 0));
        // Svod bo'limi bu F-2/faktda ishtirok etmasa — nol qator chiqmaydi (svod bir marta: smeta blokida).
        yaxlit = b.smetaTuri || Object.values(y).some((x) => Math.abs(x) >= 0.005) ? y : null;
      }
      let nomalum: Record<string, number> | null = null, nomalumF: Record<string, string> | null = null;
      const nq = bargRows.map((i) => reja[i].q!).filter(katsizmi);
      const nomalumBlok = nq.some((q) => b.cols.some((c) => Math.abs(colQiymat(q, c)) >= 0.005));
      if (nomalumBlok) {
        nomalum = Object.fromEntries(b.cols.map((p) => [p, yaxlit2(nq.reduce((t, q) => t + colQiymat(q, p), 0))]));
        nomalumF = Object.fromEntries(b.cols.map((p) => [p, `SUMIF(${U.kat}${a1}:${U.kat}${b1},"${NOMALUM_KAT}",${p}${a1}:${p}${b1})`]));
      }
      v.bosh();
      const p = nakrutkaPodvaliYoz(v, { podval: bPodval, katUstun: U.kat, oraliq: [a1, b1], pulUstunlar: b.cols, foizUstun: 'F', nk: b.nk, katSummalar, yaxlit, nomalum, nomalumF, sarlavha: b.sarlavha, kfJadval: false, ...(aralash ? { katFormulasiz: true } : {}) });
      Object.assign(kaskad!, p.kaskad);
      for (const c of b.cols) natijalar[c] = { vsego: p.natija[c].vsego ?? null, qiymat: p.natija[c].qiymat as Record<string, number | null> };
      for (const c of b.cols) blokInfo.set(c, { bosh: p.bosh, vsegoQator: p.vsegoQator, yaxlitBor: !!yaxlit, nomalumBor: nomalumBlok, podval: bPodval, nk: b.nk, yaxlitQator: yaxlit ? p.vsegoQator - 1 : null });
      return p;
    };

    const smetaBlok = (sarlavha: string, cols: string[]): Blok => ({ sarlavha, cols, nk, podval, smetaTuri: true });
    if (!aktRejim) {
      blokYoz(smetaBlok('РАСЧЕТ СТОИМОСТИ К ОПЛАТЕ (прямые затраты → накладные и прочие расходы → НДС)', U.pul));
      const L = U.davrS[U.davrS.length - 1];
      kOplataJami = { davr: kaskad[L]?.vsego ?? null, jami: kaskad[U.jamiS]?.vsego ?? null };
    } else {
      blokYoz(smetaBlok('ПОДВАЛ: ПО СМЕТЕ (с учетом изменений) — прямые затраты → накладные и прочие расходы → НДС', ['G']));
      blokYoz(smetaBlok('ПОДВАЛ: ФАКТ ВЫПОЛНЕНИЯ — по подвалу сметы', [U.faktS]));
      const oyD = o.davr.slice(0, 7);
      let davrJami: number | null = 0;
      davrlar.forEach((d, k) => {
        const c = U.davrS[k];
        const a = d.akt!;
        const oz = a.nk != null;
        const bl = blokYoz(oz
          ? { sarlavha: `ПОДВАЛ АКТА Ф-2${a.raqam ? ` № ${a.raqam}` : ''} (${davrMatni(a.oy)}) — собственный подвал акта`, cols: [c], nk: {}, podval: aktPodvaliPodval(a.nk!), akt: a, smetaTuri: false }
          : { sarlavha: `ПОДВАЛ АКТА Ф-2${a.raqam ? ` № ${a.raqam}` : ''} (${davrMatni(a.oy)}) — у акта нет своего подвала: подвал сметы`, cols: [c], nk, podval, akt: a, smetaTuri: false });
        // Nazorat: hisoblangan ВСЕГО ↔ imzolangan akt ВСЕGO (tiyingacha; farq — qo'lda ko'rinadi).
        const hisob = natijalar[c].vsego;
        const imz = a.imzolangan ?? a.qqsBilan;
        if (imz == null) diqqat.push({ nom: `Ф-2${a.raqam ? ` № ${a.raqam}` : ''}`, sabab: 'ВСЕГО подписанного акта не определено — сверка с подвалом невозможна' });
        const ctrlR = v.qator('oddiy', () => {
          const cc: Qiymat[] = Array(U.ustunlar.length).fill(null);
          cc[2] = `ВСЕГО по подписанному акту Ф-2${a.raqam ? ` № ${a.raqam}` : ''} (по документу; значение)`;
          cc[col(c)] = imz == null ? null : imz;
          return cc;
        });
        v.qator('oddiy', (rr) => {
          const cc: Qiymat[] = Array(U.ustunlar.length).fill(null);
          cc[2] = 'Расхождение: расчет подвала − подписанный акт';
          if (hisob != null && imz != null) cc[col(c)] = { f: `ROUND(${c}${bl.vsegoQator}-${c}${ctrlR},2)`, v: yaxlit2(hisob - imz) };
          return cc;
        });
        if (hisob != null && imz != null && Math.abs(hisob - imz) >= 0.005) {
          diqqat.push({ nom: `Ф-2${a.raqam ? ` № ${a.raqam}` : ''}`, sabab: `ВСЕГО по подвалу в ведомости (${fmt2(hisob)}) отличается от подписанного акта (${fmt2(imz)}) на ${fmt2(hisob - imz)}${(a.birlikSoni ?? 1) > 1 ? '; акт содержит блоки сторно со своими подвалами' : ''}` });
        }
        if (hisob == null) diqqat.push({ nom: `Ф-2${a.raqam ? ` № ${a.raqam}` : ''}`, sabab: 'проценты подвала акта не заданы — ВСЕГО акта не определено (не 0)' });
        if (a.oy.slice(0, 7) === oyD) davrJami = davrJami == null || hisob == null ? null : davrJami + hisob;
      });
      // «с начала»: aktlar podvallari yig'indisi (har satr = shu satrlarning yig'indisi formulasi).
      v.bosh();
      v.bolim('ПОДВАЛ: С НАЧАЛА СТРОИТЕЛЬСТВА — сумма по подвалам актов Ф-2 (каждый акт — со своими процентами)', { daraja: 0 });
      const aktCols = U.davrS;
      const kodSummasi = (kod: string): { f: string | null; v: number | null } => {
        let s = 0; const refs: string[] = [];
        for (const c of aktCols) {
          const val = natijalar[c].qiymat[kod];
          const bi = blokInfo.get(c)!;
          const rn = kod === 'vsego' ? bi.vsegoQator : podvalQatorRaqami(bi.bosh, bi.podval, kod, bi.yaxlitBor, bi.nomalumBor);
          if (val == null) return { f: null, v: null };
          s += val;
          if (rn != null) refs.push(`${c}${rn}`);
        }
        return { f: refs.length === aktCols.length && refs.length ? `ROUND(${refs.join('+')},2)` : null, v: yaxlit2(s) };
      };
      const yaxSum = (): { f: string | null; v: number } | null => {
        const refs = aktCols.filter((c) => blokInfo.get(c)!.yaxlitQator != null).map((c) => ({ c, r: blokInfo.get(c)!.yaxlitQator! }));
        if (!refs.length) return null;
        return { f: `ROUND(${refs.map((x) => `${x.c}${x.r}`).join('+')},2)`, v: yaxlit2(refs.reduce((t, x) => t + (natijalar[x.c].qiymat.yaxlit ?? 0), 0)) };
      };
      const satr = (nom: string, kod: string, uslub: 'oddiy' | 'jami' | 'vsego' = 'oddiy') => {
        const x = kodSummasi(kod);
        v.qator(uslub, () => {
          const cc: Qiymat[] = Array(U.ustunlar.length).fill(null);
          cc[2] = nom;
          cc[col(U.jamiS)] = x.v == null ? null : x.f ? { f: x.f, v: x.v } : x.v;
          return cc;
        });
        return x.v;
      };
      const pr = satr('ПРЯМЫЕ ЗАТРАТЫ — ВСЕГО (с начала)', 'pryamye');
      const i4 = satr('ИТОГО-4 (БЕЗ НДС) — сумма по актам', 'itogo4', 'jami');
      const nd = satr('НДС — сумма по актам', 'nds');
      const ys = yaxSum();
      if (ys) v.qator('oddiy', () => { const cc: Qiymat[] = Array(U.ustunlar.length).fill(null); cc[2] = YAXLIT_PODVAL_NOM; cc[col(U.jamiS)] = ys.f ? { f: ys.f, v: ys.v } : ys.v; return cc; });
      const vs = satr('ВСЕГО С НДС ПО АКТАМ Ф-2 (с начала строительства)', 'vsego', 'vsego');
      kaskad[U.jamiS] = pr != null && i4 != null && nd != null && vs != null ? ({ pryamye: pr, itogo4: i4, nds: nd, vsego: vs } as NakrutkaHisobJS) : null;
      kOplataJami = { davr: davrJami == null ? null : yaxlit2(davrJami), jami: vs };
      // Ostatok podvali — smeta podvali bilan (svod − с начала).
      blokYoz(smetaBlok('ПОДВАЛ: ОСТАТОК ПО СМЕТЕ (смета − принято с начала строительства) — по подвалу сметы', [U.ostS]));
    }
  }
  /* Eski rejim (aktlar ustunlari yo'q): «ИТОГО К ОПЛАТЕ ПО АКТАМ Ф-2» — hisobot oyigacha HAMMA tasdiqlangan F2, har biri O'Z podvali bilan. */
  let aktKO: { davr: number | null; jami: number | null } | null = null;
  if (o.aktlarKOplate && !aktRejim) {
    const oyD = o.davr.slice(0, 7);
    const hamma = o.aktlarKOplate.filter((a) => !a.oy || a.oy.slice(0, 7) <= oyD);
    const jamla = (l: ReadonlyArray<F3DavrAkt>): number | null => { let s = 0; for (const a of l) { if (a.qqsBilan == null) return null; s += a.qqsBilan; } return yaxlit2(s); };
    aktKO = { davr: jamla(hamma.filter((a) => a.oy?.slice(0, 7) === oyD)), jami: jamla(hamma) };
    v.bosh();
    v.bolim('К ОПЛАТЕ ПО АКТАМ Ф-2 (накрутка и НДС — по подвалу каждого акта)', { daraja: 0 });
    v.qator('vsego', () => {
      const c: Qiymat[] = Array(U.ustunlar.length).fill(null);
      c[2] = 'ИТОГО К ОПЛАТЕ ПО АКТАМ Ф-2 (с НДС)';
      c[col(U.davrS[U.davrS.length - 1])] = aktKO!.davr; c[col(U.jamiS)] = aktKO!.jami;
      return c;
    });
    if (aktKO.davr == null || aktKO.jami == null) diqqat.push({ nom: 'К ОПЛАТЕ ПО АКТАМ Ф-2', sabab: 'сумма хотя бы одного акта Ф-2 не определена (проценты подвала неизвестны) — итог оставлен пустым, а не нулевым' });
    for (const [nom, akt, qat] of [['за отчетный период', aktKO.davr, kOplataJami.davr], ['с начала строительства', aktKO.jami, kOplataJami.jami]] as const) {
      if (akt != null && qat != null && Math.abs(akt - qat) >= 0.005) diqqat.push({ nom: `К ОПЛАТЕ ${nom}`, sabab: `сумма по подвалу объекта (${fmt2(qat)}) отличается от суммы актов Ф-2 по их собственным подвалам (${fmt2(akt)}); к оплате принята сумма актов Ф-2` });
    }
  } else if (o.aktlarKOplate === null && !aktRejim) {
    diqqat.push({ nom: 'К ОПЛАТЕ ПО АКТАМ Ф-2', sabab: 'акты Ф-2 по их подвалам не прочитаны — подвал рассчитан по подвалу объекта и может отличаться от суммы подписанных актов Ф-2' });
  }
  // Egasi qoidasi (2026-11-06): smeta narxi/summasi yo'q barglar — jamilar yonida «итог неполный» (smeta summa katagi formulalarda — bo'sh qoladi, ro'yxat diqqat da).
  v.narxsizOgoh(narxsizSoni(bargRows.map((i) => reja[i].q!).filter((q) => q.qator_id > 0), (q) => q.smeta_narx ?? q.smeta_summa));
  v.bosh();
  v.izoh(oyKesimi
    ? `Принято по утвержденным актам формы № 2 — ${aktRejim ? 'отдельно по каждому акту (суммы актов — по подписанным документам, значения)' : 'отдельно за каждый месяц'}; «С начала строительства» — итог (формула). «Можно предъявить» = выполнено по факту − принято с начала строительства. Суммы по разделам подводятся по ресурсам.`
    : 'Графы «Принято ранее», «За отчетный период» и «С начала строительства» — по утвержденным актам формы № 2. «Можно предъявить» = выполнено по факту − принято с начала строительства. Суммы по разделам подводятся по ресурсам (материалам, труду, машинам, оборудованию).');
  v.izoh('Суммы в строках — прямые затраты (без накладных расходов и НДС); накрутка, НДС и ВСЕГО показаны только в подвалах (по смете, по факту, по каждому акту Ф-2 — его собственные проценты, и с начала строительства). Позиции с пометкой «ВЗАМЕН ПОЗ.» / «ИСКЛЮЧАЕТСЯ» / «ДОП. РАБОТА» — изменения к смете; сводка — на листе «Свод изменений».');
  if (yaxIds.size) v.izoh(YAXLIT_IZOH);
  if (Object.values(kfJS).some((x) => x == null)) diqqat.push({ nom: 'Проценты накладных и прочих расходов', sabab: 'не заданы для объекта (договора) — стоимость к оплате не определена (проценты не принимаются равными 0)' });
  // Bitta hujjat — bitta ВСЕГО: izoh shu hujjat podvalining smeta ustunidan (G) olinadi, tashqi qiymatdan emas.
  const sn = kaskad?.G ?? null;
  if (sn && sn.vsego != null) {
    v.izoh(`Сметная стоимость объекта: прямые затраты ${fmt2(j.smeta)} сум; с накладными расходами и прочими затратами (без НДС) ${fmt2(sn.itogo4)} сум; НДС${ndsFoiz != null ? ` ${String(ndsFoiz).replace('.', ',')} %` : ''} ${fmt2(sn.nds)} сум; всего с НДС ${fmt2(sn.vsego)} сум.`);
  }
  // Hal qilinmagan joylar (yuzlab qator) hujjat tanasiga CHIQMAYDI — F-3 dagidek alohida xizmat varag'i «Замечания (служебный)».
  const zv = zamechaniyaVaraq(diqqatGuruh(diqqat), `за отчетный период: ${davrMatni(o.davr)}`);
  v.imzo(imzoTomonlari(['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'СОСТАВИЛ'], o.imzo));
  const svodVaraq = bargRows.length ? izmSvodVaraq({ U, a1, b1, vsegoR, glavNom: 'Накопительная ведомость', bargQ: bargRows.map((i) => reja[i].q!), pulOf, obyektNom: o.obyektNom, davr: o.davr, imzo: o.imzo, jamiS, bekorAktlar: o.oylar?.bekorAktlar ?? [] }) : null;
  const { bytes } = rasmiyKitob([v, ...(svodVaraq ? [svodVaraq] : []), ...(zv ? [zv] : [])], { tur: 'nakopitelniy' });
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNom, hujjat: 'НАКОПИТЕЛЬНАЯ_ВЕДОМОСТЬ', davr: o.davr.slice(0, 7) }), jamilar: j, kaskad, kOplata: aktKO ?? kOplataJami };
}

/**
 * «Свод изменений» — смета до изменений → исключаемые → замена → доп. работы → смета после изменений (egasi 2026-11-14).
 * Hamma summa — asosiy varaqdagi qatorlardan tirik SUMIFS (yashirin «Изм.» belgisi bo'yicha); o'zgarish bo'lmasa varaq chiqmaydi.
 */
function izmSvodVaraq(p: {
  U: ReturnType<typeof ustunRejasi>; a1: number; b1: number; vsegoR: number; glavNom: string; bargQ: NakopitelniyQator[];
  pulOf: (q: NakopitelniyQator, c: string) => number | null; obyektNom: string; davr: string; imzo?: ImzoNomlar; jamiS: (q: NakopitelniyQator) => number;
  bekorAktlar: NonNullable<NakopitelniyOylar['bekorAktlar']>;
}): RasmiyVaraq | null {
  const { U } = p;
  if (!p.bargQ.some((q) => izmBelgisi(q) !== IZM_ASL || bajarilmadiMi(q)) && !p.bekorAktlar.length) return null;
  const sv = new RasmiyVaraq({
    nom: 'Свод изменений',
    sarlavha: 'СВОД ИЗМЕНЕНИЙ К СМЕТЕ',
    ostSarlavha: [`по накопительной ведомости за отчетный период: ${davrMatni(p.davr)} (суммы — прямые затраты, без накладных расходов и НДС)`],
    titul: [['Объект:', p.obyektNom]],
    ustunlar: [
      { sarlavha: 'Показатель', kenglik: 58, tur: 'matn' },
      { sarlavha: 'По смете, сум', kenglik: 22, tur: 'pul' },
      { sarlavha: 'Принято по Ф-2 с начала, сум', kenglik: 24, tur: 'pul' },
      { sarlavha: 'Остаток, сум', kenglik: 22, tur: 'pul' },
    ],
    yonalish: 'landscape',
  });
  const sh = `'${p.glavNom}'!`;
  const rng = (c: string) => `${sh}${c}${p.a1}:${c}${p.b1}`;
  const sumifs = (c: string, izm: string) => `ROUND(SUMIFS(${rng(c)},${rng(U.izm)},"${izm}",${rng(U.belgi)},1),2)`;
  const qiym = (izm: string, c: string) => yaxlit2(p.bargQ.filter((q) => izmBelgisi(q) === izm).reduce((t, q) => t + (c === 'G' ? (p.pulOf(q, 'G') ?? 0) : p.jamiS(q)), 0));
  const satrlar: Array<[string, string]> = [
    ['СМЕТА ДО ИЗМЕНЕНИЙ (первоначальные позиции; заменяемые показаны полностью)', IZM_ASL],
    ['ИСКЛЮЧАЕМЫЕ ПОЗИЦИИ (заменённая часть первоначальных позиций, со знаком минус)', IZM_ISKLYUCHAEMAYA],
    ['ЗАМЕНА (позиции «взамен поз. …»)', IZM_ZAMENA],
    ['ДОПОЛНИТЕЛЬНЫЕ РАБОТЫ (не предусмотрены сметой)', IZM_QOSHIMCHA],
  ];
  const rows: number[] = [];
  for (const [nom, izm] of satrlar) {
    const r = sv.qator('oddiy', (rr) => [nom, { f: sumifs('G', izm), v: qiym(izm, 'G') }, { f: sumifs(U.jamiS, izm), v: qiym(izm, U.jamiS) }, { f: `ROUND(B${rr}-C${rr},2)`, v: yaxlit2(qiym(izm, 'G') - qiym(izm, U.jamiS)) }]);
    rows.push(r);
  }
  const tot = (c: 'G' | 'J') => yaxlit2(satrlar.reduce((t, [, izm]) => t + qiym(izm, c === 'G' ? 'G' : U.jamiS), 0));
  const [r0, r3] = [rows[0], rows[rows.length - 1]];
  const posle = sv.qator('vsego', (rr) => ['СМЕТА ПОСЛЕ ИЗМЕНЕНИЙ', { f: `ROUND(SUM(B${r0}:B${r3}),2)`, v: tot('G') }, { f: `ROUND(SUM(C${r0}:C${r3}),2)`, v: tot('J') }, { f: `ROUND(B${rr}-C${rr},2)`, v: yaxlit2(tot('G') - tot('J')) }]);
  sv.qator('oddiy', (rr) => ['Контроль: «ВСЕГО ПО ОБЪЕКТУ» в накопительной ведомости (должно совпадать)', { f: `${sh}G${p.vsegoR}`, v: tot('G') }, { f: `${sh}${U.jamiS}${p.vsegoR}`, v: tot('J') }, { f: `ROUND(B${posle}-B${rr},2)`, v: 0 }]);
  // «Не выполняется» (t2_qator_bajarilmadi): qator hujjatda o'z joyida qoladi; smeta summasi shu yerda alohida (ma'lumot, «после изменений» ga qo'shilmaydi).
  const nevSum = (c: string) => yaxlit2(p.bargQ.filter(bajarilmadiMi).reduce((t, q) => t + (c === 'G' ? (p.pulOf(q, 'G') ?? 0) : p.jamiS(q)), 0));
  sv.qator('oddiy', (rr) => ['в т.ч. НЕ ВЫПОЛНЯЕТСЯ (отмечено «не выполнено»; позиции остаются в ведомости со своей сметной суммой)', { f: `ROUND(SUMIFS(${rng('G')},${rng(U.nev)},1,${rng(U.belgi)},1),2)`, v: nevSum('G') }, { f: `ROUND(SUMIFS(${rng(U.jamiS)},${rng(U.nev)},1,${rng(U.belgi)},1),2)`, v: nevSum(U.jamiS) }, { f: `ROUND(B${rr}-C${rr},2)`, v: yaxlit2(nevSum('G') - nevSum(U.jamiS)) }]);
  if (p.bekorAktlar.length) {
    sv.bosh();
    sv.bolim('ИНФОРМАЦИЯ: АННУЛИРОВАННЫЕ АКТЫ Ф-2 (в итоги не входят)', { daraja: 0 });
    for (const a of p.bekorAktlar) {
      sv.qator('oddiy', () => [`Ф-2${a.raqam ? ` № ${a.raqam}` : ` (id ${a.aktId})`} — ${davrMatni(a.oy)}: аннулирован${a.almashtirgan ? `; заменён актом Ф-2${a.almashtirgan.raqam ? ` № ${a.almashtirgan.raqam}` : ` (id ${a.almashtirgan.aktId})`}` : ''}`, null, null, null]);
    }
  }
  sv.bosh();
  sv.izoh('Накрутка, НДС и ВСЕГО по смете, по факту и по каждому акту Ф-2 — в подвалах накопительной ведомости.');
  sv.imzo(imzoTomonlari(['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'СОСТАВИЛ'], p.imzo));
  return sv;
}

function fmt2(x: number): string {
  return x.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmt(x: number): string {
  return x.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}

/* ═══════════ SHARTNOMA DARAJASI (2026-10-23, egasi: nakopitelniy va sverka tizimda) ═══════════
 * Hisob — `nakopitelniy-svod.ts`. Varaqlar: «Свод по договорам», «Ф-2 по месяцам», «Акт сверки».
 * F2 — tizimdagi tasdiqlangan aktlar (nakrutkasiz прямые затраты); реализация (Ф-3), оплата, договор — с НДС.
 * Ikkala daraja ayirilmaydi — ustun sarlavhasida daraja yozilgan. */

export type ShartnomaEksportOpsiya = { sana?: string; tashkilot?: string | null; imzo?: ImzoNomlar };

const sanaRuS = (s: string | null | undefined) => (s ? s.slice(0, 10).split('-').reverse().join('.') : null);
const shNomi = (sh: SvodShartnoma) => `Договор № ${raqamTozala(sh.raqam)}${sh.nom ? ` (${sh.nom})` : ''}`;
const pulT = (t: number | null) => (t == null ? null : somga(t));

const SVOD_USTUN: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Договор', kenglik: 30, tur: 'matn' },
  { sarlavha: 'Объекты', kenglik: 26, tur: 'matn' },
  { sarlavha: 'Сумма договора с учётом ДС, с НДС', kenglik: 19, tur: 'pul' },
  { sarlavha: 'Ф-2 утверждено, шт.', kenglik: 9, tur: 'birlik', guruh: 'ВЫПОЛНЕНИЕ (Ф-2)' },
  { sarlavha: 'Ф-2, прямые затраты (без накруток и НДС)', kenglik: 19, tur: 'pul', guruh: 'ВЫПОЛНЕНИЕ (Ф-2)' },
  { sarlavha: 'Реализация (Ф-3), с НДС', kenglik: 19, tur: 'pul', guruh: 'РАСЧЁТЫ С ЗАКАЗЧИКОМ' },
  { sarlavha: '% от договора', kenglik: 9, tur: 'foiz', guruh: 'РАСЧЁТЫ С ЗАКАЗЧИКОМ' },
  { sarlavha: 'Оплачено заказчиком', kenglik: 19, tur: 'pul', guruh: 'РАСЧЁТЫ С ЗАКАЗЧИКОМ' },
  { sarlavha: 'Сальдо (+ долг заказчика)', kenglik: 19, tur: 'pul', guruh: 'РАСЧЁТЫ С ЗАКАЗЧИКОМ' },
  { sarlavha: 'Ф-3 сверх договора', kenglik: 19, tur: 'pul', guruh: 'РАСЧЁТЫ С ЗАКАЗЧИКОМ' },
  { sarlavha: 'Ф-3 подписано, шт.', kenglik: 9, tur: 'birlik' },
];

const OY_USTUN: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Договор', kenglik: 30, tur: 'matn' },
  { sarlavha: 'Отчётный месяц', kenglik: 11, tur: 'birlik' },
  { sarlavha: 'Ф-2, шт.', kenglik: 8, tur: 'birlik' },
  { sarlavha: 'Ф-2 за месяц, прямые затраты', kenglik: 19, tur: 'pul' },
  { sarlavha: 'Нарастающим итогом', kenglik: 19, tur: 'pul' },
];

/** НАКОПИТЕЛЬНАЯ ВЕДОМОСТЬ ПО ДОГОВОРАМ: svod + Ф-2 oyma-oy. */
export function shartnomaSvodXlsx(shartnomalar: readonly SvodShartnoma[], o: ShartnomaEksportOpsiya = {}): { bytes: Uint8Array; faylNomi: string } {
  const sana = o.sana ?? bugunSana();
  const svodlar = shartnomalar.map(shartnomaSvodi);
  const v = new RasmiyVaraq({
    nom: 'Свод по договорам', kattaHarf: false,
    sarlavha: 'НАКОПИТЕЛЬНАЯ ВЕДОМОСТЬ ВЫПОЛНЕНИЯ И РАСЧЁТОВ ПО ДОГОВОРАМ',
    ostSarlavha: [`по состоянию на ${sanaRuS(sana)}`, 'сум'],
    titul: [['Организация:', o.tashkilot ?? null]],
    ustunlar: SVOD_USTUN, yonalish: 'landscape',
  });
  const h = (i: number) => ustunHarfi(i);
  const qatorlar: number[] = [];
  svodlar.forEach((s, i) => {
    const shT = s.joriy.summa == null ? null : tiyin(s.joriy.summa);
    qatorlar.push(v.qator('oddiy', (r) => [
      i + 1, shNomi(s.shartnoma), s.shartnoma.obyektlar.map((x) => x.nom).join(', ') || null,
      pulT(shT), s.f2Soni, somga(s.f2), somga(s.f3),
      shT ? { f: `IF(${h(3)}${r}=0,"",${h(6)}${r}/${h(3)}${r})`, v: s.f3 / shT, uslub: 'foiz' } : null,
      somga(s.tolov),
      { f: `${h(6)}${r}-${h(8)}${r}`, v: somga(s.qoldiq) },
      s.f3Oshish != null && s.f3Oshish > 0 ? somga(s.f3Oshish) : null,
      s.f3Imzolangan,
    ]));
  });
  const j = svodJami(svodlar);
  const jf = (c: number, val: number) => { const f = sumFormula(h(c), qatorlar); return f ? { f, v: yaxlit2(somga(val)) } : null; };
  v.qator('jami', ['', 'ИТОГО', '', jf(3, j.shartnomaSumma), null, jf(5, j.f2), jf(6, j.f3), null, jf(8, j.tolov), jf(9, j.qoldiq), null, null]);
  v.bosh();
  v.izoh('Сальдо = реализация (Ф-3) − оплата; «+» — задолженность заказчика, «−» — неотработанный аванс. Ф-2 — прямые затраты по утверждённым актам системы (без накруток и НДС), с реализацией не сравниваются.');
  const diqqat = svodlar.flatMap((s) => s.ogohlantirishlar.map((g) => ({ nom: `№ ${s.shartnoma.raqam}`, sabab: g.matn })));
  if (diqqat.length) v.diqqat(diqqat);
  v.imzo(imzoTomonlari(['ПОДРЯДЧИК', 'СОСТАВИЛ'], o.imzo));

  const m = new RasmiyVaraq({
    nom: 'Ф-2 по месяцам', kattaHarf: false,
    sarlavha: 'НАКОПИТЕЛЬНАЯ ВЕДОМОСТЬ АКТОВ Ф-2 ПО МЕСЯЦАМ',
    ostSarlavha: [`по состоянию на ${sanaRuS(sana)}`, 'прямые затраты, сум'],
    ustunlar: OY_USTUN, yonalish: 'portrait',
  });
  let no = 0;
  for (const s of svodlar) {
    if (!s.f2Oylar.length) continue;
    m.bolim(shNomi(s.shartnoma));
    const ichki: number[] = [];
    for (const oy of s.f2Oylar) {
      const [y, mm] = oy.oy.split('-');
      ichki.push(m.qator('oddiy', [++no, `№ ${s.shartnoma.raqam}`, mm ? `${mm}.${y}` : oy.oy, oy.soni, somga(oy.summa), somga(oy.nakopitel)]));
    }
    const f = sumFormula(ustunHarfi(4), ichki);
    m.qator('jami', ['', `Итого по № ${s.shartnoma.raqam}`, '', s.f2Soni, f ? { f, v: yaxlit2(somga(s.f2)) } : null, null]);
  }
  m.bosh();
  m.imzo(imzoTomonlari(['ПОДРЯДЧИК', 'СОСТАВИЛ'], o.imzo));
  const { bytes } = rasmiyKitob([v, m], { tur: 'nakopitelniy' });
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.tashkilot ?? 'ДОГОВОРЫ', hujjat: 'НАКОПИТЕЛЬНАЯ_ПО_ДОГОВОРАМ', davr: sana }) };
}

const SVERKA_USTUN: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Дата', kenglik: 11, tur: 'birlik' },
  { sarlavha: 'Документ', kenglik: 34, tur: 'matn' },
  { sarlavha: 'Дебет (реализация)', kenglik: 19, tur: 'pul' },
  { sarlavha: 'Кредит (оплата)', kenglik: 19, tur: 'pul' },
  { sarlavha: 'Сальдо', kenglik: 19, tur: 'pul' },
];

/** АКТ СВЕРКИ ВЗАИМНЫХ РАСЧЁТОВ (сличительная) по одному договору за период. */
export function sverkaXlsx(sh: SvodShartnoma, o: ShartnomaEksportOpsiya & { dan?: string | null; gacha?: string | null } = {}): { bytes: Uint8Array; faylNomi: string } {
  const sana = o.sana ?? bugunSana();
  const s = sverkaHisobla(sh, { dan: o.dan, gacha: o.gacha });
  const v = new RasmiyVaraq({
    nom: 'Акт сверки', kattaHarf: false,
    sarlavha: 'АКТ СВЕРКИ ВЗАИМНЫХ РАСЧЁТОВ',
    ostSarlavha: [shNomi(sh), `${s.dan ? `с ${sanaRuS(s.dan)}` : 'с начала договора'} по ${sanaRuS(s.gacha ?? sana)}`],
    titul: [['Организация:', o.tashkilot ?? null], ['Объекты:', sh.obyektlar.map((x) => x.nom).join(', ') || null]],
    ustunlar: SVERKA_USTUN, yonalish: 'portrait',
  });
  const h = (i: number) => ustunHarfi(i);
  const bosh = v.qator('jami', ['', '', 'Сальдо начальное', null, null, somga(s.boshlangich)]);
  const qatorlar: number[] = [];
  let oldingi = bosh;
  s.qatorlar.forEach((q, i) => {
    const prev = oldingi;
    const r = v.qator('oddiy', (rr) => [i + 1, sanaRuS(q.sana), q.hujjat, q.debet ? somga(q.debet) : null, q.kredit ? somga(q.kredit) : null,
      { f: `${h(5)}${prev}+N(${h(3)}${rr})-N(${h(4)}${rr})`, v: somga(q.qoldiq) }]);
    qatorlar.push(r); oldingi = r;
  });
  const fd = sumFormula(h(3), qatorlar), fk = sumFormula(h(4), qatorlar);
  const ob = v.qator('jami', ['', '', 'Обороты за период', fd ? { f: fd, v: somga(s.debetJami) } : 0, fk ? { f: fk, v: somga(s.kreditJami) } : 0, null]);
  v.qator('vsego', ['', '', 'Сальдо конечное', null, null, { f: `${h(5)}${bosh}+${h(3)}${ob}-${h(4)}${ob}`, v: somga(s.yakuniy) }]);
  v.bosh();
  const yak = Math.abs(somga(s.yakuniy)).toLocaleString('ru-RU', { minimumFractionDigits: 2 });
  v.izoh(s.yakuniy >= 0
    ? `На ${sanaRuS(s.gacha ?? sana)} задолженность заказчика перед подрядчиком: ${yak} сум.`
    : `На ${sanaRuS(s.gacha ?? sana)} задолженность подрядчика (неотработанный аванс): ${yak} сум.`);
  v.imzo(imzoTomonlari(['ЗАКАЗЧИК', 'ПОДРЯДЧИК'], o.imzo));
  const { bytes } = rasmiyKitob([v], { tur: 'slichitelniy' });
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: `№${raqamTozala(sh.raqam)}`, hujjat: 'АКТ_СВЕРКИ', davr: s.gacha ?? sana }) };
}
