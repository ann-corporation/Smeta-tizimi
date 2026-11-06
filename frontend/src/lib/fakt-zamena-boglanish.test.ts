import { describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ oqi: vi.fn() }));
vi.mock('../api/supabase', () => ({ sbOqi: api.oqi }));
import { zamenaBoglanishOqi, zamenaMiqdorOqi, zamenaToliqOqi } from './fakt-zamena-boglanish';

const qatorlar = [{ id: 5, replaces_line_id: 2, almashtirish_hajm: 1.5 }, { id: 6, replaces_line_id: null, almashtirish_hajm: null }, { id: 7, replaces_line_id: 3, almashtirish_hajm: 0 }];
const holat = [{ qator_id: 2, almashtirilgan_hajm: 4 }];
const javob = (s: { jadval: string }) => ({ ok: true, toliq: true, qatorlar: s.jadval === 't2_qator' ? qatorlar : holat });

describe('zamenaToliqOqi (tezlik: t2_qator bir marta)', () => {
  it('eski ikki o‘qish bilan aynan bir natija, lekin t2_qator bir marta o‘qiladi', async () => {
    api.oqi.mockImplementation(async (s: { jadval: string }) => javob(s));
    const [b, m] = [await zamenaBoglanishOqi(9), await zamenaMiqdorOqi(9)];
    api.oqi.mockClear();
    const y = await zamenaToliqOqi(9);
    expect(y.ok && b.ok && m.ok).toBe(true);
    if (!y.ok || !b.ok || !m.ok) return;
    expect(y.natija.boglanish).toEqual(b.natija);
    expect(y.natija.miqdor).toEqual(m.natija);
    expect(api.oqi.mock.calls.filter(([s]) => s.jadval === 't2_qator')).toHaveLength(1);
  });
  it('qat‘iy: biror o‘qish to‘liq bo‘lmasa — ok:false (jim bo‘sh xarita emas)', async () => {
    api.oqi.mockImplementation(async (s: { jadval: string }) => (s.jadval === 't2_qator_holat' ? { ok: false, error: 'x' } : javob(s)));
    expect((await zamenaToliqOqi(9)).ok).toBe(false);
  });
});
