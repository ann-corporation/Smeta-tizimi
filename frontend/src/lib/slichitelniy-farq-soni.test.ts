import { describe, expect, it } from 'vitest';
import type { T2Qator, T2QatorHolat } from '../api/supabase';
import { slichitelniyModeli } from './slichitelniy-vedomost';
import { slichitelniyFarqSoni } from './slichitelniy-farq-soni';

const q = (o: Partial<T2Qator>): T2Qator => ({ id: 0, obyekt_id: 1, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: 0, tur: 'rz', kod: null, nom: 'N', birlik: 'м', hajm: 10, narx: 5, summa: 50, kat: null, narx_usul: null, qoshimcha: false, zamena: false, d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, raqam: null, norma: null, ...o });
const h = (qator_id: number, fakt_hajm: number | null): T2QatorHolat => ({ id: qator_id, qator_id, obyekt_id: 1, tur: null, kod: null, nom: null, birlik: null, kat: null, smeta_hajm: null, smeta_summa: null, fakt_hajm: fakt_hajm as number, fakt_summa: 0, f2_hajm: 0, f2_summa: 0 } as unknown as T2QatorHolat);

describe('slichitelniyFarqSoni = slichitelniyModeli ortiq+kam', () => {
  it('aralash daraxt: bl bolali/bolasiz, qo‘shimcha, NULL hajm/fakt, ildizdagi qo‘shimcha', () => {
    const rows = [
      q({ id: 1, tur: 'rz', tartib: 1 }),
      q({ id: 2, tur: 'bl', ota_id: 1, tartib: 2 }),
      q({ id: 3, tur: 'rs', ota_id: 2, tartib: 3 }), q({ id: 4, tur: 'mat', ota_id: 2, tartib: 4, hajm: null }),
      q({ id: 5, tur: 'bl', ota_id: 1, tartib: 5 }),
      q({ id: 6, tur: 'bl', ota_id: 1, tartib: 6, qoshimcha: true, hajm: 3 }),
      q({ id: 7, tur: 'ob', ota_id: 1, tartib: 7, qoshimcha: true }),
      q({ id: 8, tur: 'rs', ota_id: 999, tartib: 8 }),
      q({ id: 9, tur: 'rz', tartib: 9 }),
    ];
    const st = [h(2, 5), h(3, 10), h(4, 1), h(5, 4), h(6, 2), h(7, 1), h(8, null)];
    const m = slichitelniyModeli(rows, st);
    expect(slichitelniyFarqSoni(rows, st)).toBe(m.ortiq + m.kam);
    expect(m.ortiq + m.kam).toBeGreaterThan(0);
  });
  it('bo‘sh', () => { expect(slichitelniyFarqSoni([], [])).toBe(0); });
});
