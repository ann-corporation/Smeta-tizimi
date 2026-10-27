import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ toast: vi.fn(), kompaniyaSozlamaOl: vi.fn(), kompaniyaSozlamaSaqla: vi.fn(), sarfHisobotiOl: vi.fn(), bilimOl: vi.fn(), bilimYoz: vi.fn(), siyosatOl: vi.fn(), siyosatSaqla: vi.fn() }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../api/t2-agent-ish', () => ({ kompaniyaSozlamaOl: m.kompaniyaSozlamaOl, kompaniyaSozlamaSaqla: m.kompaniyaSozlamaSaqla, sarfHisobotiOl: m.sarfHisobotiOl, bilimOl: m.bilimOl, bilimYoz: m.bilimYoz, modelSiyosatOl: m.siyosatOl, modelSiyosatSaqla: m.siyosatSaqla }));

import { AgentKompaniyaSozlama } from './AgentKompaniyaSozlama';

const soz = (o: Record<string, unknown> = {}) => ({ ok: true, natija: { ai_yoqilgan: true, oylik_token_limit: 2000, kuzatuv_ruxsat: true, oy_token: 889, balans: 5000, tahrir_mumkin: true, ...o } });
beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.kompaniyaSozlamaOl.mockResolvedValue(soz());
  m.sarfHisobotiOl.mockResolvedValue({ ok: true, natija: { oy_token: 889, balans: 5000, agentlar: [{ profil: 'pto_smeta', chaqiruv: 3, token: 889 }], kunlar: [] } });
  m.siyosatOl.mockResolvedValue({ ok: true, natija: { model_erkin: true, tahrir_mumkin: true } });
  m.bilimOl.mockResolvedValue({ ok: true, natija: { natija: [
    { id: 1, doira: 'global', kod: 'umumiy', sarlavha: 'Umumiy yozuv', matn: 'platforma', kalit: ['x1'], manba_url: null, versiya: 1 },
    { id: 2, doira: 'company', kod: 'bizniki', sarlavha: 'Ombor tartibi', matn: 'Chiqimni omborchi va prorab birga tasdiqlaydi.', kalit: ['ombor'], manba_url: null, versiya: 2 },
  ] } });
});
afterEach(cleanup);

describe('AgentKompaniyaSozlama', () => {
  it('balans, oy sarfi, limit foizi va agentlar bo‘yicha token ko‘rinadi; tannarx/ustama/dollar YO‘Q', async () => {
    const { container } = render(<AgentKompaniyaSozlama kompaniyaId={5} />);
    expect(await screen.findByText('5 000')).toBeTruthy();
    expect(screen.getAllByText('889').length).toBeGreaterThan(0);
    expect(screen.getByRole('progressbar', { name: 'Token limiti sarfi' }).getAttribute('aria-valuenow')).toBe('44');
    expect(screen.getByText('pto_smeta')).toBeTruthy();
    expect(container.textContent).not.toMatch(/\$|ustama|tannarx/i);
  });

  it('admin sozlamani o‘zgartirib saqlaydi', async () => {
    m.kompaniyaSozlamaSaqla.mockResolvedValue({ ok: true, natija: {} });
    render(<AgentKompaniyaSozlama kompaniyaId={5} />);
    await screen.findByText('5 000');
    fireEvent.click(screen.getByLabelText(/A’zolar AI kuzatuvini/));
    fireEvent.change(screen.getByLabelText(/Oylik token limiti/), { target: { value: '3000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(m.kompaniyaSozlamaSaqla).toHaveBeenCalledWith(5, { aiYoqilgan: true, tokenLimit: 3000, kuzatuvRuxsat: false }));
  });

  it('manfiy limit serverga ketmaydi; bo‘sh limit = cheklovsiz (null)', async () => {
    m.kompaniyaSozlamaSaqla.mockResolvedValue({ ok: true, natija: {} });
    render(<AgentKompaniyaSozlama kompaniyaId={5} />);
    await screen.findByText('5 000');
    fireEvent.change(screen.getByLabelText(/Oylik token limiti/), { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(m.kompaniyaSozlamaSaqla).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Oylik token limiti/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(m.kompaniyaSozlamaSaqla).toHaveBeenCalledWith(5, { aiYoqilgan: true, tokenLimit: null, kuzatuvRuxsat: true }));
  });

  it('oddiy a‘zo (huquqi yo‘q) faqat ko‘radi: maydonlar bloklangan, saqlash tugmasi yo‘q', async () => {
    m.kompaniyaSozlamaOl.mockResolvedValue(soz({ tahrir_mumkin: false }));
    render(<AgentKompaniyaSozlama kompaniyaId={5} />);
    await screen.findByText('5 000');
    expect(screen.queryByRole('button', { name: 'Saqlash' })).toBeNull();
    expect((screen.getByLabelText(/Oylik token limiti/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/admin, boss yoki direktor/)).toBeTruthy();
  });

  it('kompaniya bilimi: faqat o‘z kompaniya yozuvlari ko‘rinadi; admin yangisini yozadi (vergul bilan kalit)', async () => {
    m.bilimYoz.mockResolvedValue({ ok: true, natija: { taklif_id: 9, qabul: true, kutilmoqda: false } });
    render(<AgentKompaniyaSozlama kompaniyaId={5} />);
    expect(await screen.findByText('Ombor tartibi')).toBeTruthy();
    expect(screen.queryByText('Umumiy yozuv')).toBeNull();
    fireEvent.change(screen.getByLabelText('Sarlavha'), { target: { value: 'Tasdiq tartibi' } });
    fireEvent.change(screen.getByLabelText('Matn'), { target: { value: 'Bizda hujjatni avval PTO keyin direktor tasdiqlaydi.' } });
    fireEvent.change(screen.getByLabelText('Kalit so‘zlar (vergul bilan)'), { target: { value: 'tasdiq, tartib' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bilimni saqlash' }));
    await waitFor(() => expect(m.bilimYoz).toHaveBeenCalledWith(5, { sarlavha: 'Tasdiq tartibi', matn: 'Bizda hujjatni avval PTO keyin direktor tasdiqlaydi.', kalit: 'tasdiq, tartib' }));
  });

  it('model siyosati: admin a‘zolar model tanlashini o‘chiradi (serverga erkin=false); huquqsiz a‘zo o‘zgartira olmaydi', async () => {
    m.siyosatSaqla.mockResolvedValue({ ok: true, natija: {} });
    render(<AgentKompaniyaSozlama kompaniyaId={5} />);
    const cb = await screen.findByLabelText(/A’zolar AI modelini o‘zi tanlay olsin/);
    expect((cb as HTMLInputElement).checked).toBe(true);
    fireEvent.click(cb);
    await waitFor(() => expect(m.siyosatSaqla).toHaveBeenCalledWith(5, false));
    cleanup(); m.siyosatOl.mockResolvedValue({ ok: true, natija: { model_erkin: true, tahrir_mumkin: false } });
    render(<AgentKompaniyaSozlama kompaniyaId={5} />);
    expect(((await screen.findByLabelText(/A’zolar AI modelini o‘zi tanlay olsin/)) as HTMLInputElement).disabled).toBe(true);
  });

  it('huquqsiz a‘zo bilimni ko‘radi, lekin yoza olmaydi', async () => {
    m.kompaniyaSozlamaOl.mockResolvedValue(soz({ tahrir_mumkin: false }));
    render(<AgentKompaniyaSozlama kompaniyaId={5} />);
    expect(await screen.findByText('Ombor tartibi')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Bilimni saqlash' })).toBeNull();
  });

  it('balans 0 bo‘lsa — AI ishlamasligi aniq aytiladi', async () => {
    m.kompaniyaSozlamaOl.mockResolvedValue(soz({ balans: 0 }));
    render(<AgentKompaniyaSozlama kompaniyaId={5} />);
    expect(await screen.findByText(/Tokenlar tugagan/)).toBeTruthy();
  });
});
