/**
 * t2-desktop.ts — Windows dastur boshqaruvi klienti: /api/desktop/nazorat (admin) va /api/desktop/yangilanish (har kim).
 * Ruxsat qarori serverda (RPC). Bu yerda faqat transport + react-query.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DesktopNazoratJavob } from '../lib/desktop-nazorat';

export type DesktopXato = Error & { code?: string };
const xato = (j: any, status: number): DesktopXato => Object.assign(new Error((j && j.code) || 'HTTP ' + status), { code: (j && j.code) || 'HTTP_' + status });

export async function desktopNazoratOl(kompaniyaId: number | null): Promise<DesktopNazoratJavob> {
  const r = await fetch('/api/desktop/nazorat' + (kompaniyaId ? '?kompaniya_id=' + Number(kompaniyaId) : ''));
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.ok !== true) throw xato(j, r.status);
  return j as DesktopNazoratJavob;
}

export function useDesktopNazorat(kompaniyaId: number | null, enabled = true) {
  return useQuery({
    queryKey: ['desktopNazorat', kompaniyaId ?? 'global'],
    queryFn: () => desktopNazoratOl(kompaniyaId),
    enabled,
    staleTime: 15_000,
    retry: (n, e: any) => !['AUTH_REQUIRED', 'AUTHORIZATION_DENIED', 'WEB_SESSION_REQUIRED'].includes(e?.code) && n < 2,
  });
}

export type DesktopBuyruq =
  | { action: 'bekor'; device_id: string; kompaniya_id: number | null; sabab: string }
  | { action: 'foydalanuvchi_bekor'; foydalanuvchi_id: number; kompaniya_id: number | null; sabab: string }
  | { action: 'muddat'; device_id: string; kompaniya_id: number | null; tugaydi: number; sabab: string }
  | { action: 'siyosat'; manba: 'platforma' | 'kompaniya'; kompaniya_id: number | null; qiymat: Record<string, unknown>; sabab: string; expected_versiya: number | null };

export async function desktopBuyruq(b: DesktopBuyruq): Promise<{ ok: true; soni?: number; versiya?: number; takror?: boolean }> {
  const r = await fetch('/api/desktop/nazorat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...b, operation_id: crypto.randomUUID() }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.ok !== true) throw xato(j, r.status);
  return j;
}

export function useDesktopBuyruq() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: desktopBuyruq, onSuccess: () => qc.invalidateQueries({ queryKey: ['desktopNazorat'] }) });
}

export type DesktopYangilanish = {
  ok: true; yoqilgan: boolean; min_versiya: string | null; joriy_versiya: string | null; yuklab_olish_url: string | null;
  yangilanish_izoh: string | null; faol_qurilmalar: number; max_qurilma: number;
};
export function useDesktopYangilanish() {
  return useQuery({
    queryKey: ['desktopYangilanish'],
    queryFn: async (): Promise<DesktopYangilanish> => {
      const r = await fetch('/api/desktop/yangilanish');
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || j.ok !== true) throw xato(j, r.status);
      return j;
    },
    staleTime: 60_000,
    retry: 1,
  });
}
