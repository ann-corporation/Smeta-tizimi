/**
 * SINOV (sintetik): smetadan tashqari bo'lim — «Smeta + o'zgarishlar» ga kirmaydi, alohida «smetadan tashqari: …» qatori sifatida
 * ko'rinadi (server hisobi: `smetadan_tashqari`). Belgili bo'lim yo'q bo'lsa — qator ko'rinmaydi.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const ASOS = {
  ok: true, obyekt_id: 1,
  asl: { paket: null, ustamasiz: 1000, narxsiz_soni: 0 },
  joriy: { paket: null, ustamasiz: 1000 },
  ozgarish: {
    ustamasiz: 0, ustamali: null, qqs_bilan: null, qoshimcha: 0, zamena_summa: 0, almashtirilgan_summa: 0, zamena_farq: 0, bajarilmadi: 0,
    narx_farqi: null, narx_farqi_izoh: '', avvalgi_jami: 1000, ikki_marta_sanalgan: 0, invariant_ok: true,
    kesim: { qoshimcha: [], zamena: [], bajarilmadi: [] },
  },
  qoshimcha: { soni: 0, summa: 0, narxsiz_soni: 0, asossiz_soni: 0, qisqartirildi: false, qatorlar: [] },
  zamena: { soni: 0, zamena_summa: 0, almashtirilgan_summa: 0, farq: 0, narxsiz_soni: 0, noaniq_soni: 0, asossiz_soni: 0, qisqartirildi: false, qatorlar: [] },
  bajarilmadi: { soni: 0, summa: 0, narxsiz_soni: 0, qatorlar: [] },
};
const holat = vi.hoisted(() => ({ tashqari: true }));
vi.mock('../../api/t2-ozgarish', () => ({
  smetaOzgarishQatlamOl: () => Promise.resolve({
    ok: true,
    natija: holat.tashqari
      ? { ...ASOS, smetadan_tashqari: { soni: 1, ustamasiz: 200, qqs_foiz: 12, qqs_bilan: 224, qatorlar: [{ qator_id: 7, nom: 'TEST TASHQARI BOLIM', summa: 200 }] } }
      : ASOS,
  }),
}));
vi.mock('../../umumiy/ui/useUstamaliSumma', () => ({ useUstamaliSumma: () => ({ holat: 'yuklanmoqda', hisobla: () => null, retry: () => undefined, koef: null, podval: null }) }));

import { SmetaOzgarishQatlam } from './SmetaOzgarishQatlam';

describe('SmetaOzgarishQatlam — smetadan tashqari', () => {
  it('alohida qator: QQS bilan summa va bo‘lim nomi; «Smeta + o‘zgarishlar» o‘zgarmaydi', async () => {
    holat.tashqari = true;
    render(<SmetaOzgarishQatlam obyektId={1} />);
    const nota = await screen.findByTestId('smeta-tashqari');
    expect(nota.textContent).toContain('TEST TASHQARI BOLIM');
    expect((await screen.findByTestId('smeta-tashqari-jami')).textContent?.replace(/\s/g, '')).toContain('224');
    expect((await screen.findByTestId('smeta-joriy')).textContent?.replace(/\s/g, '')).not.toContain('224');
  });
  it('belgili bo‘lim yo‘q — qator ko‘rinmaydi', async () => {
    holat.tashqari = false;
    render(<SmetaOzgarishQatlam obyektId={1} />);
    await screen.findByTestId('smeta-joriy');
    expect(screen.queryByTestId('smeta-tashqari')).toBeNull();
  });
});
