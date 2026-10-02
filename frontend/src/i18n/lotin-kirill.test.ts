import { describe, expect, it, beforeAll } from 'vitest';
import { apostrofTozala, kirillLotin, lotinKirill, qidiruvdaBor, qidiruvKaliti, sozIstisnolariniQoy } from './lotin-kirill';

describe('lotin → kirill (o‘zbek imlosi)', () => {
  beforeAll(() => sozIstisnolariniQoy({ pto: 'ПТО', tsement: 'цемент' }));

  it.each([
    ['Saqlash', 'Сақлаш'],
    ['Shahar', 'Шаҳар'],
    ['choy', 'чой'],
    ['O‘zbekcha', 'Ўзбекча'],
    ["o'zbek tili", 'ўзбек тили'],
    ['Oʻzbekiston', 'Ўзбекистон'],
    ['g‘isht', 'ғишт'],
    ['yo‘l', 'йўл'],
    ['yoz', 'ёз'],
    ['yuk', 'юк'],
    ['yangi', 'янги'],
    ['yer', 'ер'],
    ['ekin', 'экин'],
    ['beton', 'бетон'],
    ['sharoit', 'шароит'],
    ['ma’lumot', 'маълумот'],
    ["san'at", 'санъат'],
    ['Is’hoq', 'Исҳоқ'],
    ['ketsa', 'кетса'],
    ['qishloq', 'қишлоқ'],
    ['xona', 'хона'],
    ['SAQLASH', 'САҚЛАШ'],
    ['Shartnomalar', 'Шартномалар'],
  ])('%s → %s', (l, k) => expect(lotinKirill(l)).toBe(k));

  it('o‘rinbosar, raqam, brend, qisqartma, URL o‘zgarmaydi; istisnolar ishlaydi', () => {
    expect(lotinKirill('{n} ta qator')).toBe('{n} та қатор');
    expect(lotinKirill('F2 tayyorlash')).toBe('F2 тайёрлаш');
    expect(lotinKirill('Google bilan kirish')).toBe('Google билан кириш');
    expect(lotinKirill('AI ishchilar')).toBe('AI ишчилар');
    expect(lotinKirill('PTO ish yo‘li')).toBe('ПТО иш йўли');
    expect(lotinKirill('tsement')).toBe('цемент');
    expect(lotinKirill('https://smeta-tizimi.pages.dev')).toBe('https://smeta-tizimi.pages.dev');
    expect(lotinKirill('Narx dalili (Обоснование цен)')).toBe('Нарх далили (Обоснование цен)');
  });
});

describe('kirill → lotin va qidiruv', () => {
  it.each([
    ['Ўзбекча', 'Oʻzbekcha'],
    ['Шаҳар', 'Shahar'],
    ['ер', 'yer'],
    ['бетон', 'beton'],
    ['маълумот', 'maʼlumot'],
    ['ҚИШЛОҚ', 'QISHLOQ'],
    ['Ёз', 'Yoz'],
  ])('%s → %s', (k, l) => expect(kirillLotin(k)).toBe(l));

  it('qidiruv yozuv va apostrofga befarq', () => {
    expect(qidiruvKaliti('Ўзбекча')).toBe(qidiruvKaliti("O'zbekcha"));
    expect(qidiruvKaliti('O‘zbekcha')).toBe(qidiruvKaliti('oʻzbekcha'));
    expect(qidiruvdaBor('Ғишт териш ишлари', "g'isht")).toBe(true);
    expect(qidiruvdaBor('G‘isht terish', 'ғишт')).toBe(true);
    expect(qidiruvdaBor('Beton', 'g‘isht')).toBe(false);
  });

  it('apostroflar rasmiy imloga keladi', () => {
    expect(apostrofTozala("o'g'il ma'no")).toBe('oʻgʻil maʼno');
  });

  it('aylanma: lotin → kirill → lotin (oddiy so‘zlar)', () => {
    for (const s of ['Saqlash', 'Shartnoma', 'Oʻzbekiston', 'yangi yoʻl', 'qishloq xoʻjaligi']) expect(kirillLotin(lotinKirill(s))).toBe(s);
  });
});
