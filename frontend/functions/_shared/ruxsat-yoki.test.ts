import { describe, expect, it } from 'vitest';
import { ruxsatBormi } from './role-authority';
import { writeCommandPermission } from './write-command-policy';

describe('ruxsat «a|b» (naryad bajarildi)', () => {
  it('bajarildi: self.work.write YOKI smeta.write; boshqa amal — smeta.write', () => {
    expect(writeCommandPermission('naryad_yoz_v1', { naryad_amal: 'bajarildi' })).toBe('self.work.write|smeta.write');
    expect(writeCommandPermission('naryad_yoz_v1', { naryad_amal: 'qabul' })).toBe('smeta.write');
    const p = 'self.work.write|smeta.write';
    expect(ruxsatBormi(['self.work.write'], p)).toBe(true);
    expect(ruxsatBormi(['smeta.write'], p)).toBe(true);
    expect(ruxsatBormi(['fakt.read'], p)).toBe(false);
    expect(ruxsatBormi(undefined, p)).toBe(false);
    expect(ruxsatBormi(['smeta.write'], 'smeta.write')).toBe(true);
  });
});
