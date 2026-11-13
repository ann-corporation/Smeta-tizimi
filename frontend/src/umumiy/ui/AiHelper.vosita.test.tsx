// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const m = vi.hoisted(() => ({ savol: vi.fn(), kasbOl: vi.fn(), llm: vi.fn(), api: {} as Record<string, unknown> }));
vi.mock('../kontekst/KompaniyaKontekst', () => ({
  useKompaniya: () => ({ joriyId: 5, superadmin: false, kompaniyalar: [{}], foydalanuvchi: { id: 7, ism: 'Sinov Boss', login: 'sinov' }, joriy: { id: 5, nom: 'Sinov MChJ', rol: 'boss', permissions: ['f2.approve', 'f2.cancel', 'financial.write', 'financial.read'] } }),
}));
vi.mock('../../api/t2-agent-ish', () => ({
  kasbOl: m.kasbOl, kasbSavolOqim: m.savol, niyatLlmOl: m.llm, jurnalOl: vi.fn(async () => ({ ok: true, natija: { hamma: false, natija: [] } })),
  shaxsiyOl: vi.fn(async () => ({ ok: true, natija: { til: 'auto', uslub: 'qisqa', ishonch: 'jiddiy' } })), shaxsiySaqla: vi.fn(), harakatQarori: vi.fn(), harakatNatijasi: vi.fn(),
  modellarOl: vi.fn(async () => ({ ok: false, error: 'yoq' })), modelShaxsiyOl: vi.fn(async () => ({ ok: false, error: 'yoq' })), modelShaxsiyTanla: vi.fn(), modelSiyosatOl: vi.fn(async () => ({ ok: false, error: 'yoq' })),
  uslubOl: vi.fn(async () => ({ ok: false, error: 'yoq' })), uslubSaqla: vi.fn(), uslubTozala: vi.fn(), tizimYordamSavol: vi.fn(),
}));
vi.mock('../../lib/yordamchi/vosita/haqiqiy', () => ({ haqiqiyVositaApi: () => m.api }));
vi.mock('./useAiKuzatuv', () => ({ useAiKuzatuv: () => ({ taklif: null, yoqilgan: false, almashtir: vi.fn() }) }));
vi.mock('./AiFikrPanel', () => ({ AiFikrPanel: () => <div>fikr-panel</div> }));
vi.mock('../../i18n/til', () => ({ t: (s: string) => s }));
import { AiHelper, AiHelperTugma } from './AiHelper';
import { yordamchiSahifalarniOrnat } from '../../lib/yordamchi/sahifa-store';

const KASB = { rol: 'boss', profil: 'direktor', nom: 'Direktor yordamchisi', vazifa: 'Holat.', kategoriyalar: ['obyektlar'], namuna_savollar: ['Holat?'], taqiq_izoh: null };
const view = () => <MemoryRouter initialEntries={['/admin/fakt']}><AiHelperTugma /><AiHelper /></MemoryRouter>;
const och = () => fireEvent.click(screen.getByLabelText('Jarvis AI yordamchisini ochish'));
const send = (text: string) => { fireEvent.change(screen.getByRole('textbox'), { target: { value: text } }); fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', code: 'Enter' }); };

beforeEach(() => {
  m.savol.mockReset(); m.kasbOl.mockReset(); m.llm.mockReset(); m.kasbOl.mockResolvedValue({ ok: true, natija: KASB });
  m.api = {
    bugun: vi.fn(async () => [{ nom: 'Menga ochiq murojaatlar', soni: 3, yol: '/admin/murojaatlar' }]),
    solishtiruv: vi.fn(), aktlar: vi.fn(), friksiya: vi.fn(),
  };
  Element.prototype.scrollIntoView = vi.fn(); localStorage.clear(); sessionStorage.clear();
  yordamchiSahifalarniOrnat([{ yol: '/admin/fakt', nom: 'Fakt', guruh: 'Ish' }, { yol: '/admin/murojaatlar', nom: 'Murojaatlar', guruh: 'Ish' }]);
});
afterEach(() => { cleanup(); yordamchiSahifalarniOrnat([]); });

it('mahalliy qatlam tushunmagan gap -> LLM kanonik buyruqqa yozadi -> vosita ishlaydi (suhbat modeliga bormaydi)', async () => {
  m.llm.mockResolvedValue({ tur: 'buyruq', qayta: 'bugun menga nima kutyapti', savol: null, variantlar: [] });
  render(view()); och(); await screen.findByText('Holat?');
  send('ziyoda yolkon barakat');
  expect((await screen.findAllByText(/Menga ochiq murojaatlar/)).length).toBeGreaterThan(0);
  expect(m.llm).toHaveBeenCalledTimes(1); expect(m.savol).not.toHaveBeenCalled();
});

it('LLM «noaniq» -> BITTA aniqlashtiruvchi savol, variantlar tugma; bosilsa ishlaydi', async () => {
  m.llm.mockResolvedValue({ tur: 'noaniq', qayta: null, savol: 'Qaysi birini nazarda tutdingiz?', variantlar: ['bugun menga nima kutyapti', 'solishtiruvni ko‘rsat'] });
  render(view()); och(); await screen.findByText('Holat?');
  send('menga o‘sha narsani ko‘rsat');
  expect(await screen.findByText('Qaysi birini nazarda tutdingiz?')).toBeTruthy();
  fireEvent.click(await screen.findByRole('button', { name: 'bugun menga nima kutyapti' }));
  expect((await screen.findAllByText(/Menga ochiq murojaatlar/)).length).toBeGreaterThan(0);
  expect(m.savol).not.toHaveBeenCalled();
});

it('LLM «suhbat» yoki xato -> mavjud suhbat oqimi davom etadi; so‘rov takrorlanmaydi', async () => {
  m.llm.mockResolvedValue(null);
  m.savol.mockResolvedValue({ ok: true, javob: 'Mana javob.', kasb: { nom: 'Direktor yordamchisi' }, model: 'x/y', ms: 10, qadamlar: [] });
  render(view()); och(); await screen.findByText('Holat?');
  send('qxzv plmk');
  expect(await screen.findByText('Mana javob.')).toBeTruthy();
  expect(screen.getAllByText('qxzv plmk').length).toBe(1);
  expect(m.savol).toHaveBeenCalledTimes(1);
});

it('savol (?) bilan tugagan gap LLM niyat qatlamiga bormaydi (ortiqcha hisob yo‘q)', async () => {
  m.savol.mockResolvedValue({ ok: true, javob: 'Javob.', kasb: { nom: 'D' }, model: 'x/y', ms: 10, qadamlar: [] });
  render(view()); och(); await screen.findByText('Holat?');
  send('ertaga ob-havo qanday bo‘ladi?');
  expect(await screen.findByText('Javob.')).toBeTruthy();
  expect(m.llm).not.toHaveBeenCalled();
});

it('aniqlashtiruvchi savol zanjiri (vosita): murojaat — tomon va matn so‘raladi; «yo‘q» bekor qiladi', async () => {
  Object.assign(m.api, { aloqalar: vi.fn(async () => [{ id: 1, nom: 'Texnadzor Markaz', rol: 'texnadzor', faol: true }]), murojaatTurlari: vi.fn(async () => [{ kalit: 'remark', nom: 'Remark' }]), murojaatYarat: vi.fn() });
  render(view()); och(); await screen.findByText('Holat?');
  send('texnadzorga murojaat yubor');
  expect(await screen.findByText(/murojaat matnini yozing/)).toBeTruthy();
  send('yo‘q');
  expect(await screen.findByText(/Bekor qildim/)).toBeTruthy();
  expect(m.api.murojaatYarat).not.toHaveBeenCalled();
});
