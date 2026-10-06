// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';

const m = vi.hoisted(() => ({ id: 11 as number | null, savol: vi.fn(), kasbOl: vi.fn() }));
vi.mock('../kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ joriyId: m.id }) }));
vi.mock('../../api/t2-agent-ish', () => ({
  kasbOl: m.kasbOl, kasbSavolOqim: m.savol, jurnalOl: vi.fn(async () => ({ ok: true, natija: { hamma: false, natija: [] } })),
  shaxsiyOl: vi.fn(async () => ({ ok: true, natija: { til: 'auto', uslub: 'qisqa', ishonch: 'jiddiy' } })), shaxsiySaqla: vi.fn(),
  harakatQarori: vi.fn(), harakatNatijasi: vi.fn(),
}));
vi.mock('./useAiKuzatuv', () => ({ useAiKuzatuv: () => ({ taklif: null, yoqilgan: false, almashtir: vi.fn() }) }));
vi.mock('./AiFikrPanel', () => ({ AiFikrPanel: () => <div>fikr-panel</div> }));
vi.mock('../../i18n/til', () => ({ t: (s: string) => s }));
import { AiHelper } from './AiHelper';

const KASB = { rol: 'prorab', profil: 'prorab', nom: 'Prorab yordamchisi', vazifa: 'Ish borishi va ombor.', kategoriyalar: ['obyektlar', 'ombor'], namuna_savollar: ['Omborda nima bor?'], taqiq_izoh: 'Pul sizning doirangizda emas.', boshqalar: [] };
const view = () => <MemoryRouter initialEntries={['/admin/f2']}><AiHelper /></MemoryRouter>;
const och = () => fireEvent.click(screen.getByLabelText('Jarvis AI yordamchisini ochish'));
beforeEach(() => { m.id = 11; m.savol.mockReset(); m.kasbOl.mockReset(); m.kasbOl.mockResolvedValue({ ok: true, natija: KASB }); Element.prototype.scrollIntoView = vi.fn(); });
afterEach(cleanup);
function send(text: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', code: 'Enter' });
}

it('ochilganda foydalanuvchining kasb ishchisi ko‘rinadi (nom, vazifa, namuna savollar, taqiq izohi)', async () => {
  render(view()); och();
  expect(await screen.findByText('Prorab yordamchisi', { selector: 'h3' })).toBeTruthy();
  expect(await screen.findByText('Omborda nima bor?')).toBeTruthy();
  expect(screen.getByText(/Pul sizning doirangizda emas/)).toBeTruthy();
  expect(m.kasbOl).toHaveBeenCalledWith(11);
});

it('salom serverga bormaydi (token sarflanmaydi) va yolg‘on select-company talab qilmaydi', async () => {
  render(view()); och(); await screen.findByText('Omborda nima bor?');
  send('salom');
  expect(await screen.findByText(/Salom! Men —/)).toBeTruthy();
  expect(screen.queryByText(/kontekstini tanlang/)).toBeNull();
  expect(m.savol).not.toHaveBeenCalled();
});

it('savol joriy kompaniya va sahifa bilan yuboriladi; qadamlar JONLI keladi; javob va yakuniy qadamlar ko‘rinadi', async () => {
  localStorage.setItem('t2_kompaniya_id', '999');
  m.savol.mockImplementation(async (_k: number, _s: string, o: { qadam?: (q: unknown) => void }) => {
    o.qadam?.({ ms: 100, belgi: '🔐', matn: 'Lavozimingiz aniqlanmoqda…' });
    return { ok: true, javob: 'Omborda **10 t** sement bor.', kasb: { nom: 'Prorab yordamchisi' }, toifalar: ['ombor'], model: 'google/gemini-2.5-flash-lite', ms: 1800,
      qadamlar: [{ ms: 100, belgi: '🔐', matn: 'Lavozimingiz aniqlanmoqda…' }, { ms: 1800, belgi: '🏁', matn: 'Tayyor: 1.8 s · 850 token' }] };
  });
  render(view()); och(); await screen.findByText('Omborda nima bor?');
  send('Omborda sement qancha?');
  expect(m.savol).toHaveBeenCalledWith(11, 'Omborda sement qancha?', expect.objectContaining({ sahifa: '/admin/f2' }));
  expect(await screen.findByText('10 t')).toBeTruthy();
  expect(screen.getByText('google/gemini-2.5-flash-lite · 1.8 s')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /AI qanday ishladi/ }));
  expect(await screen.findByText('Tayyor: 1.8 s · 850 token')).toBeTruthy();
});

it('limit/token xatosi tushunarli matnda ko‘rsatiladi', async () => {
  m.savol.mockResolvedValue({ ok: false, code: 'TOKEN_YETMAYDI', error: 'x', qadamlar: [] });
  render(view()); och(); await screen.findByText('Omborda nima bor?');
  send('Omborda sement qancha?');
  expect(await screen.findByText(/Tokenlar yetarli emas/)).toBeTruthy();
});

it('doiradan tashqari savol: rad belgisi, model chaqirilmagani ko‘rsatiladi', async () => {
  m.savol.mockResolvedValue({ ok: true, rad: true, javob: 'Bu savol sizning doirangizda emas.', model: 'local', qadamlar: [{ ms: 5, belgi: '🛑', matn: 'model chaqirilmadi' }] });
  render(view()); och(); await screen.findByText('Omborda nima bor?');
  send('Shu oy qancha to‘lov?');
  expect(await screen.findByText(/model chaqirilmadi/, { selector: 'div' })).toBeTruthy();
});

it('A → B → A almashish eski async javobni va suhbatni qaytarmaydi', async () => {
  let resolve!: (v: unknown) => void;
  m.savol.mockReturnValue(new Promise((r) => { resolve = r; }));
  const r = render(view()); och(); await screen.findByText('Omborda nima bor?'); send('A maxfiy savol');
  await waitFor(() => expect(m.savol).toHaveBeenCalled());
  m.id = 22; r.rerender(view());
  expect(screen.queryByText('A maxfiy savol')).toBeNull();
  m.id = 11; r.rerender(view());
  await act(async () => { resolve({ ok: true, javob: 'Eski A javobi', qadamlar: [] }); });
  expect(screen.queryByText('Eski A javobi')).toBeNull();
});

it('kompaniya tanlanmagan bo‘lsa yo‘nalish matni ko‘rsatiladi', async () => {
  m.id = null; render(view()); och();
  expect(await screen.findByText(/Avval kompaniyani tanlang/)).toBeTruthy();
});

it('tablar: jurnal, fikr, sozlamalar ochiladi', async () => {
  render(view()); och(); await screen.findByText('Omborda nima bor?');
  fireEvent.click(screen.getByRole('tab', { name: 'Fikr / muammo' })); expect(screen.getByText('fikr-panel')).toBeTruthy();
  fireEvent.click(screen.getByRole('tab', { name: 'Sozlamalar' })); expect(await screen.findByText('AI qachon mendan so‘rasin?')).toBeTruthy();
  fireEvent.click(screen.getByRole('tab', { name: 'Jurnal' })); expect(await screen.findByText('Hali yozuv yo‘q.')).toBeTruthy();
});

it('production helper canonical provider ichida, global helper admin yo‘lida takrorlanmaydi', () => {
  const shell = readFileSync('src/admin/AdminShell.tsx', 'utf8');
  expect(shell).toMatch(/<KompaniyaProvider>[\s\S]*<AiHelper\s*\/>[\s\S]*<\/KompaniyaProvider>/);
  expect(readFileSync('src/App.tsx', 'utf8')).toContain("pathname.startsWith('/admin/') ? null : <AiHelper />");
});
