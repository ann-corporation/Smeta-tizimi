import { describe, expect, it } from 'vitest';
import { MATRITSA_ROLLAR, MATRITSA_RUXSATLAR, rolBor, rolSanoq, ruxsatGuruhi, ruxsatMatritsa, ruxsatTuri } from './kompaniya-korinish';

describe('ruxsat matritsasi', () => {
  it('har ruxsat aynan bir guruhda; platforma ruxsatlari va superadmin/admin kirmaydi', () => {
    const g = ruxsatMatritsa();
    expect(g.flatMap((x) => x.ruxsatlar).sort()).toEqual([...MATRITSA_RUXSATLAR].sort());
    expect(MATRITSA_RUXSATLAR.some((p) => p.startsWith('control.global'))).toBe(false);
    expect(MATRITSA_ROLLAR).not.toContain('superadmin');
    expect(MATRITSA_ROLLAR).not.toContain('admin');
    expect(g.map((x) => x.kod)).toEqual(['kompaniya', 'sozlama', 'loyiha', 'hujjat', 'moliya', 'f2', 'smeta']);
  });
  it('guruh va tur', () => {
    expect(ruxsatGuruhi('object.write')).toBe('loyiha');
    expect(ruxsatGuruhi('narx.read')).toBe('smeta');
    expect(ruxsatTuri('f2.read')).toBe('korish');
    expect(ruxsatTuri('f2.approve')).toBe('amal');
  });
  it('lavozim sanog‘i ROLE_PERMISSIONS dan', () => {
    expect(rolBor('boss', 'f2.approve')).toBe(true);
    expect(rolBor('kuzatuvchi', 'f2.approve')).toBe(false);
    const b = rolSanoq('boss');
    expect(b.korish + b.amal).toBe(b.jami);
    const k = rolSanoq('kuzatuvchi');
    expect(k.amal).toBe(0);
    expect(k.korish).toBeGreaterThan(0);
  });
});
