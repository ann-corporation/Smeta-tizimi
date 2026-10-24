import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({ takl: vi.fn(), narxla: vi.fn() }));
vi.mock('../../api/t2-ish-abc', () => ({ narxTakliflari: m.takl }));
vi.mock('../../api/t2-smeta-narxlash', () => ({ sbT2SmetaNarxlaRes: m.narxla }));
vi.mock('../../umumiy/ui/SummaJuft', () => ({ SummaJuft: ({ ustamasiz }: { ustamasiz: number }) => <span data-testid="summa">{ustamasiz}</span> }));

import { FaktNarxlash } from './FaktNarxlash';

const qator = { id: 3, nom: 'Qum', birlik: 'м3', kat: 'МАТ', fakt: 2, smeta: 10 };
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('FaktNarxlash', () => {
  it('manbalar tartiblanadi, Enter tanlangan narxni yozadi; summa fakt*narx', async () => {
    m.takl.mockResolvedValue([[{ manba: 'katalog', narx: 90, izoh: 'k' }, { manba: 'smeta_obyekt', narx: 100, izoh: 's' }, { manba: 'smeta_obyekt', narx: 100, izoh: 's2' }]]);
    m.narxla.mockResolvedValue({ ok: true, yozildi: 2 });
    const saq = vi.fn();
    render(<FaktNarxlash kompaniyaId={1} obyektId={8} qator={qator} onYop={vi.fn()} onSaqlandi={saq} />);
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
    expect(screen.getAllByRole('option')[0].textContent).toContain('100');
    expect(screen.getAllByTestId('summa')[0].textContent).toBe('200');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });
    await waitFor(() => expect(m.narxla).toHaveBeenCalledWith(expect.objectContaining({ kompaniyaId: 1, obyektId: 8, narxlar: [{ nom: 'Qum', birlik: 'м3', narx: 100 }] })));
    await waitFor(() => expect(saq).toHaveBeenCalled());
  });

  it('manba bo‘lmasa narx to‘qilmaydi; qo‘lda narx yoziladi', async () => {
    m.takl.mockResolvedValue([[]]);
    m.narxla.mockResolvedValue({ ok: true, yozildi: 1 });
    render(<FaktNarxlash kompaniyaId={1} obyektId={8} qator={qator} onYop={vi.fn()} onSaqlandi={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Qidirilmoqda…')).toBeNull());
    expect((screen.getByRole('button', { name: /Narxni yozish/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });
    expect(m.narxla).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Qo‘lda narx'), { target: { value: '55,5' } });
    fireEvent.click(screen.getByRole('button', { name: /Narxni yozish/ }));
    await waitFor(() => expect(m.narxla).toHaveBeenCalledWith(expect.objectContaining({ narxlar: [{ nom: 'Qum', birlik: 'м3', narx: 55.5 }] })));
  });
});