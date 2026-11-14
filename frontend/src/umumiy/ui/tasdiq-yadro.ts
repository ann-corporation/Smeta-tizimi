/**
 * tasdiq-yadro.ts — tasdiqSora / matnSora (brauzer confirm / prompt o'rniga) mantig'i; dialogni chizish — Tasdiq.tsx (TasdiqContainer).
 * Yengil modul (UI kutubxonasiz): vitest.setup.ts ham shuni import qiladi.
 */
export type Sorov = { sarlavha?: string; matn: string; tasdiqMatni?: string; bekorMatni?: string; xavfli?: boolean };
export type MatnSorov = Sorov & { boshlangich?: string; yorliq?: string; majburiy?: boolean; minUzunlik?: number; kopQator?: boolean };
export type TasdiqIchki = Sorov & { id: number; matnSorovi?: false; javob: (ha: boolean) => void };
export type MatnIchki = MatnSorov & { id: number; matnSorovi: true; javob: (m: string | null) => void };
export type Ichki = TasdiqIchki | MatnIchki;

let tinglovchi: ((s: Ichki) => void) | null = null;
export function tinglovchiOrnat(f: ((s: Ichki) => void) | null) { tinglovchi = f; }

export type SinovUlagich = { tasdiq?: (matn: string) => boolean; matn?: (matn: string, boshlangich: string) => string | null } | null;
let sinovUlagich: SinovUlagich = null;
/** Faqat testlar (vitest.setup.ts): konteyner yo'q paytda dialog javobini beruvchi. */
export function sinovUlagichOrnat(u: SinovUlagich) { sinovUlagich = u; }

export function tasdiqSora(s: Sorov | string): Promise<boolean> {
  const so: Sorov = typeof s === 'string' ? { matn: s } : s;
  if (!tinglovchi) return Promise.resolve(sinovUlagich?.tasdiq?.(so.matn) ?? false);
  return new Promise((javob) => tinglovchi!({ ...so, id: Date.now() + Math.random(), javob }));
}

/** Kiritish bilan dialog. Bekor (Esc / fon / tugma) — null. Tasdiqda kiritilgan matn (`majburiy` bo'lmasa bo'sh ham bo'lishi mumkin). */
export function matnSora(s: MatnSorov | string): Promise<string | null> {
  const so: MatnSorov = typeof s === 'string' ? { matn: s } : s;
  if (!tinglovchi) return Promise.resolve(sinovUlagich?.matn?.(so.matn, so.boshlangich ?? '') ?? null);
  return new Promise((javob) => tinglovchi!({ ...so, id: Date.now() + Math.random(), javob, matnSorovi: true }));
}