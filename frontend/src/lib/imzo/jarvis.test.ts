import { afterEach, describe, expect, it } from 'vitest';
import { NAV_SAHIFALAR } from '../nav/navReestr';
import { niyatAniqla, type NiyatKontekst } from '../yordamchi/niyat';
import { joriyHujjatOrnat } from './joriy-hujjat';

const HAMMA = NAV_SAHIFALAR.map((s) => ({ yol: s.yol, nom: s.nom, guruh: s.guruh.nom }));
const ctx = (): NiyatKontekst => ({ sahifalar: HAMMA, obyektlar: [], bugun: new Date(2026, 11, 18) });
afterEach(() => joriyHujjatOrnat(null));

describe('Jarvis: imzo', () => {
  it('«imzo qo\'y» joriy hujjat bilan imzolash sahifasini shu hujjat uchun ochadi', () => {
    joriyHujjatOrnat(42);
    for (const matn of ['imzo qo‘y', 'hujjatni imzola', 'подпиши', 'sign this document']) {
      const n = niyatAniqla(matn, ctx());
      expect(n.tur, matn).toBe('navigatsiya');
      if (n.tur === 'navigatsiya') expect(n.sahifa.url, matn).toBe('/admin/imzo?bolim=imzolash&hujjat=42&imzola=1');
    }
  });

  it('joriy hujjat yo\'q bo\'lsa - oddiy sahifa ochish (hujjat tanlanadi); «imzoni tekshir»/«mening imzolarim» sahifani ochadi', () => {
    for (const matn of ['imzo qo‘y', 'imzoni tekshir', 'mening imzolarim']) {
      const n = niyatAniqla(matn, ctx());
      expect(n.tur, matn).toBe('navigatsiya');
      if (n.tur === 'navigatsiya') { expect(n.sahifa.yol, matn).toBe('/admin/imzo'); expect(n.sahifa.url ?? '', matn).not.toContain('hujjat='); }
    }
  });
});
