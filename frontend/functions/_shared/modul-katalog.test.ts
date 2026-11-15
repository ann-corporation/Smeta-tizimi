import { describe, expect, it } from 'vitest';
import { NATIVE_YOL, katalogQur, nomUch, type KatalogKirish } from './modul-katalog';
import { SAHIFALAR } from '../../src/lib/reestr/sahifa';
import { katalogNomlari } from '../../src/lib/reestr/katalog-nomlar';
import { LUGAT_RU } from '../../src/i18n/lugat';
import nomlar from './katalog-nom.json';

// Sintetik fikstura (haqiqiy ma'lumot yo'q).
const PRORAB = ['fakt.read', 'fakt.write', 'self.work.read', 'self.work.write', 'smeta.read', 'company.read', 'warehouse.write', 'object.read'];
const RAHBAR = ['company.read', 'control.company.read', 'financial.read', 'financial.write', 'f2.read', 'f2.approve', 'fakt.write', 'smeta.read', 'smeta.write', 'narx.write', 'document.write', 'project.read', 'project.write', 'object.write', 'f2.prepare'];
const baza = (o: Partial<KatalogKirish>): KatalogKirish => ({ superadmin: false, rol: 'boss', permissions: RAHBAR, modullarOff: [], kompaniyaId: 7, ...o });
const yollar = (k: ReturnType<typeof katalogQur>) => k.sahifalar.map((s) => s.yol);

describe('modul-katalog: ruxsat filtri (veb menyu bilan bir manba)', () => {
  it('prorab smeta studiyasi, moliya va platformani KO\'RMAYDI; fakt/obyekt/foto ko\'radi', () => {
    const k = katalogQur(baza({ rol: 'prorab', permissions: PRORAB }));
    const y = yollar(k);
    expect(y).toContain('/admin/fakt');
    expect(y).toContain('/admin/foto');
    expect(y).toContain('/admin/obyektlar');
    expect(y).not.toContain('/admin/smeta-studio');
    expect(y).not.toContain('/admin/moliya');
    expect(y).not.toContain('/admin/boshqaruv');
  });

  it('rahbar smeta studiyasi va moliyani ko\'radi, platforma sahifalarini esa yo\'q (faqat superadmin)', () => {
    const y = yollar(katalogQur(baza({})));
    expect(y).toContain('/admin/smeta-studio');
    expect(y).toContain('/admin/moliya');
    expect(y).not.toContain('/admin/boshqaruv');
    expect(y).not.toContain('/admin/system-control');
  });

  it('superadmin platforma sahifalarini ham ko\'radi', () => {
    const y = yollar(katalogQur(baza({ superadmin: true, rol: 'superadmin', permissions: [] })));
    expect(y).toContain('/admin/boshqaruv');
  });

  it('kompaniya moduli o\'chirilsa shu modul sahifalari katalogda yo\'q', () => {
    const on = yollar(katalogQur(baza({})));
    const off = yollar(katalogQur(baza({ modullarOff: ['module.moliya'] })));
    expect(on).toContain('/admin/moliya');
    expect(off).not.toContain('/admin/moliya');
    expect(off).toContain('/admin/smeta-studio');
  });

  it('ruxsatsiz (permissions bo\'sh) foydalanuvchi faqat hamma uchun ochiq sahifalarni oladi', () => {
    const k = katalogQur(baza({ rol: 'ishchi', permissions: [] }));
    const hamma = SAHIFALAR.filter((s) => s.ruxsat.length === 0 && !s.faqatSuperadmin && s.navGuruh !== 'platforma').map((s) => s.yol);
    for (const y of yollar(k)) expect(hamma).toContain(y);
  });

  it('har sahifa bir marta; guruh id lari guruhlar ro\'yxatida bor', () => {
    const k = katalogQur(baza({}));
    const ids = k.sahifalar.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const g = new Set(k.guruhlar.map((x) => x.id));
    for (const s of k.sahifalar) expect(g.has(s.guruh)).toBe(true);
  });
});

describe('modul-katalog: native moslash', () => {
  it('native faqat NATIVE_YOL jadvalidagi sahifalarda; boshqasi null (veb konteyner)', () => {
    const k = katalogQur(baza({}));
    for (const s of k.sahifalar) expect(s.native).toBe(NATIVE_YOL[s.yol] ?? null);
    expect(k.sahifalar.find((s) => s.yol === '/admin/fakt')?.native).toBe('fakt');
    expect(k.sahifalar.find((s) => s.yol === '/admin/smeta-studio')?.native).toBeNull();
    expect(k.sahifalar.find((s) => s.yol === '/admin/buxgalteriya')?.native).toBeNull();
  });

  it('NATIVE_YOL dagi har yo\'l reestrda bor (ko\'rinmas native bo\'lib qolmasin)', () => {
    const reestr = new Set(SAHIFALAR.map((s) => s.yol));
    for (const y of Object.keys(NATIVE_YOL)) expect(reestr.has(y)).toBe(true);
  });
});

describe('modul-katalog: foydalanuvchi tanlovi (modullarim)', () => {
  it('tanlov yo\'q — hammasi tanlangan; tanlov bor — faqat shu ilova yo\'llari, lekin sahifa ro\'yxatdan YO\'QOLMAYDI', () => {
    const hammasi = katalogQur(baza({}));
    expect(hammasi.sahifalar.every((s) => s.tanlangan)).toBe(true);
    const t = katalogQur(baza({ tanlangan: ['fakt'] }));
    expect(t.sahifalar.length).toBe(hammasi.sahifalar.length);
    expect(t.sahifalar.find((s) => s.yol === '/admin/fakt')?.tanlangan).toBe(true);
    expect(t.sahifalar.find((s) => s.yol === '/admin/moliya')?.tanlangan).toBe(false);
  });
});

describe('modul-katalog: tarjima (uz/ru/en)', () => {
  it('nomUch: tarjima bor — ru/en; yo\'q — o\'zbekcha', () => {
    const smeta = nomUch('Smeta studiyasi');
    expect(smeta.uz).toBe('Smeta studiyasi');
    expect(smeta.ru).toBe(LUGAT_RU['Smeta studiyasi']);
    expect(nomUch('Yo\'q nom 123').ru).toBe('Yo\'q nom 123');
  });

  it('katalog-nom.json eskirmagan: har lug\'atdagi nom jadvalda (generator: npx vite-node scripts/generate-katalog-nom.ts)', () => {
    for (const uz of katalogNomlari()) if (LUGAT_RU[uz]) expect((nomlar as Record<string, { ru?: string }>)[uz]?.ru).toBe(LUGAT_RU[uz]);
  });
});
