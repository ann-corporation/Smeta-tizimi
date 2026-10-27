import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TreeNode } from '../../api/types';
vi.mock('@tanstack/react-virtual', () => ({ useVirtualizer: ({ count }: { count: number }) => ({ getTotalSize: () => count * 36, getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * 36, size: 36, key: index })) }) }));
vi.mock('../ui/QatorTahrirModal', () => ({ QatorTahrirModal: () => null }));
import { SmetaTree } from './SmetaTree';

const data = [
  { id: 1, type: 'rz', nom: 'Razdel A', children: [
    { id: 2, type: 'bl', nom: 'Ish A', birlik: 'kub', smetaHajm: 3, fakt: 1, f2ol: 0 },
    { id: 3, type: 'bl', nom: 'Ish B', birlik: 'tonna', smetaHajm: 5, fakt: 0, f2ol: 0 },
  ] },
  { id: 4, type: 'rz', nom: 'Razdel C', children: [{ id: 5, type: 'bl', nom: 'Ish C', birlik: 'tonna', smetaHajm: 1, fakt: 0, f2ol: 0 }] },
] as unknown as TreeNode[];
afterEach(cleanup);

describe('LRV smeta daraxti — Excel uslubidagi ustun filtri', () => {
  it('birlik bo‘yicha filtr: mos ish otasi bilan ochiq ko‘rinadi, boshqa razdel yo‘qoladi; yig‘ish va tozalash ishlaydi', () => {
    render(<SmetaTree data={data} />);
    expect(screen.queryByText('Ish A')).toBeNull(); // boshlang'ich holat — yig'ilgan
    const tugmalar = screen.getAllByRole('button', { name: 'Ustun filtri' });
    expect(tugmalar.length).toBeGreaterThanOrEqual(9);
    fireEvent.click(tugmalar[2]); // kod, nom, birlik
    const oyna = screen.getByRole('dialog');
    fireEvent.click(within(within(oyna).getByText('tonna').closest('label')!).getByRole('checkbox'));
    fireEvent.click(within(oyna).getByRole('button', { name: 'Qo‘llash' }));
    expect(screen.getByText('Razdel A')).toBeTruthy();
    expect(screen.getByText('Ish A')).toBeTruthy();
    expect(screen.queryByText('Ish B')).toBeNull();
    expect(screen.queryByText('Razdel C')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('1 / 3');
    fireEvent.click(screen.getByText('Razdel A'));
    expect(screen.queryByText('Ish A')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Filtrlarni tozalash' }));
    expect(screen.getByText('Razdel C')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('qidiruv bilan VA: qidiruv natijasi ichida ustun filtri qo‘llanadi', () => {
    render(<SmetaTree data={data} />);
    fireEvent.change(screen.getByLabelText('Daraxtdan qidirish'), { target: { value: 'Ish' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Ustun filtri' })[2]);
    const oyna = screen.getByRole('dialog');
    fireEvent.click(within(within(oyna).getByText('kub').closest('label')!).getByRole('checkbox'));
    fireEvent.click(within(oyna).getByRole('button', { name: 'Qo‘llash' }));
    expect(screen.queryByText('Ish A')).toBeNull();
    expect(screen.getByText('Ish B')).toBeTruthy();
    expect(screen.getByText('Ish C')).toBeTruthy();
  });
});
