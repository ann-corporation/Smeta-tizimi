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
      .filter((r) => /\b(?:aiCall|aiXom)\(|\bAI\.run\(/.test(readFileSync(join(ILDIZ, r), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')));
    expect(buzilgan).toEqual([]);
  });
  it('har model endpointi hisobli o‘ramni ishlatadi (ai-parse, ai-savol, smeta-ai, smeta-narx-agent, agent-ish, foto-ai, loyiha-ai-oqish)', () => {
    for (const f of ['api/ai-parse.ts', 'api/smeta-ai.ts', 'api/smeta-narx-agent.ts', 'api/agent-ish.ts', 'api/foto-ai.ts', 'api/loyiha-ai-oqish.ts']) {
      expect(readFileSync(join(ILDIZ, f), 'utf8'), f).toMatch(/\baiHisobli\s*\(/);
    }
  });
  it('Jarvis goes through the billed adapter for both providers', () => {
    const chat = readFileSync(join(ILDIZ, '_shared/jarvis/chat.ts'), 'utf8');
    const adapter = readFileSync(join(ILDIZ, '_shared/jarvis/model.ts'), 'utf8');
    expect(chat).toMatch(/import\s+\{\s*callJarvisModel\b[^}]*\}\s+from\s+['"]\.\/model['"]/);
    expect(chat).toMatch(/\bcallJarvisModel\s*\(/);
    expect(adapter).toMatch(/\breturn aiHisobli\s*\(/);
    expect(adapter).toMatch(/\bworkersAiHisobli\([^\n]*\(\) => binding\.run\(/);
  });
});
