/**
 * t2-foyda-zarar.ts — «Foyda / zarar» ko'rinishi uchun o'qish (yangi RPC YO'Q):
 *   1) rahbar_panel_v1 — tasdiqlangan F2 paketlari obyektlar kesimida (yagona hisob yadrosi, QQS bilan/ustamali/ustamasiz);
 *   2) t2_xarajat va t2_tolov qatorlari (obyekt/shartnoma/toifa bilan) — bir vaqtda (parallel), jami ~1 aylanish.
 * Xarajat/to'lov o'qilmasa yoki to'liq kelmasa (`toliq:false`) — foyda «noma'lum» (soxta plyus yo'q).
 */
import { useQuery } from '@tanstack/react-query';
import { sbOqi } from './supabase';
import { rahbarPanelOl, type RahbarPanel } from './t2-rahbar-panel';
import type { FzQator } from '../lib/foyda-zarar';

type XarRow = { obyekt_id: number | null; shartnoma_id: number | null; kat: string | null; summa: number; sana: string | null; holat: string | null };
type TolRow = { obyekt_id: number | null; shartnoma_id: number | null; summa: number; tur: string | null; sana: string | null; holat: string | null };

export type FoydaZararMalumot = {
  panel: RahbarPanel; xarajat: FzQator[]; tolov: FzQator[];
  /** Qatorlar to'liq o'qilmadi (chegara/xato) — hisob qilinmaydi. */
  qatorToliqEmas: boolean; oxirgiXarajatSana: string | null; oxirgiTolovSana: string | null; yangilandi: string;
};

const oxirgiSana = (r: Array<{ sana: string | null }>) => r.reduce<string | null>((m, x) => (x.sana && (!m || x.sana > m) ? x.sana : m), null);

export async function foydaZararOl(kompaniyaId: number): Promise<FoydaZararMalumot> {
  const [panel, xar, tol] = await Promise.all([
    rahbarPanelOl({ kompaniyaId }),
    sbOqi<XarRow>({ jadval: 't2_xarajat', filtr: 'holat=eq.faol', ustunlar: 'obyekt_id,shartnoma_id,kat,summa,sana,holat', limit: 5000 }),
    sbOqi<TolRow>({ jadval: 't2_tolov', filtr: 'holat=eq.faol', ustunlar: 'obyekt_id,shartnoma_id,summa,tur,sana,holat', limit: 5000 }),
  ]);
  if (!panel.ok) throw new Error(panel.error);
  const xr = xar.ok ? xar.qatorlar ?? [] : [];
  const tr = tol.ok ? tol.qatorlar ?? [] : [];
  return {
    panel: panel.natija,
    xarajat: xr.map((r) => ({ obyekt_id: r.obyekt_id, shartnoma_id: r.shartnoma_id, kat: r.kat, summa: Number(r.summa) })),
    tolov: tr.map((r) => ({ obyekt_id: r.obyekt_id, shartnoma_id: r.shartnoma_id, summa: Number(r.summa), tur: r.tur })),
    qatorToliqEmas: !xar.ok || !tol.ok || xar.toliq === false || tol.toliq === false,
    oxirgiXarajatSana: oxirgiSana(xr), oxirgiTolovSana: oxirgiSana(tr), yangilandi: new Date().toISOString(),
  };
}

export function useFoydaZarar(kompaniyaId: number | null | undefined) {
  return useQuery({
    queryKey: ['foyda-zarar-v1', kompaniyaId], enabled: kompaniyaId != null, staleTime: 60_000, retry: 1,
    queryFn: () => foydaZararOl(kompaniyaId as number),
  });
}
