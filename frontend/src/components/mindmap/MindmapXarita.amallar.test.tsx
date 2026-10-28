import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { MindmapGraf } from '../../api/t2-mindmap';
import { ROLE_PERMISSIONS } from '../../lib/company-authorization/effective-authorization';
import { menyuJoyi, type AmalKorish } from '../../lib/mindmap-amallar';
import { MindmapXarita } from './MindmapXarita';
import type { VazifaBoshqaruv } from './AmalMenyu';
import type { MasulBoshqaruv } from './XaritaJamoa';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(cleanup);

/* Sintetik ma’lumot — real mijoz summalari emas. */
function graf(pul = true): MindmapGraf {
  return {
    tugunlar: [
      { id: 'kompaniya:1', tur: 'kompaniya', nom: 'Sinov kompaniya', meta: null, x: null, y: null },
      { id: 'loyiha:7', tur: 'loyiha', nom: 'Sinov loyiha', meta: { versiya: 1 }, x: null, y: null },
      { id: 'obyekt:5', tur: 'obyekt', nom: 'Sinov obyekt', x: null, y: null, meta: { versiya: 1, loyiha_id: 7, belgi: [], ...(pul ? { smeta: 100, fakt: 50, f2: 20 } : {}) } },
      { id: 'shartnoma:3', tur: 'shartnoma', nom: 'Sinov shartnoma', x: null, y: null, meta: { obyekt_idlar: [5] } },
      { id: 'foydalanuvchi:12', tur: 'foydalanuvchi', nom: 'Sinov Odam', x: null, y: null, meta: { rol: 'pto', rollar: ['pto'] } },
    ],
    bogichlar: [
      { manba: 'kompaniya:1', maqsad: 'loyiha:7', tur: 'loyiha_kompaniya', uzsa_boladi: false },
      { manba: 'loyiha:7', maqsad: 'obyekt:5', tur: 'obyekt_loyiha', uzsa_boladi: true },
      { manba: 'shartnoma:3', maqsad: 'obyekt:5', tur: 'shartnoma_obyekt', uzsa_boladi: true },
    ],
    korinish: { toliq: true, pul, rol: 'boss' },
  };
}

const BOSS: AmalKorish = { superadmin: false, rol: 'boss', permissions: [...ROLE_PERMISSIONS.boss], boshqaKompaniya: false };

function Joy() { const l = useLocation(); return <output data-testid="joy">{l.pathname + l.search}</output>; }

function korsat(o: { g?: MindmapGraf; tanlangan?: string | null; korinish?: 'xarita' | 'royxat'; amalKorish?: AmalKorish; masul?: MasulBoshqaruv; vazifa?: VazifaBoshqaruv; onTanla?: (id: string | null) => void } = {}) {
  return render(
    <MemoryRouter initialEntries={['/admin/mindmap']}>
      <MindmapXarita graf={o.g ?? graf()} yuklanmoqda={false} xato="" oxirgiYangilanish={null} onYangila={() => {}}
        tanlangan={o.tanlangan ?? null} onTanla={o.onTanla ?? (() => {})} korinish={o.korinish ?? 'xarita'} onKorinish={() => {}}
        amalKorish={o.amalKorish ?? BOSS} masul={o.masul} vazifa={o.vazifa} />
      <Joy />
    </MemoryRouter>,
  );
}

const menyuBandlari = () => within(screen.getByRole('menu')).getAllByRole('menuitem').map((b) => b.textContent);

describe('tugun amallari menyusi', () => {
  it('o‘ng tugma (obyekt) — tur bo‘yicha amallar; o‘tish amali bosilsa sahifaga o‘tadi', () => {
    const { container } = korsat({ vazifa: { onBer: vi.fn() } });
    fireEvent.contextMenu(container.querySelector('[data-tugun="obyekt:5"]')!, { clientX: 200, clientY: 150 });
    expect(screen.getByRole('menu', { name: 'Amallar: Sinov obyekt' })).toBeTruthy();
    expect(menyuBandlari()).toEqual([
      'Smeta va LRV (obyekt holati)', 'Fakt kiritish', 'F2 tayyorlash', 'F2 tarixi va tasdiqlash', 'Nakopitelniy va F3',
      'Smeta yuklash va versiyalar', 'Zayavkalar', 'Zayavka yaratish', 'Mas‘ul biriktirish', 'Topshiriq berish',
    ]);
    // Mas‘ul boshqaruvi berilmagan — ko‘rinadi, lekin yopiq.
    expect(screen.getByRole('menuitem', { name: 'Mas‘ul biriktirish' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Fakt kiritish' }));
    expect(screen.getByTestId('joy').textContent).toBe('/admin/fakt?obyekt=5');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('pul=false — Nakopitelniy chiqmaydi; Esc menyuni yopadi', () => {
    const { container } = korsat({ g: graf(false) });
    fireEvent.contextMenu(container.querySelector('[data-tugun="obyekt:5"]')!, { clientX: 10, clientY: 10 });
    expect(menyuBandlari()).not.toContain('Nakopitelniy va F3');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('klaviatura: fokuslangan tugunda Shift+F10 menyuni ochadi', () => {
    const { container } = korsat();
    const tugun = container.querySelector<SVGGElement>('[data-tugun="loyiha:7"]')!;
    fireEvent.keyDown(tugun, { key: 'F10', shiftKey: true });
    expect(screen.getByRole('menu', { name: 'Amallar: Sinov loyiha' })).toBeTruthy();
    expect(menyuBandlari()).toContain('Obyektlarini ko‘rsatish');
  });

  it('ruxsat yo‘q — amal yopiq, sababi tooltipda, bosilsa hech narsa bo‘lmaydi', () => {
    const kuzatuvchi: AmalKorish = { superadmin: false, rol: 'kuzatuvchi', permissions: [...ROLE_PERMISSIONS.kuzatuvchi], boshqaKompaniya: false };
    const { container } = korsat({ amalKorish: kuzatuvchi });
    fireEvent.contextMenu(container.querySelector('[data-tugun="obyekt:5"]')!, { clientX: 10, clientY: 10 });
    const fakt = screen.getByRole('menuitem', { name: 'Fakt kiritish' });
    expect(fakt.getAttribute('aria-disabled')).toBe('true');
    expect(fakt.getAttribute('title')).toBe('Bu sahifaga ruxsatingiz yo‘q');
    fireEvent.click(fakt);
    expect(screen.getByTestId('joy').textContent).toBe('/admin/mindmap');
  });

  it('panel sarlavhasidagi «Amallar» va resurs qatori (shartnoma → to‘lov/sverka)', () => {
    korsat({ tanlangan: 'obyekt:5' });
    const panel = screen.getByRole('dialog', { name: 'Tafsilot paneli' });
    fireEvent.click(within(panel).getByTestId('xarita-amallar-tugma'));
    expect(screen.getByRole('menu', { name: 'Amallar: Sinov obyekt' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Amallar: Sinov shartnoma' }));
    expect(menyuBandlari()).toEqual(['Shartnomalar va tomonlar', 'To‘lov va akt-sverka (Nakopitelniy)', 'To‘lovlar (Moliya)']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'To‘lov va akt-sverka (Nakopitelniy)' }));
    expect(screen.getByTestId('joy').textContent).toBe('/admin/nakopitelniy?obyekt=5');
  });

  it('odam: «Topshiriq berish…» mavjud buyruqqa ijrochi ID bilan yuboradi', async () => {
    const onBer = vi.fn(async () => ({ ok: true }));
    const { container } = korsat({ vazifa: { onBer } });
    fireEvent.contextMenu(container.querySelector('[data-tugun="foydalanuvchi:12"]')!, { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Topshiriq berish…' }));
    const modal = screen.getByTestId('mindmap-vazifa-modal');
    fireEvent.change(within(modal).getByLabelText('Topshiriq matni'), { target: { value: 'Sinov topshiriq' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Topshiriq berish' }));
    await waitFor(() => expect(onBer).toHaveBeenCalledWith({ sarlavha: 'Sinov topshiriq', muddat: undefined, obyektId: null, foydalanuvchiId: 12 }));
    expect(await screen.findByTestId('mindmap-vazifa-tayyor')).toBeTruthy();
  });

  it('odam: «Mas‘ul qilish…» mavjud sbMindmapMasul shaklida obyekt ID bilan', async () => {
    const onSaqla = vi.fn(async () => ({ ok: true }));
    const { container } = korsat({ masul: { mumkin: true, onSaqla } });
    fireEvent.contextMenu(container.querySelector('[data-tugun="foydalanuvchi:12"]')!, { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mas‘ul qilish…' }));
    const modal = screen.getByTestId('mindmap-masul-modal');
    fireEvent.change(within(modal).getByLabelText('Obyekt yoki loyiha'), { target: { value: 'obyekt:5' } });
    fireEvent.click(within(modal).getByRole('button', { name: /Mas‘ul biriktirish/ }));
    await waitFor(() => expect(onSaqla).toHaveBeenCalledWith({ obyektId: 5, foydalanuvchiId: 12, ruxsat: 'write' }));
  });
});

describe('menyu joyi', () => {
  it('ekran chetidan chiqmaydi', () => {
    expect(menyuJoyi(1300, 700, 264, 300, 1366, 768)).toEqual({ left: 1366 - 264 - 8, top: 400 });
    expect(menyuJoyi(-20, 5, 264, 300, 1366, 768)).toEqual({ left: 8, top: 8 });
    expect(menyuJoyi(100, 100, 264, 300, 1366, 768)).toEqual({ left: 100, top: 100 });
  });
});
