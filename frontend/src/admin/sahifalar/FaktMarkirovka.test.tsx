import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * JQA-03: Daraxt «Markirovka bo‘yicha 100%» — oshgan faktni (120 / 100) HECH QACHON kamaytirmaydi; qatorma-qator
 * fakt_belgila_v2 emas, bitta fakt_yoz_v2 qamrov tranzaksiyasi; kamaytirish — faqat alohida «Tuzatish» (preview bilan).
 */
const m = vi.hoisted(() => ({ yoz: vi.fn(), belgila: vi.fn(), toast: vi.fn(), id: 0 }));
vi.mock('../../test02/KompaniyaTanlov', () => ({ useKompaniya: () => ({ joriy: { id: 1 } }) }));
vi.mock('../../api/supabase', () => ({
  sbT2ObyektlarOlKomp: async () => ({ ok: true, qatorlar: [{ id: 8, nom: 'Obyekt' }] }),
  // 1 bo'lim: ish 22 (МАТ, oshgan 120/100), ish 23 (МАТ, 40/100), ish 24 (boshqa kat), ichki mat 25 (МАТ, ishi 24) 0/10.
  sbT2DaraxtOl: async () => ({ ok: true, qatorlar: [
    { id: 1, tur: 'rz', nom: 'Bo‘lim', ota_id: null, versiya: 1 },
    { id: 22, tur: 'bl', hajm: 100, nom: 'Oshgan ish', kat: 'МАТ', ota_id: 1, versiya: 1 },
    { id: 23, tur: 'bl', hajm: 100, nom: 'Qisman ish', kat: 'МАТ', ota_id: 1, versiya: 1 },
    { id: 24, tur: 'bl', hajm: 50, nom: 'Boshqa ish', kat: 'ЧЕЛ', ota_id: 1, versiya: 1 },
    { id: 25, tur: 'mat', hajm: 10, nom: 'Ichki material', kat: 'МАТ', ota_id: 24, versiya: 1 },
  ] }),
  sbT2QatorHolatOl: async () => ({ ok: true, qatorlar: [
    { qator_id: 22, smeta_hajm: 100, fakt_hajm: 120 }, { qator_id: 23, smeta_hajm: 100, fakt_hajm: 40 },
    { qator_id: 24, smeta_hajm: 50, fakt_hajm: 0 }, { qator_id: 25, smeta_hajm: 10, fakt_hajm: 0 },
  ] }),
  sbT2TreeQur: () => [{ id: 1, type: 'rz', nom: 'Bo‘lim', children: [] }],
  yangiOperationId: () => `00000000-0000-4000-8000-00000000000${++m.id}`,
  sbT2AktBekor: vi.fn(),
}));
vi.mock('../../api/t2-fakt', () => ({ sbFaktYoz: m.yoz, sbFaktBelgilaV2: m.belgila }));
vi.mock('../../api/t2-bajarilmadi', async (orig) => ({ ...(await orig<typeof import('../../api/t2-bajarilmadi')>()), bajarilmadiRoyxatOl: async () => ({ ok: true, qatorlar: [] }) }));
vi.mock('../../api/t2-price-control', () => ({ priceControlOl: async () => ({ ok: true, qatorlar: [] }) }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../umumiy/ui/SummaJuft', () => ({ SummaJuft: () => <span>summa</span> }));
vi.mock('../../umumiy/daraxt/SmetaTree', () => ({ SmetaTree: () => <div>Daraxt</div> }));
vi.mock('./FaktJurnal', () => ({ FaktJurnal: () => null }));
vi.mock('./XotiradanFakt', () => ({ XotiradanFakt: () => null }));
import { FaktNative } from './FaktNative';
import { urinishOchir, yozilganOchir } from '../../lib/fakt-qamrov-urinish';

afterEach(() => { cleanup(); vi.clearAllMocks(); m.id = 0; urinishOchir(1, 8); yozilganOchir(1, 8); });

async function markirovkaOch() {
  render(<MemoryRouter initialEntries={['/admin/fakt?obyekt=8']}><FaktNative /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Daraxt' }));
  await screen.findByText('Daraxt', { selector: 'div' });
  const marker = await screen.findByLabelText('Fakt markirovkasi');
  await waitFor(() => expect(marker.querySelector('option[value="МАТ"]')).not.toBeNull());
  fireEvent.change(marker, { target: { value: 'МАТ' } });
  fireEvent.click(screen.getByRole('button', { name: '100% qilish' }));
  return screen.findByRole('dialog', { name: 'Qamrov %' });
}

describe('Markirovka 100% (JQA-03)', () => {
  it('120/100 kamaytirilmaydi: oshgan qator «allaqachon ≥100%», yozuv faqat oshiradi — bitta fakt_yoz_v2, fakt_belgila_v2 yo‘q', async () => {
    m.yoz.mockResolvedValue({ ok: true, akt_id: 5 });
    await markirovkaOch();
    expect(m.belgila).not.toHaveBeenCalled();
    expect(screen.getByTestId('qamrov-oshgan-soni').textContent).toMatch(/1$/);
    expect(screen.getByTestId('qamrov-jami').textContent).toMatch(/^2 qator yoziladi/); // 23: +60, 25: +10 (ishi boshqa kat)
    fireEvent.click(screen.getByRole('button', { name: /^Faktga yozish/ }));
    await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(1));
    const qatorlar = m.yoz.mock.calls[0][0].qatorlar as { qator_id: number; hajm: number }[];
    expect(qatorlar).toEqual([{ qator_id: 23, hajm: 60 }, { qator_id: 25, hajm: 10 }]);
    expect(qatorlar.every((q) => q.hajm > 0)).toBe(true);
    expect(m.belgila).not.toHaveBeenCalled();
  });

  it('kamaytirish faqat alohida «Tuzatish»: preview (eski → yangi, farq) va aniq tugma; faqat tanlangan oshgan qator', async () => {
    m.yoz.mockResolvedValue({ ok: true, akt_id: 6 });
    await markirovkaOch();
    expect(screen.queryByTestId('tuzatish-yoz')).toBeNull();
    fireEvent.click(screen.getByTestId('tuzatish-och'));
    const qator = screen.getByTestId('tuzatish-22');
    expect(qator.textContent).toMatch(/120/);
    expect(qator.textContent).toMatch(/-20/);
    expect(m.yoz).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('tuzatish-yoz'));
    await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(1));
    expect(m.yoz.mock.calls[0][0]).toMatchObject({ qatorlar: [{ qator_id: 22, hajm: -20 }] });
    expect(String(m.yoz.mock.calls[0][0].izoh)).toMatch(/^Tuzatish/);
    expect(m.belgila).not.toHaveBeenCalled();
  });
});
