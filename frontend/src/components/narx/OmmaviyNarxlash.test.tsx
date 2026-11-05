import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

// Synthetic data only.
const m = vi.hoisted(() => ({
  takliflar: vi.fn(), hudud: vi.fn(), manbaYoz: vi.fn(), bogla: vi.fn(), narxla: vi.fn(), internet: vi.fn(), tajriba: vi.fn(), token: vi.fn(), tartib: [] as string[],
}));
vi.mock('../../api/t2-narx-dalil', () => ({ sbNarxTakliflarOl: m.takliflar, obyektHududOl: m.hudud, sbNarxManbaYoz: m.manbaYoz, sbNarxDalilBogla: m.bogla }));
vi.mock('../../api/t2-smeta-narxlash', () => ({ sbT2SmetaNarxlaRes: m.narxla }));
vi.mock('../../api/smeta-ai', () => ({ smetachiNarxInternet: m.internet, narxTajribaYoz: m.tajriba }));
vi.mock('../../api/t2-token', () => ({ tokenHolatOl: m.token }));
vi.mock('../../api/supabase', () => ({ yangiOperationId: () => '00000000-0000-4000-8000-000000000001' }));
import { OmmaviyNarxlash } from './OmmaviyNarxlash';

const q = (id: number, nom: string, birlik: string) => ({ id, obyekt_id: 5, obyekt: null, kompaniya_id: 17, ota_id: null, daraja: 2, tartib: id, tur: 'rs', kod: null, nom, birlik, hajm: 1, narx: null, summa: null, kat: 'МАТ', narx_usul: null, qoshimcha: null, zamena: null });

describe('OmmaviyNarxlash — ko‘rib chiqish → mavjud yozish yo‘li', () => {
  it('mahalliy taklif bepul, qolgani internetdan; qabul: reestr → smeta narxi → dalil', async () => {
    m.hudud.mockResolvedValue({ hudud: 'Navoiy', lat: null, lng: null });
    m.token.mockResolvedValue({ ok: true, natija: { sozlama: { usd_kurs: 10000, token_som: 100 } } });
    m.takliflar.mockImplementation(async () => {
      m.tartib.push('takliflar');
      return { ok: true, qatorlar: [
        { qator_id: 1, manba_qator_id: 501, manba_id: 50, manba_tur: 'katalog', manba_nom: 'Katalog', manba_sana: '2026-10-01', yil: null, kvartal: null, nds_holati: 'nds_siz', manba_nom_qator: 'Песок', manba_birlik: 'м3', manba_narx: 100, platforma: true },
        // The registry row exists only after the accepted internet price was written.
        ...(m.tartib.includes('reestr') ? [{ qator_id: 2, manba_qator_id: 901, manba_id: 90, manba_tur: 'boshqa', manba_nom: 'Internet', manba_sana: new Date().toISOString().slice(0, 10),
          yil: null, kvartal: null, nds_holati: 'nds_siz', manba_nom_qator: 'Цемент', manba_birlik: 'т', manba_narx: 1000, platforma: false }] : []),
      ] };
    });
    m.internet.mockResolvedValue({ ok: true, model: 'x', natijalar: [{ id: 'g0', narx: 1000, izoh: '', ishonch: 'yuqori', manbalar: [
      { url: 'https://shop.example/c', nom: '', narx: 1120, birlik: 'т', nds: 'bilan', sotuvchi: 'Shop', domen: 'shop.example', tekshirildi: true, sabab: null, smetaNarx: 1000, koef: 1, ishonch: 'yuqori' }] }] });
    m.manbaYoz.mockImplementation(async () => { m.tartib.push('reestr'); return { ok: true, id: 90 }; });
    m.narxla.mockImplementation(async () => { m.tartib.push('narx'); return { ok: true, yozildi: 2, narxsiz_qoldi: 0 }; });
    m.bogla.mockImplementation(async () => { m.tartib.push('dalil'); return { ok: true, boglandi: 2 }; });
    m.tajriba.mockResolvedValue({ ok: true, yozildi: 1 });

    render(<OmmaviyNarxlash kompaniyaId={17} obyektId={5} qatorlar={[q(1, 'Песок', 'м3'), q(2, 'Цемент', 'т')] as never} nolHam={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Barcha narxsiz qatorlarni narxlash' }));
    await screen.findByText(/Mahalliy manbalardan/);
    m.tartib.length = 0;
    fireEvent.click(screen.getByRole('button', { name: 'Internetdan qidirishni boshlash' }));
    await screen.findByRole('button', { name: /Yuqori ishonchlilarni qabul qilish/ });
    fireEvent.click(screen.getByRole('button', { name: /Yuqori ishonchlilarni qabul qilish/ }));
    fireEvent.click(screen.getByRole('button', { name: /Qabul qilinganlarni yozish \(2\)/ }));
    await waitFor(() => expect(m.bogla).toHaveBeenCalled());
    expect(m.tartib).toEqual(['reestr', 'narx', 'takliflar', 'dalil']);
    expect(m.manbaYoz.mock.calls[0][0]).toMatchObject({ malumot: { tur: 'boshqa', nds_holati: 'nds_siz' }, qatorlar: [{ nom: 'Цемент', birlik: 'т', narx: 1000 }] });
    expect(m.narxla.mock.calls[0][0].narxlar).toEqual(expect.arrayContaining([{ nom: 'Песок', birlik: 'м3', narx: 100 }, { nom: 'Цемент', birlik: 'т', narx: 1000 }]));
    expect(m.bogla.mock.calls[0][2]).toEqual(expect.arrayContaining([expect.objectContaining({ qator_id: 1, manba_qator_id: 501 }), expect.objectContaining({ qator_id: 2, manba_qator_id: 901 })]));
  });
});
