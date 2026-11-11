/**
 * «Shu oyda bu obyekt uchun Forma 3 tuzilganmi?» — qadam chizig'i uchun YENGIL o'qish (yangi dvigatel emas).
 * Manba: shartnoma rejimi RPC si (`t2_forma3_shartnoma_aktlar_v1`: har tasdiqlangan F2 akt `forma3_id`/`band` bilan) —
 * obyekt shartnomaga bog'langan bo'lsa; aks holda obyekt darajasidagi `t2_forma3_royxat_v1`.
 * O'qilmasa — `null` (noma'lum, 0 EMAS): qadam chizig'i taxmin qilmaydi.
 */
import { sbT2ShartnomaBogOl } from '../../api/t2-shartnoma';
import { forma3RoyxatOl, forma3ShartnomaAktlarOl } from '../../api/t2-document-control';
import { f3OyChegarasi } from '../forma3-shartnoma';
import { oyKaliti } from './oy';

/** Berilgan oyda obyektning Forma 3 hujjatlari soni (ajratilgan forma3_id lar); o'qilmasa null. */
export async function forma3OyHolati(obyektId: number, oy: string): Promise<number | null> {
  const k = oyKaliti(oy);
  const ch = k ? f3OyChegarasi(k) : null;
  if (!k || !ch) return null;
  try {
    const bog = await sbT2ShartnomaBogOl(obyektId);
    const shartnomaId = bog.ok ? (bog.qatorlar ?? [])[0]?.shartnoma_id ?? null : null;
    if (shartnomaId != null) {
      const r = await forma3ShartnomaAktlarOl({ shartnomaId, davrBoshi: ch.boshi, davrOxiri: ch.oxiri });
      const shu = (r.aktlar ?? []).filter((a) => a.obyekt_id === obyektId);
      return new Set(shu.filter((a) => a.band && a.forma3_id != null).map((a) => a.forma3_id)).size;
    }
    const r = await forma3RoyxatOl({ obyektId }) as { ok?: boolean; forma3lar?: Array<{ davr_boshi?: string | null; holat?: string | null }> };
    if (!r?.ok || !Array.isArray(r.forma3lar)) return null;
    return r.forma3lar.filter((f) => oyKaliti(f.davr_boshi) === k && f.holat !== 'bekor').length;
  } catch {
    return null;
  }
}
