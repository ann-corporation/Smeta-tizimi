import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { F2OylikPaket } from './F2OylikPaket';
import type { ReestrMalumot } from '../../api/t2-f2-reestr';

vi.mock('../../api/f2-oylik-paket', () => ({
  // Qatorlari bo'sh obyekt: ustamasiz = reestr hujjat jami, ustamali noma'lum (QATOR_YOQ) — 0 emas.
  oyObyektOl: vi.fn(async () => ({ smeta: [], tafsilot: [], kontekst: { imzo: {}, shartnoma: null, nakrutka: null, podval: null } })),
  f3SvodOl: vi.fn(async () => []),
}));
vi.mock('../../api/t2-token', () => ({ tokenBilan: vi.fn(), mazmunXeshi: vi.fn() }));

const malumot: ReestrMalumot = {
  obyektlar: [{ id: 140, nom: 'Yevropa oshxonasi', loyiha_id: 7, jami: null, narxsiz: null }, { id: 150, nom: 'Karting', loyiha_id: null, jami: null, narxsiz: null }],
  aktlar: [
    { id: 1, obyekt_id: 140, oy: '2026-09-01', raqam: '5', holat: 'tasdiqlangan', lifecycle_status: 'approved', hujjat_jami: 1_200_000, farq: 0, qator_soni: 3, narxsiz_qator: 0, manba: 'tizim' },
    { id: 2, obyekt_id: 140, oy: '2026-09-01', raqam: '5', holat: 'qoralama', lifecycle_status: 'draft', hujjat_jami: 300_000.5, farq: 0, qator_soni: 2, narxsiz_qator: 0, manba: 'tizim' },
    { id: 3, obyekt_id: 150, oy: '2026-09-01', raqam: null, holat: 'qoralama', lifecycle_status: 'draft', hujjat_jami: null, farq: null, qator_soni: 2, narxsiz_qator: 0, manba: 'import' },
    { id: 4, obyekt_id: 150, oy: '2026-08-01', raqam: '1', holat: 'tasdiqlangan', lifecycle_status: 'approved', hujjat_jami: 50, farq: 0, qator_soni: 1, narxsiz_qator: 0, manba: 'import' },
  ],
  shartnomalar: new Map(), loyihalar: new Map([[7, 'Navoiy bog‘']]), manbaXato: 0, faylNomlari: new Map(),
};
afterEach(cleanup);

it('oylik paket: yig‘iq; ochilganda eng yangi oy, qatorlar, havolalar, jami, tekshiruvlar va sukut tanlov (tasdiqlanganlar)', async () => {
  render(<F2OylikPaket kompaniyaId={17} malumot={malumot} tashkilot="NEW TIMES" />);
  expect(screen.queryByText('Yevropa oshxonasi')).toBeNull();
  fireEvent.click(screen.getByText('Oylik F2 paketini tayyorlash'));
  expect((await screen.findAllByText('Yevropa oshxonasi')).length).toBeGreaterThanOrEqual(2);
  expect((screen.getByLabelText('Hisobot oyi') as HTMLInputElement).value).toBe('2026-09');
  // Avgust F2 si bu oyda ko'rinmaydi.
  expect(screen.queryByText('№ 1')).toBeNull();
  // Sukut tanlov: faqat tasdiqlangan (1 ta).
  const btn = screen.getByRole('button', { name: /Paketni yuklab olish \(1\)/ });
  expect((btn as HTMLButtonElement).disabled).toBe(false);
  // «+ F2 yuklash» — davr oldindan.
  expect(screen.getByText('+ F2 yuklash').closest('a')?.getAttribute('href')).toBe('/admin/f2?davr=2026-09');
  // Qoralama tizim F2 — tahrirlash havolalari; import qoralama — import oynasida tahrirlash.
  const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
  expect(hrefs).toContain('/admin/f2-tayyorlash?obyekt=140&akt=2');
  expect(hrefs).toContain('/admin/f2?obyekt=140&akt=2');
  expect(hrefs).toContain('/admin/f2?obyekt=150&akt=3');
  expect(hrefs).not.toContain('/admin/f2-tayyorlash?obyekt=140&akt=1');
  // Oy jami: ustamasiz 1 200 000,00 + 300 000,50; ustamali hamma joyda noma'lum (qator yo'q) — 0 emas.
  const jamiQator = (await screen.findByText(/Oy jami — barcha F2 \(3 ta\)/)).closest('tr')!;
  expect(within(jamiQator).getByText(/1\s500\s000,50/)).toBeTruthy();
  expect(within(jamiQator).getAllByText(/ta summasi noma’lum/).length).toBeGreaterThan(0);
  // Tekshiruvlar (bloklamaydi).
  expect(screen.getByText(/Tekshiruvlar \(\d+\) — paketni bloklamaydi/)).toBeTruthy();
  expect(screen.getAllByText(/Bir obyektda shu oyda raqam takrorlangan/).length).toBe(2);
  expect(screen.getByText(/F2 raqami yo‘q/)).toBeTruthy();
});
