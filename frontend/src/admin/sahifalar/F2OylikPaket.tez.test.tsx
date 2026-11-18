/** Shartnoma oylik paketi — tez yo'l (egasi): sahifa BITTA server so'rovi bilan ochiladi (obyekt smetalari o'qilmaydi), fayllar faqat «Paketni yuklab olish» da,
 *  4 parallel, «N/M tayyor», paket tokeni BITTA chaqiruv (hujjat xeshlari bilan). */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { F2OylikPaket } from './F2OylikPaket';
import type { ReestrMalumot } from '../../api/t2-f2-reestr';

const m = vi.hoisted(() => ({ dl: vi.fn(), token: vi.fn(), obyektOl: vi.fn(), oylik: vi.fn(), summa: vi.fn(), yarat: vi.fn(), hozir: 0, eng: 0 }));
vi.mock('../../api/f2-oylik-paket', () => ({ portfelObyektOl: (...a: unknown[]) => m.obyektOl(...a), f3SvodOl: vi.fn(async () => []) }));
vi.mock('../../api/t2-f2-portfel', () => ({ aktSummalarParallel: (...a: unknown[]) => m.summa(...a) }));
vi.mock('../../api/t2-token', () => ({ tokenBilan: vi.fn(), mazmunXeshi: vi.fn() }));
vi.mock('../../api/t2-shartnoma-oylik-paket', () => ({
  oylikPaketOl: (...a: unknown[]) => m.oylik(...a), oylikPaketlarRoyxati: vi.fn(async () => ({ ok: true, paketlar: [] })),
  oylikPaketniTopshir: vi.fn(), paketZipniSaqla: vi.fn(), saqlanganZipniOl: vi.fn(), yangiTopshirishId: () => 'op',
}));
vi.mock('../../api/hujjat-yarat', () => ({ hujjatYarat: (...a: unknown[]) => m.yarat(...a) }));
vi.mock('../../lib/oylik-hujjat/paket', () => ({ obyektHujjatlariniYigish: vi.fn(async () => ({ fayllar: [], kataklar: {}, otkazilgan: [] })) }));
vi.mock('../../lib/oylik-hujjat/ostatka-slichitelniy', () => ({ paketImzosiOl: vi.fn(async () => ({})) }));
vi.mock('../../lib/oylik-hujjat/m29', () => ({ pudratchiNomiOl: vi.fn(async () => null) }));
vi.mock('../../lib/token-hujjat', () => ({ hujjatTokenBilan: (...a: unknown[]) => m.token(...a) }));
vi.mock('../../lib/construction-document-control/export/download-helper', () => ({ downloadBlob: (...a: unknown[]) => m.dl(...a) }));

const sh = { id: 9, raqam: 'T-9', nom: null, jami_nds_bilan: null, summa_bez_nds: null };
const akt = (id: number, obyekt: number) => ({ id, obyekt_id: obyekt, oy: '2026-09-01', raqam: String(id), holat: 'tasdiqlangan', lifecycle_status: 'approved', hujjat_jami: 100, farq: 0, qator_soni: 1, narxsiz_qator: 0, manba: 'tizim' as const });
const malumot: ReestrMalumot = {
  obyektlar: [{ id: 1, nom: 'Alfa', loyiha_id: null, jami: null, narxsiz: null }, { id: 2, nom: 'Beta', loyiha_id: null, jami: null, narxsiz: null }],
  aktlar: [1, 2, 3, 4, 5, 6].map((i) => akt(i, i % 2 + 1)), shartnomalar: new Map([[1, [sh]], [2, [sh]]]), loyihalar: new Map(), manbaXato: 0, faylNomlari: new Map(),
};
const PAKET = { qqs_bilan: 112, qqs: 12, ustamali: 100, ustamasiz: 90, narxsiz_soni: 0, qator_soni: 1 };

beforeEach(() => {
  for (const f of [m.dl, m.token, m.obyektOl, m.oylik, m.summa, m.yarat]) f.mockReset();
  m.hozir = 0; m.eng = 0;
  m.oylik.mockResolvedValue([{ id: 1, nom: 'Alfa', faktSoni: 1, m29: 'bajarildi', aktlar: [] }, { id: 2, nom: 'Beta', faktSoni: 0, m29: 'yoq', aktlar: [] }]);
  m.summa.mockImplementation(async (_k: number, ids: number[], tayyor: (x: Map<number, unknown>, n: number) => void) => { tayyor(new Map(ids.map((id) => [id, PAKET])), ids.length); });
  m.token.mockResolvedValue({ ok: true, xabar: '' });
  m.yarat.mockImplementation(async () => { m.hozir++; m.eng = Math.max(m.eng, m.hozir); await new Promise((r) => setTimeout(r, 5)); m.hozir--; return { ok: true, bytes: new Uint8Array([1, 2, 3]), faylNomi: 'f.xlsx', mime: 'x', sarflandi: 0, bepulTakror: false }; });
  try { window.localStorage.clear(); } catch { /* yo'q */ }
});
afterEach(cleanup);

it('ochilish: bitta oylik so‘rov + summalar serverdan; obyekt smetasi o‘qilmaydi; jami serverdagi paketlar yig‘indisi', async () => {
  render(<F2OylikPaket kompaniyaId={17} malumot={malumot} tashkilot={null} />);
  fireEvent.click(screen.getByText('Oylik paketni tayyorlash'));
  await screen.findByLabelText('Tayyorgarlik');
  await waitFor(() => expect(m.summa).toHaveBeenCalled());
  expect(m.oylik).toHaveBeenCalledTimes(1);
  expect(m.oylik.mock.calls[0][0]).toEqual({ kompaniyaId: 17, shartnomaId: 9, oy: '2026-09' });
  expect(m.obyektOl).not.toHaveBeenCalled();
  expect(m.yarat).not.toHaveBeenCalled(); // fayllar ochilishda yasalmaydi
  expect(m.token).not.toHaveBeenCalled();
  // 6 akt x 112 = 672,00 (QQS bilan) - faqat server paketlaridan
  await waitFor(() => expect(screen.getAllByText(/672,00/).length).toBeGreaterThan(0));
});

it('yuklab olish: F2 fayllari 4 parallel, paket tokeni BITTA chaqiruv (fayl xeshlari bilan), ochilishda smeta o‘qilmaydi', async () => {
  render(<F2OylikPaket kompaniyaId={17} malumot={malumot} tashkilot={null} />);
  fireEvent.click(screen.getByText('Oylik paketni tayyorlash'));
  fireEvent.click(await screen.findByRole('button', { name: /Paketni yuklab olish/ }));
  await waitFor(() => expect(m.dl).toHaveBeenCalled());
  expect(m.yarat).toHaveBeenCalledTimes(6);
  expect(m.eng).toBeGreaterThan(1);
  expect(m.eng).toBeLessThanOrEqual(4);
  expect(m.token).toHaveBeenCalledTimes(1);
  const p = m.token.mock.calls[0][0] as { fayllar: number[]; xeshlar: string[]; hujjat: string };
  expect(p.hujjat).toBe('PAKET');
  expect(p.fayllar.length).toBeGreaterThanOrEqual(2); // reestr + mundarija (+ F3/sverka bo'lsa)
  expect(p.xeshlar.length).toBe(p.fayllar.length);
  expect(m.obyektOl).not.toHaveBeenCalled();
});

it('token yetmasa paket yuklanmaydi (hech narsa berilmaydi)', async () => {
  m.token.mockResolvedValue({ ok: false, xabar: 'Token yetmaydi' });
  render(<F2OylikPaket kompaniyaId={17} malumot={malumot} tashkilot={null} />);
  fireEvent.click(screen.getByText('Oylik paketni tayyorlash'));
  fireEvent.click(await screen.findByRole('button', { name: /Paketni yuklab olish/ }));
  await waitFor(() => expect(m.token).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 30));
  expect(m.dl).not.toHaveBeenCalled();
});