/**
 * hujjat-nashr.ts - SERVER tomonida yasalgan xlsx ga manba QR (`/t/<token>`) qo'yish: brauzer eksporti bilan BIR XIL yo'l.
 *
 * Yangi mantiq yo'q: `lib/imzo/nashr.ts` dagi `nashrQoy` (mazmun xeshi, "IMZO" varag'i, QR) ishlatiladi; bu yerda faqat Worker adapteri
 * (`NashrAdapter`): nashr tokeni va F-2 (akt, versiya) ga bog'lash to'g'ridan-to'g'ri SQL RPC (`t2_nashr_tayyor_v1`, `t2_f2_tekshiruv_bog_v1`) -
 * brauzer `/api/imzo` va `/api/tekshiruv` orqali aynan shularni chaqiradi. Token YECHILMAYDI (nashr tokeni hujjat tokeni emas).
 * QR li nusxani R2 ga alohida yuklash yo'q: Diskka yozilgach (`diskArxivla`) o'sha registry yozuvi nashrga biriktiriladi (`nusxaBiriktir`).
 */
import { imzoRpc, type ImzoEnv } from './imzo';
import { tasodifiyToken } from '../../src/lib/imzo/yadro';
import { nashrQoy, type NashrAdapter } from '../../src/lib/imzo/nashr';

export type NashrNatija = { bytes: Uint8Array; token: string; nusxaKerak: boolean };

export function serverNashrAdapter(env: ImzoEnv, o: { actorId: number; origin: string }, qayd: { token?: string; nusxaKerak?: boolean }): NashrAdapter {
  return {
    tayyor: async (b) => {
      const j = await imzoRpc(env, 't2_nashr_tayyor_v1', { p_actor_id: o.actorId, p_kompaniya_id: b.kompaniya_id, p_obyekt_id: b.obyekt_id, p_turi: b.turi, p_atama: b.atama.slice(0, 160), p_xesh: b.mazmun_xesh, p_token: tasodifiyToken() });
      if (!j?.ok || typeof j.token !== 'string') return { ok: false };
      const hujjatId = typeof j.hujjat_id === 'number' ? j.hujjat_id : null;
      qayd.token = j.token; qayd.nusxaKerak = hujjatId == null;
      return { ok: true, token: j.token, yangi: j.yangi === true, hujjat_id: hujjatId };
    },
    // Nusxa Diskka yozilgach biriktiriladi (nusxaBiriktir): bu yerda alohida yuklash yo'q.
    yukla: async () => null,
    biriktir: async () => false,
    origin: () => o.origin,
    bogla: async (token, aktId) => (await imzoRpc(env, 't2_f2_tekshiruv_bog_v1', { p_actor_id: o.actorId, p_token: token, p_akt_id: aktId }))?.ok === true,
  };
}

/** xlsx ga QR qo'yadi. Qo'llab bo'lmasa (xlsx emas, RPC xato) - null: chaqiruvchi QR siz faylni beradi (hech qachon to'xtamaydi). */
export async function serverNashrQoy(env: ImzoEnv, bytes: Uint8Array, faylNomi: string, o: { actorId: number; kompaniyaId: number; obyektId: number; origin: string; turi: string; atama?: string; aktId?: number | null }): Promise<NashrNatija | null> {
  const qayd: { token?: string; nusxaKerak?: boolean } = {};
  const kop = await nashrQoy(bytes, faylNomi, { kompaniyaId: o.kompaniyaId, obyektId: o.obyektId, turi: o.turi, atama: o.atama, aktId: o.aktId ?? null }, serverNashrAdapter(env, o, qayd));
  return kop && qayd.token ? { bytes: kop, token: qayd.token, nusxaKerak: qayd.nusxaKerak === true } : null;
}

/** QR li nusxa Diskka yozilgach: shu registry yozuvini nashrga biriktiradi (QR orqali yuklab olish uchun). Xato jim: hujjat saqlangan. */
export async function nusxaBiriktir(env: ImzoEnv, actorId: number, token: string, hujjatId: number): Promise<boolean> {
  return (await imzoRpc(env, 't2_nashr_nusxa_v1', { p_actor_id: actorId, p_token: token, p_hujjat_id: hujjatId }))?.ok === true;
}
