import { describe, expect, it } from 'vitest';
import { HUB_BANDLAR, hubFiltr, hubGuruhla, hubKorinadi, initsiallar, kompaniyaRollari, rolNomi, sessiyaTugashi, sonYoki } from './akkaunt-lib';

describe('akkaunt-lib', () => {
  it('initsiallar', () => {
    expect(initsiallar('Anvar Ahatqulov')).toBe('AA');
    expect(initsiallar(null, 'anvar.ahatqulov@gmail.com')).toBe('AA');
    expect(initsiallar('', undefined)).toBe('?');
    expect(initsiallar('boss')).toBe('BO');
  });
  it('NULL != 0', () => {
    expect(sonYoki(null)).toBe('—');
    expect(sonYoki(undefined)).toBe('—');
    expect(sonYoki(NaN)).toBe('—');
    expect(sonYoki(0)).toBe('0');
  });
  it('rolNomi', () => {
    expect(rolNomi('boss')).toBe('Kompaniya rahbari');
    expect(rolNomi('yangi')).toBe('yangi');
    expect(rolNomi(null)).toBe('—');
  });
  it('bir kompaniyada bir nechta rol guruhlanadi', () => {
    const r = kompaniyaRollari([
      { kompaniya_id: 1, nom: 'A', rol: 'pto' },
      { kompaniya_id: 1, nom: 'A', rol: 'bugalter' },
      { kompaniya_id: 2, nom: 'B', rol: 'boss' },
      { kompaniya_id: 3, nom: 'C', rol: 'pto', faol: false },
    ], [{ kompaniyaId: 1, nom: 'A', rol: 'pto' }]);
    expect(r).toEqual([
      { kompaniyaId: 1, nom: 'A', rollar: ['pto', 'bugalter'] },
      { kompaniyaId: 2, nom: 'B', rollar: ['boss'] },
    ]);
  });
  it('sessiyaTugashi sekund va ms', () => {
    expect(sessiyaTugashi(null)).toBeNull();
    expect(sessiyaTugashi(1_700_000_000)?.getTime()).toBe(1_700_000_000_000);
    expect(sessiyaTugashi(1_700_000_000_000)?.getTime()).toBe(1_700_000_000_000);
  });
  it('hub: ruxsat filtri', () => {
    const band = (yol: string) => HUB_BANDLAR.find((b) => b.yol === yol)!;
    expect(hubKorinadi(band('/admin/boshqaruv'), { superadmin: false, permissions: ['control.global.read'] })).toBe(false);
    expect(hubKorinadi(band('/admin/boshqaruv'), { superadmin: true })).toBe(true);
    expect(hubKorinadi(band('/admin/kompaniya'), { superadmin: false, permissions: ['company.read'] })).toBe(true);
    expect(hubKorinadi(band('/admin/kompaniya'), { superadmin: false, permissions: ['smeta.read'] })).toBe(false);
    expect(hubKorinadi(band('/admin/sayt-xaritasi'), { superadmin: false, rol: 'pto' })).toBe(false);
    expect(hubKorinadi(band('/admin/sayt-xaritasi'), { superadmin: false, rol: 'admin' })).toBe(true);
    expect(hubKorinadi(band('/admin/kompaniya'), { superadmin: false, rol: 'pto', modulYoqilgan: () => false })).toBe(false);
  });
  it('hub: qidiruv va guruhlash', () => {
    const id = (s: string) => s;
    const r = hubFiltr(HUB_BANDLAR, { superadmin: true }, 'nakrutka', id);
    expect(r.map((b) => b.yol)).toEqual(['/admin/nakrutka']);
    const g = hubGuruhla(hubFiltr(HUB_BANDLAR, { superadmin: true }, '', id));
    expect(g.length).toBe(5);
    expect(g.reduce((s, x) => s + x.bandlar.length, 0)).toBe(HUB_BANDLAR.length);
  });
});
