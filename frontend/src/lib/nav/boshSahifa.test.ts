import { describe, expect, it } from 'vitest';
import { rolBoshSahifasi, ZAXIRA_BOSH_SAHIFA } from './boshSahifa';

describe('rolBoshSahifasi', () => {
  it('ish rollari SINOV qobig‘iga emas, production sahifaga tushadi', () => {
    for (const rol of ['pto', 'admin', 'superadmin', 'bugalter', 'prorab']) {
      expect(rolBoshSahifasi(rol)).toBe('/admin/obyektlar');
      expect(rolBoshSahifasi(rol)).not.toMatch(/\/test\//);
    }
  });
  it('boss/rahbar — redirect emas, rahbar paneli', () => {
    expect(rolBoshSahifasi('boss')).toBe('/admin/dashboard');
    expect(rolBoshSahifasi('rahbar')).toBe('/admin/dashboard');
  });
  it('yangi rollar o‘z ishiga tushadi', () => {
    expect(rolBoshSahifasi('buyurtmachi')).toBe('/admin/zakazchik');
    expect(rolBoshSahifasi('usta')).toBe('/admin/fakt');
    expect(rolBoshSahifasi('omborchi')).toBe('/admin/logistika');
  });
  it('noma‘lum yoki bo‘sh rol — Ish joylarim', () => {
    expect(rolBoshSahifasi('pudratchi')).toBe(ZAXIRA_BOSH_SAHIFA);
    expect(rolBoshSahifasi(undefined)).toBe(ZAXIRA_BOSH_SAHIFA);
    expect(rolBoshSahifasi('')).toBe(ZAXIRA_BOSH_SAHIFA);
  });
  it('ruxsat bosh sahifani ochmasa — Ish joylarim', () => {
    expect(rolBoshSahifasi('boss', ['company.read'])).toBe(ZAXIRA_BOSH_SAHIFA);
    expect(rolBoshSahifasi('pto', ['company.read', 'smeta.read'])).toBe('/admin/obyektlar');
    expect(rolBoshSahifasi('usta', ['company.read', 'fakt.read'])).toBe('/admin/fakt');
  });
});
