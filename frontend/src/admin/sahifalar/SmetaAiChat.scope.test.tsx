import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SmetaAiChat } from './SmetaAiChat';
import { emptyDoc } from '../../lib/smeta-studio/model';

const api = vi.hoisted(() => ({ chat: vi.fn(), pick: vi.fn() }));
vi.mock('../../api/smeta-ai', () => ({ smetachiSuhbat: api.chat, smetachiTanla: api.pick }));
vi.mock('../../i18n/til', () => ({ t: (s: string) => s }));
vi.mock('../../umumiy/ui/ModelChip', () => ({ ModelChip: () => null }));
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks(); });

it('late old-company reply cannot enter the new conversation', async () => {
  let resolve!: (v: unknown) => void;
  api.chat.mockImplementation(() => new Promise(r => { resolve = r; }));
  const props = { doc: emptyDoc('same'), katalog: null, command: vi.fn(), newId: () => 'id' };
  const { rerender } = render(<SmetaAiChat {...props} kompaniyaId={1} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Smetachiga xabar' }), { target: { value: 'fundament' } });
  fireEvent.click(screen.getByRole('button', { name: 'Yuborish' }));
  rerender(<SmetaAiChat {...props} kompaniyaId={2} />);
  await act(async () => resolve({ ok: true, tushunildi: true, javob: 'OLD SECRET', savollar: [], ishlar: [] }));
  expect(screen.queryByText('OLD SECRET')).toBeNull();
  expect(screen.queryByText('fundament')).toBeNull();
  expect(props.command).not.toHaveBeenCalled();
});

it('restored company-scoped conversation survives the initial save effect', () => {
  localStorage.setItem('smeta-ai:1:same', JSON.stringify({ xabarlar: [{ rol: 'user', matn: 'Saved work' }], ishlar: [] }));
  render(<SmetaAiChat doc={emptyDoc('same')} katalog={null} kompaniyaId={1} command={() => true} newId={() => 'id'} />);
  expect(screen.getByText('Saved work')).toBeTruthy();
  expect(localStorage.getItem('smeta-ai:1:same')).toContain('Saved work');
});
