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
  NAKRUTKA_KATLAR, NOMALUM_KAT, kOplate, kategoriyaKf, nakrutkaKat, nakrutkaPodvaliYoz, podvalKfQatorlari, podvalNdsFoiz, podvalQatorRaqami,
  type KatSummalar, type NakrutkaHisobJS,
} from './nakrutka-podval';
import { f2YaxlitdanChiqadi, serverMerosKoefQoy, yaxlitKOplate, yaxlitKOplateTaqsim, yaxlitQatorlarga, type Podval } from './hisob-yadro';
import { narxBildirishnomaKerak, narxsizSoni } from './narx-bildirishnoma';
import { bargUslubi } from './qator-uslubi';
import { YAXLIT_IZOH, YAXLIT_KAT, svodYaxlitQqs, yaxlitQatorIdlari, type SvodYaxlit } from './svod-yaxlit';
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
  /** Obyekt nakrutka foizlari (t2_obyekt_nakrutka_v1.koeffitsientlar). Berilmasa — 0 %
   *  (к оплате = прямые) va hujjatda "проценты не заданы" deyiladi. */
  nakrutka?: Partial<NakrutkaKoeffitsientlar> | null;
  /** Server `nk_manba` — meros foizlari izohi (yadro `serverMerosKoefQoy`). */
  nkManba?: string | null;
  /** Maxsus nakrutka podvali (konstruktor) — null: standart kaskad. */
  podval?: Podval | null;
  /** Smeta nakrutka kaskadi (RPC jami.smeta_nakrutka) — izohda ko'rsatiladi. */
  smetaNakrutka?: SmetaNakrutka | null;
  /** Oy kesimi (egasi 2026-09-30): har tasdiqlangan F2 oyi alohida ustun + ИТОГО. Berilmasa — "ранее / за период". */
  oylar?: NakopitelniyOylar | null;
  /** Svod yaxlit bo'limlari (t2_obyekt_nakrutka_v1.svod_yaxlit): avlod qatorlariga ustama qo'llanmaydi, podvalda alohida qator. */
  svodYaxlit?: SvodYaxlit | null;
  /** Hisobot oyigacha HAMMA tasdiqlangan F2 aktlari (har biri O'Z podvali bilan, `oy` bilan): «К ОПЛАТЕ» oy va «с начала» jami shulardan (F-3 bilan bir xil). */
  aktlarKOplate?: ReadonlyArray<F3DavrAkt> | null;
}

/** Tasdiqlangan F2 qatorlari oy bo'yicha: oylar — 'YYYY-MM' o'sish tartibida (oxirgisi — hisobot davri). */
export interface NakopitelniyOylar {
  oylar: string[];
  /** summa: null — tasdiqlangan F2 da summa noma'lum (0 emas). */
  qiymat: ReadonlyMap<number, ReadonlyMap<string, { hajm: number; summa: number | null }>>;
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

/** Davr ustun guruhi: har tasdiqlangan F2 oyi (yoki eski ko'rinishda "ранее / за период"). */
type DavrUstun = { sarlavha: string; hajm: (q: NakopitelniyQator) => number; summa: (q: NakopitelniyQator) => number | null };

/** Ustunlar va ularning harflari — davrlar soniga qarab (egasi 2026-09-30: har oy alohida ustun + ИТОГО). */
function ustunRejasi(davrlar: readonly DavrUstun[]) {
  const u: RasmiyUstun[] = [
    { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
    { sarlavha: 'Шифр, код', kenglik: 13, tur: 'kod' },
    { sarlavha: 'Наименование работ и затрат', kenglik: 44, tur: 'matn' },
    { sarlavha: 'Ед. изм.', kenglik: 8, tur: 'birlik' },
    { sarlavha: 'кол-во', kenglik: 13, tur: 'hajm', guruh: 'ПО СМЕТЕ' },
    { sarlavha: 'цена, сум', kenglik: 16, tur: 'narx', guruh: 'ПО СМЕТЕ' },
    { sarlavha: 'сумма, сум', kenglik: 19, tur: 'pul', guruh: 'ПО СМЕТЕ' },
    { sarlavha: 'Выполнено (факт), кол-во', kenglik: 13, tur: 'hajm' },
  ];
  const davrH: string[] = [], davrS: string[] = [];
  for (const d of davrlar) {
    davrH.push(ustunHarfi(u.length)); u.push({ sarlavha: 'кол-во', kenglik: 13, tur: 'hajm', guruh: d.sarlavha });
    davrS.push(ustunHarfi(u.length)); u.push({ sarlavha: 'сумма, сум', kenglik: 19, tur: 'pul', guruh: d.sarlavha });
  }
  const at = (s: RasmiyUstun) => { const h = ustunHarfi(u.length); u.push(s); return h; };
  const JAMI_GURUH = davrlar.length > 2 || !davrlar[0]?.sarlavha.startsWith('ПРИНЯТО') ? 'С НАЧАЛА СТРОИТЕЛЬСТВА (ИТОГО ЗА ВСЕ МЕСЯЦЫ)' : 'С НАЧАЛА СТРОИТЕЛЬСТВА';
  const jamiH = at({ sarlavha: 'кол-во', kenglik: 13, tur: 'hajm', guruh: JAMI_GURUH });
  const jamiS = at({ sarlavha: 'сумма, сум', kenglik: 19, tur: 'pul', guruh: JAMI_GURUH });
  const ostH = at({ sarlavha: 'кол-во', kenglik: 13, tur: 'hajm', guruh: 'ОСТАТОК ПО СМЕТЕ' });
  const ostS = at({ sarlavha: 'сумма, сум', kenglik: 19, tur: 'pul', guruh: 'ОСТАТОК ПО СМЕТЕ' });
  const mozhno = at({ sarlavha: 'Можно предъявить (факт − принято), кол-во', kenglik: 13, tur: 'hajm' });
  const koPer = at({ sarlavha: 'за отчетный период, сум', kenglik: 19, tur: 'pul', guruh: 'К ОПЛАТЕ (с накладными расходами и НДС)' });
  const koJami = at({ sarlavha: 'с начала строительства, сум', kenglik: 19, tur: 'pul', guruh: 'К ОПЛАТЕ (с накладными расходами и НДС)' });
  // Yashirin texnik ustunlar: kategoriya (podval SUMIF) va barg belgisi (jamilar SUMIF(belgi,1,…)).
  const kat = at({ sarlavha: 'Кат.', kenglik: 6, tur: 'texnik', yashirin: true });
  const belgi = at({ sarlavha: 'Т', kenglik: 4, tur: 'texnik', yashirin: true });
  const idx = (h: string) => u.findIndex((_, i) => ustunHarfi(i) === h);
  return { ustunlar: u, davrH, davrS, jamiH, jamiS, ostH, ostS, mozhno, koPer, koJami, kat, belgi, idx, pul: ['G', ...davrS, jamiS, ostS] };
}

/** Davr ustunlari: oylar berilsa — har oy; berilmasa — "принято ранее" va "за отчетный период". */
function davrUstunlari(o: NakopitelniyVedomostExportOptions): DavrUstun[] {
  const m = o.oylar;
  if (m && m.oylar.length) {
    return m.oylar.map((oy, i) => ({
      sarlavha: `${davrMatni(oy).toUpperCase()}${i === m.oylar.length - 1 ? ' — ОТЧЕТНЫЙ ПЕРИОД' : ''}`,
      hajm: (q) => m.qiymat.get(q.qator_id)?.get(oy)?.hajm ?? 0,
      /* Oyda F2 yo'q — haqiqiy 0; F2 bor, summa noma'lum — null (bo'sh katak). */
      summa: (q) => { const v = m.qiymat.get(q.qator_id)?.get(oy); return v ? v.summa : 0; },
    }));
  }
  return [
    { sarlavha: 'ПРИНЯТО РАНЕЕ', hajm: (q) => q.oldingi_hajm, summa: (q) => q.oldingi_summa },
    { sarlavha: 'ЗА ОТЧЕТНЫЙ ПЕРИОД', hajm: (q) => q.joriy_hajm, summa: (q) => q.joriy_summa },
  ];
}

export type NakopitelniyJamilar = { smeta: number; oldingi: number; joriy: number; jami: number; qoldiq: number };

/** Hujjat jamilari — barglar bo'yicha (UI shu sonni ko'rsatadi, Excel ВСЕГО bilan teng). */
export function nakopitelniyJamilar(qatorlar: readonly NakopitelniyQator[]): NakopitelniyJamilar {
  let smeta = 0, oldingi = 0, joriy = 0;
  // Resurssiz ish (daraxtda bolasi yo'q `bl`) ham o'z pulini olib yuradi — barg kabi sanaladi (hujjat qatorlari bilan bir xil qoida).
  const ota = new Set(qatorlar.map((q) => q.ota_id).filter((x): x is number => x != null));
  const daraxtBor = ota.size > 0;
  for (const q of qatorlar) {
    if (!BARG.has(q.tur) && !(q.tur === 'bl' && daraxtBor && !ota.has(q.qator_id))) continue;
    smeta += q.smeta_summa ?? 0;   // egasi qoidasi: narxsiz qator jamini bo'shatmaydi (bildirishnoma alohida)
    oldingi += q.oldingi_summa;
    joriy += q.joriy_summa;
  }
  const r = (x: number) => x;
  const jami = r(oldingi + joriy);
  return { smeta: r(smeta), oldingi: r(oldingi), joriy: r(joriy), jami, qoldiq: r(smeta - jami) };
}

/** Накопительная ведомость (.xlsx). */
export async function nakopitelniyVedomostExportXlsx(
  qatorlar: readonly NakopitelniyQator[],
  options: NakopitelniyVedomostExportOptions,
): Promise<Uint8Array> {
  return nakopitelniyVedomostHujjat(qatorlar, options).bytes;
}

export function nakopitelniyVedomostHujjat(
  qatorlar: readonly NakopitelniyQator[],
  o: NakopitelniyVedomostExportOptions,
): { bytes: Uint8Array; faylNomi: string; jamilar: NakopitelniyJamilar; kaskad: Record<string, NakrutkaHisobJS | null> | null; kOplata: { davr: number | null; jami: number | null } } {
  if (o.truncated) throw new HujjatToliqEmasXato('ro‘yxat server chegarasida qirqilgan');
  const davrlar = davrUstunlari(o);
  const U = ustunRejasi(davrlar);
  const oyKesimi = Boolean(o.oylar?.oylar.length);
  const v = new RasmiyVaraq({
    nom: 'Накопительная ведомость',
    sarlavha: 'НАКОПИТЕЛЬНАЯ ВЕДОМОСТЬ ВЫПОЛНЕННЫХ РАБОТ',
    ostSarlavha: [`за отчетный период: ${davrMatni(o.davr)} (учтены только утвержденные акты формы № 2${oyKesimi ? '; принято — по каждому месяцу отдельно' : ''})`],
    titul: [['Объект:', o.obyektNom], ['Заказчик:', o.imzo?.zakazchik], ['Подрядчик:', o.imzo?.pudratchi]],
    ustunlar: U.ustunlar,
    yonalish: 'landscape',
  });
  const bosh = v.malumotBoshi;
  // Qatorlar canonical daraxtdan (ota_id) plan qilinadi; parent metadata berilmagan eski RPC uchun depth-stack.
  type Rej = { tur: 'rz' | 'bl' | 'barg' | 'itogo' | 'vsego'; q?: NakopitelniyQator; bolalar: number[]; nom?: string; daraja?: number; ota?: number };
  type PlanNode = { tur: 'rz' | 'bl' | 'barg'; q: NakopitelniyQator; bolalar: PlanNode[]; daraja: number };
  const parentTur = (tur: PlanNode['tur']) => tur === 'rz' || tur === 'bl';
  const qatorTur = (q: NakopitelniyQator): PlanNode['tur'] => q.tur === 'rz' ? 'rz' : q.tur === 'bl' ? 'bl' : 'barg';
  const canonicalTree = qatorlar.some((q) => q.ota_id != null || q.daraja != null);
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
  const perS = (q: NakopitelniyQator) => davrlar[davrlar.length - 1].summa(q) ?? 0;
  /** Ko'rsatiladigan fakt hajmi — yozilganidek (egasi: F2 dan fakt chiqarilmaydi, fakt < F2 — normal). */
  const faktKor = (q: NakopitelniyQator): number => q.fakt_hajm;

  const reja: Rej[] = [];
  const bargRows: number[] = [];
  let no = 0;
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
      if (q.smeta_hajm == null || (q.smeta_summa == null && narxBildirishnomaKerak(q, null))) diqqat.push({ nom: nomi(q), sabab: 'нет объема или стоимости по смете — строка не включена в сумму' });
      if (!nakrutkaKat(q.kat)) diqqat.push({ nom: nomi(q), sabab: 'не указан вид затрат (ЧЕЛ/МАШ/МАТ/ОБ/КАБ/М/К) — к оплате без накрутки (только НДС), в расчете отдельной строкой' });
      const mozhno = q.fakt_hajm - jamiH(q);
      // Reja ishorasiga nisbatan: chegirma ishida (manfiy smeta) akt fakt’dan «manfiyroq» bo‘lsa — ortiqcha qabul.
      if ((q.smeta_hajm ?? 0) < 0 ? mozhno > 1e-9 : mozhno < -1e-9) diqqat.push({ nom: nomi(q), sabab: `принято по актам больше, чем выполнено по факту (на ${fmt(Math.abs(mozhno))})` });
      // NULL ≠ 0 (ADR-4): tasdiqlangan F2 da summasi yo'q oy — katak bo'sh, jamiga faqat ma'lum qism; ochiq aytiladi.
      const nomalumOy = davrlar.filter((d) => d.summa(q) == null).length;
      if (nomalumOy) diqqat.push({ nom: nomi(q), sabab: `сумма по утвержденным Ф-2 неизвестна за ${nomalumOy} мес. — ячейка пустая, итог только по известным суммам` });
      // Oy kesimi RPC jamisi bilan mos bo'lishi shart — farq bo'lsa ochiq aytiladi (to'qilmaydi).
      else if (oyKesimi && Math.abs(jamiS(q) - (q.oldingi_summa + q.joriy_summa)) > 0.01) {
        diqqat.push({ nom: nomi(q), sabab: `сумма по месяцам (${fmt2(jamiS(q))}) не совпадает с итогом ведомости (${fmt2(q.oldingi_summa + q.joriy_summa)})` });
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
  const j = nakopitelniyJamilar(qatorlar);
  const rowOf = (i: number) => bosh + i;
  const nk: Partial<NakrutkaKoeffitsientlar> = { ...(o.nakrutka ?? {}) };
  if (o.ndsFoiz != null && Number.isFinite(o.ndsFoiz) && o.ndsFoiz >= 0) nk.НДС = o.ndsFoiz;
  // Foizlar faqat podvaldan (server meros rejimi); noma'lum foiz — к оплате bo'sh, 0 emas.
  const podval = o.podval ? serverMerosKoefQoy(o.podval, nk, o.nkManba) : null;
  const kfJS = kategoriyaKf(nk, podval);
  const ndsFoiz = podvalNdsFoiz(podval, nk);
  const podvalBosh = bosh + reja.length + 2;
  const yaxIds = yaxlitQatorIdlari(qatorlar.map((q) => ({ id: q.qator_id, ota_id: q.ota_id })), o.svodYaxlit);
  /* Svod yaxlit bo'limi: SMETA ustunida (G va остаток) bo'limning BARCHA avlodlari yaxlit; F2 ustunlarida (oylar, с начала, к оплате) ЧЕЛ/МАШ
   * oddiy kategoriya — server `_t2_summa_agg_v1` va F3 bilan aynan (`f2YaxlitdanChiqadi`). Avval hamma ustunda bir xil edi: ЧЕЛ/МАШ F2 summalari
   * ustamasiz qolib, «К ОПЛАТЕ» server/F3 dan ~12 % kam chiqardi (real obyektda ~12 %). */
  const yaxlitmiG = (q: NakopitelniyQator) => yaxIds.has(q.qator_id);
  const yaxlitmi = (q: NakopitelniyQator) => yaxIds.has(q.qator_id) && !f2YaxlitdanChiqadi(q.kat);
  /* Aralash bo'lim (yaxlit bo'lim ichida ЧЕЛ/МАШ bor): kategoriya belgisi (yashirin ustun) smeta va F2 ustunlari uchun har xil bo'la olmaydi —
   * podval kategoriya yig'indilari SUMIF o'rniga qiymat bilan yoziladi (F3 podvali kabi). */
  const aralash = qatorlar.some((q) => BARG.has(q.tur) && yaxlitmiG(q) && !yaxlitmi(q));
  const yaxlitBor = !!o.svodYaxlit && bargRows.length > 0;
  // Svod yaxlit (egasi): bo'lim smetasi qatorlarga tiyingacha taqsimlanadi (Σ = yaxlit aynan); F2 summalari aynan,
  // ularning к оплате ×(1+QQS) bo'lim bo'yicha taqsim (Σ aynan). Qoldiq = taqsimlangan smeta − F2.
  const gTaqsim = new Map<number, number>();
  const koTaqsim = new Map<string, number>();
  for (const b of o.svodYaxlit?.bolimlar ?? []) {
    const ids = yaxlitQatorIdlari(qatorlar.map((q) => ({ id: q.qator_id, ota_id: q.ota_id })), { ...o.svodYaxlit!, bolimlar: [b] });
    const lq = bargRows.map((i) => reja[i].q!).filter((q) => ids.has(q.qator_id));
    if (!lq.length) continue;
    for (const [id, x] of yaxlitQatorlarga(Number(b.qqssiz), lq.map((q) => ({ id: q.qator_id, summa: q.smeta_summa }))) ?? []) gTaqsim.set(id, x);
    // Smetasi noma'lum qatorlar taqsimga kirmaydi (null qoladi) — diqqatga.
    const bilinmas = lq.filter((q) => q.smeta_summa == null).length;
    if (bilinmas) diqqat.push({ nom: `Раздел по своду: ${b.nom ?? b.qator_id}`, sabab: `нет сметной стоимости по ${bilinmas} поз. — в распределение суммы свода не включены` });
    for (const [k, f] of [['per', perS], ['jami', jamiS]] as const) {
      for (const [id, x] of yaxlitKOplateTaqsim(new Map(lq.filter((q) => !f2YaxlitdanChiqadi(q.kat)).map((q) => [q.qator_id, f(q)])), ndsFoiz) ?? []) koTaqsim.set(`${id}${k}`, x);
    }
  }
  const smetaOf = (q: NakopitelniyQator): number | null => gTaqsim.get(q.qator_id) ?? q.smeta_summa;
  // Kategoriyasi ko'rsatilmagan barglar: ustamasiz, faqat QQS (server kabi); podvalda alohida qator.
  const katsizmi = (q: NakopitelniyQator) => !yaxlitmi(q) && !nakrutkaKat(q.kat);
  const nomalumBor = bargRows.some((i) => katsizmi(reja[i].q!) && Math.abs((smetaOf(reja[i].q!) ?? 0)) + Math.abs(jamiS(reja[i].q!)) >= 0.005);
  const kfQ = podvalKfQatorlari(podvalBosh, podval, yaxlitBor, nomalumBor);
  const ndsQ = podvalQatorRaqami(podvalBosh, podval, 'nds', yaxlitBor, nomalumBor);
  const koOf = (q: NakopitelniyQator) => {
    const kat = nakrutkaKat(q.kat);
    const y = yaxlitmi(q);
    const tq = (k: string) => koTaqsim.get(`${q.qator_id}${k}`);
    return { kat, yaxlit: y, taqsim: tq('per') != null, per: tq('per') ?? kOplate(perS(q), kat, kfJS, y, ndsFoiz), jami: tq('jami') ?? kOplate(jamiS(q), kat, kfJS, y, ndsFoiz) };
  };
  // Yaxlit (svod) qatori к оплате: ustama yo'q, faqat QQS — ×(1+НДС%/100).
  const yaxKf = ndsQ != null ? `(1+F${ndsQ}/100)` : '1';
  /** Pul ustuni qiymati (barg). */
  const pulOf = (q: NakopitelniyQator, c: string): number | null => {
    if (c === 'G') return smetaOf(q);
    if (c === U.jamiS) return jamiS(q);
    const k = U.davrS.indexOf(c);
    return k >= 0 ? davrlar[k].summa(q) : null;
  };
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
  const koMemo = new Map<string, number | null>();
  function koQiymat(k: number, c: 'per' | 'jami'): number | null {
    const key = `${k}${c}`;
    if (koMemo.has(key)) return koMemo.get(key)!;
    const x = reja[k];
    let val: number | null;
    if (x.tur === 'barg') { const ko = koOf(x.q!); val = c === 'per' ? ko.per : ko.jami; }
    else { const vs = x.bolalar.map((b2) => koQiymat(b2, c)); val = !x.bolalar.length ? null : yaxlit2(vs.reduce<number>((a2, b2) => a2 + (b2 ?? 0), 0)); }
    koMemo.set(key, val);
    return val;
  }
  const koSum = (idx: readonly number[], c: 'per' | 'jami'): Qiymat => {
    const bl = bargIdx(idx);
    const vals = bl.map((k) => koQiymat(k, c));
    return yig(c === 'per' ? U.koPer : U.koJami, bl, vals.reduce<number>((a2, b2) => a2 + (b2 ?? 0), 0));
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
      c[col(U.koPer)] = koSum(x.bolalar, 'per');
      c[col(U.koJami)] = koSum(x.bolalar, 'jami');
      return c;
    }, { daraja: x.daraja ?? 0 });
    else if (x.tur === 'barg' || x.tur === 'bl') {
      const barg = x.tur === 'barg';
      const ishQ = q!.tur === 'bl'; // resurssiz ish (barg sifatida sanalgan) — hujjatda ish qatori kabi raqamlanadi va ajratiladi
      const tartib = barg && !ishQ ? '' : String(++no);
      const us = barg && !ishQ ? bargUslubi(q!.tur === 'rs' || q!.tur === 'mat' || q!.tur === 'ob' ? q!.tur : null) : { tur: 'ish' as const, rang: undefined };
      r = v.qator(us.tur, (rr) => {
        const c: Qiymat[] = Array(U.ustunlar.length).fill(null);
        c[0] = tartib; c[1] = q!.kod ?? ''; c[2] = nomIzohBilan(q!.nom ?? '', q!.ozgarish_izoh); c[3] = q!.birlik ?? '';
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
          const ko = koOf(q!);
          if (ko.taqsim) {
            c[col(U.koPer)] = ko.per; c[col(U.koJami)] = ko.jami; c[col(U.kat)] = YAXLIT_KAT; // bo'lim bo'yicha taqsim
          } else if (ko.yaxlit && (ndsQ == null || ndsFoiz == null)) {
            c[col(U.kat)] = YAXLIT_KAT; // QQS stavkasi noma'lum — к оплате bo'sh
          } else if (ko.yaxlit) {
            // Svod yaxlit bo'limi: ustama yo'q, faqat QQS (к оплате = прямые × (1+НДС)); podvalda «Свод яхлит» qatori.
            c[col(U.koPer)] = { f: `ROUND(${U.davrS[U.davrS.length - 1]}${rr}*${yaxKf},2)`, v: ko.per ?? '' };
            c[col(U.koJami)] = { f: `ROUND(${U.jamiS}${rr}*${yaxKf},2)`, v: ko.jami ?? '' };
            c[col(U.kat)] = YAXLIT_KAT;
          } else if (!ko.kat) {
            // Vid zatrat ko'rsatilmagan: ustamasiz, faqat QQS; podvalda «ВИД ЗАТРАТ НЕ УКАЗАН» qatori.
            if (ndsQ != null && ndsFoiz != null) {
              c[col(U.koPer)] = { f: `ROUND(${U.davrS[U.davrS.length - 1]}${rr}*${yaxKf},2)`, v: ko.per ?? '' };
              c[col(U.koJami)] = { f: `ROUND(${U.jamiS}${rr}*${yaxKf},2)`, v: ko.jami ?? '' };
            }
            c[col(U.kat)] = NOMALUM_KAT;
          } else if (ko.kat && kfJS[ko.kat] == null) {
            c[col(U.kat)] = ko.kat; // Kf noma'lum — к оплате bo'sh, formula yo'q
          } else if (ko.kat) {
            const kf = `F${kfQ[ko.kat]}`;
            c[col(U.koPer)] = { f: `ROUND(${U.davrS[U.davrS.length - 1]}${rr}*${kf},2)`, v: ko.per ?? '' };
            c[col(U.koJami)] = { f: `ROUND(${U.jamiS}${rr}*${kf},2)`, v: ko.jami ?? '' };
            c[col(U.kat)] = ko.kat;
          }
          c[col(U.belgi)] = 1;
        } else {
          c[col(U.koPer)] = koSum(x.bolalar, 'per');
          c[col(U.koJami)] = koSum(x.bolalar, 'jami');
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
        c[col(U.koPer)] = koSum(x.bolalar, 'per');
        c[col(U.koJami)] = koSum(x.bolalar, 'jami');
        return c;
      }, { daraja: x.daraja ?? 0 });
    }
    if (r !== rowOf(i)) throw new Error('NAKOPITELNIY_QATOR_SILJIDI');
  });
  let kaskad: Record<string, NakrutkaHisobJS | null> | null = null;
  let kOplataJami: { davr: number | null; jami: number | null } = { davr: null, jami: null };
  if (bargRows.length) {
    v.qator('vsego', (rr) => {
      const c: Qiymat[] = Array(U.ustunlar.length).fill(null);
      c[2] = 'ВСЕГО ПО ОБЪЕКТУ';
      for (const p of U.pul) {
        if (p === U.ostS) { c[col(p)] = { f: `IF(G${rr}="","",G${rr}-${U.jamiS}${rr})`, v: j.qoldiq == null ? '' : ostatok(bargRows) }; continue; }
        c[col(p)] = pulYig(p, bargRows);
      }
      c[col(U.koPer)] = koSum(bargRows, 'per');
      c[col(U.koJami)] = koSum(bargRows, 'jami');
      return c;
    });
    const vs = (c: 'per' | 'jami') => { const x = bargRows.map((i) => koQiymat(i, c)); return x.some((z) => z == null) ? null : yaxlit2(x.reduce<number>((a2, b2) => a2 + (b2 ?? 0), 0)); };
    kOplataJami = { davr: vs('per'), jami: vs('jami') };
    v.bosh();
    // Nakrutka podvali — har pul ustuni uchun (смета, har oy, с начала, остаток).
    const katSummalar: Record<string, KatSummalar> = {};
    for (const p of U.pul) {
      const ks = Object.fromEntries(NAKRUTKA_KATLAR.map((k) => [k, 0])) as KatSummalar;
      for (const i of bargRows) {
        const q = reja[i].q!;
        const kat = nakrutkaKat(q.kat);
        // Smeta (G) va остаток — bo'limning barcha avlodlari yaxlit; F2 ustunlari — ЧЕЛ/МАШ oddiy kategoriya.
        if (!kat || ((p === 'G' || p === U.ostS) ? yaxlitmiG(q) : yaxlitmi(q))) continue;
        ks[kat] += p === U.ostS ? (q.smeta_summa == null ? 0 : q.smeta_summa - jamiS(q)) : (pulOf(q, p) ?? 0);
      }
      katSummalar[p] = ks;
    }
    // Svod yaxlit: smeta ustunida — svod summasi (QQS siz, server bilan bir xil); boshqa ustunlarda — yaxlit
    // qatorlarning o'z summasi (ustamasiz); остаток = svod − с начала.
    let yaxlit: Record<string, number> | null = null;
    // Svod yaxlit podval qatori — QQS BILAN (НДС dan keyin, aynan; egasi 2026-10-30): smeta ustunida svod summasi
    // (yakuniy), F2 ustunlarida F2 × (1+QQS), остаток = svod − с начала (QQS bilan).
    const svQ = svodYaxlitQqs(o.svodYaxlit, ndsFoiz);
    if (yaxlitBor && svQ && ndsFoiz != null) {
      const yq = bargRows.map((i) => reja[i].q!).filter(yaxlitmi);
      const qb = (x: number) => yaxlitKOplate(x, ndsFoiz) as number;
      // Остаток: svod summasi − bo'limdagi BARCHA F2 (ЧЕЛ/МАШ ham: ularning smeta ulushi svodga kiradi) × (1+QQS).
      const jamiQb = qb(bargRows.map((i) => reja[i].q!).filter(yaxlitmiG).reduce((t, q) => t + jamiS(q), 0));
      yaxlit = {};
      for (const c of U.pul) {
        yaxlit[c] = c === 'G' ? svQ.qqsBilan : c === U.ostS ? yaxlit2(svQ.qqsBilan - jamiQb) : qb(yq.reduce((t, q) => t + (pulOf(q, c) ?? 0), 0));
      }
    }
    const [a1, b1] = [bosh, bosh + reja.length - 1];
    let nomalum: Record<string, number> | null = null, nomalumF: Record<string, string> | null = null;
    if (nomalumBor) {
      const nq = bargRows.map((i) => reja[i].q!).filter(katsizmi);
      nomalum = Object.fromEntries(U.pul.map((p) => [p, yaxlit2(nq.reduce((t, q) => t + (p === U.ostS ? (smetaOf(q) == null ? 0 : smetaOf(q)! - jamiS(q)) : pulOf(q, p) ?? 0), 0))]));
      nomalumF = Object.fromEntries(U.pul.map((p) => [p, `SUMIF(${U.kat}${a1}:${U.kat}${b1},"${NOMALUM_KAT}",${p}${a1}:${p}${b1})`]));
    }
    const p = nakrutkaPodvaliYoz(v, { podval, katUstun: U.kat, oraliq: [a1, b1], pulUstunlar: U.pul, foizUstun: 'F', nk, katSummalar, yaxlit, nomalum, nomalumF, ...(aralash ? { katFormulasiz: true } : {}) });
    if (p.bosh !== podvalBosh) throw new Error('NAKOPITELNIY_PODVAL_SILJIDI');
    kaskad = p.kaskad;
  }
  /* «К ОПЛАТЕ» oy va «с начала» — HAR F2 O'Z podvali bilan (imzolangan F2 hujjatlari ВСЕГО yig'indisi; server `_t2_summa_paket_v1` bilan tiyinigacha,
   * F-3 bilan bir xil). Qatorlardagi «К ОПЛАТЕ» obyektning joriy podvali bilan hisoblanadi — aktlar podvali boshqa bo'lsa jami farq qiladi. */
  let aktKO: { davr: number | null; jami: number | null } | null = null;
  if (o.aktlarKOplate) {
    const oyD = o.davr.slice(0, 7);
    const hamma = o.aktlarKOplate.filter((a) => !a.oy || a.oy.slice(0, 7) <= oyD);
    const jamla = (l: ReadonlyArray<F3DavrAkt>): number | null => { let s = 0; for (const a of l) { if (a.qqsBilan == null) return null; s += a.qqsBilan; } return yaxlit2(s); };
    aktKO = { davr: jamla(hamma.filter((a) => a.oy?.slice(0, 7) === oyD)), jami: jamla(hamma) };
    v.bosh();
    v.bolim('К ОПЛАТЕ ПО АКТАМ Ф-2 (накрутка и НДС — по подвалу каждого акта)', { daraja: 0 });
    v.qator('vsego', () => {
      const c: Qiymat[] = Array(U.ustunlar.length).fill(null);
      c[2] = 'ИТОГО К ОПЛАТЕ ПО АКТАМ Ф-2 (с НДС)';
      c[col(U.koPer)] = aktKO!.davr; c[col(U.koJami)] = aktKO!.jami;
      return c;
    });
    if (aktKO.davr == null || aktKO.jami == null) diqqat.push({ nom: 'К ОПЛАТЕ ПО АКТАМ Ф-2', sabab: 'сумма хотя бы одного акта Ф-2 не определена (проценты подвала неизвестны) — итог оставлен пустым, а не нулевым' });
    for (const [nom, akt, qat] of [['за отчетный период', aktKO.davr, kOplataJami.davr], ['с начала строительства', aktKO.jami, kOplataJami.jami]] as const) {
      if (akt != null && qat != null && Math.abs(akt - qat) >= 0.005) diqqat.push({ nom: `К ОПЛАТЕ ${nom}`, sabab: `сумма по строкам (подвал объекта: ${fmt2(qat)}) отличается от суммы актов Ф-2 по их собственным подвалам (${fmt2(akt)}); к оплате принята сумма актов Ф-2` });
    }
  } else if (o.aktlarKOplate === null) {
    // Zanjir: aktlar o'qilmadi — «К ОПЛАТЕ» obyekt podvali bilan qoladi, lekin foydalanuvchi bilishi shart (ilgari jim edi).
    diqqat.push({ nom: 'К ОПЛАТЕ ПО АКТАМ Ф-2', sabab: 'акты Ф-2 по их подвалам не прочитаны — «К ОПЛАТЕ» рассчитано по подвалу объекта и может отличаться от суммы подписанных актов Ф-2' });
  }
  // Egasi qoidasi (2026-11-06): smeta narxi/summasi yo'q barglar — jamilar yonida «итог неполный» (smeta summa katagi formulalarda — bo'sh qoladi, ro'yxat diqqat da).
  v.narxsizOgoh(narxsizSoni(bargRows.map((i) => reja[i].q!), (q) => q.smeta_narx ?? q.smeta_summa));
  v.bosh();
  v.izoh(oyKesimi
    ? 'Принято по утвержденным актам формы № 2 — отдельно за каждый месяц; «С начала строительства» — итог за все месяцы (формула). «Можно предъявить» = выполнено по факту − принято с начала строительства. Суммы по разделам подводятся по ресурсам.'
    : 'Графы «Принято ранее», «За отчетный период» и «С начала строительства» — по утвержденным актам формы № 2. «Можно предъявить» = выполнено по факту − принято с начала строительства. Суммы по разделам подводятся по ресурсам (материалам, труду, машинам, оборудованию).');
  v.izoh('Суммы — прямые затраты (без накладных расходов и НДС). Графы «К оплате» — прямые затраты × коэффициент по виду затрат (раздел «Расчет стоимости к оплате»); расхождение с итогом расчета — только округление. Позиции с пометкой [ЗАМЕНА] / [ДОПОЛНИТЕЛЬНАЯ РАБОТА] — изменения к смете.');
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
  const { bytes } = rasmiyKitob([v, ...(zv ? [zv] : [])], { tur: 'nakopitelniy' });
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNom, hujjat: 'НАКОПИТЕЛЬНАЯ_ВЕДОМОСТЬ', davr: o.davr.slice(0, 7) }), jamilar: j, kaskad, kOplata: aktKO ?? kOplataJami };
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
