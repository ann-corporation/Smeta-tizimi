/* «To'liq bot» matnlari (functions/_shared/telegram-toliq*.ts): tgT('...') kalitlarining rus va ingliz tarjimasi lug'atda (qism/telegram-toliq-bot.json) bo'lishi shart. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tgT } from '../../functions/_shared/telegram';

const FAYLLAR = ['', '-yadro', '-obyekt', '-fakt', '-hujjat', '-qoshimcha'].map((n) => join(__dirname, '..', '..', 'functions', '_shared', `telegram-toliq${n}.ts`));
const ISTISNO = /^(F-2|Jarvis|Fakt|Smeta)$/;

describe('telegram to‘liq bot: til', () => {
  it('har tgT kaliti va doimiy menyu yorliqlari ru/en ga tarjima qilingan', () => {
    const yoq: string[] = [];
    for (const f of FAYLLAR) {
      for (const m of readFileSync(f, 'utf8').matchAll(/tgT\(\s*'((?:\\.|[^'\\])*)'/g)) {
        const k = m[1].replace(/\\'/g, "'");
        for (const til of ['ru', 'en'] as const) if (tgT(k, til) === k && !ISTISNO.test(k)) yoq.push(`${f.split(/[\\/]/).at(-1)}: ${k} [${til}]`);
      }
    }
    for (const k of ['Obyektlar', 'Bugun', 'Tasdiqlar', 'Bildirishnomalar', 'Fakt kiritish', 'Hujjatlar', 'Menyu']) {
      for (const til of ['ru', 'en'] as const) if (tgT(k, til) === k) yoq.push(`yorliq: ${k} [${til}]`);
    }
    expect(yoq, `Tarjimasi yo'q: src/i18n/lugat/qism/telegram-toliq-bot.json ga qo'shing:\n${yoq.join('\n')}`).toEqual([]);
  });
});