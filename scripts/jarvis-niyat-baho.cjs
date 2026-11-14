#!/usr/bin/env node
/**
 * Jarvis LLM niyat qatlamini QO'LDA baholash (CI da yurmaydi, LLM chaqiradi).
 *   OPENROUTER_API_KEY=... node scripts/jarvis-niyat-baho.cjs [model]
 * Kalit faqat muhit o'zgaruvchisidan olinadi va hech qayerga chop etilmaydi. Natija: mahalliy qatlam aniqligi va LLM+mahalliy aniqlik.
 * Test: frontend/src/lib/yordamchi/__baho__/niyat-llm-qolda.test.ts (oddiy `vitest run` da o'tkazib yuboriladi).
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

if (!process.env.OPENROUTER_API_KEY) { console.error('OPENROUTER_API_KEY muhit o\'zgaruvchisi kerak (qiymat chop etilmaydi).'); process.exit(2); }
const env = { ...process.env, JARVIS_BAHO_LLM: '1', ...(process.argv[2] ? { JARVIS_BAHO_MODEL: process.argv[2] } : {}) };
const r = spawnSync('npx', ['vitest', 'run', 'src/lib/yordamchi/__baho__/niyat-llm-qolda.test.ts', '--reporter=verbose', '--silent=false'], { cwd: path.join(__dirname, '..', 'frontend'), env, stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
