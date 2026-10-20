/**
 * t2-boss.ts — BOSS PANEL P0 canonical client.
 * Reads /api/boss-dashboard -> Supabase RPC t2_boss_dashboard_v1.
 * NO /api/gas, NO Drive, NO Sheets. Bounded single call.
 */
import { useQuery } from '@tanstack/react-query';
import { validExecutive, type BossExecutive } from '../components/boss-decision/model';

export type BossSignal = {
  id: number; quantity?:number; severity: string | null; signal_type: string | null; title: string | null;
  entity_type: string | null; entity_id: number | string | null; detected_at: string | null; due_at: string | null;
};
export type BossLoyiha = {
  loyiha_id: number; nom: string; holat: string | null; hudud: string | null;
  byudjet: number | null; obyekt_soni: number; smeta_jami: number;
};
export type BossDashboard = {
  ok: true;
  generated_at: string;
  kompaniya: { kompaniya_id: number; nom: string; rol: string; obyekt_soni: number; loyiha_soni: number };
  loyihalar: BossLoyiha[];
  moliya: { jami_tolangan: number|null; jami_debitor: number|null; jami_xarajat: number|null; sof_natija: number|null; ulangan: boolean };
  f2: { jami: number|null; soni: number; tasdiqlangan: number; qoralama: number; oxirgi_oy: string | null };
  shartnoma: { soni: number; jami_summa: number|null; faol: number };
  signal: { ochiq_soni: number; kritik_soni: number; royxat: BossSignal[] };
  storage: { ulangan: boolean; izoh?: string; hujjat_soni?: number; canonical_stored?: number; drive_replica_failed?: number };
  ulanmagan_modullar: string[];
  executive?: BossExecutive;
};

export async function bossDashboardOl(kompaniyaId: number, signal?:AbortSignal): Promise<BossDashboard> {
  if(!Number.isSafeInteger(kompaniyaId) || kompaniyaId<=0) throw new Error('COMPANY_CONTEXT_REQUIRED');
  const r = await fetch('/api/boss-dashboard?kompaniya_id=' + Number(kompaniyaId),{signal});
  const j = await r.json();
  if (!r.ok || !j || j.ok !== true) {
    const err: any = new Error((j && (j.xato || j.code)) || ('HTTP ' + r.status));
    err.code = (j && j.code) || ('HTTP_' + r.status);
    throw err;
  }
  if(j.kompaniya?.kompaniya_id!==kompaniyaId || !Array.isArray(j.loyihalar) || !Array.isArray(j.signal?.royxat) || !j.moliya || typeof j.moliya.ulangan!=='boolean') throw new Error('BOSS_SCOPE_OR_SHAPE_INVALID');
  if(j.executive!==undefined && !validExecutive(j.executive)) throw new Error('BOSS_SCOPE_OR_SHAPE_INVALID');
  return j as BossDashboard;
}

export function useBossDashboard(kompaniyaId: number | null | undefined) {
  return useQuery({
    queryKey: ['bossDashboard', kompaniyaId],
    queryFn: ({signal}) => bossDashboardOl(Number(kompaniyaId),signal),
    enabled: !!kompaniyaId,
    staleTime: 60 * 1000,
    retry: (n, e: any) => e?.code !== 'AUTH_REQUIRED' && e?.code !== 'COMPANY_NOT_FOUND' && n < 2,
  });
}
