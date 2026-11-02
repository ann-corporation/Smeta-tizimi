/**
 * Kompaniya sozlamalari klienti — `GET/POST /api/kompaniya-sozlama` (Sozlamalar markazi).
 *  GET  ?kompaniya_id=N → { ok, kompaniya_id, mavqe, f2_tasdiq_rejimi, sozlamalar, yozish_mumkin }
 *  POST { kompaniya_id, kalit, qiymat, operation_id } → { ok } | 403 AUTHORIZATION_DENIED | 404 SERVER_YANGILANMAGAN | 400 QIYMAT_INVALID
 * Soxta ma'lumot yo'q: javob kelmasa — xato kodi (UI «—» / mahalliy qiymatda qoladi).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type F2TasdiqRejimi = 'shaxsiy' | 'korporativ';
export type SozlamaKalit = 'hujjat.imzo_tomonlari' | 'hujjat.dizayn' | 'f2.tasdiq_rejimi';
export type SozlamaYozuv = { qiymat: Record<string, unknown> | null; yangilangan_at?: string };
export type KompaniyaSozlama = {
  kompaniya_id: number;
  mavqe: string | null;
  f2_tasdiq_rejimi: F2TasdiqRejimi | null;
  sozlamalar: Partial<Record<'hujjat.imzo_tomonlari' | 'hujjat.dizayn', SozlamaYozuv>>;
  yozish_mumkin: boolean;
};

export const SERVER_YANGILANMAGAN = 'SERVER_YANGILANMAGAN';

export class SozlamaXatosi extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) { super(code); this.code = code; this.status = status; }
}

export const kompaniyaSozlamaKalit = (kompaniyaId: number | null | undefined) => ['kompaniya-sozlama', kompaniyaId ?? null] as const;

export async function kompaniyaSozlamaOl(kompaniyaId: number): Promise<KompaniyaSozlama> {
  let r: Response;
  try { r = await fetch(`/api/kompaniya-sozlama?kompaniya_id=${encodeURIComponent(String(kompaniyaId))}`, { credentials: 'same-origin' }); } catch { throw new SozlamaXatosi('TARMOQ', 0); }
  const j = await r.json().catch(() => null) as (Partial<KompaniyaSozlama> & { ok?: boolean; code?: string }) | null;
  if (r.status === 404) throw new SozlamaXatosi(j?.code ?? SERVER_YANGILANMAGAN, 404);
  if (!r.ok || !j || j.ok !== true) throw new SozlamaXatosi(j?.code ?? 'NOMA_LUM', r.status);
  return {
    kompaniya_id: j.kompaniya_id ?? kompaniyaId,
    mavqe: j.mavqe ?? null,
    f2_tasdiq_rejimi: j.f2_tasdiq_rejimi === 'shaxsiy' || j.f2_tasdiq_rejimi === 'korporativ' ? j.f2_tasdiq_rejimi : null,
    sozlamalar: j.sozlamalar && typeof j.sozlamalar === 'object' ? j.sozlamalar : {},
    yozish_mumkin: j.yozish_mumkin === true,
  };
}

export type SozlamaYozish = { kompaniya_id: number; kalit: SozlamaKalit; qiymat: Record<string, unknown> | F2TasdiqRejimi | null };

export async function kompaniyaSozlamaYoz(p: SozlamaYozish): Promise<void> {
  let r: Response;
  try {
    r = await fetch('/api/kompaniya-sozlama', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...p, operation_id: crypto.randomUUID() }),
    });
  } catch { throw new SozlamaXatosi('TARMOQ', 0); }
  const j = await r.json().catch(() => null) as { ok?: boolean; code?: string } | null;
  if (r.status === 404) throw new SozlamaXatosi(j?.code ?? SERVER_YANGILANMAGAN, 404);
  if (!r.ok || !j || j.ok !== true) throw new SozlamaXatosi(j?.code ?? 'NOMA_LUM', r.status);
}

export function useKompaniyaSozlama(kompaniyaId: number | null | undefined) {
  return useQuery({
    queryKey: kompaniyaSozlamaKalit(kompaniyaId),
    queryFn: () => kompaniyaSozlamaOl(kompaniyaId as number),
    enabled: kompaniyaId != null,
    staleTime: 30_000,
    retry: (n, e) => !(e instanceof SozlamaXatosi && [401, 403, 404].includes(e.status)) && n < 1,
  });
}

export function useKompaniyaSozlamaSaqla() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: kompaniyaSozlamaYoz,
    onSuccess: (_d, v) => { void qc.invalidateQueries({ queryKey: kompaniyaSozlamaKalit(v.kompaniya_id) }); },
  });
}
