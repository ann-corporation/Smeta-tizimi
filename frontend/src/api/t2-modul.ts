/**
 * Modul katalogi («Telegram modeli», egasi 2026-10-21; BOSH_REJA §3). Kompaniya o'ziga kerak modullarni yoqadi;
 * o'chirilgan modul menyuda ko'rinmaydi. O'qish: /api/sb `modul_holat_v1` (har a'zo). Yozish: mavjud
 * /api/system-control `capability_override_set` (scope=company; server: boss/superadmin, versiya, audit).
 * Bu menyu ko'rinishi — xavfsizlik chegarasi emas (ruxsatlarni server alohida tekshiradi).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { capabilityOverrideSet } from './t2-control';

export type Modul = { kod: string; nom: string; izoh: string | null; holat: 'on' | 'off'; manba: string; versiya: number };

export async function modulHolatOl(kompaniyaId: number): Promise<Modul[]> {
  const r = await fetch('/api/sb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ soro: 'modul_holat_v1', kompaniya_id: kompaniyaId }) });
  const j = await r.json().catch(() => null) as { ok?: boolean; natija?: { ok?: boolean; modullar?: Modul[] }; error?: string } | null;
  if (!j?.ok || !j.natija?.ok || !Array.isArray(j.natija.modullar)) throw new Error(j?.error || 'Modullar holatini o‘qib bo‘lmadi');
  return j.natija.modullar;
}

export function useModullar(kompaniyaId: number | null | undefined) {
  return useQuery({
    queryKey: ['modullar', kompaniyaId],
    queryFn: () => modulHolatOl(kompaniyaId as number),
    enabled: !!kompaniyaId && kompaniyaId > 0,
    staleTime: 60_000,
    retry: 1,
  });
}

/** Modulni yoqish/o'chirish. Kompaniya override'i bo'lsa — uning versiyasi bilan (eskirgan holat ustidan yozilmaydi). */
export function modulOzgartir(kompaniyaId: number, m: Modul, yoq: boolean) {
  return capabilityOverrideSet({
    kod: m.kod, scope: 'company', scope_id: kompaniyaId, holat: yoq ? 'on' : 'off',
    sabab: yoq ? 'Modul yoqildi (kompaniya sozlamasi)' : 'Modul o‘chirildi (kompaniya sozlamasi)',
    expected_version: m.manba === 'company' ? m.versiya : 0,
    operation_id: crypto.randomUUID(),
    // Middleware ruxsatni shu kompaniya bo'yicha tekshirsin (aks holda so'rov global deb qaraladi).
    ...({ kompaniya_id: kompaniyaId } as Record<string, unknown>),
  });
}

export function useModulOzgartir(kompaniyaId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { m: Modul; yoq: boolean }) => modulOzgartir(kompaniyaId, v.m, v.yoq),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['modullar', kompaniyaId] }); },
  });
}
