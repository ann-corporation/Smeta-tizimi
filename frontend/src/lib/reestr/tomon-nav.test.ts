import { describe, expect, it } from 'vitest';
import { SAHIFALAR, NAV_GURUH_META } from './sahifa';
import { NAV_GURUHLAR, faqatSuperadminYolmi } from '../nav/navReestr';
import { menyuQur, type NavKontekst } from '../nav/navFiltr';

const odatiy = { rol: 'boss', superadmin: false, modullar: null, tizimXaritasi: false } as unknown as NavKontekst;
const yollar = (k: NavKontekst) => menyuQur(k).flatMap((g) => g.bandlar.flatMap((b) => [b.yol, ...(b.tablar ?? []).map((t) => t.yol)]));

describe('T7/T5: texnik platforma sahifalari oddiy foydalanuvchi menyusida yo‘q (reestrdan)', () => {
  const TEXNIK = ['/admin/fayl-boglash', '/admin/tizim-xaritasi', '/admin/boshqaruv'];
  it('reestrda uchalasi ham `faqatSuperadmin: true`', () => {
    for (const y of TEXNIK) expect(SAHIFALAR.find((s) => s.yol === y)?.faqatSuperadmin, y).toBe(true);
  });
  it('kompaniya bossi/admini menyusida yo‘q; superadmin (va tizim xaritasi ruxsati bilan) ko‘radi', () => {
    for (const rol of ['boss', 'admin', 'pto']) for (const y of TEXNIK) expect(yollar({ ...odatiy, rol }), `${rol} ${y}`).not.toContain(y);
    const sa = yollar({ ...odatiy, rol: 'superadmin', superadmin: true, tizimXaritasi: true });
    for (const y of TEXNIK) expect(sa, y).toContain(y);
  });
  it('tizim xaritasi marshruti umumiy qoidadan istisno (ruxsat berilgan odam ochadi), qolgan ikkitasi — yopiq', () => {
    expect(faqatSuperadminYolmi('/admin/tizim-xaritasi')).toBe(false);
    expect(faqatSuperadminYolmi('/admin/fayl-boglash')).toBe(true);
    expect(faqatSuperadminYolmi('/admin/boshqaruv')).toBe(true);
  });
});

describe('T7: bir xil nomli band/sahifa yo‘q', () => {
  it('«Hujjatlar» guruhida band nomlari takrorlanmaydi; «Kiruvchi (tomonlar)» faqat buyurtmachi tomoni sahifalarida', () => {
    const g = NAV_GURUH_META.find((x) => x.id === 'hujjat')!;
    const nomlar = g.bandlar.map((b) => b.nom);
    expect(new Set(nomlar).size).toBe(nomlar.length);
    const kiruvchi = SAHIFALAR.filter((s) => s.navBand === 'Kiruvchi (tomonlar)').map((s) => s.kalit).sort();
    expect(kiruvchi).toEqual(['laboratoriya', 'murojaatlar', 'taqdimlar', 'zakazchik']);
    expect(SAHIFALAR.find((s) => s.kalit === 'hujjat-aylanish')?.navBand).toBe('Hujjat aylanishi');
    expect(SAHIFALAR.filter((s) => s.navBand === 'Subpudrat').map((s) => s.kalit).sort()).toEqual(['subpudrat', 'subpudratchi']);
  });
  it('nav daraxtida band nomlari guruh ichida takrorlanmaydi', () => {
    for (const g of NAV_GURUHLAR) { const n = g.bandlar.map((b) => b.nom); expect(new Set(n).size, g.id).toBe(n.length); }
  });
});
