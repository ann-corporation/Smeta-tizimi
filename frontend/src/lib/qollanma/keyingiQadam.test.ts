import { describe, expect, it } from 'vitest';
import { aktlardanHolat, joriyOy, keyingiQadam, type ObyektHolati } from './keyingiQadam';

const toliq: ObyektHolati = { smetaBor: true, podvalBor: true, faktBor: true, f2JoriyOyBor: true, qoralamaSoni: 0, tasdiqlanganSoni: 1 };
const q = (h: Partial<ObyektHolati>) => keyingiQadam({ ...toliq, ...h }, 5);

describe('keyingiQadam', () => {
  it('ketma-ketlik: smeta → podval → fakt → F2 → tasdiqlash → portfel', () => {
    expect(q({ smetaBor: false })?.tur).toBe('smeta');
    expect(q({ podvalBor: false })?.tur).toBe('podval');
    expect(q({ faktBor: false })?.tur).toBe('fakt');
    expect(q({ f2JoriyOyBor: false })?.tur).toBe('f2');
    expect(q({ qoralamaSoni: 3 })?.tur).toBe('tasdiqlash');
    expect(q({})?.tur).toBe('portfel');
  });

  it('oldingi qadam ustun: smeta yo‘q bo‘lsa boshqa hech narsa so‘ralmaydi', () => {
    expect(q({ smetaBor: false, podvalBor: false, faktBor: false, f2JoriyOyBor: false, qoralamaSoni: 2 })?.tur).toBe('smeta');
    expect(q({ podvalBor: false, faktBor: false })?.tur).toBe('podval');
  });

  it('har taklif obyektni oldindan tanlab, o‘z kartasi bilan ochadi', () => {
    expect(q({ smetaBor: false })?.yol).toBe('/admin/holat/5?panel=smeta&qollanma=smeta-yuklash');
    expect(q({ podvalBor: false })?.yol).toBe('/admin/holat/5?panel=smeta&qollanma=podval');
    expect(q({ faktBor: false })?.yol).toBe('/admin/fakt?obyekt=5&qollanma=fakt');
    expect(q({ f2JoriyOyBor: false })?.yol).toBe('/admin/f2-tayyorlash?obyekt=5&qollanma=f2-tayyorlash');
    expect(q({ qoralamaSoni: 2 })).toMatchObject({ yol: '/admin/f2-tarix?obyekt=5&qollanma=f2-tarix', n: 2, karta: 'f2-tarix' });
    expect(q({})?.yol).toBe('/admin/f2-reestr?portfel=1&portfel_obyekt=5&qollanma=f2-portfel');
  });

  it('NULL = noma’lum: taxmin qilinmaydi; podval noma’lum bo‘lsa o‘tkazib yuboriladi', () => {
    expect(q({ smetaBor: null })).toBeNull();
    expect(q({ podvalBor: null })?.tur).toBe('portfel');
    expect(q({ podvalBor: null, faktBor: false })?.tur).toBe('fakt');
    expect(q({ faktBor: null })).toBeNull();
    expect(q({ f2JoriyOyBor: null })).toBeNull();
    expect(q({ qoralamaSoni: null })).toBeNull();
  });
});

describe('aktlardanHolat', () => {
  it('fakt, joriy oy F2, qoralama va tasdiqlanganlarni sanaydi; bekor qilingan hisobga olinmaydi', () => {
    const h = aktlardanHolat([
      { tur: 'fakt', oy: '2026-10-01', holat: 'qoralama' },
      { tur: 'f2', oy: '2026-10-01', holat: 'tasdiqlangan', lifecycle_status: 'approved' },
      { tur: 'f2', oy: '2026-11-01', holat: 'qoralama', lifecycle_status: 'draft' },
      { tur: 'f2', oy: '2026-11-01', holat: 'qoralama', lifecycle_status: 'rejected' },
      { tur: 'f2', oy: '2026-09-01', holat: 'bekor', lifecycle_status: 'cancelled' },
    ], '2026-11');
    expect(h).toEqual({ faktBor: true, f2JoriyOyBor: true, qoralamaSoni: 2, tasdiqlanganSoni: 1 });
  });

  it('faqat bekor qilingan F2 joriy oyda bo‘lsa — F2 yo‘q deb hisoblanadi', () => {
    const h = aktlardanHolat([{ tur: 'f2', oy: '2026-11-01', holat: 'bekor' }, { tur: 'fakt', oy: '2026-11-01', holat: 'qoralama' }], '2026-11');
    expect(h).toMatchObject({ faktBor: true, f2JoriyOyBor: false, qoralamaSoni: 0, tasdiqlanganSoni: 0 });
  });

  it('bo‘sh reestr — hech narsa yo‘q', () => {
    expect(aktlardanHolat([], '2026-11')).toEqual({ faktBor: false, f2JoriyOyBor: false, qoralamaSoni: 0, tasdiqlanganSoni: 0 });
  });

  it('joriyOy — YYYY-MM', () => {
    expect(joriyOy(new Date(2026, 10, 5))).toBe('2026-11');
    expect(joriyOy(new Date(2026, 0, 31))).toBe('2026-01');
  });
});
