import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  toast: vi.fn(), markazOl: vi.fn(), modellarOl: vi.fn(), modelTanla: vi.fn(), modelKatalogYoz: vi.fn(), byudjetBelgila: vi.fn(), ustamaBelgila: vi.fn(), orModellar: vi.fn(), orQosh: vi.fn(),
  muhitRoyxatiOl: vi.fn(), manbaHolati: vi.fn(), signallarOl: vi.fn(), rivojlanishTahlil: vi.fn(), takliflarOl: vi.fn(), buyruqlarOl: vi.fn(), taklifQarori: vi.fn(), buyruqYubor: vi.fn(),
}));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../api/t2-agent-ish', () => ({
  markazOl: m.markazOl, modellarOl: m.modellarOl, modelTanla: m.modelTanla, modelKatalogYoz: m.modelKatalogYoz, byudjetBelgila: m.byudjetBelgila, ustamaBelgila: m.ustamaBelgila, openrouterModellarOl: m.orModellar, modelOpenrouterdanQosh: m.orQosh,
  muhitRoyxatiOl: m.muhitRoyxatiOl, manbaHolati: m.manbaHolati, signallarOl: m.signallarOl, rivojlanishTahlil: m.rivojlanishTahlil,
  takliflarOl: m.takliflarOl, buyruqlarOl: m.buyruqlarOl, taklifQarori: m.taklifQarori, buyruqYubor: m.buyruqYubor,
}));

import { AiMarkaz } from './AiMarkaz';
import { AiXarajatBolimi } from './AiXarajatBolimi';
import { AiKorinish } from './AiKorinish';
import { foiz, usd, ustunBalandligi } from './ai-markaz-yordam';

const sonlar = { taklif_kutilmoqda: 2, buyruq_navbat: 1, buyruq_ishda: 0, buyruq_bitgan: 4, signal_yangi: 7, fikr_30kun: 3, qoida_faol: 9, manba_faol: 1, agent_soni: 10, model_soni: 3 };
const markaz = (o: Record<string, unknown> = {}) => ({ oy_sarfi_usd: 12.5, limit_usd: 50, ogohlantirish_foiz: 80, limit_faol: true,
  kunlar: [{ kun: '2026-10-05', narx_usd: 2, chaqiruv: 4 }, { kun: '2026-10-06', narx_usd: 6, chaqiruv: 9 }], agentlar: [{ profil: 'pto_smeta', amal: 'savol', chaqiruv: 5, narx_usd: 3.2, token: 900 }],
  modellar: [{ model: 'vendor/a', chaqiruv: 5, narx_usd: 3.2, narxsiz: 2 }], kompaniyalar: [{ kompaniya_id: 5, nom: 'NTB', narx_usd: 3.2, mijoz_usd: 4.48, token: 570, chaqiruv: 5, limit_usd: 10, ustama_foiz: 40 }], sonlar,
  ustama_foiz: 40, mijoz_oy_usd: 4.48, foyda_oy_usd: 1.28,
  sozlama: { ai_yoqilgan: false, openrouter: true, github: false }, ...o });
const katalog = [{ id: 'vendor/a', nom: 'Model A', tavsif: null, narx_izoh: null, vision: false, narx_kirish_usd: 3, narx_chiqish_usd: 15 }, { id: 'vendor/b', nom: 'Model B', tavsif: null, narx_izoh: null, vision: true }];
const agentlar = [
  { kod: 'platform_orchestrator', nom: 'Platforma orkestratori', rol: 'orchestrator', izoh: null, permission_mode: 'human_approval_required', default_scope: 'global', model_id: null, model_manba: 'standart' },
  { kod: 'pto_smeta', nom: 'PTO / smeta', rol: 'pto', izoh: null, permission_mode: 'human_approval_required', default_scope: 'object', model_id: 'vendor/a', model_manba: 'platforma' },
];

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.orModellar.mockImplementation(async (p: { ids?: string[]; q?: string }) => ({ ok: true, natija: { jami: 3, tavsiya: ['vendor/a'], talab: { min: 62, izoh: 'Raqamli xulosa va xavflarni to‘g‘ri aytishi shart' },
    natija: p.ids ? [{ id: 'vendor/a', nom: 'Model A', kirish_usd: 0.1, chiqish_usd: 0.4, kontekst: 100000, vision: true, tools: true, json: true, reasoning: false, ball: 66, manba: 'tanilgan', daraja: 'mos', talab: 62, sabablar: [], ogohlantirish: null, javob_narxi_usd: 0.0005 }, { id: 'vendor/b', nom: 'Model B', kirish_usd: 0.1, chiqish_usd: 0.4, kontekst: 100000, vision: true, tools: true, json: true, reasoning: false, ball: 66, manba: 'tanilgan', daraja: 'kuchsiz', talab: 62, sabablar: [], ogohlantirish: 'KUCHSIZ: raqamlarni noto‘g‘ri aytishi mumkin', javob_narxi_usd: 0.0005 }]
      : [{ id: 'vendor/yangi', nom: 'Yangi Model', kirish_usd: 0.1, chiqish_usd: 0.4, kontekst: 100000, vision: true, tools: true, json: true, reasoning: false, ball: 66, manba: 'tanilgan', daraja: 'juda_mos', talab: 62, sabablar: [], ogohlantirish: null, javob_narxi_usd: 0.0005 }] } }));
  m.markazOl.mockResolvedValue({ ok: true, natija: markaz() });
  m.modellarOl.mockResolvedValue({ ok: true, natija: { rol: 'superadmin', tanlash_mumkin: true, agentlar, katalog } });
  m.takliflarOl.mockResolvedValue({ ok: true, natija: { natija: [] } }); m.buyruqlarOl.mockResolvedValue({ ok: true, natija: { natija: [] } });
});
afterEach(cleanup);

describe('yordamchilar', () => {
  it('usd, foiz va ustun balandligi', () => {
    expect(usd(0.0042)).toBe('$0.0042'); expect(usd(12.5)).toBe('$12.50'); expect(usd(null)).toBe('—'); expect(usd(0)).toBe('$0.00');
    expect(foiz(25, 50)).toBe(50); expect(foiz(80, 50)).toBe(100); expect(foiz(1, 0)).toBe(0);
    expect(ustunBalandligi([{ narx_usd: 2 }, { narx_usd: 4 }])).toEqual([50, 100]); expect(ustunBalandligi([{ narx_usd: 0 }])).toEqual([4]);
  });
});

describe('AiKorinish — tayyorlik', () => {
  it('limit yo‘q bo‘lsa AI ISHLAMASLIGI aniq aytiladi va limit bo‘limiga o‘tish tugmasi bor', () => {
    const och = vi.fn();
    render(<AiKorinish m={markaz({ limit_usd: null, limit_faol: false }) as never} bolimOch={och} />);
    expect(screen.getByText('AI hali ishga tayyor emas')).toBeTruthy();
    expect(screen.getByText(/AI ISHLAMAYDI/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Limit belgilash' }));
    expect(och).toHaveBeenCalledWith('xarajat');
  });
  it('hamma tayyor bo‘lsa — «AI ishga tayyor»; sarf va limit foizi ko‘rinadi', () => {
    render(<AiKorinish m={markaz({ sozlama: { ai_yoqilgan: true, openrouter: true, github: true } }) as never} bolimOch={() => undefined} />);
    expect(screen.getByText('AI ishga tayyor')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Limit sarfi' }).getAttribute('aria-valuenow')).toBe('25');
    expect(screen.getByText('$12.50')).toBeTruthy();
  });
});

describe('AiMarkaz', () => {
  it('bo‘limlar nishonlarda kutayotgan sonlarni ko‘rsatadi; agentlar tizim va kompaniya guruhlariga ajraladi', async () => {
    render(<AiMarkaz kompaniyalar={[{ id: 5, nom: 'NTB' }]} />);
    expect(await screen.findByText('AI ishga tayyor')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Takliflar va ishlar/ }).textContent).toContain('2');
    fireEvent.click(screen.getByRole('button', { name: /Agentlar va modellar/ }));
    expect(await screen.findByText('Tizim agentlari')).toBeTruthy();
    expect(screen.getByText('Kompaniya agentlari — standart model')).toBeTruthy();
    m.modelTanla.mockResolvedValue({ ok: true, natija: {} });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /Model — PTO/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Model B/ }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('KUCHSIZ'));           // kuchsiz model — sabab bilan tasdiq so'raladi
    await waitFor(() => expect(m.modelTanla).toHaveBeenCalledWith(null, 'pto_smeta', 'vendor/b'));
  });

  it('galereyaga model narxi bilan qo‘shiladi', async () => {
    m.modelKatalogYoz.mockResolvedValue({ ok: true, natija: {} });
    render(<AiMarkaz kompaniyalar={[]} />);
    fireEvent.click(await screen.findByRole('button', { name: /Agentlar va modellar/ }));
    await screen.findByText('Modellar galereyasi');
    fireEvent.change(screen.getByPlaceholderText('ishlab-chiqaruvchi/model-nomi'), { target: { value: 'vendor/c' } });
    fireEvent.change(screen.getByPlaceholderText('Ko‘rinadigan nom'), { target: { value: 'Model C' } });
    const narx = screen.getAllByPlaceholderText('0.00');
    fireEvent.change(narx[0], { target: { value: '2.5' } }); fireEvent.change(narx[1], { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Katalogga qo‘shish' }));
    await waitFor(() => expect(m.modelKatalogYoz).toHaveBeenCalledWith({ id: 'vendor/c', nom: 'Model C', vision: false, narxKirishUsd: 2.5, narxChiqishUsd: 10 }));
  });

  it('ruxsatsiz (superadmin emas) bo‘lsa xato xabari ko‘rinadi, hech narsa ochilmaydi', async () => {
    m.markazOl.mockResolvedValue({ ok: false, error: 'Bu doiraga ruxsat yo‘q' });
    render(<AiMarkaz kompaniyalar={[]} />);
    expect((await screen.findByRole('alert')).textContent).toContain('ruxsat yo‘q');
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});

describe('AiXarajatBolimi', () => {
  it('platforma limitini saqlaydi; manfiy/bo‘sh limit serverga ketmaydi; kill-switch limitni nofaol qiladi', async () => {
    m.byudjetBelgila.mockResolvedValue({ ok: true, natija: {} });
    const yangila = vi.fn();
    render(<AiXarajatBolimi m={markaz({ limit_usd: null, limit_faol: false }) as never} kompaniyalar={[]} yangila={yangila} />);
    const [plLimit] = screen.getAllByPlaceholderText('50');
    fireEvent.click(screen.getAllByRole('button', { name: 'Saqlash' })[1]);
    expect(m.byudjetBelgila).not.toHaveBeenCalled();
    fireEvent.change(plLimit, { target: { value: '120' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Saqlash' })[1]);
    await waitFor(() => expect(m.byudjetBelgila).toHaveBeenCalledWith(null, 120, 80, true));
    expect(yangila).toHaveBeenCalled();
  });

  it('kompaniya limiti; narxi noma’lum chaqiruvlar haqida ogohlantirish; kill-switch', async () => {
    m.byudjetBelgila.mockResolvedValue({ ok: true, natija: {} });
    render(<AiXarajatBolimi m={markaz() as never} kompaniyalar={[{ id: 5, nom: 'NTB' }, { id: 6, nom: 'Boshqa' }]} yangila={() => undefined} />);
    expect(screen.getByText(/2 ta chaqiruvning narxi noma’lum/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Kompaniya', { selector: 'select' }), { target: { value: '6' } });
    fireEvent.change(screen.getAllByPlaceholderText('50')[1], { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kompaniya limitini saqlash' }));
    await waitFor(() => expect(m.byudjetBelgila).toHaveBeenCalledWith(6, 15, 80, true));
    fireEvent.click(screen.getByRole('button', { name: /kill-switch/ }));
    await waitFor(() => expect(m.byudjetBelgila).toHaveBeenCalledWith(null, 50, 80, false));
  });
});

describe('ModelTanlagich — ishga qarab tavsiya va ogohlantirish', () => {
  it('kuchsiz modelni tanlashni rad etsa — hech narsa saqlanmaydi', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<AiMarkaz kompaniyalar={[]} />);
    fireEvent.click(await screen.findByRole('button', { name: /Agentlar va modellar/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Model — PTO/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Model B/ }));
    expect(m.modelTanla).not.toHaveBeenCalled();
  });
  it('tavsiya belgisi, moslik nishoni va talab; joriy model kuchsiz bo‘lsa doimiy ogohlantirish ko‘rinadi', async () => {
    m.modellarOl.mockResolvedValue({ ok: true, natija: { rol: 'superadmin', tanlash_mumkin: true, agentlar: [{ ...agentlar[1], model_id: 'vendor/b' }], katalog } });
    render(<AiMarkaz kompaniyalar={[]} />);
    fireEvent.click(await screen.findByRole('button', { name: /Agentlar va modellar/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('KUCHSIZ');
    fireEvent.click(screen.getByRole('button', { name: /Model — PTO/ }));
    expect((await screen.findAllByText('Tavsiya')).length).toBeGreaterThan(0);
  });
  it('superadmin OpenRouter ro‘yxatidan qidirib, katalogda yo‘q modelni tanlasa — avval katalogga qo‘shiladi, keyin tayinlanadi', async () => {
    m.orQosh.mockResolvedValue({ ok: true, natija: {} }); m.modelTanla.mockResolvedValue({ ok: true, natija: {} });
    render(<AiMarkaz kompaniyalar={[]} />);
    fireEvent.click(await screen.findByRole('button', { name: /Agentlar va modellar/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Model — PTO/ }));
    fireEvent.change(await screen.findByPlaceholderText(/Model nomini qidiring/), { target: { value: 'yangi' } });
    fireEvent.click(await screen.findByRole('option', { name: /Yangi Model/ }));
    await waitFor(() => expect(m.modelTanla).toHaveBeenCalledWith(null, 'pto_smeta', 'vendor/yangi'));
    expect(m.orQosh).toHaveBeenCalledWith('vendor/yangi');
    expect(m.orQosh.mock.invocationCallOrder[0]).toBeLessThan(m.modelTanla.mock.invocationCallOrder[0]);
  });
});

describe('AiXarajatBolimi — ustama va foyda', () => {
  it('standart ustama saqlanadi; misol «$5 → $7.00» jonli hisoblanadi; foyda ko‘rinadi', async () => {
    m.ustamaBelgila.mockResolvedValue({ ok: true, natija: {} });
    const yangila = vi.fn();
    render(<AiXarajatBolimi m={markaz() as never} kompaniyalar={[{ id: 5, nom: 'NTB' }]} yangila={yangila} />);
    expect(screen.getByText('$1.28')).toBeTruthy();
    expect(screen.getByText('$7.00')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Standart ustama (%)'), { target: { value: '60' } });
    expect(screen.getByText('$8.00')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Saqlash' })[0]);
    await waitFor(() => expect(m.ustamaBelgila).toHaveBeenCalledWith(null, 60));
    expect(yangila).toHaveBeenCalled();
  });

  it('kompaniya ustamasi alohida; standartga qaytarish — null; noto‘g‘ri qiymat serverga ketmaydi', async () => {
    m.ustamaBelgila.mockResolvedValue({ ok: true, natija: {} });
    render(<AiXarajatBolimi m={markaz() as never} kompaniyalar={[{ id: 5, nom: 'NTB' }]} yangila={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Ustama kompaniyasi'), { target: { value: '5' } });
    fireEvent.change(screen.getAllByLabelText('Ustama (%)')[0], { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kompaniya ustamasini saqlash' }));
    expect(m.ustamaBelgila).not.toHaveBeenCalled();
    fireEvent.change(screen.getAllByLabelText('Ustama (%)')[0], { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kompaniya ustamasini saqlash' }));
    await waitFor(() => expect(m.ustamaBelgila).toHaveBeenCalledWith(5, 25));
    fireEvent.click(screen.getByRole('button', { name: 'Standartga qaytarish' }));
    await waitFor(() => expect(m.ustamaBelgila).toHaveBeenCalledWith(5, null));
  });
});

