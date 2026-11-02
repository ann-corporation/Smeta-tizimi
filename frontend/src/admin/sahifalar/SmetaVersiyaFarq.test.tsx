import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

/* Sintetik ma'lumot; tarmoq yo'q. */
const api = vi.hoisted(() => ({
  versiyalarOl: vi.fn(async () => ({ ok: true, qatorlar: [{ id: 5, kompaniya_id: 1, obyekt_id: 7, nom: 'Ekspertizagacha', tur: 'ekspertizaga_topshirilgan', manba_sana: '2026-05-15', manba_fayllar: [], bazaviy_revision_id: null, holat: 'tayyor', pozitsiya_soni: 2, izoh: null, yaratildi: '', yangilandi: '' }] })),
  pozitsiyalarOl: vi.fn(async () => ({ ok: true, toliq: true, qatorlar: [
    { id: 11, versiya_id: 5, tartib: 0, ls_kod: '01-01', ls_nom: 'СИНТЕТИКА', razdel: null, blok: null, raqam: '1', kod: 'M', nom: 'ИШ А', birlik: 'М3', hajm: 100, resurslar: [] },
    { id: 12, versiya_id: 5, tartib: 1, ls_kod: '01-01', ls_nom: 'СИНТЕТИКА', razdel: null, blok: null, raqam: '2', kod: 'M', nom: 'ИШ Б', birlik: 'М3', hajm: 10, resurslar: [] }] })),
  mosliklarOl: vi.fn(async () => ({ ok: true, toliq: true, qatorlar: [
    { id: 21, versiya_id: 5, pozitsiya_id: 11, qator_id: 101, holat: 'kamaygan', ishonch: 100, usul: '', birlik_farq: false, eski_hajm: 100, joriy_hajm: 80, joriy_kod: 'M', joriy_nom: 'ИШ А', joriy_birlik: 'М3', tasdiq: 'avto', qaror: 'qisman', qurilgan_hajm: 95, qaror_izoh: null, qaror_vaqt: null, versiya: 2 },
    { id: 22, versiya_id: 5, pozitsiya_id: 12, qator_id: null, holat: 'ochirilgan', ishonch: null, usul: '', birlik_farq: false, eski_hajm: 10, joriy_hajm: null, joriy_kod: null, joriy_nom: null, joriy_birlik: null, tasdiq: 'avto', qaror: 'kutilmoqda', qurilgan_hajm: null, qaror_izoh: null, qaror_vaqt: null, versiya: 1 }] })),
  faollashtirishPozitsiyalariOl: vi.fn(async () => ({ ok: true, toliq: true, qatorlar: [
    { id: 11, versiya_id: 5, tartib: 0, ls_kod: null, ls_nom: 'ЭСКИ', razdel: null, blok: null, raqam: null, kod: 'M', nom: 'ИШ А', birlik: 'М3', hajm: 100, resurslar: null, manba: { qator_id: 501, tur: 'mat' } }] })),
  eskiQatorlarOl: vi.fn(async () => ({ ok: true, toliq: true, qatorlar: [
    { id: 500, ota_id: null, tur: 'rz', kat: null, hajm: null, narx: null, summa: 1000 },
    { id: 501, ota_id: 500, tur: 'mat', kat: 'МАТ', hajm: 100, narx: 10, summa: 1000 }] })),
  eskiF2Ol: vi.fn(async () => ({ ok: true, toliq: true, qatorlar: [{ qator_id: 501, f2_hajm: 30, f2_summa: 300 }] })),
  qarorYoz: vi.fn(), moslikYoz: vi.fn(), pozitsiyaYoz: vi.fn(), versiyaYarat: vi.fn(), versiyaBekor: vi.fn(),
  versiyaXatoMatni: () => 'xato',
}));
vi.mock('../../api/t2-smeta-versiya', () => api);
vi.mock('../../umumiy/ui/useUstamaliSumma', () => ({ useUstamaliSumma: () => ({ holat: 'yuklanmoqda', hisobla: () => null, retry: () => undefined }) }));

import { SmetaVersiyaFarq } from './SmetaVersiyaFarq';

const joriy = [
  { id: 100, ota_id: null, tur: 'rz', kod: null, nom: 'РАЗДЕЛ: СМЕТА № 01-01 НА СИНТЕТИКА', birlik: null, hajm: null },
  { id: 101, ota_id: 100, tur: 'mat', kod: 'M', nom: 'ИШ А', birlik: 'М3', hajm: 80, narx: 10, kat: 'МАТ' },
] as never;

describe('SmetaVersiyaFarq', () => {
  it('versiyani o‘qiydi, kesilgan va da’vo summalarini ko‘rsatadi (asl smetaga yozmaydi)', async () => {
    render(<SmetaVersiyaFarq kompaniyaId={1} obyektId={7} obyektNom="Sinov" joriyQatorlar={joriy} tomonlar={{}} />);
    await waitFor(() => expect(api.mosliklarOl).toHaveBeenCalledWith(5));
    expect(await screen.findByText('ИШ А')).toBeTruthy();
    expect(screen.getByText('ИШ Б')).toBeTruthy();
    // Qisman 95 − joriy 80 = 15 × 10 = 150 da'vo; o'chirilgan qatorda qaror kutilmoqda.
    const qator = screen.getByText('ИШ А').closest('tr')!;
    expect(qator.textContent).toMatch(/150[,.]00/);
    expect(qator.textContent).toMatch(/200[,.]00/);
    expect(api.qarorYoz).not.toHaveBeenCalled();
    expect(api.eskiQatorlarOl).not.toHaveBeenCalled();
  });

  it('faollashtirilgan (dastlabki) versiya: eski → joriy zanjiri, eski F2 va pereraschet ishorasi', async () => {
    api.versiyalarOl.mockResolvedValueOnce({ ok: true, qatorlar: [{ id: 5, kompaniya_id: 1, obyekt_id: 7, nom: 'Almashtirilgan smeta', tur: 'dastlabki', manba_sana: null, manba_fayllar: [], bazaviy_revision_id: null, holat: 'tayyor', pozitsiya_soni: 1, izoh: null, yaratildi: '2026-10-29T10:00:00Z', yangilandi: '' }] } as never);
    const joriyF = [
      { id: 100, ota_id: null, tur: 'rz', kod: null, nom: 'ЭКСПЕРТИЗА', birlik: null, hajm: null, summa: 800 },
      { id: 101, ota_id: 100, tur: 'mat', kod: 'M', nom: 'ИШ А', birlik: 'М3', hajm: 80, narx: 10, summa: 800, kat: 'МАТ' },
    ] as never;
    render(<SmetaVersiyaFarq kompaniyaId={1} obyektId={7} obyektNom="Sinov" joriyQatorlar={joriyF} tomonlar={{}} />);
    const panel = await screen.findByTestId('faollashtirish-farqi');
    await waitFor(() => expect(api.eskiQatorlarOl).toHaveBeenCalledWith(7, 5));
    const qator = (await screen.findAllByTestId('faollashtirish-qator'))[0];
    // eski 100 × 10 = 1000; joriy 80 × 10 = 800; farq −200; eski F2 30 / 300 → −300 / +300 (30 × 10).
    expect(qator.textContent).toMatch(/1[\s  ]?000[,.]00/);
    expect(qator.textContent).toMatch(/800[,.]00/);
    expect(qator.textContent).toMatch(/−300[,.]00/);
    expect(qator.textContent).toMatch(/\+300[,.]00/);
    expect(panel.textContent).toContain('Almashtirilgan smeta');
  });
});
