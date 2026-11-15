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
  kasbOl: m.kasbOl, suhbatRoyxatOl: vi.fn(async () => null), suhbatServerga: vi.fn(async () => null), suhbatServerdanOl: vi.fn(async () => null), kasbSavolOqim: m.savol, jurnalOl: vi.fn(async () => ({ ok: true, natija: { hamma: false, natija: [] } })),
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

beforeEach(() => {
  m.rol = 'usta'; m.savol.mockReset(); m.kasbOl.mockReset(); m.kasbOl.mockResolvedValue({ ok: true, natija: KASB });
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.clear(); sessionStorage.clear(); document.body.style.paddingRight = '';
  Object.defineProperty(window, 'innerWidth', { value: 412, configurable: true }); Object.defineProperty(window, 'innerHeight', { value: 915, configurable: true });
  yordamchiSahifalarniOrnat([{ yol: '/admin/fakt', nom: 'Fakt', guruh: 'Ish' }, { yol: '/admin/obyektlar', nom: 'Obyektlar', guruh: 'Ish' }]);
});
afterEach(() => { cleanup(); yordamchiSahifalarniOrnat([]); vi.unstubAllGlobals(); });

const sensorli = () => vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('pointer: coarse'), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }));

it('telefon: varaq ko‘rinadigan maydon balandligida (100dvh), yopish tugmasi bor, umumiy dialog qoidasidan chiqarilgan', async () => {
  render(view()); och();
  const oyna = await screen.findByTestId('jarvis-oyna');
  expect(oyna.getAttribute('data-rejim')).toBe('toliq');
  expect(oyna.hasAttribute('data-jarvis')).toBe(true);   // mobil.css: .fixed.inset-0[role=dialog]:not([data-jarvis]) > * {height:100%} unga tegmaydi
  expect(oyna.style.height).toBe('100dvh');
  expect(screen.getByTestId('jarvis-yopish')).toBeTruthy();
  fireEvent.click(screen.getByTestId('jarvis-yopish'));
  expect(oyna.hasAttribute('hidden')).toBe(true);
});

it('teginish ekranida ochilganda kiritish maydoniga fokus berilmaydi (klaviatura o‘zi chiqmaydi)', async () => {
  sensorli();
  render(view()); och();
  await screen.findByText('Bugun nima qilaman?');
  await new Promise((r) => setTimeout(r, 20));
  expect(document.activeElement).not.toBe(screen.getByTestId('jarvis-kirish'));
});

it('Android «orqaga» (popstate) Jarvisni yopadi; X bilan yopilsa tarix yozuvi olib tashlanadi', async () => {
  render(view()); och();
  const oyna = await screen.findByTestId('jarvis-oyna');
  expect(window.history.state?.__jarvis).toBe(true);
  act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
  expect(oyna.hasAttribute('hidden')).toBe(true);
  const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
  och();
  expect(oyna.hasAttribute('hidden')).toBe(false);
  fireEvent.click(screen.getByTestId('jarvis-yopish'));
  expect(back).toHaveBeenCalled();
});

it('visualViewport qisqarganda (klaviatura) varaq balandligi unga moslanadi', async () => {
  const hodisalar: Record<string, () => void> = {};
  const vv = { height: 500, offsetTop: 0, addEventListener: (n: string, f: () => void) => { hodisalar[n] = f; }, removeEventListener: () => {} };
  vi.stubGlobal('visualViewport', vv);
  render(view()); och();
  const oyna = await screen.findByTestId('jarvis-oyna');
  expect(oyna.style.height).toBe('500px');
  act(() => { vv.height = 320; vv.offsetTop = 12; hodisalar.resize?.(); });
  expect(oyna.style.height).toBe('320px');
  expect(oyna.style.top).toBe('12px');
});