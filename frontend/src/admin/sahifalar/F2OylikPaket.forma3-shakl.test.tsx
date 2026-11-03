/** Oylik paketda Forma-3 shakli (egasi 2026-11-03): sukut to'liq, bir qatorli, ikkalasi ham; tanlov kompaniya bo'yicha eslanadi. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { unzipSync } from 'fflate';
import { F2OylikPaket } from './F2OylikPaket';
import type { ReestrMalumot } from '../../api/t2-f2-reestr';
import type { SvodShartnoma } from '../../lib/nakopitelniy-svod';

const m = vi.hoisted(() => ({ dl: vi.fn(), token: vi.fn(), svod: [] as unknown[] }));
vi.mock('../../api/f2-oylik-paket', () => ({
  oyObyektOl: vi.fn(async () => ({ smeta: [], tafsilot: [], kontekst: { imzo: {}, shartnoma: null, nakrutka: null, podval: null } })),
  f3SvodOl: vi.fn(async () => m.svod),
}));
vi.mock('../../api/t2-token', () => ({ tokenBilan: vi.fn(), mazmunXeshi: vi.fn() }));
vi.mock('../../api/t2-shartnoma-oylik-paket', () => ({
  oyFaktSoni: vi.fn(async () => 0), oyM29Holati: vi.fn(async () => 'yoq'), oylikPaketlarRoyxati: vi.fn(async () => ({ ok: true, paketlar: [] })),
  oylikPaketniTopshir: vi.fn(), paketZipniSaqla: vi.fn(), saqlanganZipniOl: vi.fn(), yangiTopshirishId: () => 'op',
}));
// Obyekt hujjatlari (Nakopitelniy/M-29/Ostatka/Slichitelniy) bu testda tekshirilmaydi - tarmoqsiz bo'sh natija (lib/oylik-hujjat/paket.test.ts da to'liq).
vi.mock('../../lib/oylik-hujjat/paket', () => ({ obyektHujjatlariniYigish: vi.fn(async () => ({ fayllar: [], kataklar: {}, otkazilgan: [] })) }));
vi.mock('../../lib/oylik-hujjat/ostatka-slichitelniy', () => ({ paketImzosiOl: vi.fn(async () => ({})) }));
vi.mock('../../lib/oylik-hujjat/m29', () => ({ pudratchiNomiOl: vi.fn(async () => null) }));
vi.mock('../../lib/token-hujjat', () => ({ hujjatTokenBilan: (...a: unknown[]) => m.token(...a) }));
vi.mock('../../lib/construction-document-control/export/download-helper', () => ({ downloadBlob: (...a: unknown[]) => m.dl(...a) }));

const sh = { id: 9, raqam: 'T-9', nom: null, jami_nds_bilan: null, summa_bez_nds: null };
const akt = { id: 1, obyekt_id: 1, oy: '2026-09-01', raqam: '1', holat: 'tasdiqlangan', lifecycle_status: 'approved', hujjat_jami: 100, farq: 0, qator_soni: 1, narxsiz_qator: 0, manba: 'tizim' as const };
const malumot: ReestrMalumot = {
  obyektlar: [{ id: 1, nom: 'Alfa', loyiha_id: null, jami: null, narxsiz: null }],
  aktlar: [akt], shartnomalar: new Map([[1, [sh]]]), loyihalar: new Map(), manbaXato: 0, faylNomlari: new Map(),
};
const svodSh: SvodShartnoma = {
  id: 9, loyiha_id: 1, raqam: 'T-9', nom: null, asosiy: true, holat: 'faol', jami_nds_bilan: 2_000_000,
  obyektlar: [{ id: 1, nom: 'Alfa' }], ds: [], f2: [],
  f3: [{ id: 31, manba: 'sotuv', raqam: '5', sotuv_sana: '2026-09-10', sotuv_summa: 1_120_000.35, nds_foiz: 12, davr_boshi: '2026-09-01', davr_oxiri: '2026-09-10', holat: 'tayyor', bajarilgan_f2_summa: null, izoh: null, versiya: 1 }],
  tolovlar: [],
};

beforeEach(() => {
  m.svod = [svodSh];
  m.dl.mockReset(); m.token.mockReset();
  m.token.mockResolvedValue({ ok: true, xabar: '' });
  try { window.localStorage.clear(); } catch { /* yo'q */ }
});
afterEach(cleanup);

async function paketFayllari(): Promise<string[]> {
  fireEvent.click(await screen.findByRole('button', { name: /Paketni yuklab olish/ }));
  await waitFor(() => expect(m.dl).toHaveBeenCalled());
  const [zip] = m.dl.mock.calls.at(-1)! as [Uint8Array];
  return Object.keys(unzipSync(zip)).filter((n) => /Ф3_/.test(n));
}
const tanlagich = () => screen.getByLabelText('Forma-3 shakli') as HTMLSelectElement;

it('sukut: to‘liq shakl; paketda faqat bitta (to‘liq) Forma-3', async () => {
  render(<F2OylikPaket kompaniyaId={17} malumot={malumot} tashkilot="Sinov" />);
  fireEvent.click(screen.getByText('Oylik paketni tayyorlash'));
  await screen.findByLabelText('Tayyorgarlik');
  expect(tanlagich().value).toBe('toliq');
  const f = await paketFayllari();
  expect(f).toHaveLength(1);
  expect(f[0]).not.toContain('ОДНОСТРОЧНАЯ');
});

it('bir qatorli tanlansa paketga bir qatorli Forma-3 kiradi va tanlov kompaniya bo‘yicha eslanadi', async () => {
  const r = render(<F2OylikPaket kompaniyaId={17} malumot={malumot} tashkilot="Sinov" />);
  fireEvent.click(screen.getByText('Oylik paketni tayyorlash'));
  await screen.findByLabelText('Tayyorgarlik');
  fireEvent.change(tanlagich(), { target: { value: 'bir_qatorli' } });
  const f = await paketFayllari();
  expect(f).toHaveLength(1);
  expect(f[0]).toContain('ОДНОСТРОЧНАЯ');
  expect(window.localStorage.getItem('forma3.shakl.v1:paket:17')).toBe('bir_qatorli');
  r.unmount();
  // Qayta ochilganda shu kompaniya uchun eslab qolingan; boshqa kompaniyada — sukut.
  render(<F2OylikPaket kompaniyaId={17} malumot={malumot} tashkilot="Sinov" />);
  fireEvent.click(screen.getByText('Oylik paketni tayyorlash'));
  await screen.findByLabelText('Tayyorgarlik');
  expect(tanlagich().value).toBe('bir_qatorli');
});

it('«Ikkalasi ham» — paketga ikki fayl: to‘liq va bir qatorli', async () => {
  render(<F2OylikPaket kompaniyaId={18} malumot={malumot} tashkilot="Sinov" />);
  fireEvent.click(screen.getByText('Oylik paketni tayyorlash'));
  await screen.findByLabelText('Tayyorgarlik');
  expect(tanlagich().value).toBe('toliq');
  fireEvent.change(tanlagich(), { target: { value: 'ikkalasi' } });
  const f = await paketFayllari();
  expect(f).toHaveLength(2);
  expect(f.filter((n) => n.includes('ОДНОСТРОЧНАЯ'))).toHaveLength(1);
});
