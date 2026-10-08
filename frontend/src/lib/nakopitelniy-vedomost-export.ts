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
  RasmiyVaraq, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, ustunHarfi, yaxlit2,
  type ImzoNomlar, type Qiymat, type RasmiyUstun,
} from './hujjat-yozuvchi';
import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import {
  NAKRUTKA_KATLAR, kOplate, kategoriyaKf, nakrutkaKat, nakrutkaPodvaliYoz, podvalKfQatorlari,
  type KatSummalar, type NakrutkaHisobJS,
} from './nakrutka-podval';
import { podvalgaKoefQoy, type Podval } from './nakrutka-konstruktor';
import { narxBildirishnomaKerak } from './narx-bildirishnoma';

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
  /** Maxsus nakrutka podvali (konstruktor) — null: standart kaskad. */
  podval?: Podval | null;
  /** Smeta nakrutka kaskadi (RPC jami.smeta_nakrutka) — izohda ko'rsatiladi. */
  smetaNakrutka?: SmetaNakrutka | null;
  /** Oy kesimi (egasi 2026-09-30): har tasdiqlangan F2 oyi alohida ustun + ИТОГО. Berilmasa — "ранее / за период". */
  oylar?: NakopitelniyOylar | null;
}

/** Tasdiqlangan F2 qatorlari oy bo'yicha: oylar — 'YYYY-MM' o'sish tartibida (oxirgisi — hisobot davri). */
export interface NakopitelniyOylar {
  oylar: string[];
  qiymat: ReadonlyMap<number, ReadonlyMap<string, { hajm: number; summa: number }>>;
}

/** НДС stavkasi sukuti (egasi qarori Q2): 12 %, o'zgartiriladi. */
export const NDS_SUKUT_FOIZ = 12;

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
type DavrUstun = { sarlavha: string; hajm: (q: NakopitelniyQator) => number; summa: (q: NakopitelniyQator) => number };

/** Ustunlar va ularning harflari — davrlar soniga qarab (egasi 2026-09-30: har oy alohida ustun + ИТОГО). */
function ustunRejasi(davrlar: readonly DavrUstun[]) {
  const u: RasmiyUstun[] = [
    { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
    { sarlavha: 'Шифр, код', kenglik: 13, tur: 'kod' },
    { sarlavha: 'Наименование работ и затрат', kenglik: 44, tur: 'matn' },
    { sarlavha: 'Ед. изм.', kenglik: 8, tur: 'birlik' },
    { sarlavha: 'кол-во', kenglik: 11, tur: 'hajm', guruh: 'ПО СМЕТЕ' },
    { sarlavha: 'цена, сум', kenglik: 13, tur: 'narx', guruh: 'ПО СМЕТЕ' },
    { sarlavha: 'сумма, сум', kenglik: 15, tur: 'pul', guruh: 'ПО СМЕТЕ' },
    { sarlavha: 'Выполнено (факт), кол-во', kenglik: 11, tur: 'hajm' },
  ];
  const davrH: string[] = [], davrS: string[] = [];
  for (const d of davrlar) {
    davrH.push(ustunHarfi(u.length)); u.push({ sarlavha: 'кол-во', kenglik: 11, tur: 'hajm', guruh: d.sarlavha });
    davrS.push(ustunHarfi(u.length)); u.push({ sarlavha: 'сумма, сум', kenglik: 15, tur: 'pul', guruh: d.sarlavha });
  }
  const at = (s: RasmiyUstun) => { const h = ustunHarfi(u.length); u.push(s); return h; };
  const JAMI_GURUH = davrlar.length > 2 || !davrlar[0]?.sarlavha.startsWith('ПРИНЯТО') ? 'С НАЧАЛА СТРОИТЕЛЬСТВА (ИТОГО ЗА ВСЕ МЕСЯЦЫ)' : 'С НАЧАЛА СТРОИТЕЛЬСТВА';
  const jamiH = at({ sarlavha: 'кол-во', kenglik: 11, tur: 'hajm', guruh: JAMI_GURUH });
  const jamiS = at({ sarlavha: 'сумма, сум', kenglik: 15, tur: 'pul', guruh: JAMI_GURUH });
  const ostH = at({ sarlavha: 'кол-во', kenglik: 11, tur: 'hajm', guruh: 'ОСТАТОК ПО СМЕТЕ' });
  const ostS = at({ sarlavha: 'сумма, сум', kenglik: 15, tur: 'pul', guruh: 'ОСТАТОК ПО СМЕТЕ' });
  const mozhno = at({ sarlavha: 'Можно предъявить (факт − принято), кол-во', kenglik: 13, tur: 'hajm' });
  const koPer = at({ sarlavha: 'за отчетный период, сум', kenglik: 16, tur: 'pul', guruh: 'К ОПЛАТЕ (с накладными расходами и НДС)' });
  const koJami = at({ sarlavha: 'с начала строительства, сум', kenglik: 16, tur: 'pul', guruh: 'К ОПЛАТЕ (с накладными расходами и НДС)' });
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
      summa: (q) => m.qiymat.get(q.qator_id)?.get(oy)?.summa ?? 0,
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
  for (const q of qatorlar) {
    if (!BARG.has(q.tur)) continue;
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
): { bytes: Uint8Array; faylNomi: string; jamilar: NakopitelniyJamilar; kaskad: Record<string, NakrutkaHisobJS> | null; kOplata: { davr: number | null; jami: number | null } } {
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

  /** Qator bo'yicha: davrlar yig'indisi (с начала) va hisobot davri (oxirgi davr). */
  const jamiH = (q: NakopitelniyQator) => davrlar.reduce((s, d) => s + d.hajm(q), 0);
  const jamiS = (q: NakopitelniyQator) => davrlar.reduce((s, d) => s + d.summa(q), 0);
  const perS = (q: NakopitelniyQator) => davrlar[davrlar.length - 1].summa(q);

  const reja: Rej[] = [];
  const bargRows: number[] = [];
  let no = 0;
  const diqqat: Array<{ nom: string; sabab: string }> = [];
  const nomi = (q: NakopitelniyQator) => `${q.nom ?? ''}${q.birlik ? `, ${q.birlik}` : ''}`;
  const emit = (node: PlanNode, ota?: number): number => {
    const i = reja.length;
    const row: Rej = { tur: node.tur, q: node.q, bolalar: [], daraja: node.daraja, ota };
    reja.push(row);
    if (node.tur === 'barg') {
      bargRows.push(i);
      const q = node.q;
      if (q.smeta_hajm == null || (q.smeta_summa == null && narxBildirishnomaKerak(q, null))) diqqat.push({ nom: nomi(q), sabab: 'нет объема или стоимости по смете — строка не включена в сумму' });
      if (!nakrutkaKat(q.kat)) diqqat.push({ nom: nomi(q), sabab: 'не указан вид затрат (ЧЕЛ/МАШ/МАТ/ОБ/КАБ/М/К) — стоимость к оплате не определена' });
      const mozhno = q.fakt_hajm - jamiH(q);
      if (mozhno < -1e-9) diqqat.push({ nom: nomi(q), sabab: `принято по актам больше, чем выполнено по факту (на ${fmt(-mozhno)})` });
      // Oy kesimi RPC jamisi bilan mos bo'lishi shart — farq bo'lsa ochiq aytiladi (to'qilmaydi).
      if (oyKesimi && Math.abs(jamiS(q) - (q.oldingi_summa + q.joriy_summa)) > 0.01) {
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
  const podval = o.podval ? podvalgaKoefQoy(o.podval, nk) : null;
  const kfJS = kategoriyaKf(nk, podval);
  const podvalBosh = bosh + reja.length + 2;
  const kfQ = podvalKfQatorlari(podvalBosh, podval);
  const koOf = (q: NakopitelniyQator) => {
    const kat = nakrutkaKat(q.kat);
    return { kat, per: kOplate(perS(q), kat, kfJS), jami: kOplate(jamiS(q), kat, kfJS) };
  };
  /** Pul ustuni qiymati (barg). */
  const pulOf = (q: NakopitelniyQator, c: string): number | null => {
    if (c === 'G') return q.smeta_summa;
    if (c === U.jamiS) return jamiS(q);
    const k = U.davrS.indexOf(c);
    return k >= 0 ? davrlar[k].summa(q) : null;
  };
  /** Barglar (idx) yig'indisi — oraliq + belgi bo'yicha; narxsiz barg jamini bo'shatmaydi (egasi qoidasi). */
  const yig = (c: string, idx: readonly number[], val: number | null): Qiymat => {
    if (!idx.length) return null;
    const a = rowOf(Math.min(...idx)), b = rowOf(Math.max(...idx));
    const rng = `${c}${a}:${c}${b}`, m = `${U.belgi}${a}:${U.belgi}${b}`;
    return { f: `SUMIF(${m},1,${rng})`, v: yaxlit2(val ?? 0) };
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
    return bl.reduce((s, k) => s + (reja[k].q!.smeta_summa ?? 0) - jamiS(reja[k].q!), 0);
  };
  const n = (x: number | null | undefined): Qiymat => (x == null ? null : x);
  const col = (h: string) => U.idx(h);
  const jamiHF = (rr: number) => U.davrH.map((h) => `${h}${rr}`).join('+');
  const jamiSF = (rr: number) => U.davrS.map((h) => `${h}${rr}`).join('+');
  reja.forEach((x, i) => {
    let r = 0;
    const q = x.q;
    if (x.tur === 'rz') r = v.bolim(nomIzohBilan(q!.nom ?? '', q!.ozgarish_izoh), { daraja: x.daraja ?? 0 });
    else if (x.tur === 'barg' || x.tur === 'bl') {
      const barg = x.tur === 'barg';
      const tartib = barg ? '' : String(++no);
      r = v.qator(barg ? 'oddiy' : 'ish', (rr) => {
        const c: Qiymat[] = Array(U.ustunlar.length).fill(null);
        c[0] = tartib; c[1] = q!.kod ?? ''; c[2] = nomIzohBilan(q!.nom ?? '', q!.ozgarish_izoh); c[3] = q!.birlik ?? '';
        // Egasi 2026-09-30: tirik smeta — ish hajmi (E) o'zgarsa resurs hajmi = norma × ish hajmi,
        // resurs summasi = hajm × narx (F2 ustunlari esa hujjatdagidek, qiymat).
        const ota = barg && x.ota != null ? reja[x.ota] : undefined;
        const normaF = barg && q!.norma != null && ota?.tur === 'bl' && ota.q?.smeta_hajm != null && q!.smeta_hajm != null;
        c[4] = normaF ? { f: `ROUND(${q!.norma}*E${rowOf(x.ota!)},6)`, v: q!.smeta_hajm! } : n(q!.smeta_hajm);
        c[5] = barg ? n(q!.smeta_narx) : null;
        c[6] = barg
          ? (q!.smeta_narx != null && q!.smeta_hajm != null && q!.smeta_summa != null ? { f: `IF(OR(E${rr}="",F${rr}=""),"",ROUND(E${rr}*F${rr},2))`, v: q!.smeta_summa } : n(q!.smeta_summa))
          : pulYig('G', x.bolalar);
        c[7] = q!.fakt_hajm;
        davrlar.forEach((d, k) => {
          c[col(U.davrH[k])] = d.hajm(q!);
          c[col(U.davrS[k])] = barg ? d.summa(q!) : pulYig(U.davrS[k], x.bolalar);
        });
        const jh = jamiH(q!);
        c[col(U.jamiH)] = { f: jamiHF(rr), v: jh };
        c[col(U.jamiS)] = barg ? { f: jamiSF(rr), v: jamiS(q!) } : pulYig(U.jamiS, x.bolalar);
        c[col(U.ostH)] = { f: `IF(E${rr}="","",E${rr}-${U.jamiH}${rr})`, v: q!.smeta_hajm == null ? '' : q!.smeta_hajm - jh };
        c[col(U.ostS)] = barg || x.bolalar.length ? { f: `IF(G${rr}="","",G${rr}-${U.jamiS}${rr})`, v: barg ? (q!.smeta_summa == null ? '' : q!.smeta_summa - jamiS(q!)) : ostatok(x.bolalar) } : null;
        c[col(U.mozhno)] = { f: `H${rr}-${U.jamiH}${rr}`, v: q!.fakt_hajm - jh };
        if (barg) {
          const ko = koOf(q!);
          if (ko.kat) {
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
      }, { daraja: x.daraja ?? (barg ? 2 : 1) });
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
  let kaskad: Record<string, NakrutkaHisobJS> | null = null;
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
        if (!kat) continue;
        ks[kat] += p === U.ostS ? (q.smeta_summa == null ? 0 : q.smeta_summa - jamiS(q)) : (pulOf(q, p) ?? 0);
      }
      katSummalar[p] = ks;
    }
    const p = nakrutkaPodvaliYoz(v, { podval, katUstun: U.kat, oraliq: [bosh, bosh + reja.length - 1], pulUstunlar: U.pul, foizUstun: 'F', nk, katSummalar });
    if (p.bosh !== podvalBosh) throw new Error('NAKOPITELNIY_PODVAL_SILJIDI');
    kaskad = p.kaskad;
  }
  v.bosh();
  v.izoh(oyKesimi
    ? 'Принято по утвержденным актам формы № 2 — отдельно за каждый месяц; «С начала строительства» — итог за все месяцы (формула). «Можно предъявить» = выполнено по факту − принято с начала строительства. Суммы по разделам подводятся по ресурсам.'
    : 'Графы «Принято ранее», «За отчетный период» и «С начала строительства» — по утвержденным актам формы № 2. «Можно предъявить» = выполнено по факту − принято с начала строительства. Суммы по разделам подводятся по ресурсам (материалам, труду, машинам, оборудованию).');
  v.izoh('Суммы — прямые затраты (без накладных расходов и НДС). Графы «К оплате» — прямые затраты × коэффициент по виду затрат (раздел «Расчет стоимости к оплате»); расхождение с итогом расчета — только округление. Позиции с пометкой [ЗАМЕНА] / [ДОПОЛНИТЕЛЬНАЯ РАБОТА] — изменения к смете.');
  if (!o.nakrutka || !Object.keys(o.nakrutka).length) diqqat.push({ nom: 'Проценты накладных и прочих расходов', sabab: 'не заданы для объекта (договора) — в расчете приняты 0 %; стоимость к оплате отличается от прямых затрат только НДС' });
  const sn = o.smetaNakrutka;
  if (sn) {
    v.izoh(`Сметная стоимость объекта: прямые затраты ${fmt2(sn.pryamye)} сум; с накладными расходами и прочими затратами (без НДС) ${fmt2(sn.itogo4)} сум; НДС${sn.nds_foiz != null ? ` ${String(sn.nds_foiz).replace('.', ',')} %` : ''} ${fmt2(sn.nds)} сум; всего с НДС ${fmt2(sn.vsego)} сум.`);
  }
  v.diqqat(diqqat);
  v.imzo(imzoTomonlari(['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'СОСТАВИЛ'], o.imzo));
  const { bytes } = rasmiyKitob([v], { tur: 'nakopitelniy' });
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNom, hujjat: 'НАКОПИТЕЛЬНАЯ_ВЕДОМОСТЬ', davr: o.davr.slice(0, 7) }), jamilar: j, kaskad, kOplata: kOplataJami };
}

function fmt2(x: number): string {
  return x.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmt(x: number): string {
  return x.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}
