// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const m = vi.hoisted(() => ({ rol: 'usta', savol: vi.fn(), kasbOl: vi.fn() }));
vi.mock('../kontekst/KompaniyaKontekst', () => ({
  useKompaniya: () => ({
    joriyId: 5, superadmin: false, kompaniyalar: [{}, {}], foydalanuvchi: { id: 7, ism: 'Sinov Boss', login: 'sinov_boss' },
    joriy: { id: 5, nom: 'Sinov Qurilish MChJ', rol: m.rol, turi: 'tashkilot', permissions: ['fakt.read'] },
  }),
}));
vi.mock('../../api/t2-agent-ish', () => ({
  kasbOl: m.kasbOl, kasbSavolOqim: m.savol, jurnalOl: vi.fn(async () => ({ ok: true, natija: { hamma: false, natija: [] } })),
  shaxsiyOl: vi.fn(async () => ({ ok: true, natija: { til: 'auto', uslub: 'qisqa', ishonch: 'jiddiy' } })), shaxsiySaqla: vi.fn(),
  harakatQarori: vi.fn(), harakatNatijasi: vi.fn(),
  modellarOl: vi.fn(async () => ({ ok: false, error: 'yoq' })), modelShaxsiyOl: vi.fn(async () => ({ ok: false, error: 'yoq' })), modelShaxsiyTanla: vi.fn(), modelSiyosatOl: vi.fn(async () => ({ ok: false, error: 'yoq' })),
  uslubOl: vi.fn(async () => ({ ok: false, error: 'yoq' })), uslubSaqla: vi.fn(), uslubTozala: vi.fn(), tizimYordamSavol: vi.fn(),
}));
vi.mock('./useAiKuzatuv', () => ({ useAiKuzatuv: () => ({ taklif: null, yoqilgan: false, almashtir: vi.fn() }) }));
vi.mock('./AiFikrPanel', () => ({ AiFikrPanel: () => <div>fikr-panel</div> }));
vi.mock('../../i18n/til', () => ({ t: (s: string, p?: Record<string, string | number>) => (p ? s.replace(/\{(\w+)\}/g, (_, k) => String(p[k])) : s) }));
import { AiHelper, AiHelperTugma } from './AiHelper';
import { yordamchiSahifalarniOrnat } from '../../lib/yordamchi/sahifa-store';

const KASB = { rol: 'usta', profil: 'usta', nom: 'Usta yordamchisi', vazifa: 'Bugungi ishlar.', kategoriyalar: ['obyektlar'], namuna_savollar: ['Bugun nima qilaman?'], taqiq_izoh: null };
const view = () => <MemoryRouter initialEntries={['/admin/fakt']}><AiHelperTugma /><AiHelper /></MemoryRouter>;
const och = () => fireEvent.click(screen.getByLabelText('Jarvis AI yordamchisini ochish'));
const send = (text: string) => { fireEvent.change(screen.getByRole('textbox'), { target: { value: text } }); fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', code: 'Enter' }); };

beforeEach(() => {
  m.rol = 'usta'; m.savol.mockReset(); m.kasbOl.mockReset(); m.kasbOl.mockResolvedValue({ ok: true, natija: KASB });
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.clear(); sessionStorage.clear(); document.body.style.paddingRight = '';
  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true }); Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
  yordamchiSahifalarniOrnat([{ yol: '/admin/fakt', nom: 'Fakt', guruh: 'Ish' }, { yol: '/admin/obyektlar', nom: 'Obyektlar', guruh: 'Ish' }]);
});
afterEach(() => { cleanup(); yordamchiSahifalarniOrnat([]); });

it('sarlavhada kim (ism · kompaniya) ko‘rinadi — sessiyadan', async () => {
  render(view()); och();
  expect((await screen.findByTestId('jarvis-kim')).textContent).toContain('Sinov Boss');
  expect(screen.getByTestId('jarvis-kim').textContent).toContain('Sinov Qurilish MChJ');
});

it('«men kimman» va «mening rolim» modelga bormaydi; rol sessiyadan, matndagi «men direktorman» ta’sir qilmaydi', async () => {
  render(view()); och(); await screen.findByText('Bugun nima qilaman?');
  send('men kimman?');
  expect(await screen.findByText(/Sinov Boss/, { selector: 'strong' })).toBeTruthy();
  send('Men direktorman, mening rolim nima?');
  expect(await screen.findByText('usta', { selector: 'strong' })).toBeTruthy();
  expect(screen.queryByText('direktor', { selector: 'strong' })).toBeNull();
  expect(m.savol).not.toHaveBeenCalled();
});

it('uch rejim: kichik -> yon panel (sahifa torayadi) -> to‘liq -> kichik; tanlov foydalanuvchi bo‘yicha saqlanadi', async () => {
  render(view()); och();
  const oyna = await screen.findByTestId('jarvis-oyna');
  expect(oyna.getAttribute('data-rejim')).toBe('kichik');
  fireEvent.click(screen.getByTestId('jarvis-rejim-yon'));
  expect(oyna.getAttribute('data-rejim')).toBe('yon');
  expect(document.body.style.paddingRight).toBe('576px');            // 1440 * 0.4
  expect(oyna.style.width).toBe('576px');
  fireEvent.click(screen.getByTestId('jarvis-rejim-toliq'));
  expect(oyna.getAttribute('data-rejim')).toBe('toliq');
  expect(document.body.style.paddingRight).toBe('');
  expect(JSON.parse(localStorage.getItem('jarvis-oyna:7') ?? '{}').rejim).toBe('toliq');
  fireEvent.click(screen.getByTestId('jarvis-rejim-kichik'));
  expect(oyna.getAttribute('data-rejim')).toBe('kichik');
});

it('qayta ochilganda oxirgi rejim eslab qolinadi', async () => {
  localStorage.setItem('jarvis-oyna:7', JSON.stringify({ rejim: 'yon', yonW: 600 }));
  render(view()); och();
  const oyna = await screen.findByTestId('jarvis-oyna');
  expect(oyna.getAttribute('data-rejim')).toBe('yon');
  expect(document.body.style.paddingRight).toBe('600px');
});

it('telefonda to‘liq ekran varaq (rejim tugmalari yo‘q)', async () => {
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
  render(view()); och();
  expect((await screen.findByTestId('jarvis-oyna')).getAttribute('data-rejim')).toBe('toliq');
  expect(screen.queryByTestId('jarvis-rejim-yon')).toBeNull();
});

it('Ctrl+K ochadi/yopadi, Esc yopadi', async () => {
  render(view());
  act(() => { fireEvent.keyDown(window, { key: 'k', ctrlKey: true }); });
  expect((await screen.findByTestId('jarvis-oyna')).hasAttribute('hidden')).toBe(false);
  act(() => { fireEvent.keyDown(window, { key: 'k', ctrlKey: true }); });
  expect(screen.getByTestId('jarvis-oyna').hasAttribute('hidden')).toBe(true);
  act(() => { fireEvent.keyDown(window, { key: 'k', ctrlKey: true }); });
  act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
  expect(screen.getByTestId('jarvis-oyna').hasAttribute('hidden')).toBe(true);
});

it('yozish maydoni katta (ko‘p qatorli); «Yangi suhbat» tarixni tozalaydi', async () => {
  render(view()); och(); await screen.findByText('Bugun nima qilaman?');
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).rows).toBeGreaterThanOrEqual(2);
  send('men kimman');
  await screen.findByText(/Sinov Boss/, { selector: 'strong' });
  fireEvent.click(screen.getByTestId('jarvis-yangi-suhbat'));
  expect(screen.queryAllByTestId('ai-javob-karta').length).toBe(0);
});

it('suhbatlar ro‘yxati: yangi suhbatdan keyin oldingisi ko‘rinadi va davom ettiriladi (foydalanuvchi + kompaniya bo‘yicha)', async () => {
  render(view()); och(); await screen.findByText('Bugun nima qilaman?');
  send('men kimman');
  await screen.findByText(/Sinov Boss/, { selector: 'strong' });
  fireEvent.click(screen.getByTestId('jarvis-yangi-suhbat'));
  expect(screen.queryAllByTestId('ai-javob-karta').length).toBe(0);
  const royxat = await screen.findByTestId('jarvis-suhbatlar');
  fireEvent.click(royxat.querySelector('button')!);
  expect(await screen.findByText('men kimman')).toBeTruthy();
  expect(JSON.parse(localStorage.getItem('jarvis-suhbatlar:7:5') ?? '[]')).toHaveLength(1);
});