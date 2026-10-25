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
    expect(screen.getByText(/Xavf · smeta yo‘q · F2 —/)).toBeTruthy();
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
    expect(tugun.getAttribute('aria-label')).toContain('F2 40%');
    fireEvent.keyDown(tugun, { key: 'Enter' });
    expect(onTanla).toHaveBeenCalledWith('obyekt:5');
  });
});

describe('MindmapKichik', () => {
  it('tayyor graf bilan so‘rovsiz chiziladi va to‘liq xaritaga havola beradi', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<MemoryRouter><MindmapKichik graf={graf()} /></MemoryRouter>);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /To‘liq xaritani ochish/ }).getAttribute('href')).toBe('/admin/mindmap');
    expect(screen.getByText('2 ta obyekt · smeta ≈ 1 ming · F2 40%')).toBeTruthy();
    fetchSpy.mockRestore();
  });
});
