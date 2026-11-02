import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TreeNode } from '../../api/types';
vi.mock('@tanstack/react-virtual', () => ({ useVirtualizer: ({ count }: { count: number }) => ({ getTotalSize: () => count * 36, getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * 36, size: 36, key: index })) }) }));
// Modal o'rniga: «saqlandi» ni chaqiruvchi tugma.
vi.mock('../ui/QatorTahrirModal', () => ({ QatorTahrirModal: ({ saqlandi }: { saqlandi: () => void }) => <button type="button" onClick={saqlandi}>modal-saqlandi</button> }));
import { SmetaTree } from './SmetaTree';

const data = [{ id: 1, versiya: 1, type: 'rz', nom: 'Razdel A', smeta: 150, children: [{ id: 2, versiya: 3, type: 'bl', nom: 'Ish A', smetaHajm: 3, children: [] }] }] as unknown as TreeNode[];
afterEach(cleanup);

describe('SmetaTree — qator tahriri', () => {
  it('saqlangach tahrirlangan qator id si uzatiladi (qisman yangilash uchun)', () => {
    const tahrirlandi = vi.fn();
    render(<SmetaTree data={data} onQatorTahrirlandi={tahrirlandi} />);
    fireEvent.click(screen.getByText('Razdel A'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Qatorni tahrirlash' })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'modal-saqlandi' }));
    expect(tahrirlandi).toHaveBeenCalledWith(2);
  });
});
