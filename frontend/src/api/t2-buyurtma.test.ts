import { beforeEach, describe, expect, it, vi } from 'vitest';

const yozAmali = vi.hoisted(() => vi.fn());
vi.mock('./supabase', () => ({ yozAmali, yangiOperationId: () => 'op-yangi' }));

import { buyurtmaOlishYoz, buyurtmaOtish, buyurtmaQabul, buyurtmaTafsilotOl, buyurtmaXatosi, buyurtmaYarat, buyurtmalarOl } from './t2-buyurtma';

beforeEach(() => { yozAmali.mockReset(); });

describe('t2-buyurtma api', () => {
  it('yarat: barcha buyurtma maydonlari amal yukiga tushadi; narx yo\'q bo\'lsa null, operation_id beriladi', async () => {
    yozAmali.mockResolvedValue({ ok: true, id: 5 });
    await buyurtmaYarat(17, { ijrochiKompaniyaId: 31, obyektId: 4, aloqaId: 8, qatorlar: [{ nom: 'Material', birlik: 'tonna', miqdor: 2, zayavka_id: 44 }] });
    expect(yozAmali).toHaveBeenCalledWith({
      amal: 'buyurtma_yarat_v1', kompaniya_id: 17, operation_id: 'op-yangi', ijrochi_kompaniya_id: 31, obyekt_id: 4, aloqa_id: 8, tur: 'material',
      qatorlar: [{ nom: 'Material', birlik: 'tonna', miqdor: 2, zayavka_id: 44 }], shart: {},
    });
  });
  it('qayta urinishda bir xil operation_id uzatiladi', async () => {
    yozAmali.mockResolvedValue({ ok: true });
    await buyurtmaOtish(17, { buyurtmaId: 9, kutilganVersiya: 2, holat: 'qabul_qilindi' }, 'OP-1');
    await buyurtmaOtish(17, { buyurtmaId: 9, kutilganVersiya: 2, holat: 'qabul_qilindi' }, 'OP-1');
    expect(yozAmali.mock.calls.map((c) => c[0].operation_id)).toEqual(['OP-1', 'OP-1']);
    expect(yozAmali.mock.calls[0][0]).toMatchObject({ amal: 'buyurtma_otish_v1', buyurtma_id: 9, kutilgan_versiya: 2, holat: 'qabul_qilindi', bosqich: null });
  });
  it('olish_yoz va qabul amallari', async () => {
    yozAmali.mockResolvedValue({ ok: true });
    await buyurtmaOlishYoz(17, { buyurtmaId: 9, kutilganVersiya: 3, olish: { manzil: 'Ombor' } });
    await buyurtmaQabul(17, { buyurtmaId: 9, kutilganVersiya: 4, qatorlar: [{ buyurtma_qator_id: 1, qabul_miqdor: 2, holat: 'kam' }] });
    expect(yozAmali.mock.calls[0][0]).toMatchObject({ amal: 'buyurtma_olish_yoz_v1', olish: { manzil: 'Ombor' } });
    expect(yozAmali.mock.calls[1][0]).toMatchObject({ amal: 'buyurtma_qabul_v1', qatorlar: [{ buyurtma_qator_id: 1, qabul_miqdor: 2, holat: 'kam' }], izoh: null });
    expect('hujjat_idlar' in yozAmali.mock.calls[1][0]).toBe(false);
  });
  it('o\'qish: POST amal (operation_id yo\'q), natija ok bo\'lsa qaytadi', async () => {
    yozAmali.mockResolvedValue({ ok: true, qatorlar: [{ id: 1 }], keyingi_id: null });
    const r = await buyurtmalarOl({ kompaniyaId: 17, yonalish: 'menga', holat: 'yuborildi' });
    expect(yozAmali).toHaveBeenCalledWith({ amal: 'buyurtma_royxat_v1', kompaniya_id: 17, yonalish: 'menga', holat: 'yuborildi' });
    expect(r.ok && r.qatorlar).toHaveLength(1);
    yozAmali.mockResolvedValue({ ok: true, tomon: 'xaridor', buyurtma: { id: 9 }, qatorlar: [] });
    const t = await buyurtmaTafsilotOl(17, 9);
    expect(yozAmali).toHaveBeenLastCalledWith({ amal: 'buyurtma_tafsilot_v1', kompaniya_id: 17, buyurtma_id: 9 });
    expect(t.ok).toBe(true);
  });
  it('o\'qish xatosi: server code tushunarli xabarga o\'giriladi, tarmoq xatosi ushlanadi', async () => {
    yozAmali.mockResolvedValue({ ok: false, code: 'TOPILMADI' });
    const r = await buyurtmaTafsilotOl(17, 9);
    expect(r).toEqual({ ok: false, error: 'Buyurtma topilmadi.', code: 'TOPILMADI' });
    yozAmali.mockRejectedValue(new Error('uzildi'));
    expect(await buyurtmalarOl({ kompaniyaId: 17, yonalish: 'meniki' })).toEqual({ ok: false, error: 'uzildi' });
  });
  it('buyurtmaXatosi: ma\'lum code > xabar, aks holda server matni, bo\'sh bo\'lsa umumiy', () => {
    expect(buyurtmaXatosi({ code: 'ALOQA_KERAK' })).toMatch(/aloqa/);
    expect(buyurtmaXatosi({ code: 'NOMALUM', error: 'Server matni' })).toBe('Server matni');
    expect(buyurtmaXatosi(null)).toBe('Xato yuz berdi');
  });
});
