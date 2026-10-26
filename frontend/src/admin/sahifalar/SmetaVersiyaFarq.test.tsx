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
  });
});
