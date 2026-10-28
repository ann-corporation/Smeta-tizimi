import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SummaJuft } from './SummaJuft';
import { QiymatUchlik } from './QiymatUchlik';
import { paketUchligi, summaPaket } from '../../lib/summa-paket';

afterEach(cleanup);

const paket = summaPaket({
  qqs_bilan: 2022.47, qqs: 216.69, ustamali: 1805.78, ustamasiz: 1640, qqs_foiz: 12, ustamasiz_qism: 620,
  kesim: { chel: 100, mash: 220, mat: 300, ob: 400, subpudrat: 120, svod: 500, ustamasiz: 0, nomalum: 0 },
  soat: { chel: 10, mash: 5, mashinist: 5 }, subpudratchilar: [{ kontragent: 'Sintetik haykal MChJ', summa: 120 }],
  narxsiz_soni: 2, qator_soni: 8,
})!;

describe('SummaJuft — server paketi', () => {
  it('QQS bilan asosiy, ostida ustamali va прямые; ▸ kesim (Σ = прямые) + soatlar + kontragent', () => {
    render(<SummaJuft paket={paket} />);
    expect(screen.queryByTestId('summa-kesim-chel')).toBeNull(); // yopiq — ichki qatorlar chizilmaydi
    fireEvent.click(screen.getByText(/kesim/));
    expect(screen.getByTestId('summa-qqs').textContent).toContain('2');
    expect(screen.getByTestId('summa-ustamali').textContent).toMatch(/1\s?805/);
    expect(screen.getByTestId('summa-ustamasiz').textContent).toMatch(/1\s?640/);
    expect(screen.getByTestId('summa-kesim-chel').textContent).toContain('chel-soat');
    expect(screen.getByTestId('summa-kesim-subpudrat').textContent).toContain('Sintetik haykal MChJ');
    expect(screen.getByTestId('summa-kesim-svod')).toBeTruthy();
    expect(screen.queryByTestId('summa-kesim-ustamasiz')).toBeNull(); // 0 — yashirin
    expect(screen.queryByTestId('summa-kesim-nomalum')).toBeNull();
    expect(screen.getByTestId('summa-kesim-narxsiz').textContent).toContain('2');
  });
  it('kesimYoq — zich katak: kesim chiqmaydi', () => {
    render(<SummaJuft paket={paket} kesimYoq />);
    expect(screen.queryByTestId('summa-kesim')).toBeNull();
  });
  it('paket null + kiritish yo‘li → «kiritilmagan» va havola (0 emas)', () => {
    render(<MemoryRouter><SummaJuft paket={null} kiritishYoli={{ yol: '/admin/moliya' }} /></MemoryRouter>);
    expect(screen.getByTestId('summa-kiritilmagan').textContent).toContain('kiritilmagan');
    expect(screen.getByTestId('summa-kiritish-yoli').getAttribute('href')).toBe('/admin/moliya');
    expect(screen.queryByText('0')).toBeNull();
  });
  it('paket null, yo‘l berilmagan → «—»', () => {
    render(<QiymatUchlik q={paketUchligi(null)} />);
    expect(screen.getByTestId('summa-qqs').textContent).toContain('—');
  });
});
