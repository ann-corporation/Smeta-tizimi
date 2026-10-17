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
import { NARX_YOQ_SABAB, narxBildirishnomaKerak } from '../narx-bildirishnoma';
import { NAKRUTKA_KATLAR, nakrutkaPodvaliYoz, type KatSummalar, type NakrutkaKat } from '../nakrutka-podval';
import { nakrutkaKategoriyasi, qatorKategoriyasi } from './narx-yigish';
import { resursNomi as nomi } from './loyiha-material';
import { narxAsoslashVaraq, type AsoslashBand } from '../narx-asoslash-export';
import type { ProtokolQator } from '../narx-protokol-hujjat';
import type { ImzoNomlar } from '../hujjat-yozuvchi';
import type { PriceJustification } from './model';

export type AbcHujjatOpsiya = { qurilish?: string | null; obyekt?: string | null; asos?: string | null; imzo?: ImzoNomlar };
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
/** Egasi qoidasi (2026-10-08): jami har doim ko'rinadi — narxsiz qator faqat o'zi bo'sh (bildirishnoma bilan). */
const groupSum = (col: string, a: number, b: number) => `SUM(${col}${a}:${col}${b})`;
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
      // «исключать» positions carry a negative work quantity, so every resource formula comes out negative too.
      const scale = n(occ.basis.scale), qty0 = n(occ.quantity), qty = qty0 == null ? null : occ.ishora === -1 ? -qty0 : qty0;
      const normQty = qty != null && scale ? Math.round((qty / scale) * 1e9) / 1e9 : null;
      const unit = workUnit(occ.source.unitCode) ?? occ.basis.unitLabel ?? '';
      const wr = v.r;
      v.qator('ish', (): Qiymat[] => [String(work), occ.source.code, occ.source.name ?? '', unit,
        normQty == null ? null : { n: normQty, uslub: 'norma' }, null], { daraja: depth + 1 });
      c.lines.forEach((l: LineCalc, j) => {
        const sub = occ.overrides[l.recipeId]?.substitution;
        const perUnit = l.norm == null ? null : Number(l.norm) * Number(sub?.conversion ?? '1');
        v.qator('oddiy', (r): Qiymat[] => [`${work}.${j + 1}`, idCode(l.resource) ?? l.resource?.code ?? '',
          l.resource ? nomi(l.resource.name, occ.material) : 'НЕ ОПРЕДЕЛЁН РЕСУРС (ТРЕБУЕТ ВЫБОРА)', unitText(l.resource?.unitCode ?? null) ?? '',
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
type ResLine = { code: string; price: string; name: string; unit: string; qty: number; unitPrice: number | null; amount: number | null;
  /** Markup cascade category (hidden column, drives the podval SUMIF). */ kat?: NakrutkaKat | null };
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
    const name = nomi(l.resource.name, o.material);
    const key = [bucket, l.resource.code, name, l.resource.unitCode, unitPrice ?? 'null'].join('\u0001');
    const cur = acc.get(key) ?? { bucket, code: idCode(l.resource) ?? '', price: l.resource.code ?? '', name,
      unit: unitText(l.resource.unitCode) ?? '', qty: 0, unitPrice, amount: 0,
      kat: o.overrides[l.recipeId]?.kat ? qatorKategoriyasi(o, l.recipeId, l.resource, unitText) : bucket === 'machines' ? 'МАШ' as const : nakrutkaKategoriyasi(l.resource, unitText) };
    cur.qty = Math.round((cur.qty + (n(l.quantity) ?? 0)) * 1e7) / 1e7;
    // Narxsiz qism qatorning o'zini bo'sh qiladi (bildirishnoma), lekin guruh/jami ma'lum summalardan yig'iladi.
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
const sumOf = (xs: ResLine[]) => xs.reduce<number>((s, x) => (x.amount == null ? s : Math.round((s + x.amount) * 100) / 100), 0);

function resVaraq(doc: EstimateDoc, g: ResGroups, o: AbcHujjatOpsiya, unresolved: number): RasmiyVaraq {
  const U: RasmiyUstun[] = [
    { sarlavha: '№№', kenglik: 6, tur: 'tartib' }, { sarlavha: 'РЕСУРС', kenglik: 10, tur: 'kod' }, { sarlavha: 'ОБОСНОВАНИЕ', kenglik: 14, tur: 'kod' },
    { sarlavha: 'НАИМЕНОВАНИЕ РЕСУРСА', kenglik: 56, tur: 'matn' }, { sarlavha: 'ЕД.ИЗМ', kenglik: 9, tur: 'birlik' },
    { sarlavha: 'КОЛ-ВО', kenglik: 14, tur: 'hajm' }, { sarlavha: 'ЦЕНА', kenglik: 14, tur: 'narx' }, { sarlavha: 'СУММА', kenglik: 16, tur: 'pul' },
    /* I — cost category (ЧЕЛ/МАШ/МАТ/…): the markup podval sums by it (SUMIF); not printed. */
    { sarlavha: 'Кат.', kenglik: 8, tur: 'texnik', yashirin: true },
  ];
  const Q = 'F', P = 'G', S = 'H';
  const mats = [...g.materials.values()].flat();
  const val = (x: number) => x.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' сум';
  const direct = [sumOf(g.labour), sumOf(g.machines), sumOf(mats), sumOf(g.equipment)];
  const total = Math.round(direct.reduce((a, b) => a + b, 0) * 100) / 100;
  const v = new RasmiyVaraq({ nom: 'RES', sarlavha: 'ЛОКАЛЬНАЯ РЕСУРСНАЯ СМЕТА', ostSarlavha: [doc.context.title || ''].filter(Boolean),
    titul: [...titul(o, doc), ...(unresolved ? [['СТАТУС РАСЧЁТА', `НЕПОЛНЫЙ: ${unresolved} ресурсных строк требуют уточнения. Итоги содержат только известную часть стоимости.`] as const] : []),
      [unresolved ? 'ПРЯМЫЕ ЗАТРАТЫ (ИЗВЕСТНАЯ ЧАСТЬ)' : 'ПРЯМЫЕ ЗАТРАТЫ', val(total)], ['в том числе: ЗАРАБОТНАЯ ПЛАТА', val(direct[0])],
      ['ЭКСПЛУАТАЦИЯ МАШИН И МЕХАНИЗМОВ', val(direct[1])], ['СТОИМОСТЬ СТРОИТЕЛЬНЫХ МАТЕРИАЛОВ', val(direct[2])],
      ['ПЕРЕВОЗКА', 'учтена в материалах / отдельными работами'], ['ОБОРУДОВАНИЕ', val(direct[3])], ['ОСНОВАНИЕ:', o.asos ?? '']],
    ustunlar: U, yonalish: 'portrait', muzlatUstun: 4 });
  const row = (i: number, x: ResLine) => v.qator('oddiy', (r): Qiymat[] =>
    [i, x.code, x.price, x.name, x.unit, x.qty, x.unitPrice, { f: `IF(${P}${r}="","",ROUND(${Q}${r}*${P}${r},2))`, v: x.amount ?? '' }, x.kat ?? null], { rang: null });
  const label = (t: string, sum: { f: string; v: number | string }, tur: 'jami' | 'vsego' = 'jami') => v.qator(tur, (): Qiymat[] =>
    ['', '', '', t, 'СУМ', null, null, sum, null]);
  const firstData = v.r;
  const group = (title: string, xs: ResLine[], withVsego = false) => {
    if (!xs.length) return null;
    v.bolim(title);
    const a = v.r; xs.forEach((x, i) => row(i + 1, x)); const b = v.r - 1;
    const s = sumOf(xs);
    const r1 = label('ИТОГО', { f: groupSum(S, a, b), v: s });
    if (withVsego) label('ВСЕГО', { f: `${S}${r1}`, v: s });
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
    const m = label('ВСЕГО МАТЕРИАЛОВ', { f: sub.length ? `SUM(${sub.map(r => `${S}${r}`).join(',')})` : '0', v: sumOf(mats) }, 'vsego');
    totals.push(m); v.bosh();
  }
  const t4 = group('ОБОРУДОВАНИЕ', g.equipment); if (t4) totals.push(t4);
  if (totals.length) label('ВСЕГО', { f: `SUM(${totals.map(r => `${S}${r}`).join(',')})`, v: total }, 'vsego');
  const lastData = v.r - 1;
  // Confirmed pricing-step rates → the company markup cascade under the RES, every step a live formula.
  if (doc.rates && totals.length) {
    const ks = Object.fromEntries(NAKRUTKA_KATLAR.map(k => [k, 0])) as KatSummalar;
    for (const x of [...g.labour, ...g.machines, ...mats, ...g.equipment]) if (x.kat && x.amount != null) ks[x.kat] = Math.round((ks[x.kat] + x.amount) * 100) / 100;
    v.bosh();
    nakrutkaPodvaliYoz(v, { katUstun: 'I', oraliq: [firstData, lastData], pulUstunlar: [S], foizUstun: P, nk: doc.rates.values, katSummalar: { [S]: ks },
      kfJadval: false, sarlavha: `РАСЧЕТ СТОИМОСТИ (ставки: ${doc.rates.source})`, podval: doc.rates.podval ?? null });
  }
  const narxsiz =[...g.labour, ...g.machines, ...mats, ...g.equipment].filter((x) => x.amount == null && narxBildirishnomaKerak({ nom: x.name }, null));
  if (narxsiz.length) v.diqqat(narxsiz.map((x) => ({ nom: `${x.price ? `${x.price} ` : ''}${x.name}`, sabab: NARX_YOQ_SABAB })));
  return v;
}

/** One workbook: LRV + RES — the resource documents an ABC/TN smeta is delivered with. */
/* ───────────────────────────── ОБОСНОВАНИЕ ЦЕН ───────────────────────────── */
const HUJJAT_TURI: Record<PriceJustification['docType'], string> = {
  CATALOG: 'Каталог (текущие цены)', EXCHANGE: 'Биржевая котировка (УзРТСБ)', PRICE_LIST: 'Прайс-лист производителя',
  COMMERCIAL_OFFER: 'Коммерческое предложение поставщика', COMPANY_ESTIMATE: 'Смета компании (принятая ранее цена)',
  LABOUR_HOUR: 'Стоимость чел.-часа (публикация)', MACHINE_HOUR: 'Калькуляция стоимости маш.-часа', MANUAL: 'Иной документ', INTERNET: 'Цена поставщика (интернет-источник)',
};
/** Studio prices → «ОБОСНОВАНИЕ ЦЕН» positions (one per resource and price, like the RES): document, source row, recalculation. */
export function asoslashBandlari(doc: EstimateDoc, calc: DocCalc, units: Units): { bandlar: AsoslashBand[]; pozitsiyalar: number } {
  const unitText = unitsOf(units).resource;
  const by = new Map<string, AsoslashBand>();
  let pozitsiyalar = 0;
  for (const o of Object.values(doc.occurrences)) for (const l of calc.occurrences[o.id]?.lines ?? []) {
    if (!l.resource) continue;
    pozitsiyalar++;
    const kat = isOperator(l.resource) ? 'МАШ' : nakrutkaKategoriyasi(l.resource, unitText) ?? '';
    const unit = unitText(l.resource.unitCode);
    const narx = n(l.price);
    const name = nomi(l.resource.name, o.material);
    const key = [kat, l.resource.code, name, unit, narx ?? 'null'].join('\u0001');
    const qty = n(l.quantity);
    const prev = by.get(key);
    if (prev) { prev.hajm = prev.hajm == null || qty == null ? null : Math.round((prev.hajm + qty) * 1e6) / 1e6; prev.qatorlar = (prev.qatorlar ?? 1) + 1; continue; }
    const p = o.overrides[l.recipeId]?.price ?? null, j = p?.justification ?? null;
    const dalilsizSabab = narx == null ? (narxBildirishnomaKerak({ nom: l.resource.name ?? '' }, null) ? 'цена в смете не указана' : null)
      : !j && !p?.evidence?.trim() ? 'документ-основание цены не приложен'
      // Owner rule (2026-10-15): an earlier estimate of the company is a hint, never a price justification.
      : j?.docType === 'COMPANY_ESTIMATE' ? 'цена из ранее принятой сметы — не является документом-основанием, требуется каталог, биржа, прайс-лист или КП' : null;
    if (narx == null && !dalilsizSabab) continue;   // machine operators' labour is priced inside the machine-hour (owner rule)
    by.set(key, { kat, kod: idCode(l.resource), nom: name, birlik: unit, hajm: qty, narx, qatorlar: 1,
      hujjatTuri: j ? HUJJAT_TURI[j.docType] : p ? HUJJAT_TURI.MANUAL : null,
      // An averaged price names every supplier's offer it was computed from (owner 2026-10-17).
      rekvizit: j ? [j.document, j.average ? `предложения: ${j.average.offers.map(x => `${x.supplier}${x.code ? ` (поз. № ${x.code})` : ''} — ${x.price}`).join('; ')}` : null,
        // Web sources with their full links — an expert can open every page (owner 2026-10-17).
        j.sources?.length ? `источники: ${j.sources.map(x => `${x.name} — ${x.price}${x.unit ? ` за ${x.unit}` : ''}${x.vat === true ? ' с НДС' : x.vat === false ? ' без НДС' : ''}, ${x.url}`).join('; ')}` : null].filter(Boolean).join('; ')
        : p?.evidence ?? null,
      manbaNom: j?.sourceName ?? null, manbaBirlik: j?.sourceUnit ?? null, manbaNarx: j?.sourcePrice == null ? null : Number(j.sourcePrice),
      qaytaHisob: j?.conversion ? { formula: j.conversion.formula, koef: Number(j.conversion.factor), izoh: j.conversion.note } : null,
      dalilsizSabab });
  }
  return { bandlar: [...by.values()], pozitsiyalar };
}

/**
 * «ПРОТОКОЛ СОГЛАСОВАНИЯ ЦЕН» of a new estimate (owner 2026-10-14: client and contractor agree the prices): every priced
 * position with its document price brought to the estimate unit, the price taken into the estimate and the justification.
 */
export function studioProtokolQatorlari(doc: EstimateDoc, calc: DocCalc, units: Units): ProtokolQator[] {
  return asoslashBandlari(doc, calc, units).bandlar.filter(b => b.narx != null).map(b => ({
    kat: b.kat || null, kod: b.kod, nom: b.nom, birlik: b.birlik,
    eski_narx: b.manbaNarx == null ? null : Math.round(b.manbaNarx * (b.qaytaHisob?.koef ?? 1) * 100) / 100,
    yangi_narx: b.narx as number,
    izoh: [b.hujjatTuri, b.rekvizit, b.manbaNom && b.manbaNom !== b.nom ? `в документе: ${b.manbaNom}${b.manbaBirlik ? `, ${b.manbaBirlik}` : ''}` : null,
      b.qaytaHisob ? `пересчёт: ${b.qaytaHisob.formula}${b.qaytaHisob.izoh ? ` (${b.qaytaHisob.izoh})` : ''}` : null].filter(Boolean).join('; ') || null,
  }));
}
export const STUDIO_PROTOKOL_USTUNLARI = { eski: 'Цена по документу-основанию (на ед. сметы)', yangi: 'Согласованная договорная цена' };
export const STUDIO_PROTOKOL_MAQSADI = 'на материальные и технические ресурсы, принятые в локальной ресурсной смете';

/** One workbook: LRV + RES + «ОБОСНОВАНИЕ ЦЕН» — every price with its document and recalculation. */
export function abcHujjat(doc: EstimateDoc, calc: DocCalc, unitText: Units, o: AbcHujjatOpsiya = {}) {
  if (!Object.keys(doc.occurrences).length) throw new Error('LRV_BOSH');
  const g = resGroups(doc, calc, unitText);
  const asos = asoslashBandlari(doc, calc, unitText);
  const asosVaraq = narxAsoslashVaraq(asos.bandlar, { obyektNomi: o.obyekt ?? doc.context.objectLabel ?? '', pozitsiyalar: asos.pozitsiyalar, imzo: o.imzo }).varaq;
  const kitob = rasmiyKitob([lrvVaraq(doc, calc, unitText, o), resVaraq(doc, g, o, calc.total.unresolved), asosVaraq], { tur: 'lrv' });
  return { bytes: kitob.bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyekt ?? doc.context.objectLabel ?? 'Smeta', hujjat: 'ЛРВ_RES', davr: new Date().toISOString().slice(0, 10) }), groups: g };
}
