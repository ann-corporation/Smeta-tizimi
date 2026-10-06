/**
 * Studio draft → resource documents in the SAME shape the ABC / TN estimate programs produce
 * (studied from real files, 2026-10-06: «…_ALL_SM.xls» RES / RES_A / LRV, «2061_ALL.xls»):
 *
 *  LRV   — «ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ»
 *          №№ | ОБОСНОВАНИЕ | НАИМЕНОВАНИЕ РАБОТ И РЕСУРСОВ | ЕД.ИЗМ | КОЛ-ВО (НА ЕДИНИЦУ | ПО ПРОЕКТУ).
 *          Quantities only — prices live in RES (owner 2026-10-06). Work row «1» carries its quantity in NORMATIVE
 *          units (e.g. 2,5299 × 1000М3) in «НА ЕДИНИЦУ»; resource rows «1.1, 1.2…» carry resource code (KodR),
 *          norm per normative unit and quantity for the project (norm × work quantity). «РАЗДЕЛ: …» rows.
 *  RES   — «ЛОКАЛЬНАЯ РЕСУРСНАЯ СМЕТА»: header block ПРЯМЫЕ ЗАТРАТЫ / в том числе (заработная плата,
 *          эксплуатация машин, материалы, перевозка, оборудование); table
 *          №№ | РЕСУРС | ОБОСНОВАНИЕ | НАИМЕНОВАНИЕ РЕСУРСА | ЕД.ИЗМ | КОЛ-ВО | ЦЕНА | СУММА grouped
 *          ТРУДОВЫЕ РЕСУРСЫ · СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ · СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ
 *          (МЕСТНЫЕ / ИНЕРТНЫЕ / МЕТАЛЛОКОНСТРУКЦИИ / КАБЕЛЬНАЯ ПРОДУКЦИЯ, each ИТОГО + ВСЕГО) · ВСЕГО
 *          МАТЕРИАЛОВ · ОБОРУДОВАНИЕ · ВСЕГО. Machine operators' labour sits with machines (as in ABC RES).
 *  (ABC also prints RES_A — the same RES without the two code columns; owner 2026-10-06: a duplicate, not produced.)
 *
 * Every sum is a live formula; an unknown price leaves the enclosing total blank (NULL ≠ 0).
 */
import { RasmiyVaraq, rasmiyKitob, hujjatFaylNomi, type Qiymat, type RasmiyUstun } from '../hujjat-yozuvchi';
import type { DocCalc, LineCalc } from './calc';
import type { CatalogResource, EstimateDoc } from './model';
import { resourceCategory } from './export-adapter';

export type AbcHujjatOpsiya = { qurilish?: string | null; obyekt?: string | null; asos?: string | null };
type UnitText = (code: string | null) => string | null;
/** Resource units and work units live in different code spaces; one function may serve both in tests. */
export type Units = UnitText | { resource: UnitText; work: UnitText };
const unitsOf = (u: Units) => (typeof u === 'function' ? { resource: u, work: u } : u);

const n = (v: string | null | undefined) => (v == null ? null : Number(v));
const idCode = (r: CatalogResource | null) => (r as (CatalogResource & { resourceIdCode?: string | null }) | null)?.resourceIdCode ?? null;
const isOperator = (r: CatalogResource | null) => /ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ/i.test(r?.name ?? '');

/** Material sub-groups of the ABC RES, by price-collection code prefix (С140 inert, С121 metal, С157 cable). */
export function materialGroup(r: CatalogResource | null): 'МЕСТНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ' | 'ИНЕРТНЫЕ МАТЕРИАЛЫ' | 'МЕТАЛЛОКОНСТРУКЦИИ' | 'КАБЕЛЬНАЯ ПРОДУКЦИЯ' {
  const c = (r?.code ?? '').toUpperCase().replace(/^C/, 'С');
  if (/^С140-/.test(c)) return 'ИНЕРТНЫЕ МАТЕРИАЛЫ';
  if (/^С121-/.test(c)) return 'МЕТАЛЛОКОНСТРУКЦИИ';
  if (/^С157-/.test(c)) return 'КАБЕЛЬНАЯ ПРОДУКЦИЯ';
  return 'МЕСТНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ';
}
const blankSum = (col: string, a: number, b: number) => `IF(COUNTIF(${col}${a}:${col}${b},"")>0,"",SUM(${col}${a}:${col}${b}))`;
const titul = (o: AbcHujjatOpsiya, doc: EstimateDoc) => [
  ['НАИМЕНОВАНИЕ СТРОЙКИ:', o.qurilish ?? doc.context.title ?? ''] as const,
  ['НАИМЕНОВАНИЕ ОБЪЕКТА:', o.obyekt ?? doc.context.objectLabel ?? ''] as const,
];

/* ───────────────────────────── LRV ───────────────────────────── */
function lrvVaraq(doc: EstimateDoc, calc: DocCalc, units: Units, o: AbcHujjatOpsiya): RasmiyVaraq {
  const { resource: unitText, work: workUnit } = unitsOf(units);
  const U: RasmiyUstun[] = [
    { sarlavha: '№№', kenglik: 7, tur: 'tartib' },
    { sarlavha: 'ОБОСНОВАНИЕ', kenglik: 22, tur: 'kod' },
    { sarlavha: 'НАИМЕНОВАНИЕ РАБОТ И РЕСУРСОВ', kenglik: 58, tur: 'matn' },
    { sarlavha: 'ЕД.ИЗМ', kenglik: 10, tur: 'birlik' },
    { sarlavha: 'НА ЕДИНИЦУ', kenglik: 12, tur: 'norma', guruh: 'КОЛ-ВО' },
    { sarlavha: 'ПО ПРОЕКТУ', kenglik: 14, tur: 'hajm', guruh: 'КОЛ-ВО' },
  ];
  const v = new RasmiyVaraq({ nom: 'LRV', sarlavha: 'ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ', ostSarlavha: [doc.context.title || ''].filter(Boolean),
    titul: [...titul(o, doc), ['ОСНОВАНИЕ:', o.asos ?? '']], ustunlar: U, yonalish: 'landscape', muzlatUstun: 3, filtr: true });
  let work = 0;
  const stack = doc.rootOrder.map(id => ({ id, depth: 0 })).reverse();
  while (stack.length) {
    const { id, depth } = stack.pop()!;
    const s = doc.sections[id];
    v.bolim(depth === 0 ? `РАЗДЕЛ: ${s.name}` : s.name, { daraja: depth });
    for (const oid of s.items) {
      const occ = doc.occurrences[oid], c = calc.occurrences[oid];
      work++;
      const scale = n(occ.basis.scale), qty = n(occ.quantity);
      const normQty = qty != null && scale ? Math.round((qty / scale) * 1e9) / 1e9 : null;
      const unit = workUnit(occ.source.unitCode) ?? occ.basis.unitLabel ?? '';
      const wr = v.r;
      v.qator('ish', (): Qiymat[] => [String(work), occ.source.code, occ.source.name ?? '', unit,
        normQty == null ? null : { n: normQty, uslub: 'norma' }, null], { daraja: depth + 1 });
      c.lines.forEach((l: LineCalc, j) => {
        const sub = occ.overrides[l.recipeId]?.substitution;
        const perUnit = l.norm == null ? null : Number(l.norm) * Number(sub?.conversion ?? '1');
        v.qator('oddiy', (r): Qiymat[] => [`${work}.${j + 1}`, idCode(l.resource) ?? l.resource?.code ?? '',
          l.resource?.name ?? 'НЕ ОПРЕДЕЛЁН РЕСУРС (ТРЕБУЕТ ВЫБОРА)', unitText(l.resource?.unitCode ?? null) ?? '',
          perUnit == null ? null : { n: perUnit, uslub: 'norma' },
          l.quantity == null ? null : (normQty != null && perUnit != null ? { f: `ROUND(E${r}*E${wr},6)`, v: n(l.quantity) } : n(l.quantity))],
          { daraja: depth + 2, rang: null });
      });
    }
    for (let i = s.children.length - 1; i >= 0; i--) stack.push({ id: s.children[i], depth: depth + 1 });
  }
  v.filtrOxiri(v.r - 1);
  return v;
}

/* ───────────────────────────── RES ───────────────────────────── */
type ResLine = { code: string; price: string; name: string; unit: string; qty: number; unitPrice: number | null; amount: number | null };
type ResGroups = { labour: ResLine[]; machines: ResLine[]; materials: Map<string, ResLine[]>; equipment: ResLine[] };

export function resGroups(doc: EstimateDoc, calc: DocCalc, units: Units): ResGroups {
  const unitText = unitsOf(units).resource;
  const acc = new Map<string, ResLine & { bucket: string }>();
  for (const o of Object.values(doc.occurrences)) for (const l of calc.occurrences[o.id]?.lines ?? []) {
    if (!l.resource) continue;
    const kat = resourceCategory(l.resource);
    const bucket = isOperator(l.resource) || kat === 'МАШ' ? 'machines' : kat === 'ЧЕЛ' ? 'labour' : kat === 'ОБ' ? 'equipment' : 'm:' + materialGroup(l.resource);
    const unitPrice = n(l.price);
    // One RES line per resource and price (two different prices are never silently averaged).
    const key = [bucket, l.resource.code, l.resource.name, l.resource.unitCode, unitPrice ?? 'null'].join('\u0001');
    const cur = acc.get(key) ?? { bucket, code: idCode(l.resource) ?? '', price: l.resource.code ?? '', name: l.resource.name ?? '',
      unit: unitText(l.resource.unitCode) ?? '', qty: 0, unitPrice, amount: 0 };
    cur.qty = Math.round((cur.qty + (n(l.quantity) ?? 0)) * 1e7) / 1e7;
    cur.amount = cur.amount == null || l.amount == null ? null : Math.round((cur.amount + Number(l.amount)) * 100) / 100;
    acc.set(key, cur);
  }
  const g: ResGroups = { labour: [], machines: [], materials: new Map(), equipment: [] };
  const sorted = [...acc.values()].sort((a, b) => (a.code || a.price).localeCompare(b.code || b.price) || a.name.localeCompare(b.name));
  for (const x of sorted) {
    if (x.bucket === 'labour') g.labour.push(x); else if (x.bucket === 'machines') g.machines.push(x);
    else if (x.bucket === 'equipment') g.equipment.push(x);
    else { const k = x.bucket.slice(2); g.materials.set(k, [...(g.materials.get(k) ?? []), x]); }
  }
  return g;
}
const sumOf = (xs: ResLine[]) => xs.reduce<number | null>((s, x) => (s == null || x.amount == null ? null : Math.round((s + x.amount) * 100) / 100), 0);

function resVaraq(doc: EstimateDoc, g: ResGroups, o: AbcHujjatOpsiya): RasmiyVaraq {
  const U: RasmiyUstun[] = [
    { sarlavha: '№№', kenglik: 6, tur: 'tartib' }, { sarlavha: 'РЕСУРС', kenglik: 10, tur: 'kod' }, { sarlavha: 'ОБОСНОВАНИЕ', kenglik: 14, tur: 'kod' },
    { sarlavha: 'НАИМЕНОВАНИЕ РЕСУРСА', kenglik: 56, tur: 'matn' }, { sarlavha: 'ЕД.ИЗМ', kenglik: 9, tur: 'birlik' },
    { sarlavha: 'КОЛ-ВО', kenglik: 14, tur: 'hajm' }, { sarlavha: 'ЦЕНА', kenglik: 14, tur: 'narx' }, { sarlavha: 'СУММА', kenglik: 16, tur: 'pul' },
  ];
  const Q = 'F', P = 'G', S = 'H';
  const mats = [...g.materials.values()].flat();
  const val = (x: number | null) => (x == null ? 'не определено (нет цены)' : x.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' сум');
  const direct = [sumOf(g.labour), sumOf(g.machines), sumOf(mats), sumOf(g.equipment)];
  const total = direct.some(x => x == null) ? null : direct.reduce((a, b) => a! + b!, 0);
  const v = new RasmiyVaraq({ nom: 'RES', sarlavha: 'ЛОКАЛЬНАЯ РЕСУРСНАЯ СМЕТА', ostSarlavha: [doc.context.title || ''].filter(Boolean),
    titul: [...titul(o, doc), ['ПРЯМЫЕ ЗАТРАТЫ', val(total)], ['в том числе: ЗАРАБОТНАЯ ПЛАТА', val(direct[0])],
      ['ЭКСПЛУАТАЦИЯ МАШИН И МЕХАНИЗМОВ', val(direct[1])], ['СТОИМОСТЬ СТРОИТЕЛЬНЫХ МАТЕРИАЛОВ', val(direct[2])],
      ['ПЕРЕВОЗКА', 'учтена в материалах / отдельными работами'], ['ОБОРУДОВАНИЕ', val(direct[3])], ['ОСНОВАНИЕ:', o.asos ?? '']],
    ustunlar: U, yonalish: 'portrait', muzlatUstun: 4 });
  const row = (i: number, x: ResLine) => v.qator('oddiy', (r): Qiymat[] =>
    [i, x.code, x.price, x.name, x.unit, x.qty, x.unitPrice, { f: `IF(${P}${r}="","",ROUND(${Q}${r}*${P}${r},2))`, v: x.amount ?? '' }], { rang: null });
  const label = (t: string, sum: { f: string; v: number | string }, tur: 'jami' | 'vsego' = 'jami') => v.qator(tur, (): Qiymat[] =>
    ['', '', '', t, 'СУМ', null, null, sum]);
  const group = (title: string, xs: ResLine[], withVsego = false) => {
    if (!xs.length) return null;
    v.bolim(title);
    const a = v.r; xs.forEach((x, i) => row(i + 1, x)); const b = v.r - 1;
    const s = sumOf(xs);
    const r1 = label('ИТОГО', { f: blankSum(S, a, b), v: s ?? '' });
    if (withVsego) label('ВСЕГО', { f: `${S}${r1}`, v: s ?? '' });
    v.bosh();
    return r1;
  };
  const totals: number[] = [];
  const t1 = group('ТРУДОВЫЕ РЕСУРСЫ', g.labour); if (t1) totals.push(t1);
  const t2 = group('СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ', g.machines); if (t2) totals.push(t2);
  if (mats.length) {
    v.bolim('СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ');
    const sub: number[] = [];
    for (const k of ['МЕСТНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ', 'ИНЕРТНЫЕ МАТЕРИАЛЫ', 'МЕТАЛЛОКОНСТРУКЦИИ', 'КАБЕЛЬНАЯ ПРОДУКЦИЯ']) {
      const r = group(k, g.materials.get(k) ?? [], true); if (r) sub.push(r);
    }
    const m = label('ВСЕГО МАТЕРИАЛОВ', { f: sub.length ? `IF(OR(${sub.map(r => `${S}${r}=""`).join(',')}),"",${sub.map(r => `${S}${r}`).join('+')})` : '0', v: sumOf(mats) ?? '' }, 'vsego');
    totals.push(m); v.bosh();
  }
  const t4 = group('ОБОРУДОВАНИЕ', g.equipment); if (t4) totals.push(t4);
  if (totals.length) label('ВСЕГО', { f: `IF(OR(${totals.map(r => `${S}${r}=""`).join(',')}),"",${totals.map(r => `${S}${r}`).join('+')})`, v: total ?? '' }, 'vsego');
  return v;
}

/** One workbook: LRV + RES — the resource documents an ABC/TN smeta is delivered with. */
export function abcHujjat(doc: EstimateDoc, calc: DocCalc, unitText: Units, o: AbcHujjatOpsiya = {}) {
  if (!Object.keys(doc.occurrences).length) throw new Error('LRV_BOSH');
  const g = resGroups(doc, calc, unitText);
  const kitob = rasmiyKitob([lrvVaraq(doc, calc, unitText, o), resVaraq(doc, g, o)], { tur: 'lrv' });
  return { bytes: kitob.bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyekt ?? doc.context.objectLabel ?? 'Smeta', hujjat: 'ЛРВ_RES', davr: new Date().toISOString().slice(0, 10) }), groups: g };
}
