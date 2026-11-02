/** Node stubi: frontend `t()` — matn o'zbekcha qoladi, `{nom}` o'rinbosarlari to'ldiriladi. */
export type Til = 'uz' | 'ru' | 'en';
export const t = (s: string, v?: Record<string, string | number>): string =>
  v ? s.replace(/\{(\w+)\}/g, (m, k: string) => (v[k] != null ? String(v[k]) : m)) : s;
export const joriyTil = (): Til => 'uz';
export const tilniOrnat = (): void => undefined;
export const useTil = (): Til => 'uz';
