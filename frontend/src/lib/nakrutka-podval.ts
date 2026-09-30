import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import { yaxlit2, type Qiymat, type RasmiyVaraq } from './hujjat-yozuvchi';

/**
 * NAKRUTKA PODVALI va IKKI NARX — egasi (2026-09-25): "hamma joyda ikki narx
 * bo'lishi kerak: прямые затраты — to'g'ridan-to'g'ri xarajat, va buyurtmachiga
 * к оплате narxi — to'liq nakrutkalari bilan; hujjat oxirida nakrutka podvali".
 *
 * Kaskad server `t2_nakrutka_hisob` bilan AYNAN bir xil (20261014090000):
 *   pryamye = ЧЕЛ + МАШ + МАТ + ОБ (МАТ bucket = МАТ + КАБ + М/К + БЕЗ СКЛАД)
 *   tr_mat  = (МАТ + М/К + БЕЗ СКЛАД) × ТРАНСПОРТ_МАТЕРИАЛ
 *   БЕЗ СКЛАД (egasi 2026-10-01: omborda saqlanmaydigan, darhol ishlatiladigan —
 *   tovar beton, qorishma, rastvor, asfaltobeton) — transport OLADI, ombor ustamasi OLMAYDI
 *   (server: skl_mat = (mat − bez − mk) × k).
 *   skl_mat = (МАТ + КАБ) × СКЛАДСКИЕ_МАТЕРИАЛ;  skl_mk = М/К × СКЛАДСКИЕ_МК
 *   tr_kab  = КАБ × ТРАНСПОРТ_КАБЕЛЬ
 *   ИТОГО-1 = pryamye − ОБ + tr_mat + skl_mat + skl_mk + tr_kab
 *   ИТОГО-2 = ИТОГО-1 × (1 + ПРОЧИЕ)
 *   ИТОГО-3 = ИТОГО-2 + ОБ × (1 + ТРАНСПОРТ_ОБОРУД + ЗАГОТ_СКЛАД_ОБОРУД)
 *   ИТОГО-4 = ИТОГО-3 × (1 + СТРАХОВАНИЕ + РИСК);  ВСЕГО = ИТОГО-4 × (1 + НДС)
 * Kaskad chiziqli, shuning uchun har kategoriya uchun bitta KOEFFITSIENT bor:
 * Σ(to'g'ri xarajat × Kf[kat]) = ВСЕГО (server `t2_nakrutka_koef` bilan bir xil).
 * Qatordagi "к оплате" = ROUND(to'g'ri xarajat × Kf, 2); podvaldagi ВСЕГО bilan
 * farq faqat yaxlitlashda (tiyinlar).
 *
 * Excelda hammasi tirik: foizlar tahrirlanadigan kataklar, kategoriya jamilari
 * SUMIF (yashirin kategoriya ustuni bo'yicha), koeffitsientlar foiz kataklaridan
 * formula, qator "к оплате" — koeffitsient katagiga havola. `$` yo'q.
 */

export const NAKRUTKA_KATLAR = ['ЧЕЛ', 'МАШ', 'МАТ', 'ОБ', 'КАБ', 'М/К', 'БЕЗ СКЛАД'] as const;
export type NakrutkaKat = typeof NAKRUTKA_KATLAR[number];
export type KatSummalar = Record<NakrutkaKat, number>;

const KAT_NOMI: Record<NakrutkaKat, string> = {
  ЧЕЛ: 'Прямые затраты: заработная плата рабочих (ЧЕЛ)',
  МАШ: 'Прямые затраты: машины и механизмы (МАШ)',
  МАТ: 'Прямые затраты: материалы (МАТ)',
  ОБ: 'Прямые затраты: оборудование (ОБ)',
  КАБ: 'Прямые затраты: кабели и провода (КАБ)',
  'М/К': 'Прямые затраты: металлоконструкции (М/К)',
  'БЕЗ СКЛАД': 'Прямые затраты: материалы без складского хранения (БЕЗ СКЛАД)',
};

/** Qatorning kategoriyasi (noma'lum — null: к оплате hisoblanmaydi, diqqatga). */
export function nakrutkaKat(kat: string | null | undefined): NakrutkaKat | null {
  const k = (kat ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (k === 'БЕЗСКЛАД' || k === 'БЕЗ_СКЛАД' || k === 'BEZ_SKLAD') return 'БЕЗ СКЛАД';
  return (NAKRUTKA_KATLAR as readonly string[]).includes(k) ? (k as NakrutkaKat) : null;
}

const pc = (nk: Partial<NakrutkaKoeffitsientlar>, k: keyof NakrutkaKoeffitsientlar) => Number(nk[k] ?? 0) / 100;

/** Kategoriya koeffitsientlari (server `t2_nakrutka_koef` bilan bir xil). */
export function kategoriyaKf(nk: Partial<NakrutkaKoeffitsientlar>): Record<NakrutkaKat, number> {
  const p = 1 + pc(nk, 'ПРОЧИЕ_ПОДРЯДЧИК');
  const sr = 1 + pc(nk, 'СТРАХОВАНИЕ') + pc(nk, 'РИСК');
  const n = 1 + pc(nk, 'НДС');
  const q = p * sr * n;
  return {
    ЧЕЛ: q,
    МАШ: q,
    МАТ: (1 + pc(nk, 'ТРАНСПОРТ_МАТЕРИАЛ') + pc(nk, 'СКЛАДСКИЕ_МАТЕРИАЛ')) * q,
    ОБ: (1 + pc(nk, 'ТРАНСПОРТ_ОБОРУД') + pc(nk, 'ЗАГОТ_СКЛАД_ОБОРУД')) * sr * n,
    КАБ: (1 + pc(nk, 'СКЛАДСКИЕ_МАТЕРИАЛ') + pc(nk, 'ТРАНСПОРТ_КАБЕЛЬ')) * q,
    'М/К': (1 + pc(nk, 'ТРАНСПОРТ_МАТЕРИАЛ') + pc(nk, 'СКЛАДСКИЕ_МК')) * q,
    'БЕЗ СКЛАД': (1 + pc(nk, 'ТРАНСПОРТ_МАТЕРИАЛ')) * q,
  };
}

/** Qatorning к оплате summasi (Excel `ROUND(summa*Kf,2)` bilan bir xil). */
export function kOplate(summa: number | null, kat: NakrutkaKat | null, kf: Record<NakrutkaKat, number>): number | null {
  if (summa == null || kat == null) return null;
  return yaxlit2(summa * kf[kat]);
}

type KaskadQator = {
  kod: string;
  nom: string;
  /** Foiz koeffitsienti (tahrirlanadigan katak) — bo'lmasa null. */
  koef: keyof NakrutkaKoeffitsientlar | null;
  jami?: boolean;
};

const KASKAD: readonly KaskadQator[] = [
  { kod: 'tr_mat', nom: 'Транспортные расходы — материалы, %', koef: 'ТРАНСПОРТ_МАТЕРИАЛ' },
  { kod: 'skl_mat', nom: 'Складские расходы — материалы, %', koef: 'СКЛАДСКИЕ_МАТЕРИАЛ' },
  { kod: 'skl_mk', nom: 'Складские расходы — металлоконструкции, %', koef: 'СКЛАДСКИЕ_МК' },
  { kod: 'tr_kab', nom: 'Транспортные расходы — кабели и провода, %', koef: 'ТРАНСПОРТ_КАБЕЛЬ' },
  { kod: 'itogo1', nom: 'ИТОГО-1 (прямые затраты без оборудования с транспортными и складскими)', koef: null, jami: true },
  { kod: 'prochie', nom: 'Прочие расходы подрядчика, %', koef: 'ПРОЧИЕ_ПОДРЯДЧИК' },
  { kod: 'itogo2', nom: 'ИТОГО-2', koef: null, jami: true },
  { kod: 'tr_ob', nom: 'Транспортные расходы — оборудование, %', koef: 'ТРАНСПОРТ_ОБОРУД' },
  { kod: 'zag_ob', nom: 'Заготовительно-складские расходы — оборудование, %', koef: 'ЗАГОТ_СКЛАД_ОБОРУД' },
  { kod: 'itogo3', nom: 'ИТОГО-3 (с оборудованием)', koef: null, jami: true },
  { kod: 'strax', nom: 'Страхование объекта, %', koef: 'СТРАХОВАНИЕ' },
  { kod: 'risk', nom: 'Риск, %', koef: 'РИСК' },
  { kod: 'itogo4', nom: 'ИТОГО-4 (без НДС)', koef: null, jami: true },
  { kod: 'nds', nom: 'НДС, %', koef: 'НДС' },
  { kod: 'vsego', nom: 'ВСЕГО К ОПЛАТЕ (с накладными расходами и НДС)', koef: null, jami: true },
];

export type NakrutkaHisobJS = Record<string, number> & { pryamye: number; vsego: number; itogo4: number; nds: number };

/** Kaskad JS da — Excel formulalari bilan AYNAN (har qadam ROUND 2). */
export function nakrutkaKaskadJS(s: KatSummalar, nk: Partial<NakrutkaKoeffitsientlar>): NakrutkaHisobJS {
  const y = yaxlit2;
  const r: Record<string, number> = {};
  const bez = s['БЕЗ СКЛАД'] ?? 0;
  r.pryamye = y(s.ЧЕЛ + s.МАШ + s.МАТ + s.ОБ + s.КАБ + s['М/К'] + bez);
  r.tr_mat = y((s.МАТ + s['М/К'] + bez) * pc(nk, 'ТРАНСПОРТ_МАТЕРИАЛ'));
  r.skl_mat = y((s.МАТ + s.КАБ) * pc(nk, 'СКЛАДСКИЕ_МАТЕРИАЛ'));
  r.skl_mk = y(s['М/К'] * pc(nk, 'СКЛАДСКИЕ_МК'));
  r.tr_kab = y(s.КАБ * pc(nk, 'ТРАНСПОРТ_КАБЕЛЬ'));
  r.itogo1 = y(r.pryamye - s.ОБ + r.tr_mat + r.skl_mat + r.skl_mk + r.tr_kab);
  r.prochie = y(r.itogo1 * pc(nk, 'ПРОЧИЕ_ПОДРЯДЧИК'));
  r.itogo2 = y(r.itogo1 + r.prochie);
  r.tr_ob = y(s.ОБ * pc(nk, 'ТРАНСПОРТ_ОБОРУД'));
  r.zag_ob = y(s.ОБ * pc(nk, 'ЗАГОТ_СКЛАД_ОБОРУД'));
  r.itogo3 = y(r.itogo2 + s.ОБ + r.tr_ob + r.zag_ob);
  r.strax = y(r.itogo3 * pc(nk, 'СТРАХОВАНИЕ'));
  r.risk = y(r.itogo3 * pc(nk, 'РИСК'));
  r.itogo4 = y(r.itogo3 + r.strax + r.risk);
  r.nds = y(r.itogo4 * pc(nk, 'НДС'));
  r.vsego = y(r.itogo4 + r.nds);
  return r as NakrutkaHisobJS;
}

/** Podval qatorlari soni (sarlavha + 6 kategoriya + прямые + 15 kaskad + sarlavha + 6 Kf). */
export const PODVAL_QATORLAR = 1 + NAKRUTKA_KATLAR.length + 1 + KASKAD.length + 1 + NAKRUTKA_KATLAR.length;

/** Podval `bosh` qatoridan boshlansa — har kategoriya Kf katagi qaysi qatorda. */
export function podvalKfQatorlari(bosh: number): Record<NakrutkaKat, number> {
  const kf0 = bosh + 1 + NAKRUTKA_KATLAR.length + 1 + KASKAD.length + 1;
  return Object.fromEntries(NAKRUTKA_KATLAR.map((k, i) => [k, kf0 + i])) as Record<NakrutkaKat, number>;
}

export type PodvalOpsiya = {
  /** Yashirin kategoriya ustuni harfi (barg qatorlarida ЧЕЛ/МАШ/…). */
  katUstun: string;
  /** Ma'lumot oralig'i (SUMIF diapazoni) — birinchi va oxirgi qator. */
  oraliq: readonly [number, number];
  /** Pul ustunlari (to'g'ri xarajat) — har biriga alohida kaskad. */
  pulUstunlar: readonly string[];
  /** Foiz va koeffitsient yoziladigan ustun harfi. */
  foizUstun: string;
  nk: Partial<NakrutkaKoeffitsientlar>;
  /** Har pul ustunining kategoriya jamilari (kesh uchun). */
  katSummalar: Record<string, KatSummalar>;
  /** Kategoriya qatorlarida fizik ko'rsatkich (Форма № 3, egasi 2026-09-29: «shuncha chel.-ch,
   *  shuncha mash.-ch»): ustun harfi → kategoriya → soat. Birlik (чел.-ч / маш.-ч) `birlikUstun` ga. */
  katHajm?: { qiymat: Record<string, Partial<Record<NakrutkaKat, number>>>; birlikUstun?: string };
  /** Bo'lim sarlavhasi va oxirgi qator nomi (sukut: «РАСЧЕТ …», «ВСЕГО К ОПЛАТЕ …»). */
  sarlavha?: string;
  vsegoNom?: string;
  /** Koeffitsientlar jadvali (sukut true). Форма № 3 da kerak emas. */
  kfJadval?: boolean;
  /** Kategoriya summalari SUMIF emas, qiymat sifatida (jadvalda resurs qatorlari bo'lmasa — Форма № 3). */
  katFormulasiz?: boolean;
};

const colIdx = (h: string) => h.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/**
 * Podvalni yozadi (joriy qatordan). Qaytaradi: ВСЕГО qatori, Kf qatorlari va
 * har pul ustunining JS kaskadi (UI == Excel uchun).
 */
export function nakrutkaPodvaliYoz(v: RasmiyVaraq, o: PodvalOpsiya): { bosh: number; vsegoQator: number; kfQator: Record<NakrutkaKat, number>; kaskad: Record<string, NakrutkaHisobJS> } {
  const n = v.ustunlar.length;
  const mc = v.matnUstuni;
  const fi = colIdx(o.foizUstun);
  const bosh = v.r;
  const kaskad: Record<string, NakrutkaHisobJS> = {};
  for (const c of o.pulUstunlar) kaskad[c] = nakrutkaKaskadJS(o.katSummalar[c], o.nk);
  const kfJS = kategoriyaKf(o.nk);
  const kfQator = podvalKfQatorlari(bosh);
  const row = (fill: (cells: Qiymat[], r: number) => void) => (r: number) => { const c: Qiymat[] = Array(n).fill(null); fill(c, r); return c; };
  const [a, b] = o.oraliq;

  v.bolim(o.sarlavha ?? 'РАСЧЕТ СТОИМОСТИ К ОПЛАТЕ (прямые затраты → накладные и прочие расходы → НДС)', { daraja: 0 });
  const katQ: Record<NakrutkaKat, number> = {} as Record<NakrutkaKat, number>;
  for (const k of NAKRUTKA_KATLAR) {
    katQ[k] = v.qator('oddiy', row((c) => {
      c[mc] = KAT_NOMI[k];
      if (o.katHajm) {
        const bor = Object.values(o.katHajm.qiymat).some((x) => x[k] != null);
        if (bor && o.katHajm.birlikUstun) c[colIdx(o.katHajm.birlikUstun)] = k === 'ЧЕЛ' ? 'чел.-ч' : k === 'МАШ' ? 'маш.-ч' : '';
        for (const [hc, x] of Object.entries(o.katHajm.qiymat)) if (x[k] != null) c[colIdx(hc)] = x[k]!;
      }
      for (const col of o.pulUstunlar) c[colIdx(col)] = o.katFormulasiz ? yaxlit2(o.katSummalar[col][k]) : { f: `SUMIF(${o.katUstun}${a}:${o.katUstun}${b},"${k}",${col}${a}:${col}${b})`, v: yaxlit2(o.katSummalar[col][k]) };
    }));
  }
  const pryQ = v.qator('jami', row((c) => {
    c[mc] = 'ПРЯМЫЕ ЗАТРАТЫ — ВСЕГО';
    for (const col of o.pulUstunlar) c[colIdx(col)] = { f: `ROUND(${NAKRUTKA_KATLAR.map((k) => `${col}${katQ[k]}`).join('+')},2)`, v: kaskad[col].pryamye };
  }));
  const q: Record<string, number> = { pryamye: pryQ };
  for (const k of KASKAD) {
    const r = v.r;
    q[k.kod] = r;
    const F = `${o.foizUstun}${r}`;
    const f = (col: string): string => {
      const K = (kat: NakrutkaKat) => `${col}${katQ[kat]}`;
      const Q = (kod: string) => `${col}${q[kod]}`;
      switch (k.kod) {
        case 'tr_mat': return `ROUND((${K('МАТ')}+${K('М/К')}+${K('БЕЗ СКЛАД')})*${F}/100,2)`;
        case 'skl_mat': return `ROUND((${K('МАТ')}+${K('КАБ')})*${F}/100,2)`;
        case 'skl_mk': return `ROUND(${K('М/К')}*${F}/100,2)`;
        case 'tr_kab': return `ROUND(${K('КАБ')}*${F}/100,2)`;
        case 'itogo1': return `ROUND(${Q('pryamye')}-${K('ОБ')}+${Q('tr_mat')}+${Q('skl_mat')}+${Q('skl_mk')}+${Q('tr_kab')},2)`;
        case 'prochie': return `ROUND(${Q('itogo1')}*${F}/100,2)`;
        case 'itogo2': return `ROUND(${Q('itogo1')}+${Q('prochie')},2)`;
        case 'tr_ob': return `ROUND(${K('ОБ')}*${F}/100,2)`;
        case 'zag_ob': return `ROUND(${K('ОБ')}*${F}/100,2)`;
        case 'itogo3': return `ROUND(${Q('itogo2')}+${K('ОБ')}+${Q('tr_ob')}+${Q('zag_ob')},2)`;
        case 'strax': return `ROUND(${Q('itogo3')}*${F}/100,2)`;
        case 'risk': return `ROUND(${Q('itogo3')}*${F}/100,2)`;
        case 'itogo4': return `ROUND(${Q('itogo3')}+${Q('strax')}+${Q('risk')},2)`;
        case 'nds': return `ROUND(${Q('itogo4')}*${F}/100,2)`;
        default: return `ROUND(${Q('itogo4')}+${Q('nds')},2)`;
      }
    };
    v.qator(k.kod === 'vsego' ? 'vsego' : k.jami ? 'jami' : 'oddiy', row((c) => {
      c[mc] = k.kod === 'vsego' && o.vsegoNom ? o.vsegoNom : k.nom;
      if (k.koef) c[fi] = { n: Number(o.nk[k.koef] ?? 0), uslub: 'foiz' };
      for (const col of o.pulUstunlar) c[colIdx(col)] = { f: f(col), v: kaskad[col][k.kod] };
    }));
  }
  const vsegoQator = q.vsego;
  if (o.kfJadval === false) return { bosh, vsegoQator, kfQator, kaskad };
  // Koeffitsientlar — foiz kataklaridan formula (foizni o'zgartirsangiz qator
  // «к оплате» summalari ham qayta hisoblanadi).
  const P = (kod: string) => `${o.foizUstun}${q[kod]}/100`;
  const umumiy = `(1+${P('prochie')})*(1+${P('strax')}+${P('risk')})*(1+${P('nds')})`;
  const kfF: Record<NakrutkaKat, string> = {
    ЧЕЛ: umumiy,
    МАШ: umumiy,
    МАТ: `(1+${P('tr_mat')}+${P('skl_mat')})*${umumiy}`,
    ОБ: `(1+${P('tr_ob')}+${P('zag_ob')})*(1+${P('strax')}+${P('risk')})*(1+${P('nds')})`,
    КАБ: `(1+${P('skl_mat')}+${P('tr_kab')})*${umumiy}`,
    'М/К': `(1+${P('tr_mat')}+${P('skl_mk')})*${umumiy}`,
    'БЕЗ СКЛАД': `(1+${P('tr_mat')})*${umumiy}`,
  };
  v.qator('jami', row((c) => { c[mc] = 'Коэффициенты пересчета прямых затрат в стоимость к оплате (по видам затрат)'; }));
  for (const k of NAKRUTKA_KATLAR) {
    const r = v.qator('oddiy', row((c) => {
      c[mc] = `Коэффициент к оплате: ${KAT_NOMI[k].replace('Прямые затраты: ', '')}`;
      c[fi] = { f: kfF[k], v: kfJS[k], uslub: 'norma' };
    }));
    if (r !== kfQator[k]) throw new Error('NAKRUTKA_PODVAL_SILJIDI');
  }
  return { bosh, vsegoQator, kfQator, kaskad };
}
