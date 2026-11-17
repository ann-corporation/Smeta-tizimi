import { describe, expect, it } from 'vitest';
import { davrFiltrdan, davrMatndan, davrTanlov, sanaSur, toshkentBugun } from './davr';

// 2026-11-18 = chorshanba. Faqat sintetik sanalar.
const B = '2026-11-18';

describe('davrTanlov (tayyor tanlovlar)', () => {
  it('bugun / kecha', () => {
    expect(davrTanlov('bugun', B)).toMatchObject({ dan: B, gacha: B });
    expect(davrTanlov('kecha', B)).toMatchObject({ dan: '2026-11-17', gacha: '2026-11-17' });
  });
  it('hafta dushanbadan, o\'tgan hafta dushanba-yakshanba', () => {
    expect(davrTanlov('hafta', B)).toMatchObject({ dan: '2026-11-16', gacha: B });
    expect(davrTanlov('otgan_hafta', B)).toMatchObject({ dan: '2026-11-09', gacha: '2026-11-15' });
    expect(davrTanlov('hafta', '2026-11-15')).toMatchObject({ dan: '2026-11-09' }); // yakshanba: hafta dushanbada boshlangan
  });
  it('oy / o\'tgan oy (yil chegarasida ham) / yil / hammasi', () => {
    expect(davrTanlov('oy', B)).toMatchObject({ dan: '2026-11-01', gacha: B });
    expect(davrTanlov('otgan_oy', B)).toMatchObject({ dan: '2026-10-01', gacha: '2026-10-31' });
    expect(davrTanlov('otgan_oy', '2027-01-05')).toMatchObject({ dan: '2026-12-01', gacha: '2026-12-31' });
    expect(davrTanlov('otgan_oy', '2026-03-10')).toMatchObject({ dan: '2026-02-01', gacha: '2026-02-28' });
    expect(davrTanlov('yil', B)).toMatchObject({ dan: '2026-01-01', gacha: B });
    expect(davrTanlov('hammasi', B)).toMatchObject({ dan: null, gacha: null });
  });
  it('ixtiyoriy: teskari bo\'lsa almashtiriladi, noto\'g\'ri sana tashlanadi', () => {
    expect(davrTanlov('ixtiyoriy', B, { dan: '2026-11-10', gacha: '2026-11-01' })).toMatchObject({ dan: '2026-11-01', gacha: '2026-11-10' });
    expect(davrTanlov('ixtiyoriy', B, { dan: '2026-13-40', gacha: '2026-11-01' })).toMatchObject({ dan: null, gacha: '2026-11-01' });
  });
  it('toshkentBugun UTC+5, sanaSur', () => {
    expect(toshkentBugun(Date.parse('2026-11-17T20:30:00Z'))).toBe('2026-11-18');
    expect(sanaSur('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('davrFiltrdan', () => {
  it('belgi yoki dan/gacha; noto\'g\'ri -> null', () => {
    expect(davrFiltrdan({ davr: 'otgan_oy' }, B)).toMatchObject({ dan: '2026-10-01' });
    expect(davrFiltrdan({ dan: '2026-11-01', gacha: '2026-11-05' }, B)).toMatchObject({ belgi: 'ixtiyoriy', dan: '2026-11-01', gacha: '2026-11-05' });
    expect(davrFiltrdan({ dan: 'abc' }, B)).toBeNull();
    expect(davrFiltrdan({}, B)).toMatchObject({ dan: null, gacha: null });
  });
});

describe('davrMatndan (o\'zbek/rus)', () => {
  const d = (s: string) => davrMatndan(s, B)?.davr;
  it('o\'zbekcha iboralar', () => {
    expect(d('o\'tgan oy sement qancha keldi')).toMatchObject({ belgi: 'otgan_oy', dan: '2026-10-01' });
    expect(d('bugungi qoldiq')).toMatchObject({ belgi: 'bugun' });
    expect(d('kechagi kirim')).toMatchObject({ belgi: 'kecha' });
    expect(d('bu hafta nima keldi')).toMatchObject({ belgi: 'hafta' });
    expect(d('shu oy chiqim')).toMatchObject({ belgi: 'oy' });
    expect(d('oʻtgan hafta')).toMatchObject({ belgi: 'otgan_hafta' });
  });
  it('ruscha iboralar', () => {
    expect(d('за прошлый месяц сколько цемента пришло')).toMatchObject({ belgi: 'otgan_oy' });
    expect(d('что пришло сегодня')).toMatchObject({ belgi: 'bugun' });
    expect(d('расход за вчера')).toMatchObject({ belgi: 'kecha' });
    expect(d('приход на этой неделе')).toMatchObject({ belgi: 'hafta' });
  });
  it('oy nomi va aniq sanalar', () => {
    expect(d('sentabrda nima keldi')).toMatchObject({ dan: '2026-09-01', gacha: '2026-09-30' });
    expect(d('dekabr kirim')).toMatchObject({ dan: '2025-12-01', gacha: '2025-12-31' }); // kelajak oyi -> o'tgan yil
    expect(d('2026-11-01 dan 2026-11-10 gacha')).toMatchObject({ dan: '2026-11-01', gacha: '2026-11-10' });
    expect(d('2026-11-05 dagi qoldiq')).toMatchObject({ dan: '2026-11-05', gacha: '2026-11-05' });
  });
  it('davr yo\'q -> null; qolgan matndan davr iborasi olib tashlanadi', () => {
    expect(d('sement qancha')).toBeUndefined();
    expect(davrMatndan('o\'tgan oy sement', B)?.qolgan.trim()).toBe('sement');
  });
});
