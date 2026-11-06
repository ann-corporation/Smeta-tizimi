import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PereraschetPanel } from './PereraschetPanel';
import { bosKesim, type F2Baho } from '../../lib/hisob-yadro';
import type { PereraschetBaho } from '../../lib/f2-pereraschet';

afterEach(cleanup);
const baho = (v: number): F2Baho => ({ birliklar: [], qqsBilan: v, qqs: 0, ustamali: v, ustamasiz: v, nomalumBirlik: 0 });
const blok = (kesimNomalum: number, summasizSoni: number): PereraschetBaho['bloklar'][number] => ({
  blok: { manbaAktId: 11, raqam: '5', qatorlar: [], kesim: { ...bosKesim(), nomalum: kesimNomalum, summasizSoni }, jami: -100, nomalum: 0 },
  hujjatPodvali: true, baho: baho(-100),
});

describe('PereraschetPanel — taxminiy (audit M3)', () => {
  it('kat noma‘lum qism va narxsiz qatorlar bo‘lsa — ≈ va izoh', () => {
    render(<PereraschetPanel baho={{ bloklar: [blok(-40, 2)], eski: baho(-100), yangi: baho(300), sof: baho(200) }} />);
    expect(screen.getByTestId('pereraschet-blok-11-taxminiy').textContent).toMatch(/kat noma‘lum.*2 qator narxsiz/);
    expect(screen.getByTestId('pereraschet-sof-qqs-bilan').textContent).toContain('≈');
  });
  it('hammasi aniq — ≈ yo‘q', () => {
    render(<PereraschetPanel baho={{ bloklar: [blok(0, 0)], eski: baho(-100), yangi: baho(300), sof: baho(200) }} />);
    expect(screen.queryByTestId('pereraschet-blok-11-taxminiy')).toBeNull();
    expect(screen.getByTestId('pereraschet-sof-qqs-bilan').textContent).not.toContain('≈');
  });
});
