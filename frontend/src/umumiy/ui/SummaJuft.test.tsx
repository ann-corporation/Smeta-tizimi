import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NAKRUTKA_STANDART } from '../../lib/nakrutka-kaskad';
import { bosKatKesim, katKesimgaQosh, katKesimServerdan } from '../../lib/ustamali-summa';
import { SummaJuft } from './SummaJuft';

const m = vi.hoisted(() => ({ nak: vi.fn(), pod: vi.fn() }));
vi.mock('../../api/t2-nakrutka', async (orig) => ({ ...(await orig<object>()), t2ObyektNakrutka: (...a: unknown[]) => m.nak(...a) }));
vi.mock('../../api/t2-nakrutka-podval', async (orig) => ({ ...(await orig<object>()), sbPodvallarOl: (...a: unknown[]) => m.pod(...a) }));

const CATS = { chel: 906363170.46, mash: 188652881.67, mat: 73766663.54, ob: 115010123, mk: 1234567.89, kab: 17630000.3, bez: 2500000 };
const wrap = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};
const matn = (id: string) => (screen.getByTestId(id).textContent ?? '').replace(/\s+/g, ' ').trim();

beforeEach(() => {
  m.nak.mockReset(); m.pod.mockReset();
  m.nak.mockResolvedValue({ ok: true, obyekt_id: 7, shartnoma_id: null, cats: CATS, koeffitsientlar: NAKRUTKA_STANDART });
  m.pod.mockResolvedValue({ ok: true, qatorlar: [] });
});
afterEach(cleanup);

describe('SummaJuft — ustamali (katta) + ustamasiz (kichik)', () => {
  it('server natijasiga (ИТОГО-4) tiyinigacha teng, ustamasiz yonida', async () => {
    wrap(<SummaJuft obyektId={7} kompaniyaId={17} ustamasiz={1283792838.67} katKesim={katKesimServerdan(CATS)} />);
    await waitFor(() => expect(matn('summa-ustamali')).toBe('1 507 951 902.86'));
    expect(matn('summa-ustamasiz')).toContain('1 283 792 838.67');
    expect((screen.getByTestId('summa-juft').getAttribute('title') ?? '').replace(/\s/g, ' ')).toContain('QQS bilan (alohida): 1 688 906 131,21');
  });

  it('kat noma’lum qismi bo‘lsa — «taxminiy» va so‘m aniq ko‘rsatiladi', async () => {
    const k = bosKatKesim();
    katKesimgaQosh(k, 'МАТ', 1000);
    katKesimgaQosh(k, null, 500);
    wrap(<SummaJuft obyektId={7} kompaniyaId={17} ustamasiz={1500} katKesim={k} />);
    await waitFor(() => expect(screen.getByTestId('summa-taxminiy')).toBeTruthy());
    expect(matn('summa-taxminiy')).toContain('taxminiy');
    expect(matn('summa-taxminiy')).toContain('500');
    expect(matn('summa-ustamali')).toBe('1 266.64'); // 1000 × МАТ: ИТОГО-4 (QQS siz) = 1420 / 1.12
  });

  it('hamma qator kat’siz — ustamali 0 emas, NOMA’LUM', async () => {
    const k = bosKatKesim();
    katKesimgaQosh(k, null, 500);
    wrap(<SummaJuft obyektId={7} kompaniyaId={17} ustamasiz={500} katKesim={k} />);
    await waitFor(() => expect(screen.getByTestId('summa-kat-nomalum')).toBeTruthy());
    expect(matn('summa-ustamali')).toContain('noma’lum');
  });

  it('koeffitsientlar o‘qilmasa — ustamali noma’lum, ustamasiz ko‘rinadi', async () => {
    m.nak.mockResolvedValue({ ok: false, error: 'x' });
    wrap(<SummaJuft obyektId={7} kompaniyaId={17} ustamasiz={1000} katKesim={katKesimServerdan(CATS)} />);
    await waitFor(() => expect(matn('summa-ustamali')).toContain('noma’lum'));
    expect(matn('summa-ustamasiz')).toContain('1 000');
  });

  it('summa noma’lum (null) — tire, 0 emas', () => {
    wrap(<SummaJuft obyektId={7} kompaniyaId={17} ustamasiz={null} katKesim={bosKatKesim()} />);
    expect(matn('summa-ustamali')).toBe('—');
    expect(screen.queryByTestId('summa-ustamasiz')).toBeNull();
  });
});
