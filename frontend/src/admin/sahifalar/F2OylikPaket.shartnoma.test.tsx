import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { F2OylikPaket } from './F2OylikPaket';
import type { ReestrMalumot } from '../../api/t2-f2-reestr';

const m = vi.hoisted(() => ({ arxiv: vi.fn() }));
vi.mock('../../api/f2-oylik-paket', () => ({
  portfelObyektOl: vi.fn(async () => ({ smeta: [], tafsilot: [], kontekst: { imzo: {}, shartnoma: null, nakrutka: null, podval: null }, aktQatorlar: new Map(), podvallar: new Map() })),
  f3SvodOl: vi.fn(async () => []),
}));
vi.mock('../../api/t2-token', () => ({ tokenBilan: vi.fn(), mazmunXeshi: vi.fn() }));
vi.mock('../../api/t2-shartnoma-oylik-paket', () => ({
  oyFaktSoni: vi.fn(async (id: number) => (id === 1 ? 3 : 0)),
  oyM29Holati: vi.fn(async () => 'yoq'),
  oylikPaketlarRoyxati: m.arxiv,
  oylikPaketniTopshir: vi.fn(), paketZipniSaqla: vi.fn(), saqlanganZipniOl: vi.fn(), yangiTopshirishId: () => 'op',
}));

const sh = { id: 9, raqam: 'T-9', nom: null, jami_nds_bilan: null, summa_bez_nds: null };
const akt = (id: number, obyekt: number, holat: string, lc: string) => ({ id, obyekt_id: obyekt, oy: '2026-09-01', raqam: String(id), holat, lifecycle_status: lc, hujjat_jami: 100, farq: 0, qator_soni: 1, narxsiz_qator: 0, manba: 'tizim' as const });
const malumot: ReestrMalumot = {
  obyektlar: [{ id: 1, nom: 'Alfa', loyiha_id: null, jami: null, narxsiz: null }, { id: 2, nom: 'Beta', loyiha_id: null, jami: null, narxsiz: null }],
  aktlar: [akt(1, 1, 'tasdiqlangan', 'approved'), akt(2, 2, 'qoralama', 'draft')],
  shartnomalar: new Map([[1, [sh]], [2, [sh]]]), loyihalar: new Map(), manbaXato: 0, faylNomlari: new Map(),
};
afterEach(cleanup);

it('shartnoma rejimi: tayyorgarlik jadvali obyektlar kesimida, arxiv, «Topshirildi» tugmasi (bloklamaydi)', async () => {
  m.arxiv.mockResolvedValue({ ok: true, paketlar: [{
    id: 1, shartnoma_id: 9, shartnoma_raqam: 'T-9', shartnoma_nom: null, oy: '2026-09', versiya: 2, holat: 'topshirildi', vaqt: '2026-10-01T05:00:00Z',
    hujjat_id: 5, zip_sha256: 'a'.repeat(64), zip_olcham: 10, kim_actor_id: 1, kim: 'PTO',
    manifest: { fayllar: [{}, {}], iz: [{ obyekt_id: 1, f2: [{ akt_id: 1, versiya: 1, holat: 'qoralama' }], fakt: { soni: 0, maks_id: null, xesh: '' } }] },
    hozirgi_iz: [{ obyekt_id: 1, f2: [{ akt_id: 1, versiya: 2, holat: 'tasdiqlangan' }], fakt: { soni: 0, maks_id: null, xesh: '' } }],
  }] });
  render(<F2OylikPaket kompaniyaId={17} malumot={malumot} tashkilot="NEW TIMES" />);
  fireEvent.click(screen.getByText('Oylik paketni tayyorlash'));
  const jadval = await screen.findByLabelText('Tayyorgarlik');
  const alfa = within(jadval).getByText('Alfa').closest('tr')!;
  const beta = within(jadval).getByText('Beta').closest('tr')!;
  await waitFor(() => expect(within(alfa).getAllByLabelText('tayyor').length).toBeGreaterThanOrEqual(2)); // fakt + F2 tasdiqlangan
  expect(within(beta).getAllByLabelText('diqqat').length).toBeGreaterThanOrEqual(2); // F2 faqat qoralama, nakopitelniy
  expect(within(beta).getAllByLabelText('yo‘q').length).toBeGreaterThanOrEqual(1); // fakt yo'q
  // Arxiv: versiya va «o'zgargan» belgisi
  expect(await screen.findByText('topshirilgandan keyin o‘zgargan')).toBeTruthy();
  expect(screen.getByText('v2')).toBeTruthy();
  // Joriy oy paketi eskirgan: aniq belgi va bir bosishda «Qayta yig'ish» (eski nusxa arxivda qoladi).
  expect(await screen.findByText('Paket eskirgan — qayta yig‘ing')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Qayta yig‘ish' }) as HTMLButtonElement).disabled).toBe(false);
  // Tugmalar bloklanmagan (qoralama ham bor, fakt yo'q bo'lsa ham)
  expect((screen.getByRole('button', { name: 'Topshirildi' }) as HTMLButtonElement).disabled).toBe(false);
});
