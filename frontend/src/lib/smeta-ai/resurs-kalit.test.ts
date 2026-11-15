import { describe, expect, it } from 'vitest';
import { birlikKalit, ishKodKalit, kodKalit, mehnatMi, nomKalit, resurslarniBirlashtir, resursKaliti } from './resurs-kalit';

describe('kodKalit — formatting-only canonical code', () => {
  it('leading zeros and separators do not make a new code', () => {
    expect(kodKalit('00001')).toBe('1');
    expect(kodKalit('1')).toBe('1');
    expect(kodKalit('Е01-01-001-1')).toBe('Е1-1-1-1');
    expect(kodKalit('Е1.1.1.1')).toBe('Е1-1-1-1');
    expect(kodKalit('С101-0025')).toBe('С101-25');
  });
  it('Latin look-alikes fold to Cyrillic', () => {
    expect(kodKalit('C101-0025')).toBe(kodKalit('С101-0025'));
    expect(kodKalit('E8-2-1-1')).toBe(kodKalit('Е08-02-001-1'));
    expect(kodKalit(' с101 25 ')).toBe('С101-25');
  });
  it('different codes stay different, empty is null', () => {
    expect(kodKalit('С101-25')).not.toBe(kodKalit('С101-26'));
    expect(kodKalit('Е6-1-1')).not.toBe(kodKalit('Ц6-1-1'));
    expect(kodKalit('')).toBeNull();
    expect(kodKalit(null)).toBeNull();
    expect(kodKalit(' - ')).toBeNull();
    expect(kodKalit('100')).toBe('100');
  });
});

describe('ishKodKalit — norm code inside a smeta shifr cell', () => {
  it('drops annotations and expands the fused collection+section form', () => {
    expect(ishKodKalit('E16-2-12-8 ШHК.ДОП.15')).toBe('Е16-2-12-8');
    expect(ishKodKalit('Е0101-009-08 ДОП. 3')).toBe('Е1-1-9-8');
    expect(ishKodKalit('Е01-01-009-8')).toBe('Е1-1-9-8');
    expect(ishKodKalit('E1-2-57-1 К=0,41')).toBe('Е1-2-57-1');
    expect(ishKodKalit('Е0601-041-09 ДОП. 11 ГОСАРХИТЕКТСТРОЙ РУЗ ПР. № 429')).toBe('Е6-1-41-9');
  });
  it('non-norm codes are not norm codes', () => {
    expect(ishKodKalit('С101-0025')).toBeNull();
    expect(ishKodKalit('12-502-1')).toBeNull();
    expect(ishKodKalit('')).toBeNull();
    expect(ishKodKalit(null)).toBeNull();
  });
});

describe('nomKalit / birlikKalit', () => {
  it('name decoration is ignored but words are kept', () => {
    expect(nomKalit('  Цемент «М400», мешок ')).toBe('ЦЕМЕНТ М400 МЕШОК');
    expect(nomKalit('Песок Ёлочный')).toBe(nomKalit('песок елочный'));
    expect(nomKalit('Бетон B15')).toBe(nomKalit('Бетон В15'));
  });
  it('unit spellings agree', () => {
    expect(birlikKalit('м³')).toBe('М3');
    expect(birlikKalit('м3')).toBe(birlikKalit('куб.м'));
    expect(birlikKalit('шт.')).toBe(birlikKalit('1 шт.'));
    expect(birlikKalit('тн')).toBe('Т');
    expect(birlikKalit('чел.-ч')).toBe(birlikKalit('чел-ч'));
  });
});

describe('resursKaliti / resurslarniBirlashtir', () => {
  it('the owner example: 00001 and 1 «Затраты труда» are one labour resource', () => {
    const a = resursKaliti({ kod: '00001', nom: 'Затраты труда', birlik: 'чел.-ч' });
    const b = resursKaliti({ kod: '1', nom: 'Затраты  труда', birlik: 'чел-ч' });
    expect(a.kalit).toBe(b.kalit);
    expect(a.asos).toBe('mehnat');
    expect(mehnatMi('Затраты труда машинистов')).toBe(true);
    expect(mehnatMi('Цемент')).toBe(false);
  });
  it('labour and machinist hours stay two resources', () => {
    expect(resursKaliti({ kod: '1', nom: 'Затраты труда', birlik: 'чел-ч' }).kalit)
      .not.toBe(resursKaliti({ kod: '2', nom: 'Затраты труда машинистов', birlik: 'чел-ч' }).kalit);
  });
  it('material codes that differ only by format merge; real different codes do not', () => {
    const g = resurslarniBirlashtir([
      { kod: 'С101-0025', nom: 'Цемент М400', birlik: 'т', narx: 1 },
      { kod: 'C101-25', nom: 'Цемент  М400', birlik: 'тн', narx: 1 },
      { kod: 'С101-26', nom: 'Цемент М500', birlik: 'т', narx: 2 },
    ]);
    expect(g).toHaveLength(2);
    expect(g[0].qatorlar).toHaveLength(2);
    expect(g[0].kodlar).toEqual(['С101-0025', 'C101-25']);
  });
  it('short running numbers are row markers: the name decides; no code → name+unit', () => {
    const k = (kod: string | null, nom: string, birlik: string) => resursKaliti({ kod, nom, birlik }).kalit;
    expect(k('1', 'Кирпич', 'шт')).toBe(k(null, 'Кирпич', 'шт'));
    expect(k('2', 'Кирпич', 'шт')).not.toBe(k('2', 'Песок', 'м3'));
    expect(k(null, 'Песок', 'м3')).not.toBe(k(null, 'Песок', 'т'));
  });
});
