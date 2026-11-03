/**
 * NAKRUTKA kaskadi — server `t2_nakrutka_hisobla_v1` KIRISH/CHIQISH shaklidagi moslik qatlami.
 * Formula bu yerda EMAS: hisob `lib/hisob-yadro` dagi yagona podval baholovchisida (standart podval = SQL tartibi).
 *  - `nakrutkaKaskad` — har qadam ROUND 2 (Excel, yadro sukuti). SQL ham har qadamda yaxlitlaydi (20261116000000) —
 *    aynan bir xil (`hisob-yadro/paritet.test.ts`).
 *  - `nakrutkaKaskadXom` — yaxlitlashsiz (Tender Oferta o'z yaxlitlash tartibi bilan ishlatadi).
 */
import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import { podvalBahola, standartPodval, yaxlit2, type KatSummalar, type Podval } from './hisob-yadro';

/** T1 `_NAKR_DEFAULT` = SQL `t2_nakrutka_default_v1()` (server sukut koeffitsientlari; podval bo'lmaganda server shuni oladi). */
export const NAKRUTKA_STANDART: NakrutkaKoeffitsientlar = {
  ЗТР_СОЦСТРАХ: 12, ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 2,
  СКЛАДСКИЕ_МК: 0.75, ТРАНСПОРТ_КАБЕЛЬ: 1.5, ПРОЧИЕ_ПОДРЯДЧИК: 18,
  ТРАНСПОРТ_ОБОРУД: 2, ЗАГОТ_СКЛАД_ОБОРУД: 1.2, СТРАХОВАНИЕ: 0.32,
  РИСК: 0, НДС: 12,
};

/** Kaskad kirishi (server shakli). `mat` — TO'LIQ material savati (МАТ + М/К + КАБ + БЕЗСКЛАД). */
export type NakrutkaAsos = { chel: number; mash: number; mat: number; ob: number; mk: number; kab: number; bez: number };

export type NakrutkaQadamlar = {
  pryamye: number; tr_mat: number; skl_mat: number; tr_kab: number;
  itogo1: number; prochie: number; itogo2: number;
  tr_ob: number; zag_ob: number; itogo3: number;
  strax: number; risk: number; itogo4: number; nds: number; vsego: number;
};

export type NakrutkaQoshimcha = {
  /** Material transporti foiz o'rniga alohida transport varag'idan (Oferta `transportSiyosati = 'varaq'`). */
  trMatOverride?: number | null;
};

const katga = (a: NakrutkaAsos): KatSummalar => ({
  ЧЕЛ: a.chel, МАШ: a.mash, МАТ: a.mat - a.kab - a.mk - a.bez, ОБ: a.ob, КАБ: a.kab, 'М/К': a.mk, 'БЕЗ СКЛАД': a.bez,
});

function podvalOl(nk: Partial<NakrutkaKoeffitsientlar>, q: NakrutkaQoshimcha): Podval {
  const p = standartPodval(nk);
  if (q.trMatOverride == null) return p;
  return { ...p, qatorlar: p.qatorlar.map((x) => (x.kod === 'tr_mat' ? { kod: x.kod, nom: x.nom, tur: 'summa' as const, summa: q.trMatOverride } : x)) };
}

function shakl(qiymat: Record<string, number | null>): NakrutkaQadamlar {
  const v = (k: string) => {
    const x = qiymat[k];
    if (x == null) throw new Error(`PODVAL_TOLIQ_EMAS: koeffitsient kiritilmagan (${k})`);
    return x;
  };
  return {
    pryamye: v('pryamye'), tr_mat: v('tr_mat'), skl_mat: v('skl_mat') + v('skl_mk'), tr_kab: v('tr_kab'),
    itogo1: v('itogo1'), prochie: v('prochie'), itogo2: v('itogo2'), tr_ob: v('tr_ob'), zag_ob: v('zag_ob'), itogo3: v('itogo3'),
    strax: v('strax'), risk: v('risk'), itogo4: v('itogo4'), nds: v('nds'), vsego: v('vsego'),
  };
}

/** Yaxlitlanmagan qadamlar (yadro baholovchisi, yaxlitlashsiz rejim). */
export function nakrutkaKaskadXom(a: NakrutkaAsos, nk: Partial<NakrutkaKoeffitsientlar>, q: NakrutkaQoshimcha = {}): NakrutkaQadamlar {
  return shakl(podvalBahola(podvalOl(nk, q), katga(a), { yaxlit: false }).qiymat);
}

/** Excel ROUND(x;2) — yadro `yaxlit2`. */
export const pulYaxlitla = yaxlit2;

/** Server shaklidagi natija, har qadam ROUND 2 (yadro). `skl_mat` = sklad material + sklad М/К (server kabi bitta qadam). */
export function nakrutkaKaskad(a: NakrutkaAsos, nk: Partial<NakrutkaKoeffitsientlar>, q: NakrutkaQoshimcha = {}): NakrutkaQadamlar {
  const r = shakl(podvalBahola(podvalOl(nk, q), katga(a)).qiymat);
  return { ...r, skl_mat: yaxlit2(r.skl_mat) };
}
