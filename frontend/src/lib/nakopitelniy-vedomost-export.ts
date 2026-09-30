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
  RasmiyVaraq, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, yaxlit2,
  type ImzoNomlar, type Qiymat, type RasmiyUstun,
} from './hujjat-yozuvchi';
import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import {
  NAKRUTKA_KATLAR, kOplate, kategoriyaKf, nakrutkaKat, nakrutkaPodvaliYoz, podvalKfQatorlari,
  type KatSummalar, type NakrutkaHisobJS,
} from './nakrutka-podval';

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
  /** Smeta nakrutka kaskadi (RPC jami.smeta_nakrutka) — izohda ko'rsatiladi. */
  smetaNakrutka?: SmetaNakrutka | null;
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

const USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Шифр, код', kenglik: 13, tur: 'kod' },
  { sarlavha: 'Наименование работ и затрат', kenglik: 44, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 8, tur: 'birlik' },
  { sarlavha: 'кол-во', kenglik: 11, tur: 'hajm', guruh: 'ПО СМЕТЕ' },
  { sarlavha: 'цена, сум', kenglik: 13, tur: 'narx', guruh: 'ПО СМЕТЕ' },
  { sarlavha: 'сумма, сум', kenglik: 15, tur: 'pul', guruh: 'ПО СМЕТЕ' },
  { sarlavha: 'Выполнено (факт), кол-во', kenglik: 11, tur: 'hajm' },
  { sarlavha: 'кол-во', kenglik: 11, tur: 'hajm', guruh: 'ПРИНЯТО РАНЕЕ' },
  { sarlavha: 'сумма, сум', kenglik: 15, tur: 'pul', guruh: 'ПРИНЯТО РАНЕЕ' },
  { sarlavha: 'кол-во', kenglik: 11, tur: 'hajm', guruh: 'ЗА ОТЧЕТНЫЙ ПЕРИОД' },
  { sarlavha: 'сумма, сум', kenglik: 15, tur: 'pul', guruh: 'ЗА ОТЧЕТНЫЙ ПЕРИОД' },
  { sarlavha: 'кол-во', kenglik: 11, tur: 'hajm', guruh: 'С НАЧАЛА СТРОИТЕЛЬСТВА' },
  { sarlavha: 'сумма, сум', kenglik: 15, tur: 'pul', guruh: 'С НАЧАЛА СТРОИТЕЛЬСТВА' },
  { sarlavha: 'кол-во', kenglik: 11, tur: 'hajm', guruh: 'ОСТАТОК ПО СМЕТЕ' },
  { sarlavha: 'сумма, сум', kenglik: 15, tur: 'pul', guruh: 'ОСТАТОК ПО СМЕТЕ' },
  { sarlavha: 'Можно предъявить (факт − принято), кол-во', kenglik: 13, tur: 'hajm' },
  { sarlavha: 'за отчетный период, сум', kenglik: 16, tur: 'pul', guruh: 'К ОПЛАТЕ (с накладными расходами и НДС)' },
  { sarlavha: 'с начала строительства, сум', kenglik: 16, tur: 'pul', guruh: 'К ОПЛАТЕ (с накладными расходами и НДС)' },
  // Yashirin texnik ustun: kategoriya (ЧЕЛ/МАШ/МАТ/ОБ/КАБ/М/К) — podval SUMIF i uchun.
  { sarlavha: 'Кат.', kenglik: 6, tur: 'texnik', yashirin: true },
  // Yashirin belgi: 1 — resurs (barg) qatori. Jamilar SUMIF(U,1,…) oralig'i bilan
  // (Excel funksiyasi ≤ 255 argument — katta bo'limda katak ro'yxati sig'maydi).
  { sarlavha: 'Т', kenglik: 4, tur: 'texnik', yashirin: true },
];
// Ustun harflari: A№ B kod C nom D birlik E smHajm F smNarx G smSumma H fakt
// I ranHajm J ranSumma K perHajm L perSumma M jamiHajm N jamiSumma O ostHajm P ostSumma Q mozhno
// R kOplataPeriod S kOplataJami T kat(yashirin) U barg belgisi (yashirin).
const KAT_USTUN = 'T';
const BARG_BELGI = 'U';
const PUL = ['G', 'J', 'L', 'N', 'P'] as const;

export type NakopitelniyJamilar = { smeta: number | null; oldingi: number; joriy: number; jami: number; qoldiq: number | null };

/** Hujjat jamilari — barglar bo'yicha (UI shu sonni ko'rsatadi, Excel ВСЕГО bilan teng). */
export function nakopitelniyJamilar(qatorlar: readonly NakopitelniyQator[]): NakopitelniyJamilar {
  let smeta: number | null = 0, oldingi = 0, joriy = 0;
  for (const q of qatorlar) {
    if (!BARG.has(q.tur)) continue;
    smeta = smeta == null || q.smeta_summa == null ? null : smeta + q.smeta_summa;
    oldingi += q.oldingi_summa;
    joriy += q.joriy_summa;
  }
  const r = (x: number) => x;
  const jami = r(oldingi + joriy);
  return { smeta: smeta == null ? null : r(smeta), oldingi: r(oldingi), joriy: r(joriy), jami, qoldiq: smeta == null ? null : r(smeta - jami) };
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
  const v = new RasmiyVaraq({
    nom: 'Накопительная ведомость',
    sarlavha: 'НАКОПИТЕЛЬНАЯ ВЕДОМОСТЬ ВЫПОЛНЕННЫХ РАБОТ',
    ostSarlavha: [`за отчетный период: ${davrMatni(o.davr)} (учтены только утвержденные акты формы № 2)`],
    titul: [['Объект:', o.obyektNom], ['Заказчик:', o.imzo?.zakazchik], ['Подрядчик:', o.imzo?.pudratchi]],
    ustunlar: USTUNLAR,
    yonalish: 'landscape',
  });
  const bosh = v.malumotBoshi;
  // Qatorlar RPC tartibida keladi, lekin bo'lim chegarasi "keyingi RZ gacha"
  // emas. `ota_id` mavjud bo'lsa, aynan canonical daraxtdan plan quriladi;
  // shuning uchun ichma-ich RZ lar bir-birini yopib yubormaydi. Parent metadata
  // berilmagan eski RPC uchun depth-stack fallback saqlanadi.
  type Rej = { tur: 'rz' | 'bl' | 'barg' | 'itogo' | 'vsego'; q?: NakopitelniyQator; bolalar: number[]; nom?: string; daraja?: number };
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
        if (node.q.daraja == null) node.daraja = node.tur === 'rz' ? 0 : 0;
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

  const reja: Rej[] = [];
  const bargRows: number[] = [];
  let no = 0;
  const diqqat: Array<{ nom: string; sabab: string }> = [];
  const emit = (node: PlanNode): number => {
    const i = reja.length;
    const row: Rej = { tur: node.tur, q: node.q, bolalar: [], daraja: node.daraja };
    reja.push(row);
    if (node.tur === 'barg') {
      bargRows.push(i);
      const q = node.q;
      if (q.smeta_hajm == null || q.smeta_summa == null) diqqat.push({ nom: `${q.nom ?? ''}${q.birlik ? `, ${q.birlik}` : ''}`, sabab: 'нет объема или стоимости по смете — остаток не определен' });
      if (!nakrutkaKat(q.kat)) diqqat.push({ nom: `${q.nom ?? ''}${q.birlik ? `, ${q.birlik}` : ''}`, sabab: 'не указан вид затрат (ЧЕЛ/МАШ/МАТ/ОБ/КАБ/М/К) — стоимость к оплате не определена' });
      const mozhno = q.fakt_hajm - (q.oldingi_hajm + q.joriy_hajm);
      if (mozhno < -1e-9) diqqat.push({ nom: `${q.nom ?? ''}${q.birlik ? `, ${q.birlik}` : ''}`, sabab: `принято по актам больше, чем выполнено по факту (на ${fmt(-mozhno)})` });
      return i;
    }
    row.bolalar = node.bolalar.map(emit);
    if (node.tur === 'rz' && row.bolalar.length) {
      reja.push({ tur: 'itogo', bolalar: row.bolalar, nom: `ИТОГО ПО РАЗДЕЛУ: ${node.q.nom ?? ''}`, daraja: node.daraja + 1 });
    }
    return i;
  };
  roots.forEach(emit);
  // bo'sh bl (bargsiz) — hujjatda qoladi (hajmlari bor), puli bo'sh.
  const j = nakopitelniyJamilar(qatorlar);
  const rowOf = (i: number) => bosh + i;
  // Ikki narx: to'g'ri xarajat (G…P) va к оплате (R, S) = ROUND(summa × Kf[kat], 2).
  const nk: Partial<NakrutkaKoeffitsientlar> = { ...(o.nakrutka ?? {}) };
  if (o.ndsFoiz != null && Number.isFinite(o.ndsFoiz) && o.ndsFoiz >= 0) nk.НДС = o.ndsFoiz;
  const kfJS = kategoriyaKf(nk);
  // Podval ВСЕГО dan keyin bitta bo'sh qatordan so'ng boshlanadi.
  const podvalBosh = bosh + reja.length + 2;
  const kfQ = podvalKfQatorlari(podvalBosh);
  const koOf = (q: NakopitelniyQator) => {
    const kat = nakrutkaKat(q.kat);
    return { kat, per: kOplate(q.joriy_summa, kat, kfJS), jami: kOplate(q.oldingi_summa + q.joriy_summa, kat, kfJS) };
  };
  /** Barglar (idx) yig'indisi — oraliq + belgi bo'yicha; bittasi bo'sh bo'lsa bo'sh (NULL ≠ 0). */
  const yig = (c: string, idx: readonly number[], val: number | null): Qiymat => {
    if (!idx.length) return null;
    const a = rowOf(Math.min(...idx)), b = rowOf(Math.max(...idx));
    const rng = `${c}${a}:${c}${b}`, m = `${BARG_BELGI}${a}:${BARG_BELGI}${b}`;
    return { f: `IF(COUNTIFS(${m},1,${rng},"")>0,"",SUMIF(${m},1,${rng}))`, v: val == null ? '' : yaxlit2(val) };
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
    return yig(c, bl, vals.some((x) => x == null) ? null : vals.reduce<number>((a2, b2) => a2 + (b2 ?? 0), 0));
  };
  const koSum = (idx: readonly number[], c: 'R' | 'S'): Qiymat => {
    const bl = bargIdx(idx);
    const vals = bl.map((k) => koQiymat(k, c));
    return yig(c, bl, vals.some((x) => x == null) ? null : vals.reduce<number>((a2, b2) => a2 + (b2 ?? 0), 0));
  };
  const koMemo = new Map<string, number | null>();
  function koQiymat(k: number, c: 'R' | 'S'): number | null {
    const key = `${k}${c}`;
    if (koMemo.has(key)) return koMemo.get(key)!;
    const x = reja[k];
    let val: number | null;
    if (x.tur === 'barg') { const ko = koOf(x.q!); val = c === 'R' ? ko.per : ko.jami; }
    else { const vs = x.bolalar.map((b2) => koQiymat(b2, c)); val = !x.bolalar.length || vs.some((z) => z == null) ? null : yaxlit2(vs.reduce<number>((a2, b2) => a2 + (b2 ?? 0), 0)); }
    koMemo.set(key, val);
    return val;
  }
  const n = (x: number | null | undefined): Qiymat => (x == null ? null : x);
  reja.forEach((x, i) => {
    let r = 0;
    const q = x.q;
    if (x.tur === 'rz') r = v.bolim(q!.nom ?? '', { daraja: x.daraja ?? 0 });
    else if (x.tur === 'barg' || x.tur === 'bl') {
      const barg = x.tur === 'barg';
      const tartib = barg ? '' : String(++no);
      const sum = (c: string) => pulYig(c, x.bolalar);
      r = v.qator(barg ? 'oddiy' : 'ish', (rr) => [
        barg ? tartib : tartib, q!.kod ?? '', nomIzohBilan(q!.nom ?? '', q!.ozgarish_izoh), q!.birlik ?? '',
        n(q!.smeta_hajm), barg ? n(q!.smeta_narx) : null,
        barg ? n(q!.smeta_summa) : sum('G'),
        q!.fakt_hajm,
        q!.oldingi_hajm, barg ? q!.oldingi_summa : sum('J'),
        q!.joriy_hajm, barg ? q!.joriy_summa : sum('L'),
        { f: `I${rr}+K${rr}`, v: q!.oldingi_hajm + q!.joriy_hajm },
        barg ? { f: `J${rr}+L${rr}`, v: q!.oldingi_summa + q!.joriy_summa } : sum('N'),
        { f: `IF(E${rr}="","",E${rr}-M${rr})`, v: q!.smeta_hajm == null ? '' : q!.smeta_hajm - (q!.oldingi_hajm + q!.joriy_hajm) },
        barg || x.bolalar.length ? { f: `IF(G${rr}="","",G${rr}-N${rr})`, v: pulOstatok(x, reja) } : null,
        { f: `H${rr}-M${rr}`, v: q!.fakt_hajm - (q!.oldingi_hajm + q!.joriy_hajm) },
        ...(barg ? ((): Qiymat[] => {
          const ko = koOf(q!);
          if (!ko.kat) return [null, null, null, 1];
          const kf = `F${kfQ[ko.kat]}`;
          return [{ f: `ROUND(L${rr}*${kf},2)`, v: ko.per ?? '' }, { f: `ROUND(N${rr}*${kf},2)`, v: ko.jami ?? '' }, ko.kat, 1];
        })() : [koSum(x.bolalar, 'R'), koSum(x.bolalar, 'S'), null, null]),
      ], { daraja: x.daraja ?? (barg ? 2 : 1) });
    } else {
      r = v.qator('jami', (rr) => {
        const cells: Qiymat[] = Array(USTUNLAR.length).fill(null);
        cells[2] = x.nom;
        for (const c of PUL) {
          const col = c.charCodeAt(0) - 65;
          if (c === 'P') { cells[col] = { f: `IF(G${rr}="","",G${rr}-N${rr})`, v: bolimOstatok(x, reja) }; continue; }
          cells[col] = pulYig(c, x.bolalar);
        }
        cells[17] = koSum(x.bolalar, 'R');
        cells[18] = koSum(x.bolalar, 'S');
        return cells;
      }, { daraja: x.daraja ?? 0 });
    }
    if (r !== rowOf(i)) throw new Error('NAKOPITELNIY_QATOR_SILJIDI');
  });
  let kaskad: Record<string, NakrutkaHisobJS> | null = null;
  let kOplataJami: { davr: number | null; jami: number | null } = { davr: null, jami: null };
  if (bargRows.length) {
    // ВСЕГО — barcha barglar (bo'limsiz barglar ham) SUMIF bilan.
    v.qator('vsego', (rr) => {
      const cells: Qiymat[] = Array(USTUNLAR.length).fill(null);
      cells[2] = 'ВСЕГО ПО ОБЪЕКТУ';
      cells[6] = pulYig('G', bargRows);
      cells[9] = pulYig('J', bargRows);
      cells[11] = pulYig('L', bargRows);
      cells[13] = pulYig('N', bargRows);
      cells[15] = { f: `IF(G${rr}="","",G${rr}-N${rr})`, v: j.qoldiq ?? '' };
      cells[17] = koSum(bargRows, 'R');
      cells[18] = koSum(bargRows, 'S');
      return cells;
    });
    const vs = (c: 'R' | 'S') => { const x = bargRows.map((i) => koQiymat(i, c)); return x.some((z) => z == null) ? null : yaxlit2(x.reduce<number>((a2, b2) => a2 + (b2 ?? 0), 0)); };
    kOplataJami = { davr: vs('R'), jami: vs('S') };
    v.bosh();
    // Nakrutka podvali — har pul ustuni uchun (смета, ранее, за период, с начала, остаток).
    const katSummalar: Record<string, KatSummalar> = {};
    for (const c of PUL) {
      const ks = Object.fromEntries(NAKRUTKA_KATLAR.map((k) => [k, 0])) as KatSummalar;
      for (const i of bargRows) {
        const q = reja[i].q!;
        const kat = nakrutkaKat(q.kat);
        if (!kat) continue;
        const val = c === 'P' ? (q.smeta_summa == null ? 0 : q.smeta_summa - (q.oldingi_summa + q.joriy_summa)) : (pulOf(q, c) ?? 0);
        ks[kat] += val;
      }
      katSummalar[c] = ks;
    }
    const p = nakrutkaPodvaliYoz(v, { katUstun: KAT_USTUN, oraliq: [bosh, bosh + reja.length - 1], pulUstunlar: PUL, foizUstun: 'F', nk, katSummalar });
    if (p.bosh !== podvalBosh) throw new Error('NAKOPITELNIY_PODVAL_SILJIDI');
    kaskad = p.kaskad;
  }
  v.bosh();
  v.izoh('Графы «Принято ранее», «За отчетный период» и «С начала строительства» — по утвержденным актам формы № 2. «Можно предъявить» = выполнено по факту − принято с начала строительства. Суммы по разделам подводятся по ресурсам (материалам, труду, машинам, оборудованию).');
  v.izoh('Графы 7, 10, 12, 14, 16 — прямые затраты (без накладных расходов и НДС). Графы 18–19 — стоимость к оплате: прямые затраты × коэффициент по виду затрат (ниже, раздел «Расчет стоимости к оплате»); расхождение с итогом расчета — только округление.');
  if (!o.nakrutka || !Object.keys(o.nakrutka).length) diqqat.push({ nom: 'Проценты накладных и прочих расходов', sabab: 'не заданы для объекта (договора) — в расчете приняты 0 %; стоимость к оплате отличается от прямых затрат только НДС' });
  const sn = o.smetaNakrutka;
  if (sn) {
    v.izoh(`Сметная стоимость объекта: прямые затраты ${fmt2(sn.pryamye)} сум; с накладными расходами и прочими затратами (без НДС) ${fmt2(sn.itogo4)} сум; НДС${sn.nds_foiz != null ? ` ${String(sn.nds_foiz).replace('.', ',')} %` : ''} ${fmt2(sn.nds)} сум; всего с НДС ${fmt2(sn.vsego)} сум.`);
  }
  v.diqqat(diqqat);
  v.imzo(imzoTomonlari(['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'СОСТАВИЛ'], o.imzo));
  const { bytes } = rasmiyKitob([v]);
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNom, hujjat: 'НАКОПИТЕЛЬНАЯ_ВЕДОМОСТЬ', davr: o.davr.slice(0, 7) }), jamilar: j, kaskad, kOplata: kOplataJami };
}

function pulOf(q: NakopitelniyQator, c: string): number | null {
  switch (c) {
    case 'G': return q.smeta_summa;
    case 'J': return q.oldingi_summa;
    case 'L': return q.joriy_summa;
    case 'N': return q.oldingi_summa + q.joriy_summa;
    default: return null;
  }
}

type RejX = { tur: string; q?: NakopitelniyQator; bolalar: number[] };
function pulOstatok(x: RejX, reja: readonly RejX[]): number | string {
  if (x.tur === 'barg') return x.q!.smeta_summa == null ? '' : x.q!.smeta_summa - (x.q!.oldingi_summa + x.q!.joriy_summa);
  return bolimOstatok(x, reja);
}
function bolimOstatok(x: RejX, reja: readonly RejX[]): number | string {
  if (x.bolalar.some((k) => reja[k].q!.smeta_summa == null)) return '';
  const g = (x.bolalar.reduce((s, k) => s + (reja[k].q!.smeta_summa ?? 0), 0));
  const nn = (x.bolalar.reduce((s, k) => s + reja[k].q!.oldingi_summa + reja[k].q!.joriy_summa, 0));
  return g - nn;
}

function fmt2(x: number): string {
  return x.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmt(x: number): string {
  return x.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}
