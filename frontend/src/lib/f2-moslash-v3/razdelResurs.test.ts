import { describe, expect, it } from 'vitest';
import type { F2Tugun } from '../smeta-anatomiya/f2';
import { f2MoslashV3, razdelResursiTop, type SmetaQator } from './index';
import { boshlangich, f2Indeks, ishlarResurslariniBogla, ishniBogla, smetaIndeks, type IshJoyi } from './ishJoyi';

// Sintetik: ishning materiallari smetada ish OSTIDA emas, o'sha razdelda mustaqil qator (LRV tuzilmasi).
const man = { varaq: 'v', qator: 1, ustun: 1 };
function tugun(p: Partial<F2Tugun> & { uid: string; tur: F2Tugun['tur'] }): F2Tugun {
  return { kod: null, nom: p.uid, birlik: null, hajm: null, narx: null, summa: null, norma: null, bolalar: [], barg: false, yol: [], manzil: man, ...p } as unknown as F2Tugun;
}
const sq = (id: number, otaId: number | null, tur: string, kod: string | null, nom: string, birlik: string | null, hajm: number | null, tartib: number): SmetaQator =>
  ({ id, otaId, tur, kod, nom, birlik, hajm, narx: 10, tartib });

const smeta: SmetaQator[] = [
  sq(1, null, 'rz', null, 'ФУНДАМЕНТ А', null, null, 1),
  sq(2, 1, 'bl', 'X1-1-1', 'ВЯЗКА КАРКАСОВ', 'Т', 4, 2),
  sq(3, 2, 'rs', '1', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 10, 3),
  sq(4, 1, 'mat', 'М-100', 'СТАЛЬ ПРУТКОВАЯ ТИП 1', 'Т', 4, 4),
  sq(5, 1, 'mat', 'М-200', 'СЕТКА ТИП 2', 'Т', 7, 5),
  sq(6, 1, 'mat', 'М-200', 'СЕТКА ТИП 2', 'Т', 1.5, 6),
  sq(10, null, 'rz', null, 'ФУНДАМЕНТ Б', null, null, 10),
  sq(11, 10, 'bl', 'X1-1-1', 'ВЯЗКА КАРКАСОВ', 'Т', 2, 11),
  sq(12, 10, 'mat', 'М-300', 'ПРОВОЛОКА', 'Т', 2, 12),
];
const res = (uid: string, kod: string, nom: string, hajm: number) => tugun({ uid, tur: 'rs', texnikBelgi: 'rs', kod, nom, birlik: 'Т', hajm, barg: true });
const ish = (uid: string, bolalar: F2Tugun[]) => tugun({ uid, tur: 'bl', kod: 'X1-1-1', nom: 'ВЯЗКА КАРКАСОВ', birlik: 'Т', hajm: 4, bolalar,
  yol: ['ФУНДАМЕНТ А'] });

describe('razdel darajasidagi mustaqil resurs (ishdan tashqari)', () => {
  it('ish ichida yo‘q — shu razdeldagi aynan yagona mustaqil qator ✓ (F2 belgisi rs, smetada mat)', () => {
    const f2 = [tugun({ uid: 'z', tur: 'rz', nom: 'ФУНДАМЕНТ А', bolalar: [ish('w', [res('r1', 'М-100', 'СТАЛЬ ПРУТКОВАЯ ТИП 1', 2)])] })];
    const n = f2MoslashV3(f2, smeta);
    expect(n.natijalar.get('w')).toMatchObject({ holat: 'aniq', qatorId: 2 });
    expect(n.natijalar.get('r1')).toMatchObject({ holat: 'aniq', qatorId: 4, usul: 'razdel_ichida' });
  });

  it('bir nechta aynan qator: F2 hajmi bittasiga teng bo‘lsa ✓, aks holda ◐ eng yaqini', () => {
    const f2 = [tugun({ uid: 'z', tur: 'rz', nom: 'ФУНДАМЕНТ А', bolalar: [ish('w', [res('a', 'М-200', 'СЕТКА ТИП 2', 1.5), res('b', 'М-200', 'СЕТКА ТИП 2', 3)])] })];
    const n = f2MoslashV3(f2, smeta);
    expect(n.natijalar.get('a')).toMatchObject({ holat: 'aniq', qatorId: 6 });
    expect(n.natijalar.get('b')).toMatchObject({ holat: 'taklif', usul: 'razdel_ichida_taklif' });
  });

  it('boshqa razdeldagi mustaqil qator olinmaydi (ota-ish doirasi)', () => {
    const f2 = [tugun({ uid: 'z', tur: 'rz', nom: 'ФУНДАМЕНТ А', bolalar: [ish('w', [res('r', 'М-300', 'ПРОВОЛОКА', 2)])] })];
    const n = f2MoslashV3(f2, smeta);
    expect(n.natijalar.get('r')?.holat).toBe('topilmadi');
    expect(razdelResursiTop({ kod: 'М-300', nom: 'ПРОВОЛОКА', birlik: 'Т', norma: null, hajm: 2 }, smeta[1], (x) => smeta.find((s) => s.id === x.otaId),
      (x) => smeta.filter((s) => s.otaId === x.id))).toBeNull();
  });

  it('birlik farqli bo‘lsa olinmaydi', () => {
    const r = tugun({ uid: 'r', tur: 'rs', kod: 'М-100', nom: 'СТАЛЬ ПРУТКОВАЯ ТИП 1', birlik: 'КГ', hajm: 2, barg: true });
    const n = f2MoslashV3([tugun({ uid: 'z', tur: 'rz', nom: 'ФУНДАМЕНТ А', bolalar: [ish('w', [r])] })], smeta);
    expect(n.natijalar.get('r')?.holat).toBe('topilmadi');
  });

  it('operator ishni bog‘lasa (ishniBogla / ishlarResurslariniBogla) ham razdeldagi mustaqil resurs olinadi', () => {
    const w = ish('w', [res('r1', 'М-100', 'СТАЛЬ ПРУТКОВАЯ ТИП 1', 2)]);
    const ind = f2Indeks([tugun({ uid: 'z', tur: 'rz', nom: 'ФУНДАМЕНТ А', bolalar: [w] })]);
    const S = smetaIndeks(smeta);
    const bosh: IshJoyi = { bog: new Map(), otkaz: new Set() };
    expect(ishniBogla(bosh, w, 2, S).ij.bog.get('r1')).toMatchObject({ qatorId: 4, usul: 'razdel_ichida' });
    const ij0: IshJoyi = { bog: new Map([['w', { qatorId: 2, holat: 'aniq', usul: 'x' }]]), otkaz: new Set() };
    expect(ishlarResurslariniBogla(ij0, ind, S).ij.bog.get('r1')).toMatchObject({ qatorId: 4, usul: 'razdel_ichida' });
    expect(boshlangich(f2MoslashV3([tugun({ uid: 'z', tur: 'rz', nom: 'ФУНДАМЕНТ А', bolalar: [w] })], smeta)).bog.get('r1')?.qatorId).toBe(4);
  });
});
