import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SummaJuft } from './SummaJuft';
import { QiymatUchlik } from './QiymatUchlik';
import { SummaKesimi } from './SummaKesimi';
import { paketUchligi, summaPaket } from '../../lib/summa-paket';
import { paketlarJami, uchlikZanjiri } from '../../lib/summa-tafsilot';
import type { QiymatUchlik as Uchlik } from '../../lib/ustamali-summa';

afterEach(cleanup);

const paket = summaPaket({
  qqs_bilan: 2022.47, qqs: 216.69, ustamali: 1805.78, ustamasiz: 1640, qqs_foiz: 12, ustamasiz_qism: 620,
  kesim: { chel: 100, mash: 220, mat: 300, ob: 400, subpudrat: 120, svod: 500, ustamasiz: 0, nomalum: 0 },
  soat: { chel: 10, mash: 5, mashinist: 5 }, subpudratchilar: [{ kontragent: 'Sintetik MChJ', summa: 120 }],
  narxsiz_soni: 2, qator_soni: 8,
  ustama: { tr_mat: 10, skl_mat: 5, tr_kab: 0, tr_ob: 0, zag_ob: 0, prochie: 40, strax: 3, risk: 2, itogo4: 1805.78, nds: 216.69, vsego: 2022.47 },
})!;
const bosh: Uchlik = { qqsBilan: null, ustamali: null, ustamasiz: null, taxminiy: false, nomalum: 0, sabab: 'HISOBLANMADI' };

describe('SummaKesimi — yagona kengayuvchi tafsilot', () => {
  it('yopiq: ichki qatorlar yo‘q; bosilsa joyida ochiladi (uchlik + kesim + kaskad)', () => {
    render(<SummaJuft paket={paket} />);
    expect(screen.queryByTestId('summa-tafsilot')).toBeNull();
    fireEvent.click(screen.getByText(/kesim va hisob/));
    const t = within(screen.getByTestId('summa-tafsilot-uchlik'));
    expect(t.getByTestId('tafsilot-qqs').textContent).toMatch(/2\s?022/);
    expect(t.getByTestId('tafsilot-ustamali').textContent).toMatch(/1\s?805/);
    expect(t.getByTestId('tafsilot-ustamasiz').textContent).toMatch(/1\s?640/);
    // Kaskad qadamlari tartib bilan: ЧЕЛ, МАШ, МАТ, ОБ ... ИТОГО-4, НДС, ВСЕГО
    const kalitlar = [...screen.getByTestId('summa-zanjir').querySelectorAll('[data-testid^="summa-zanjir-"]')]
      .map((e) => e.getAttribute('data-testid')).filter((k) => !k!.endsWith('-nomalum'));
    expect(kalitlar).toEqual(['summa-zanjir-chel', 'summa-zanjir-mash', 'summa-zanjir-mat', 'summa-zanjir-ob', 'summa-zanjir-transport',
      'summa-zanjir-prochie', 'summa-zanjir-sugurta', 'summa-zanjir-ustamasiz-qism', 'summa-zanjir-itogo4', 'summa-zanjir-nds', 'summa-zanjir-vsego']);
    expect(screen.getByTestId('summa-kesim-svod')).toBeTruthy();
    expect(screen.getByTestId('summa-kesim-narxsiz').textContent).toContain('2');
    expect(screen.getByTestId('summa-kesim-soni').textContent).toContain('8');
  });

  it('server kaskad qadamlarisiz paket ham uchlikdan kaskad beradi (ПРЯМЫЕ → ИТОГО-4 → НДС → ВСЕГО)', () => {
    const { ustama: _u, ...oddiy } = paket;
    void _u;
    render(<SummaKesimi paket={oddiy} ochiq />);
    expect(screen.getByTestId('summa-zanjir-pryamye')).toBeTruthy();
    expect(screen.getByTestId('summa-zanjir-ustama').textContent).toMatch(/165/); // 1805,78 − 1640
    expect(screen.getByTestId('summa-zanjir-vsego').textContent).toMatch(/2\s?022/);
  });

  it('noma‘lum qiymat «noma‘lum» deb yoziladi, 0 emas; hisoblanmagan bandlar soni ko‘rinadi', () => {
    render(<SummaKesimi q={{ ...bosh, ustamasiz: 500 }} nomalumSoni={3} ochiq />);
    expect(screen.getByTestId('tafsilot-qqs-nomalum')).toBeTruthy();
    expect(screen.getByTestId('tafsilot-ustamali-nomalum')).toBeTruthy();
    expect(screen.getByTestId('tafsilot-ustamasiz').textContent).toContain('500');
    expect(screen.getByTestId('summa-zanjir-ustama-nomalum')).toBeTruthy();
    expect(screen.getByTestId('summa-tafsilot-nomalum-soni').textContent).toContain('3');
  });

  it('agregat: tarkibdagi har band o‘z uchligi bilan, noma‘lumi «noma‘lum»', () => {
    const q = (a: number | null, b: number | null, c: number | null): Uchlik => ({ qqsBilan: a, ustamali: b, ustamasiz: c, taxminiy: false, nomalum: 0, sabab: a == null ? 'HISOBLANMADI' : null });
    render(<QiymatUchlik q={q(300, 250, 200)} nomalumSoni={1}
      qismlar={[{ kalit: '1', nom: 'Obyekt A', q: q(100, 90, 80) }, { kalit: '2', nom: 'Obyekt B', q: q(200, 160, 120) }, { kalit: '3', nom: 'Obyekt C', q: q(null, null, 70) }]} />);
    fireEvent.click(screen.getByText(/kesim va hisob/));
    const a = within(screen.getByTestId('summa-qism-1'));
    expect(a.getByTestId('qism-qqs').textContent).toContain('100');
    expect(a.getByTestId('qism-ustamali').textContent).toContain('90');
    expect(a.getByTestId('qism-ustamasiz').textContent).toContain('80');
    const c = within(screen.getByTestId('summa-qism-3'));
    expect(c.getByTestId('qism-qqs').textContent).toContain('noma');
    expect(c.getByTestId('qism-ustamasiz').textContent).toContain('70');
    expect(screen.getByTestId('summa-tafsilot-nomalum-soni').textContent).toContain('1');
  });

  it('har QiymatUchlik (paketsiz ham) ochiladi; tafsilYoq — faqat shu holda yashirin', () => {
    const { rerender } = render(<QiymatUchlik q={paketUchligi(paket)} />);
    expect(screen.getByTestId('summa-kesim')).toBeTruthy();
    rerender(<QiymatUchlik q={paketUchligi(paket)} tafsilYoq />);
    expect(screen.queryByTestId('summa-kesim')).toBeNull();
  });

  it('paketlarJami: ma‘lum paketlar yig‘iladi, paketsiz obyektlar soni alohida (0 emas)', () => {
    const j = paketlarJami([paket, null, paket]);
    expect(j.nomalumSoni).toBe(1);
    expect(j.q.ustamasiz).toBe(3280);
    expect(j.q.qqsBilan).toBeCloseTo(4044.94, 2);
    expect(paketlarJami([null, null]).q.qqsBilan).toBeNull();
    expect(uchlikZanjiri(bosh).every((z) => z.kalit === 'pryamye' || z.summa === null)).toBe(true);
  });
});
