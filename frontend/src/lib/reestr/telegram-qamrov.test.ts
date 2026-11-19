/* docs/ops/TELEGRAM_BOT_QAMROV.md to'g'riligi: har sahifa yo'li matritsada bor va §4 hisobi jadvalga mos (hujjat yolg'on qolmasin). */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SAHIFALAR } from './sahifa';

const MD = readFileSync(join(__dirname, '..', '..', '..', '..', 'docs', 'ops', 'TELEGRAM_BOT_QAMROV.md'), 'utf8');
const QATORLAR = [...MD.matchAll(/^\| (\/admin\/[^ |]+) \|(.*)\|$/gm)].map((m) => ({ yol: m[1], h: m[2].split('|').map((x) => x.trim()) }));

describe('Telegram bot qamrov matritsasi', () => {
  it('SAHIFALAR dagi har sahifa yo‘li matritsada bor (takrorsiz)', () => {
    const bor = QATORLAR.map((q) => q.yol);
    expect(SAHIFALAR.map((s) => s.yol).filter((y) => !bor.includes(y))).toEqual([]);
    expect(new Set(bor).size).toBe(bor.length);
  });
  it('§4 hisob jadvali qatorlardagi «Hozir → Keyin» ustuniga mos', () => {
    const sana = (idx: 0 | 1) => {
      const s = { '✅': 0, qisman: 0, '❌': 0 } as Record<string, number>;
      for (const q of QATORLAR) { const v = q.h[4].split('→')[idx].trim(); s[v] = (s[v] ?? 0) + 1; }
      return [s['✅'], s.qisman, s['❌']];
    };
    const jadval = [...MD.matchAll(/^\| Shu PR (?:gacha|dan keyin) \| (\d+) \| (\d+) \| (\d+) \|$/gm)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
    expect(jadval).toEqual([sana(0), sana(1)]);
  });
});