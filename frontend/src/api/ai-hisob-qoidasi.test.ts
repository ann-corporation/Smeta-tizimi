import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * QOIDA: model provayderini to'g'ridan-to'g'ri chaqirish (`aiCall(`) FAQAT hisobli o'ramlarda (agent-hisob.ts, ai-hisobli.ts) bo'ladi —
 * shunda har chaqiruv oylik limit, kompaniya hamyoni va sarf jurnalidan o'tadi (limit yo'q = AI yo'q). Yangi endpoint buni chetlab o'tolmaydi.
 */
const ILDIZ = join(process.cwd(), 'functions');   // vitest frontend/ papkasidan ishga tushadi
const RUXSAT = new Set(['_shared/ai.ts', '_shared/agent-hisob.ts', '_shared/ai-hisobli.ts']);
function fayllar(d: string): string[] {
  return readdirSync(d).flatMap((n: string) => { const p = join(d, n); return statSync(p).isDirectory() ? fayllar(p) : /\.ts$/.test(n) && !/\.test\.ts$/.test(n) ? [p] : []; });
}

describe('AI hisob qoidasi', () => {
  it('aiCall( faqat hisobli o‘ramlarda ishlatiladi', () => {
    const buzilgan = fayllar(ILDIZ).map((p) => relative(ILDIZ, p).replace(/\\/g, '/')).filter((r) => !RUXSAT.has(r))
      .filter((r) => /\baiCall\(/.test(readFileSync(join(ILDIZ, r), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')));
    expect(buzilgan).toEqual([]);
  });
  it('har model endpointi hisobli o‘ramni ishlatadi (ai-parse, ai-savol, smeta-ai, smeta-narx-agent, agent-ish)', () => {
    for (const f of ['api/ai-parse.ts', 'api/ai-savol.ts', 'api/smeta-ai.ts', 'api/smeta-narx-agent.ts', 'api/agent-ish.ts']) {
      expect(readFileSync(join(ILDIZ, f), 'utf8'), f).toMatch(/aiHisobli/);
    }
  });
});
