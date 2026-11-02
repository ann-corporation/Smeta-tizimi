import { beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ suhbat: vi.fn() }));
vi.mock('../../api/smeta-ai', () => ({ sahifaSuhbat: api.suhbat }));
import { agentSikli, MAX_AYLANISH, type SahifaVositalar } from './sikl';

const vositalar = (oqi = vi.fn(async () => 'natija')): SahifaVositalar => ({
  sahifa: 'fakt', kontekst: () => 'XULOSA', oqi, tekshir: (a) => (a.qator === 999 ? 'Qator topilmadi' : null), nomi: (a) => a.tur, bajar: vi.fn(async () => []),
});
const javob = (o: Record<string, unknown>) => ({ ok: true, model: 'm', javob: '', savollar: [], oqish: [], amallar: [], ...o });

beforeEach(() => api.suhbat.mockReset());

describe('agent sikli (tool-calling brauzerda)', () => {
  it('o‘qish vositasi bajariladi, natija keyingi aylanishda modelga boradi; amal tekshiriladi', async () => {
    api.suhbat.mockResolvedValueOnce(javob({ oqish: [{ vosita: 'qidir', arg: 'beton' }] }))
      .mockResolvedValueOnce(javob({ javob: 'Topdim', amallar: [{ tur: 'fakt_hajm', qator: 2, qiymat: '+5', izoh: '' }, { tur: 'fakt_hajm', qator: 999, qiymat: '+1', izoh: '' }] }));
    const oqi = vi.fn(async () => '[#2] beton');
    const qadam = vi.fn();
    const r = await agentSikli({ kompaniyaId: 17, xabarlar: [{ rol: 'user', matn: 'beton' }], vositalar: vositalar(oqi), qadam });
    expect(oqi).toHaveBeenCalledWith({ vosita: 'qidir', arg: 'beton' });
    expect(api.suhbat.mock.calls[1][4]).toEqual([{ vosita: 'qidir', arg: 'beton', natija: '[#2] beton' }]);
    expect(qadam).toHaveBeenCalledWith(expect.objectContaining({ matn: expect.stringContaining('beton') }));
    expect(r.ok && r.amallar.map((a) => a.ogoh)).toEqual([null, 'Qator topilmadi']);
  });
  it('takror so‘rov bajarilmaydi; oxirgi aylanishda server «oxirgi» bilan chaqiriladi', async () => {
    api.suhbat.mockResolvedValue(javob({ oqish: [{ vosita: 'holat', arg: null }] }));
    const oqi = vi.fn(async () => 'h');
    const r = await agentSikli({ kompaniyaId: 17, xabarlar: [{ rol: 'user', matn: '?' }], vositalar: vositalar(oqi) });
    expect(oqi).toHaveBeenCalledTimes(1);
    expect(api.suhbat).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(true);
    expect(MAX_AYLANISH).toBeGreaterThanOrEqual(3);
  });
  it('server xatosi qaytariladi, vosita chaqirilmaydi', async () => {
    api.suhbat.mockResolvedValue({ ok: false, code: 'BYUDJET_YOQ' });
    const oqi = vi.fn();
    const r = await agentSikli({ kompaniyaId: 17, xabarlar: [{ rol: 'user', matn: '?' }], vositalar: vositalar(oqi) });
    expect(r).toEqual({ ok: false, code: 'BYUDJET_YOQ', message: undefined }); expect(oqi).not.toHaveBeenCalled();
  });
});
