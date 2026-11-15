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
  modellarOl: vi.fn(async () => ({ ok: false, error: 'yoq' })), modelShaxsiyOl: vi.fn(async () => ({ ok: false, error: 'yoq' })), modelShaxsiyTanla: vi.fn(), modelSiyosatOl: vi.fn(async () => ({ ok: false, error: 'yoq' })), openrouterModellarOl: vi.fn(async () => ({ ok: true, natija: { natija: [], tavsiya: [], talab: { min: 62, izoh: 'talab-izoh' } } })),
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
const kirishFokus = async () => { await screen.findByText('Bugun nima qilaman?'); await new Promise((r) => setTimeout(r, 20)); return document.activeElement === screen.getByTestId('jarvis-kirish'); };

it('Android WebView pointer:fine desa ham: maxTouchPoints > 0 bo\u2018lsa fokus berilmaydi', async () => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }));
  vi.stubGlobal('navigator', { ...window.navigator, maxTouchPoints: 5, userAgent: 'x' });
  Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
  render(view()); och();
  expect(await kirishFokus()).toBe(false);
});

it('telefon eni (412px) bo\u2018lsa matchMedia/touch belgisiz ham fokus berilmaydi', async () => {
  render(view()); och();
  expect(await kirishFokus()).toBe(false);
});

it('mobil User-Agent bo\u2018lsa fokus berilmaydi', async () => {
  vi.stubGlobal('navigator', { ...window.navigator, maxTouchPoints: 0, userAgent: 'Mozilla/5.0 (Linux; Android 14; wv) Mobile Safari/537.36' });
  Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
  render(view()); och();
  expect(await kirishFokus()).toBe(false);
});

it('desktop (1280px, sichqoncha): kiritish maydoniga avtomatik fokus oldingidek', async () => {
  Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
  render(view()); och();
  expect(await kirishFokus()).toBe(true);
});

it('sarlavha: telefonda faqat lavozim nomi (kim qatori yashirin), ellipsis, tugmalar siqilmaydi', async () => {
  render(view()); och();
  const oyna = await screen.findByTestId('jarvis-oyna');
  const kim = await screen.findByTestId('jarvis-kim');
  expect(kim.className).toContain('hidden');
  expect(kim.className).toContain('sm:inline');
  const h3 = oyna.querySelector('h3')!;
  expect(h3.className).toContain('text-ellipsis');
  expect(h3.className).toContain('overflow-hidden');
  expect(h3.parentElement!.className).toContain('min-w-0');
  expect(screen.getByTestId('jarvis-yopish').parentElement!.className).toContain('shrink-0');
});

it('telefonda model bloki va suhbat qatori ixcham: AI MODELI sarlavhasi, Talab izohi va Kontekst qatori yo\u2018q', async () => {
  const api = await import('../../api/t2-agent-ish');
  (api.modellarOl as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, natija: { katalog: [{ id: 'm1', nom: 'Model Bir' }], agentlar: [] } });
  (api.modelShaxsiyOl as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, natija: { tanlovlar: [] } });
  (api.modelSiyosatOl as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, natija: { model_erkin: true } });
  render(view()); och();
  await screen.findByTestId('model-chip');
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByText('AI modeli')).toBeNull();
  expect(screen.queryByText(/Talab/)).toBeNull();
  expect(screen.queryByText(/Kontekst:/)).toBeNull();
  expect(screen.getByTestId('jarvis-conversation-bar')).toBeTruthy();
});

it('desktopda model bloki va Kontekst qatori oldingidek ko\u2018rinadi', async () => {
  Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
  const api = await import('../../api/t2-agent-ish');
  (api.modellarOl as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, natija: { katalog: [{ id: 'm1', nom: 'Model Bir' }], agentlar: [] } });
  (api.modelShaxsiyOl as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, natija: { tanlovlar: [] } });
  (api.modelSiyosatOl as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, natija: { model_erkin: true } });
  render(view()); och();
  await screen.findByTestId('model-chip');
  expect(await screen.findByText('AI modeli')).toBeTruthy();
  expect(await screen.findByText(/Talab/)).toBeTruthy();
  expect(screen.getByText(/Kontekst:/)).toBeTruthy();
});

it('tarix: bitta yozuv; qayta-render/resize qo\u2018shimcha push qilmaydi; ikkinchi \u00abback\u00bb (popstate) yopadi', async () => {
  window.history.replaceState(null, '');
  const push = vi.spyOn(window.history, 'pushState');
  render(view()); och();
  const oyna = await screen.findByTestId('jarvis-oyna');
  act(() => { window.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('resize')); });
  expect(push).toHaveBeenCalledTimes(1);
  act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
  expect(oyna.hasAttribute('hidden')).toBe(true);
  push.mockRestore();
});

it('Jarvis ochiq bo\u2018lganda pastki tab-panel yashirinadi (html[data-jarvis-ochiq]), yopilganda qaytadi', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync('src/dizayn/mobil.css', 'utf8');
  expect(css).toMatch(/html\[data-jarvis-ochiq\] \.mobil-tab\s*\{\s*display:\s*none\s*!important/);
  render(view()); och();
  await screen.findByTestId('jarvis-oyna');
  expect(document.documentElement.hasAttribute('data-jarvis-ochiq')).toBe(true);
  fireEvent.click(screen.getByTestId('jarvis-yopish'));
  expect(document.documentElement.hasAttribute('data-jarvis-ochiq')).toBe(false);
});