/* Telegram bot matnlari: functions/ dagi barcha tgT('...') kalitlari lug'atda (uz/ru/en to'liq). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
describe('i18n: yangi bot matnlarining hammasi uz/ru/en da', () => {
  it('manba fayllaridagi tgT(...) kalitlari lug‘atda (ru/en to‘liq)', () => {
    const fayllar = ['_shared/telegram-bot.ts', '_shared/telegram-bot-oqim.ts', '_shared/telegram-tugma.ts', 'api/telegram/webhook.ts', 'api/telegram/kunlik.ts', 'api/telegram/index.ts', '_shared/telegram-kanal.ts'];
    const lug = JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/lugat/qism/telegram-bot.json'), 'utf8')) as Record<string, { ru: string; en: string }>;
    const kirish = JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/lugat/qism/telegram-kirish.json'), 'utf8')) as Record<string, { ru: string; en: string }>;
    const bot2 = JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/lugat/qism/telegram-bot-2.json'), 'utf8')) as Record<string, { ru: string; en: string }>;
    const usern = JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/lugat/qism/telegram-username.json'), 'utf8')) as Record<string, { ru: string; en: string }>;
    const kanal = JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/lugat/qism/telegram-kanal.json'), 'utf8')) as Record<string, { ru: string; en: string }>;
    const yoq: string[] = [];
    for (const f of fayllar) {
      const s = readFileSync(join(process.cwd(), 'functions', f), 'utf8');
      for (const m of s.matchAll(/tgT\(\s*(?:\w+\s*\?\s*)?'((?:[^'\\]|\\.)*)'(?:\s*:\s*'((?:[^'\\]|\\.)*)')?/g)) {
        for (const k of [m[1], m[2]].filter(Boolean) as string[]) { const e = lug[k] ?? kirish[k] ?? bot2[k] ?? usern[k] ?? kanal[k]; if (!e?.ru || !e?.en) yoq.push(k); }
      }
    }
    expect(yoq).toEqual([]);
  });
});
