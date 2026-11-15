import { describe, expect, it } from 'vitest';
import type { NormWork } from '../catalog-extraction/norm-catalog';
import { NormMoslash } from './norm-moslash';
import { qisqartmaOch, sinonimlar } from './norm-sinonim';
import { belgilar, stemHash, xotiraBall, xotiraBosh, xotiraQisqartir, xotiraRad, xotiraYoz } from './norm-xotira';

const W = (id: string, code: string, name: string, coll = 'Е06', table = 'T'): NormWork =>
  ({ id, code, name, bookType: 'Е', collection: coll, section: null, subsection: null, tableCode: table, unitCode: '100 м3' });
const WORKS = [W('1', 'Е06-01-001-1', 'Устройство бетонной подготовки'), W('2', 'Е06-01-001-2', 'Устройство бетонных фундаментов под колонны'),
  W('3', 'Е06-01-002-1', 'Устройство ленточных фундаментов'), W('4', 'Е11-01-011-1', 'Устройство стяжек: толщиной 20 мм', 'Е11', 'T5'),
  W('5', 'Е11-01-011-3', 'Устройство стяжек: на каждые 5 мм изменения толщины добавлять или исключать', 'Е11', 'T5')];
const nm = new NormMoslash({ allWorks: () => WORKS, tableLabel: () => null });

describe('company memory: compact counters, never raw text', () => {
  it('stores hashes and counts only', () => {
    const x = xotiraBosh();
    xotiraYoz(x, 'Устройство бетонной подготовки под фундамент', 'Е06-01-001-1');
    const json = JSON.stringify(x);
    expect(json).not.toMatch(/бетон|подготов|фундамент/i);
    expect(x.k['Е6-1-1-1'].n).toBe(1);
    expect(Object.keys(x.k['Е6-1-1-1'].s).length).toBeGreaterThan(2);
    expect(stemHash('подгот')).toBe(stemHash('подгот'));
    expect(belgilar('Бетон #комментарий').length).toBe(1);
  });
  it('same / similar text scores its confirmed code; unrelated text does not', () => {
    const x = xotiraBosh();
    xotiraYoz(x, 'Устройство бетонной подготовки под фундамент', 'Е06-01-001-1');
    xotiraYoz(x, 'Устройство бетонной подготовки под фундамент', 'Е06-01-001-1');
    const same = xotiraBall(x, 'Устройство бетонной подготовки под фундамент');
    expect(same.get('Е6-1-1-1')).toBeGreaterThanOrEqual(0.85);
    expect(xotiraBall(x, 'бетонная подготовка под фундамент').get('Е6-1-1-1')).toBeGreaterThan(0.5);
    expect(xotiraBall(x, 'Оштукатуривание стен').size).toBe(0);
    expect(xotiraBall(null, 'x y z').size).toBe(0);
  });
  it('a rejection lowers the counters; pruning keeps the most used codes', () => {
    const x = xotiraBosh();
    xotiraYoz(x, 'Устройство бетонной подготовки', 'Е06-01-001-1');
    xotiraRad(x, 'Устройство бетонной подготовки', 'Е06-01-001-1');
    expect(xotiraBall(x, 'Устройство бетонной подготовки').size).toBe(0);
    for (let i = 0; i < 5; i++) xotiraYoz(x, `Работа номер ${i} особая`, `Е1-1-${i + 1}-1`);
    xotiraYoz(x, 'Работа номер 4 особая', 'Е1-1-5-1');
    expect(Object.keys(xotiraQisqartir(x, 2).k)).toHaveLength(2);
  });
  it('the memory pulls a confirmed code to the top, even when the wording is unusual', () => {
    const q = { nom: 'Фундамент ленточный бетонирование', birlik: 'м3' };
    const x = xotiraBosh();
    xotiraYoz(x, 'Фундамент ленточный бетонирование', 'Е06-01-001-2');
    const before = nm.qidir(q, 5).findIndex(h => h.d.w.code === 'Е06-01-001-2');
    const after = nm.qidir({ ...q, xotira: x }, 5).findIndex(h => h.d.w.code === 'Е06-01-001-2');
    expect(after).toBeGreaterThanOrEqual(0);
    expect(before < 0 || after <= before).toBe(true);
    expect(nm.qidir({ ...q, xotira: x }, 5).find(h => h.d.w.code === 'Е06-01-001-2')?.sabab).toContain('kompaniya tajribasi');
  });
});

describe('abbreviations, synonyms and table references in the line', () => {
  it('abbreviations are opened and the original stays', () => {
    expect(qisqartmaOch('Установка ж/б плит, толщ. 50 мм')).toContain('железобетонный');
    expect(qisqartmaOch('Установка ж/б плит, толщ. 50 мм')).toContain('толщиной');
    expect(qisqartmaOch('Уст-во покрытий')).toContain('устройство');
    expect(qisqartmaOch('Монтаж м/к каркаса')).toContain('металлоконструкции');
    expect(qisqartmaOch('Грунт гр. 2')).toContain('группа');
  });
  it('everyday words get normative synonyms', () => {
    expect(sinEmpty('Рытье траншей')).toContain('разработка');
    expect(sinEmpty('Забивка пазух')).toContain('засыпка');
    expect(sinEmpty('Бетон')).toBe('');
  });
  it('a norm code written inside the line retrieves its table', () => {
    const r = nm.qidir({ nom: 'ПРИ ИЗМЕНЕНИИ ТОЛЩИНЫ НА КАЖДЫЕ 5 ММ ДОБАВЛЯТЬ К НОРМЕ 11-01-011-01', birlik: '100М3' }, 5);
    expect(r.slice(0, 2).map(h => h.d.w.code)).toContain('Е11-01-011-3');
    expect(r.find(h => h.d.w.code === 'Е11-01-011-3')?.sabab).toContain('jadval shifri qatorda');
  });
  it('section-restricted retrieval adds works of the section collection', () => {
    const k = nm.kontekst({ nom: 'Устройство', birlik: '100М3' });
    const k2 = nm.kengaytir(k, ['Е11']);
    expect(k2.hits.length).toBeGreaterThanOrEqual(k.hits.length);
    expect(nm.kengaytir(k, []).hits).toBe(k.hits);
  });
});

function sinEmpty(s: string) { return sinonimlar(s, {}); }
