import { describe, expect, it } from 'vitest';
import { MODUL_KATALOGI, MODUL_MAP, tanlanadiganModullar, tanlovAlmashtir, tanlovFiltr, tanlovTozala } from './modullarim';
import { menyuQur, menyuYollari } from '../nav/navFiltr';

describe('modullarim tanlovi', () => {
  it('katalog kodlari takrorsiz va kichik lotin (server KOD regexi)', () => {
    const kodlar = MODUL_KATALOGI.map((m) => m.kod);
    expect(new Set(kodlar).size).toBe(kodlar.length);
    for (const k of kodlar) expect(k).toMatch(/^[a-z0-9_.]{2,40}$/);
  });
  it('tanlov yo‘q yoki faqat veb katalogida yo‘q kodlar — filtr yo‘q', () => {
    expect(tanlovFiltr([])).toBeNull();
    expect(tanlovFiltr(null)).toBeNull();
    expect(tanlovFiltr(['jarvis', 'tasdiq'])).toBeNull();
  });
  it('tanlangan modul va yadro sahifalar ko‘rinadi, tanlanmagan katalog moduli yashiriladi', () => {
    const f = tanlovFiltr(['fakt'])!;
    expect(f('/admin/fakt')).toBe(true);
    expect(f('/admin/moliya')).toBe(false);
    expect(f('/admin/akkaunt')).toBe(true);
    expect(f('/admin/kompaniya')).toBe(true);
    expect(f('/admin/ish-joylarim')).toBe(true);
  });
  it('ichki yo‘l ham modulga tegishli (prefiks chegarasi)', () => {
    const f = tanlovFiltr(['f2'])!;
    expect(f('/admin/f2-tayyorlash')).toBe(true);
    expect(f('/admin/f2')).toBe(true);
    expect(f('/admin/f2-reestr')).toBe(false);
  });
  it('almashtirish: qo‘shadi/olib tashlaydi, Android ning veb bo‘lmagan kodlarini saqlaydi', () => {
    let t = { tanlangan: ['jarvis'], tartib: ['jarvis'], versiya: 3 };
    t = tanlovAlmashtir(t, 'fakt');
    expect(t).toEqual({ tanlangan: ['jarvis', 'fakt'], tartib: ['jarvis', 'fakt'], versiya: 3 });
    t = tanlovAlmashtir(t, 'fakt');
    expect(t.tanlangan).toEqual(['jarvis']);
    expect(tanlovTozala({ tanlangan: ['jarvis', 'fakt', 'moliya'], tartib: [], versiya: 1 }).tanlangan).toEqual(['jarvis']);
  });
  it('tanlash ro‘yxati faqat ko‘rinadigan yo‘llarga ega modullardan; doim-yadro ro‘yxatda yo‘q', () => {
    const r = tanlanadiganModullar(['/admin/fakt', '/admin/kompaniya']).map((m) => m.kod);
    expect(r).toEqual(['fakt']);
    expect(MODUL_MAP.kompaniya.doim).toBe(true);
  });
  it('tanlov ruxsat BERMAYDI: ruxsatsiz foydalanuvchi uchun tanlangan modul menyuda baribir yo‘q', () => {
    const ctx = { superadmin: false, rol: 'usta', permissions: ['company.read', 'fakt.read'] as readonly string[] };
    const bosh = menyuYollari(menyuQur({ ...ctx, ilova: 'hammasi' }));
    const tanlov = menyuYollari(menyuQur({ ...ctx, ilova: 'hammasi', modulTanlov: tanlovFiltr(['moliya', 'fakt']) }));
    expect(tanlov).not.toContain('/admin/moliya');
    for (const y of tanlov) expect(bosh).toContain(y);
  });
  it('tanlov menyuni toraytiradi', () => {
    const ctx = { superadmin: true, rol: 'superadmin' };
    const hammasi = menyuYollari(menyuQur({ ...ctx, ilova: 'hammasi' }));
    const tor = menyuYollari(menyuQur({ ...ctx, ilova: 'hammasi', modulTanlov: tanlovFiltr(['fakt']) }));
    expect(tor.length).toBeLessThan(hammasi.length);
    expect(tor).toContain('/admin/fakt');
    expect(tor).not.toContain('/admin/moliya');
  });
});