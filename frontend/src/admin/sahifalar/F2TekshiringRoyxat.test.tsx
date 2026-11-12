import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { F2TekshiringRoyxat, tekshiringQatorlari } from './F2TekshiringRoyxat';
import type { IshJoyi } from '../../lib/f2-moslash-v3/ishJoyi';
import type { F2Tugun } from '../../lib/smeta-anatomiya/f2';

// Sintetik F2 qatorlari; tarmoq yo'q.
const tugun = (uid: string, tur: F2Tugun['tur'], nom: string): F2Tugun => ({ uid, tur, kod: null, nom, birlik: 'м3', hajm: 1, narx: null, summa: null, bolalar: [] } as unknown as F2Tugun);
const rz = tugun('r', 'rz', 'Razdel');
const a = tugun('a', 'bl', 'Ish A aniq');
const b = tugun('b', 'bl', 'Ish B taklif');
const c = tugun('c', 'bl', 'Ish C topilmadi');
const res = tugun('res', 'mat', 'Resurs ish ichida');
const qatorlar = [a, b, c, res];
const ota = new Map<string, F2Tugun | null>([['a', rz], ['b', rz], ['c', rz], ['res', c]]);
const ij = (): IshJoyi => ({ bog: new Map([['a', { qatorId: 1, holat: 'aniq', usul: 'x' }], ['b', { qatorId: 2, holat: 'taklif', usul: 'x' }]]), otkaz: new Set() });

afterEach(cleanup);

describe('F2TekshiringRoyxat', () => {
  it('faqat ◐ va ✕ ishlar; ish ichidagi resurs ro‘yxatga kirmaydi; ✓ kirmaydi', () => {
    const r = tekshiringQatorlari(qatorlar, ota, ij());
    expect(r.map((x) => [x.f.uid, x.holat])).toEqual([['b', 'taklif'], ['c', 'topilmadi']]);
  });

  it('qisqa ro‘yxat: sonlar + ✕ avval; hech narsa yozilmasligi matnda aytiladi', () => {
    render(<F2TekshiringRoyxat qatorlar={qatorlar} ota={ota} ij={ij()} />);
    const q = screen.getAllByTestId('f2-tekshiring-qator').map((x) => x.textContent);
    expect(q[0]).toContain('Ish C topilmadi');
    expect(q[1]).toContain('Ish B taklif');
    expect(screen.getByTestId('f2-tekshiring').textContent).toContain('◐ 1');
    expect(screen.getByTestId('f2-tekshiring').textContent).toContain('yozish faqat siz tasdiqlaganingizda');
  });

  it('hammasi ✓ bo‘lsa — tekshiradigan qator yo‘q xabari', () => {
    const toza: IshJoyi = { bog: new Map([['a', { qatorId: 1, holat: 'aniq', usul: 'x' }], ['b', { qatorId: 2, holat: 'xotira', usul: 'x' }], ['c', { qatorId: 3, holat: 'aniq', usul: 'x' }]]), otkaz: new Set() };
    render(<F2TekshiringRoyxat qatorlar={qatorlar} ota={ota} ij={toza} />);
    expect(screen.queryAllByTestId('f2-tekshiring-qator')).toHaveLength(0);
    expect(screen.getByTestId('f2-tekshiring').textContent).toContain('Tekshiradigan qator yo‘q');
  });
});
