import type { T2Qator, T2QatorHolat } from '../api/supabase';
import {
  RasmiyVaraq, bugunSana, sumRefs, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, yaxlit2,
  type ImzoNomlar, type Qiymat, type RasmiyUstun,
} from './hujjat-yozuvchi';
import type { OstatkaIstisno } from './ostatka-export';
import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import { NAKRUTKA_KATLAR, NOMALUM_KAT, kOplate, kategoriyaKf, nakrutkaKat, nakrutkaPodvaliYoz, podvalKfQatorlari, podvalNdsFoiz, podvalQatorRaqami, type KatSummalar } from './nakrutka-podval';
import { YAXLIT_IZOH, YAXLIT_KAT, bolimBarglari, bolimQqsBilan, svodYaxlitQqs, type SvodYaxlit } from './svod-yaxlit';
import { NDS_SUKUT_FOIZ, faktSummaF2Narxda, faktSummaF2NarxFormula, qatorSumma, serverMerosKoefQoy, yaxlitBolimJami, yaxlitKOplate, yaxlitKOplateTaqsim, yaxlitKorinish, yaxlitQatorlarga, yigindi2, yigindi2Qatiy, type Podval } from './hisob-yadro';
import { mashinistMehnati, narxBildirishnomaKerak } from './narx-bildirishnoma';

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
  /** Obyekt nakrutka foizlari — к оплате = прямые × Kf. Berilmasa — к оплате noma'lum (0 % emas). */
  nakrutka?: Partial<NakrutkaKoeffitsientlar> | null;
  /** Maxsus nakrutka podvali (konstruktor) — null: standart kaskad. */
  podval?: Podval | null;
  /** Server `nk_manba` — meros foizlari izohi (yadro `serverMerosKoefQoy`). */
  nkManba?: string | null;
  /** НДС stavkasi (sukut: nakrutkadagi НДС, u ham bo'lmasa 12 %). */
  ndsFoiz?: number | null;
  /** Svod yaxlit bo'limlari va avlodlari (`yaxlitQatorIdlari`): ularga ustama qo'llanmaydi, podvalda alohida qator. */
  yaxlitIdlar?: ReadonlySet<number> | null;
  /** Svod yaxlit xulosasi (server) — to'liq ro'yxatda smeta ustunining yaxlit summasi svoddan (QQS siz). */
  svodYaxlit?: SvodYaxlit | null;
};

/** Model opsiyalari. Fakt hajmi yozilganidek; fakt summasi — tasdiqlangan F2 bor qatorda F2 narxida (yadro). */
export type SlichitelniyModelOpsiya = Pick<SlichitelniyOpsiya, 'faqatFarq' | 'istisnolar'> & {
  /** Svod yaxlit (server): bo'lim qatorlari yaxlit summaga taqsimlanadi (smeta, fakt, отклонение) — to'liq ro'yxatda. */
  svodYaxlit?: SvodYaxlit | null;
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
  f2Summa: number;
  farqHajm: number | null;
  farqSumma: number | null;
  izoh: string;
  /** Resurs kategoriyasi (barg). */
  kat?: string | null;
  /** Noma'lum pul pozitsiyalari soni (bu qator va uning ostida). */
  nomalum: number;
  /** Svod yaxlit bo'limiga taqsimlangan qator — G/I/M qiymat (formula emas). */
  yaxlitTaqsim?: number;
  /** Fakt summasi tasdiqlangan F2 birlik narxida (narx qoidasi). */
  f2Narxda?: boolean;
  /** Tasdiqlangan F2 summasi noma'lum (NULL) — hujjatda K katagi bo'sh (formula kesh bilan teng bo'lsin). */
  f2SummaNomalum?: boolean;
  /** Resurs normasi va ota ish qatori indeksi — hujjatda smeta hajmi = norma × ish hajmi (tirik formula). */
  norma?: number | null;
  otaIdx?: number | null;
  bolalar: number[];
};

export type SlichitelniyJami = { smeta: number | null; fakt: number | null; f2: number; farq: number | null };

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

export function slichitelniyModeli(qatorlar: readonly T2Qator[], holatlar: readonly T2QatorHolat[], o: SlichitelniyModelOpsiya = {}): SlichitelniyModel {
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
    // Fakt hajmi yozilganidek (egasi): F2 dan hech narsa chiqarilmaydi, fakt < F2 — normal. NULL — NULL (0 emas).
    const fakt = h?.fakt_hajm == null ? null : Number(h.fakt_hajm);
    const f2Hajm = h ? Number(h.f2_hajm ?? 0) : 0;
    const f2Summa = h ? Number(h.f2_summa ?? 0) : 0;
    const f2HajmV = h?.f2_hajm == null ? null : Number(h.f2_hajm);
    const f2SummaV = h?.f2_summa == null ? null : Number(h.f2_summa);
    // NARX qoidasi (yadro `faktSummaF2Narxda`): tasdiqlangan F2 bor qatorda fakt summasi F2 birlik narxida.
    const asl = qatorSumma(fakt, q.narx ?? null);
    const r = faktSummaF2Narxda(fakt, f2HajmV, f2SummaV, asl);
    const farq = smeta == null || fakt == null ? null : nol(fakt - smeta);
    return { h, smeta, fakt, faktSumma: r.summa,
      // Izoh faqat F2 narxi summani o'zgartirganda (F2 narxi = smeta narxi bo'lsa shovqin yo'q).
      f2Narxda: r.manba === 'f2' && (r.summa == null ? asl != null : asl == null || Math.abs(r.summa - asl) > 0.005), farq, f2Hajm, f2Summa, f2SummaV };
  };  const qayta = (q: T2Qator, daraja: number, blNo: string | null, k: number, otaIdx: number | null = null): number | null => {
    const tur = q.tur ?? '';
    const kids = bolalar.get(q.id) ?? [];
    if (BARG.has(tur) || (tur === 'bl' && !kids.length)) {
      const { smeta, fakt, faktSumma, f2Narxda, farq, f2Hajm, f2Summa, f2SummaV } = olchov(q);
      if (o.faqatFarq && farq === 0 && q.narx != null) return null;
      const narx = q.narx ?? null;
      const smetaSumma = qatorSumma(smeta, narx);
      // Отклонение SUMMA = I − G (fakt summasi F2 narxida − smeta summasi) — qator ichida izchil.
      const farqSumma = faktSumma == null || smetaSumma == null ? null : yaxlit2(faktSumma - smetaSumma);
      const sabab = [smeta == null ? 'нет количества по смете' : '', fakt == null ? 'нет данных о выполнении' : '', narxBildirishnomaKerak(q, narx) ? 'нет сметной цены — строка не включена в сумму' : ''].filter(Boolean);
      if (sabab.length) diqqat.push({ nom: `${q.nom ?? ''}${q.birlik ? `, ${q.birlik}` : ''}`, sabab: sabab.join('; '), joy: yolOf(q) || undefined });
      barglar++;
      if (farq != null && farq > 0) ortiq++;
      if (farq != null && farq < 0) kam++;
      const nomalum = (smetaSumma == null || faktSumma == null || farqSumma == null) && !(narx == null && mashinistMehnati(q)) ? 1 : 0;
      out.push({
        id: q.id, tur: 'barg', daraja, tartib: blNo ? `${blNo}.${k}` : String(++no), kod: q.kod ?? '', nom: q.nom ?? '', birlik: q.birlik ?? '',
        smetaHajm: smeta, narx, smetaSumma, faktHajm: fakt, faktSumma, f2Hajm, f2Summa, farqHajm: farq, farqSumma,
        izoh: [izohOf(q, smeta, fakt, farq), f2Narxda ? 'сумма факта — по цене утвержденной Ф-2' : ''].filter(Boolean).join('; '),
        nomalum, kat: q.kat ?? null, bolalar: [], norma: q.norma ?? null, otaIdx, f2Narxda: f2Narxda || undefined, f2SummaNomalum: f2SummaV == null || undefined,
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
    out.push(it);
    return out.length - 1;
  };
  function yigindi(r: SlichitelniyQator, b: number[]) {
    r.bolalar = b;
    r.nomalum = b.reduce((s, i) => s + out[i].nomalum, 0);
    // Egasi qoidasi (2026-10-08): summa har doim ko'rinadi — narxsiz barg faqat o'zi bo'sh, bildirishnoma alohida.
    const s = (f: (x: SlichitelniyQator) => number | null) => yigindi2(b.map((i) => f(out[i])));
    r.smetaSumma = s((x) => x.smetaSumma);
    r.faktSumma = s((x) => x.faktSumma);
    r.farqSumma = s((x) => x.farqSumma);
    r.f2Summa = yaxlit2(b.reduce((t, i) => t + out[i].f2Summa, 0));
  }

  const ildizlar: number[] = [];
  for (const q of bolalar.get(null) ?? []) { const i = qayta(q, 0, null, 0); if (i != null) ildizlar.push(i); }
  // Svod yaxlit (egasi): bo'lim smetasi = yaxlit; fakti = yaxlit × (bo'lim fakti / bo'lim smetasi); qatorlarga tiyingacha
  // taqsim (Σ aynan); отклонение = fakt − smeta. F2 aynan qoladi. Filtrlangan ro'yxatda (faqatFarq) taqsim yo'q.
  if (o.svodYaxlit?.bolimlar?.length && !o.faqatFarq) {
    for (const b of o.svodYaxlit.bolimlar) {
      const leaves = bolimBarglari(out, Number(b.qator_id));
      if (!leaves?.length) continue;
      const lump = Number(b.qqssiz);
      const sm = yigindi2(leaves.map((i) => out[i].smetaSumma)), fk = yigindi2(leaves.map((i) => out[i].faktSumma));
      // Svod: fakt = yaxlit × (bo'lim fakti / bo'lim smetasi); bo'lim fakti summalari narx qoidasidan (F2 narxida). F2 aynan.
      const fJami = yaxlitBolimJami(lump, sm, fk);
      // Noma'lum (null) qatorlar taqsimga kirmaydi va null qoladi (0 emas); fakt — faqat ma'lum qatorlar bo'yicha, diqqatda aytiladi.
      const G = yaxlitQatorlarga(lump, leaves.map((i) => ({ id: i, summa: out[i].smetaSumma })));
      const I = fJami == null ? null : yaxlitQatorlarga(fJami, leaves.map((i) => ({ id: i, summa: out[i].faktSumma })));
      if (!G) continue;
      for (const i of leaves) {
        const r = out[i];
        r.smetaSumma = G.get(i) ?? null;
        r.faktSumma = I?.get(i) ?? null;
        r.farqSumma = r.faktSumma == null || r.smetaSumma == null ? null : yaxlit2(r.faktSumma - r.smetaSumma);
        r.yaxlitTaqsim = Number(b.qator_id);
      }
      const bilinmas = leaves.filter((i) => out[i].faktSumma == null).length;
      if (bilinmas) diqqat.push({ nom: `Раздел по своду: ${b.nom ?? b.qator_id}`, sabab: `нет данных о выполнении по ${bilinmas} поз. — в распределение суммы свода не включены (выполнение раздела — только по известным позициям)` });
    }
    const qayt = (i: number) => { const r = out[i]; if (r.tur === 'barg' || !r.bolalar.length) return; r.bolalar.forEach(qayt); yigindi(r, r.bolalar); };
    out.forEach((r, i) => { if (r.tur === 'itogo' || r.tur === 'bl') qayt(i); });
  }
  const nomalum = ildizlar.reduce((s, i) => s + out[i].nomalum, 0);
  const js = (f: (x: SlichitelniyQator) => number | null) => (!ildizlar.length ? null : yigindi2(ildizlar.map((i) => f(out[i]))));
  return {
    qatorlar: out, ildizlar, diqqat, barglar, ortiq, kam,
    jami: { smeta: js((x) => x.smetaSumma), fakt: js((x) => x.faktSumma), farq: js((x) => x.farqSumma), f2: yaxlit2(ildizlar.reduce((t, i) => t + out[i].f2Summa, 0)) },
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
    (q.bolalar.length ? { f: sumKid(q, col), v: val ?? 0 } : null);
  // Ikki narx: P = ROUND(I × Kf), Q = ROUND(M × Kf); podval ВСЕГО dan keyin.
  const nk: Partial<NakrutkaKoeffitsientlar> = { ...(o.nakrutka ?? {}) };
  nk.НДС = o.ndsFoiz ?? nk.НДС ?? NDS_SUKUT_FOIZ;
  // Foizlar faqat podvaldan (server meros rejimi); noma'lum — к оплате bo'sh, 0 emas.
  const podval = o.podval ? serverMerosKoefQoy(o.podval, nk, o.nkManba) : null;
  const kfJS = kategoriyaKf(nk, podval);
  const ndsFoiz = podvalNdsFoiz(podval, nk);
  const yax = (q: SlichitelniyQator) => q.tur === 'barg' && (!!o.yaxlitIdlar?.has(q.id) || q.yaxlitTaqsim != null);
  const yaxlitBor = model.qatorlar.some(yax);
  // Kategoriyasi ko'rsatilmagan barglar: ustamasiz, faqat QQS; podvalda alohida qator (summa yashirilmaydi).
  const katsizmi = (q: SlichitelniyQator) => q.tur === 'barg' && !yax(q) && !nakrutkaKat(q.kat);
  const nomalumQ: Record<string, number> = { G: 0, I: 0, K: 0, M: 0 };
  for (const q of model.qatorlar.filter(katsizmi)) { nomalumQ.G += q.smetaSumma ?? 0; nomalumQ.I += q.faktSumma ?? 0; nomalumQ.K += q.f2Summa; nomalumQ.M += q.farqSumma ?? 0; }
  const nomalumBor = Object.values(nomalumQ).some((x) => Math.abs(x) >= 0.005);
  const kfQ = podvalKfQatorlari(bosh + model.qatorlar.length + 2, podval, yaxlitBor, nomalumBor);
  const ndsQ = podvalQatorRaqami(bosh + model.qatorlar.length + 2, podval, 'nds', yaxlitBor, nomalumBor);
  const yaxKf = ndsQ != null ? `(1+F${ndsQ}/100)` : '1';
  // Taqsimlangan svod qatorlari к оплате (egasi 2026-10-30): bo'lim svod summasi QQS BILAN (yakuniy) qatorlarga taqsimlanadi —
  // P (выполнено) = svod × (fakt / smeta) taqsimi, Q = P − svod taqsimi; Σ aynan. Svod ma'lumoti yo'q — ×(1+QQS) taqsim.
  const bolimOf = new Map((o.svodYaxlit?.bolimlar ?? []).map((b) => [Number(b.qator_id), b]));
  const koTaqsim = new Map<string, number>();
  {
    const guruh = new Map<number, { I: Map<number, number>; G: Map<number, number> }>();
    model.qatorlar.forEach((q, i) => { if (q.yaxlitTaqsim == null) return; const g = guruh.get(q.yaxlitTaqsim) ?? { I: new Map(), G: new Map() }; if (q.faktSumma != null) g.I.set(i, q.faktSumma); if (q.smetaSumma != null) g.G.set(i, q.smetaSumma); guruh.set(q.yaxlitTaqsim, g); });
    for (const [bid, g] of guruh) {
      const b = bolimOf.get(bid);
      const qb = b ? bolimQqsBilan(b, ndsFoiz) : null;
      const sG = [...g.G.values()].reduce((a, x) => a + x, 0), sI = [...g.I.values()].reduce((a, x) => a + x, 0);
      const pJami = qb == null ? null : yaxlitKorinish(qb, sG, sI);
      const P = pJami == null ? yaxlitKOplateTaqsim(g.I, ndsFoiz) : yaxlitQatorlarga(pJami, [...g.I].map(([id, summa]) => ({ id, summa })));
      const Gk = qb == null ? yaxlitKOplateTaqsim(g.G, ndsFoiz) : yaxlitQatorlarga(qb, [...g.G].map(([id, summa]) => ({ id, summa })));
      if (!P || !Gk) continue;
      for (const [i, gv] of Gk) koTaqsim.set(`${i}G`, gv);
      for (const [i, pv] of P) { koTaqsim.set(`${i}P`, pv); const gv = Gk.get(i); if (gv != null) koTaqsim.set(`${i}Q`, yaxlit2(pv - gv)); }
    }
  }  const koMemo = new Map<string, number | null>();
  const koOf = (i: number, c: 'P' | 'Q'): number | null => {
    const key = `${i}${c}`;
    if (koMemo.has(key)) return koMemo.get(key)!;
    const q = model.qatorlar[i];
    let val: number | null;
    if (q.tur === 'barg') val = koTaqsim.has(key) ? koTaqsim.get(key)! : kOplate(c === 'P' ? q.faktSumma : q.farqSumma, nakrutkaKat(q.kat), kfJS, yax(q), ndsFoiz);
    else if (q.tur === 'rz') val = null;
    else { const vs = q.bolalar.map((k) => koOf(k, c)); val = !vs.length || vs.some((x) => x == null) ? null : yaxlit2(vs.reduce<number>((a2, b2) => a2 + (b2 ?? 0), 0)); }
    koMemo.set(key, val);
    return val;
  };
  const koYig = (idx: readonly number[], c: 'P' | 'Q'): Qiymat => {
    if (!idx.length) return null;
    const rows = idx.map(rowOf);
    const vs = idx.map((k) => koOf(k, c));
    return { f: sumRefs(c, rows), v: yaxlit2(vs.reduce<number>((a2, b2) => a2 + (b2 ?? 0), 0)) };
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
        // Svod bo'limiga taqsimlangan qator: G/I/M — bo'lim yaxlit summasidan taqsim (qiymat, formula emas).
        q.yaxlitTaqsim != null ? qiy(q.smetaSumma) : { f: `IF(OR(E${n}="",F${n}=""),"",ROUND(E${n}*F${n},2))`, v: q.smetaSumma ?? '' },
        qiy(q.faktHajm),
        // Narx qoidasi (yadro): F2 bor — ROUND(H × K / J); yo'q — ROUND(H × F). Kesh = formula.
        q.yaxlitTaqsim != null ? qiy(q.faktSumma) : { f: faktSummaF2NarxFormula(`H${n}`, `J${n}`, `K${n}`, `IF(OR(H${n}="",F${n}=""),"",ROUND(H${n}*F${n},2))`), v: q.faktSumma ?? '' },
        q.f2Hajm, q.f2SummaNomalum ? '' : q.f2Summa,
        { f: `IF(OR(E${n}="",H${n}=""),"",H${n}-E${n})`, v: q.farqHajm ?? '' },
        q.yaxlitTaqsim != null ? { f: `ROUND(I${n}-G${n},2)`, v: q.farqSumma ?? '' } : { f: `IF(OR(G${n}="",I${n}=""),"",ROUND(I${n}-G${n},2))`, v: q.farqSumma ?? '' },
        q.izoh || null,
        q.narx == null && mashinistMehnati(q) ? 0 : { f: `IF(OR(G${n}="",I${n}="",M${n}=""),1,0)`, v: q.nomalum },
        ...((): Qiymat[] => {
          // Svod yaxlit bo'limi: ustama yo'q, faqat QQS (к оплате = прямые × (1+НДС)).
          if (koTaqsim.has(`${i}P`)) return [koTaqsim.get(`${i}P`)!, koTaqsim.get(`${i}Q`) ?? null, YAXLIT_KAT];
          if (yax(q)) return ndsQ == null || ndsFoiz == null ? [null, null, YAXLIT_KAT] : [{ f: `IF(I${n}="","",ROUND(I${n}*${yaxKf},2))`, v: koOf(i, 'P') ?? '' }, { f: `IF(M${n}="","",ROUND(M${n}*${yaxKf},2))`, v: koOf(i, 'Q') ?? '' }, YAXLIT_KAT];
          const kat = nakrutkaKat(q.kat);
          if (!kat) {
            katsiz.push(`${q.nom}${q.birlik ? `, ${q.birlik}` : ''}`);
            // Vid zatrat ko'rsatilmagan: ustamasiz, faqat QQS (server kabi); podvalda «ВИД ЗАТРАТ НЕ УКАЗАН» qatori.
            return ndsQ == null || ndsFoiz == null ? [null, null, NOMALUM_KAT] : [{ f: `IF(I${n}="","",ROUND(I${n}*${yaxKf},2))`, v: koOf(i, 'P') ?? '' }, { f: `IF(M${n}="","",ROUND(M${n}*${yaxKf},2))`, v: koOf(i, 'Q') ?? '' }, NOMALUM_KAT];
          }
          if (kfJS[kat] == null) return [null, null, kat]; // Kf noma'lum — bo'sh, formula yo'q
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
      { f: ref('G'), v: model.jami.smeta ?? '' }, null,
      { f: ref('I'), v: model.jami.fakt ?? '' }, null,
      { f: ref('K'), v: model.jami.f2 }, null,
      { f: ref('M'), v: model.jami.farq ?? '' }, null,
      { f: ref('O'), v: nomalum },
      koYig(model.ildizlar, 'P'), koYig(model.ildizlar, 'Q'), null,
    ]);
    // Nakrutka podvali (смета, выполнено, принято Ф-2, отклонение) — к оплате.
    v.bosh();
    const katSummalar: Record<string, KatSummalar> = {};
    for (const c of ['G', 'I', 'K', 'M'] as const) {
      const ks = Object.fromEntries(NAKRUTKA_KATLAR.map((k) => [k, 0])) as KatSummalar;
      for (const q of model.qatorlar) {
        const kat = q.tur === 'barg' && !yax(q) ? nakrutkaKat(q.kat) : null;
        if (!kat) continue;
        const val = c === 'G' ? q.smetaSumma : c === 'I' ? q.faktSumma : c === 'K' ? q.f2Summa : q.farqSumma;
        if (val != null) ks[kat] += val;
      }
      katSummalar[c] = ks;
    }
    // Svod yaxlit podval qatori — QQS BILAN (НДС dan keyin, aynan; egasi 2026-10-30): smeta ustuni — svod summasi;
    // выполнено — svod × (fakt / smeta) (taqsimlangan qatorlar «к оплате» yig'indisi); F2 — aynan × (1+QQS); отклонение = выполнено − smeta.
    let yaxlit: Record<string, number> | null = null;
    let yaxlitF: Record<string, string> | null = null;
    const [a1, b1] = [bosh, bosh + model.qatorlar.length - 1];
    const sumif = (kat: string, col: string) => `SUMIF(R${a1}:R${b1},"${kat}",${col}${a1}:${col}${b1})`;
    if (yaxlitBor && ndsFoiz != null && ndsQ != null) {
      const yi = model.qatorlar.map((q, i) => (yax(q) ? i : -1)).filter((i) => i >= 0);
      const kSum = yaxlitKOplate(yigindi2(yi.map((i) => model.qatorlar[i].f2Summa)), ndsFoiz) ?? 0;
      const pSum = yigindi2(yi.map((i) => koOf(i, 'P')));
      const svQ = o.svodYaxlit && !o.faqatFarq ? svodYaxlitQqs(o.svodYaxlit, ndsFoiz)?.qqsBilan ?? null : null;
      const taqsimlangan = yi.some((i) => koTaqsim.has(`${i}G`));
      const gSum = taqsimlangan ? yigindi2(yi.map((i) => koTaqsim.get(`${i}G`))) : svQ ?? yaxlitKOplate(yigindi2(yi.map((i) => model.qatorlar[i].smetaSumma)), ndsFoiz) ?? 0;
      yaxlit = { G: gSum, I: pSum, K: kSum, M: yaxlit2(pSum - gSum) };
      yaxlitF = { I: sumif(YAXLIT_KAT, 'P'), K: `ROUND(${sumif(YAXLIT_KAT, 'K')}*${yaxKf},2)`, M: `ROUND(${sumif(YAXLIT_KAT, 'P')}-${gSum},2)` };
    }    const nomalumP = nomalumBor ? Object.fromEntries(Object.entries(nomalumQ).map(([k, x]) => [k, yaxlit2(x)])) : null;
    const nomalumF = nomalumBor ? Object.fromEntries(['G', 'I', 'K', 'M'].map((col) => [col, sumif(NOMALUM_KAT, col)])) : null;
    const p = nakrutkaPodvaliYoz(v, { podval, katUstun: 'R', oraliq: [a1, b1], pulUstunlar: ['G', 'I', 'K', 'M'], foizUstun: 'F', nk, katSummalar, yaxlit, yaxlitF, nomalum: nomalumP, nomalumF });
    if (p.kfQator.ЧЕЛ !== kfQ.ЧЕЛ) throw new Error('SLICHITELNIY_PODVAL_SILJIDI');
  }
  v.bosh();
  v.izoh('Отклонение = фактически выполнено − по смете: «+» — выполнено сверх сметы, «−» — не выполнено. Стоимость граф 7, 9 и 13 — по сметным ценам (прямые затраты), без накладных расходов и НДС; графа 11 — по утвержденным актам формы № 2. Ведомость фиксирует расхождения и не изменяет сметные и фактические данные.');
  if (model.jami.smeta == null && model.ildizlar.length) v.izoh('Итоги не определены: есть позиции без количества, выполнения или цены — см. перечень ниже.');
  v.izoh('Графы 15–16 — стоимость к оплате: прямые затраты × коэффициент по виду затрат (раздел «Расчет стоимости к оплате»).');
  if (yaxlitBor) v.izoh(YAXLIT_IZOH);
  if (Object.values(kfJS).some((x) => x == null)) v.izoh('Проценты накладных и прочих расходов для объекта не заданы — стоимость к оплате не определена (проценты не принимаются равными 0).');
  v.diqqat(model.diqqat);
  if (katsiz.length) v.diqqat(katsiz.map((nom) => ({ nom, sabab: 'не указан вид затрат — к оплате без накрутки (только НДС), в расчете отдельной строкой' })), 'ВИД ЗАТРАТ НЕ УКАЗАН');
  v.imzo(imzoTomonlari(['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'ТЕХНАДЗОР', 'СОСТАВИЛ'], o.imzo));
  const { bytes } = rasmiyKitob([v], { tur: 'slichitelniy' });
  const kv = (c: 'P' | 'Q') => { const x = model.ildizlar.map((i) => koOf(i, c)); return x.length ? yigindi2Qatiy(x) : null; };
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNomi, hujjat: 'СЛИЧИТЕЛЬНАЯ_ВЕДОМОСТЬ', davr: sana }), kOplata: { fakt: kv('P'), farq: kv('Q') } };
}
