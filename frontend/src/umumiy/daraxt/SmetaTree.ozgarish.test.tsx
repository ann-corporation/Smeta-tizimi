import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TreeNode } from '../../api/types';
vi.mock('@tanstack/react-virtual', () => ({ useVirtualizer: ({ count }: { count: number }) => ({ getTotalSize: () => count * 36, scrollToIndex: () => {}, getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * 36, size: 36, key: index })) }) }));
vi.mock('../ui/QatorTahrirModal', () => ({ QatorTahrirModal: () => null }));
import { SmetaTree } from './SmetaTree';

const n = (id: number, nom: string, o: Partial<TreeNode> = {}): TreeNode => ({ id, type: 'bl', nom, birlik: 'м2', smetaHajm: 1, fakt: 0, f2ol: 0, ...o } as TreeNode);
const data = [
  { id: 1, type: 'rz', nom: 'Razdel', ozgarishGuruh: 'asl', children: [
    n(2, 'Asl ish', { ozgarishGuruh: 'asl', qoldiq: 4, almashtirganlar: [{ id: 3, poz: 2, nom: 'Zamena ishi' }] }),
    n(3, 'Zamena ishi', { ozgarishGuruh: 'zamena', ozgarishOzi: 'REPLACEMENT', isZamena: true, almashtiradi: { id: 2, poz: 1, nom: 'Asl ish' } }),
    n(4, 'Qo‘shimcha ishi', { ozgarishGuruh: 'qoshimcha', ozgarishOzi: 'ADDITIONAL', isQosh: true }),
  ] },
] as unknown as TreeNode[];
const avvalgi = [n(90, 'Eski versiya ishi', { avvalgiVersiya: 'V1' })];
afterEach(cleanup);

describe('LRV daraxti — qo‘shimcha / zamena belgilari va filtrlari', () => {
  it('Asl smeta / Qo‘shimcha / Zamena filtrlari qatorlarni guruh bo‘yicha ajratadi; belgilar ko‘rinadi', () => {
    render(<SmetaTree data={data} avvalgiVersiya={avvalgi} />);
    fireEvent.click(screen.getByRole('button', { name: /^Qo‘shimcha/ }));
    expect(screen.getByText('Qo‘shimcha ishi')).toBeTruthy();
    expect(screen.queryByText('Zamena ishi')).toBeNull();
    expect(screen.getByText('QO‘SHIMCHA')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Zamena\d/ }));
    expect(screen.getByText('Zamena ishi')).toBeTruthy();
    expect(screen.getByText('Asl ish')).toBeTruthy(); // almashtirilgan asl — zamena yonida
    expect(screen.queryByText('Qo‘shimcha ishi')).toBeNull();
    expect(screen.getByText(/← poz\. 1: Asl ish/)).toBeTruthy();
    expect(screen.getByText(/ALMASHTIRILGAN → poz\. 2/)).toBeTruthy();
    expect(screen.getByText(/qoldiq: 4/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Asl smeta/ }));
    expect(screen.getByText('Asl ish')).toBeTruthy();
    expect(screen.queryByText('Zamena ishi')).toBeNull();
    expect(screen.queryByText('Qo‘shimcha ishi')).toBeNull();
    expect(screen.queryByText('Eski versiya ishi')).toBeNull();
  });

  it('avvalgi (almashtirilgan) versiya faqat alohida filtrda, kulrang belgi bilan', () => {
    render(<SmetaTree data={data} avvalgiVersiya={avvalgi} />);
    fireEvent.click(screen.getByRole('button', { name: /^Avvalgi versiya/ }));
    expect(screen.getByText('Eski versiya ishi')).toBeTruthy();
    expect(screen.getByText('AVVALGI VERSIYA')).toBeTruthy();
    expect(screen.queryByText('Razdel')).toBeNull();
  });
});
