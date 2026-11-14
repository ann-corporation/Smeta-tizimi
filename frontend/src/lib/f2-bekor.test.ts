import { describe, expect, it, vi } from 'vitest';
import { f2BekorBajar, f2BekorMumkin, f2BekorRejasi, f2BekorXatoMatni, type F2BekorAkt } from './f2-bekor';

const akt = (id: number, s: F2BekorAkt['lifecycle_status'], versiya = 1): F2BekorAkt => ({ id, versiya, lifecycle_status: s, raqam: String(id) });

describe('f2-bekor', () => {
  it('reja: tasdiqlangan ham bekor qilinadi; bekor — takror; almashtirilgan — yo‘q', () => {
    expect(f2BekorRejasi('approved')).toEqual(['cancelled']);
    expect(f2BekorRejasi('draft')).toEqual(['cancelled']);
    expect(f2BekorRejasi('checked')).toEqual(['cancelled']);
    expect(f2BekorRejasi('cancelled')).toEqual([]);
    expect(f2BekorRejasi('superseded')).toBeNull();
  });

  it('ruxsat: tasdiqlangan uchun f2.cancel + f2.approve', () => {
    expect(f2BekorMumkin('approved', { mayCancel: true, mayApprove: false })).toBe(false);
    expect(f2BekorMumkin('approved', { mayCancel: true, mayApprove: true })).toBe(true);
    expect(f2BekorMumkin('draft', { mayCancel: true, mayApprove: false })).toBe(true);
    expect(f2BekorMumkin('draft', { mayCancel: false, mayApprove: true })).toBe(false);
    expect(f2BekorMumkin('cancelled', { mayCancel: true, mayApprove: true })).toBe(false);
  });

  it('sababsiz — hech narsa chaqirilmaydi', async () => {
    const otish = vi.fn();
    const n = await f2BekorBajar([akt(1, 'approved')], '  ', otish);
    expect(otish).not.toHaveBeenCalled();
    expect(n.xato?.code).toBe('REASON_REQUIRED');
  });

  it('ketma-ket, ko‘rilgan versiya bilan; birinchi xatoda to‘xtaydi', async () => {
    const otish = vi.fn(async (a: F2BekorAkt) => (a.id === 2 ? { ok: false, code: 'STALE_VERSION' } : { ok: true }));
    const prog: number[] = [];
    const n = await f2BekorBajar([akt(1, 'approved', 7), akt(2, 'approved', 3), akt(3, 'draft')], 'qayta import', otish, (i) => prog.push(i));
    expect(otish).toHaveBeenCalledTimes(2);
    expect(otish.mock.calls[0][0].versiya).toBe(7);
    expect(n.bajarildi).toEqual([1]);
    expect(n.xato).toEqual({ aktId: 2, code: 'STALE_VERSION', matn: undefined });
    expect(prog).toEqual([1]);
  });

  it('allaqachon bekor — chaqiruvsiz o‘tadi; tarmoq xatosi to‘xtatadi', async () => {
    const otish = vi.fn(async () => { throw new Error('tarmoq'); });
    const n = await f2BekorBajar([akt(1, 'cancelled'), akt(2, 'approved')], 'x', otish);
    expect(n.bajarildi).toEqual([1]);
    expect(n.xato?.code).toBe('NETWORK_ERROR');
  });
});

describe('f2BekorXatoMatni: DEPENDENTS_EXIST — aniq nima bog‘langan va avval nimani bekor qilish kerak', () => {
  it('Forma 3 ga bog‘langan: Forma 3 raqami va «avval bekor qiling»', () => {
    const m = f2BekorXatoMatni({ code: 'DEPENDENTS_EXIST', bogliq: { forma3: [5, 8], storno_aktlar: [], davr_muhr: false } });
    expect(m).toContain('bog‘liq hujjatlar bor');
    expect(m).toContain('Forma 3 (№ 5, 8) — avval shu Forma 3 ni bekor qiling');
    expect(m).not.toContain('storno');
    expect(m).not.toContain('DEPENDENTS_EXIST');
  });
  it('storno va davr muhri ham alohida ko‘rsatiladi', () => {
    const m = f2BekorXatoMatni({ code: 'DEPENDENTS_EXIST', bogliq: { forma3: [], storno_aktlar: [12], davr_muhr: true } });
    expect(m).toContain('storno / pereraschet F2 (akt № 12) — avval ularni bekor qiling');
    expect(m).toContain('davr muhrlangan — avval davrni qayta oching');
  });
  it('boshqa kodlar tushunarli; noma‘lum kod — server xabari yoki zaxira (xom xato emas)', () => {
    expect(f2BekorXatoMatni({ code: 'STALE_VERSION' })).toContain('boshqa oynada');
    expect(f2BekorXatoMatni({ code: 'REASON_REQUIRED' })).toContain('sababini yozing');
    expect(f2BekorXatoMatni({ code: 'X', xabar: 'Server aytdi' })).toBe('Server aytdi');
    expect(f2BekorXatoMatni({})).toBe('Bekor qilinmadi');
  });
});