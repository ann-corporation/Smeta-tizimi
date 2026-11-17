// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { OMBOR_VOSITALAR, vositaSorov, vositaTop } from './ombor-vositalar';
import { buyruqTekshir, oddiyTahlil } from './ombor-buyruq-yadro';

describe('ombor vositalari: shartnoma', () => {
  it('yetti vosita, versiyali; faqat ombor_tasdiq yozadi', () => {
    expect(OMBOR_VOSITALAR.map((v) => v.nom)).toEqual(['ombor_kirim_taklif', 'ombor_kirim', 'ombor_chiqim', 'ombor_tasdiq', 'ombor_qoldiq', 'ombor_hisobot', 'ombor_eksport']);
    expect(OMBOR_VOSITALAR.filter((v) => v.yozadi).map((v) => v.nom)).toEqual(['ombor_tasdiq']);
    expect(OMBOR_VOSITALAR.every((v) => v.versiya === 1 && v.tavsif.length > 10)).toBe(true);
    expect(vositaTop('ombor_tasdiq')).toMatchObject({ ruxsat: 'warehouse.write', tasdiqKerak: true });
    expect(vositaTop('ombor_kirim')).toMatchObject({ yozadi: false, tasdiqKerak: true, ruxsat: 'warehouse.read' });
  });
});

describe('vositaSorov: tasdiq darvozasi (yozish faqat aniq tasdiq bilan)', () => {
  it('ombor_kirim/chiqim faqat qoralama (tahlil) amaliga o\'tadi — yozish amaliga emas', () => {
    const k = vositaSorov('ombor_kirim', { nomi: 'Цемент', miqdor: '10,5', birlik: 'тн', narx: 1_200_000, yetkazuvchi: 'Альфа', sana: '2026-11-18' });
    expect(k).toMatchObject({ amal: 'tahlil' });
    if ('xato' in k) throw new Error('kutilmagan');
    expect(k.tana.buyruq).toMatchObject({ amal: 'prixod', nomi: 'Цемент', miqdor: 10.5, narx: 1_200_000, kontragent: 'Альфа' });
    const c = vositaSorov('ombor_chiqim', { nomi: 'Цемент', miqdor: 3, qabul_qiluvchi: 'Бригада', obyekt: 'Склад-1' });
    if ('xato' in c) throw new Error('kutilmagan');
    expect(c.amal).toBe('tahlil'); expect(c.tana.buyruq).toMatchObject({ amal: 'chiqim', kontragent: 'Бригада', obyekt: 'Склад-1' });
    for (const x of [k, c]) expect(['yoz', 'tasdiq', 'tuzat']).not.toContain(x.amal);
  });
  it('ombor_tasdiq: tasdiqlayman:true va token bo\'lmasa rad', () => {
    expect(vositaSorov('ombor_tasdiq', { token: 'a.b' })).toEqual({ xato: 'TASDIQ_KERAK' });
    expect(vositaSorov('ombor_tasdiq', { token: 'a.b', tasdiqlayman: 'true' })).toEqual({ xato: 'TASDIQ_KERAK' });
    expect(vositaSorov('ombor_tasdiq', { tasdiqlayman: true })).toEqual({ xato: 'REQUIRED_FIELD' });
    expect(vositaSorov('ombor_tasdiq', { token: 'a.b', tasdiqlayman: true })).toMatchObject({ amal: 'tasdiq', tana: { token: 'a.b' } });
  });
  it('noto\'g\'ri kirish rad etiladi', () => {
    expect(vositaSorov('yoq_vosita', {})).toEqual({ xato: 'VOSITA_NOMALUM' });
    expect(vositaSorov('ombor_kirim', { nomi: 'x' })).toEqual({ xato: 'REQUIRED_FIELD' });
    expect(vositaSorov('ombor_kirim', { nomi: 'x', miqdor: -1 })).toEqual({ xato: 'REQUIRED_FIELD' });
    expect(vositaSorov('ombor_kirim', { nomi: 'x', miqdor: 1, narx: 'abc' })).toEqual({ xato: 'NARX_NOTOGRI' });
    expect(vositaSorov('ombor_qoldiq', [1])).toEqual({ xato: 'ARGUMENT_NOTOGRI' });
  });
});

describe('vositaSorov: o\'qish vositalari', () => {
  it('taklif / qoldiq(sana) / hisobot(davr, filtr) / eksport tavsifi', () => {
    expect(vositaSorov('ombor_kirim_taklif', { q: 'sem', limit: 99 })).toMatchObject({ amal: 'taklif', tana: { q: 'sem', tur: 'prixod', limit: 20 } });
    expect(vositaSorov('ombor_qoldiq', { sana: '2026-11-01', q: 'sement' })).toMatchObject({ amal: 'qoldiq', tana: { sana: '2026-11-01', filtr: { qidir: 'sement', musbat: '1' } } });
    expect(vositaSorov('ombor_qoldiq', { sana: 'ertaga' })).toMatchObject({ amal: 'qoldiq' }); // noto'g'ri sana tashlanadi (hozirgi ostatka)
    expect(vositaSorov('ombor_hisobot', { davr: 'otgan_oy', q: 'sement', yetkazuvchi: 'Альфа', operatsiya: 'kirim' })).toMatchObject({ amal: 'hisobot', tana: { filtr: { davr: 'otgan_oy', qidir: 'sement', yetkazuvchi: 'Альфа', operatsiya: 'prixod' } } });
    expect(vositaSorov('ombor_eksport', { tur: 'hisobot', davr: 'oy' })).toMatchObject({ amal: 'eksport_reja', tana: { tur: 'hisobot', filtr: { davr: 'oy' } } });
  });
});

describe('oddiyTahlil: savollar (LLM siz) va buyruqlar', () => {
  const hozir = new Date('2026-11-18T07:00:00Z');
  it('«o\'tgan oy sement qancha keldi» -> hisobot, ishonch yuqori', () => {
    const r = oddiyTahlil('o\'tgan oy sement qancha keldi', hozir);
    expect(r.ishonch).toBe('yuqori');
    expect(r.buyruq).toMatchObject({ amal: 'hisobot', nomi: 'sement', operatsiya: 'prixod', davr: { dan: '2026-10-01', gacha: '2026-10-31' } });
  });
  it('«bugungi qoldiq» -> nomsiz qoldiq, sana bugun', () => {
    const r = oddiyTahlil('bugungi qoldiq', hozir);
    expect(r.ishonch).toBe('yuqori'); expect(r.buyruq).toMatchObject({ amal: 'qoldiq', nomi: null, sana: '2026-11-18' });
  });
  it('eski buyruq o\'zgarmaydi: «sement 10 tonna keldi» -> prixod', () => {
    expect(oddiyTahlil('sement 10 tonna keldi', hozir).buyruq).toMatchObject({ amal: 'prixod', miqdor: 10, birlik: 'тн', davr: null, narx: null });
  });
  it('narx matndan: «sement 10 tonna narxi 1 200 000 keldi» -> narx, miqdor buzilmaydi', () => {
    const r = oddiyTahlil('sement 10 tonna keldi narxi 1 200 000', hozir);
    expect(r.buyruq).toMatchObject({ amal: 'prixod', miqdor: 10, birlik: 'тн', narx: 1_200_000 });
    expect(oddiyTahlil('sement 10 tonna keldi', hozir).buyruq?.narx).toBeNull();
  });
  it('buyruqTekshir: hisobot davri va narx', () => {
    expect(buyruqTekshir({ amal: 'hisobot', davr_dan: '2026-11-01', davr_gacha: '2026-11-10', operatsiya: 'rasxod' })).toMatchObject({ amal: 'hisobot', davr: { dan: '2026-11-01', gacha: '2026-11-10' }, operatsiya: 'rasxod' });
    expect(buyruqTekshir({ amal: 'prixod', nomi: 'x', miqdor: 1, narx: '1 200,5' })).toMatchObject({ narx: 1200.5 });
    expect(buyruqTekshir({ amal: 'prixod', nomi: 'x', miqdor: 1, narx: -5 })?.narx).toBeNull();
  });
});
