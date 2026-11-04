import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OTISHLAR, TENDER_HOLATLAR, effektivHolat, harakatlar, izohKerak, keyingiHolatlar, otishMumkin, otishRuxsati, taklifBerishMumkin, yakunlandi } from './holat';

describe('tender holat mashinasi', () => {
  it('baza (_t2_tender_otish_ruxsat) bilan AYNAN bir xil jadval', () => {
    const sql = readFileSync(resolve(__dirname, '../../../../supabase/migrations/20261122000200_t2_tender_protsess_v1.sql'), 'utf8');
    const blok = sql.slice(sql.indexOf('function public._t2_tender_otish_ruxsat'), sql.indexOf('-- Ko\'rinish: egasi'));
    const juftlar = [...blok.matchAll(/\('([a-z_]+)','([a-z_]+)'\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    expect(juftlar).toEqual(OTISHLAR.map(([a, b]) => `${a}>${b}`).sort());
  });
  it('asosiy yo\'l: qoralama → … → yopildi', () => {
    const yol = ['qoralama', 'tasdiqlashda', 'elon', 'baholash', 'golib_tanlandi', 'shartnoma', 'bajarilmoqda', 'yopildi'] as const;
    for (let i = 0; i < yol.length - 1; i++) expect(otishMumkin(yol[i], yol[i + 1])).toBe(true);
  });
  it('sakrash va orqaga qaytish taqiqlangan; yakunlangandan chiqish yo\'q', () => {
    expect(otishMumkin('qoralama', 'elon')).toBe(false);          // tasdiqsiz e'lon yo'q
    expect(otishMumkin('elon', 'golib_tanlandi')).toBe(false);    // ochish va baholashsiz g'olib yo'q
    expect(otishMumkin('golib_tanlandi', 'baholash')).toBe(false);
    for (const h of ['yopildi', 'bekor'] as const) { expect(yakunlandi(h)).toBe(true); expect(keyingiHolatlar(h)).toEqual([]); }
    for (const h of TENDER_HOLATLAR.filter((x) => !yakunlandi(x))) expect(otishMumkin(h, 'bekor')).toBe(h !== 'yopildi');
  });
  it('baholash → elon (qayta raund) mumkin', () => expect(otishMumkin('baholash', 'elon')).toBe(true));
  it('muddati o\'tgan elon = takliflar_yopildi (virtual)', () => {
    const hozir = Date.parse('2026-11-10T10:00:00Z');
    expect(effektivHolat('elon', '2026-11-10T09:59:00Z', hozir)).toBe('takliflar_yopildi');
    expect(effektivHolat('elon', '2026-11-10T10:01:00Z', hozir)).toBe('elon');
    expect(effektivHolat('elon', null, hozir)).toBe('elon');
    expect(effektivHolat('baholash', '2020-01-01T00:00:00Z', hozir)).toBe('baholash');
    expect(taklifBerishMumkin('elon', '2026-11-10T09:59:00Z', hozir)).toBe(false);
    expect(taklifBerishMumkin('elon', '2026-11-11T09:59:00Z', hozir)).toBe(true);
  });
  it('izoh va ruxsat qoidalari bazadagi bilan bir xil', () => {
    expect(izohKerak('tasdiqlashda', 'qoralama')).toBe(true);
    expect(izohKerak('elon', 'takliflar_yopildi')).toBe(true);
    expect(izohKerak('baholash', 'yopildi')).toBe(true);
    expect(izohKerak('bajarilmoqda', 'yopildi')).toBe(false);
    expect(izohKerak('qoralama', 'tasdiqlashda')).toBe(false);
    expect(otishRuxsati('tasdiqlashda')).toBe('yoz');
    expect(otishRuxsati('elon')).toBe('tasdiq');
    expect(otishRuxsati('shartnoma')).toBe('yoz');
  });
  it('tugmalar: ruxsatsiz hech narsa; muddatga qarab ochish / erta yopish', () => {
    expect(harakatlar('tasdiqlashda', { yoz: true, tasdiq: false }, false)).toEqual([]);
    expect(harakatlar('tasdiqlashda', { yoz: true, tasdiq: true }, false)).toEqual(['elon', 'qaytarish', 'bekor']);
    expect(harakatlar('elon', { yoz: true, tasdiq: true }, false)).toContain('erta_yopish');
    expect(harakatlar('elon', { yoz: true, tasdiq: true }, true)).toContain('ochish');
    expect(harakatlar('elon', { yoz: true, tasdiq: true }, true)).not.toContain('erta_yopish');
    expect(harakatlar('qoralama', { yoz: true, tasdiq: false }, false)).toEqual(['tahrir', 'tasdiqga']);
    expect(harakatlar('yopildi', { yoz: true, tasdiq: true }, false)).toEqual([]);
    expect(harakatlar('baholash', { yoz: true, tasdiq: true }, false)).toEqual(['baholash_saqlash', 'raund', 'golib', 'yopish', 'bekor']);
  });
});
