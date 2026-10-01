import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../api/supabase';
import { sonOqi, tezkorPaket, tezkorQatorlar } from './fakt-tezkor';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 1, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: 'n', birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);

const rows = [
  q({ id: 1, tur: 'rz', kod: '1', nom: 'Земляные работы', versiya: 7 }),
  q({ id: 2, tur: 'bl', ota_id: 1, nom: 'Разработка грунта', hajm: 100 }),
  q({ id: 3, tur: 'rs', ota_id: 2, nom: 'Затраты труда' }),
  q({ id: 4, tur: 'mat', ota_id: 2, nom: 'Песок', hajm: 10, versiya: 3 }),
  q({ id: 5, tur: 'bl', ota_id: 1, nom: 'Доп. работа', qoshimcha: true }),
];

describe('tezkor fakt', () => {
  it('faqat BL/MAT/OB, bo‘lim yo‘li va ota versiyasi bilan', () => {
    const r = tezkorQatorlar(rows, [{ qator_id: 2, smeta_hajm: 100, fakt_hajm: 40 }]);
    expect(r.map((x) => x.id)).toEqual([2, 4, 5]);
    expect(r[0]).toMatchObject({ bolim: '1 Земляные работы', bolimId: 1, otaId: 1, otaVersiya: 7, smeta: 100, fakt: 40, qoldiq: 60 });
    expect(r[1]).toMatchObject({ otaId: 2, otaVersiya: 1, smeta: 10, fakt: 0 });
    expect(r[2].qoshimcha).toBe(true);
  });

  it('sonOqi: vergul, bo‘shliq, bo‘sh va noto‘g‘ri', () => {
    expect(sonOqi('12,5')).toBe(12.5);
    expect(sonOqi(' 1 000 ')).toBe(1000);
    expect(sonOqi('')).toBeNull();
    expect(Number.isNaN(sonOqi('abc'))).toBe(true);
  });

  it('bir nechta qator bitta paketga; xatolar alohida', () => {
    const r = tezkorQatorlar(rows, [{ qator_id: 2, smeta_hajm: 100, fakt_hajm: 40 }]);
    const ok = tezkorPaket({ 2: '10', 4: '2,5', 5: '' }, r);
    expect(ok).toMatchObject({ ok: true, qatorlar: [{ qator_id: 2, hajm: 10 }, { qator_id: 4, hajm: 2.5 }], xatolar: [] });
    const bad = tezkorPaket({ 2: '-50', 4: 'x', 5: '0' }, r);
    expect(bad.ok).toBe(false);
    expect(bad.xatolar.map((x) => x.xato).sort()).toEqual(['MANFIY_KATTA', 'NOL', 'SON_EMAS']);
    expect(tezkorPaket({ 2: '-5' }, r)).toMatchObject({ ok: true, qatorlar: [{ qator_id: 2, hajm: -5 }] });
  });
});
