/**
 * LRV — Лимитно-ресурсная ведомость, YANGI shakl (egasi, 2026-10-02):
 *   "LRV ham F2 shaklida bo'ladi, faqat unda butun boshli smeta turadi. Ishlashga ideal qulay, vizual charchatmaydigan,
 *    qidirish maksimal oson; gruppirovka ideal; resurs vedomosti ideal; hamma hisob sonlari formulalar orqali;
 *    kuch yetsa pivot ham."
 *
 * Tuzilma — Ф-2 (lib/f2-hujjat) bilan bir xil yozuvchi va A–I ustunlari (smeta/F2 importi o'qiydi):
 *   A №  B Шифр  C Наименование  D Ед.  E Расход на ед.  F|G|H По смете (кол-во, цена, сумма)  I Тип  J Кат (yashirin)
 *   K|L Выполнено (факт)   M|N Принято по Ф-2   O|P Остаток по смете (F−K, H−L)   Q|R Можно предъявить в Ф-2 (K−M, L−N)
 *   S Ресурс kaliti (yashirin, vedomost SUMIF uchun)   T Барг (yashirin: 1 — barg)   U КАЛИТ (yashirin, qayta import)
 *
 * Qonunlar:
 *  • Har smeta tuguni — BITTA qator: bo'lim va ish qatorlari o'z jamini formulada ko'rsatadi, shuning uchun guruh
 *    (Excel +/−) yig'ilganda ham jami ko'rinadi (xulosa qatori yuqorida).
 *  • Jamilar faqat barglardan (T=1): ichida narxi noma'lum barg bo'lsa jami BO'SH (NULL ≠ 0, H7).
 *  • Resurs hajmi = norma × ish hajmi (formula) — faqat smetadagi qiymat shunga teng bo'lsa; aks holda qiymat.
 *  • $ yo'q (nisbiy formulalar), muzlatilgan sarlavha va № | Шифр | Наименование, avtofiltr, yumshoq qator ranglari.
 */
import type { T2Qator, T2QatorHolat } from '../api/supabase';
import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import { RANG_TARTIB, RasmiyVaraq, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, yaxlit2, type ImzoNomlar, type QatorRangi, type RangMavzusi, type Qiymat, type RasmiyUstun } from './hujjat-yozuvchi';
import { NAKRUTKA_KATLAR, nakrutkaKat, nakrutkaPodvaliYoz, type KatSummalar, type NakrutkaKat } from './nakrutka-podval';
import { podvalgaKoefQoy, type Podval } from './nakrutka-konstruktor';
import { lrvKalitYoz } from './lrv-qayta-import';
import { davrMatni } from './nakopitelniy-vedomost-export';

export type LrvHujjatOpsiya = {
  obyektNom: string;
  /** Hisobot sanasi/davri (ixtiyoriy) — sarlavha ostida. */
  davr?: string | null;
  imzo?: ImzoNomlar;
  shartnoma?: string | null;
  ndsFoiz?: number | null;
  nakrutka?: Partial<NakrutkaKoeffitsientlar> | null;
  podval?: Podval | null;
  mavzu?: RangMavzusi;
};

const U: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Шифр, код', kenglik: 15, tur: 'kod' },
  { sarlavha: 'Наименование работ и затрат', kenglik: 54, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 11, tur: 'birlik' },
  { sarlavha: 'Расход на ед.', kenglik: 10, tur: 'norma' },
  { sarlavha: 'Количество', kenglik: 13, tur: 'hajm', guruh: 'По смете' },
  { sarlavha: 'Цена за ед., сум', kenglik: 14, tur: 'narx', guruh: 'По смете' },
  { sarlavha: 'Сумма, сум', kenglik: 16, tur: 'pul', guruh: 'По смете' },
  { sarlavha: 'Тип', kenglik: 6, tur: 'birlik' },
  { sarlavha: 'Кат.', kenglik: 8, tur: 'texnik', yashirin: true },
  { sarlavha: 'Количество', kenglik: 12, tur: 'hajm', guruh: 'Выполнено (факт)' },
  { sarlavha: 'Сумма, сум', kenglik: 15, tur: 'pul', guruh: 'Выполнено (факт)' },
  { sarlavha: 'Количество', kenglik: 12, tur: 'hajm', guruh: 'Принято по Ф-2' },
  { sarlavha: 'Сумма, сум', kenglik: 15, tur: 'pul', guruh: 'Принято по Ф-2' },
  { sarlavha: 'Количество', kenglik: 12, tur: 'hajm', guruh: 'Остаток по смете' },
  { sarlavha: 'Сумма, сум', kenglik: 15, tur: 'pul', guruh: 'Остаток по смете' },
  { sarlavha: 'Количество', kenglik: 12, tur: 'hajm', guruh: 'Можно предъявить в Ф-2' },
  { sarlavha: 'Сумма, сум', kenglik: 15, tur: 'pul', guruh: 'Можно предъявить в Ф-2' },
  { sarlavha: 'Ресурс', kenglik: 7, tur: 'texnik', yashirin: true },
  { sarlavha: 'Лист', kenglik: 4, tur: 'texnik', yashirin: true },
  { sarlavha: 'КАЛИТ', kenglik: 10, tur: 'texnik', yashirin: true },
];
/** Ustun harflari (U jadvali bilan bir xil tartib). */
const C = { kod: 'B', nom: 'C', norma: 'E', F: 'F', G: 'G', H: 'H', I: 'I', J: 'J', K: 'K', L: 'L', M: 'M', N: 'N', O: 'O', P: 'P', Q: 'Q', R: 'R', S: 'S', T: 'T' } as const;
const PUL = ['H', 'L', 'N'] as const;

const son = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const y6 = (x: number) => Math.round(x * 1e6) / 1e6;
const BARG = new Set(['rs', 'mat', 'ob']);

type Tugun = { q: T2Qator; bolalar: Tugun[]; olcham: number; barg: boolean };
type Resurs = { kalit: string; kat: NakrutkaKat | null; kod: string; nom: string; birlik: string; narxlar: Set<number>; hajm: number; summa: number | null; fakt: number; faktSumma: number | null };

/** Smeta daraxti (ota_id + tartib). Har tugun o'zi + avlodlari soni (olcham) — qatorlar oldindan ma'lum bo'lishi uchun. */
function daraxt(rows: readonly T2Qator[]): Tugun[] {
  const bolalar = new Map<number | null, T2Qator[]>();
  const bor = new Set(rows.map((r) => r.id));
  for (const r of rows) { const k = r.ota_id != null && bor.has(r.ota_id) ? r.ota_id : null; if (!bolalar.has(k)) bolalar.set(k, []); bolalar.get(k)!.push(r); }
  for (const a of bolalar.values()) a.sort((p, q) => (p.tartib ?? 0) - (q.tartib ?? 0) || p.id - q.id);
  const qur = (ota: number | null): Tugun[] => (bolalar.get(ota) ?? []).map((q) => {
    const b = qur(q.id);
    const barg = BARG.has(q.tur ?? '') || (q.tur === 'bl' && b.length === 0);
    return { q, bolalar: b, barg, olcham: 1 + b.reduce((s, x) => s + x.olcham, 0) };
  });
  return qur(null);
}

/** Bo'sh barg bo'lsa "" — aks holda barglar (T=1) yig'indisi. NULL ≠ 0. */
const bargJami = (c: string, a: number, b: number) => `IF(COUNTIFS(${C.T}${a}:${C.T}${b},1,${c}${a}:${c}${b},"")>0,"",SUMIFS(${c}${a}:${c}${b},${C.T}${a}:${C.T}${b},1))`;

export function lrvHujjat(rows: readonly T2Qator[], holat: readonly T2QatorHolat[], o: LrvHujjatOpsiya): { bytes: Uint8Array; faylNomi: string; jami: number | null; yacheykalar: number } {
  const h = new Map(holat.map((x) => [x.qator_id, x]));
  const ildiz = daraxt(rows);
  if (!ildiz.length) throw new Error('LRV_BOSH');
  const v = new RasmiyVaraq({
    nom: 'LRV',
    sarlavha: 'ЛИМИТНО-РЕСУРСНАЯ ВЕДОМОСТЬ (ЛРВ)',
    ostSarlavha: [o.davr ? `по состоянию на: ${davrMatni(o.davr)}` : 'по состоянию на дату выгрузки'],
    titul: [['Объект:', o.obyektNom], ['Заказчик:', o.imzo?.zakazchik], ['Подрядчик:', o.imzo?.pudratchi], ...(o.imzo?.subpudratchi ? [['Субподрядчик:', o.imzo.subpudratchi] as const] : []), ['Договор:', o.shartnoma]],
    ustunlar: U,
    yonalish: 'landscape',
    muzlatUstun: 3,
    filtr: true,
  });

  const resurslar = new Map<string, Resurs>();
  const ks: Record<(typeof PUL)[number], KatSummalar> = {
    H: Object.fromEntries(NAKRUTKA_KATLAR.map((k) => [k, 0])) as KatSummalar,
    L: Object.fromEntries(NAKRUTKA_KATLAR.map((k) => [k, 0])) as KatSummalar,
    N: Object.fromEntries(NAKRUTKA_KATLAR.map((k) => [k, 0])) as KatSummalar,
  };
  const jamiJS: Record<(typeof PUL)[number], number | null> = { H: 0, L: 0, N: 0 };
  const diqqat: Array<{ nom: string; sabab: string; joy?: string }> = [];
  let n = 0;
  const birinchi = v.r;

  const yoz = (t: Tugun, daraja: number, ishQator: number | null, ishHajm: number | null) => {
    const q = t.q;
    const hq = h.get(q.id);
    const kat = nakrutkaKat(q.kat) ?? (q.tur === 'mat' ? 'МАТ' : q.tur === 'ob' ? 'ОБ' : null);
    const kalit = lrvKalitYoz(q.id, q.kod, q.nom, q.birlik);
    const tur = q.tur ?? '';
    if (q.tur === 'rz') {
      const r0 = v.r, a = r0 + 1, b = r0 + t.olcham - 1;
      v.qator('bolim', (r): Qiymat[] => [null, null, q.nom || 'Раздел', null, null, null, null,
        b >= a ? { f: bargJami(C.H, a, b), v: '' } : null, 'rz', null,
        null, b >= a ? { f: bargJami(C.L, a, b), v: '' } : null, null, b >= a ? { f: bargJami(C.N, a, b), v: '' } : null,
        null, { f: `IF(OR(H${r}="",L${r}=""),"",ROUND(H${r}-L${r},2))`, v: '' }, null, { f: `IF(OR(L${r}="",N${r}=""),"",ROUND(L${r}-N${r},2))`, v: '' },
        null, 0, kalit], { daraja });
      for (const b2 of t.bolalar) yoz(b2, daraja + 1, null, null);
      return;
    }
    if (!t.barg) {
      // Ish (bl) — o'z hajmi; summa/fakt/F2 — resurslaridan formula; birlik narxi = summa / hajm.
      const r0 = v.r, a = r0 + 1, b = r0 + t.olcham - 1;
      const F = son(q.hajm) ?? son(hq?.smeta_hajm);
      v.qator('ish', (r): Qiymat[] => [++n, q.kod ?? '', q.nom || 'Nomsiz', q.birlik ?? '', null,
        F, { f: `IF(OR(F${r}="",F${r}=0,H${r}=""),"",ROUND(H${r}/F${r},2))`, v: '' }, { f: bargJami(C.H, a, b), v: '' }, 'bl', null,
        son(hq?.fakt_hajm) ?? 0, { f: bargJami(C.L, a, b), v: '' }, son(hq?.f2_hajm) ?? 0, { f: bargJami(C.N, a, b), v: '' },
        { f: `IF(F${r}="","",ROUND(F${r}-K${r},6))`, v: '' }, { f: `IF(OR(H${r}="",L${r}=""),"",ROUND(H${r}-L${r},2))`, v: '' },
        { f: `ROUND(K${r}-M${r},6)`, v: '' }, { f: `IF(OR(L${r}="",N${r}=""),"",ROUND(L${r}-N${r},2))`, v: '' },
        null, 0, kalit], { daraja });
      for (const b2 of t.bolalar) yoz(b2, daraja + 1, r0, F);
      return;
    }
    // Barg: resurs, material, uskuna (yoki resurssiz ish).
    const narx = son(q.narx);
    const smetaHajm = son(q.hajm) ?? son(hq?.smeta_hajm) ?? 0;
    const norma = son(q.norma);
    const normaFormula = ishQator != null && ishHajm != null && norma != null && norma > 0 && Math.abs(y6(norma * ishHajm) - smetaHajm) <= 1e-6;
    const fakt = son(hq?.fakt_hajm) ?? 0;
    const faktSumma = son(hq?.fakt_summa) ?? (fakt === 0 ? 0 : narx != null ? yaxlit2(fakt * narx) : null);
    const f2 = son(hq?.f2_hajm) ?? 0;
    const f2Summa = son(hq?.f2_summa) ?? (f2 === 0 ? 0 : narx != null ? yaxlit2(f2 * narx) : null);
    const summa = narx != null ? yaxlit2(smetaHajm * narx) : null;
    if (narx == null) diqqat.push({ nom: `${q.kod ? `${q.kod} ` : ''}${q.nom ?? ''}`.trim(), sabab: 'цена не указана в смете — суммы по разделу не подсчитываются' });
    for (const [c, x] of [['H', summa], ['L', faktSumma], ['N', f2Summa]] as const) {
      jamiJS[c] = jamiJS[c] == null || x == null ? null : yaxlit2(jamiJS[c]! + x);
      if (kat && x != null) ks[c][kat] = yaxlit2(ks[c][kat] + x);
    }
    const rk = `${kat ?? ''}|${(q.kod ?? '').trim()}|${(q.nom ?? '').trim()}|${(q.birlik ?? '').trim()}`;
    const res = resurslar.get(rk) ?? { kalit: `Р${resurslar.size + 1}`, kat, kod: (q.kod ?? '').trim(), nom: (q.nom ?? '').trim() || 'Nomsiz', birlik: (q.birlik ?? '').trim(), narxlar: new Set<number>(), hajm: 0, summa: 0, fakt: 0, faktSumma: 0 };
    res.hajm = y6(res.hajm + smetaHajm); res.fakt = y6(res.fakt + fakt);
    res.summa = res.summa == null || summa == null ? null : yaxlit2(res.summa + summa);
    res.faktSumma = res.faktSumma == null || faktSumma == null ? null : yaxlit2(res.faktSumma + faktSumma);
    if (narx != null) res.narxlar.add(narx);
    resurslar.set(rk, res);
    v.qator('oddiy', (r): Qiymat[] => [++n, q.kod ?? '', q.nom || 'Nomsiz', q.birlik ?? '',
      norma != null ? { n: norma, uslub: 'norma' } : null,
      normaFormula ? { f: `ROUND(E${r}*F${ishQator},6)`, v: smetaHajm } : smetaHajm,
      narx, narx != null ? { f: `ROUND(F${r}*G${r},2)`, v: summa } : null, tur, kat ?? '',
      fakt, faktSumma == null ? null : son(hq?.fakt_summa) != null || fakt === 0 ? faktSumma : { f: `IF(G${r}="","",ROUND(K${r}*G${r},2))`, v: faktSumma },
      f2, f2Summa,
      { f: `ROUND(F${r}-K${r},6)`, v: y6(smetaHajm - fakt) }, { f: `IF(OR(H${r}="",L${r}=""),"",ROUND(H${r}-L${r},2))`, v: summa == null || faktSumma == null ? '' : yaxlit2(summa - faktSumma) },
      { f: `ROUND(K${r}-M${r},6)`, v: y6(fakt - f2) }, { f: `IF(OR(L${r}="",N${r}=""),"",ROUND(L${r}-N${r},2))`, v: faktSumma == null || f2Summa == null ? '' : yaxlit2(faktSumma - f2Summa) },
      res.kalit, 1, kalit,
    ], { daraja, rang: kat && (RANG_TARTIB as readonly string[]).includes(kat) ? kat as QatorRangi : null });
  };
  for (const t of ildiz) yoz(t, 0, null, null);
  const oxirgi = v.r - 1;
  v.filtrOxiri(oxirgi);

  const itogoR = v.qator('vsego', (r): Qiymat[] => [null, null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ ПО СМЕТЕ', null, null, null, null,
    { f: bargJami(C.H, birinchi, oxirgi), v: jamiJS.H ?? '' }, null, null,
    null, { f: bargJami(C.L, birinchi, oxirgi), v: jamiJS.L ?? '' }, null, { f: bargJami(C.N, birinchi, oxirgi), v: jamiJS.N ?? '' },
    null, { f: `IF(OR(H${r}="",L${r}=""),"",ROUND(H${r}-L${r},2))`, v: jamiJS.H == null || jamiJS.L == null ? '' : yaxlit2(jamiJS.H - jamiJS.L) },
    null, { f: `IF(OR(L${r}="",N${r}=""),"",ROUND(L${r}-N${r},2))`, v: jamiJS.L == null || jamiJS.N == null ? '' : yaxlit2(jamiJS.L - jamiJS.N) },
    null, null, null]);

  v.bosh();
  const nk: Partial<NakrutkaKoeffitsientlar> = { ...(o.nakrutka ?? {}) };
  if (o.ndsFoiz != null && Number.isFinite(o.ndsFoiz) && o.ndsFoiz >= 0) nk.НДС = o.ndsFoiz;
  const podval = o.podval ? podvalgaKoefQoy(o.podval, nk) : null;
  nakrutkaPodvaliYoz(v, { podval, katUstun: 'J', oraliq: [birinchi, oxirgi], pulUstunlar: [...PUL], foizUstun: 'G', nk, katSummalar: ks, kfJadval: false });
  v.diqqat(diqqat);
  v.imzo(imzoTomonlari(o.imzo?.subpudratchi ? ['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'СУБПОДРЯДЧИК', 'ТЕХНАДЗОР'] : ['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'ТЕХНАДЗОР'], o.imzo));

  const rv = resursVedomosti([...resurslar.values()], { nom: v.nom, a: birinchi, b: oxirgi, itogoR, jami: jamiJS.H, obyektNom: o.obyektNom });
  const sv = svod({ nom: v.nom, a: birinchi, b: oxirgi, obyektNom: o.obyektNom, ks, jamiJS });
  const { bytes, yacheykalar } = rasmiyKitob([v, rv, sv], { mavzu: o.mavzu, tur: 'lrv' });
  return {
    bytes, yacheykalar,
    faylNomi: hujjatFaylNomi({ obyekt: o.obyektNom, hujjat: 'ЛРВ', davr: (o.davr ?? '').slice(0, 7) }),
    jami: jamiJS.H == null ? null : yaxlit2(jamiJS.H),
  };
}

const VED: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Код ресурса', kenglik: 13, tur: 'kod' },
  { sarlavha: 'Наименование ресурса', kenglik: 52, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 11, tur: 'birlik' },
  { sarlavha: 'Количество', kenglik: 14, tur: 'hajm', guruh: 'По смете' },
  { sarlavha: 'Цена за ед., сум', kenglik: 14, tur: 'narx', guruh: 'По смете' },
  { sarlavha: 'Сумма, сум', kenglik: 16, tur: 'pul', guruh: 'По смете' },
  { sarlavha: 'Количество', kenglik: 13, tur: 'hajm', guruh: 'Выполнено (факт)' },
  { sarlavha: 'Сумма, сум', kenglik: 15, tur: 'pul', guruh: 'Выполнено (факт)' },
  { sarlavha: 'Количество', kenglik: 13, tur: 'hajm', guruh: 'Остаток' },
  { sarlavha: 'Сумма, сум', kenglik: 15, tur: 'pul', guruh: 'Остаток' },
  { sarlavha: '% выполнения', kenglik: 10, tur: 'foiz' },
];
const VED_GURUH: Record<NakrutkaKat, string> = {
  ЧЕЛ: 'ЗАТРАТЫ ТРУДА РАБОЧИХ (ЧЕЛ)', МАШ: 'МАШИНЫ И МЕХАНИЗМЫ (МАШ)', МАТ: 'МАТЕРИАЛЫ (МАТ)', ОБ: 'ОБОРУДОВАНИЕ (ОБ)',
  КАБ: 'КАБЕЛИ И ПРОВОДА (КАБ)', 'М/К': 'МЕТАЛЛОКОНСТРУКЦИИ (М/К)', 'БЕЗ СКЛАД': 'МАТЕРИАЛЫ БЕЗ СКЛАДСКОГО ХРАНЕНИЯ (БЕЗ СКЛАД)',
};

/**
 * Ведомость ресурсов по смете — har resurs bitta qator, LRV varag'idan SUMIF (yashirin "Ресурс" kaliti bo'yicha:
 * nomlardagi * va ? shablon bo'lib qolmaydi, minglab qatorda ham formula qisqa). Turi bo'yicha guruhlar, guruh jamlari,
 * bajarilish foizi; oxirida LRV ИТОГО bilan solishtiruv (0 bo'lishi shart).
 */
function resursVedomosti(rs: Resurs[], o: { nom: string; a: number; b: number; itogoR: number; jami: number | null; obyektNom: string }): RasmiyVaraq {
  const ref = (c: string) => `'${o.nom}'!${c}${o.a}:${c}${o.b}`;
  const sumif = (kalit: string, c: string) => `SUMIF(${ref(C.S)},"${kalit}",${ref(c)})`;
  const w = new RasmiyVaraq({ nom: 'Ведомость ресурсов', sarlavha: 'ВЕДОМОСТЬ РЕСУРСОВ ПО СМЕТЕ', titul: [['Объект:', o.obyektNom]], ustunlar: VED, yonalish: 'landscape', muzlatUstun: 3, filtr: true });
  let n = 0;
  const guruhJami: number[] = [];
  let jami: number | null = 0;
  for (const kat of [...NAKRUTKA_KATLAR, null] as const) {
    const g = rs.filter((x) => x.kat === kat).sort((a, b) => a.nom.localeCompare(b.nom, 'ru') || a.kod.localeCompare(b.kod));
    if (!g.length) continue;
    const r0 = w.r, a = r0 + 1, b = r0 + g.length;
    let gJS: number | null = 0;
    for (const x of g) gJS = gJS == null || x.summa == null ? null : yaxlit2(gJS + x.summa);
    jami = jami == null || gJS == null ? null : yaxlit2(jami + gJS);
    const bl = kat ? VED_GURUH[kat] : 'ПРОЧИЕ РЕСУРСЫ (без маркировки)';
    // Guruh qatori — o'z jami bilan (yig'ilganda ham ko'rinadi).
    guruhJami.push(w.qator('bolim', (r): Qiymat[] => [null, null, bl, null, null, null,
      { f: `IF(COUNTBLANK(G${a}:G${b})>0,"",SUM(G${a}:G${b}))`, v: gJS ?? '' }, null,
      { f: `IF(COUNTBLANK(I${a}:I${b})>0,"",SUM(I${a}:I${b}))`, v: '' }, null,
      { f: `IF(OR(G${r}="",I${r}=""),"",ROUND(G${r}-I${r},2))`, v: '' },
      { f: `IF(OR(G${r}="",G${r}=0,I${r}=""),"",ROUND(I${r}/G${r}*100,1))`, v: '' }]));
    const rang = kat && (RANG_TARTIB as readonly string[]).includes(kat) ? kat as QatorRangi : null;
    for (const x of g) {
      const bittaNarx = x.narxlar.size === 1 ? [...x.narxlar][0] : null;
      w.qator('oddiy', (r): Qiymat[] => [++n, x.kod, x.nom, x.birlik,
        { f: `ROUND(${sumif(x.kalit, C.F)},6)`, v: x.hajm },
        bittaNarx != null ? bittaNarx : x.summa != null && x.hajm ? { f: `IF(E${r}=0,"",ROUND(G${r}/E${r},2))`, v: yaxlit2(x.summa / x.hajm) } : null,
        x.summa == null ? null : { f: `ROUND(${sumif(x.kalit, C.H)},2)`, v: x.summa },
        { f: `ROUND(${sumif(x.kalit, C.K)},6)`, v: x.fakt },
        x.faktSumma == null ? null : { f: `ROUND(${sumif(x.kalit, C.L)},2)`, v: x.faktSumma },
        { f: `ROUND(E${r}-H${r},6)`, v: y6(x.hajm - x.fakt) },
        { f: `IF(OR(G${r}="",I${r}=""),"",ROUND(G${r}-I${r},2))`, v: x.summa == null || x.faktSumma == null ? '' : yaxlit2(x.summa - x.faktSumma) },
        { f: `IF(OR(E${r}="",E${r}=0),"",ROUND(H${r}/E${r}*100,1))`, v: x.hajm ? Math.round(x.fakt / x.hajm * 1000) / 10 : '' },
      ], { daraja: 1, rang });
    }
  }
  w.filtrOxiri(w.r - 1);
  const vR = w.qator('vsego', (r): Qiymat[] => [null, null, 'ВСЕГО ПО ВЕДОМОСТИ РЕСУРСОВ', null, null, null,
    // ⚠️ COUNTBLANK faqat BITTA diapazon oladi — bir nechta katak berilsa Excel butun faylni ochmaydi; OR(...) ishlatiladi.
    { f: `IF(OR(${guruhJami.map((q) => `G${q}=""`).join(',')}),"",SUM(${guruhJami.map((q) => `G${q}`).join(',')}))`, v: jami ?? '' }, null,
    { f: `SUM(${guruhJami.map((q) => `I${q}`).join(',')})`, v: '' }, null,
    { f: `IF(OR(G${r}="",I${r}=""),"",ROUND(G${r}-I${r},2))`, v: '' },
    { f: `IF(OR(G${r}="",G${r}=0,I${r}=""),"",ROUND(I${r}/G${r}*100,1))`, v: '' }]);
  w.qator('jami', (): Qiymat[] => [null, null, 'Сверка с ЛРВ: ведомость − итого по смете (должно быть 0,00)', null, null, null,
    { f: `IF(OR(G${vR}="",'${o.nom}'!H${o.itogoR}=""),"",ROUND(G${vR}-'${o.nom}'!H${o.itogoR},2))`, v: jami == null || o.jami == null ? '' : yaxlit2(jami - o.jami) },
    null, null, null, null, null]);
  return w;
}

const SVOD: RasmiyUstun[] = [
  { sarlavha: '№', kenglik: 5, tur: 'tartib' },
  { sarlavha: 'Вид затрат', kenglik: 46, tur: 'matn' },
  { sarlavha: 'По смете, сум', kenglik: 18, tur: 'pul' },
  { sarlavha: 'Выполнено (факт), сум', kenglik: 18, tur: 'pul' },
  { sarlavha: 'Принято по Ф-2, сум', kenglik: 18, tur: 'pul' },
  { sarlavha: 'Остаток по смете, сум', kenglik: 18, tur: 'pul' },
  { sarlavha: 'Можно предъявить, сум', kenglik: 18, tur: 'pul' },
  { sarlavha: '% выполнения', kenglik: 11, tur: 'foiz' },
];

/** Свод по видам затрат — LRV dan SUMIF (Кат. bo'yicha); har raqam formula. */
function svod(o: { nom: string; a: number; b: number; obyektNom: string; ks: Record<(typeof PUL)[number], KatSummalar>; jamiJS: Record<(typeof PUL)[number], number | null> }): RasmiyVaraq {
  const w = new RasmiyVaraq({ nom: 'Свод', sarlavha: 'СВОД ПО ВИДАМ ЗАТРАТ', titul: [['Объект:', o.obyektNom]], ustunlar: SVOD, yonalish: 'landscape' });
  const ref = (c: string) => `'${o.nom}'!${c}${o.a}:${c}${o.b}`;
  const boshi = w.r;
  let n = 0;
  for (const k of NAKRUTKA_KATLAR) {
    w.qator('oddiy', (r): Qiymat[] => [++n, VED_GURUH[k],
      { f: `SUMIF(${ref(C.J)},"${k}",${ref(C.H)})`, v: o.ks.H[k] },
      { f: `SUMIF(${ref(C.J)},"${k}",${ref(C.L)})`, v: o.ks.L[k] },
      { f: `SUMIF(${ref(C.J)},"${k}",${ref(C.N)})`, v: o.ks.N[k] },
      { f: `ROUND(C${r}-D${r},2)`, v: yaxlit2(o.ks.H[k] - o.ks.L[k]) },
      { f: `ROUND(D${r}-E${r},2)`, v: yaxlit2(o.ks.L[k] - o.ks.N[k]) },
      { f: `IF(C${r}=0,"",ROUND(D${r}/C${r}*100,1))`, v: o.ks.H[k] ? Math.round(o.ks.L[k] / o.ks.H[k] * 1000) / 10 : '' },
    ], { rang: (RANG_TARTIB as readonly string[]).includes(k) ? k as QatorRangi : null });
  }
  const oxiri = w.r - 1;
  w.qator('vsego', (r): Qiymat[] => [null, 'ВСЕГО ПРЯМЫЕ ЗАТРАТЫ',
    { f: `SUM(C${boshi}:C${oxiri})`, v: o.jamiJS.H ?? '' }, { f: `SUM(D${boshi}:D${oxiri})`, v: o.jamiJS.L ?? '' }, { f: `SUM(E${boshi}:E${oxiri})`, v: o.jamiJS.N ?? '' },
    { f: `ROUND(C${r}-D${r},2)`, v: '' }, { f: `ROUND(D${r}-E${r},2)`, v: '' }, { f: `IF(C${r}=0,"",ROUND(D${r}/C${r}*100,1))`, v: '' }]);
  w.izoh('Суммы — формулы SUMIF по листу «LRV» (колонка «Кат.»). Позиции без цены в смете в итоги не входят — см. «ПОЗИЦИИ, ТРЕБУЮЩИЕ ВНИМАНИЯ».');
  return w;
}
