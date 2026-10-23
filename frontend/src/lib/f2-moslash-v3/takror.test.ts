import { describe, expect, it, vi } from 'vitest';
import { avvalgiF2Ol, f2RaqamNormal } from './takror';

describe('F2 identity preflight', () => {
  it('looks up exactly the identity written by an unnumbered import, scoped to company/object/month', async () => {
    const oqi = vi.fn().mockResolvedValue({ok:true,qatorlar:[{id:9,oy:'2026-07-01',raqam:null,holat:'tasdiqlangan'}]});
    expect((await avvalgiF2Ol(oqi,5,8,'2026-07'))?.id).toBe(9);
    expect(oqi).toHaveBeenCalledWith(expect.objectContaining({jadval:'t2_akt',limit:1,
      filtr:'kompaniya_id=eq.5&obyekt_id=eq.8&tur=eq.f2&holat=neq.bekor&oy=eq.2026-07-01&or=(raqam.is.null,raqam.eq.)'}));
  });
  it('numbered F2: looks up only the same number, so other numbers in the same month are not duplicates', async () => {
    const oqi = vi.fn().mockResolvedValue({ok:true,qatorlar:[]});
    expect(await avvalgiF2Ol(oqi,5,129,'2025-09','  F2-07 ')).toBeNull();
    expect(oqi).toHaveBeenCalledWith(expect.objectContaining({jadval:'t2_akt',limit:1,
      filtr:'kompaniya_id=eq.5&obyekt_id=eq.129&tur=eq.f2&holat=neq.bekor&oy=eq.2025-09-01&raqam=eq.F2-07'}));
    await avvalgiF2Ol(oqi,5,129,'2025-09','№ 7,a&b');
    expect(oqi.mock.calls[1][0].filtr).toContain(`raqam=eq.${encodeURIComponent('№ 7,a&b')}`);
    await avvalgiF2Ol(oqi,5,129,'2025-09','   ');
    expect(oqi.mock.calls[2][0].filtr).toContain('or=(raqam.is.null,raqam.eq.)');
  });
  it('normalizes the act number like the server stores it', () => {
    expect(f2RaqamNormal('  7 ')).toBe('7');
    expect(f2RaqamNormal(null)).toBe('');
    expect(f2RaqamNormal('x'.repeat(150))).toHaveLength(100);
  });
  it('empty history is distinct from unavailable/incomplete history', async () => {
    expect(await avvalgiF2Ol(vi.fn().mockResolvedValue({ok:true,qatorlar:[]}),5,8,'2026-07')).toBeNull();
    for (const r of [{ok:false},{ok:true,toliq:false,qatorlar:[]}]) {
      await expect(avvalgiF2Ol(vi.fn().mockResolvedValue(r),5,8,'2026-07')).rejects.toThrow('F2_DUPLICATE_CHECK_FAILED');
    }
  });
  it('rejects invalid scope before any query', async () => {
    const oqi=vi.fn();
    await expect(avvalgiF2Ol(oqi,5,8,'2026-13')).rejects.toThrow('F2_SCOPE_INVALID');
    await expect(avvalgiF2Ol(oqi,0,8,'2026-07')).rejects.toThrow('F2_SCOPE_INVALID');
    expect(oqi).not.toHaveBeenCalled();
  });
});
