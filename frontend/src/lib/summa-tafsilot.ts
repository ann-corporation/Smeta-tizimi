/**
 * SUMMA TAFSILOTI (egasi 2026-11-02): har pul summasi bosilganda joyida ochiladi — uchlik (QQS bilan · ustamali QQS siz ·
 * ustamasiz), kaskad qadamlari (ЧЕЛ, МАШ, МАТ, ОБ → transport/sklad → прочие → sug'urta → ИТОГО-4 → НДС → ВСЕГО)
 * va agregat bo'lsa — hissa qo'shuvchi bandlar (obyekt/bo'lim), har biri o'z uchligi bilan.
 *
 * Bu yerda YANGI FORMULA YO'Q: qiymatlar server paketi (`_t2_summa_paket_*`) yoki hisob-yadrodan; faqat ko'rsatish uchun
 * ayirmalar (`ayirma2`). Noma'lum — `null` (NULL ≠ 0).
 */
import type { SummaPaket } from './summa-paket';
import type { QiymatUchlik, UstamaNatija } from './ustamali-summa';
import { ayirma2, yigindi2 } from './hisob-yadro';
import { t } from '../i18n/til';

export type ZanjirQator = { kalit: string; nom: string; summa: number | null; foiz?: number | null; jami?: boolean };

/** Agregat tarkibidagi bir band (obyekt, bo'lim, bo'lim-qism) va uning uchligi. */
export type TafsilQism = { kalit: string; nom: string; q: QiymatUchlik };

const bor = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/**
 * Faqat uchlikdan kaskad (har manbada bor): ustamasiz → ustama va qo'shimchalar → ИТОГО-4 → QQS → ВСЕГО.
 * Noma'lum qadam — null (UI «noma'lum» deydi).
 */
export function uchlikZanjiri(q: QiymatUchlik): ZanjirQator[] {
  return [
    { kalit: 'pryamye', nom: t('ПРЯМЫЕ (ustamasiz)'), summa: q.ustamasiz },
    { kalit: 'ustama', nom: t('Ustama va qo‘shimchalar'), summa: ayirma2(q.ustamali, q.ustamasiz) },
    { kalit: 'itogo4', nom: t('ИТОГО-4 (ustamali, QQS siz)'), summa: q.ustamali, jami: true },
    { kalit: 'nds', nom: t('НДС (QQS)'), summa: ayirma2(q.qqsBilan, q.ustamali) },
    { kalit: 'vsego', nom: t('ВСЕГО (QQS bilan)'), summa: q.qqsBilan, jami: true },
  ];
}

/** Server paketi → to'liq kaskad (server `ustama` qadamlari bo'lsa batafsil, bo'lmasa uchlik zanjiri). */
export function paketZanjiri(p: SummaPaket): ZanjirQator[] {
  const q: QiymatUchlik = { qqsBilan: p.qqs_bilan, ustamali: p.ustamali, ustamasiz: p.ustamasiz, taxminiy: false, nomalum: p.kesim.nomalum, sabab: null };
  const u = p.ustama;
  if (!u) return uchlikZanjiri(q);
  const v = (k: string) => (typeof u[k] === 'number' ? u[k] : 0);
  const tr = v('tr_mat') + v('skl_mat') + v('tr_kab') + v('tr_ob') + v('zag_ob');
  const qad: ZanjirQator[] = [
    { kalit: 'chel', nom: t('ЧЕЛ'), summa: p.kesim.chel },
    { kalit: 'mash', nom: t('МАШ'), summa: p.kesim.mash },
    { kalit: 'mat', nom: t('МАТ'), summa: p.kesim.mat },
    { kalit: 'ob', nom: t('ОБ'), summa: p.kesim.ob },
  ];
  if (tr) qad.push({ kalit: 'transport', nom: t('Transport / sklad'), summa: tr });
  if (v('prochie')) qad.push({ kalit: 'prochie', nom: t('Прочие'), summa: v('prochie') });
  if (v('strax') + v('risk')) qad.push({ kalit: 'sugurta', nom: t('Sug‘urta / risk'), summa: v('strax') + v('risk') });
  if (p.ustamasiz_qism) qad.push({ kalit: 'ustamasiz-qism', nom: t('Ustamasiz qism (svod, subpudrat, bojxona, kat noma’lum)'), summa: p.ustamasiz_qism });
  qad.push({ kalit: 'itogo4', nom: t('ИТОГО-4 (ustamali, QQS siz)'), summa: p.ustamali, jami: true });
  qad.push({ kalit: 'nds', nom: t('НДС (QQS)'), summa: p.qqs, foiz: p.qqs_foiz });
  qad.push({ kalit: 'vsego', nom: t('ВСЕГО (QQS bilan)'), summa: p.qqs_bilan, jami: true });
  return qad;
}

/** Mijoz hisobi (`ustamaliHisobla`) → kaskad qadamlari; zanjir yo'q bo'lsa uchlik zanjiri. */
export function ustamaZanjirQatorlari(u: UstamaNatija | null | undefined, q: QiymatUchlik): ZanjirQator[] {
  if (!u || !u.zanjir.length || q.taxminiy) return uchlikZanjiri(q);
  const NOM: Record<string, string> = { pryamye: t('ПРЯМЫЕ (ustamasiz)'), transport: t('Transport / sklad'), prochie: t('Прочие'), sugurta: t('Sug‘urta / risk'), itogo: t('ИТОГО-4 (ustamali, QQS siz)') };
  const qad: ZanjirQator[] = u.zanjir.map((z) => ({ kalit: z.kod, nom: NOM[z.kod] ?? z.kod, summa: z.summa, foiz: z.foiz ?? null, jami: z.kod === 'itogo' }));
  qad.push({ kalit: 'nds', nom: t('НДС (QQS)'), summa: ayirma2(q.qqsBilan, q.ustamali), foiz: u.ndsFoiz ?? null });
  qad.push({ kalit: 'vsego', nom: t('ВСЕГО (QQS bilan)'), summa: q.qqsBilan, jami: true });
  return qad;
}

/** Portfel (`usePortfelUstamali`) → hissa qo'shuvchi obyektlar, har biri o'z uchligi bilan (hisoblanmagan — null). */
export function portfelQismlari(p: {
  royxat: readonly { obyektId: number; nom?: string | null }[];
  boYicha: Map<number, number | null>; qqsBoYicha: Map<number, number | null>; ustamasizBoYicha: Map<number, number | null>;
}): TafsilQism[] {
  return p.royxat.map((o) => {
    const ustamali = p.boYicha.get(o.obyektId) ?? null;
    const qqsBilan = p.qqsBoYicha.get(o.obyektId) ?? null;
    return {
      kalit: String(o.obyektId), nom: o.nom || `#${o.obyektId}`,
      q: { qqsBilan, ustamali, ustamasiz: p.ustamasizBoYicha.get(o.obyektId) ?? null, taxminiy: false, nomalum: 0, sabab: qqsBilan == null ? 'HISOBLANMADI' : null },
    };
  });
}

/**
 * Bir nechta obyekt paketlari → jami uchlik (hisob-yadro `yigindi2Qatiy`: bittasi noma'lum bo'lsa ham ma'lumlari yig'iladi,
 * hech biri ma'lum bo'lmasa — null). `nomalumSoni` — paketi yo'q obyektlar (jim 0 emas).
 */
export function paketlarJami(paketlar: readonly (SummaPaket | null | undefined)[]): { q: QiymatUchlik; nomalumSoni: number } {
  const bormi = paketlar.filter((p): p is SummaPaket => !!p);
  const nomalumSoni = paketlar.length - bormi.length;
  if (!bormi.length) return { q: { qqsBilan: null, ustamali: null, ustamasiz: null, taxminiy: false, nomalum: 0, sabab: 'SUMMA_YOQ' }, nomalumSoni };
  return {
    q: { qqsBilan: yigindi2(bormi.map((p) => p.qqs_bilan)), ustamali: yigindi2(bormi.map((p) => p.ustamali)), ustamasiz: yigindi2(bormi.map((p) => p.ustamasiz)),
      taxminiy: nomalumSoni > 0, nomalum: 0, sabab: null },
    nomalumSoni,
  };
}

export const sonBormi = bor;
