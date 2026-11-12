/**
 * «Foyda / zarar» — loyiha plyusdami yoki minusdami (egasi 2026-11-12).
 * YANGI hisob EMAS: daromad = tasdiqlangan F2 ning serverdagi summa paketi (rahbar_panel_v1, ustamali QQS siz),
 * xarajat va to'lov — mavjud t2_xarajat / t2_tolov qatorlari. Bu fayl faqat TUZILMA (kompaniya > loyiha > shartnoma > obyekt),
 * yig'indi va izoh. Pul arifmetikasi — hisob-yadro (yigindi2 / ayirma2); QQS va foiz yaxlitlash bu yerda YO'Q.
 * NULL ≠ 0: xarajat kiritilmagan joyda foyda `null` (soxta plyus yo'q), sababi `toliqlik` da.
 */
import { ayirma2, yigindi2 } from './hisob-yadro/yaxlit';
import { foiz, type SummaPaket } from './summa-paket';
import { t } from '../i18n/til';

export type FzKat = 'chel' | 'mat' | 'mash' | 'ob' | 'subpudrat' | 'boshqa';
export const FZ_KATLAR: readonly FzKat[] = ['chel', 'mat', 'mash', 'ob', 'subpudrat', 'boshqa'];
export const FZ_KAT_NOM: Record<FzKat, string> = {
  chel: 'mehnat', mat: 'material', mash: 'mashina', ob: 'jihoz', subpudrat: 'subpudrat', boshqa: 'boshqa',
};
/** t2_xarajat.kat → kesim kaliti (kat bo'sh/noma'lum — null: «toifasiz»). */
const KAT_XARITA: Record<string, FzKat> = { 'ЧЕЛ': 'chel', 'МАТ': 'mat', 'МАШ': 'mash', 'ОБ': 'ob', 'SUB': 'subpudrat', 'OTK': 'boshqa' };

export type FzObyekt = {
  obyekt_id: number; nom: string; loyiha_id: number | null; loyiha_nom: string | null;
  shartnoma: { id: number; raqam: string | null } | null; f2: SummaPaket | null;
};
export type FzQator = { obyekt_id: number | null; shartnoma_id: number | null; kat?: string | null; summa: number; tur?: string | null };

export type FzDaraja = 'kompaniya' | 'loyiha' | 'shartnoma' | 'obyekt';
export type FzTuri = 'plyus' | 'minus' | 'nomalum';

export type FzNode = {
  id: string; daraja: FzDaraja; nom: string; bola: FzNode[];
  /** Tasdiqlangan F2: QQS bilan / ustamali (QQS siz) / ustamasiz. `null` — tasdiqlangan F2 yo'q. */
  bajarilgan: { qqsBilan: number; ustamali: number; ustamasiz: number } | null;
  /** F2 ning kategoriya kesimi (ustamasiz = smeta puli, bajarilgan hajm uchun). */
  smetaKesim: Record<FzKat, number> | null;
  tushgan: number | null;
  qarz: number | null;
  xarajat: number | null;
  xarajatKat: Record<FzKat, number>;
  xarajatToifasiz: number;
  xarajatSoni: number;
  foyda: number | null;
  foydaFoiz: number | null;
  pul: number | null;
  turi: FzTuri;
  sabab: string;
  /** Qaysi ma'lumot yetishmaydi (kalitlar: f2 | tolov | xarajat | kat:<kalit>). */
  toliqlik: string[];
};

const nol = (): Record<FzKat, number> => ({ chel: 0, mat: 0, mash: 0, ob: 0, subpudrat: 0, boshqa: 0 });
const kesimdan = (p: SummaPaket): Record<FzKat, number> => ({
  chel: p.kesim.chel, mat: p.kesim.mat, mash: p.kesim.mash, ob: p.kesim.ob, subpudrat: p.kesim.subpudrat,
  boshqa: yigindi2([p.kesim.svod, p.kesim.ustamasiz, p.kesim.nomalum]),
});

type Yigim = { objs: FzObyekt[]; xar: FzQator[]; tol: FzQator[] };

function tolovIshorali(q: FzQator): number { return q.tur === 'qaytarim' ? -Math.abs(q.summa) : q.summa; }

function hisobla(id: string, daraja: FzDaraja, nom: string, y: Yigim, bola: FzNode[]): FzNode {
  const f2lar = y.objs.map((o) => o.f2).filter((p): p is SummaPaket => p != null);
  const bajarilgan = f2lar.length
    ? { qqsBilan: yigindi2(f2lar.map((p) => p.qqs_bilan)), ustamali: yigindi2(f2lar.map((p) => p.ustamali)), ustamasiz: yigindi2(f2lar.map((p) => p.ustamasiz)) }
    : null;
  const kesimlar = f2lar.map(kesimdan);
  const smetaKesim = f2lar.length ? Object.fromEntries(FZ_KATLAR.map((k) => [k, yigindi2(kesimlar.map((c) => c[k]))])) as Record<FzKat, number> : null;

  const xarajatKat = nol(); let toifasiz = 0;
  for (const q of y.xar) {
    const k = q.kat ? KAT_XARITA[q.kat] : undefined;
    if (k) xarajatKat[k] = yigindi2([xarajatKat[k], q.summa]); else toifasiz = yigindi2([toifasiz, q.summa]);
  }
  const xarajat = y.xar.length ? yigindi2(y.xar.map((q) => q.summa)) : null;
  const tushgan = y.tol.length ? yigindi2(y.tol.map(tolovIshorali)) : null;
  const foyda = ayirma2(bajarilgan?.ustamali, xarajat);
  const foydaFoiz = foyda != null && bajarilgan && bajarilgan.ustamali !== 0 ? foiz(foyda, bajarilgan.ustamali) : null;

  const toliqlik: string[] = [];
  if (!bajarilgan) toliqlik.push('f2');
  if (xarajat == null) toliqlik.push('xarajat');
  else if (smetaKesim) {
    for (const k of FZ_KATLAR) if (smetaKesim[k] > 0 && xarajatKat[k] === 0) toliqlik.push('kat:' + k);
  }
  if (tushgan == null) toliqlik.push('tolov');

  const turi: FzTuri = foyda == null ? 'nomalum' : foyda >= 0 ? 'plyus' : 'minus';
  return {
    id, daraja, nom, bola, bajarilgan, smetaKesim, tushgan,
    qarz: ayirma2(bajarilgan?.qqsBilan, tushgan),
    xarajat, xarajatKat, xarajatToifasiz: toifasiz, xarajatSoni: y.xar.length,
    foyda, foydaFoiz, pul: ayirma2(tushgan, xarajat), turi, sabab: sababMatni(turi, bajarilgan != null, xarajat, smetaKesim, xarajatKat, foydaFoiz), toliqlik,
  };
}

/** Bitta qatorli oddiy o'zbekcha sabab: eng katta oshgan kategoriya (xarajat kesim-smetadan N % ko'p). */
export function sababMatni(turi: FzTuri, f2Bor: boolean, xarajat: number | null, smeta: Record<FzKat, number> | null, haqiqiy: Record<FzKat, number>, foydaFoiz: number | null): string {
  if (!f2Bor) return t('Tasdiqlangan F2 yo‘q — bajarilgan ish hisoblanmaydi.');
  if (xarajat == null) return t('Xarajat kiritilmagan — foyda hisoblanmaydi.');
  if (turi === 'minus' && smeta) {
    let eng: { k: FzKat; f: number; farq: number } | null = null;
    for (const k of FZ_KATLAR) {
      if (!(smeta[k] > 0) || !(haqiqiy[k] > 0)) continue;
      const farq = ayirma2(haqiqiy[k], smeta[k]);
      const f = foiz(farq, smeta[k]);
      if (farq != null && farq > 0 && f != null && (!eng || farq > eng.farq)) eng = { k, f, farq };
    }
    if (eng) return t('{kat} xarajati smetadagidan {foiz} % ko‘p.', { kat: t(FZ_KAT_NOM[eng.k]), foiz: eng.f });
    return t('Xarajat bajarilgan ishdan ko‘p.');
  }
  if (turi === 'plyus') return foydaFoiz != null ? t('Xarajat bajarilgan ishdan kam — foyda {foiz} %.', { foiz: foydaFoiz }) : t('Xarajat bajarilgan ishdan kam.');
  return '';
}

function qatorlarOl(royxat: FzQator[], obyektIds: Set<number>, shartnomaIds: Set<number>, hammaObyekt: Set<number>): FzQator[] {
  return royxat.filter((q) => (q.obyekt_id != null && obyektIds.has(q.obyekt_id))
    || ((q.obyekt_id == null || !hammaObyekt.has(q.obyekt_id)) && q.shartnoma_id != null && shartnomaIds.has(q.shartnoma_id)));
}

export type FzNatija = { root: FzNode; taqsimlanmaganXarajat: number; taqsimlanmaganTolov: number };

/**
 * Daraxt: kompaniya > loyiha > shartnoma > obyekt. Qator obyektga (yo'q bo'lsa shartnomaga) biriktiriladi;
 * ikkalasi ham yo'q qator faqat kompaniya jamida — «taqsimlanmagan» (loyihaga yuklanmaydi).
 */
export function foydaZararDaraxti(p: { kompaniyaNom: string; obyektlar: FzObyekt[]; xarajat: FzQator[]; tolov: FzQator[] }): FzNatija {
  const hamma = new Set(p.obyektlar.map((o) => o.obyekt_id));
  const sh = (o: FzObyekt[]) => new Set(o.map((x) => x.shartnoma?.id).filter((x): x is number => x != null));
  const ids = (o: FzObyekt[]) => new Set(o.map((x) => x.obyekt_id));
  const yigim = (objs: FzObyekt[]): Yigim => ({
    objs, xar: qatorlarOl(p.xarajat, ids(objs), sh(objs), hamma), tol: qatorlarOl(p.tolov, ids(objs), sh(objs), hamma),
  });

  const gruhla = (objs: FzObyekt[], key: (o: FzObyekt) => string) => {
    const m = new Map<string, FzObyekt[]>();
    for (const o of objs) m.set(key(o), [...(m.get(key(o)) ?? []), o]);
    return [...m.entries()];
  };
  const loyihaNodlari = gruhla(p.obyektlar, (o) => (o.loyiha_id != null ? 'l' + o.loyiha_id : 'l-')).map(([lk, lo]) => {
    const nom = lo[0].loyiha_id != null ? (lo[0].loyiha_nom || 'Loyiha ' + lo[0].loyiha_id) : 'Loyihasiz obyektlar';
    const shNodlari = gruhla(lo, (o) => (o.shartnoma ? 's' + o.shartnoma.id : 's-')).map(([sk, so]) => {
      const shNom = so[0].shartnoma ? 'Shartnoma ' + (so[0].shartnoma.raqam ?? so[0].shartnoma.id) : 'Shartnomasiz obyektlar';
      const obNodlari = so.map((o) => {
        const y = { objs: [o], xar: p.xarajat.filter((q) => q.obyekt_id === o.obyekt_id), tol: p.tolov.filter((q) => q.obyekt_id === o.obyekt_id) };
        return hisobla('o' + o.obyekt_id, 'obyekt', o.nom, y, []);
      });
      return hisobla(`${lk}/${sk}`, 'shartnoma', shNom, yigim(so), obNodlari);
    });
    return hisobla(lk, 'loyiha', nom, yigim(lo), shNodlari);
  });
  const root = hisobla('k', 'kompaniya', p.kompaniyaNom, { objs: p.obyektlar, xar: p.xarajat, tol: p.tolov }, loyihaNodlari);
  const taqsim = (royxat: FzQator[], olchov: (q: FzQator) => number) =>
    yigindi2(royxat.filter((q) => (q.obyekt_id == null || !hamma.has(q.obyekt_id)) && !(q.shartnoma_id != null && sh(p.obyektlar).has(q.shartnoma_id))).map(olchov));
  return { root, taqsimlanmaganXarajat: taqsim(p.xarajat, (q) => q.summa), taqsimlanmaganTolov: taqsim(p.tolov, tolovIshorali) };
}
