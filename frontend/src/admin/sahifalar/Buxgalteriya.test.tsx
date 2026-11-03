import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BuxHolat } from '../../api/t2-bux-hisob';

const m = vi.hoisted(() => ({
  holat: vi.fn(), avto: vi.fn(), boshlash: vi.fn(), kontragent: vi.fn(), osv: vi.fn(), toast: vi.fn(),
}));
vi.mock('../../api/t2-bux-hisob', async (orig) => ({
  ...(await orig<typeof import('../../api/t2-bux-hisob')>()),
  buxHolatOl: m.holat, buxAvto: m.avto, buxBoshlash: m.boshlash, buxKontragentOl: m.kontragent, buxOsvOl: m.osv,
}));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../test02/KompaniyaTanlov', () => ({ useKompaniya: () => ({ joriy: { id: 1 } }) }));

import { Buxgalteriya } from './Buxgalteriya';

const holat = (p: Partial<BuxHolat>): BuxHolat => ({ ok: true, boshlangan: true, hisoblar: [], moslik: [], davrlar: [], provodka_soni: 0, oxirgi_sana: null, ...p });

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Buxgalteriya', () => {
  it('boshlanmagan: «Boshlash» ko‘rinadi va reja yaratadi', async () => {
    m.holat.mockResolvedValue({ ok: true, natija: holat({ boshlangan: false }) });
    m.boshlash.mockResolvedValue({ ok: true });
    render(<Buxgalteriya />);
    fireEvent.click(await screen.findByRole('button', { name: 'Boshlash' }));
    await waitFor(() => expect(m.boshlash).toHaveBeenCalledTimes(1));
  });

  it('hujjatlardan tayyor provodka bannerda, kontragent hisob-kitobi qatorlari ko‘rinadi', async () => {
    m.holat.mockResolvedValue({ ok: true, natija: holat({}) });
    m.avto.mockResolvedValue({ ok: true, dry: true, yangi: 3, storno: 0, f3_summasiz: 2, asos_summasiz: 0 });
    m.kontragent.mockResolvedValue({ ok: true, natija: { ok: true, dan: '2026-01-01', gacha: '2026-01-31', hujjatlar: null, kontragent: null, kompaniya: null, qatorlar: [
      { kontragent_id: 5, kontragent: 'TEST BUYURTMACHI', inn: null, kod: '4010', nom_uz: 'x', nom_ru: 'x', ochilish: 0, dt: 1120, kt: 0, yopilish: 1120 },
    ] } });
    render(<Buxgalteriya />);
    expect(await screen.findByText(/3 ta yangi provodka tayyor/)).toBeTruthy();
    expect(await screen.findByText(/Forma-3: 2/)).toBeTruthy();
    const jadval = await screen.findByRole('table', { name: 'Kontragent bilan hisob-kitob' });
    expect(jadval.textContent).toContain('TEST BUYURTMACHI');
  });

  it('oborot-saldo: muvozanat xabari', async () => {
    m.holat.mockResolvedValue({ ok: true, natija: holat({}) });
    m.avto.mockResolvedValue({ ok: true, dry: true, yangi: 0, storno: 0 });
    m.kontragent.mockResolvedValue({ ok: true, natija: { ok: true, dan: 'a', gacha: 'b', hujjatlar: null, kontragent: null, kompaniya: null, qatorlar: [] } });
    m.osv.mockResolvedValue({ ok: true, natija: { ok: true, dan: 'a', gacha: 'b', qatorlar: [], jami_dt: 5, jami_kt: 5, jami_ochilish: 0 } });
    render(<Buxgalteriya />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Oborot-saldo' }));
    expect(await screen.findByText(/hisob muvozanatda/)).toBeTruthy();
  });
});
