import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  transportBugun, transportJoylar, transportKpi, transportPark, transportReyslar, transportSozlama, transportYoz,
  type Natija, type YozNatija,
} from '../api/t2-transport';

const ol = <T,>(r: Natija<T>): T => { if (!r.ok) throw new Error(r.error || r.code || 'XATO'); return r.natija; };

export const useTPark = (k: number | null) => useQuery({ queryKey: ['tr', 'park', k], enabled: k != null, staleTime: 30_000, queryFn: async () => ol(await transportPark(k as number)) });
export const useTSozlama = (k: number | null) => useQuery({ queryKey: ['tr', 'sozlama', k], enabled: k != null, staleTime: 30_000, queryFn: async () => ol(await transportSozlama(k as number)) });
export const useTJoylar = (k: number | null) => useQuery({ queryKey: ['tr', 'joylar', k], enabled: k != null, staleTime: 120_000, queryFn: async () => ol(await transportJoylar(k as number)) });
export const useTReyslar = (k: number | null, dan: string, gacha: string) =>
  useQuery({ queryKey: ['tr', 'reyslar', k, dan, gacha], enabled: k != null, staleTime: 15_000, queryFn: async () => ol(await transportReyslar(k as number, { dan, gacha, limit: 500 })) });
export const useTBugun = (k: number | null, sana: string) => useQuery({ queryKey: ['tr', 'bugun', k, sana], enabled: k != null, staleTime: 10_000, refetchInterval: 60_000, queryFn: async () => ol(await transportBugun(k as number, sana)) });
export const useTKpi = (k: number | null, dan: string, gacha: string) => useQuery({ queryKey: ['tr', 'kpi', k, dan, gacha], enabled: k != null, staleTime: 30_000, queryFn: async () => ol(await transportKpi(k as number, dan, gacha)) });

/** Yozuvdan so'ng barcha transport so'rovlari yangilanadi. `ok:false` — xato sifatida tashlanadi (UI toast ko'rsatadi). */
export function useTYoz(k: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { amal: Parameters<typeof transportYoz>[1]; data: Record<string, unknown>; operationId?: string }): Promise<YozNatija> => {
      if (k == null) throw new Error('KOMPANIYA_YOQ');
      const r = await transportYoz(k, a.amal, a.data, a.operationId);
      if (!r.ok) throw new Error(String(r.code || r.error || 'XATO'));
      return r;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['tr'] }); },
  });
}

/** Server xato kodlarini foydalanuvchi tiliga o'tkazish uchun kalitlar. */
export const XATO_MATN: Record<string, string> = {
  VERSION_CONFLICT: 'Ma‘lumot boshqa joyda o‘zgargan. Yangilab qayta urinib ko‘ring.',
  HOLAT_NOTOGRI: 'Reys holati bu amalga mos emas.',
  BEKATLAR_YOPILMAGAN: 'Avval barcha bekatlarni yakunlang.',
  TANNARX_TOLIQ_EMAS: 'Tannarx to‘liq emas — yetishmagan qiymatlarni kiriting.',
  PERMISSION_DENIED: 'Bu amal uchun ruxsat yo‘q.',
  ODOMETR_KICHIK: 'Oxirgi odometr boshlang‘ich qiymatdan kichik bo‘lmasligi kerak.',
  SABAB_REQUIRED: 'Bekor qilish sababini yozing.',
  HAYDOVCHI_YOQ: 'Avval reysga haydovchi biriktiring.',
  OBYEKT_SCOPE_MISMATCH: 'Obyekt shu kompaniyaga tegishli emas.',
};
