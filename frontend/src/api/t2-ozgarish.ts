/**
 * `t2_qator.change_type` / `replaces_line_id` — LRV ekrani va eksportida qo'shimcha/zamena belgilari uchun (faqat o'qish).
 * `t2_daraxt` view'ida bu ustunlar yo'q; shu obyektning faqat o'zgarish qatorlari o'qiladi (asl smeta qatorlari emas).
 * Xato bo'lsa null — daraxt va eksport ishlashda davom etadi (belgilarsiz).
 */
import { sbOqi, type T2Qator } from './supabase';
import { t2ToliqOqi } from './t2-toliq-oqish';
import { ozgarishTuri, type OzgarishMalumot } from '../lib/lrv-ozgarish';

export async function ozgarishMalumotOl(obyektId: number): Promise<OzgarishMalumot | null> {
  const r = await t2ToliqOqi<{ id: number; change_type: string | null; replaces_line_id: number | null }>(sbOqi, {
    jadval: 't2_qator', filtr: `obyekt_id=eq.${obyektId}&change_type=not.is.null`, ustunlar: 'id,change_type,replaces_line_id', limit: 200000,
  }, 'id').catch(() => null);
  if (!r?.ok) return null;
  const m: OzgarishMalumot = new Map();
  for (const x of r.qatorlar ?? []) {
    const t = ozgarishTuri(x.change_type);
    if (t) m.set(Number(x.id), { change_type: t, replaces_line_id: x.replaces_line_id == null ? null : Number(x.replaces_line_id) });
  }
  return m;
}

/**
 * Avvalgi (almashtirilgan) smeta versiyasi qatorlari: `t2_qator.versiya_holat = 'almashtirilgan'`
 * (migratsiya 20261114700000; `t2_daraxt` faqat 'faol' qatorlarni beradi). Asosiy ro'yxatga KIRMAYDI —
 * LRV ekranida alohida filtr, Excel'da alohida varaq (kulrang). Xato bo'lsa bo'sh (belgisiz) qaytadi.
 */
export type AvvalgiVersiya = { qatorlar: T2Qator[]; versiyaNomi: Map<number, string> };
export const AVVALGI_VERSIYA_USTUNLARI = 'id,obyekt_id,ota_id,daraja,tartib,tur,kod,nom,birlik,hajm,narx,summa,kat,norma,versiya,almashtirgan_versiya_id';

export async function avvalgiVersiyaOl(obyektId: number): Promise<AvvalgiVersiya | null> {
  const r = await t2ToliqOqi<T2Qator & { almashtirgan_versiya_id: number | null }>(sbOqi, {
    jadval: 't2_qator', filtr: `obyekt_id=eq.${obyektId}&versiya_holat=eq.almashtirilgan`, ustunlar: AVVALGI_VERSIYA_USTUNLARI, limit: 200000,
  }, 'id').catch(() => null);
  if (!r?.ok) return null;
  const qatorlar = (r.qatorlar ?? []) as Array<T2Qator & { almashtirgan_versiya_id: number | null }>;
  const versiyaNomi = new Map<number, string>();
  const idlar = [...new Set(qatorlar.map((q) => q.almashtirgan_versiya_id).filter((x): x is number => x != null))];
  if (idlar.length) {
    const v = await sbOqi<{ id: number; nom: string | null; manba_sana: string | null }>({
      jadval: 't2_smeta_versiya', filtr: `id=in.(${idlar.slice(0, 200).join(',')})`, ustunlar: 'id,nom,manba_sana', limit: 200,
    }).catch(() => null);
    if (v?.ok) for (const x of v.qatorlar ?? []) versiyaNomi.set(Number(x.id), [x.nom, x.manba_sana].filter(Boolean).join(' · '));
  }
  return { qatorlar, versiyaNomi };
}
