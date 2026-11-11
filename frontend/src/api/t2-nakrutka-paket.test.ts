import { afterEach, describe, expect, it, vi } from 'vitest';
import { t2NakrutkaOldindan, paketdanOl } from './t2-nakrutka-paket';
import { ustamaOzgardi } from '../umumiy/ui/ustama-kesh';

afterEach(() => { vi.unstubAllGlobals(); ustamaOzgardi(); });
const javob = (o: unknown) => ({ json: async () => o }) as Response;

describe('t2NakrutkaOldindan: bitta paket so\'rovi, xatoda eski yo\'l', () => {
  it('ko\'p juftlik - BITTA so\'rov; natija paketdanOl orqali beriladi', async () => {
    const f = vi.fn(async () => javob({ ok: true, natija: { ok: true, natijalar: [
      { obyekt_id: 1, shartnoma_id: null, natija: { ok: true, obyekt_id: 1 } },
      { obyekt_id: 2, shartnoma_id: null, natija: { ok: true, obyekt_id: 2 } }] } }));
    vi.stubGlobal('fetch', f);
    t2NakrutkaOldindan(17, [{ obyektId: 1 }, { obyektId: 2 }, { obyektId: 1 }]);
    expect(await paketdanOl(2)).toMatchObject({ obyekt_id: 2 });
    expect(await paketdanOl(1)).toMatchObject({ obyekt_id: 1 });
    expect(f).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ soro: 'obyekt_nakrutka_paket_v1', kompaniya_id: 17 });
    expect(body.juftlar).toHaveLength(2);
  });
  it('paket xato bersa - null (chaqiruvchi eski yo\'lga tushadi)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => javob({ ok: false, error: 'xato' })));
    t2NakrutkaOldindan(18, [{ obyektId: 11 }, { obyektId: 12 }]);
    expect(await paketdanOl(11)).toBeNull();
  });
  it('bitta obyekt uchun paket yuborilmaydi', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    t2NakrutkaOldindan(19, [{ obyektId: 21 }]);
    expect(f).not.toHaveBeenCalled();
    expect(await paketdanOl(21)).toBeNull();
  });
});