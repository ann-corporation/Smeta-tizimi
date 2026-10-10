import { describe, expect, it } from 'vitest';
import type { KatalogQatori } from '../narx-katalog/price-remote';
import { autoPrice, characteristics, matchResource, normName, type MatchCatalog } from './resource-match';
import { priceCommand } from './price-lookup';

type R = [string, string, number | null, string];
const ROWS: R[] = [
  ['БЕТОН ТЯЖЕЛЫЙ, КЛАСС B15 (М200)', 'м3', 780000, 'toshkent'],
  ['БЕТОН ТЯЖЕЛЫЙ, КЛАСС B15 (М200)', 'м3', 760000, 'samarqand'],
  ['БЕТОН ТЯЖЕЛЫЙ, КЛАСС B25 (М350)', 'м3', 900000, 'toshkent'],
  ['БЕТОН ТЯЖЕЛЫЙ, КЛАСС В7,5 (М100)', 'м3', 650000, 'toshkent'],
  ['АРМАТУРА КЛАССА А500С ДИАМЕТРОМ 12 ММ', 'т', 9800000, 'toshkent'],
  ['АРМАТУРА КЛАССА А500С ДИАМЕТРОМ 16 ММ', 'т', 9700000, 'toshkent'],
  ['АРМАТУРА КЛАССА А240 ДИАМЕТРОМ 12 ММ', 'т', 9900000, 'toshkent'],
  ['КИРПИЧ КЕРАМИЧЕСКИЙ ПОЛНОТЕЛЫЙ М150', 'тыс. шт', 1500000, 'toshkent'],
  ['ПЕСОК ДЛЯ СТРОИТЕЛЬНЫХ РАБОТ', 'м3', 120000, 'toshkent'],
  ['ПЕСОК ДЛЯ СТРОИТЕЛЬНЫХ РАБОТ', 'т', 80000, 'toshkent'],
  ['ПРОВОЛОКА ВЯЗАЛЬНАЯ', 'т', null, 'toshkent'],
  ['Кабели силовые с медными жилами ВВГ 4х2,5', 'км', 14000000, 'toshkent'],
  ['Кабели силовые с алюминиевыми жилами АВВГ 4х2,5', 'км', 4700000, 'toshkent'],
  ['Кабели силовые с алюминиевыми жилами АВВГ 4х4', 'км', 6000000, 'toshkent'],
];
const row = (i: number): KatalogQatori => ({ id: i + 1, manba_id: 1, kod: null, nom: ROWS[i][0], birlik: ROWS[i][1], narx: ROWS[i][2],
  hudud: ROWS[i][3], ishlab_chiqaruvchi: null, nds_holati: null, nds_izoh: null, yil: 2026, kvartal: 2, narx_varianti: null, guruh: null,
  hudud_kalit: ROWS[i][3], manba_nom: 'Katalog', manba_tur: 'platforma' });
const cat: MatchCatalog = { size: ROWS.length, name: i => ROWS[i][0], unit: i => ROWS[i][1], region: i => ROWS[i][3], price: i => ROWS[i][2], row };

function catalogue(offers: Array<Partial<KatalogQatori> & { nom: string }>): MatchCatalog {
  const rows = offers.map((offer, i) => ({ ...row(0), id: i + 1, ...offer }));
  return { size: rows.length, name: i => rows[i].nom, unit: i => rows[i].birlik,
    price: i => rows[i].narx, region: i => rows[i].hudud_kalit, row: i => rows[i] };
}

describe('characteristics', () => {
  it('normalises Latin look-alikes and decimal comma', () => {
    expect(normName('Бетон B7,5')).toBe('БЕТОН В7.5');
  });
  it('extracts concrete class, rebar class and diameter', () => {
    expect(characteristics('Бетон тяжелый B15').grade).toBe('В15');
    expect(characteristics('Раствор цементный М100').grade).toBe('М100');
    expect(characteristics('Кирпич М150').grade).toBeNull();
    const a = characteristics('Арматура A500C Ø12');
    expect([a.rebar, a.diameter]).toEqual(['А500С', '12']);
    expect(characteristics('Арматурная сталь класса A-III диаметром 16 мм').rebar).toBe('АIII');
  });
});

describe('matchResource — characteristic gates, region, confidence', () => {
  it('B15 never matches B25 even with identical words; object region preferred', () => {
    const r = matchResource(cat, 'Бетон тяжелый класса B15', 'м3', 'samarqand');
    expect(r.candidates.every(c => c.row.nom.includes('B15'))).toBe(true);
    expect(r.best?.row.hudud_kalit).toBe('samarqand');
    expect(r.confidence).toBe('HIGH');
    expect(r.gateRejected).toBeGreaterThan(0);
  });
  it('exact name + unit is EXACT', () => {
    expect(matchResource(cat, 'Бетон тяжелый, класс B15 (М200)', 'м3', 'toshkent')).toMatchObject({ confidence: 'EXACT', best: { row: { id: 1 } } });
  });
  it('rebar: class and diameter are hard gates', () => {
    const r = matchResource(cat, 'Арматура A500C диаметром 16 мм', 'т');
    expect(r.best?.row.id).toBe(6);
    expect(r.candidates.map(c => c.row.id)).not.toContain(5);
    expect(r.candidates.map(c => c.row.id)).not.toContain(7);
  });
  it('unit mismatch is rejected (sand m3 ≠ sand t); priceless rows never offered', () => {
    expect(matchResource(cat, 'Песок для строительных работ', 'т').candidates.map(c => c.row.id)).toEqual([10]);
    expect(matchResource(cat, 'Проволока вязальная', 'т').confidence).toBe('NONE');
  });
  it('cable: brand (АВВГ ≠ ВВГ) and cross-section (4х2,5 ≠ 4х4) are hard gates', () => {
    const r = matchResource(cat, 'Кабели силовые с алюминиевыми жилами, марки АВВГ, с числом жил и сечением, мм2: 4X2,5', 'км');
    expect(r.candidates.map(c => c.row.id)).toEqual([13]);
  });
  it('vague name stays REVIEW for the AI agent / operator', () => {
    expect(matchResource(cat, 'Бетон', 'м3').confidence).toBe('REVIEW');
  });
  it('autoPrice splits applied (EXACT/HIGH) and review lines', () => {
    const r = autoPrice([
      { occurrenceId: 'o', recipeId: 'a', name: 'Бетон тяжелый, класс B15 (М200)', unit: 'м3' },
      { occurrenceId: 'o', recipeId: 'b', name: 'Бетон', unit: 'м3' },
    ], cat, 'toshkent');
    expect(r.applied.map(x => x.recipeId)).toEqual(['a']);
    expect(r.review.map(x => x.recipeId)).toEqual(['b']);
  });
});

describe('matchResource — strong identity', () => {
  it('long official cable name with verified brand+section and a single surviving product → HIGH', () => {
    const r = matchResource(cat, 'Кабели силовые с поливинилхлоридной изоляцией с алюминиевыми жилами на напряжение 1000 в, марки АВВГ, с числом жил и сечением, мм2: 4X2,5', 'км');
    expect([r.confidence, r.best?.row.id]).toEqual(['HIGH', 13]);
  });
  it('without a known unit nothing is auto-applied', () => {
    expect(matchResource(cat, 'Кабели силовые марки АВВГ 4X2,5', null).confidence).toBe('REVIEW');
    expect(matchResource(cat, cat.name(0), null).confidence).toBe('REVIEW');
  });
});

describe('matchResource — no auto-apply for generic names or extra characteristics', () => {
  it('can reveal more than eight offers without changing automatic confidence', () => {
    const many: MatchCatalog = { size: 40, name: i => `БЕТОН ТЯЖЕЛЫЙ B${i + 1}`, unit: () => 'м3', region: () => 'toshkent',
      price: () => 1000, row: i => ({ ...row(0), id: i + 1, nom: `БЕТОН ТЯЖЕЛЫЙ B${i + 1}` }) };
    const short = matchResource(many, 'Бетон', 'м3');
    const more = matchResource(many, 'Бетон', 'м3', null, 33);
    expect(short.candidates).toHaveLength(8);
    expect(short.candidateTotal).toBe(40);
    expect(more.candidates).toHaveLength(33);
    expect(more.confidence).toBe(short.confidence);
    expect(matchResource(many, 'Бетон', 'м3', null, 1).confidence).toBe('REVIEW');
  });
  const extra: MatchCatalog = { size: 2, name: i => ['ПРОВОД КРОССОВЫЙ ПКСВ 2Х0,4', 'ГРУНТОВКА БИТУМНАЯ'][i], unit: i => ['м', 'т'][i],
    region: () => 'toshkent', price: () => 1000, row: i => row(i) };
  it('one-word "ПРОВОД" never auto-binds to a specific branded wire', () => {
    expect(matchResource(extra, 'Провод', 'м').confidence).toBe('REVIEW');
  });
});

describe('matchResource — price-only dimensional conversion', () => {
  it.each([
    ['т', 'кг', 9800000, 9800, 0.001],
    ['kg', 't', 9800, 9800000, 1000],
    ['км', 'п.м', 4700000, 4700, 0.001],
    ['m', 'km', 4700, 4700000, 1000],
  ])('%s → %s normalizes price and preserves original source evidence', (sourceUnit, targetUnit, sourcePrice, targetPrice, factor) => {
    const nom = ['т', 'kg'].includes(sourceUnit) ? 'Арматура A500C Ø12' : 'Кабели силовые марки АВВГ 4X2,5';
    const c = catalogue([{ nom, birlik: sourceUnit, narx: sourcePrice, nds_izoh: 'Original source note' }]);
    const original = c.row(0);
    const before = { ...original };
    const r = matchResource(c, nom, targetUnit);
    expect(r.confidence).toBe('EXACT');
    expect(r.best?.row).toMatchObject({ id: 1, nom, birlik: targetUnit, narx: targetPrice });
    expect(r.best?.unitConversion).toMatchObject({ sourceUnit, targetUnit, sourcePrice, priceFactor: factor });
    expect(r.best?.row.unitConversion).toEqual(r.best?.unitConversion);
    expect(r.best?.row.nds_izoh).toContain(r.best!.unitConversion!.evidence);
    expect(r.best?.row.nds_izoh).toContain('Original source note');
    expect(original).toEqual(before);
    const command = priceCommand('occurrence', 'recipe', r.best!.row);
    expect(command).toMatchObject({ type: 'SET_PRICE', occurrenceId: 'occurrence', recipeId: 'recipe',
      price: { value: String(targetPrice), sourcePriceId: 'narx-katalog:1' } });
    if (command.type === 'SET_PRICE') expect(command.price?.evidence).toContain(r.best!.unitConversion!.evidence);
  });

  it('preserves VAT status and gives callers conversion evidence independently of VAT', () => {
    const c = catalogue([{ nom: 'Арматура A500C Ø12', birlik: 'т', narx: 9800000, nds_holati: 'nds_siz' }]);
    const best = matchResource(c, c.name(0), 'кг').best!;
    expect(best.row.nds_holati).toBe('nds_siz');
    expect(best.row.nds_izoh).toContain('9800000/т × 0.001 = 9800/кг');
    expect(best.unitConversion?.evidence).toBe(best.row.nds_izoh);
  });

  it('ranks competing source units by the target-unit price', () => {
    const nom = 'Арматура A500C Ø12';
    const c = catalogue([{ nom, birlik: 'т', narx: 9000000 }, { nom, birlik: 'кг', narx: 10000 }]);
    const r = matchResource(c, nom, 'кг');
    expect(r.best?.row).toMatchObject({ id: 1, birlik: 'кг', narx: 9000 });
    expect(r.candidates.map(x => x.row.narx)).toEqual([9000, 10000]);
  });

  it.each([['м3', 'т'], ['м2', 'м'], ['шт', 'тыс. шт'], ['100 м', 'м'], ['маш-ч', 'ч']])(
    'does not invent a %s → %s conversion', (from, to) => {
      const c = catalogue([{ nom: 'Песок для строительных работ', birlik: from }]);
      expect(matchResource(c, c.name(0), to).confidence).toBe('NONE');
    });

  it.each([null, '', '   '])('unknown source or target unit %s always requires review', unknown => {
    const nom = 'Арматура A500C Ø12';
    const c = catalogue([{ nom, birlik: unknown }]);
    expect(matchResource(c, nom, 'т')).toMatchObject({ confidence: 'REVIEW', best: { row: { birlik: unknown } } });
    expect(matchResource(cat, cat.name(4), unknown).confidence).toBe('REVIEW');
  });

  it('unit synonyms do not create conversion metadata or change the source row', () => {
    const c = catalogue([{ nom: 'Арматура A500C Ø12', birlik: 'тонна' }]);
    const r = matchResource(c, c.name(0), 'т');
    expect(r.confidence).toBe('EXACT');
    expect(r.best?.unitConversion).toBeUndefined();
    expect(r.best?.row).toBe(c.row(0));
  });

  it('a zero price stays zero and an overflowing conversion is rejected', () => {
    const nom = 'Арматура A500C Ø12';
    expect(matchResource(catalogue([{ nom, birlik: 'т', narx: 0 }]), nom, 'кг').best?.row.narx).toBe(0);
    expect(matchResource(catalogue([{ nom, birlik: 'кг', narx: Number.MAX_VALUE }]), nom, 'т').confidence).toBe('NONE');
  });
});

describe('matchResource — product families and explicit specifications', () => {
  it.each([
    ['Щиты стальные', 'Воздуховоды стальные', 'м2'],
    ['Сетка арматурная A500C Ø12', 'Арматура A500C Ø12', 'т'],
    ['Экскаватор дизельный 10', 'Генератор дизельный 10', 'маш-ч'],
  ])('rejects %s ↔ %s despite shared words/specifications/unit', (a, b, unit) => {
    for (const [source, candidate] of [[a, b], [b, a]]) {
      const c = catalogue([{ nom: candidate, birlik: unit }]);
      expect(matchResource(c, source, unit)).toMatchObject({ confidence: 'NONE', gateRejected: 1 });
    }
  });

  it('explicit crushed-stone fractions cannot be mismatched or omitted', () => {
    const c = catalogue([
      { nom: 'Щебень гранитный фракция 5-20 мм' },
      { nom: 'Щебень гранитный' },
      { nom: 'Щебень гранитный фракция 5 – 10 мм' },
    ]);
    const r = matchResource(c, 'Щебень гранитный фракция 5-10 мм', 'м3');
    expect(r.candidates.map(x => x.row.id)).toEqual([3]);
    expect(r.gateRejected).toBe(2);
  });

  it.each(['АРМАТУРА', 'Арматура A500C', 'Арматура Ø12', 'БЕТОН (КЛАСС ПО ПРОЕКТУ)', 'Бетон тяжелый'])(
    'identical generic company/catalogue name %s remains REVIEW', nom => {
      const c = catalogue([{ nom, manba_nom: 'Company estimate', manba_tur: 'kompaniya', birlik: 'т' }]);
      expect(matchResource(c, nom, 'т').confidence).toBe('REVIEW');
      expect(autoPrice([{ occurrenceId: 'o', recipeId: 'r', name: nom, unit: 'т' }], c).applied).toEqual([]);
    });

  it('machine capacity is mandatory in abbreviated offers; different machines are rejected', () => {
    const c = catalogue([
      { nom: 'Экскаваторы одноковшовые дизельные 0,5 м3', birlik: 'маш-ч' },
      { nom: 'Экскаваторы дизельные', birlik: 'маш-ч' },
      { nom: 'Экскаваторы дизельные 1 м3', birlik: 'маш-ч' },
      { nom: 'Генераторы дизельные 0,5 м3', birlik: 'маш-ч' },
    ]);
    const r = matchResource(c, 'Экскаваторы дизельные 0,5 м3', 'маш-ч');
    expect(r.candidates.map(x => x.row.id)).toEqual([1]);
    expect(r.gateRejected).toBe(3);
    const exact = catalogue([{ nom: 'Экскаваторы дизельные', birlik: 'маш-ч' }]);
    expect(matchResource(exact, exact.name(0), 'маш-ч').confidence).toBe('EXACT');
  });

  it('conversion never weakens cable brand/section or rebar class/diameter gates', () => {
    const cable = matchResource(cat, 'Кабели силовые марки АВВГ 4X2,5', 'м');
    expect(cable.candidates.map(c => c.row.id)).toEqual([13]);
    expect(cable.best?.row.narx).toBe(4700);
    expect(cable.confidence).toBe('HIGH');
    const rebar = matchResource(cat, 'Арматура A500C диаметром 16 мм', 'кг');
    expect(rebar.candidates.map(c => c.row.id)).toEqual([6]);
    expect(rebar.best?.row.narx).toBe(9700);
  });

  it('showing fewer or more converted offers does not change automatic confidence', () => {
    const c = catalogue(Array.from({ length: 20 }, (_, i) => ({ nom: `Арматура A500C Ø${i + 1}`, birlik: 'т' })));
    const results = [0, 1, 8, 33].map(limit => matchResource(c, 'Арматура', 'кг', null, limit));
    expect(results.map(r => r.confidence)).toEqual(['REVIEW', 'REVIEW', 'REVIEW', 'REVIEW']);
    expect(results.every(r => r.best?.row.id === results[0].best?.row.id && r.candidateTotal === 20)).toBe(true);
  });
});

describe('matchResource — machine families, capacity and labour identity', () => {
  it('a 5t crane never offers a 10t crane, including among otherwise matching offers', () => {
    const nom = 'Краны автомобильные грузоподъемностью 5 т';
    const c = catalogue([
      { nom: 'Краны автомобильные грузоподъемностью 10 т', birlik: 'маш-ч' },
      { nom: 'Краны автомобильные', birlik: 'маш-ч' },
      { nom, birlik: 'маш-ч' },
    ]);
    const r = matchResource(c, nom, 'маш-ч');
    expect(r).toMatchObject({ confidence: 'EXACT', gateRejected: 2 });
    expect(r.candidates.map(x => x.row.id)).toEqual([3]);
  });

  it('a 3t loader rejects a 5t loader and a 3kW loader despite the same bare number', () => {
    const nom = 'Погрузчики одноковшовые грузоподъемностью 3 т';
    const c = catalogue([
      { nom: 'Погрузчики одноковшовые грузоподъемностью 5 т', birlik: 'маш-ч' },
      { nom: 'Погрузчики одноковшовые мощностью 3 кВт', birlik: 'маш-ч' },
    ]);
    expect(matchResource(c, nom, 'маш-ч')).toMatchObject({ confidence: 'NONE', best: null, candidates: [], gateRejected: 2 });
  });

  it.each([
    ['Краны автомобильные 5 т', 'Погрузчики автомобильные 5 т'],
    ['Бульдозеры дизельные 75 кВт', 'Генераторы дизельные 75 кВт'],
    ['Автомобили бортовые 5 т', 'Краны бортовые 5 т'],
    ['Вибраторы электрические 1 кВт', 'Пилы электрические 1 кВт'],
    ['Аппараты сварочные электрические 5 кВт', 'Пилы электрические 5 кВт'],
  ])('machine family %s cannot match %s on shared adjectives/capacity', (a, b) => {
    for (const [source, candidate] of [[a, b], [b, a]]) {
      const c = catalogue([{ nom: candidate, birlik: 'маш-ч' }]);
      expect(matchResource(c, source, 'маш-ч')).toMatchObject({ confidence: 'NONE', gateRejected: 1 });
    }
  });

  it.each([
    'Краны автомобильные', 'Погрузчики одноковшовые', 'Бульдозеры дизельные',
    'Автомобили бортовые', 'Вибраторы электрические', 'Аппараты сварочные', 'Пилы электрические',
  ])('%s keeps exact names but rejects omitted capacity and cannot auto-HIGH without it', name => {
    const generic = catalogue([{ nom: name, birlik: 'маш-ч' }]);
    expect(matchResource(generic, name, 'маш-ч').confidence).toBe('EXACT');
    expect(matchResource(generic, `${name} 5 кВт`, 'маш-ч').confidence).toBe('NONE');
    expect(matchResource(generic, `${name} строительные`, 'маш-ч').confidence).toBe('REVIEW');
  });

  it('a shared model/standard number alone cannot give a shortened machine offer HIGH confidence', () => {
    const c = catalogue([{ nom: 'Краны автомобильные 123', birlik: 'маш-ч' }]);
    expect(matchResource(c, 'Краны автомобильные самоходные 123', 'маш-ч').confidence).toBe('REVIEW');
  });

  it('construction workers and machine operators never match through shared labour words', () => {
    const worker = 'Затраты труда рабочих-строителей';
    const operator = 'Затраты труда машинистов';
    const c = catalogue([{ nom: worker, birlik: 'чел-ч' }, { nom: operator, birlik: 'чел-ч' }]);
    expect(matchResource(c, worker, 'чел-ч').candidates.map(x => x.row.id)).toEqual([1]);
    expect(matchResource(c, operator, 'чел-ч').candidates.map(x => x.row.id)).toEqual([2]);
    const operators = catalogue([{ nom: 'Затраты труда операторов строительных машин', birlik: 'чел-ч' }]);
    expect(matchResource(operators, worker, 'чел-ч').confidence).toBe('NONE');
  });

  it('explicit electrode Э42 rejects Э46, Э420, Э42А and missing grade, without weakening brand gates', () => {
    const nom = 'Электроды сварочные Э42';
    const c = catalogue(['Э46', 'Э420', 'Э42А', '', 'Э42'].map(mark => ({ nom: `Электроды сварочные ${mark}`.trim(), birlik: 'кг' })));
    const r = matchResource(c, nom, 'кг');
    expect(r).toMatchObject({ confidence: 'EXACT', gateRejected: 4 });
    expect(r.candidates.map(x => x.row.id)).toEqual([5]);
    expect(characteristics('Электроды марки Э42').electrodeGrade).toBe('Э42');
    expect(characteristics('Электроды Э42А').electrodeGrade).toBe('Э42А');
  });
});

describe('matchResource — observed lime and mesh corpus mismatches', () => {
  it('construction lump quicklime cannot offer a solvent through shared СОРТ 1', () => {
    const nom = 'ИЗВЕСТЬ СТРОИТЕЛЬНАЯ НЕГАШЕНАЯ КОМОВАЯ, СОРТ 1';
    const c = catalogue([{ nom: 'Растворитель, сорт 1', birlik: 'т' }]);
    expect(matchResource(c, nom, 'т')).toMatchObject({ confidence: 'NONE', candidates: [], gateRejected: 1 });
    const exact = catalogue([{ nom, birlik: 'т' }]);
    expect(matchResource(exact, nom, 'т').confidence).toBe('EXACT');
  });

  it('reinforcing mesh does not offer an unknown commercial mesh name', () => {
    const c = catalogue([{ nom: 'Сетка Дыня', birlik: 'м2' }]);
    expect(matchResource(c, 'СЕТКА АРМАТУРНАЯ', 'м2')).toMatchObject({ confidence: 'NONE', candidates: [], gateRejected: 1 });
    const exact = catalogue([{ nom: 'Сетка арматурная', birlik: 'м2', manba_tur: 'kompaniya' }]);
    expect(matchResource(exact, 'СЕТКА АРМАТУРНАЯ', 'м2').confidence).toBe('EXACT');
  });

  it.each(['Сетка пластиковая', 'Сетка декоративная', 'Сетка стекловолоконная', 'Сетка полипропиленовая'])(
    'reinforcing and welded mesh reject %s even with the same unit', nom => {
      const c = catalogue([{ nom, birlik: 'м2' }]);
      for (const source of ['Сетка арматурная', 'Сетка сварная металлическая']) {
        expect(matchResource(c, source, 'м2')).toMatchObject({ confidence: 'NONE', candidates: [], gateRejected: 1 });
      }
    });

  it('explicit fiberglass/plastic qualifiers take precedence over an reinforcing adjective', () => {
    const c = catalogue([
      { nom: 'Сетка арматурная стеклопластиковая A500C Ø12', birlik: 'т' },
      { nom: 'Сетка арматурная пластиковая A500C Ø12', birlik: 'т' },
      { nom: 'Сетка арматурная A500C Ø12', birlik: 'т' },
      { nom: 'Сетка арматурная A500C Ø16', birlik: 'т' },
    ]);
    const r = matchResource(c, 'Сетка арматурная A500C Ø12', 'т');
    expect(r.candidates.map(x => x.row.id)).toEqual([3]);
    expect(r.gateRejected).toBe(3);
  });
});
