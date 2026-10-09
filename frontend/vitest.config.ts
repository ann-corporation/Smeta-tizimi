import { configDefaults, defineConfig } from 'vitest/config';

const PERF_TESTLAR = ['src/**/*.perf.test.ts', 'src/**/*.performance.test.ts', 'src/**/release-performance.test.ts', 'src/**/korpus/unumdorlik.test.ts'];

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    // These are standalone Node gate scripts.  `npm run tekshir` executes
    // them as child processes; loading them in Vitest makes their intentional
    // `process.exit()` calls look like failing test suites.
    // Unumdorlik (devor soati) testlari asosiy to'plamda emas: CI runner sekin bo'lsa mantiqan to'g'ri kod qizarardi
    // (2026-10-09). Ular alohida: `npm run test:perf` (PERF=1).
    exclude: [...configDefaults.exclude, 'testlar/**/*.test.{cjs,mjs}', ...(process.env.PERF ? [] : PERF_TESTLAR)],
    ...(process.env.PERF ? { include: PERF_TESTLAR } : {}),
    // Og'ir Excel kutubxonalari (exceljs, xlsx-js-style) birinchi dinamik
    // importda to'liq parallel yurishda 5–11 s oladi — standart 5 s chegara
    // mantiq xatosi bo'lmagan testlarni tasodifan yiqitardi (2026-09-24 o'lchandi).
    testTimeout: process.env.CI || process.env.PERF ? 120_000 : 20_000,
  },
});
