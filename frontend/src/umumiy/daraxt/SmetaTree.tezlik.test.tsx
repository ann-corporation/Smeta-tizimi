import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TreeNode } from '../../api/types';
import { F2_KORSAT_BOSH, f2ElementOrni, f2KorinadiQism } from '../../lib/f2-korinadi-qism';
import type { F2Bolim } from '../../lib/f2-tayyor';
vi.mock('../ui/QatorTahrirModal', () => ({ QatorTahrirModal: () => null }));
import { SmetaTree } from './SmetaTree';

// jsdom o'lcham bermaydi: skroll oynasi 600 px (haqiqiy brauzerdagi kabi) — virtualizer shu oynaga qatorlar chizadi.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 600 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 1000 });
});
afterAll(() => { delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight; delete (HTMLElement.prototype as { offsetWidth?: number }).offsetWidth; });
afterEach(cleanup);

/** Tezlik (egasi 2026-11-06: Sun'iy ko'l ~26 500 qator — Chrome qotardi): ekranda faqat chegaralangan qatorlar chiziladi. */
describe('katta smeta — chegaralangan render', () => {
  it('20 200 qatorli daraxt: yig‘iq ochiladi, «Hammasini yoyish» dan keyin ham faqat virtual oyna qatorlari chiziladi', () => {
    let id = 1;
    const data: TreeNode[] = Array.from({ length: 200 }, (_, a) => ({
      id: id++, type: 'rz', nom: `Razdel ${a}`, smeta: 100,
      children: Array.from({ length: 100 }, () => { const i = id++; return { id: i, type: 'bl', nom: `Ish ${i}`, smetaHajm: 1, children: [] }; }),
    })) as unknown as TreeNode[];
    render(<SmetaTree data={data} />);
    // Sukut: razdellar yig'iq — birorta ish qatori chizilmaydi.
    expect(screen.queryAllByText(/^Ish \d+$/).length).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: /Hammasini yoyish/ }));
    const ishlar = screen.queryAllByText(/^Ish \d+$/).length;
    const razdellar = screen.queryAllByText(/^Razdel \d+$/).length;
    expect(ishlar + razdellar).toBeGreaterThan(0); // haqiqatan chiziladi (bo'sh emas)
    expect(ishlar + razdellar).toBeLessThan(100); // 20 200 dan emas — oyna + overscan
  });

  it('F2 ro‘yxati: 20 000 element (ish + alohida material) — dastlab ko‘pi bilan F2_KORSAT_BOSH chiziladi, qolgani sanaladi', () => {
    let id = 1;
    const ish = () => ({ id: id++, nom: 'i', kod: null, birlik: 'м3', resurslar: [] }) as unknown as F2Bolim['ishlar'][number];
    const mat = () => ({ id: id++, nom: 'm' }) as unknown as F2Bolim['alohida'][number];
    const bolimlar: F2Bolim[] = Array.from({ length: 100 }, (_, b) => ({ id: b, nom: `B${b}`, daraja: 0,
      ishlar: Array.from({ length: 150 }, ish), alohida: Array.from({ length: 50 }, mat) }));
    const q = f2KorinadiQism(bolimlar, F2_KORSAT_BOSH);
    const chizilgan = q.bolimlar.reduce((s, b) => s + b.ishlar.length + b.alohida.length, 0);
    expect(chizilgan).toBe(F2_KORSAT_BOSH);
    expect(q.qolgan).toBe(20_000 - F2_KORSAT_BOSH);
    // Oxirgi element — «qatorga o'tish» butun ro'yxatni emas, aynan shu joygacha chizadi.
    expect(f2ElementOrni(bolimlar, id - 1)).toBe(20_000);
    // Limit yetarli bo'lsa bo'limlar o'zgarmay (havola bilan) qaytadi — keraksiz qayta render yo'q.
    expect(f2KorinadiQism(bolimlar.slice(0, 1), 1000).bolimlar[0]).toBe(bolimlar[0]);
  });
});
