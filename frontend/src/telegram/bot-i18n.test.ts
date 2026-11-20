/* Telegram bot matnlari: functions/ dagi barcha tgT('...') kalitlari lug'atda (uz/ru/en to'liq). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
describe('i18n: yangi bot matnlarining hammasi uz/ru/en da', () => {
  it('manba fayllaridagi tgT(...) kalitlari lug‘atda (ru/en to‘liq)', () => {
    const fayllar = ['_shared/telegram-bot.ts', '_shared/telegram-bot-oqim.ts', '_shared/telegram-tugma.ts', 'api/telegram/webhook.ts', 'api/telegram/kunlik.ts', 'api/telegram/index.ts', '_shared/telegram-kanal.ts', '_shared/telegram-toliq-qoshimcha.ts', '_shared/telegram-sifat.ts', '_shared/telegram-jarvis.ts', '_shared/telegram-holat.ts'];
    const lug = JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/lugat/qism/telegram-bot.json'), 'utf8')) as Record<string, { ru: string; en: string }>;
    const kirish = JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/lugat/qism/telegram-kirish.json'), 'utf8')) as Record<string, { ru: string; en: string }>;
    const bot2 = JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/lugat/qism/telegram-bot-2.json'), 'utf8')) as Record<string, { ru: string; en: string }>;
    const usern = JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/lugat/qism/telegram-username.json'), 'utf8')) as Record<string, { ru: string; en: string }>;
    const kanal = JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/lugat/qism/telegram-kanal.json'), 'utf8')) as Record<string, { ru: string; en: string }>;
    const reliz = JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/lugat/qism/telegram-reliz.json'), 'utf8')) as Record<string, { ru: string; en: string }>;
    const toliq = JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/lugat/qism/telegram-toliq-bot.json'), 'utf8')) as Record<string, { ru: string; en: string }>;
    const toliq2 = JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/lugat/qism/telegram-toliq-bot-2.json'), 'utf8')) as Record<string, { ru: string; en: string }>;
    const sifat = JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/lugat/qism/telegram-sifat.json'), 'utf8')) as Record<string, { ru: string; en: string }>;
    const jarvis = JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/lugat/qism/telegram-jarvis.json'), 'utf8')) as Record<string, { ru: string; en: string }>;
    const yoq: string[] = [];
    for (const f of fayllar) {
      const s = readFileSync(join(process.cwd(), 'functions', f), 'utf8');
      for (const m of s.matchAll(/tgT\(\s*(?:\w+\s*\?\s*)?'((?:[^'\\]|\\.)*)'(?:\s*:\s*'((?:[^'\\]|\\.)*)')?/g)) {
        for (const k of [m[1], m[2]].filter(Boolean) as string[]) { const e = lug[k] ?? kirish[k] ?? bot2[k] ?? usern[k] ?? kanal[k] ?? reliz[k] ?? toliq[k] ?? toliq2[k] ?? sifat[k] ?? jarvis[k]; if (!e?.ru || !e?.en) yoq.push(k); }
      }
    }
    expect(yoq).toEqual([]);
  });
});
