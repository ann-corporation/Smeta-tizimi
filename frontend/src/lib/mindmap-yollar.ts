/** Mindmap havolalari — faqat KANONIK marshrutlar (App.tsx). Hisob sof, UI yo‘q. */
import type { MindmapBelgi, MindmapTugun, TugunTur } from '../api/t2-mindmap';

/** Tugun turidan to'liq sahifaga o'tish yo'li (bo'lmasa — tugma ko'rsatilmaydi).
 *  Faqat KANONIK marshrutlar (App.tsx): legacy `/admin/test/*` va faqat-yo'naltiruvchi manzillar yo'q. */
export const SAHIFA_YOLI: Partial<Record<TugunTur, (id: number, nom: string) => string>> = {
  // PTO obyekt sahifasi (smeta, fakt, F2) — obyekt id bo'yicha.
  obyekt:     (id) => '/admin/holat/' + id,
  loyiha:     () => '/admin/loyiha',
  shartnoma:  () => '/admin/shartnoma-liniya',
  sklad:      () => '/admin/logistika',
  texnika:    () => '/admin/erp?modul=texnika',
  kadr:       () => '/admin/erp?modul=kadrlar',
  kontragent: () => '/admin/crm',
  zayavka:    () => '/admin/zayavka',
};

/** Obyekt zayavkalari — nom emas, ID bo'yicha (TestZayavka `?obyekt=` ID ni qabul qiladi). */
export const obyektZayavkaYoli = (obyektId: number, yarat = false) =>
  '/admin/zayavka?obyekt=' + obyektId + (yarat ? '&yarat=1' : '');

/** Tugundagi belgi bosilganda boriladigan kanonik sahifa. */
export function belgiYoli(tugun: Pick<MindmapTugun, 'id' | 'tur' | 'entity_id'>, belgi: Pick<MindmapBelgi, 'tur'>): string {
  const oid = tugun.entity_id ?? Number(tugun.id.split(':')[1]);
  if (belgi.tur === 'kozgu') return '/admin/system-control';
  if (tugun.tur === 'obyekt' && Number.isSafeInteger(oid) && oid > 0) {
    return belgi.tur === 'zayavka' ? obyektZayavkaYoli(oid) : '/admin/holat/' + oid;
  }
  return belgi.tur === 'zayavka' ? '/admin/zayavka' : '/admin/loyiha';
}

/** Kanonik sahifalar (legacy `/admin/test/*` va faqat-yo‘naltiruvchi manzillar emas). */
export const RESURS_YOLI: Record<string, string> = {
  shartnoma: '/admin/shartnoma-liniya', sklad: '/admin/logistika', texnika: '/admin/erp?modul=texnika',
  kadr: '/admin/erp?modul=kadrlar', kontragent: '/admin/crm',
};
