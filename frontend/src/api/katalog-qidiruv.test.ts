import { describe, expect, it } from 'vitest';
import { katalogQidirSozlar } from './t2-narx-dalil';

describe('Katalogdan qidirish — so‘zlar', () => {
  it('kichik harf, maxsus belgilar (PostgREST filtrini buzadigan * & , ( ) % .) tozalanadi, 1 harfli so‘z tashlanadi, ≤ 6', () => {
    expect(katalogQidirSozlar('Труба  57x3,5 (ГОСТ)')).toEqual(['труба', '57x3', 'гост']);
    expect(katalogQidirSozlar('a&b=c*d')).toEqual(['b=c']);
    expect(katalogQidirSozlar('бетон В25 м3 a b c d e f g')).toEqual(['бетон', 'в25', 'м3']);
    expect(katalogQidirSozlar('  ')).toEqual([]);
  });
});
