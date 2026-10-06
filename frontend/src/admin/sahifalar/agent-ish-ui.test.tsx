import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  toast: vi.fn(), modellarOl: vi.fn(), modelTanla: vi.fn(),
  takliflarOl: vi.fn(), taklifQarori: vi.fn(), buyruqlarOl: vi.fn(), buyruqYubor: vi.fn(), rivojlanishTahlil: vi.fn(), orModellar: vi.fn(),
}));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../api/t2-agent-ish', () => ({
  modellarOl: m.modellarOl, modelTanla: m.modelTanla, takliflarOl: m.takliflarOl, taklifQarori: m.taklifQarori,
  buyruqlarOl: m.buyruqlarOl, buyruqYubor: m.buyruqYubor, rivojlanishTahlil: m.rivojlanishTahlil, openrouterModellarOl: m.orModellar, modelOpenrouterdanQosh: vi.fn(),
}));

import { AgentModellar } from './AgentModellar';
import { AgentTakliflar } from './AgentTakliflar';

const modellar = (tanlash: boolean) => ({ ok: true, natija: {
  rol: tanlash ? 'boss' : 'pto', tanlash_mumkin: tanlash,
  agentlar: [{ kod: 'document_control', nom: 'Hujjat nazorati', rol: 'document_controller', izoh: null, permission_mode: 'command_prepare', default_scope: 'object', model_id: 'vendor/a', model_manba: 'platforma' }],
  katalog: [{ id: 'vendor/a', nom: 'Model A', tavsif: null, narx_izoh: null, vision: false }, { id: 'vendor/b', nom: 'Model B', tavsif: null, narx_izoh: null, vision: true }],
} });

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.orModellar.mockResolvedValue({ ok: true, natija: { jami: 2, tavsiya: [], talab: { min: 52, izoh: 'x' }, natija: [{ id: 'vendor/a', nom: 'Model A', kirish_usd: 0.1, chiqish_usd: 0.4, kontekst: 100000, vision: true, tools: true, json: true, reasoning: false, ball: 66, manba: 'tanilgan', daraja: 'mos', talab: 62, sabablar: [], ogohlantirish: null, javob_narxi_usd: 0.0005 }, { id: 'vendor/b', nom: 'Model B', kirish_usd: 0.1, chiqish_usd: 0.4, kontekst: 100000, vision: true, tools: true, json: true, reasoning: false, ball: 66, manba: 'tanilgan', daraja: 'mos', talab: 62, sabablar: [], ogohlantirish: null, javob_narxi_usd: 0.0005 }] } });
});
afterEach(cleanup);

describe('AgentModellar', () => {
  it('agent, rejim va hozirgi model ko‘rinadi; ruxsati bor foydalanuvchi modelni almashtiradi', async () => {
    m.modellarOl.mockResolvedValue(modellar(true)); m.modelTanla.mockResolvedValue({ ok: true, natija: {} });
    render(<AgentModellar kompaniyaId={5} tizim={false} />);
    expect(await screen.findByText('Hujjat nazorati')).toBeTruthy();
    expect(screen.getByText('Platforma tanlovi')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Model — Hujjat nazorati/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Model B/ }));
    await waitFor(() => expect(m.modelTanla).toHaveBeenCalledWith(5, 'document_control', 'vendor/b'));
  });

  it('ruxsatsiz foydalanuvchi faqat ko‘radi (tanlash yo‘q)', async () => {
    m.modellarOl.mockResolvedValue(modellar(false));
    render(<AgentModellar kompaniyaId={5} tizim={false} />);
    expect(await screen.findByText('Model A')).toBeTruthy();
    expect(screen.queryByLabelText(/Hujjat nazorati/)).toBeNull();
  });

  it('kompaniya sahifasida katalogni boshqarish formasi YO‘Q (u faqat Boshqaruv → AI markazida)', async () => {
    m.modellarOl.mockResolvedValue(modellar(true));
    render(<AgentModellar kompaniyaId={5} tizim={false} />);
    await screen.findByText('Hujjat nazorati');
    expect(screen.queryByPlaceholderText('ishlab-chiqaruvchi/model-nomi')).toBeNull();
  });

  it('xato bo‘lsa tushunarli xabar', async () => {
    m.modellarOl.mockResolvedValue({ ok: false, error: 'Bu doiraga ruxsat yo‘q' });
    render(<AgentModellar kompaniyaId={null} tizim />);
    expect(await screen.findByText(/Bu doiraga ruxsat yo‘q/)).toBeTruthy();
  });
});

const taklif = (o: Record<string, unknown> = {}) => ({ id: 3, tur: 'rivojlanish', doira: 'global', profil_kod: null, sarlavha: 'Material qidiruvini yaxshilash',
  mazmun: { maqsad: 'Tez qidiruv', tavsif: 'Sinonimlar', xavf: 'past', qabul_mezonlari: ['test yashil'] }, dalil: [{ guruh: '/admin/f2/material_topilmadi', soni: 7 }],
  holat: 'kutilmoqda', yaratildi: '2026-10-06T10:00:00Z', qaror_izoh: null, qaror_vaqt: null, ...o });
const buyruq = (o: Record<string, unknown> = {}) => ({ id: 9, taklif_id: 3, sarlavha: 'Qidiruv', spec: {}, xavf: 'past', avto_birlashtirish: false, holat: 'navbat', ijrochi: null, pr_url: null, github_issue: null, jurnal: [], yaratildi: '', yangilandi: '', ...o });

describe('AgentTakliflar', () => {
  it('rad etish sababsiz ketmaydi; tasdiqlashda avto-birlashtirish faqat past xavfda taklif qilinadi', async () => {
    m.takliflarOl.mockResolvedValue({ ok: true, natija: { natija: [taklif()] } }); m.buyruqlarOl.mockResolvedValue({ ok: true, natija: { natija: [] } });
    m.taklifQarori.mockResolvedValue({ ok: true, natija: {} });
    render(<AgentTakliflar kompaniyaId={null} tizim />);
    await screen.findByText('Material qidiruvini yaxshilash');
    fireEvent.click(screen.getByRole('button', { name: 'Rad etish' }));
    expect(m.taklifQarori).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('CI yashil bo‘lsa avto-birlashtirish'));
    fireEvent.click(screen.getByRole('button', { name: 'Tasdiqlash' }));
    await waitFor(() => expect(m.taklifQarori).toHaveBeenCalledWith(null, 3, 'tasdiqlash', undefined, true));
  });

  it('o‘rta xavfli taklifda avto-birlashtirish tanlovi yo‘q', async () => {
    m.takliflarOl.mockResolvedValue({ ok: true, natija: { natija: [taklif({ mazmun: { maqsad: 'x', tavsif: 'y', xavf: 'orta' } })] } }); m.buyruqlarOl.mockResolvedValue({ ok: true, natija: { natija: [] } });
    render(<AgentTakliflar kompaniyaId={null} tizim />);
    await screen.findByText('Material qidiruvini yaxshilash');
    expect(screen.queryByLabelText('CI yashil bo‘lsa avto-birlashtirish')).toBeNull();
  });

  it('navbatdagi buyruq ijrochiga yuboriladi; PR havolasi ko‘rinadi', async () => {
    m.takliflarOl.mockResolvedValue({ ok: true, natija: { natija: [] } });
    m.buyruqlarOl.mockResolvedValue({ ok: true, natija: { natija: [buyruq(), buyruq({ id: 10, holat: 'pr_ochildi', pr_url: 'https://github.com/o/r/pull/1' })] } });
    m.buyruqYubor.mockResolvedValue({ ok: true, natija: { issue: 5, url: 'u' } });
    render(<AgentTakliflar kompaniyaId={null} tizim />);
    const satr = (await screen.findByText(/#9 Qidiruv/)).closest('li') as HTMLElement;
    fireEvent.click(within(satr).getByRole('button', { name: 'Ijrochiga yuborish' }));
    await waitFor(() => expect(m.buyruqYubor).toHaveBeenCalledWith(9));
    expect(screen.getByRole('link', { name: 'PR' }).getAttribute('href')).toBe('https://github.com/o/r/pull/1');
  });

  it('kompaniya doirasida buyruqlar so‘ralmaydi; qaror kompaniya doirasida yuboriladi', async () => {
    m.takliflarOl.mockResolvedValue({ ok: true, natija: { natija: [taklif({ doira: 'company', tur: 'qoida', mazmun: { kod: 'narx_tekshiruv', matn: 'Narxni tekshir' } })] } });
    m.taklifQarori.mockResolvedValue({ ok: true, natija: {} });
    render(<AgentTakliflar kompaniyaId={5} tizim={false} />);
    await screen.findByText('Narxni tekshir');
    expect(m.buyruqlarOl).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Tasdiqlash' }));
    await waitFor(() => expect(m.taklifQarori).toHaveBeenCalledWith(5, 3, 'tasdiqlash', undefined, undefined));
  });
});
