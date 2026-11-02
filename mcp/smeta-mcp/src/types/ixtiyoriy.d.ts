/**
 * Ixtiyoriy frontend modullari (build vaqtida bor bo'lsa — haqiqiysi, bo'lmasa stub; stubs.mjs). Turlari ataylab keng:
 * mavjudlik runtime'da `MAVJUD_EMAS` / funksiya borligi bilan tekshiriladi.
 */
declare module '@frontend-ixtiyoriy/fakt-qamrov' {
  export const MAVJUD_EMAS: true | undefined;
  export const QAMROV_ISTISNOLAR: readonly string[] | undefined;
  export const qamrovReja: ((...a: unknown[]) => unknown) | undefined;
  export const qamrovJami: ((...a: unknown[]) => unknown) | undefined;
  export const qamrovBolaklari: ((...a: unknown[]) => unknown) | undefined;
}
