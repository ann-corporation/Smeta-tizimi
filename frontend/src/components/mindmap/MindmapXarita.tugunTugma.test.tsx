import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MindmapGraf } from '../../api/t2-mindmap';
import type { PultYozuvchi } from '../../lib/mindmap-pult';
import { MindmapXarita, KorinishTanlagich, type PultBoshqaruv } from './MindmapXarita';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
});

function graf(): MindmapGraf {
  return {
    tugunlar: [
      { id: 'kompaniya:1', tur: 'kompaniya', nom: 'Bosh kompaniya', meta: null, x: null, y: null },
      { id: 'loyiha:7', tur: 'loyiha', nom: 'Namuna loyiha', meta: { versiya: 3 }, x: null, y: null },
      { id: 'obyekt:5', tur: 'obyekt', nom: 'Namuna obyekt', x: null, y: null, meta: { versiya: 4, loyiha_id: 7, smeta: 1000, fakt: 600, f2: 400, fakt_foiz: 60, f2_foiz: 40, belgi: [] } },
    ],
    bogichlar: [
      { manba: 'kompaniya:1', maqsad: 'loyiha:7', tur: 'loyiha_kompaniya', uzsa_boladi: false },
      { manba: 'loyiha:7', maqsad: 'obyekt:5', tur: 'obyekt_loyiha', uzsa_boladi: true },
    ],
  };
}

const y = { loyihaYarat: vi.fn(), obyektYarat: vi.fn(), shartnomaYarat: vi.fn(), loyihaNomla: vi.fn(), obyektNomla: vi.fn(), bog: vi.fn(), bogOchir: vi.fn() } as unknown as PultYozuvchi;
const pult: PultBoshqaruv = { kontekst: { tahrir: { mumkin: true, sabab: null }, yozuvchi: y }, onTugadi: () => {} };
const amalKorish = { superadmin: true, rol: 'boss', permissions: null, boshqaKompaniya: false };
const prop = { yuklanmoqda: false, xato: '', oxirgiYangilanish: null, onYangila: () => {}, onTanla: () => {}, onKorinish: () => {} };
const tugma = (id: string, kalit: string) => document.querySelector<SVGGElement>('[data-tugun="' + id + '"] [data-tugun-tugma="' + kalit + '"]');

describe('Vizual xarita: tugundan amal (pult bilan bir xil menyu)', () => {
  it('loyiha tugunida «+» va «⋯» ko‘rinadi; «+» faqat yaratish amallarini ochadi', () => {
    render(<MemoryRouter><MindmapXarita graf={graf()} {...prop} tanlangan={null} korinish="xarita" pult={pult} amalKorish={amalKorish} /></MemoryRouter>);
    expect(tugma('loyiha:7', 'menyu')).toBeTruthy();
    fireEvent.click(tugma('loyiha:7', 'yarat')!);
    const menyu = screen.getByTestId('mindmap-amal-menyu');
    expect(menyu.querySelector('[data-amal="pult:obyekt.yarat"]')).toBeTruthy();
    expect(menyu.querySelector('[data-amal="pult:obyekt.biriktir"]')).toBeNull();
  });

  it('«⋯» — pultdagi bilan bir xil to‘liq menyu (yaratish, nomlash, sahifaga o‘tish)', () => {
    render(<MemoryRouter><MindmapXarita graf={graf()} {...prop} tanlangan={null} korinish="xarita" pult={pult} amalKorish={amalKorish} /></MemoryRouter>);
    fireEvent.click(tugma('loyiha:7', 'menyu')!);
    const menyu = screen.getByTestId('mindmap-amal-menyu');
    for (const k of ['pult:obyekt.yarat', 'pult:shartnoma.yarat', 'pult:loyiha.nomla', 'loyiha.reestr']) expect(menyu.querySelector('[data-amal="' + k + '"]'), k).toBeTruthy();
  });

  it('pult berilmasa — «+» chiqmaydi, «⋯» qoladi', () => {
    render(<MemoryRouter><MindmapXarita graf={graf()} {...prop} tanlangan={null} korinish="xarita" amalKorish={amalKorish} /></MemoryRouter>);
    expect(tugma('loyiha:7', 'yarat')).toBeNull();
    expect(tugma('loyiha:7', 'menyu')).toBeTruthy();
  });
});

describe('Ko‘rinish tanlagich', () => {
  it('«Xarita» va «Jadval» doim ko‘rinadi; qolganlari «Boshqa ko‘rinishlar» ostida', () => {
    render(<KorinishTanlagich joriy="xarita" onTanla={() => {}} />);
    expect(screen.getByRole('tab', { name: /Xarita/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /Jadval/ })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /2D graf/ })).toBeNull();
    fireEvent.click(screen.getByTestId('boshqa-korinishlar'));
    expect(screen.getByRole('tab', { name: /2D graf/ })).toBeTruthy();
  });
});
