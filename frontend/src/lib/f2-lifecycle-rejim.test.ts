import { describe, expect, it } from 'vitest';
import { f2HolatYorligi, f2KeyingiQadam, f2LifecycleError, f2QadamTugmasi, f2TasdiqRejimi } from './f2-lifecycle-workflow';

/* Audit 2026-10-21 ARC-02, egasi ADR-2: shaxsiy — bir bosishda yakunlash (kompaniya tasdig'i emas);
   korporativ — har bosqich alohida, tayyorlovchi ≠ tekshiruvchi ≠ tasdiqlovchi bazada. */
describe('F2 tasdiqlash rejimlari', () => {
  it('rejim faqat aniq «korporativ» bo‘lsa korporativ; qolgani — shaxsiy', () => {
    expect(f2TasdiqRejimi('korporativ')).toBe('korporativ');
    expect(f2TasdiqRejimi(null)).toBe('shaxsiy');
    expect(f2TasdiqRejimi('boshqa')).toBe('shaxsiy');
  });
  it('korporativ: har bosish faqat keyingi BITTA bosqich', () => {
    expect(f2KeyingiQadam('draft')).toBe('submitted');
    expect(f2KeyingiQadam('rejected')).toBe('submitted');
    expect(f2KeyingiQadam('submitted')).toBe('checked');
    expect(f2KeyingiQadam('checked')).toBe('approved');
    expect(f2KeyingiQadam('approved')).toBeNull();
    expect(f2QadamTugmasi('korporativ', 'draft')).toBe('Tekshiruvga yuborish');
    expect(f2QadamTugmasi('korporativ', 'submitted')).toBe('Tekshirildi');
    expect(f2QadamTugmasi('korporativ', 'checked')).toBe('Tasdiqlash');
    expect(f2QadamTugmasi('korporativ', 'approved')).toBeNull();
  });
  it('shaxsiy: bitta «Yakunlash (shaxsiy)» va natija «Tasdiqlangan» deb ko‘rsatilmaydi', () => {
    expect(f2QadamTugmasi('shaxsiy', 'draft')).toBe('Yakunlash (shaxsiy)');
    expect(f2QadamTugmasi('shaxsiy', 'approved')).toBeNull();
    expect(f2HolatYorligi('approved', 'shaxsiy')).toBe('Yakunlangan (shaxsiy)');
    expect(f2HolatYorligi('approved', 'korporativ')).toBe('Tasdiqlangan');
  });
  it('SoD rad etish kodlari tushunarli xabarga aylanadi', () => {
    expect(f2LifecycleError('SOD_TEKSHIRUVCHI_YUBORUVCHI')).toContain('boshqa xodim');
    expect(f2LifecycleError('SOD_TASDIQLOVCHI_TAKRORLANDI')).toContain('uchinchi xodim');
  });
});
