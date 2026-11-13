/**
 * SINOV (fakt bo'g'ini, sintetik masshtablangan agregatlar): «O'zgarishlar» kartasi serverning o'z jamini (qqs_bilan) ko'rsatadi,
 * mijoz kategoriya kesimidan qayta hisoblamaydi (avval mijoz svod bo'limlariga ustama qo'shib ~4,5% ko'p chiqargan).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const QATLAM = {
  ok: true, obyekt_id: 1,
  asl: { paket: null, ustamasiz: 7901702.9, narxsiz_soni: 0 },
  joriy: { paket: null, ustamasiz: 61710155.69 },
  ozgarish: {
    ustamasiz: 53808452.79, ustamali: 58164017.93, qqs_bilan: 65143700.08, qoshimcha: 53869308.86, zamena_summa: 14959.84,
    almashtirilgan_summa: 75815.91, zamena_farq: -60856.07, bajarilmadi: 0, narx_farqi: null, narx_farqi_izoh: '', avvalgi_jami: 61785971.6,
    ikki_marta_sanalgan: 0, invariant_ok: true,
    kesim: {
      qoshimcha: [{ kat: 'ОБ', summa: 21184317.38 }, { kat: 'ЧЕЛ', summa: 31595200 }, { kat: 'МАТ', summa: 1089791.48 }],
      zamena: [{ kat: 'МАТ', summa: -60856.07 }], bajarilmadi: [],
    },
  },
  qoshimcha: { soni: 4, summa: 53869308.86, narxsiz_soni: 0, asossiz_soni: 0, qisqartirildi: false, qatorlar: [] },
  zamena: { soni: 35, zamena_summa: 14959.84, almashtirilgan_summa: 75815.91, farq: -60856.07, narxsiz_soni: 33, noaniq_soni: 0, asossiz_soni: 0, qisqartirildi: false, qatorlar: [] },
  bajarilmadi: { soni: 0, summa: 0, narxsiz_soni: 0, qatorlar: [] },
};
vi.mock('../../api/t2-ozgarish', () => ({ smetaOzgarishQatlamOl: () => Promise.resolve({ ok: true, natija: QATLAM }) }));
vi.mock('../../umumiy/ui/useUstamaliSumma', () => ({ useUstamaliSumma: () => ({ holat: 'yuklanmoqda', hisobla: () => null, retry: () => undefined, koef: null, podval: null }) }));

import { SmetaOzgarishQatlam } from './SmetaOzgarishQatlam';

describe('SmetaOzgarishQatlam — server jami (svod yaxlit obyekt)', () => {
  it("«O'zgarishlar» kartasi = server qqs_bilan, mijoz qayta hisoblamaydi", async () => {
    render(<SmetaOzgarishQatlam obyektId={1} />);
    const kart = await screen.findByTestId('smeta-ozgarish');
    const matn = kart.textContent ?? '';
    expect(matn.replace(/\s/g, '').replace(',', '.')).toContain('65143700.08');
    expect(matn.replace(/\s/g, '')).not.toContain('68049003');
  });
  it('narxsiz zamena ogohi saqlanadi (33 ta)', async () => {
    render(<SmetaOzgarishQatlam obyektId={1} />);
    expect(await screen.findByText(/33 tasi narxsiz/)).toBeTruthy();
  });
});
