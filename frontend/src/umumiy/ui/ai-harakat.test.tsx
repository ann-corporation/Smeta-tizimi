// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({
  sklad: vi.fn(), grafik: vi.fn(), agentYoz: vi.fn(), qaror: vi.fn(), natija: vi.fn(),
}));
vi.mock('../../api/supabase', () => ({ sbSkladgaYozish: m.sklad, yangiOperationId: () => 'op-1' }));
vi.mock('../../api/t2-grafik', () => ({ sbGrafikYangila: m.grafik }));
vi.mock('../../api/t2-agent-ish', () => ({ agentYoz: m.agentYoz, harakatQarori: m.qaror, harakatNatijasi: m.natija }));
vi.mock('../../i18n/til', () => ({ t: (s: string) => s }));

import { harakatniBajar } from './ai-harakat';
import { AiHarakatKarta } from './AiHarakatKarta';
import type { HarakatTaklif } from '../../api/t2-agent-ish';

beforeEach(() => { Object.values(m).forEach((f) => f.mockReset()); m.qaror.mockResolvedValue({ ok: true, natija: { holat: 'tasdiqlandi' } }); m.natija.mockResolvedValue({ ok: true }); });
afterEach(cleanup);

describe('harakatniBajar — foydalanuvchining o‘z sessiyasi orqali mavjud gateway', () => {
  it('ombor kirimi: prixod, operation_id bilan; chiqimi: rasxod', async () => {
    m.sklad.mockResolvedValue({ ok: true });
    const r = await harakatniBajar(5, 'ombor_kirim', { obyekt_id: 7, nomi: 'Sement', birligi: 'tonna', obyomi: '5', sana: '2026-10-06' });
    expect(r.ok).toBe(true);
    expect(m.sklad).toHaveBeenCalledWith(5, 'prixod', expect.objectContaining({ obyekt_id: 7, nomi: 'Sement', obyomi: 5, operation_id: 'op-1', operatsiya: 'prixod' }));
    await harakatniBajar(5, 'ombor_chiqim', { obyekt_id: 7, nomi: 'Sement', birligi: 'tonna', obyomi: 2 });
    expect(m.sklad).toHaveBeenLastCalledWith(5, 'rasxod', expect.objectContaining({ operatsiya: 'rasxod' }));
  });
  it('noto‘g‘ri miqdor yoki foiz gatewayga umuman bormaydi', async () => {
    expect((await harakatniBajar(5, 'ombor_kirim', { obyekt_id: 7, nomi: 'x', birligi: 't', obyomi: 0 })).ok).toBe(false);
    expect((await harakatniBajar(5, 'grafik_foiz', { grafik_id: 3, foiz: 120, kutilgan_versiya: 1 })).ok).toBe(false);
    expect(m.sklad).not.toHaveBeenCalled(); expect(m.grafik).not.toHaveBeenCalled();
  });
  it('grafik: foizga qarab holat; versiya bilan (optimistik qulf)', async () => {
    m.grafik.mockResolvedValue({ ok: true });
    await harakatniBajar(5, 'grafik_foiz', { grafik_id: 3, foiz: 100, kutilgan_versiya: 4 });
    expect(m.grafik).toHaveBeenCalledWith(3, 4, { foiz: 100, holat: 'bajarildi' });
    await harakatniBajar(5, 'grafik_foiz', { grafik_id: 3, foiz: 40, kutilgan_versiya: 5 });
    expect(m.grafik).toHaveBeenLastCalledWith(3, 5, { foiz: 40, holat: 'jarayonda' });
  });
  it('xato xabari foydalanuvchiga qaytadi; eslatma — xotiraga', async () => {
    m.sklad.mockResolvedValue({ ok: false, error: 'Ruxsat yo‘q' });
    expect(await harakatniBajar(5, 'ombor_kirim', { obyekt_id: 7, nomi: 'x', birligi: 't', obyomi: 1 })).toMatchObject({ ok: false, xabar: 'Ruxsat yo‘q' });
    m.agentYoz.mockResolvedValue({ ok: true, natija: {} });
    expect((await harakatniBajar(5, 'eslatma', { kalit: 'ombor.eslatma', mazmun: 'Sement kam' })).ok).toBe(true);
    expect(m.agentYoz).toHaveBeenCalledWith('xotira_yoz', 5, { kalit: 'ombor.eslatma', mazmun: 'Sement kam' });
    expect((await harakatniBajar(5, 'nomalum', {})).ok).toBe(false);
  });
});

const h = (o: Partial<HarakatTaklif> = {}): HarakatTaklif => ({ id: 9, amal: 'ombor_kirim', parametrlar: { obyekt_id: 7, nomi: 'Sement M400', birligi: 'tonna', obyomi: 5, sana: '2026-10-06' }, xavf: 'orta', avto: false, ogohlantirish: null, tushuntirish: '5 t sement kirimi', ...o });

describe('AiHarakatKarta — qaror foydalanuvchida', () => {
  it('o‘rta xavf: qiymatlar ko‘rinadi va tahrirlanadi; tasdiq → qaror → bajarish → natija yoziladi', async () => {
    m.sklad.mockResolvedValue({ ok: true });
    render(<AiHarakatKarta h={h()} kompaniyaId={5} />);
    expect(screen.getByText('O‘rta xavf — tasdiq kerak')).toBeTruthy(); expect(screen.getByText('5 t sement kirimi')).toBeTruthy();
    expect(m.sklad).not.toHaveBeenCalled();                       // tasdiqsiz hech narsa bajarilmaydi
    fireEvent.change(screen.getByLabelText('Miqdor'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tasdiqlash va bajarish' }));
    await waitFor(() => expect(screen.getByText(/Omborga yozildi/)).toBeTruthy());
    expect(m.qaror).toHaveBeenCalledWith(9, 'tasdiqlash');
    expect(m.sklad).toHaveBeenCalledWith(5, 'prixod', expect.objectContaining({ obyomi: 6 }));   // foydalanuvchi tahriri bajarilgan
    expect(m.natija).toHaveBeenCalledWith(9, true, expect.objectContaining({ obyomi: 6 }));
  });
  it('rad etish: gateway/ombor chaqirilmaydi, qaror yoziladi', async () => {
    render(<AiHarakatKarta h={h()} kompaniyaId={5} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rad etish' }));
    await waitFor(() => expect(screen.getByText(/hech narsa o‘zgarmadi/)).toBeTruthy());
    expect(m.qaror).toHaveBeenCalledWith(9, 'rad'); expect(m.sklad).not.toHaveBeenCalled();
  });
  it('YUQORI xavf: ogohlantirish ko‘rinadi, «tushundim» belgisisiz bajarib bo‘lmaydi', async () => {
    m.sklad.mockResolvedValue({ ok: true });
    render(<AiHarakatKarta h={h({ amal: 'ombor_chiqim', xavf: 'yuqori', ogohlantirish: 'Qoldiq manfiy bo‘ladi' })} kompaniyaId={5} />);
    expect(screen.getByRole('alert').textContent).toContain('manfiy');
    const tugma = screen.getByRole('button', { name: 'Baribir bajarish' }) as HTMLButtonElement;
    expect(tugma.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Xavfni tushundim/));
    expect(tugma.disabled).toBe(false);
    fireEvent.click(tugma);
    await waitFor(() => expect(m.sklad).toHaveBeenCalled());
  });
  it('avto (past xavf + foydalanuvchi ruxsati): o‘zi bajariladi, bir marta, «avtomatik» deb ko‘rsatiladi', async () => {
    m.agentYoz.mockResolvedValue({ ok: true, natija: {} });
    render(<AiHarakatKarta h={h({ amal: 'eslatma', xavf: 'past', avto: true, parametrlar: { kalit: 'ombor.eslatma', mazmun: 'Sement kam' } })} kompaniyaId={5} />);
    await waitFor(() => expect(screen.getByText(/avtomatik/)).toBeTruthy());
    expect(m.agentYoz).toHaveBeenCalledTimes(1);
    expect(m.qaror).not.toHaveBeenCalled();                        // avto: qaror so'ralmaydi, lekin natija jurnalga yoziladi
    expect(m.natija).toHaveBeenCalledWith(9, true, expect.anything());
  });
  it('bajarish xatosi foydalanuvchiga ko‘rsatiladi va natija «xato» deb yoziladi', async () => {
    m.grafik.mockResolvedValue({ ok: false, error: 'Versiya eskirgan' });
    render(<AiHarakatKarta h={h({ amal: 'grafik_foiz', parametrlar: { grafik_id: 3, nom: 'Poydevor', eski_foiz: 40, foiz: 70, kutilgan_versiya: 2 } })} kompaniyaId={5} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tasdiqlash va bajarish' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Versiya eskirgan'));
    expect(m.natija).toHaveBeenCalledWith(9, false, expect.anything());
  });
});
