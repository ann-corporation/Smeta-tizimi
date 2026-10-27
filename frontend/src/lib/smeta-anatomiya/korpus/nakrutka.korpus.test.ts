/**
 * Smeta podvalidan nakrutka o'qish — real korpus o'lchovi. Real fayllar va ularning ro'yxati repoga
 * qo'yilmaydi (MAXFIY): ro'yxat lokal JSON faylda —
 *
 *   KORPUS_NAKRUTKA='C:/…/royxat.json' KORPUS_NAKRUTKA_CHIQISH='C:/…/natija.json' npx vitest run src/lib/smeta-anatomiya/korpus/nakrutka
 *
 * royxat.json: [{ "obyekt": "…", "fayl": "D:/…/x.xlsx", "varaqlar": ["…"]? }]. `varaqlar` berilmasa —
 * anatomiya tanlovi (`nakrutkaVaraqlari`). Env berilmasa test o'tkazib yuboriladi (soxta PASS emas).
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { kitobAnatomiyasi } from '../index';
import { nakrutkaPodvaliniOqi, nakrutkaVaraqlari } from '../nakrutka';
import { faylniOqi } from './oqish';

const ROYXAT = process.env.KORPUS_NAKRUTKA;

describe.skipIf(!ROYXAT)('Smeta podvalidan nakrutka (real korpus)', () => {
  it('har obyekt: o‘qilgan foizlar, dalil va isbot', () => {
    const royxat = JSON.parse(fs.readFileSync(ROYXAT!, 'utf8').replace(/^﻿/, '')) as Array<{ obyekt: string; fayl: string; varaqlar?: string[] }>;
    const chiqish: unknown[] = [];
    for (const r of royxat) {
      const kitob = faylniOqi(r.fayl, path.dirname(r.fayl));
      const varaqlar = r.varaqlar ?? nakrutkaVaraqlari(kitob, kitobAnatomiyasi(kitob));
      const n = nakrutkaPodvaliniOqi(kitob, { varaqlar });
      chiqish.push({
        obyekt: r.obyekt, fayl: path.basename(r.fayl), varaqlar: n.varaqlar, masshtab: n.masshtab, holat: n.holat,
        koeffitsientlar: n.koeffitsientlar,
        manba: Object.fromEntries(Object.entries(n.manba).map(([k, m]) => [k, `${m!.dalil} ${m!.manzil.varaq}!${m!.manzil.qator}`])),
        isbot: n.isbot.map((b) => `${b.mos ? 'OK' : 'NOMOS'} ${b.nom} (farq ${b.farq})`),
        nostandart: n.nostandart.map((x) => `${x.xom.slice(0, 50)} ${x.foiz ?? '?'}% = ${x.summa}`),
        resursKf: n.resursKf,
        review: n.review.map((x) => `${x.kod}: ${x.izoh}`.slice(0, 220)),
      });
      expect(n.qatorlar.every((q) => q.manzil.qator > 0)).toBe(true);
    }
    if (process.env.KORPUS_NAKRUTKA_CHIQISH) fs.writeFileSync(process.env.KORPUS_NAKRUTKA_CHIQISH, JSON.stringify(chiqish, null, 2));
  }, 600_000);
});
