import { describe, expect, it } from 'vitest';
import type { NormWork } from '../catalog-extraction/norm-catalog';
import { NormMoslash } from './norm-moslash';
import { fayl2bolak, haqiqiyKod, ishMetrika, takrorsiz, type IshJuft, type Matcher } from './moslash-eval';

// SYNTHETIC fixture only: the real approved smetas are read by moslash-eval.local.test.ts from a folder outside the repository.
const J = (id: string, nom: string, kod: string, fayl = 'a.xls', birlik = '100М3'): IshJuft => ({ id, nom, birlik, hajm: 1, kod, bolim: ['Раздел'], fayl });
const W = (id: string, code: string, name: string, unit: string): NormWork =>
  ({ id, code, name, bookType: 'Е', collection: 'Е06', section: null, subsection: null, tableCode: 'T', unitCode: unit });

describe('eval metrics (synthetic)', () => {
  const works = [W('1', 'Е06-01-001-1', 'Устройство бетонной подготовки', '100 м3'), W('2', 'Е06-01-002-1', 'Армирование монолитных конструкций', '1 т'),
    W('3', 'Е06-01-003-1', 'Устройство колонн железобетонных монолитных', '100 м3')];
  const nm = new NormMoslash({ allWorks: () => works, tableLabel: () => null });
  const juftlar: IshJuft[] = [
    J('1', 'УСТРОЙСТВО БЕТОННОЙ ПОДГОТОВКИ', 'E06-01-001-1 ДОП. 3'),          // annotation + Latin E: still the same code
    J('2', 'АРМИРОВАНИЕ МОНОЛИТНЫХ КОНСТРУКЦИЙ', 'Е6-1-2-1', 'b.xls', 'Т'),
    J('3', 'УСТРОЙСТВО КОЛОНН', 'Е06-01-003-1', 'c.xls'),
    J('4', 'Что-то совсем другое', 'Е06-01-099-1', 'd.xls'),                  // code not in the catalogue: always a miss
  ];
  const matcher: Matcher = j => {
    const r = nm.moslash({ nom: j.nom, birlik: j.birlik });
    return { nomzodlar: r.nomzodlar.map(x => ({ id: x.id, kod: x.kod })), tanlangan: r.tanlangan ? { id: r.tanlangan.id, kod: r.tanlangan.kod } : null };
  };
  it('canonical truth code: annotation stripped, zeros and Latin letters folded', () => {
    expect(haqiqiyKod(juftlar[0])).toBe('Е6-1-1-1');
    expect(haqiqiyKod(juftlar[1])).toBe('Е6-1-2-1');
  });
  it('top-1 / top-3 / automation / precision are measured against the used code', () => {
    const m = ishMetrika(juftlar.slice(0, 3), matcher);
    expect(m.n).toBe(3);
    expect(m.top1).toBeGreaterThanOrEqual(0.66);
    expect(m.top3).toBe(1);
    expect(m.ortachaNomzod).toBeLessThanOrEqual(3);
    expect(m.avtoAniqlik).toBeGreaterThanOrEqual(0.5);
    expect(m.ms.ortacha).toBeGreaterThanOrEqual(0);
  });
  it('a wrong auto-selection lowers precision, not coverage', () => {
    const wrong: Matcher = () => ({ nomzodlar: [{ id: 'x', kod: 'Е1-1-1-9' }], tanlangan: { id: 'x', kod: 'Е1-1-1-9' } });
    const m = ishMetrika(juftlar.slice(0, 3), wrong);
    expect(m.avtoulush).toBe(1);
    expect(m.avtoTogri).toBe(0);
    expect(m.avtoAniqlik).toBe(0);
    expect(m.top1).toBe(0);
  });
  it('«not found» is counted when the matcher answers with nothing', () => {
    const m = ishMetrika(juftlar, () => ({ nomzodlar: [], tanlangan: null }));
    expect(m.topilmadi).toBe(1);
  });
  it('the same line repeated in several sheets is counted once; the split is by file', () => {
    const rep = [...juftlar, J('9', 'устройство бетонной подготовки', 'Е06-01-001-1', 'z.xls')];
    expect(takrorsiz(rep)).toHaveLength(juftlar.length);
    const { train, test } = fayl2bolak(juftlar);
    expect(train.length + test.length).toBe(juftlar.length);
    expect(new Set(train.map(j => j.fayl)).size).toBeGreaterThan(0);
    expect(train.some(j => test.some(t => t.fayl === j.fayl))).toBe(false);
  });
});
