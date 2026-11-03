import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ sbOqi: vi.fn() }));
vi.mock('./supabase', () => ({ sbOqi: m.sbOqi }));
import { egizakHolatOl, egizakQatorlarOl, EgizakOqishXatosi } from './t2-egizak';
import { egizakJuftlari, egizakNomIldizi } from '../lib/f2-moslash-v3/egizak';

afterEach(() => m.sbOqi.mockReset());
const qator = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => ({ id: a + i }));

describe('egizak yuklagichi', () => {
  it('xato xabari serverdagi KODni ko‘rsatadi', async () => {
    m.sbOqi.mockResolvedValue({ ok: false, error: 'x', code: 'TENANT_FORBIDDEN' });
    await expect(egizakQatorlarOl(168)).rejects.toThrow('(TENANT_FORBIDDEN)');
    m.sbOqi.mockResolvedValue({ ok: false, error: 'x' });
    await expect(egizakQatorlarOl(168)).rejects.toBeInstanceOf(EgizakOqishXatosi);
    await expect(egizakQatorlarOl(168)).rejects.toThrow('(UPSTREAM)');
  });

  it('toliq:false bo‘lsa id=gt.<oxirgi> bilan davom etadi — 5380 qator to‘liq', async () => {
    m.sbOqi.mockImplementation(async (s: { filtr: string }) => {
      const dan = Number(/id=gt\.(\d+)/.exec(s.filtr)?.[1] ?? 0);
      const bo = qator(dan + 1, Math.min(dan + 2000, 5380));
      return { ok: true, qatorlar: bo, toliq: bo[bo.length - 1].id >= 5380 };
    });
    const r = await egizakQatorlarOl(167);
    expect(r).toHaveLength(5380);
    expect(r.map((x) => x.id)).toEqual(qator(1, 5380).map((x) => x.id));
    expect(m.sbOqi).toHaveBeenCalledTimes(3);
    expect(m.sbOqi.mock.calls[0][0]).toMatchObject({ jadval: 't2_qator', filtr: 'obyekt_id=eq.167', tartib: 'id.asc' });
    expect(m.sbOqi.mock.calls[1][0].filtr).toBe('obyekt_id=eq.167&id=gt.2000');
  });

  it('yarim natija ilgarilamasa — jim kesilmaydi, TOLIQ_EMAS xatosi', async () => {
    m.sbOqi.mockResolvedValue({ ok: true, qatorlar: [], toliq: false });
    await expect(egizakQatorlarOl(167)).rejects.toThrow('(TOLIQ_EMAS)');
  });

  it('holat qator_id kaliti bilan davom etadi', async () => {
    m.sbOqi.mockImplementation(async (s: { filtr: string }) => s.filtr.includes('qator_id=gt.')
      ? { ok: true, qatorlar: [{ qator_id: 3 }], toliq: true } : { ok: true, qatorlar: [{ qator_id: 1 }, { qator_id: 2 }], toliq: false });
    expect((await egizakHolatOl(168)).map((x) => x.qator_id)).toEqual([1, 2, 3]);
    expect(m.sbOqi.mock.calls[1][0]).toMatchObject({ jadval: 't2_qator_holat', filtr: 'obyekt_id=eq.168&qator_id=gt.2', tartib: 'qator_id.asc' });
  });
});

describe('egizakJuftlari', () => {
  const o = (id: number, nom: string, loyiha_id: number | null = 22) => ({ id, nom, loyiha_id });
  it('faqat nomi bir xil «…№N» obyektlar (loyihaning hammasi emas)', () => {
    const list = [o(153, 'Sun’iy ko‘l'), o(162, 'Fast Food 1-etaj'), o(163, 'Fast Food 2-etaj №1'), o(164, 'Fast Food 2-etaj №2'), o(165, 'Fast Food 2-etaj №3'),
      o(167, 'Osiyo oshxonasi №1'), o(168, 'Osiyo oshxonasi №2'), o(900, 'Osiyo oshxonasi №3', 7)];
    expect(egizakJuftlari(list, 167).map((x) => x.id)).toEqual([168]);
    expect(egizakJuftlari(list, 163).map((x) => x.id)).toEqual([164, 165]);
    expect(egizakJuftlari(list, 153)).toEqual([]);
    expect(egizakNomIldizi('Osiyo  oshxonasi № 12')).toBe('osiyo oshxonasi');
    expect(egizakNomIldizi('№1')).toBeNull();
  });
});
