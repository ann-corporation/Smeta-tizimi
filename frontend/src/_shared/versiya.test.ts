import { describe, expect, it } from 'vitest';
import { htmldanKirishSkripti } from './versiya';

describe('versiya kuzatuvi', () => {
  it('index.html dan kirish skripti xeshi olinadi', () => {
    expect(htmldanKirishSkripti('<script type="module" crossorigin src="/assets/index-mU6HDLPt.js"></script>')).toBe('/assets/index-mU6HDLPt.js');
    expect(htmldanKirishSkripti('<script src="/src/main.tsx"></script>')).toBeNull();
  });
});
