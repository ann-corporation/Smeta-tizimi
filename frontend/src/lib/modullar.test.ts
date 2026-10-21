import { afterEach, describe, expect, it, vi } from 'vitest';
import { MENYU_MODUL, menyuModulYoqilgan } from './modullar';
import { modulOzgartir, type Modul } from '../api/t2-modul';

/* «Telegram modeli» (egasi 2026-10-21): o'chirilgan modul menyuda yo'q; PTO yadrosi doim; holat noma'lum — yashirilmaydi. */
const m = (kod: string, holat: 'on' | 'off', manba = 'default', versiya = 1): Modul => ({ kod, nom: kod, izoh: null, holat, manba, versiya });
afterEach(() => vi.unstubAllGlobals());

describe('modul katalogi — menyu', () => {
  it('o‘chirilgan modul yo‘llari yashiriladi, PTO yadrosi doim ko‘rinadi', () => {
    const l = [m('module.erp', 'off'), m('module.narx', 'on')];
    expect(menyuModulYoqilgan('/admin/moliya', l)).toBe(false);
    expect(menyuModulYoqilgan('/admin/smeta-narxlash', l)).toBe(true);
    for (const yol of ['/admin/obyektlar', '/admin/holat', '/admin/f2', '/admin/f2-tarix', '/admin/m29', '/admin/nakopitelniy']) {
      expect(MENYU_MODUL[yol]).toBeUndefined();
      expect(menyuModulYoqilgan(yol, l)).toBe(true);
    }
  });
  it('holat noma’lum (yuklanmoqda/xato) — hech narsa yashirilmaydi', () => {
    expect(menyuModulYoqilgan('/admin/moliya', undefined)).toBe(true);
    expect(menyuModulYoqilgan('/admin/moliya', [])).toBe(true);
  });
  it('o‘zgartirish kompaniya scope’ida, kompaniya_id bilan (middleware shu kompaniyani tekshiradi), override versiyasi bilan', async () => {
    const yuborildi: Array<Record<string, unknown>> = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => { yuborildi.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ ok: true }), { status: 200 }); }));
    await modulOzgartir(17, m('module.erp', 'on'), false);
    await modulOzgartir(17, m('module.erp', 'off', 'company', 3), true);
    expect(yuborildi[0]).toMatchObject({ action: 'capability_override_set', kod: 'module.erp', scope: 'company', scope_id: 17, kompaniya_id: 17, holat: 'off', expected_version: 0 });
    expect(yuborildi[1]).toMatchObject({ holat: 'on', expected_version: 3 });
  });
});
