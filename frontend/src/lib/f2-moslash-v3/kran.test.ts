import { describe, expect, it } from 'vitest';
import { f2MoslashV3, gradeFarq, type SmetaQator } from './index';
import { boshlangich, ishniBogla, smetaIndeks } from './ishJoyi';
import type { F2Tugun } from '../smeta-anatomiya/f2';

const short = 'КРАНЫ НА АВТОМОБИЛЬНОМ ХОДУ ПРИ РАБОТЕ НА ДРУГИХ ВИДАХ СТРОИТЕЛЬСТВА 10 Т';
const full = short.replace(' 10 Т', ' (КРОМЕ МАГИСТРАЛЬНЫХ ТРУБОПРОВОДОВ) 10 Т');
const resource: F2Tugun = { uid: 'crane', tur: 'rs', nom: short, kod: null, birlik: 'МАШ-Ч', hajm: 2,
  narx: null, summa: null, yol: ['ФУНДАМЕНТ'], bolalar: [], barg: true, manzil: { fayl: 'f', varaq: 'A', qator: 2 } };
const work: F2Tugun = { ...resource, uid: 'work', tur: 'bl', nom: 'УСТРОЙСТВО ФУНДАМЕНТОВ', kod: 'E6-1-1-22', birlik: '100М3', bolalar: [resource], barg: false };
const rows: SmetaQator[] = [
  { id: 1, otaId: null, tur: 'bl', nom: work.nom, kod: work.kod, birlik: work.birlik, hajm: 2 },
  { id: 2, otaId: 1, tur: 'rs', nom: full, kod: '000762', birlik: 'МАШ-Ч', hajm: 2 },
];
const empty = () => ({ bog: new Map(), otkaz: new Set<string>() });
describe('construction crane matching within confirmed work', () => {
  it('matches observed full names with optional pipeline exclusion, automatic and manual parent paths', () => {
    const n = f2MoslashV3([work], rows, { ishBog: new Map([['work', 1]]) });
    expect(n.natijalar.get('crane')).toMatchObject({ holat: 'aniq', qatorId: 2 });
    expect(ishniBogla(empty(), work, 1, smetaIndeks(rows)).ij.bog.get('crane')?.qatorId).toBe(2);
  });
  it.each([
    full.replace('10 Т', '16 Т'), full.replace('АВТОМОБИЛЬНОМ', 'ГУСЕНИЧНОМ'),
    'КРАНЫ НА АВТОМОБИЛЬНОМ ХОДУ ПРИ РАБОТЕ НА МОНТАЖЕ ТЕХНОЛОГИЧЕСКОГО ОБОРУДОВАНИЯ 10 Т',
  ])('does not automatically link different capacity/chassis/use even with the same code: %s', (name) => {
    const f = { ...work, bolalar: [{ ...resource, kod: '000762' }] };
    const s = [rows[0], { ...rows[1], nom: name }];
    expect(gradeFarq(short, name)).toBe(true);
    expect(ishniBogla(empty(), f, 1, smetaIndeks(s)).ij.bog.has('crane')).toBe(false);
    expect(f2MoslashV3([f], s, { ishBog: new Map([['work', 1]]) }).natijalar.get('crane')?.holat).toBe('topilmadi');
  });
  it('does not pick an arbitrary duplicate or borrow a crane from another work', () => {
    const duplicate = [...rows, { ...rows[1], id: 3 }];
    expect(ishniBogla(empty(), work, 1, smetaIndeks(duplicate)).ij.bog.has('crane')).toBe(false);
    const elsewhere = [rows[0], { ...rows[1], otaId: 9 }];
    expect(ishniBogla(empty(), work, 1, smetaIndeks(elsewhere)).ij.bog.has('crane')).toBe(false);
  });
  it('uses explicit source/estimate norms to distinguish duplicate cranes, never price or partial volume', () => {
    const s = [rows[0], { ...rows[1], norma: 0.1, narx: 200 }, { ...rows[1], id: 3, norma: 0.12, narx: 200 }];
    const f = { ...work, bolalar: [{ ...resource, norma: 0.12, hajm: -0.070536 }] };
    expect(ishniBogla(empty(), f, 1, smetaIndeks(s)).ij.bog.get('crane')?.qatorId).toBe(3);
    expect(f2MoslashV3([f], s, { ishBog: new Map([['work', 1]]) }).natijalar.get('crane')).toMatchObject({ qatorId: 3, holat: 'aniq' });
    const unknown = s.map(r => ({ ...r, norma: null }));
    expect(ishniBogla(empty(), f, 1, smetaIndeks(unknown)).ij.bog.has('crane')).toBe(false);
    const equal = s.map(r => ({ ...r, norma: 0.12 }));
    expect(ishniBogla(empty(), f, 1, smetaIndeks(equal)).ij.bog.has('crane')).toBe(false);
  });
  it('repeated match preserves previous confirmed links and explicit omissions', () => {
    const previous = { bog: new Map([['work', { qatorId: 1, holat: 'qolda' as const, usul: 'qolda' }]]), otkaz: new Set(['crane']) };
    const n = f2MoslashV3([work], rows, { ishBog: new Map([['work', 1]]) });
    expect(boshlangich(n, previous).bog.get('work')).toEqual(previous.bog.get('work'));
    expect(boshlangich(n, previous).otkaz.has('crane')).toBe(true);
  });
});
