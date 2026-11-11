import { describe, expect, it } from 'vitest';
import { jurnalMatni, kunAosr, kunBosh, kunIshlari, kunKirimlari, kunMurojaatlari, obHavoMatni, type KunJurnali } from './model';
import { jurnalQiymat } from '../ai-yordamchi/buyruq-vositalar';

const bosh = (o: Partial<KunJurnali> = {}): KunJurnali => ({
  obyektId: 1, obyektNomi: 'Объект', sana: '2026-11-12', ishlar: [], kirimlar: [], aosr: [], murojaatlar: [], obHavo: null, izoh: null, olinmagan: [], ...o,
});

describe('kunIshlari — fakt aktlaridan', () => {
  const qatorlar = [{ id: 10, kod: 'Е06-001', nom: 'Бетон', birlik: 'м3', tartib: 2 }, { id: 11, nom: 'Арматура', birlik: 'т', tartib: 1 }];
  it('bekor akt kirmaydi, bir qator bir necha aktda qo‘shiladi, tartib smeta bo‘yicha', () => {
    const r = kunIshlari(
      [{ id: 1, holat: 'qoralama' }, { id: 2, holat: 'qoralama' }, { id: 3, holat: 'bekor' }],
      [{ akt_id: 1, qator_id: 10, hajm: '5' }, { akt_id: 2, qator_id: 10, hajm: 2.5 }, { akt_id: 3, qator_id: 10, hajm: 100 }, { akt_id: 1, qator_id: 11, hajm: 1 }],
      qatorlar);
    expect(r.map((x) => [x.qatorId, x.hajm, x.aktlar])).toEqual([[11, 1, 1], [10, 7.5, 2]]);
  });
  it('tuzatish (manfiy) bilan yig‘indi 0 bo‘lsa — tashlanadi; hajmi noma‘lum qator sanalmaydi', () => {
    const r = kunIshlari([{ id: 1 }], [{ akt_id: 1, qator_id: 10, hajm: 4 }, { akt_id: 1, qator_id: 10, hajm: -4 }, { akt_id: 1, qator_id: 11, hajm: null }], qatorlar);
    expect(r).toEqual([]);
  });
});

describe('kirim, АОСР, murojaat', () => {
  it('faqat prixod va bekor/storno emas', () => {
    const r = kunKirimlari([
      { id: 1, nomi: 'Цемент', birligi: 'т', obyomi: '3', operatsiya: 'prixod', holat: 'faol' },
      { id: 2, nomi: 'X', operatsiya: 'rasxod', obyomi: 1 },
      { id: 3, nomi: 'Y', operatsiya: 'prixod', holat: 'bekor', obyomi: 1 },
    ]);
    expect(r).toEqual([{ id: 1, nomi: 'Цемент', birligi: 'т', hajm: 3, postavshik: null }]);
  });
  it('АОСР: shu kuni, imzolangan yoki qog‘ozda; qoralama/bekor yo‘q', () => {
    const r = kunAosr([
      { id: 1, sana: '2026-11-12', holat: 'tasdiqlangan', raqam: '1', ish_nomi: 'А' }, { id: 2, sana: '2026-11-12', holat: 'yangi' },
      { id: 3, sana: '2026-11-11', holat: 'tasdiqlangan' }, { id: 4, sana: '2026-11-12', holat: 'qogoz' }, { id: 5, sana: '2026-11-12', holat: 'bekor' },
    ], '2026-11-12');
    expect(r.map((x) => x.id)).toEqual([1, 4]);
  });
  it('murojaat: shu obyekt va shu kuni yaratilgan, bekor emas', () => {
    const m = (id: number, o: object) => ({ id, turi: 'predpisaniya', sarlavha: 'S', holat: 'ochiq', muddat: null, yaratildi: '2026-11-12T08:00:00Z', obyekt_nom: 'Объект', ...o });
    const r = kunMurojaatlari([m(1, {}), m(2, { obyekt_nom: 'Boshqa' }), m(3, { yaratildi: '2026-11-11T23:00:00Z' }), m(4, { holat: 'bekor' })], 'Объект', '2026-11-12');
    expect(r.map((x) => x.id)).toEqual([1]);
  });
});

describe('ob-havo va matn', () => {
  it('ob-havo matni; ma‘lumot yo‘q — null (0 emas)', () => {
    expect(obHavoMatni(null)).toBeNull();
    expect(obHavoMatni({ harorat_min: null, harorat_max: null, yogin_mm: null, shamol_max: null, kod: null, manba: null })).toBeNull();
    const t = obHavoMatni({ harorat_min: 3, harorat_max: 11.4, yogin_mm: 0, shamol_max: 18, kod: 0, manba: 'open-meteo' })!;
    expect(t).toContain('ясно'); expect(t).toContain('+3'); expect(t).toContain('+11,4'); expect(t).toContain('осадки 0 мм');
  });
  it('bo‘sh kun va jurnalMatni: olinmagan manba ogohlantiriladi', () => {
    expect(kunBosh(bosh())).toBe(true);
    expect(kunBosh(bosh({ izoh: { izoh: 'Дождь', odamlar: '', tasdiqlandi: false, versiya: 1, obHavo: null } }))).toBe(false);
    const s = jurnalMatni(bosh({ olinmagan: ['kirim'], ishlar: [{ qatorId: 1, kod: 'К1', nom: 'Бетон', birlik: 'м3', hajm: 7.5, aktlar: 1 }] }));
    expect(s).toContain('DIQQAT'); expect(s).toContain('Бетон'); expect(s).toContain('7,5'); expect(s).toContain('prorab izohi yo‘q');
  });
});

describe('Jarvis qiymati', () => {
  it('«YYYY-MM-DD|matn» yoki faqat matn', () => {
    expect(jurnalQiymat('2026-11-10|Дождь, работы стояли')).toEqual({ sana: '2026-11-10', matn: 'Дождь, работы стояли' });
    expect(jurnalQiymat('Дождь')).toEqual({ sana: null, matn: 'Дождь' });
    expect(jurnalQiymat(null)).toEqual({ sana: null, matn: '' });
  });
});
