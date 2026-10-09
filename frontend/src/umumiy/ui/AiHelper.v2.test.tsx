// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

const m = vi.hoisted(() => ({
  id: 11 as number | null, savol: vi.fn(), kasbOl: vi.fn(), yordam: vi.fn(), modellar: vi.fn(), shaxsiyModel: vi.fn(), tanla: vi.fn(),
  uslubOl: vi.fn(), uslubSaqla: vi.fn(), uslubTozala: vi.fn(), baho: vi.fn(), siyosat: vi.fn(),
}));
vi.mock('../kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ joriyId: m.id }) }));
vi.mock('../../api/t2-agent-ish', () => ({
  kasbOl: m.kasbOl, kasbSavolOqim: m.savol, tizimYordamSavol: m.yordam, modellarOl: m.modellar, modelShaxsiyOl: m.shaxsiyModel, modelShaxsiyTanla: m.tanla, modelSiyosatOl: m.siyosat,
  uslubOl: m.uslubOl, uslubSaqla: m.uslubSaqla, uslubTozala: m.uslubTozala, javobBaho: m.baho,
  openrouterModellarOl: vi.fn(async () => ({ ok: true, natija: { jami: 1, tavsiya: [], talab: { min: 50, izoh: 'Umumiy' }, natija: [] } })), modelOpenrouterdanQosh: vi.fn(),
  jurnalOl: vi.fn(async () => ({ ok: true, natija: { hamma: false, natija: [] } })), shaxsiyOl: vi.fn(async () => ({ ok: true, natija: { til: 'auto', uslub: 'qisqa', ishonch: 'jiddiy' } })), shaxsiySaqla: vi.fn(), harakatQarori: vi.fn(), harakatNatijasi: vi.fn(),
}));
vi.mock('./useAiKuzatuv', () => ({ useAiKuzatuv: () => ({ taklif: null, yoqilgan: false, almashtir: vi.fn() }) }));
vi.mock('./AiFikrPanel', () => ({ AiFikrPanel: () => <div>fikr-panel</div> }));
vi.mock('../../i18n/til', () => ({ t: (s: string) => s }));
vi.mock('./Toast', () => ({ toast: vi.fn() }));
import { AiHelper } from './AiHelper';

const KASB = { rol: 'prorab', profil: 'prorab', nom: 'Prorab yordamchisi', vazifa: 'Ish borishi va ombor.', kategoriyalar: ['obyektlar'], namuna_savollar: ['Omborda nima bor?'], taqiq_izoh: null, boshqalar: [] };
const KATALOG = [{ id: 'google/gemini-2.5-flash-lite', nom: 'Gemini Flash Lite', tavsif: null, narx_izoh: null, vision: false }];
function Joy() { const l = useLocation(); return <div data-testid="joy">{l.pathname}</div>; }
const view = () => <MemoryRouter initialEntries={['/admin/f2']}><AiHelper /><Joy /></MemoryRouter>;
const och = () => fireEvent.click(screen.getByLabelText('Jarvis AI yordamchisini ochish'));
beforeEach(() => {
  m.id = 11; Element.prototype.scrollIntoView = vi.fn();
  for (const f of [m.savol, m.kasbOl, m.yordam, m.modellar, m.shaxsiyModel, m.tanla, m.uslubOl, m.uslubSaqla, m.uslubTozala, m.baho, m.siyosat]) f.mockReset();
  m.kasbOl.mockResolvedValue({ ok: true, natija: KASB });
  m.modellar.mockResolvedValue({ ok: true, natija: { rol: 'prorab', tanlash_mumkin: false, agentlar: [{ kod: 'prorab', model_id: 'google/gemini-2.5-flash-lite', model_manba: 'platforma' }], katalog: KATALOG } });
  m.shaxsiyModel.mockResolvedValue({ ok: true, natija: { tanlovlar: [] } });
  m.tanla.mockResolvedValue({ ok: true, natija: {} });
  m.siyosat.mockResolvedValue({ ok: true, natija: { model_erkin: true, tahrir_mumkin: false } });
  m.uslubOl.mockResolvedValue({ ok: true, natija: { xususiyat: {}, xulosa: ['asosan ruscha yozadi'], korsatma: 'Qisqa yoz', yoqilgan: true } });
});
afterEach(cleanup);
const send = (text: string) => { fireEvent.change(screen.getByRole('textbox'), { target: { value: text } }); fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', code: 'Enter' }); };

it('kompaniyasiz foydalanuvchi: «Tizim yordamchisi» tokensiz javob beradi va sahifa ochish tugmasini beradi', async () => {
  m.id = null;
  m.yordam.mockResolvedValue({ ok: true, natija: { javob: '**Nakopitelniy** — yig‘ma vedomost.', sahifalar: [{ yol: '/admin/nakopitelniy', nom: 'Nakopitelniy vedomost' }], topildi: true } });
  render(view()); och();
  expect(await screen.findByText('Tizim yordamchisi')).toBeTruthy();
  send('Nakopitelniy qayerda?');
  expect(m.yordam).toHaveBeenCalledWith('Nakopitelniy qayerda?', '/admin/f2');
  expect(await screen.findByText(/Tizim yordamchisi — model chaqirilmadi/)).toBeTruthy();
  fireEvent.click(await screen.findByRole('button', { name: /Ochish: Nakopitelniy vedomost/ }));
  expect(screen.getByTestId('joy').textContent).toBe('/admin/nakopitelniy');
  expect(m.savol).not.toHaveBeenCalled();
});

it('AI javobidagi sahifalar tugma bo‘lib chiqadi va bosilganda o‘tadi', async () => {
  m.savol.mockResolvedValue({ ok: true, javob: 'Mana.', kasb: { nom: 'Prorab yordamchisi' }, model: 'x/y', ms: 100, sahifalar: [{ yol: '/admin/m29', nom: 'M-29' }], qadamlar: [] });
  render(view()); och(); await screen.findByText('Omborda nima bor?');
  send('M-29 qayerda?');
  fireEvent.click(await screen.findByRole('button', { name: /Ochish: M-29/ }));
  expect(screen.getByTestId('joy').textContent).toBe('/admin/m29');
});

it('istalgan joydan `ai:ochish` hodisasi chatni tayyor savol bilan ochadi (bir marta yuboriladi)', async () => {
  m.savol.mockResolvedValue({ ok: true, javob: 'Javob', kasb: { nom: 'Prorab yordamchisi' }, model: 'x/y', ms: 100, qadamlar: [] });
  render(view());
  act(() => { window.dispatchEvent(new CustomEvent('ai:ochish', { detail: { savol: 'Bu qatorni tushuntir' } })); });
  await waitFor(() => expect(m.savol).toHaveBeenCalledWith(11, 'Bu qatorni tushuntir', expect.objectContaining({ sahifa: '/admin/f2' })));
  fireEvent.click(screen.getByRole('tab', { name: 'Jurnal' })); fireEvent.click(screen.getByRole('tab', { name: 'Suhbat' }));
  expect(m.savol).toHaveBeenCalledTimes(1);
});

it('model chip: standart ko‘rinadi, tanlov saqlanadi', async () => {
  render(view()); och();
  const chip = await screen.findByTestId('model-chip');
  expect(chip.textContent).toContain('standart');
  fireEvent.click(screen.getByLabelText('Shu funksiya uchun AI modelini tanlash'));
  fireEvent.click(await screen.findByRole('option', { name: /Gemini Flash Lite/ }));
  await waitFor(() => expect(m.tanla).toHaveBeenCalledWith('prorab', 'google/gemini-2.5-flash-lite'));
  expect((await screen.findByTestId('model-chip')).textContent).toContain('sizning tanlovingiz');
});

it('model chip server tayyor bo‘lmasa jim yashirinadi (chat ishlayveradi)', async () => {
  m.shaxsiyModel.mockResolvedValue({ ok: false, error: 'RPC yo‘q' });
  render(view()); och();
  await screen.findByText('Omborda nima bor?');
  expect(screen.queryByTestId('model-chip')).toBeNull();
});

it('uslub paneli: o‘rganilgan xulosa va ko‘rsatma ko‘rinadi; saqlash/tozalash serverga ketadi', async () => {
  m.uslubSaqla.mockResolvedValue({ ok: true, natija: {} }); m.uslubTozala.mockResolvedValue({ ok: true, natija: {} });
  render(view()); och();
  fireEvent.click(screen.getByRole('tab', { name: 'Sozlamalar' }));
  expect(await screen.findByText('asosan ruscha yozadi')).toBeTruthy();
  const ta = screen.getByPlaceholderText(/avval xulosa/i) as HTMLTextAreaElement;
  expect(ta.value).toBe('Qisqa yoz');
  fireEvent.change(ta, { target: { value: 'Jadval ko‘rinishida' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Saqlash' }).at(-1)!);
  await waitFor(() => expect(m.uslubSaqla).toHaveBeenCalledWith('Jadval ko‘rinishida', true));
  fireEvent.click(screen.getByRole('button', { name: 'O‘rganilganni tozalash' }));
  await waitFor(() => expect(m.uslubTozala).toHaveBeenCalled());
});

it('javobga baho: «qisqaroq» serverga ketadi (profil + sahifa), minnatdorchilik ko‘rinadi; salom/rad javobda baho tugmalari yo‘q', async () => {
  m.savol.mockResolvedValue({ ok: true, javob: 'Javob', kasb: { nom: 'Prorab yordamchisi', rol: 'prorab', profil: 'prorab' }, model: 'x/y', ms: 100, qadamlar: [] });
  m.baho.mockResolvedValue({ ok: true, natija: {} });
  render(view()); och(); await screen.findByText('Omborda nima bor?');
  send('Omborda sement qancha?');
  fireEvent.click(await screen.findByRole('button', { name: 'Qisqaroq' }));
  await waitFor(() => expect(m.baho).toHaveBeenCalledWith(11, 'qisqaroq', { profil: 'prorab', sahifa: '/admin/f2' }));
  expect(await screen.findByText(/keyingi javoblar qisqaroq/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Batafsilroq' })).toBeNull();
  m.savol.mockResolvedValue({ ok: true, rad: true, javob: 'Doirangizda emas', model: 'local', qadamlar: [] });
  send('Maosh qancha?');
  await screen.findByText('Doirangizda emas');
  expect(screen.queryAllByRole('button', { name: 'Qisqaroq' })).toHaveLength(0);
});

it('kompaniya admini model tanlashni cheklagan: tanlagich o‘rniga qulflangan satr (standart model ko‘rinadi), tanlash imkoni yo‘q', async () => {
  m.siyosat.mockResolvedValue({ ok: true, natija: { model_erkin: false, tahrir_mumkin: false } });
  render(view()); och();
  const qulf = await screen.findByTestId('model-chip-qulf');
  expect(qulf.textContent).toContain('Gemini Flash Lite'); expect(qulf.textContent).toContain('kompaniya admini model tanlashni cheklagan');
  expect(screen.queryByLabelText('Shu funksiya uchun AI modelini tanlash')).toBeNull();
});
