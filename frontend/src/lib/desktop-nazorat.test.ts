import { describe, expect, it } from 'vitest';
import { qurilmaFiltrla, qurilmaKompaniyalari, sababYaroqli, siyosatShakldan, siyosatShaklga, versiyaEskimi, versiyaTaqqosla, type DesktopQurilma } from './desktop-nazorat';

const q = (o: Partial<DesktopQurilma>): DesktopQurilma => ({
  device_id: '00000000-0000-4000-8000-00000000000' + (o.foydalanuvchi_id ?? 1), foydalanuvchi_id: 1, ism: 'Ali', login: 'ali@example.invalid',
  qurilma_nomi: 'PC-1', os: 'windows', ilova_versiya: '1.0.0', yaratildi: '2026-11-01T10:00:00Z', oxirgi_kirish: null,
  tugaydi: 2e12, sessiya_exp: 2e12, bekor: null, bekor_sabab: null, holat: 'faol', oxirgi_lease: null, oxirgi_lease_kompaniya_id: null,
  oxirgi_lease_obyekt_soni: null, lease_faol: false, kompaniyalar: [{ id: 1, nom: 'Alfa' }], ...o,
});

describe('desktop-nazorat lib', () => {
  const royxat = [q({}), q({ foydalanuvchi_id: 2, ism: 'Vali', qurilma_nomi: 'NOUT', holat: 'bekor', kompaniyalar: [{ id: 2, nom: 'Beta' }] }),
    q({ foydalanuvchi_id: 3, ism: 'Gani', ilova_versiya: '2.3.4', holat: 'muddati_otgan', kompaniyalar: [{ id: 2, nom: 'Beta' }, { id: 1, nom: 'Alfa' }] })];
  it('filters by status, company and free-text search (name, device, version, company)', () => {
    expect(qurilmaFiltrla(royxat, { qidiruv: '', holat: 'faol', kompaniyaId: null }).map((d) => d.ism)).toEqual(['Ali']);
    expect(qurilmaFiltrla(royxat, { qidiruv: '', holat: 'hammasi', kompaniyaId: 2 }).map((d) => d.ism)).toEqual(['Vali', 'Gani']);
    expect(qurilmaFiltrla(royxat, { qidiruv: 'nout', holat: 'hammasi', kompaniyaId: null }).map((d) => d.ism)).toEqual(['Vali']);
    expect(qurilmaFiltrla(royxat, { qidiruv: '2.3', holat: 'hammasi', kompaniyaId: null }).map((d) => d.ism)).toEqual(['Gani']);
    expect(qurilmaFiltrla(royxat, { qidiruv: 'BETA', holat: 'hammasi', kompaniyaId: null })).toHaveLength(2);
    expect(qurilmaKompaniyalari(royxat)).toEqual([{ id: 1, nom: 'Alfa' }, { id: 2, nom: 'Beta' }]);
  });
  it('compares versions numerically, unknown version counts as outdated when a minimum exists', () => {
    expect(versiyaTaqqosla('1.10.0', '1.2.0')).toBe(1);
    expect(versiyaTaqqosla('1.2.0', '1.2.0')).toBe(0);
    expect(versiyaTaqqosla('x', '1.2.0')).toBeNull();
    expect(versiyaEskimi('1.1.9', '1.2.0')).toBe(true);
    expect(versiyaEskimi(null, '1.2.0')).toBe(false); // unknown = allowed (server: nudge only)
    expect(versiyaEskimi('1.10.0', '1.2.0')).toBe(false);
    expect(versiyaEskimi(null, null)).toBe(false);
  });
  it('turns the policy form into the server value object (empty = inherit) and rejects bad input', () => {
    expect(siyosatShakldan({ yoqilgan: 'yoq', oflayn: 'meros', max_qurilma: '', lease_soat: '24', min_versiya: '' }, false))
      .toEqual({ qiymat: { yoqilgan: false, oflayn: null, max_qurilma: null, lease_soat: 24, min_versiya: null } });
    expect(siyosatShakldan({ yoqilgan: 'ha', oflayn: 'ha', max_qurilma: '0', lease_soat: '', min_versiya: '' }, false)).toHaveProperty('xato');
    expect(siyosatShakldan({ yoqilgan: 'ha', oflayn: 'ha', max_qurilma: '', lease_soat: '96', min_versiya: '' }, false)).toHaveProperty('xato');
    expect(siyosatShakldan({ yoqilgan: 'ha', oflayn: 'ha', max_qurilma: '', lease_soat: '', min_versiya: '1.2' }, false)).toHaveProperty('xato');
    expect(siyosatShakldan({ yoqilgan: 'ha', oflayn: 'ha', max_qurilma: '', lease_soat: '', min_versiya: '', yuklab_olish_url: 'javascript:alert(1)' }, true)).toHaveProperty('xato');
    const g = siyosatShakldan({ yoqilgan: 'ha', oflayn: 'ha', max_qurilma: '10', lease_soat: '72', min_versiya: '0.1.0', joriy_versiya: '0.2.0', yuklab_olish_url: 'https://example.invalid/s.exe', yangilanish_izoh: '' }, true);
    expect(g).toEqual({ qiymat: { yoqilgan: true, oflayn: true, max_qurilma: 10, lease_soat: 72, min_versiya: '0.1.0', joriy_versiya: '0.2.0', yuklab_olish_url: 'https://example.invalid/s.exe', yangilanish_izoh: null } });
    expect(Object.keys((siyosatShakldan(siyosatShaklga(undefined), false, false) as { qiymat: object }).qiymat)).not.toContain('max_qurilma');
    // Company form never sends installer fields (server would refuse them).
    expect(Object.keys((siyosatShakldan({ ...siyosatShaklga(undefined), joriy_versiya: '9.9.9' }, false) as { qiymat: object }).qiymat)).not.toContain('joriy_versiya');
  });
  it('round-trips a stored policy and validates the reason like the server', () => {
    expect(siyosatShaklga({ id: 1, kompaniya_id: 2, kompaniya_nom: 'B', manba: 'kompaniya', yoqilgan: false, max_qurilma: 3, lease_soat: null, oflayn: null,
      min_versiya: null, joriy_versiya: null, yuklab_olish_url: null, yangilanish_izoh: null, versiya: 1, yangilandi: '' })).toMatchObject({ yoqilgan: 'yoq', oflayn: 'meros', max_qurilma: '3', lease_soat: '' });
    expect(sababYaroqli('  ab ')).toBe(false);
    expect(sababYaroqli('abc')).toBe(true);
  });
});
