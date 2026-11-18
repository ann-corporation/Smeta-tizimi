import { describe, expect, it } from 'vitest';
import { aloqaTomoni, ishStoliQur, kabinetlarQur, tomonAniqla, TOMONLAR } from './ish-stoli';

// Sintetik fikstura (haqiqiy ma'lumot yo'q): kompaniya 1 = tashkilot, 2 = boshqa tashkilot, 3 = shaxsiy ish joyi.
const PRORAB = ['fakt.read', 'fakt.write', 'self.work.read', 'self.work.write', 'smeta.read', 'company.read', 'warehouse.write', 'object.read'];
const RAHBAR = ['company.read', 'control.company.read', 'financial.read', 'financial.write', 'f2.read', 'f2.approve', 'fakt.write', 'smeta.read', 'document.write'];
const TEXNADZOR = ['company.read', 'quality.read', 'quality.inspect', 'quality.decide', 'f2.read', 'smeta.read'];
const ids = (r: ReturnType<typeof ishStoliQur>) => r.amallar.map((a) => a.id);

describe('ish-stoli: tomon aniqlash', () => {
  it('a\'zolik roli -> tomon', () => {
    expect(tomonAniqla('boss')).toBe('rahbar');
    expect(tomonAniqla('usta')).toBe('prorab');
    expect(tomonAniqla('bugalter')).toBe('buxgalter');
    expect(tomonAniqla('inspektor')).toBe('texnadzor');
    expect(tomonAniqla('pudratchi')).toBe('subpudratchi');
    expect(tomonAniqla('yangi_rol', ['f2.prepare'])).toBe('pto');
    expect(tomonAniqla(undefined, [])).toBe('ishchi');
  });
  it('aloqa roli faqat subpudratchi / buyurtmachi / ta\'minotchi kabinetini ochadi', () => {
    expect(aloqaTomoni('subpudratchi')).toBe('subpudratchi');
    expect(aloqaTomoni('zakazchik')).toBe('texnadzor');
    expect(aloqaTomoni('pudratchi')).toBeNull();
  });
});

describe('ish-stoli: kabinetlar (munosabat, kompaniya turi emas)', () => {
  it('bir kompaniya — bir necha kabinet: a\'zolik + faol aloqa; takror yo\'q; nofaol aloqa kabinet ochmaydi', () => {
    const c = kabinetlarQur({
      ishJoylari: [{ kompaniya_id: 1, nom: 'Sinov MChJ', turi: 'tashkilot', rol: 'boss' }],
      aloqalar: { 1: [{ holat: 'faol', men_rol: 'subpudratchi' }, { holat: 'faol', men_rol: 'zakazchik' }, { holat: 'yopilgan', men_rol: 'taminotchi' }, { holat: 'faol', men_rol: 'subpudratchi' }] },
    });
    expect(c.map((x) => x.id)).toEqual(['1:rahbar', '1:subpudratchi', '1:texnadzor']);
    expect(c.map((x) => x.manba)).toEqual(['azolik', 'aloqa', 'aloqa']);
  });
  it('kompaniyasiz foydalanuvchi — shaxsiy kabinet (to\'liq ishlaydi)', () => {
    const r = ishStoliQur({ ishJoylari: [] });
    expect(r.joriy).toBe('0:ishchi');
    expect(r.kompaniya_id).toBeNull();
    expect(ids(r)).toEqual(['taklif_qoshil']);
    const s = ishStoliQur({ ishJoylari: [{ kompaniya_id: 3, nom: 'Shaxsiy', turi: 'shaxsiy', rol: 'boss' }], ruxsatlar: { 3: ['company.read', 'smeta.read'] } });
    expect(s.kabinetlar[0].manba).toBe('shaxsiy');
    expect(ids(s)).toContain('jarvis');
    expect(r.birlamchi_amal).toBe('taklif_qoshil');
  });
  it('tanlov: aniq kabinet > kompaniya_id > birinchisi', () => {
    const k = { ishJoylari: [{ kompaniya_id: 1, nom: 'A', turi: 'tashkilot', rol: 'prorab' }, { kompaniya_id: 2, nom: 'B', turi: 'tashkilot', rol: 'boss' }], ruxsatlar: { 1: PRORAB, 2: RAHBAR } };
    expect(ishStoliQur(k).joriy).toBe('1:prorab');
    expect(ishStoliQur({ ...k, kompaniyaId: 2 }).joriy).toBe('2:rahbar');
    expect(ishStoliQur({ ...k, kabinet: '1:prorab', kompaniyaId: 2 }).joriy).toBe('1:prorab');
    expect(ishStoliQur({ ...k, kabinet: 'yoq:yoq' }).joriy).toBe('1:prorab');
  });
});

describe('ish-stoli: rol fikstura', () => {
  it('prorab: dala rejimi, katta tugmalar, birlamchi = fakt; ruxsatsiz amal yo\'q', () => {
    const r = ishStoliQur({ ishJoylari: [{ kompaniya_id: 1, nom: 'A', turi: 'tashkilot', rol: 'prorab' }], ruxsatlar: { 1: PRORAB } });
    expect(r.tomon).toBe('prorab'); expect(r.rejim).toBe('dala');
    expect(r.dala).toEqual({ katta_tugma: true, oflayn: true, ovoz: true, foto: true });
    expect(r.birlamchi_amal).toBe('fakt_yoz');
    expect(ids(r)).toEqual(expect.arrayContaining(['fakt_yoz', 'foto_dalil', 'material_sorov', 'ombor_chiqim']));
    expect(ids(r)).not.toContain('moliya');
    expect(ids(r)).not.toContain('f2_tayyorlash');
    const dala = r.bolimlar.find((b) => b.id === 'dala')!;
    expect(dala.katta).toBe(true);
    expect(r.bolimlar.find((b) => b.id === 'bugun')?.guruh).toBe('joy');
  });
  it('rahbar: standart rejim, kpi + tasdiq navbati, birlamchi = tasdiqlash', () => {
    const r = ishStoliQur({ ishJoylari: [{ kompaniya_id: 1, nom: 'A', turi: 'tashkilot', rol: 'boss' }], ruxsatlar: { 1: RAHBAR } });
    expect(r.rejim).toBe('standart'); expect(r.dala).toBeNull();
    expect(r.bolimlar[0]).toMatchObject({ tur: 'kpi', manba: 'moliya.xulosa' });
    expect(r.birlamchi_amal).toBe('tasdiqlash');
    expect(ids(r)).toContain('hujjat_yarat');
  });
  it('texnadzor (buyurtmachi): yozish amallari yo\'q, tasdiq va nazorat bor', () => {
    const r = ishStoliQur({ ishJoylari: [{ kompaniya_id: 1, nom: 'A', turi: 'tashkilot', rol: 'inspektor' }], ruxsatlar: { 1: TEXNADZOR } });
    expect(r.tomon).toBe('texnadzor');
    expect(ids(r)).toEqual(expect.arrayContaining(['tasdiqlash', 'nazorat']));
    expect(ids(r)).not.toContain('fakt_yoz');
    expect(ids(r)).not.toContain('hujjat_yarat');
  });
  it('modul o\'chirilgan bo\'lsa shu modulga bog\'liq amal chiqmaydi', () => {
    const r = ishStoliQur({ ishJoylari: [{ kompaniya_id: 1, nom: 'A', turi: 'tashkilot', rol: 'omborchi' }], ruxsatlar: { 1: ['warehouse.receive', 'warehouse.write', 'company.read', 'self.work.write', 'fakt.write'] }, modullarOff: { 1: ['module.logistika'] } });
    expect(ids(r)).not.toContain('ombor_kirim');
    expect(ids(r)).toContain('material_sorov');
  });
  it('ruxsat snapshoti yo\'q (eski DB javobi): kamida ruxsat talab qilmaydigan amallar, hech narsa oshib ketmaydi', () => {
    const r = ishStoliQur({ ishJoylari: [{ kompaniya_id: 1, nom: 'A', turi: 'tashkilot', rol: 'boss' }] });
    expect(ids(r)).toEqual([]);
    expect(r.bolimlar.every((b) => b.tur === 'matn')).toBe(true);
  });
  it('superadmin hamma amalni ko\'radi (rol bo\'yicha bo\'limlar ichida)', () => {
    const r = ishStoliQur({ ishJoylari: [{ kompaniya_id: 1, nom: 'A', turi: 'tashkilot', rol: 'boss' }], superadmin: true });
    expect(ids(r)).toEqual(expect.arrayContaining(['tasdiqlash', 'moliya', 'hujjat_yarat']));
  });
  it('har bir tomon uchun javob tuzilishi to\'g\'ri (versiya, noyob amal id, bo\'lim havolalari mavjud amalga)', () => {
    for (const t of TOMONLAR) {
      const rol = ({ rahbar: 'boss', pto: 'pto', prorab: 'prorab', omborchi: 'omborchi', taminotchi: 'taminotchi', texnadzor: 'inspektor', subpudratchi: 'pudratchi', buxgalter: 'bugalter', ishchi: '' } as const)[t];
      const r = ishStoliQur({ ishJoylari: [{ kompaniya_id: 9, nom: 'X', turi: 'tashkilot', rol }], superadmin: true });
      expect(r.versiya).toBe(1); expect(r.tomon).toBe(t === 'ishchi' ? 'ishchi' : t);
      expect(new Set(ids(r)).size).toBe(ids(r).length);
      for (const b of r.bolimlar) for (const a of [...(b.amallar ?? []), ...(b.amal ? [b.amal] : [])]) expect(ids(r)).toContain(a);
      expect(JSON.stringify(r)).not.toMatch(/undefined/);
    }
  });
});
