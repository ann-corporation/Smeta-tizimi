import { describe, expect, it } from 'vitest';
import { AMALLAR, amalKorishQur, resursNishoni, tugunAmallari, tugunNishoni, type AmalKontekst, type AmalNishon } from './mindmap-amallar';
import { ROLE_PERMISSIONS } from './company-authorization/effective-authorization';
import { daraxtQur } from './mindmap-korinish';
import type { MindmapGraf, MindmapTugun } from '../api/t2-mindmap';

const kontekst = (o: Partial<AmalKontekst> = {}): AmalKontekst => ({
  superadmin: false, rol: 'boss', permissions: [...ROLE_PERMISSIONS.boss], boshqaKompaniya: false, pul: true, masul: true, ...o,
});
const rolKontekst = (rol: keyof typeof ROLE_PERMISSIONS, o: Partial<AmalKontekst> = {}) => kontekst({ rol, permissions: [...ROLE_PERMISSIONS[rol]], masul: false, ...o });

const obyekt: AmalNishon = { tur: 'obyekt', id: 'obyekt:5', entityId: 5, nom: 'Sinov obyekti', obyektId: 5, masulBlok: true };
const odam: AmalNishon = { tur: 'odam', id: 'foydalanuvchi:12', entityId: 12, nom: 'Sinov odam', foydalanuvchiId: 12 };
const kalitlar = (n: AmalNishon, k: AmalKontekst) => tugunAmallari(n, k).map((a) => a.kalit);
const amal = (n: AmalNishon, k: AmalKontekst, kalit: string) => tugunAmallari(n, k).find((a) => a.kalit === kalit);

describe('mindmap amallar reestri', () => {
  it('reestr: kalitlar yagona, har amalning bajarilish usuli to‘liq', () => {
    expect(new Set(AMALLAR.map((a) => a.kalit)).size).toBe(AMALLAR.length);
    for (const a of AMALLAR) {
      if (a.bajar === 'yol') expect(a.yol, a.kalit).toBeTypeOf('function');
      if (a.bajar === 'modal') expect(a.modal, a.kalit).toBeTruthy();
      if (a.bajar === 'panel') expect(a.panel, a.kalit).toBeTruthy();
    }
  });

  it('obyekt: amallar va kanonik manzillar (boss — hammasi ochiq)', () => {
    const r = tugunAmallari(obyekt, kontekst());
    expect(r.map((a) => a.kalit)).toEqual([
      'obyekt.holat', 'obyekt.fakt', 'obyekt.f2', 'obyekt.f2-tarix', 'obyekt.nakopitelniy', 'obyekt.smeta-yuklash',
      'obyekt.zayavkalar', 'obyekt.zayavka-yarat', 'obyekt.masul', 'obyekt.vazifa',
    ]);
    expect(r.every((a) => a.mumkin)).toBe(true);
    const yol = Object.fromEntries(r.map((a) => [a.kalit, a.yol]));
    expect(yol['obyekt.holat']).toBe('/admin/holat/5');
    expect(yol['obyekt.fakt']).toBe('/admin/fakt?obyekt=5');
    expect(yol['obyekt.f2']).toBe('/admin/f2-tayyorlash?obyekt=5');
    expect(yol['obyekt.f2-tarix']).toBe('/admin/f2-tarix?obyekt=5');
    expect(yol['obyekt.nakopitelniy']).toBe('/admin/nakopitelniy?obyekt=5');
    expect(yol['obyekt.smeta-yuklash']).toBe('/admin/holat/5?panel=smeta');
    expect(yol['obyekt.zayavka-yarat']).toBe('/admin/zayavka?obyekt=5&yarat=1');
    expect(amal(obyekt, kontekst(), 'obyekt.masul')).toMatchObject({ bajar: 'panel', panel: 'masul', yol: null });
    expect(amal(obyekt, kontekst(), 'obyekt.vazifa')).toMatchObject({ bajar: 'modal', modal: 'vazifa' });
  });

  it('pul=false: pul bilan bog‘liq amallar YASHIRILADI (yopiq emas — umuman yo‘q)', () => {
    expect(kalitlar(obyekt, kontekst({ pul: false }))).not.toContain('obyekt.nakopitelniy');
    const sh: AmalNishon = { tur: 'shartnoma', id: 'shartnoma:3', entityId: 3, nom: 'Sinov shartnoma', obyektId: 5 };
    expect(kalitlar(sh, kontekst())).toEqual(['shartnoma.ochish', 'shartnoma.sverka', 'shartnoma.tolov']);
    expect(kalitlar(sh, kontekst({ pul: false }))).toEqual(['shartnoma.ochish']);
  });

  it('ruxsat: rahbar sahifalarni ko‘radi, lekin mas‘ul/topshiriq yopiq — sabab bilan', () => {
    const k = rolKontekst('rahbar');
    expect(amal(obyekt, k, 'obyekt.holat')!.mumkin).toBe(true);
    const m = amal(obyekt, k, 'obyekt.masul')!;
    expect(m.mumkin).toBe(false);
    expect(m.sabab).toContain('A’zolarni boshqarish');
    const v = amal(obyekt, k, 'obyekt.vazifa')!;
    expect(v.mumkin).toBe(false);
    expect(v.sabab).toContain('fakt.write');
    // rahbarda f2.prepare yo‘q — F2 tayyorlash sahifasi yopiq.
    expect(amal(obyekt, k, 'obyekt.f2')).toMatchObject({ mumkin: false, sabab: 'Bu sahifaga ruxsatingiz yo‘q' });
  });

  it('ruxsat: buxgalter F2 tayyorlay olmaydi (rol qoidasi), prorab — topshiriq bera oladi', () => {
    expect(amal(obyekt, rolKontekst('bugalter'), 'obyekt.f2')!.mumkin).toBe(false);
    expect(amal(obyekt, rolKontekst('prorab'), 'obyekt.f2')!.mumkin).toBe(true);
    expect(amal(obyekt, rolKontekst('prorab'), 'obyekt.vazifa')!.mumkin).toBe(true);
  });

  it('eski javob (permissions=null): rolning frontend ko‘zgusi ishlatiladi', () => {
    const k = kontekst({ rol: 'kuzatuvchi', permissions: null, masul: false });
    expect(amal(obyekt, k, 'obyekt.holat')!.mumkin).toBe(true);
    expect(amal(obyekt, k, 'obyekt.fakt')!.mumkin).toBe(false);
    expect(amal(obyekt, k, 'obyekt.vazifa')!.mumkin).toBe(false);
  });

  it('boshqa kompaniya xaritasi: o‘tish va yozish yopiq, panel amali ochiq', () => {
    const k = kontekst({ boshqaKompaniya: true });
    const loyiha: AmalNishon = { tur: 'loyiha', id: 'loyiha:7', entityId: 7, nom: 'Sinov loyiha', masulBlok: false };
    const r = tugunAmallari(loyiha, k);
    expect(r.find((a) => a.kalit === 'loyiha.obyektlar')!.mumkin).toBe(true);
    expect(r.filter((a) => a.bajar !== 'panel').every((a) => !a.mumkin && a.sabab === 'Faqat ko‘rish: bu xarita joriy kompaniyangiz emas.')).toBe(true);
  });

  it('odam: mas‘ul qilish, topshiriq, obyektlari, rol; id yo‘q bo‘lsa modal amallar chiqmaydi', () => {
    expect(kalitlar(odam, kontekst())).toEqual(['odam.masul', 'odam.vazifa', 'odam.obyektlar', 'odam.rol']);
    expect(amal(odam, kontekst(), 'odam.rol')!.yol).toBe('/admin/kompaniya?tab=azolar');
    expect(kalitlar({ ...odam, foydalanuvchiId: null }, kontekst())).toEqual(['odam.obyektlar', 'odam.rol']);
  });

  it('mas‘ullar bloki yo‘q (eski RPC) — «Mas‘ul biriktirish» chiqmaydi', () => {
    expect(kalitlar({ ...obyekt, masulBlok: false }, kontekst())).not.toContain('obyekt.masul');
  });
});

describe('nishon quruvchilar', () => {
  const g: MindmapGraf = {
    tugunlar: [
      { id: 'kompaniya:1', tur: 'kompaniya', nom: 'K', meta: null, x: null, y: null },
      { id: 'obyekt:5', tur: 'obyekt', nom: 'Loyihasiz obyekt', meta: { versiya: 1, belgi: [] }, x: null, y: null },
      { id: 'foydalanuvchi:12', tur: 'foydalanuvchi', nom: 'Sinov odam', meta: { rol: 'pto' }, x: null, y: null },
    ],
    bogichlar: [],
  };
  it('xarita tugunlari: obyekt, odam; «Loyihasiz obyektlar» guruhi — amalsiz', () => {
    const d = daraxtQur(g);
    expect(tugunNishoni(d.tugunlar.get('obyekt:5')!, true)).toMatchObject({ tur: 'obyekt', entityId: 5, obyektId: 5, masulBlok: true });
    expect(tugunNishoni(d.tugunlar.get('foydalanuvchi:12')!, true)).toMatchObject({ tur: 'odam', foydalanuvchiId: 12 });
    const guruh = [...d.tugunlar.values()].find((x) => x.tur === 'guruh');
    expect(guruh).toBeTruthy();
    expect(tugunNishoni(guruh!, true)).toBeNull();
  });
  it('resurs: shartnomada yagona obyekt — sverka shu obyektga; bir nechta — taxmin qilinmaydi', () => {
    const sh = (idlar: number[]): MindmapTugun => ({ id: 'shartnoma:3', tur: 'shartnoma', nom: 'S', meta: { obyekt_idlar: idlar }, x: null, y: null });
    expect(amal(resursNishoni(sh([9]))!, kontekst(), 'shartnoma.sverka')!.yol).toBe('/admin/nakopitelniy?obyekt=9');
    expect(kalitlar(resursNishoni(sh([9, 10]))!, kontekst())).not.toContain('shartnoma.sverka');
    expect(amal(resursNishoni(sh([9, 10]), 10)!, kontekst(), 'shartnoma.sverka')!.yol).toBe('/admin/nakopitelniy?obyekt=10');
    expect(resursNishoni({ id: 'loyiha:1', tur: 'loyiha', nom: 'L', meta: null, x: null, y: null })).toBeNull();
  });
  it('amalKorishQur: kompaniya tanlanmagan yoki boshqa kompaniya — boshqaKompaniya', () => {
    expect(amalKorishQur({ joriy: null }).boshqaKompaniya).toBe(true);
    expect(amalKorishQur({ joriy: { id: 1, rol: 'pto', permissions: ['smeta.read'] }, kompaniyaId: 2 }).boshqaKompaniya).toBe(true);
    expect(amalKorishQur({ joriy: { id: 1, rol: 'pto', permissions: ['smeta.read'] }, kompaniyaId: 1 })).toEqual({ superadmin: false, rol: 'pto', permissions: ['smeta.read'], boshqaKompaniya: false });
  });
});
