/** Uy sotish — o'qish so'rovlari (react-query). Kalitlar ['sotuv', …] — yozuvdan keyin useSotuvYangila hammasini yangilaydi. */
import { useQuery } from '@tanstack/react-query';
import { bitimlarOl, bitimOl, mijozlarOl, shaxmatkaOl, sotuvPanelOl, type Bosqich } from '../../api/t2-sotuv';
import { sbT2ObyektlarOl } from '../../api/supabase';

type Javob<T> = { ok: true; natija: T } | { ok: false; error: string; code?: string };
async function ochir<T>(p: Promise<Javob<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(r.error);
  return r.natija;
}

export function usePanel(kid: number | null, loyihaId: number | null, yoq = false) {
  return useQuery({ queryKey: ['sotuv', 'panel', kid, loyihaId], enabled: !!kid && !yoq, queryFn: () => ochir(sotuvPanelOl(kid!, loyihaId)) });
}
export function useShaxmatka(kid: number | null, obyektId: number | null) {
  return useQuery({ queryKey: ['sotuv', 'shaxmatka', kid, obyektId], enabled: !!kid && !!obyektId, queryFn: () => ochir(shaxmatkaOl(kid!, obyektId!)) });
}
export type BitimFiltr = { bosqich?: Bosqich; qidiruv?: string; loyiha_id?: number; yopilganlar?: boolean };
export function useBitimlar(kid: number | null, filtr: BitimFiltr, yoq = false) {
  return useQuery({ queryKey: ['sotuv', 'bitimlar', kid, filtr], enabled: !!kid && !yoq, queryFn: () => ochir(bitimlarOl(kid!, filtr)).then((r) => r.bitimlar) });
}
export function useBitim(kid: number | null, bitimId: number | null) {
  return useQuery({ queryKey: ['sotuv', 'bitim', kid, bitimId], enabled: !!kid && !!bitimId, queryFn: () => ochir(bitimOl(kid!, bitimId!)) });
}
export function useMijozlar(kid: number | null, qidiruv: string, yoq = false) {
  return useQuery({ queryKey: ['sotuv', 'mijozlar', kid, qidiruv], enabled: !!kid && !yoq, queryFn: () => ochir(mijozlarOl(kid!, qidiruv || undefined)).then((r) => r.mijozlar) });
}
/** Kompaniya obyektlari (binolar) — shaxmatka uchun bino tanlash; o'qib bo'lmasa bo'sh ro'yxat (panel.binolar qoladi). */
export function useBinolar(kid: number | null) {
  return useQuery({
    queryKey: ['sotuv', 'obyektlar', kid], enabled: !!kid,
    queryFn: async () => {
      const r = await sbT2ObyektlarOl(kid!);
      return r.ok ? (r.qatorlar ?? []).map((o) => ({ id: o.id, nom: o.nom, loyiha_id: o.loyiha_id ?? null })) : [];
    },
  });
}
