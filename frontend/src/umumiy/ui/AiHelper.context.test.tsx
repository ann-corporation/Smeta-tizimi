// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
const m = vi.hoisted(() => ({ id: 11 as number | null, ask: vi.fn() }));
vi.mock('../kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ joriyId: m.id }) }));
vi.mock('../../api/t2-ai', () => ({ t2AiJarvisSavol: m.ask }));
vi.mock('./useAiKuzatuv', () => ({ useAiKuzatuv: () => ({ taklif: null, yoqilgan: false }) }));
vi.mock('./AiFikrPanel', () => ({ AiFikrPanel: () => null }));
vi.mock('../../i18n/til', () => ({ t: (s: string) => s }));
import { AiHelper } from './AiHelper';
const view = () => <MemoryRouter initialEntries={['/admin/f2']}><AiHelper /></MemoryRouter>;
beforeEach(() => { m.id = 11; m.ask.mockReset(); Element.prototype.scrollIntoView = vi.fn(); });
afterEach(cleanup);
function send(text: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', code: 'Enter' });
}
it('salom tanlangan kompaniyada yolg‘on select-company talab qilmaydi', () => {
  render(view()); fireEvent.click(screen.getByLabelText('Jarvis AI yordamchisini ochish'));
  send('salom');
  expect(screen.queryByText(/kontekstini tanlang/)).toBeNull();
  expect(m.ask).not.toHaveBeenCalled();
});
it('savol live provider kompaniya ID bilan yuboriladi, eski storage hisobga olinmaydi', async () => {
  localStorage.setItem('t2_kompaniya_id', '999');
  m.ask.mockResolvedValue({ ok: true, javob: 'Dalilli javob' });
  render(view()); fireEvent.click(screen.getByLabelText('Jarvis AI yordamchisini ochish')); send('F2 qancha?');
  expect(m.ask).toHaveBeenCalledWith(11, 'F2 qancha?');
  expect(await screen.findByText('Dalilli javob')).toBeTruthy();
});
it('A → B → A almashish eski async javobni va suhbatni qaytarmaydi', async () => {
  let resolve!: (v: unknown) => void;
  m.ask.mockReturnValue(new Promise(r => { resolve = r; }));
  const r = render(view()); fireEvent.click(screen.getByLabelText('Jarvis AI yordamchisini ochish')); send('A maxfiy savol');
  m.id = 22; r.rerender(view());
  expect(screen.queryByText('A maxfiy savol')).toBeNull();
  m.id = 11; r.rerender(view());
  await act(async () => { resolve({ ok: true, javob: 'Eski A javobi' }); });
  expect(screen.queryByText('Eski A javobi')).toBeNull();
});
it('production helper canonical provider ichida, global helper admin yo‘lida takrorlanmaydi', () => {
  const shell = readFileSync('src/admin/AdminShell.tsx', 'utf8');
  expect(shell).toMatch(/<KompaniyaProvider>[\s\S]*<AiHelper\s*\/>[\s\S]*<\/KompaniyaProvider>/);
  expect(readFileSync('src/App.tsx', 'utf8')).toContain("pathname.startsWith('/admin/') ? null : <AiHelper />");
});
