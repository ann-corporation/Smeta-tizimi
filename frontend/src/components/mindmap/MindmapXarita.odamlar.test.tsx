import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MindmapGraf } from '../../api/t2-mindmap';
import { MindmapXarita } from './MindmapXarita';
import type { MasulBoshqaruv } from './XaritaJamoa';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(cleanup);

const odam = (id: number, nom: string, rol: string) => ({ id: 'foydalanuvchi:' + id, tur: 'foydalanuvchi' as const, nom, x: null, y: null, meta: { rol, rollar: [rol], login: 'u' + id } });
function graf(korinish?: MindmapGraf['korinish'], pulsiz = false): MindmapGraf {
  const money = pulsiz ? {} : { smeta: 1000, fakt: 600, f2: 400, fakt_foiz: 60, f2_foiz: 40 };
  return {
    tugunlar: [
      { id: 'kompaniya:1', tur: 'kompaniya', nom: 'Bosh kompaniya', meta: null, x: null, y: null },
      { id: 'loyiha:7', tur: 'loyiha', nom: 'Park', meta: { versiya: 1 }, x: null, y: null },
      { id: 'obyekt:5', tur: 'obyekt', nom: 'Amfiteatr', x: null, y: null, meta: { versiya: 1, loyiha_id: 7, belgi: [], ...money } },
      odam(12, 'Bekzod Karimov', 'pto'),
      odam(13, 'Dilshod Yusupov', 'prorab'),
    ],
    bogichlar: [
      { manba: 'kompaniya:1', maqsad: 'loyiha:7', tur: 'loyiha_kompaniya', uzsa_boladi: false },
      { manba: 'loyiha:7', maqsad: 'obyekt:5', tur: 'obyekt_loyiha', uzsa_boladi: true },
      { manba: 'foydalanuvchi:13', maqsad: 'obyekt:5', tur: 'masul_obyekt', uzsa_boladi: true, ruxsat: 'manage', rol: 'prorab' },
    ],
    ...(pulsiz ? {} : { jamlanma: { obyekt_soni: 1, smeta_jami: 1000, fakt_jami: 600, f2_jami: 400, zayavka_kutilmoqda: 0, narxsiz_obyekt: 0, smetasiz_obyekt: 0, kozgu_eskirgan: 0 } }),
    korinish,
  };
}

function korsat(g: MindmapGraf, o: { tanlangan?: string | null; korinish?: 'xarita' | 'royxat'; masul?: MasulBoshqaruv } = {}) {
  return render(<MemoryRouter><MindmapXarita graf={g} yuklanmoqda={false} xato="" oxirgiYangilanish={null} onYangila={() => {}}
    tanlangan={o.tanlangan ?? null} onTanla={() => {}} korinish={o.korinish ?? 'royxat'} onKorinish={() => {}} masul={o.masul} /></MemoryRouter>);
}

describe('Jamoa ko‘rinishi', () => {
  it('Ro‘yxat: Jamoa bo‘limi guruh va odamlar bilan; obyekt qatorida mas‘ul odam', () => {
    korsat(graf());
    const jamoa = screen.getByTestId('royxat-jamoa');
    expect(within(jamoa).getByText('Bekzod Karimov')).toBeTruthy();
    expect(within(jamoa).getByText('Dilshod Yusupov')).toBeTruthy();
    expect(within(jamoa).getByRole('region', { name: 'PTO' })).toBeTruthy();
    expect(within(jamoa).getByRole('region', { name: 'Prorab' })).toBeTruthy();
    expect(within(screen.getByTestId('royxat-masullar')).getByText('Dilshod Yusupov')).toBeTruthy();
  });
  it('Xarita: Jamoa tuguni, odam kartalari (bosh harflar) va obyekt kartasida avatar chiplari', () => {
    const { container } = korsat(graf(), { korinish: 'xarita' });
    expect(container.querySelector('[data-tugun="jamoa:odamlar"]')).toBeTruthy();
    const odamKarta = container.querySelector('[data-tugun="foydalanuvchi:13"]')!;
    expect(odamKarta.textContent).toContain('DY');
    expect(odamKarta.textContent).toContain('Dilshod Yusupov');
    const obyektKarta = container.querySelector('[data-tugun="obyekt:5"]')!;
    expect(obyektKarta.querySelectorAll('[data-masul-avatar]').length).toBe(1);
    expect(obyektKarta.querySelector('[data-masul-avatar]')!.textContent).toBe('DY');
  });
  it('odam paneli: roli, obyektlari va A’zolar sahifasiga havola (faqat boshqarish mumkin bo‘lsa)', () => {
    const masul: MasulBoshqaruv = { mumkin: true, onSaqla: async () => ({ ok: true }) };
    const { unmount } = korsat(graf(), { tanlangan: 'foydalanuvchi:13', masul });
    const panel = screen.getByRole('dialog', { name: 'Tafsilot paneli' });
    expect(within(panel).getByText('Amfiteatr')).toBeTruthy();
    expect(within(panel).getByRole('link', { name: /Rolni o‘zgartirish/ }).getAttribute('href')).toBe('/admin/kompaniya?tab=azolar');
    unmount();
    korsat(graf(), { tanlangan: 'foydalanuvchi:13' });
    expect(screen.queryByRole('link', { name: /Rolni o‘zgartirish/ })).toBeNull();
  });
});

describe('Mas‘ul biriktirish (panel)', () => {
  it('ruxsat yo‘q — mas‘ullar ko‘rinadi, lekin biriktirish/olib tashlash tugmalari YO‘Q', () => {
    korsat(graf(), { tanlangan: 'obyekt:5' });
    const blok = screen.getByTestId('xarita-masullar');
    expect(within(blok).getByText('Dilshod Yusupov')).toBeTruthy();
    expect(screen.queryByTestId('xarita-masul-biriktir')).toBeNull();
    expect(screen.queryByRole('button', { name: /Mas‘ul biriktirish/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /olib tashlash/i })).toBeNull();
  });
  it('mumkin=false bo‘lsa ham yo‘q', () => {
    korsat(graf(), { tanlangan: 'obyekt:5', masul: { mumkin: false, onSaqla: vi.fn() } });
    expect(screen.queryByTestId('xarita-masul-biriktir')).toBeNull();
  });
  it('ruxsat bor — a’zoni tanlab biriktiradi (obyekt ID, foydalanuvchi ID, ruxsat bilan) va olib tashlaydi', async () => {
    const onSaqla = vi.fn(async () => ({ ok: true }));
    korsat(graf(), { tanlangan: 'obyekt:5', masul: { mumkin: true, onSaqla } });
    const biriktir = screen.getByTestId('xarita-masul-biriktir');
    // Allaqachon mas‘ul bo‘lgan odam ro‘yxatda yo‘q.
    const tanlov = within(biriktir).getByLabelText('A’zo') as HTMLSelectElement;
    expect([...tanlov.options].map((o) => o.textContent)).toEqual(['A’zoni tanlang…', 'Bekzod Karimov · PTO']);
    const tugma = within(biriktir).getByRole('button', { name: /Mas‘ul biriktirish/ }) as HTMLButtonElement;
    expect(tugma.disabled).toBe(true);
    fireEvent.change(tanlov, { target: { value: 'foydalanuvchi:12' } });
    fireEvent.change(within(biriktir).getByLabelText('Ruxsat darajasi'), { target: { value: 'manage' } });
    fireEvent.click(tugma);
    await waitFor(() => expect(onSaqla).toHaveBeenCalledWith({ obyektId: 5, foydalanuvchiId: 12, ruxsat: 'manage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mas‘ullikni olib tashlash: Dilshod Yusupov' }));
    await waitFor(() => expect(onSaqla).toHaveBeenCalledWith({ obyektId: 5, foydalanuvchiId: 13, ruxsat: null }));
  });
  it('server xatosi ko‘rsatiladi', async () => {
    const onSaqla = vi.fn(async () => ({ ok: false, error: 'Bu odam kompaniyaning faol a’zosi emas.' }));
    korsat(graf(), { tanlangan: 'obyekt:5', masul: { mumkin: true, onSaqla } });
    fireEvent.change(screen.getByLabelText('A’zo'), { target: { value: 'foydalanuvchi:12' } });
    fireEvent.click(screen.getByRole('button', { name: /Mas‘ul biriktirish/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('faol a’zosi emas');
  });
  it('eski RPC (odamlar yo‘q) — Mas‘ullar bloki umuman chiqmaydi', () => {
    const g = graf();
    g.tugunlar = g.tugunlar.filter((t) => t.tur !== 'foydalanuvchi');
    g.bogichlar = g.bogichlar.filter((b) => b.tur !== 'masul_obyekt');
    korsat(g, { tanlangan: 'obyekt:5', masul: { mumkin: true, onSaqla: vi.fn() } });
    expect(screen.queryByTestId('xarita-masullar')).toBeNull();
  });
});

describe('Ko‘rinish doirasi va pul', () => {
  it('toliq=false — «faqat sizga biriktirilgan obyektlar» banneri', () => {
    korsat(graf({ toliq: false, pul: true, rol: 'prorab', yashirin_obyekt: 2 }));
    expect(screen.getByTestId('mindmap-doira').textContent).toContain('Siz faqat sizga biriktirilgan obyektlarni ko‘ryapsiz');
  });
  it('toliq=true — banner yo‘q', () => {
    korsat(graf({ toliq: true, pul: true, rol: 'boss' }));
    expect(screen.queryByTestId('mindmap-doira')).toBeNull();
    expect(screen.queryByTestId('mindmap-pul-yoq')).toBeNull();
  });
  it('pul=false — sabab bilan banner; summalar «—», hech qayerda 0 yo‘q; panelda sabab', () => {
    const g = graf({ toliq: true, pul: false, rol: 'prorab' }, true);
    const { container, unmount } = korsat(g);
    expect(screen.getByTestId('mindmap-pul-yoq').textContent).toContain('Summalar ko‘rsatilmaydi (moliyaviy ruxsat yo‘q)');
    // KPI: smeta/fakt/F2 — «—», izoh — sabab.
    const kpilar = [...container.querySelectorAll('.fz-kpi')];
    for (const nom of ['Smeta (ustamasiz)', 'Bajarilgan (fakt)', 'F2 (tasdiqlangan)']) {
      const k = kpilar.find((e) => e.textContent?.includes(nom))!;
      expect(k.querySelector('.fz-kpi__value')!.textContent).toBe('—');
      expect(k.textContent).toContain('moliyaviy ruxsat yo‘q');
    }
    // Ro‘yxat qatori: «smeta yo‘q» EMAS (u boshqa holat), «—».
    expect(screen.queryByText(/smeta yo‘q/)).toBeNull();
    unmount();
    korsat(g, { tanlangan: 'obyekt:5' });
    const panel = screen.getByRole('dialog', { name: 'Tafsilot paneli' });
    expect(within(panel).getByTestId('xarita-pul-yoq').textContent).toContain('Summalar ko‘rsatilmaydi');
    expect(within(panel).queryByText('0')).toBeNull();
  });
  it('xarita kartasida pul yo‘q bo‘lsa «smeta yo‘q» emas, «—»', () => {
    const { container } = korsat(graf({ toliq: true, pul: false, rol: 'prorab' }, true), { korinish: 'xarita' });
    const karta = container.querySelector('[data-tugun="obyekt:5"]')!;
    expect(karta.textContent).not.toContain('smeta yo‘q');
    expect(karta.textContent).toContain('—');
  });
});
