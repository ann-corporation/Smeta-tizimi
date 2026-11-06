import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../api/supabase';
import {
  bosKiritma, f2Jami, f2MumkinHajmlarniOl, f2Qatorlar, f2Qur, f2ZamenaQolla, type F2Holat,
} from './f2-tayyor';
import { tekshiruvBandlari, tekshiruvSanoq } from './f2-tayyorlash-korinish';

const q = (o: Partial<T2Qator> & { id: number; tur: string; norma?: number | null }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null,
  nom: `synthetic-${o.id}`, birlik: 'м3', hajm: null, narx: null, summa: null, kat: null,
  narx_usul: null, qoshimcha: false, zamena: false, d1: null, d2: null, d3: null,
  xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);

describe('F2 save regression: synthetic multi-section estimate + status', () => {
  it('take-all leaves no pre-save errors across zero, dust, null/zero prices, minus, replacement, excluded and refreshed-version rows', () => {
    const rows = [
      q({ id: 1, tur: 'rz', nom: 'Section A' }),
      q({ id: 2, tur: 'bl', ota_id: 1, nom: 'Regular work', hajm: 10, versiya: 2 }),
      q({ id: 3, tur: 'rs', ota_id: 2, kat: 'ЧЕЛ', nom: 'Labor', norma: 1, narx: 1000 }),
      q({ id: 4, tur: 'bl', ota_id: 1, nom: 'Minus work', hajm: -10 }),
      q({ id: 5, tur: 'rs', ota_id: 4, kat: 'МАТ', nom: 'Minus resource', norma: 1, narx: 200 }),
      q({ id: 6, tur: 'mat', ota_id: 1, kat: 'МАТ', nom: 'Zero-remaining material', narx: null }),
      q({ id: 7, tur: 'mat', ota_id: 1, kat: 'МАТ', nom: 'Dust material', narx: 0 }),
      q({ id: 8, tur: 'rz', nom: 'Section B' }),
      q({ id: 9, tur: 'bl', ota_id: 8, nom: 'Replacement work', hajm: 4 }),
      q({ id: 10, tur: 'rs', ota_id: 9, kat: 'МАТ', nom: 'Replaced resource', hajm: 2, norma: 1, narx: 500 }),
      q({ id: 11, tur: 'rs', ota_id: 9, kat: 'МАТ', nom: 'Replacement', hajm: 2, norma: 1, narx: 600, zamena: true, qoshimcha: true }),
      q({ id: 12, tur: 'bl', ota_id: 8, nom: 'Not performed work', hajm: 3 }),
      q({ id: 13, tur: 'mat', ota_id: 8, kat: 'МАТ', nom: 'Not performed material', narx: 900 }),
      q({ id: 14, tur: 'mat', ota_id: 8, kat: 'МАТ', nom: 'Tiny balance', narx: 100 }),
      q({ id: 15, tur: 'mat', ota_id: 8, kat: 'МАТ', nom: 'Unknown price at zero balance', narx: null }),
    ];
    const holat: F2Holat[] = [
      { qator_id: 2, f2_mumkin_hajm: 5, f2_hajm: 5, smeta_hajm: 10 },
      { qator_id: 3, f2_mumkin_hajm: 5 },
      { qator_id: 4, f2_mumkin_hajm: -10, fakt_hajm: -10, smeta_hajm: -10 },
      { qator_id: 5, f2_mumkin_hajm: -10 },
      { qator_id: 6, f2_mumkin_hajm: 0 },
      { qator_id: 7, f2_mumkin_hajm: 1e-7 },
      { qator_id: 9, f2_mumkin_hajm: 2, f2_hajm: 2, smeta_hajm: 4 },
      { qator_id: 10, f2_mumkin_hajm: 2 },
      { qator_id: 11, f2_mumkin_hajm: 2 },
      { qator_id: 12, f2_mumkin_hajm: 0 },
      { qator_id: 13, f2_mumkin_hajm: 0 },
      { qator_id: 14, f2_mumkin_hajm: 1e-7 },
      { qator_id: 15, f2_mumkin_hajm: 0 },
      // Old row id from a previous estimate version must not be mistaken for current row 2.
      { qator_id: 999, f2_mumkin_hajm: 99, f2_hajm: 99 },
    ];
    const excluded = new Set([13]); // current active "bajarilmaydi" row
    const replacementLinks = new Map([[11, 10]]);
    const bolimlar = f2Qur(rows, holat, undefined, 'fakt', undefined, {
      chiqarilgan: excluded,
      zamenaAsl: replacementLinks,
    });
    const k = f2MumkinHajmlarniOl(bolimlar, bosKiritma());

    expect(bolimlar.map((b) => b.id)).toEqual([1, 8]);
    expect(k.hajm).toMatchObject({ 2: '5', 4: '-10', 9: '2' });
    expect(k.hajm[6]).toBeUndefined(); // zero remainder, NULL price stays unknown
    expect(k.hajm[7]).toBeUndefined(); // 1e-7 × zero price is below money dust threshold
    expect(k.hajm[12]).toBeUndefined(); // work with zero remaining quantity
    expect(k.hajm[13]).toBeUndefined(); // excluded by active not-performed state
    expect(k.hajm[14]).toBeUndefined(); // tiny known-value remainder
    expect(k.hajm[15]).toBeUndefined(); // NULL price with zero quantity remains NULL, not zero
    expect(bolimlar.flatMap((b) => b.ishlar).find((i) => i.id === 2)?.resurslar.some((r) => r.id === 3)).toBe(true); // refreshed current version
    expect(bolimlar.flatMap((b) => b.ishlar).find((i) => i.id === 9)?.resurslar.find((r) => r.id === 11)?.almashtiradi).toBe(10);

    const { qatorlar, tashlandi } = f2ZamenaQolla(f2Qatorlar(bolimlar, k), bolimlar, k, {
      rows, zamenaAsl: replacementLinks, miqdor: new Map([[11, 2]]), oldingi: new Map(), serverAlm: new Map(),
    });
    expect(tashlandi.has(10)).toBe(true);
    expect(qatorlar.map((x) => x.xato).filter(Boolean)).toEqual([]);
    expect(f2Jami(qatorlar).xato).toBe(0);
    const bands = tekshiruvBandlari({ qatorlar, raqam: '1' });
    expect(tekshiruvSanoq(bands).bad).toBe(0);
  });
});
