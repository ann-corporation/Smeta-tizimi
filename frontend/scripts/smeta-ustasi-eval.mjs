#!/usr/bin/env node
/**
 * AI smeta ustasi — lokal, oflayn eval (docs/architecture/SMETA_USTASI_V1.md §5).
 *
 *   node scripts/smeta-ustasi-eval.mjs [eval-papka] [--katalog <norm-library reliz papkasi>] [--chiqish <papka>]
 *
 * eval-papka sukut: D:\BOG_MIYASI\ESLATMA_EVAL\  (repodan TASHQARIDA; maxfiy ma'lumot repoga tushmaydi).
 * Katalog: --katalog yoki NORM_LIBRARY_FIXTURE_ROOT (norm-library reliz papkasi); eval-papkada katalog.json bo'lsa — soxta katalog.
 * Tarmoq/DB/model chaqirilmaydi. TS modullar Vite SSR orqali yuklanadi (qo'shimcha bog'liqlik yo'q).
 */
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const server = await createServer({ root, appType: 'custom', logLevel: 'error', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true } });
try {
  const m = await server.ssrLoadModule('/src/lib/smeta-ustasi/eval/mahalliy.ts');
  const papka = pos[0] ?? m.SUKUT_PAPKA;
  const r = await m.evalIshga({ papka, katalog: opt('--katalog'), chiqish: opt('--chiqish') });
  console.log(r.md);
  console.log(`Hisobot yozildi: ${path.join(opt('--chiqish') ?? papka, r.fayllar[1])} (+ .json)`);
} catch (e) {
  console.error(String(e?.message ?? e));
  process.exitCode = 1;
} finally {
  await server.close();
}
