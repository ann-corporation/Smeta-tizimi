import type { T2Qator, T2QatorHolat } from '../api/supabase';
import {
  RasmiyVaraq, bugunSana, sumRefs, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, yaxlit2,
  type ImzoNomlar, type Qiymat, type RasmiyUstun,
} from './hujjat-yozuvchi';
import type { OstatkaIstisno } from './ostatka-export';
import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import { NAKRUTKA_KATLAR, kOplate, kategoriyaKf, nakrutkaKat, nakrutkaPodvaliYoz, podvalKfQatorlari, type KatSummalar } from './nakrutka-podval';
import { podvalgaKoefQoy, type Podval } from './nakrutka-konstruktor';
import { bosRefs } from './hujjat-yozuvchi';

/**
 * СЛИЧИТЕЛЬНАЯ ВЕДОМОСТЬ — smeta va haqiqatda bajarilgan hajmlarni
 * solishtirish (egasi 2026-09-25: "slichitelniy vedomost ham yasay oladigan
 * bo'lishi kerak"). Hujjat standarti H1–H9 (`docs/architecture/HUJJAT_STANDARTI_V1.md`).
 *
 * Katalogda DOC-14 / TPL-08 — ichki nazorat reestri: farqni KO'RSATADI, hech
 * bir manbani "to'g'rilamaydi". Manbalar kanonik:
 *   A — smeta (`t2_qator`: hajm, narx),
 *   B — fakt (`t2_qator_holat.fakt_hajm`, tasdiqlangan fakt hujjatlari),
 *   ma'lumot uchun — tasdiqlangan Ф-2 (`f2_hajm`, `f2_summa`, hujjat qiymati).
 * Bog'lash faqat `t2_qator.id` bilan (qator raqami yoki nom bilan emas).
 *
 * Qoidalar:
 *  - ОТКЛОНЕНИЕ = факт − смета (+ сверх сметы, − не выполнено); summa smeta
 *    narxida (to'g'ri xarajat, НДС siz) — Excel formulasi bilan;
 *  - smeta hajmi/narxi yoki fakt noma'lum — summa bo'sh, yuqoridagi jamilar
 *    bo'sh, «ТРЕБУЮТ ВНИМАНИЯ» da (NULL ≠ 0);
 *  - pul faqat barglardan yig'iladi (bl/rz summasi takror);
 *  - qo'shimcha ish, almashtirish va ostatkadan chiqarilgan ish (tasdiqlangan
 *    o'zgarish) «Примечание» da asosi bilan.
 */

export type SlichitelniyOpsiya = {
  obyektNomi: string;
  /** "По состоянию на" (YYYY-MM-DD). Berilmasa — bugun. */
  sana?: string;
  imzo?: ImzoNomlar;
  /** Faqat farqi bor (yoki noma'lum) pozitsiyalar. Sukut — hammasi. */
  faqatFarq?: boolean;
  /** Ostatkadan chiqarilgan ishlar (tasdiqlangan) — izohda. */
  istisnolar?: readonly OstatkaIstisno[];
  /** Obyekt nakrutka foizlari — к оплате = прямые × Kf. Berilmasa 0 %. */
  nakrutka?: Partial<NakrutkaKoeffitsientlar> | null;
  /** Maxsus nakrutka podvali (konstruktor) — null: standart kaskad. */
  podval?: Podval | null;
  /** НДС stavkasi (sukut: nakrutkadagi НДС, u ham bo'lmasa 12 %). */
  ndsFoiz?: number | null;
};

export type SlichitelniyQator = {
  id: number;
  tur: 'rz' | 'bl' | 'barg' | 'itogo';
  daraja: number;
  tartib: string;
  kod: string;
  nom: string;
  birlik: string;
  smetaHajm: number | null;
  narx: number | null;
  smetaSumma: number | null;
  faktHajm: number | null;
  faktSumma: number | null;
  f2Hajm: number;
  /** NULL = certified F2 amount unknown (never 0). */
  f2Summa: number | null;
  farqHajm: number | null;
  farqSumma: number | null;
  izoh: string;
  /** Resurs kategoriyasi (barg). */
  kat?: string | null;
  /** Noma'lum pul pozitsiyalari soni (bu qator va uning ostida). */
  nomalum: number;
  /** Resurs normasi va ota ish qatori indeksi — hujjatda smeta hajmi = norma × ish hajmi (tirik formula). */
  norma?: number | null;
  otaIdx?: number | null;
  bolalar: number[];
};

export type SlichitelniyJami = { smeta: number | null; fakt: number | null; f2: number | null; farq: number | null };

export type SlichitelniyModel = {
  qatorlar: SlichitelniyQator[];
  ildizlar: number[];
  jami: SlichitelniyJami;
  diqqat: Array<{ nom: string; sabab: string; joy?: string }>;
  /** Barglar: jami / farqi borlar (+ ortiq, − kam). */
  barglar: number;
  ortiq: number;
  kam: number;
};

const BARG = new Set(['rs', 'mat', 'ob']);
const EPS = 1e-9;
const nol = (x: number): number => (Math.abs(x) < EPS ? 0 : x);

export function slichitelniyModeli(qatorlar: readonly T2Qator[], holatlar: readonly T2QatorHolat[], o: Pick<SlichitelniyOpsiya, 'faqatFarq' | 'istisnolar'> = {}): SlichitelniyModel {
  const rows = [...qatorlar].sort((a, b) => (a.tartib ?? 0) - (b.tartib ?? 0) || a.id - b.id);
  const byId = new Map(rows.map((q) => [q.id, q]));
  const holat = new Map(holatlar.map((h) => [h.qator_id, h]));
  const istisno = new Map((o.istisnolar ?? []).filter((x) => x.holat === 'tasdiqlangan').map((x) => [x.qatorId, x]));
  const bolalar = new Map<number | null, T2Qator[]>();
  for (const q of rows) {
    const ota = q.ota_id != null && byId.has(q.ota_id) ? q.ota_id : null;
    const a = bolalar.get(ota);
    if (a) a.push(q); else bolalar.set(ota, [q]);
  }
  const yolOf = (q: T2Qator): string => {
    const y: string[] = [];
    for (let p = q.ota_id == null ? undefined : byId.get(q.ota_id); p; p = p.ota_id == null ? undefined : byId.get(p.ota_id)) if (p.tur === 'rz' || p.tur === 'bl') y.unshift(p.nom ?? '');
    return y.join(' › ');
  };
  const out: SlichitelniyQator[] = [];
  const diqqat: SlichitelniyModel['diqqat'] = [];
  let no = 0, barglar = 0, ortiq = 0, kam = 0;

  const izohOf = (q: T2Qator, smeta: number | null, fakt: number | null, farq: number | null): string => {
    const b: string[] = [];
    if (q.qoshimcha) b.push('дополнительная работа');
    if (q.zamena) b.push('замена');
    const x = istisno.get(q.id);
    if (x) b.push(`исключено из остатка: ${x.asos}${x.sabab ? `; ${x.sabab}` : ''}`);
    if (farq != null && farq > 0) b.push('выполнено сверх сметы');
    else if (farq != null && farq < 0) b.push(fakt === 0 ? 'не выполнено' : 'выполнено не полностью');
    if (smeta === 0 && !x && !(fakt ?? 0)) b.push('объем по смете 0');
    return b.join('; ');
  };

  const olchov = (q: T2Qator) => {
    const h = holat.get(q.id);
    const smeta = q.hajm ?? null;
    const fakt = h ? Number(h.fakt_hajm ?? 0) : null;
    const farq = smeta == null || fakt == null ? null : nol(fakt - smeta);
    return { h, smeta, fakt, farq, f2Hajm: h ? Number(h.f2_hajm ?? 0) : 0, f2Summa: h ? (h.f2_summa == null ? (Number(h.f2_hajm ?? 0) === 0 ? 0 : null) : Number(h.f2_summa)) : 0 };
  };

  const qayta = (q: T2Qator, daraja: number, blNo: string | null, k: number, otaIdx: number | null = null): number | null => {
    const tur = q.tur ?? '';
    const kids = bolalar.get(q.id) ?? [];
    if (BARG.has(tur) || (tur === 'bl' && !kids.length)) {
      const { smeta, fakt, farq, f2Hajm, f2Summa } = olchov(q);
      if (o.faqatFarq && farq === 0 && q.narx != null) return null;
      const narx = q.narx ?? null;
      const smetaSumma = smeta != null && narx != null ? yaxlit2(smeta * narx) : null;
      const faktSumma = fakt != null && narx != null ? yaxlit2(fakt * narx) : null;
      const farqSumma = farq != null && narx != null ? yaxlit2(farq * narx) : null;
      const sabab = [smeta == null ? 'нет количества по смете' : '', fakt == null ? 'нет данных о выполнении' : '', narx == null ? 'нет сметной цены' : ''].filter(Boolean);
      if (sabab.length) diqqat.push({ nom: `${q.nom ?? ''}${q.birlik ? `, ${q.birlik}` : ''}`, sabab: sabab.join('; '), joy: yolOf(q) || undefined });
      barglar++;
      if (farq != null && farq > 0) ortiq++;
      if (farq != null && farq < 0) kam++;
      const nomalum = smetaSumma == null || faktSumma == null || farqSumma == null ? 1 : 0;
      out.push({
        id: q.id, tur: 'barg', daraja, tartib: blNo ? `${blNo}.${k}` : String(++no), kod: q.kod ?? '', nom: q.nom ?? '', birlik: q.birlik ?? '',
        smetaHajm: smeta, narx, smetaSumma, faktHajm: fakt, faktSumma, f2Hajm, f2Summa, farqHajm: farq, farqSumma,
        izoh: izohOf(q, smeta, fakt, farq), nomalum, kat: q.kat ?? null, bolalar: [], norma: q.norma ?? null, otaIdx,
      });
      return out.length - 1;
    }
    if (tur === 'bl') {
      const idx = out.length;
      const { smeta, fakt, farq, f2Hajm } = olchov(q);
      const nomer = String(++no);
      out.push({
        id: q.id, tur: 'bl', daraja, tartib: nomer, kod: q.kod ?? '', nom: q.nom ?? '', birlik: q.birlik ?? '',
        smetaHajm: smeta, narx: null, smetaSumma: null, faktHajm: fakt, faktSumma: null, f2Hajm, f2Summa: 0,
        farqHajm: farq, farqSumma: null, izoh: izohOf(q, smeta, fakt, farq), nomalum: 0, bolalar: [],
      });
      const b: number[] = [];
      let kk = 0;
      for (const c of kids) { const i = qayta(c, daraja + 1, nomer, kk + 1, idx); if (i != null) { b.push(i); kk++; } }
      if (!b.length && o.faqatFarq && (farq === 0)) { out.length = idx; no--; return null; }
      yigindi(out[idx], b);
      return idx;
    }
    const idx = out.length;
    out.push({ id: q.id, tur: 'rz', daraja, tartib: '', kod: '', nom: q.nom ?? '', birlik: '', smetaHajm: null, narx: null, smetaSumma: null, faktHajm: null, faktSumma: null, f2Hajm: 0, f2Summa: 0, farqHajm: null, farqSumma: null, izoh: '', nomalum: 0, bolalar: [] });
    const b: number[] = [];
    for (const c of kids) { const i = qayta(c, daraja + 1, null, 0); if (i != null) b.push(i); }
    if (!b.length) { out.length = idx; return null; }
    const it: SlichitelniyQator = { id: q.id, tur: 'itogo', daraja, tartib: '', kod: '', nom: `ИТОГО ПО РАЗДЕЛУ: ${q.nom ?? ''}`, birlik: '', smetaHajm: null, narx: null, smetaSumma: null, faktHajm: null, faktSumma: null, f2Hajm: 0, f2Summa: 0, farqHajm: null, farqSumma: null, izoh: '', nomalum: 0, bolalar: [] };
    yigindi(it, b);
    out[idx].f2Summa = it.f2Summa;   // section header carries the same (possibly unknown) certified total, never a fake 0
    out.push(it);
    return out.length - 1;
  };
  function yigindi(r: SlichitelniyQator, b: number[]) {
    r.bolalar = b;
    r.nomalum = b.reduce((s, i) => s + out[i].nomalum, 0);
    const s = (f: (x: SlichitelniyQator) => number | null) => (r.nomalum ? null : yaxlit2(b.reduce((t, i) => t + (f(out[i]) ?? 0), 0)));
    r.smetaSumma = s((x) => x.smetaSumma);
    r.faktSumma = s((x) => x.faktSumma);
    r.farqSumma = s((x) => x.farqSumma);
    r.f2Summa = b.some(i => out[i].f2Summa == null) ? null : yaxlit2(b.reduce((t, i) => t + (out[i].f2Summa as number), 0));
  }

  const ildizlar: number[] = [];
  for (const q of bolalar.get(null) ?? []) { const i = qayta(q, 0, null, 0); if (i != null) ildizlar.push(i); }
  const nomalum = ildizlar.reduce((s, i) => s + out[i].nomalum, 0);
  const js = (f: (x: SlichitelniyQator) => number | null) => (!ildizlar.length || nomalum ? null : yaxlit2(ildizlar.reduce((t, i) => t + (f(out[i]) ?? 0), 0)));
  return {
    qatorlar: out, ildizlar, diqqat, barglar, ortiq, kam,
    jami: { smeta: js((x) => x.smetaSumma), fakt: js((x) => x.faktSumma), farq: js((x) => x.farqSumma), f2: ildizlar.some(i => out[i].f2Summa == null) ? null : yaxlit2(ildizlar.reduce((t, i) => t + (out[i].f2Summa as number), 0)) },
  };
}

const USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 7, tur: 'tartib' },
  { sarlavha: 'Шифр, код', kenglik: 13, tur: 'kod' },
  { sarlavha: 'Наименование работ и затрат', kenglik: 40, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 8, tur: 'birlik' },
  { sarlavha: 'кол-во', kenglik: 11, tur: 'hajm', guruh: 'ПО СМЕТЕ' },
  { sarlavha: 'цена за ед., сум', kenglik: 13, tur: 'narx', guruh: 'ПО СМЕТЕ' },
  { sarlavha: 'сумма, сум', kenglik: 15, tur: 'pul', guruh: 'ПО СМЕТЕ' },
  { sarlavha: 'кол-во', kenglik: 11, tur: 'hajm', guruh: 'ФАКТИЧЕСКИ ВЫПОЛНЕНО' },
  { sarlavha: 'сумма, сум', kenglik: 15, tur: 'pul', guruh: 'ФАКТИЧЕСКИ ВЫПОЛНЕНО' },
  { sarlavha: 'кол-во', kenglik: 11, tur: 'hajm', guruh: 'ПРИНЯТО ПО АКТАМ Ф-2' },
  { sarlavha: 'сумма, сум', kenglik: 15, tur: 'pul', guruh: 'ПРИНЯТО ПО АКТАМ Ф-2' },
  { sarlavha: 'кол-во (+/−)', kenglik: 11, tur: 'hajm', guruh: 'ОТКЛОНЕНИЕ (ФАКТ − СМЕТА)' },
  { sarlavha: 'сумма, сум', kenglik: 15, tur: 'pul', guruh: 'ОТКЛОНЕНИЕ (ФАКТ − СМЕТА)' },
  { sarlavha: 'Примечание', kenglik: 26, tur: 'matn' },
  // Yashirin texnik ustun: noma'lum pul pozitsiyalari soni (jamini bo'sh qoldirish uchun).
  { sarlavha: 'Н', kenglik: 4, tur: 'texnik', yashirin: true },
  { sarlavha: 'выполнено, сум', kenglik: 15, tur: 'pul', guruh: 'К ОПЛАТЕ (с накладными расходами и НДС)' },
  { sarlavha: 'отклонение, сум', kenglik: 15, tur: 'pul', guruh: 'К ОПЛАТЕ (с накладными расходами и НДС)' },
  { sarlavha: 'Кат.', kenglik: 6, tur: 'texnik', yashirin: true },
];
// A№ B kod C nom D ed E smHajm F narx G smSumma H faktHajm I faktSumma J f2Hajm K f2Summa L farqHajm M farqSumma N izoh O nomalum
// P faktKOplate Q farqKOplate R kat(yashirin)

/** Сличительная ведомость (.xlsx). */
export function slichitelniyHujjatXlsx(model: SlichitelniyModel, o: SlichitelniyOpsiya): { bytes: Uint8Array; faylNomi: string; kOplata: { fakt: number | null; farq: number | null } } {
  const sana = o.sana ?? bugunSana();
  const sanaRu = sana.split('-').reverse().join('.');
  const v = new RasmiyVaraq({
    nom: 'Сличительная ведомость',
    sarlavha: 'СЛИЧИТЕЛЬНАЯ ВЕДОМОСТЬ',
    ostSarlavha: [`объемов работ по смете и фактически выполненных по состоянию на ${sanaRu}${o.faqatFarq ? ' (позиции с отклонениями)' : ''}`],
    titul: [
      ['Объект:', o.obyektNomi],
      ['Заказчик:', o.imzo?.zakazchik],
      ['Подрядчик:', o.imzo?.pudratchi],
      ['Основание:', 'ведомость объемов работ и ресурсов (ЛРВ) объекта; выполнение — по учтенным актам факта; принято — по утвержденным актам формы № 2'],
    ],
    ustunlar: USTUNLAR,
    yonalish: 'landscape',
  });
  const bosh = v.malumotBoshi;
  const rowOf = (i: number) => bosh + i;
  const qiy = (x: number | null): Qiymat => (x == null ? null : x);
  const sumKid = (q: SlichitelniyQator, col: string) => sumRefs(col, q.bolalar.map(rowOf));
  const pulYig = (q: SlichitelniyQator, col: string, val: number | null, n: number): Qiymat =>
    (q.bolalar.length ? { f: `IF(O${n}>0,"",${sumKid(q, col)})`, v: val ?? '' } : null);
  // Ikki narx: P = ROUND(I × Kf), Q = ROUND(M × Kf); podval ВСЕГО dan keyin.
  const nk: Partial<NakrutkaKoeffitsientlar> = { ...(o.nakrutka ?? {}) };
  nk.НДС = o.ndsFoiz ?? nk.НДС ?? 12;
  const podval = o.podval ? podvalgaKoefQoy(o.podval, nk) : null;
  const kfJS = kategoriyaKf(nk, podval);
  const kfQ = podvalKfQatorlari(bosh + model.qatorlar.length + 2, podval);
  const koMemo = new Map<string, number | null>();
  const koOf = (i: number, c: 'P' | 'Q'): number | null => {
    const key = `${i}${c}`;
    if (koMemo.has(key)) return koMemo.get(key)!;
    const q = model.qatorlar[i];
    let val: number | null;
    if (q.tur === 'barg') val = kOplate(c === 'P' ? q.faktSumma : q.farqSumma, nakrutkaKat(q.kat), kfJS);
    else if (q.tur === 'rz') val = null;
    else { const vs = q.bolalar.map((k) => koOf(k, c)); val = !vs.length || vs.some((x) => x == null) ? null : yaxlit2(vs.reduce<number>((a2, b2) => a2 + (b2 ?? 0), 0)); }
    koMemo.set(key, val);
    return val;
  };
  const koYig = (idx: readonly number[], c: 'P' | 'Q'): Qiymat => {
    if (!idx.length) return null;
    const rows = idx.map(rowOf);
    const vs = idx.map((k) => koOf(k, c));
    return { f: `IF(${bosRefs(c, rows)}>0,"",${sumRefs(c, rows)})`, v: vs.some((x) => x == null) ? '' : yaxlit2(vs.reduce<number>((a2, b2) => a2 + (b2 ?? 0), 0)) };
  };
  const katsiz: string[] = [];
  model.qatorlar.forEach((q, i) => {
    let r = 0;
    if (q.tur === 'rz') r = v.bolim(q.nom, { daraja: q.daraja });
    else if (q.tur === 'barg') {
      // Egasi 2026-09-30: tirik smeta — resurs hajmi = norma × ish hajmi (ish hajmi o'zgarsa resurs ham).
      const ota = q.otaIdx != null ? model.qatorlar[q.otaIdx] : undefined;
      const normaF = q.norma != null && ota?.tur === 'bl' && ota.smetaHajm != null && q.smetaHajm != null;
      r = v.qator('oddiy', (n) => [
        q.tartib, q.kod, q.nom, q.birlik, normaF ? { f: `ROUND(${q.norma}*E${rowOf(q.otaIdx!)},6)`, v: q.smetaHajm! } : qiy(q.smetaHajm), qiy(q.narx),
        { f: `IF(OR(E${n}="",F${n}=""),"",ROUND(E${n}*F${n},2))`, v: q.smetaSumma ?? '' },
        qiy(q.faktHajm),
        { f: `IF(OR(H${n}="",F${n}=""),"",ROUND(H${n}*F${n},2))`, v: q.faktSumma ?? '' },
        q.f2Hajm, q.f2Summa,
        { f: `IF(OR(E${n}="",H${n}=""),"",H${n}-E${n})`, v: q.farqHajm ?? '' },
        { f: `IF(OR(L${n}="",F${n}=""),"",ROUND(L${n}*F${n},2))`, v: q.farqSumma ?? '' },
        q.izoh || null,
        { f: `IF(OR(G${n}="",I${n}="",M${n}=""),1,0)`, v: q.nomalum },
        ...((): Qiymat[] => {
          const kat = nakrutkaKat(q.kat);
          if (!kat) { katsiz.push(`${q.nom}${q.birlik ? `, ${q.birlik}` : ''}`); return [null, null, null]; }
          return [{ f: `IF(I${n}="","",ROUND(I${n}*F${kfQ[kat]},2))`, v: koOf(i, 'P') ?? '' }, { f: `IF(M${n}="","",ROUND(M${n}*F${kfQ[kat]},2))`, v: koOf(i, 'Q') ?? '' }, kat];
        })(),
      ], { daraja: q.daraja });
    } else if (q.tur === 'bl') {
      r = v.qator('ish', (n) => [
        q.tartib, q.kod, q.nom, q.birlik, qiy(q.smetaHajm), null,
        pulYig(q, 'G', q.smetaSumma, n),
        qiy(q.faktHajm),
        pulYig(q, 'I', q.faktSumma, n),
        q.f2Hajm, q.bolalar.length ? { f: sumKid(q, 'K'), v: q.f2Summa } : null,
        { f: `IF(OR(E${n}="",H${n}=""),"",H${n}-E${n})`, v: q.farqHajm ?? '' },
        pulYig(q, 'M', q.farqSumma, n),
        q.izoh || null,
        q.bolalar.length ? { f: sumKid(q, 'O'), v: q.nomalum } : 0,
        koYig(q.bolalar, 'P'), koYig(q.bolalar, 'Q'), null,
      ], { daraja: q.daraja });
    } else {
      r = v.qator('jami', (n) => [
        null, null, q.nom, null, null, null,
        pulYig(q, 'G', q.smetaSumma, n), null, pulYig(q, 'I', q.faktSumma, n),
        null, { f: sumKid(q, 'K'), v: q.f2Summa }, null, pulYig(q, 'M', q.farqSumma, n), null,
        { f: sumKid(q, 'O'), v: q.nomalum },
        koYig(q.bolalar, 'P'), koYig(q.bolalar, 'Q'), null,
      ], { daraja: q.daraja });
    }
    if (r !== rowOf(i)) throw new Error('SLICHITELNIY_QATOR_SILJIDI');
  });
  if (model.ildizlar.length) {
    const nomalum = model.ildizlar.reduce((s, i) => s + model.qatorlar[i].nomalum, 0);
    const ref = (c: string) => sumRefs(c, model.ildizlar.map(rowOf));
    v.qator('vsego', (n) => [
      null, null, 'ВСЕГО ПО ОБЪЕКТУ', null, null, null,
      { f: `IF(O${n}>0,"",${ref('G')})`, v: model.jami.smeta ?? '' }, null,
      { f: `IF(O${n}>0,"",${ref('I')})`, v: model.jami.fakt ?? '' }, null,
      { f: ref('K'), v: model.jami.f2 }, null,
      { f: `IF(O${n}>0,"",${ref('M')})`, v: model.jami.farq ?? '' }, null,
      { f: ref('O'), v: nomalum },
      koYig(model.ildizlar, 'P'), koYig(model.ildizlar, 'Q'), null,
    ]);
    // Nakrutka podvali (смета, выполнено, принято Ф-2, отклонение) — к оплате.
    v.bosh();
    const katSummalar: Record<string, KatSummalar> = {};
    for (const c of ['G', 'I', 'K', 'M'] as const) {
      const ks = Object.fromEntries(NAKRUTKA_KATLAR.map((k) => [k, 0])) as KatSummalar;
      for (const q of model.qatorlar) {
        const kat = q.tur === 'barg' ? nakrutkaKat(q.kat) : null;
        if (!kat) continue;
        const val = c === 'G' ? q.smetaSumma : c === 'I' ? q.faktSumma : c === 'K' ? q.f2Summa : q.farqSumma;
        if (val != null) ks[kat] += val;
      }
      katSummalar[c] = ks;
    }
    const p = nakrutkaPodvaliYoz(v, { podval, katUstun: 'R', oraliq: [bosh, bosh + model.qatorlar.length - 1], pulUstunlar: ['G', 'I', 'K', 'M'], foizUstun: 'F', nk, katSummalar });
    if (p.kfQator.ЧЕЛ !== kfQ.ЧЕЛ) throw new Error('SLICHITELNIY_PODVAL_SILJIDI');
  }
  v.bosh();
  v.izoh('Отклонение = фактически выполнено − по смете: «+» — выполнено сверх сметы, «−» — не выполнено. Стоимость граф 7, 9 и 13 — по сметным ценам (прямые затраты), без накладных расходов и НДС; графа 11 — по утвержденным актам формы № 2. Ведомость фиксирует расхождения и не изменяет сметные и фактические данные.');
  if (model.jami.smeta == null && model.ildizlar.length) v.izoh('Итоги не определены: есть позиции без количества, выполнения или цены — см. перечень ниже.');
  v.izoh('Графы 15–16 — стоимость к оплате: прямые затраты × коэффициент по виду затрат (раздел «Расчет стоимости к оплате»).');
  if (!o.nakrutka || !Object.keys(o.nakrutka).length) v.izoh('Проценты накладных и прочих расходов для объекта не заданы — в расчете стоимости к оплате приняты 0 % (учтен только НДС).');
  v.diqqat(model.diqqat);
  if (katsiz.length) v.diqqat(katsiz.map((nom) => ({ nom, sabab: 'не указан вид затрат — стоимость к оплате не определена' })), 'ВИД ЗАТРАТ НЕ УКАЗАН');
  v.imzo(imzoTomonlari(['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'ТЕХНАДЗОР', 'СОСТАВИЛ'], o.imzo));
  const { bytes } = rasmiyKitob([v], { tur: 'slichitelniy' });
  const kv = (c: 'P' | 'Q') => { const x = model.ildizlar.map((i) => koOf(i, c)); return x.length && !x.some((z) => z == null) ? yaxlit2(x.reduce<number>((a2, b2) => a2 + (b2 ?? 0), 0)) : null; };
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNomi, hujjat: 'СЛИЧИТЕЛЬНАЯ_ВЕДОМОСТЬ', davr: sana }), kOplata: { fakt: kv('P'), farq: kv('Q') } };
}
