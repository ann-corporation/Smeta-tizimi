import { describe, expect, it } from 'vitest';
import { aiElementlar, aiHududi, aiNarxi, hududKaliti } from './ai-oqish';
import type { TokenNarx } from '../../api/t2-token';

const narx = (amal: 'ai_kirish' | 'ai_chiqish'): TokenNarx => ({ amal, nom: amal, tur: 'ai', birlik: 1000, asos_som: 0, birlik_som: 100, min_som: 0, max_som: null, foyda_foiz: 0, izoh: null, faol: true });

describe('AI bilan o‘qish: narx oldindan, kesh bepul, natija taklif', () => {
  it('narx = kirish + chiqish taxmini × pullik sahifalar; keshdagi bepul; narx yo‘q -> null (0 emas)', () => {
    const n = [narx('ai_kirish'), narx('ai_chiqish')]; const s = { token_som: 10, foyda_foiz: 0 };
    const r = aiNarxi(['a', 'b', 'c'], n, s, (k) => k === 'a');
    expect(r.sahifa).toBe(3); expect(r.bepul).toBe(1); expect(r.token).toBeGreaterThan(0);
    expect(aiNarxi(['a', 'b'], n, s, () => true).token).toBe(0);
    expect(aiNarxi(['a'], undefined, s, () => false).token).toBeNull();
  });
  it('hudud sarlavhadan; kalit hududga bog‘liq', () => {
    const q = aiHududi([{ s: 'Спецификация элементов', x: 100, y: 50, w: 80, h: 8, sahifa: 1 }]);
    expect(q).toMatchObject({ x0: 60, y0: 30 }); expect(hududKaliti(q)).toBe('r60x30'); expect(hududKaliti(null)).toBe('toliq'); expect(aiHududi([])).toBeNull();
  });
  it('AI elementi: ishonch past, ai belgisi, noma‘lum miqdor null va ishonch 0.3, uskuna odam tasdig‘iga', () => {
    const e = aiElementlar([{ nom: 'A', belgi: null, birlik: 'шт', miqdor: null, tur: 'uskuna' }, { nom: 'B', belgi: 'P', birlik: 'м2', miqdor: 3, tur: 'eshik_oyna' }], 5, null, { x0: 0, y0: 0, x1: 9, y1: 9 });
    expect(e[0]).toMatchObject({ miqdor: null, ishonch: 0.3, odamKerak: true }); expect(e[0].ogohlantirish).toEqual(['ai', 'miqdor_yoq']);
    expect(e[1]).toMatchObject({ miqdor: 3, ishonch: 0.6, profil: 'ai' });
  });
});
