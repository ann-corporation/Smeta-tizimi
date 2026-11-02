import { describe, expect, it, vi, beforeAll } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MindmapGraf } from '../../api/t2-mindmap';
import { MindmapXarita } from './MindmapXarita';
import { MindmapKichik } from './MindmapKichik';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
});

function graf(): MindmapGraf {
  return {
    tugunlar: [
      { id: 'kompaniya:1', tur: 'kompaniya', nom: 'Bosh kompaniya', meta: null, x: null, y: null },
      { id: 'loyiha:7', tur: 'loyiha', nom: 'Park', meta: { versiya: 1 }, x: null, y: null },
      { id: 'obyekt:5', tur: 'obyekt', nom: 'Amfiteatr', x: null, y: null, meta: { versiya: 1, loyiha_id: 7, smeta: 1000, fakt: 600, f2: 400, fakt_foiz: 60, f2_foiz: 40, belgi: [{ tur: 'zayavka', daraja: 'info', matn: '2 ta zayavka kutilmoqda', soni: 2 }], zayavka: 2 } },
      { id: 'obyekt:6', tur: 'obyekt', nom: 'Sport zal', x: null, y: null, meta: { versiya: 1, loyiha_id: 7, smeta: null, fakt: 0, f2: 0, fakt_foiz: null, f2_foiz: null, belgi: [{ tur: 'smeta_yoq', daraja: 'ogoh', matn: 'Smeta yuklanmagan' }] } },
    ],
    bogichlar: [
      { manba: 'kompaniya:1', maqsad: 'loyiha:7', tur: 'loyiha_kompaniya', uzsa_boladi: false },
      { manba: 'loyiha:7', maqsad: 'obyekt:5', tur: 'obyekt_loyiha', uzsa_boladi: true },
      { manba: 'loyiha:7', maqsad: 'obyekt:6', tur: 'obyekt_loyiha', uzsa_boladi: true },
    ],
    jamlanma: { obyekt_soni: 2, smeta_jami: 1000, fakt_jami: 600, f2_jami: 400, zayavka_kutilmoqda: 2, narxsiz_obyekt: 0, smetasiz_obyekt: 1, kozgu_eskirgan: 0 },
  };
}

describe('MindmapXarita', () => {
  it('ro‘yxatda real holat; obyekt tanlansa panelda haqiqiy sahifa havolalari', () => {
    const onTanla = vi.fn();
    const { rerender } = render(<MemoryRouter><MindmapXarita graf={graf()} yuklanmoqda={false} xato="" oxirgiYangilanish={null} onYangila={() => {}}
      tanlangan={null} onTanla={onTanla} korinish="royxat" onKorinish={() => {}} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Kompaniya xaritasi' })).toBeTruthy();
    // Smetasiz obyekt — foiz yo‘q, 0% emas.
    expect(screen.getByText(/Xavf · smeta yo‘q · F2 \(tasdiqlangan\) —/)).toBeTruthy();
    fireEvent.click(screen.getByText('Amfiteatr'));
    expect(onTanla).toHaveBeenCalledWith('obyekt:5');
    rerender(<MemoryRouter><MindmapXarita graf={graf()} yuklanmoqda={false} xato="" oxirgiYangilanish={null} onYangila={() => {}}
      tanlangan="obyekt:5" onTanla={onTanla} korinish="royxat" onKorinish={() => {}} /></MemoryRouter>);
    const panel = screen.getByRole('dialog', { name: 'Tafsilot paneli' });
    expect(within(panel).getByRole('heading', { name: 'Amfiteatr' })).toBeTruthy();
    expect(within(panel).getByRole('link', { name: /Obyekt holati/ }).getAttribute('href')).toBe('/admin/holat/5');
    expect(within(panel).getByRole('link', { name: /F2 tarixi/ }).getAttribute('href')).toBe('/admin/f2-tarix?obyekt=5');
  });

  it('holat filtri ro‘yxatni toraytiradi', () => {
    render(<MemoryRouter><MindmapXarita graf={graf()} yuklanmoqda={false} xato="" oxirgiYangilanish={null} onYangila={() => {}}
      tanlangan={null} onTanla={() => {}} korinish="royxat" onKorinish={() => {}} /></MemoryRouter>);
    const filtr = screen.getByRole('group', { name: 'Holat bo‘yicha filtr' });
    fireEvent.click(within(filtr).getByRole('button', { name: /Xavf/ }));
    expect(screen.queryByText('Amfiteatr')).toBeNull();
    expect(screen.getByText('Sport zal')).toBeTruthy();
  });

  it('xarita ko‘rinishi tugunlarni klaviatura bilan ochiladigan tugma sifatida chizadi', () => {
    const onTanla = vi.fn();
    const { container } = render(<MemoryRouter><MindmapXarita graf={graf()} yuklanmoqda={false} xato="" oxirgiYangilanish={null} onYangila={() => {}}
      tanlangan={null} onTanla={onTanla} korinish="xarita" onKorinish={() => {}} /></MemoryRouter>);
    const tugun = container.querySelector('[data-tugun="obyekt:5"]')!;
    expect(tugun.getAttribute('role')).toBe('button');
    expect(tugun.getAttribute('aria-label')).toContain('F2 (tasdiqlangan) 40%');
    fireEvent.keyDown(tugun, { key: 'Enter' });
    expect(onTanla).toHaveBeenCalledWith('obyekt:5');
  });
});

const prop = { yuklanmoqda: false, xato: '', oxirgiYangilanish: null, onYangila: () => {}, onTanla: () => {}, onKorinish: () => {} };

function grafV3(): MindmapGraf {
  const g = graf();
  g.tugunlar[2] = { ...g.tugunlar[2], meta: { ...g.tugunlar[2].meta!, f2_asos: 'tasdiqlangan', f2_qoralama: 250, signal_count: 2, critical_count: 1, ortiqcha_soni: 1,
    top_signals: [{ title: 'Narx manbasi yo‘q', severity: 'critical' }, { title: 'Hajm farqi', severity: 'warning' }],
    belgi: [{ tur: 'ortiqcha', daraja: 'info', matn: '1 qatorda F2 fakt yoki smetadan oshgan', soni: 1 }] } };
  g.jamlanma = { ...g.jamlanma!, f2_asos: 'tasdiqlangan', f2_qoralama_jami: 250 };
  return g;
}

describe('MindmapXarita v3 maydonlari va tahrir ruxsati', () => {
  it('yozish yopiq: Tahrir yorlig‘i chiqmaydi, sababi aytiladi; panelda «Tahrir rejimida ochish» yo‘q', () => {
    const { rerender } = render(<MemoryRouter><MindmapXarita graf={graf()} {...prop} tanlangan="obyekt:5" korinish="royxat"
      tahrir={{ mumkin: false, sabab: 'rahbar' }} onTahrirdaOch={() => {}} /></MemoryRouter>);
    expect(screen.queryByRole('tab', { name: /Tahrir/ })).toBeNull();
    expect(screen.getByTestId('mindmap-faqat-oqish').textContent).toMatch(/rahbar/);
    expect(screen.queryByRole('button', { name: /Tahrir rejimida ochish/ })).toBeNull();
    rerender(<MemoryRouter><MindmapXarita graf={graf()} {...prop} tanlangan="obyekt:5" korinish="royxat"
      tahrir={{ mumkin: false, sabab: 'ruxsat_yoq' }} /></MemoryRouter>);
    expect(screen.getByTestId('mindmap-faqat-oqish').textContent).toMatch(/document\.write/);
  });

  it('yozish mumkin: Tahrir yorlig‘i va tugma bor, faqat-o‘qish eslatmasi yo‘q', () => {
    render(<MemoryRouter><MindmapXarita graf={graf()} {...prop} tanlangan="obyekt:5" korinish="royxat"
      tahrir={{ mumkin: true, sabab: null }} onTahrirdaOch={() => {}} /></MemoryRouter>);
    expect(screen.getByRole('tab', { name: /Tahrir/ })).toBeTruthy();
    expect(screen.queryByTestId('mindmap-faqat-oqish')).toBeNull();
    expect(screen.getByRole('button', { name: /Tahrir rejimida ochish/ })).toBeTruthy();
  });

  it('v3: panelda F2 (tasdiqlangan), alohida qoralama, signallar va ortiqcha belgi; havolalar kanonik', () => {
    render(<MemoryRouter><MindmapXarita graf={grafV3()} {...prop} tanlangan="obyekt:5" korinish="royxat" /></MemoryRouter>);
    const panel = screen.getByRole('dialog', { name: 'Tafsilot paneli' });
    expect(within(panel).getByText('F2 (tasdiqlangan)')).toBeTruthy();
    expect(within(panel).getByText('F2 qoralama (tasdiqlanmagan)')).toBeTruthy();
    expect(within(panel).getByText(/qoralama: 250/)).toBeTruthy();
    expect(within(panel).queryByText(/F2 asosi noma’lum/)).toBeNull();
    const sig = within(panel).getByTestId('xarita-signallar');
    expect(sig.textContent).toContain('Narx manbasi yo‘q');
    expect(sig.textContent).toContain('Hajm farqi');
    expect(within(panel).getByText('1 qatorda F2 fakt yoki smetadan oshgan')).toBeTruthy();
    expect(within(panel).getByRole('link', { name: /Zayavkalar/ }).getAttribute('href')).toBe('/admin/zayavka?obyekt=5');
  });

  it('eski RPC shakli: yiqilmaydi, qoralama «—», F2 asosi noma’lumligi aytiladi, signal bloki yolg‘on 0 ko‘rsatmaydi', () => {
    render(<MemoryRouter><MindmapXarita graf={graf()} {...prop} tanlangan="obyekt:5" korinish="royxat" /></MemoryRouter>);
    const panel = screen.getByRole('dialog', { name: 'Tafsilot paneli' });
    expect(within(panel).getByText(/F2 asosi noma’lum/)).toBeTruthy();
    expect(within(panel).getByText('F2 qoralama (tasdiqlanmagan)').parentElement!.textContent).toContain('—');
    expect(within(panel).queryByTestId('xarita-signallar')).toBeNull();
  });

  it('xarita tugunida ochiq signal belgisi (kritik) bor', () => {
    const { container } = render(<MemoryRouter><MindmapXarita graf={grafV3()} {...prop} tanlangan={null} korinish="xarita" /></MemoryRouter>);
    const tugun = container.querySelector('[data-tugun="obyekt:5"]')!;
    expect(tugun.querySelector('[data-belgi="signal"]')).toBeTruthy();
    expect(tugun.getAttribute('aria-label')).toContain('1 kritik signal');
  });
});

describe('MindmapKichik', () => {
  it('tayyor graf bilan so‘rovsiz chiziladi va to‘liq xaritaga havola beradi', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<MemoryRouter><MindmapKichik graf={graf()} /></MemoryRouter>);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /To‘liq xaritani ochish/ }).getAttribute('href')).toBe('/admin/mindmap');
    expect(screen.getByText('2 ta obyekt · smeta (ustamasiz) ≈ 1 ming · F2 (tasdiqlangan) 40%')).toBeTruthy();
    fetchSpy.mockRestore();
  });
});
