import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MindmapGraf } from '../../api/t2-mindmap';
import type { PultYozuvchi } from '../../lib/mindmap-pult';
import { MindmapXarita, type PultBoshqaruv } from './MindmapXarita';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
});

const UZUN = 'Yevropa oshxona va mehmonxona majmuasi qurilishi, 1-bosqich, 2-blok (asosiy bino)';

function graf(): MindmapGraf {
  const imzo = { title: 'Smeta qatori metadata tekshiruvdan o‘tmadi', severity: 'warning' };
  return {
    tugunlar: [
      { id: 'kompaniya:1', tur: 'kompaniya', nom: 'Bosh kompaniya', meta: null, x: null, y: null },
      { id: 'loyiha:7', tur: 'loyiha', nom: 'Navoiy bog‘i', meta: { versiya: 3 }, x: null, y: null },
      { id: 'shartnoma:3', tur: 'shartnoma', nom: '№12/А', meta: { versiya: 2, loyiha_id: 7 }, x: null, y: null },
      { id: 'obyekt:5', tur: 'obyekt', nom: UZUN, x: null, y: null, meta: { versiya: 4, loyiha_id: 7, smeta: 1000, fakt: 600, f2: 400, fakt_foiz: 60, f2_foiz: 40, signal_count: 3, critical_count: 0, top_signals: [imzo, imzo, imzo], belgi: [] } },
      { id: 'obyekt:6', tur: 'obyekt', nom: UZUN, x: null, y: null, meta: { versiya: 1, loyiha_id: 7, smeta: null, fakt: 0, f2: 0, fakt_foiz: null, f2_foiz: null, belgi: [{ tur: 'smeta_yoq', daraja: 'ogoh', matn: 'Smeta yuklanmagan' }] } },
      { id: 'kontragent:9', tur: 'kontragent', nom: 'Buyurtmachi MChJ', meta: { versiya: 1 }, x: null, y: null },
      { id: 'obyekt:8', tur: 'obyekt', nom: 'Loyihasiz obyekt', x: null, y: null, meta: { versiya: 2, smeta: 10, fakt: 0, f2: 0, fakt_foiz: 0, f2_foiz: 0, belgi: [] } },
    ],
    bogichlar: [
      { manba: 'kompaniya:1', maqsad: 'loyiha:7', tur: 'loyiha_kompaniya', uzsa_boladi: false },
      { manba: 'loyiha:7', maqsad: 'shartnoma:3', tur: 'shartnoma_loyiha', uzsa_boladi: true },
      { manba: 'loyiha:7', maqsad: 'obyekt:5', tur: 'obyekt_loyiha', uzsa_boladi: true },
      { manba: 'loyiha:7', maqsad: 'obyekt:6', tur: 'obyekt_loyiha', uzsa_boladi: true },
      { manba: 'shartnoma:3', maqsad: 'obyekt:5', tur: 'shartnoma_obyekt', uzsa_boladi: true },
    ],
  };
}

function yozuvchi() {
  const y = {
    loyihaYarat: vi.fn(), obyektYarat: vi.fn(), shartnomaYarat: vi.fn(), loyihaNomla: vi.fn(), obyektNomla: vi.fn(),
    bog: vi.fn(async () => ({ ok: true })), bogOchir: vi.fn(async () => ({ ok: true })),
  };
  return y as typeof y & PultYozuvchi;
}

const prop = { yuklanmoqda: false, xato: '', oxirgiYangilanish: null, onYangila: () => {}, onTanla: () => {}, onKorinish: () => {} };

function chiz(o: { y?: ReturnType<typeof yozuvchi>; tahrir?: PultBoshqaruv['kontekst']['tahrir']; onTugadi?: PultBoshqaruv['onTugadi']; bolimlarOl?: PultBoshqaruv['bolimlarOl'] } = {}) {
  const y = o.y ?? yozuvchi();
  const pult: PultBoshqaruv = { kontekst: { tahrir: o.tahrir ?? { mumkin: true, sabab: null }, yozuvchi: y }, onTugadi: o.onTugadi ?? (() => {}), bolimlarOl: o.bolimlarOl };
  const amalKorish = { superadmin: true, rol: 'boss', permissions: null, boshqaKompaniya: false };
  render(<MemoryRouter><MindmapXarita graf={graf()} {...prop} tanlangan={null} korinish="pult" pult={pult} amalKorish={amalKorish} /></MemoryRouter>);
  return { y, pult };
}

const qator = (id: string) => document.querySelector<HTMLElement>('[data-testid="pult-qator"][data-tugun="' + id + '"]')!;

describe('Boshqaruv pulti ko‘rinishi', () => {
  it('daraxt: kompaniya → loyiha → shartnoma → obyekt; nomlar to‘liq va bir xil nomlar ajratilgan', () => {
    chiz();
    expect(screen.getByRole('heading', { name: 'Boshqaruv pulti' })).toBeTruthy();
    const q = [...document.querySelectorAll<HTMLElement>('[data-testid="pult-qator"]')].map((e) => e.getAttribute('data-tugun'));
    expect(q).toEqual(['kompaniya:1', 'loyiha:7', 'shartnoma:3', 'obyekt:5', 'obyekt:6', 'guruh:loyihasiz', 'obyekt:8']);
    expect(qator('obyekt:5').getAttribute('aria-level')).toBe('4');
    // To‘liq nom (kesilmagan) va ikkinchisidan farqlanadi.
    expect(within(qator('obyekt:5')).getByText(UZUN + ' · №5')).toBeTruthy();
    expect(within(qator('obyekt:6')).getByText(UZUN + ' · №6')).toBeTruthy();
    expect(qator('obyekt:5').querySelector('.truncate')).toBeNull();
  });

  it('holat belgilari xaritaning yagona hisobidan: fakt/F2 foizi, qoldiq = smeta − F2; smetasiz obyektda qoldiq «—»', () => {
    chiz();
    const b5 = within(qator('obyekt:5')).getByTestId('pult-belgilar').textContent!;
    expect(b5).toMatch(/F2 40%/);
    expect(b5).toMatch(/Qoldiq 600/);
    expect(b5).toMatch(/3 signal/);
    expect(within(qator('obyekt:6')).getByTestId('pult-belgilar').textContent).toMatch(/Qoldiq —/);
  });

  it('obyekt ochilganda: takrorsiz muammolar, sahifa havolalari, smeta bo‘limlari LAZY yuklanadi', async () => {
    const bolimlarOl = vi.fn(async () => ({ ok: true as const, bolimlar: [{ id: 1, kod: '01', nom: 'Umumqurilish ishlari' }] }));
    chiz({ bolimlarOl });
    expect(bolimlarOl).not.toHaveBeenCalled();
    fireEvent.click(within(qator('obyekt:5')).getByRole('button', { name: 'Yoyish' }));
    expect(await screen.findByText('01 · Umumqurilish ishlari')).toBeTruthy();
    expect(bolimlarOl).toHaveBeenCalledWith(5);
    const m = screen.getByTestId('pult-muammolar');
    expect(within(m).getAllByRole('listitem')).toHaveLength(1);
    expect(m.textContent).toMatch(/Smeta qatori metadata tekshiruvdan o‘tmadi ×3/);
    expect(screen.getByRole('button', { name: 'АОСР' })).toBeTruthy();
  });

  it('«Keyingi qadam» holatga qarab; ruxsat yo‘q sahifa — tugma yopiq', () => {
    chiz();
    expect(within(qator('obyekt:6')).getByTestId('pult-qadam').getAttribute('data-qadam')).toBe('smeta');
    expect(within(qator('obyekt:5')).getByTestId('pult-qadam').getAttribute('data-qadam')).toBe('f2');
  });

  it('yoyish/yig‘ish: loyihani yig‘sa avlodlari yo‘qoladi', () => {
    chiz();
    fireEvent.click(within(qator('loyiha:7')).getAllByRole('button', { name: 'Yig‘ish' })[0]);
    expect(qator('obyekt:5')).toBeNull();
    expect(qator('shartnoma:3')).toBeNull();
  });
});

describe('Pult amallari: menyu → oldindan ko‘rish → tasdiq', () => {
  const menyuOch = (id: string) => fireEvent.click(within(qator(id)).getByTestId('pult-amallar'));

  it('loyiha menyusi: sahifaga o‘tish ham, yaratish/biriktirish ham', () => {
    chiz();
    menyuOch('loyiha:7');
    const menyu = screen.getByTestId('mindmap-amal-menyu');
    for (const k of ['pult:obyekt.yarat', 'pult:shartnoma.yarat', 'pult:obyekt.biriktir', 'pult:tomon.biriktir', 'pult:loyiha.nomla', 'loyiha.reestr']) {
      expect(menyu.querySelector('[data-amal="' + k + '"]'), k).toBeTruthy();
    }
  });

  it('obyektni loyihaga biriktirish: tasdiqdan oldin yozilmaydi; tasdiqlansa to‘g‘ri buyruq + yamoq', async () => {
    const onTugadi = vi.fn();
    const { y } = chiz({ onTugadi });
    menyuOch('loyiha:7');
    fireEvent.click(screen.getByTestId('mindmap-amal-menyu').querySelector('[data-amal="pult:obyekt.biriktir"]')!);
    const forma = screen.getByTestId('pult-forma');
    fireEvent.change(forma.querySelector('select[data-maydon="obyekt"]')!, { target: { value: 'obyekt:8' } });
    fireEvent.click(screen.getByTestId('pult-korish-tugma'));
    const korish = screen.getByTestId('pult-korish');
    expect(korish.textContent).toMatch(/Loyihasiz obyekt/);
    expect(korish.textContent).toMatch(/mindmap_bog/);
    expect(y.bog).not.toHaveBeenCalled(); // tasdiq yo‘q — yozuv yo‘q
    fireEvent.click(screen.getByTestId('pult-tasdiq'));
    await waitFor(() => expect(y.bog).toHaveBeenCalledWith('obyekt_loyiha', 7, 8, 2, undefined));
    expect(await screen.findByTestId('pult-natija')).toBeTruthy();
    expect(onTugadi).toHaveBeenCalledTimes(1);
    expect(onTugadi.mock.calls[0][0].yamoq.qosh[0]).toMatchObject({ tur: 'obyekt_loyiha', manba: 'loyiha:7', maqsad: 'obyekt:8' });
  });

  it('shartnomadan ajratish: maydonsiz — darhol oldindan ko‘rish; server xatosi ko‘rinadi, yamoq qo‘llanmaydi', async () => {
    const onTugadi = vi.fn();
    const y = yozuvchi();
    y.bogOchir.mockResolvedValueOnce({ ok: false, error: 'versiya mos emas' } as never);
    chiz({ y, onTugadi });
    menyuOch('obyekt:5');
    fireEvent.click(screen.getByTestId('mindmap-amal-menyu').querySelector('[data-amal="pult:obyekt.shartnoma-uz"]')!);
    expect(screen.getByTestId('pult-korish').textContent).toMatch(/o‘chmaydi/);
    fireEvent.click(screen.getByTestId('pult-tasdiq'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/versiya mos emas/));
    expect(onTugadi).not.toHaveBeenCalled();
  });

  it('ruxsat yo‘q: pult amallari menyuda yopiq (sabab bilan), bosilsa modal ochilmaydi', () => {
    chiz({ tahrir: { mumkin: false, sabab: 'ruxsat_yoq' } });
    menyuOch('loyiha:7');
    const band = screen.getByTestId('mindmap-amal-menyu').querySelector('[data-amal="pult:obyekt.yarat"]') as HTMLElement;
    expect(band.getAttribute('aria-disabled')).toBe('true');
    expect(band.getAttribute('title')).toMatch(/document\.write/);
    fireEvent.click(band);
    expect(screen.queryByTestId('pult-modal')).toBeNull();
  });

  it('pult prop berilmasa — yozuvchi amallar umuman chiqmaydi (faqat sahifaga o‘tish)', () => {
    render(<MemoryRouter><MindmapXarita graf={graf()} {...prop} tanlangan={null} korinish="pult" /></MemoryRouter>);
    fireEvent.click(within(qator('loyiha:7')).getByTestId('pult-amallar'));
    expect(screen.getByTestId('mindmap-amal-menyu').querySelector('[data-amal^="pult:"]')).toBeNull();
  });
});
