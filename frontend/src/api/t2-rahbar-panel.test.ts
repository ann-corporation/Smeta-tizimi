import { afterEach, describe, expect, it, vi } from 'vitest';
import { rahbarPanelOl, rahbarPanelTozala } from './t2-rahbar-panel';

afterEach(() => vi.unstubAllGlobals());
const paket = { qqs_bilan: 112, qqs: 12, ustamali: 100, ustamasiz: 80, kesim: { chel: 80 }, soat: {}, subpudratchilar: [] };

describe('rahbarPanelTozala', () => {
  it('buzuq paket → null; massivlardagi null tashlanadi; kiritilmagan qiymat null bo‘lib qoladi', () => {
    const r = rahbarPanelTozala({
      ok: true, kartalar: { portfel: { smeta: paket }, bajarildi: { jami: { qqs_bilan: 'x' }, davr: paket }, tolandi: { jami: null, manbalar_yoq: ['tolov'] } },
      obyektlar: [{ obyekt_id: 1, smeta: paket, f2: null }, null], diqqat: [null, { kod: 'narxsiz', summa_tasir: null }], pul_oqimi: { oylar: [null] },
    });
    expect(r.kartalar.portfel.smeta?.qqs_bilan).toBe(112);
    expect(r.kartalar.bajarildi.jami).toBeNull();
    expect(r.kartalar.tolandi.jami).toBeNull();
    expect(r.obyektlar).toHaveLength(1);
    expect(r.obyektlar[0].f2).toBeNull();
    expect(r.diqqat).toEqual([{ kod: 'narxsiz', summa_tasir: null }]);
    expect(r.pul_oqimi.oylar).toEqual([]);
    expect(r.tasdiq_kutmoqda).toEqual([]);
  });
});

describe('rahbarPanelOl', () => {
  it('so‘rov: soro + kompaniya + ixtiyoriy obyekt/davr', async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) => Response.json({ ok: true, natija: { ok: true, kartalar: {}, obyektlar: [] } }));
    vi.stubGlobal('fetch', f);
    const r = await rahbarPanelOl({ kompaniyaId: 5, obyektId: 7, davrDan: '2026-01', davrGacha: null });
    expect(r.ok).toBe(true);
    expect(JSON.parse(String(f.mock.calls[0][1]!.body))).toEqual({ soro: 'rahbar_panel_v1', kompaniya_id: 5, obyekt_id: 7, davr_dan: '2026-01' });
  });
  it('server rad etsa — xato (kod bilan)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true, natija: { ok: false, code: 'DAVR_NOTOGRI' } })));
    const r = await rahbarPanelOl({ kompaniyaId: 5 });
    expect(r).toMatchObject({ ok: false, code: 'DAVR_NOTOGRI' });
  });
});
