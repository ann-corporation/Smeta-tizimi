import { describe, expect, it } from 'vitest';
import { LUGAT_EN, LUGAT_RU } from '../../i18n/lugat';
import { kartaKalit, kartaMatnlari, kartaTop, keyingiYol, QOLLANMA_REESTR, urlObyekti } from './reestr';
import { keyingiQadam } from './keyingiQadam';

describe('qollanma reestri', () => {
  it('kalitlar takrorlanmaydi, har kartada foyda va aynan 3 qadam bor', () => {
    const kalitlar = QOLLANMA_REESTR.map((k) => k.kalit);
    expect(new Set(kalitlar).size).toBe(kalitlar.length);
    for (const k of QOLLANMA_REESTR) {
      expect(k.nimaBeradi.trim().length, k.kalit).toBeGreaterThan(10);
      expect(k.qadamlar).toHaveLength(3);
      expect(k.yollar.length, k.kalit).toBeGreaterThan(0);
    }
  });

  it('asosiy PTO oqimi kartalari bor', () => {
    for (const k of ['obyektlar', 'obyekt', 'smeta-yuklash', 'smeta-studio', 'podval', 'fakt', 'f2-tayyorlash', 'f2-tarix', 'f2-reestr', 'f2-portfel', 'nakopitelniy', 'hujjat-dizayn', 'sozlamalar'])
      expect(kartaKalit(k), k).not.toBeNull();
  });

  it('har karta matnining ru va en tarjimasi bor', () => {
    const yoq = QOLLANMA_REESTR.flatMap(kartaMatnlari).filter((m) => !(m in LUGAT_RU) || !(m in LUGAT_EN));
    expect(yoq).toEqual([]);
  });

  it('yo‘l bo‘yicha karta topiladi; aniqroq (parametrli) karta ustun; kartasiz sahifa — null', () => {
    expect(kartaTop('/admin/obyektlar')?.kalit).toBe('obyektlar');
    expect(kartaTop('/admin/holat/12')?.kalit).toBe('obyekt');
    expect(kartaTop('/admin/holat/12', '?panel=smeta')?.kalit).toBe('smeta-yuklash');
    expect(kartaTop('/admin/f2-reestr')?.kalit).toBe('f2-reestr');
    expect(kartaTop('/admin/f2-reestr', '?portfel=1&shartnoma=3')?.kalit).toBe('f2-portfel');
    expect(kartaTop('/admin/tizim-sozlama')?.kalit).toBe('sozlamalar');
    expect(kartaTop('/admin/faktura')).toBeNull();          // «/admin/fakt» prefiksi emas
    expect(kartaTop('/admin/ombor')).toBeNull();
  });

  it('?qollanma= aniq kartani ochadi; noma’lum kalit e’tiborsiz', () => {
    expect(kartaTop('/admin/holat/5', '?panel=smeta&qollanma=podval')?.kalit).toBe('podval');
    expect(kartaTop('/admin/fakt', '?qollanma=yoq')?.kalit).toBe('fakt');
  });

  it('obyekt URL dan olinadi va keyingi havolaga qo‘yiladi', () => {
    expect(urlObyekti('/admin/holat/42')).toBe(42);
    expect(urlObyekti('/admin/fakt', '?obyekt=7')).toBe(7);
    expect(urlObyekti('/admin/f2-reestr', '?portfel=1&portfel_obyekt=9')).toBe(9);
    expect(urlObyekti('/admin/fakt', '?obyekt=abc')).toBeNull();
    expect(keyingiYol('/admin/f2-tayyorlash?obyekt={obyekt}', 7)).toBe('/admin/f2-tayyorlash?obyekt=7');
    expect(keyingiYol('/admin/f2-tayyorlash?obyekt={obyekt}', null)).toBe('/admin/f2-tayyorlash');
    expect(keyingiYol('/admin/f2-reestr?portfel=1&portfel_obyekt={obyekt}', null)).toBe('/admin/f2-reestr?portfel=1');
  });

  it('«Keyingi qadam» har taklifi mavjud kartaga va o‘sha kartaning sahifasiga olib boradi', () => {
    const holatlar = [
      { smetaBor: false, podvalBor: null, faktBor: null, f2JoriyOyBor: null, qoralamaSoni: null, tasdiqlanganSoni: null },
      { smetaBor: true, podvalBor: false, faktBor: false, f2JoriyOyBor: false, qoralamaSoni: 0, tasdiqlanganSoni: 0 },
      { smetaBor: true, podvalBor: true, faktBor: false, f2JoriyOyBor: false, qoralamaSoni: 0, tasdiqlanganSoni: 0 },
      { smetaBor: true, podvalBor: true, faktBor: true, f2JoriyOyBor: false, qoralamaSoni: 0, tasdiqlanganSoni: 0 },
      { smetaBor: true, podvalBor: true, faktBor: true, f2JoriyOyBor: true, qoralamaSoni: 2, tasdiqlanganSoni: 0 },
      { smetaBor: true, podvalBor: true, faktBor: true, f2JoriyOyBor: true, qoralamaSoni: 0, tasdiqlanganSoni: 3 },
    ];
    for (const h of holatlar) {
      const q = keyingiQadam(h, 11)!;
      const [yol, qs] = q.yol.split('?');
      expect(kartaTop(yol, '?' + qs)?.kalit).toBe(q.karta);
      expect(urlObyekti(yol, '?' + qs)).toBe(11);
      for (const m of [q.matn, q.izoh]) expect(m in LUGAT_RU && m in LUGAT_EN, m).toBe(true);
    }
  });
});
