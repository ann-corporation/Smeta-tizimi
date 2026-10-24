import { describe, expect, it } from 'vitest';
import { narxsizImportHisobi } from './SmetaYuklaNative';
import type { AktNode } from '../../lib/f2-match-engine';

describe('narxsizImportHisobi (JONLI_SINOV #11)', () => {
  const rs = (nom: string, narx?: number): AktNode => ({ uid: nom, type: 'rs', nom, bir: 'шт', hajm: 1, narx } as AktNode);
  it('narx yo‘q va 0 narxsiz; mashinist mehnati normativ; haqiqiy narx kirmaydi', () => {
    const tree = [{ uid: 'rz', type: 'rz', nom: 'Bo‘lim', children: [rs('A', undefined), rs('B', 0), rs('C', 100), rs('ЗАТРАТЫ ТРУДА МАШИНИСТОВ', 0)] } as AktNode];
    expect(narxsizImportHisobi(tree)).toEqual({ jami: 4, narxsiz: 2, normativ: 1 });
  });
  it('hammasi narxli bo‘lsa ogohlantirish yo‘q', () => {
    expect(narxsizImportHisobi([rs('A', 5)]).narxsiz).toBe(0);
  });
});
