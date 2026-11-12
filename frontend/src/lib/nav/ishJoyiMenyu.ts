/**
 * ISH JOYI MENYUSI (ekotizim V2, 2-qadam): sidebarning yuqori darajasi — 7 ish joyi (+ sotuv, platforma). SOF hosila: faqat
 * yagona sahifa reestridan (lib/reestr) quriladi; ikkinchi ro'yxat YO'Q. Eski tuzilma (NAV_GURUHLAR) o'zgarmaydi — u route
 * ruxsati, sayt xaritasi va «Yangi menyu» o'chirilganda eski sidebar uchun qoladi.
 *
 * Ish joyi ichida: bandlar (bitta band = bitta sahifa yoki tabli bo'lim) reestr `tartib`i bo'yicha qat'iy mantiqiy tartibda;
 * butun band «yana» (qoshimcha/yana) bo'lsa — ish joyining «Yana…» ro'yxatiga tushadi. Filtr (rol/ruxsat/modul) — navFiltr.menyuQur.
 */
import { ISH_JOYI_META, type IshJoyi } from '../reestr/ishJoyi';
import { NAV_GURUH_META, SAHIFALAR, type Sahifa } from '../reestr/sahifa';
import type { NavBand, NavGuruh, NavIkonka, NavQatlam, NavSahifa } from './navReestr';
import { menyuQur, type MenyuBand, type NavKontekst } from './navFiltr';

const IKONKA = new Map<string, NavIkonka>(NAV_GURUH_META.flatMap((g) => g.bandlar.map((b): [string, NavIkonka] => [`${g.id}|${b.nom}`, b.ikonka])));

const navSahifa = (s: Sahifa, yana: boolean): NavSahifa => {
  const r: NavSahifa = { yol: s.yol, ilova: s.ilova, nom: s.nom, ruxsat: s.ruxsat };
  if (s.modul) r.modul = s.modul;
  if (s.scope) r.scope = s.scope;
  if (s.faqatSuperadmin) r.faqatSuperadmin = true;
  if (yana) r.qoshimcha = true;
  return r;
};

/** Bitta ish joyining bandlari: (navGuruh, navBand) bo'yicha guruhlangan, tartib bo'yicha. */
function bandlarQur(joy: IshJoyi): NavBand[] {
  const sahifalar = SAHIFALAR.filter((s) => s.ishJoyi === joy).slice().sort((a, b) => a.tartib - b.tartib);
  const guruhlar = new Map<string, Sahifa[]>();
  for (const s of sahifalar) {
    const k = s.ishBand ? `ish|${s.ishBand}` : `${s.navGuruh}|${s.navBand}`;
    guruhlar.set(k, [...(guruhlar.get(k) ?? []), s]);
  }
  return [...guruhlar.entries()].map(([k, list]) => {
    const yana = list.every((s) => s.qoshimcha || s.yana);
    return { nom: list[0].ishBand ?? list[0].navBand, ikonka: list[0].ishBand ? 'Users' as NavIkonka : (IKONKA.get(k) ?? 'Box'), sahifalar: list.map((s) => navSahifa(s, yana)) };
  });
}

const TARTIBLI: readonly IshJoyi[] = (Object.keys(ISH_JOYI_META) as IshJoyi[]).sort((a, b) => ISH_JOYI_META[a].tartib - ISH_JOYI_META[b].tartib);

/** Reestrdan hosila: har ish joyi = bitta guruh (menyuQur ga beriladi). */
export const ISH_JOYI_NAV: readonly NavGuruh[] = TARTIBLI.map((joy) => ({
  id: joy, nom: ISH_JOYI_META[joy].nom, ikonka: ISH_JOYI_META[joy].ikonka,
  qatlam: (joy === 'platforma' ? 'platforma' : 'ish') as NavQatlam,
  bandlar: bandlarQur(joy),
})).filter((g) => g.bandlar.length > 0);

export type IshJoyiBolim = { id: IshJoyi; nom: string; ikonka: NavGuruh['ikonka']; tavsif: string; bandlar: MenyuBand[]; yana: MenyuBand[] };

/** Kontekst (rol/ruxsat/modul) bo'yicha ko'rinadigan ish joylari: asosiy bandlar + «Yana…» bandlari. Bo'sh ish joyi tushib qoladi. */
export function ishJoyiMenyu(k: NavKontekst): IshJoyiBolim[] {
  const asosiy = menyuQur({ ...k, qoshimcha: 'yashir' }, ISH_JOYI_NAV);
  const yana = menyuQur({ ...k, qoshimcha: 'faqat' }, ISH_JOYI_NAV);
  return TARTIBLI.flatMap((joy): IshJoyiBolim[] => {
    const a = asosiy.find((g) => g.id === joy)?.bandlar ?? [];
    const y = yana.find((g) => g.id === joy)?.bandlar ?? [];
    if (!a.length && !y.length) return [];
    const m = ISH_JOYI_META[joy];
    return [{ id: joy, nom: m.nom, ikonka: m.ikonka, tavsif: m.tavsif, bandlar: a, yana: y }];
  });
}