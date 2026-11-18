import { beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { YordamchiTaklif } from '../../umumiy/ui/yordamchi/YordamchiTaklif';
import { f2PreviewCard } from './f2-preview-card';
import { f2Tasdiq } from '../../api/f2-buyruq';
vi.mock('../../api/f2-buyruq', () => ({ f2Tasdiq: vi.fn() }));
beforeEach(() => vi.mocked(f2Tasdiq).mockReset());

it('requires the manual second confirmation in the real card', async () => {
  const card = f2PreviewCard(17, { holat: 'tasdiq_kerak', token: 'synthetic-token', tavsif: 'Qoralama' });
  const done = vi.fn();
  vi.mocked(f2Tasdiq).mockResolvedValue({ ok: true });
  render(createElement(YordamchiTaklif, { taklif: card, onTugadi: done }));
  fireEvent.click(screen.getByRole('button', { name: 'Bajarish' }));
  expect(f2Tasdiq).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Tasdiqlayman' }));
  await waitFor(() => expect(done).toHaveBeenCalledWith(['Yozildi']));
  expect(f2Tasdiq).toHaveBeenCalledExactlyOnceWith(17, 'synthetic-token');
});

it('does not write until the manual confirmation card invokes its executor', async () => {
  const preview = { ok: true, holat: 'tasdiq_kerak' as const, token: 'synthetic-token', tavsif: 'Qoralama' };
  const card = f2PreviewCard(17, preview);
  expect(card.vositalar.pul?.(card.amallar[0])).toBe(true);
  expect(f2Tasdiq).not.toHaveBeenCalled();
  vi.mocked(f2Tasdiq).mockResolvedValue({ ok: true });
  expect(await card.vositalar.bajar(card.amallar)).toEqual(['Yozildi']);
  expect(f2Tasdiq).toHaveBeenCalledWith(17, preview.token);
});
