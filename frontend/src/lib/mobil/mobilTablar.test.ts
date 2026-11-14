import { describe, expect, it } from 'vitest';
import { mobilTablar, mobilTabFaol } from './mobilTablar';

const HAMMASI = new Set(['/admin/obyektlar', '/admin/fakt', '/admin/documents', '/admin/hujjat-aylanish', '/admin/bugun', '/admin/buxgalteriya', '/admin/hr', '/admin/nazorat', '/admin/zakazchik', '/admin/logistika']);
const ids = (rol: string, k: ReadonlySet<string> = HAMMASI) => mobilTablar(rol, k).map((x) => x.id);

describe('mobil pastki tablar (rolga mos)', () => {
  it('har rolda boshi Bosh sahifa, oxiri Jarvis va Menyu', () => {
    for (const rol of ['pto', 'usta', 'bugalter', 'kadr', 'inspektor', 'boss', 'buyurtmachi', '', 'nomalum-rol']) {
      const tablar = mobilTablar(rol, HAMMASI);
      expect(tablar[0].id).toBe('bosh');
      expect(tablar.slice(-2).map((x) => x.id)).toEqual(['jarvis', 'menyu']);
      expect(tablar.length).toBeLessThanOrEqual(5);
    }
  });

  it('rol bo\u2018yicha asosiy ish tabi', () => {
    expect(ids('pto')).toEqual(['bosh', '/admin/obyektlar', '/admin/fakt', 'jarvis', 'menyu']);
    expect(ids('bugalter')).toContain('/admin/buxgalteriya');
    expect(ids('kadr')).toContain('/admin/hr');
    expect(ids('inspektor')).toContain('/admin/nazorat');
    expect(ids('boss')).toContain('/admin/hujjat-aylanish');
    expect(ids('usta')).toEqual(['bosh', '/admin/bugun', '/admin/fakt', 'jarvis', 'menyu']);
  });

  it('ruxsati yo\u2018q (menyuda ko\u2018rinmaydigan) sahifa tabga chiqmaydi va zaxira tanlanadi', () => {
    const faqatHujjat = new Set(['/admin/obyektlar', '/admin/documents']);
    expect(ids('bugalter', faqatHujjat)).toEqual(['bosh', '/admin/obyektlar', '/admin/documents', 'jarvis', 'menyu']);
    expect(ids('pto', new Set())).toEqual(['bosh', 'jarvis', 'menyu']);
  });

  it('bir sahifa ikki tabda takrorlanmaydi', () => {
    const y = ids('usta', new Set(['/admin/fakt', '/admin/obyektlar']));
    expect(new Set(y).size).toBe(y.length);
  });

  it('faol tab: Bosh sahifa faqat bosh yo\u2018llarda, obyekt tabi holat sahifasida ham', () => {
    const t = mobilTablar('pto', HAMMASI);
    expect(mobilTabFaol(t[0], '/admin/bugun')).toBe(true);
    expect(mobilTabFaol(t[0], '/admin/fakt')).toBe(false);
    expect(mobilTabFaol(t[1], '/admin/holat/12')).toBe(true);
    expect(mobilTabFaol(t[2], '/admin/fakt/x')).toBe(true);
    expect(mobilTabFaol(t[3], '/admin/fakt')).toBe(false);
  });
});