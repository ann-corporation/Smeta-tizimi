import { describe, expect, it, vi } from 'vitest';
import { birlikIzohi, birlikTahlil, hajmMatni } from './birlik';
import { navbatniYubor, xotiraOmbor, type NavbatYozuv } from './navbat';

const yozuv = (id: string, ustiga: Partial<NavbatYozuv> = {}): NavbatYozuv => ({ id, tur: 'fakt', kompaniyaId: 1, obyektId: 2, payload: { sana: '2026-11-12', qatorlar: [{ qator_id: 3, hajm: 1 }] }, yaratildi: Number(id.slice(-1)), urinish: 0, ...ustiga });

describe('birlik tushuntirish', () => {
  it('«100 м2» → 100 m²; ko‘paytirgichsiz birlik o‘zgarmaydi; noma’lum birlik matn bo‘lib qoladi', () => {
    expect(birlikTahlil('100 м2')).toEqual({ ko: 100, asos: 'm²', belgi: '100 m²' });
    expect(birlikTahlil('м3')).toEqual({ ko: 1, asos: 'm³', belgi: 'm³' });
    expect(birlikTahlil('1000 шт')?.asos).toBe('dona');
    expect(birlikTahlil('')).toBeNull();
    expect(birlikTahlil('qop')?.asos).toBe('qop');
  });
  it('hajm odam tilida: 5 × 100 m² = 500 m²; yo‘q hajm — «—» (0 emas)', () => {
    expect(hajmMatni(5, '100 м2')).toBe('5 × 100 m² = 500 m²');
    expect(hajmMatni(2.5, 'м3')).toBe('2,5 m³');
    expect(hajmMatni(null, 'м3')).toBe('—');
  });
  it('izoh faqat ko‘paytirgichi bor birlikda chiqadi', () => {
    expect(birlikIzohi('м3', 4)).toBeNull();
    expect(birlikIzohi('100 м2', 5)).toContain('500 m²');
    expect(birlikIzohi('100 м2')).toBe('Bitta birlik = 100 m².');
  });
});

describe('oflayn navbat', () => {
  it('internet qaytganda ketma-ket yuboriladi va olib tashlanadi (har biri o‘z operation_id si bilan)', async () => {
    const o = xotiraOmbor(); await o.qosh(yozuv('op-1')); await o.qosh(yozuv('op-2'));
    const yubor = vi.fn(async (_y: NavbatYozuv) => ({ ok: true as const }));
    const h = await navbatniYubor(o, yubor, () => true);
    expect(yubor.mock.calls.map((c) => c[0].id)).toEqual(['op-1', 'op-2']);
    expect(h).toEqual({ yuborildi: 2, qoldi: 0, rad: 0 });
    expect(await o.hammasi()).toHaveLength(0);
  });
  it('oflayn bo‘lsa hech narsa yuborilmaydi va navbat saqlanadi', async () => {
    const o = xotiraOmbor(); await o.qosh(yozuv('op-1'));
    const yubor = vi.fn(async () => ({ ok: true as const }));
    const h = await navbatniYubor(o, yubor, () => false);
    expect(yubor).not.toHaveBeenCalled(); expect(h.qoldi).toBe(1);
  });
  it('vaqtinchalik xatoda to‘xtaydi (keyingilar tegilmaydi), yozuv navbatda qoladi — qayta yuborish bir xil id bilan', async () => {
    const o = xotiraOmbor(); await o.qosh(yozuv('op-1')); await o.qosh(yozuv('op-2'));
    const yubor = vi.fn(async () => ({ ok: false as const, qayta: true as const, xato: 'tarmoq' }));
    const h = await navbatniYubor(o, yubor, () => true);
    expect(yubor).toHaveBeenCalledTimes(1); expect(h.qoldi).toBe(2);
    const qolgan = await o.hammasi(); expect(qolgan[0].id).toBe('op-1'); expect(qolgan[0].urinish).toBe(1);
  });
  it('qat‘iy rad (ruxsat yo‘q) — navbatdan chiqadi, xato foydalanuvchiga ko‘rsatish uchun saqlanadi, keyingisi davom etadi', async () => {
    const o = xotiraOmbor(); await o.qosh(yozuv('op-1')); await o.qosh(yozuv('op-2'));
    const yubor = vi.fn(async (y: NavbatYozuv) => (y.id === 'op-1' ? { ok: false as const, qayta: false as const, xato: 'Ruxsat yo‘q' } : { ok: true as const }));
    const h = await navbatniYubor(o, yubor, () => true);
    expect(h).toEqual({ yuborildi: 1, qoldi: 0, rad: 1 });
    expect((await o.hammasi())[0].xato).toBe('Ruxsat yo‘q');
  });
  it('bir vaqtda ikki sync bitta jarayonga birlashadi (takror yuborish yo‘q)', async () => {
    const o = xotiraOmbor(); await o.qosh(yozuv('op-1'));
    const yubor = vi.fn(async () => { await new Promise((r) => setTimeout(r, 10)); return { ok: true as const }; });
    await Promise.all([navbatniYubor(o, yubor, () => true), navbatniYubor(o, yubor, () => true)]);
    expect(yubor).toHaveBeenCalledTimes(1);
  });
});
