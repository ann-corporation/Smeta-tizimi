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
  it('takroriy o‘qishdan keyin asossiz amallarni muvaffaqiyat deb qaytarmaydi', async () => {
    api.suhbat.mockResolvedValue(javob({ oqish: [{ vosita: 'holat', arg: null }] }));
    const oqi = vi.fn(async () => 'h');
    const r = await agentSikli({ kompaniyaId: 17, xabarlar: [{ rol: 'user', matn: '?' }], vositalar: vositalar(oqi) });
    expect(oqi).toHaveBeenCalledTimes(1);
    expect(api.suhbat).toHaveBeenCalledTimes(2);
    expect(r).toEqual({ ok: false, code: 'AYLANISH_TUGADI' });
    expect(MAX_AYLANISH).toBeGreaterThanOrEqual(3);
  });
  it('boshlanishidayoq bekor qilingan bo‘lsa provider chaqirilmaydi', async () => {
    const r = await agentSikli({ kompaniyaId: 17, xabarlar: [], vositalar: vositalar(), tirikmi: () => false });
    expect(r).toEqual({ ok: false, code: 'BEKOR' });
    expect(api.suhbat).not.toHaveBeenCalled();
  });
  it('provider javobidan keyin bekor qilinsa o‘qish vositasi chaqirilmaydi', async () => {
    let tirik = true;
    api.suhbat.mockImplementation(async () => { tirik = false; return javob({ oqish: [{ vosita: 'holat' }] }); });
    const oqi = vi.fn(async () => 'h');
    const r = await agentSikli({ kompaniyaId: 17, xabarlar: [], vositalar: vositalar(oqi), tirikmi: () => tirik });
    expect(r).toEqual({ ok: false, code: 'BEKOR' });
    expect(api.suhbat).toHaveBeenCalledTimes(1);
    expect(oqi).not.toHaveBeenCalled();
  });
  it('o‘qish vaqtida bekor qilinsa boshqa o‘qish va provider chaqirilmaydi', async () => {
    let tirik = true;
    api.suhbat.mockResolvedValue(javob({ oqish: [{ vosita: 'qidir', arg: 'bir' }, { vosita: 'qidir', arg: 'ikki' }] }));
    const oqi = vi.fn(async () => { tirik = false; return 'natija'; });
    const r = await agentSikli({ kompaniyaId: 17, xabarlar: [], vositalar: vositalar(oqi), tirikmi: () => tirik });
    expect(r).toEqual({ ok: false, code: 'BEKOR' });
    expect(oqi).toHaveBeenCalledTimes(1);
    expect(api.suhbat).toHaveBeenCalledTimes(1);
  });
  it('oxirgi aylanishdagi bajarilmagan o‘qishni bajarilgan deb ko‘rsatmaydi', async () => {
    let n = 0;
    api.suhbat.mockImplementation(async () => {
      return javob({ oqish: [{ vosita: 'qidir', arg: `so‘rov-${n++}` }] });
    });
    const oqi = vi.fn(async () => 'natija');
    const r = await agentSikli({ kompaniyaId: 17, xabarlar: [], vositalar: vositalar(oqi) });
    expect(r).toEqual({ ok: false, code: 'AYLANISH_TUGADI' });
    expect(api.suhbat).toHaveBeenCalledTimes(MAX_AYLANISH);
    expect(oqi).toHaveBeenCalledTimes(MAX_AYLANISH - 1);
    expect(api.suhbat.mock.calls[MAX_AYLANISH - 1][5]).toBe(true);
  });
  it('bir javob ichidagi ayni o‘qish faqat bir marta bajariladi', async () => {
    const sorov = { vosita: 'holat', arg: null };
    api.suhbat.mockResolvedValueOnce(javob({ oqish: [sorov, sorov] })).mockResolvedValueOnce(javob({ javob: 'Tayyor' }));
    const oqi = vi.fn(async () => 'h');
    const r = await agentSikli({ kompaniyaId: 17, xabarlar: [], vositalar: vositalar(oqi) });
    expect(oqi).toHaveBeenCalledTimes(1);
    expect(r.ok && r.javob).toBe('Tayyor');
  });
  it('server xatosi qaytariladi, vosita chaqirilmaydi', async () => {
    api.suhbat.mockResolvedValue({ ok: false, code: 'BYUDJET_YOQ' });
    const oqi = vi.fn();
    const r = await agentSikli({ kompaniyaId: 17, xabarlar: [{ rol: 'user', matn: '?' }], vositalar: vositalar(oqi) });
    expect(r).toEqual({ ok: false, code: 'BYUDJET_YOQ', message: undefined }); expect(oqi).not.toHaveBeenCalled();
  });
});

it('failed reading cannot become an actionable model success',async()=>{
 api.suhbat.mockResolvedValueOnce(javob({oqish:[{vosita:'holat',arg:null}]}));
 const oqi=vi.fn(async()=>{throw new Error('offline');});
 const result=await agentSikli({kompaniyaId:17,xabarlar:[],vositalar:vositalar(oqi)});
 expect(result).toEqual({ok:false,code:'OQISH_XATO'});expect(api.suhbat).toHaveBeenCalledTimes(1);
});
