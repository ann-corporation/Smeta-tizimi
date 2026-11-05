/** Oylik paketda Forma-3 (egasi 2026-11-05: «forma 3 bermayapdi»): saqlangan bo'lmasa — F2 dan avto; saqlangan — ustun; rekvizit ogohlantirishi. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { strFromU8, unzipSync } from 'fflate';
import { F2OylikPaket } from './F2OylikPaket';
import type { ReestrMalumot } from '../../api/t2-f2-reestr';
import type { SvodShartnoma } from '../../lib/nakopitelniy-svod';

const m = vi.hoisted(() => ({ dl: vi.fn(), token: vi.fn(), svod: [] as unknown[] }));
vi.mock('../../api/f2-oylik-paket', () => ({
  portfelObyektOl: vi.fn(async () => ({ smeta: [], tafsilot: [], kontekst: { imzo: {}, shartnoma: null, nakrutka: null, podval: null }, aktQatorlar: new Map(), podvallar: new Map() })),
  f3SvodOl: vi.fn(async () => m.svod),
}));
// Akt summasi (yadro) — sintetik: QQS bilan 1 120 000,35.
vi.mock('../../lib/f2-oylik-paket/portfel', async (asl) => ({
  ...(await asl<typeof import('../../lib/f2-oylik-paket/portfel')>()),
  paketAktHisobi: () => ({ moliya: { ustamasiz: 900_000, ustamali: 1_000_000.31, nds: 120_000.04, jami: 1_120_000.35, taxminiy: false, narxsizQator: 0, qatorSoni: 1, sabab: null }, uchastkalar: 0 }),
  paketAktExcel: () => null,
}));
vi.mock('../../api/t2-token', () => ({ tokenBilan: vi.fn(), mazmunXeshi: vi.fn() }));
vi.mock('../../api/t2-shartnoma-oylik-paket', () => ({
  oyFaktSoni: vi.fn(async () => 0), oyM29Holati: vi.fn(async () => 'yoq'), oylikPaketlarRoyxati: vi.fn(async () => ({ ok: true, paketlar: [] })),
  oylikPaketniTopshir: vi.fn(), paketZipniSaqla: vi.fn(), saqlanganZipniOl: vi.fn(), yangiTopshirishId: () => 'op',
}));
vi.mock('../../lib/oylik-hujjat/paket', () => ({ obyektHujjatlariniYigish: vi.fn(async () => ({ fayllar: [], kataklar: {}, otkazilgan: [] })) }));
vi.mock('../../lib/oylik-hujjat/ostatka-slichitelniy', () => ({ paketImzosiOl: vi.fn(async () => ({})) }));
vi.mock('../../lib/oylik-hujjat/m29', () => ({ pudratchiNomiOl: vi.fn(async () => null) }));
vi.mock('../../lib/token-hujjat', () => ({ hujjatTokenBilan: (...a: unknown[]) => m.token(...a) }));
vi.mock('../../lib/construction-document-control/export/download-helper', () => ({ downloadBlob: (...a: unknown[]) => m.dl(...a) }));

const sh = { id: 26, raqam: '26', nom: '2-LOT (shartnoma tuzilmagan)', jami_nds_bilan: null, summa_bez_nds: null };
const akt = { id: 1, obyekt_id: 1, oy: '2026-09-01', raqam: '1', holat: 'tasdiqlangan', lifecycle_status: 'approved', hujjat_jami: 900_000, farq: 0, qator_soni: 1, narxsiz_qator: 0, manba: 'tizim' as const };
const malumot: ReestrMalumot = {
  obyektlar: [{ id: 1, nom: 'Alfa', loyiha_id: null, jami: null, narxsiz: null }],
  aktlar: [akt], shartnomalar: new Map([[1, [sh]]]), loyihalar: new Map(), manbaXato: 0, faylNomlari: new Map(),
};
const svodSh = (holat: 'tayyor' | 'qoralama'): SvodShartnoma => ({
  id: 26, loyiha_id: 1, raqam: '26', nom: sh.nom, asosiy: true, holat: 'faol', jami_nds_bilan: null, obyektlar: [{ id: 1, nom: 'Alfa' }], ds: [], f2: [],
  f3: [{ id: 31, manba: 'sotuv', raqam: '5', sotuv_sana: '2026-09-10', sotuv_summa: 1_000_000, nds_foiz: 12, davr_boshi: '2026-09-01', davr_oxiri: '2026-09-10', holat, bajarilgan_f2_summa: null, izoh: null, versiya: 1 }],
  tolovlar: [],
});

beforeEach(() => {
  m.svod = []; m.dl.mockReset(); m.token.mockReset();
  m.token.mockResolvedValue({ ok: true, xabar: '' });
  try { window.localStorage.clear(); } catch { /* yo'q */ }
});
afterEach(cleanup);

async function zipOl(): Promise<Record<string, Uint8Array>> {
  render(<F2OylikPaket kompaniyaId={17} malumot={malumot} tashkilot={null} />);
  fireEvent.click(screen.getByText('Oylik paketni tayyorlash'));
  await screen.findByLabelText('Tayyorgarlik');
  const btn = await screen.findByRole('button', { name: /Paketni yuklab olish/ });
  await waitFor(() => expect(screen.queryByText('Summalar (ustamali, NDS) hisoblanmoqda…')).toBeNull());
  fireEvent.click(btn);
  await waitFor(() => expect(m.dl).toHaveBeenCalled());
  return unzipSync(m.dl.mock.calls.at(-1)![0] as Uint8Array);
}

it('saqlangan F3 yo‘q — ZIP da avto Ф3 (F2 jamisi bilan), MUNDARIJA da belgisi; rekvizit ogohlantirishi ekranda va ПАКЕТ_СОСТАВ da', async () => {
  const z = await zipOl();
  const f3 = Object.keys(z).filter((n) => /Ф3_/.test(n));
  expect(f3).toHaveLength(1);
  expect(f3[0]).toContain('АВТО');
  expect(strFromU8(z[f3[0]] ? unzipSync(z[f3[0]])['xl/worksheets/sheet1.xml'] : new Uint8Array())).toContain('1120000.35');
  const mund = strFromU8(unzipSync(z['00_MUNDARIJA.xlsx'])['xl/worksheets/sheet1.xml']);
  expect(mund.toUpperCase()).toContain('АВТОМАТИЧЕСКИ ПО Ф-2');
  const tarkib = strFromU8(z['ПАКЕТ_СОСТАВ.txt']);
  expect(tarkib).toContain('Внимание');
  expect(tarkib).toContain('номер и дата договора');
  expect(await screen.findByText(/Forma-3 rekvizitlari yetishmaydi/)).toBeTruthy();
  expect(screen.getByTestId('f3-holat-2026-09').textContent).toContain('avto (F2 dan)');
  expect(screen.getByText('Forma-3 ni saqlash').closest('a')?.getAttribute('href')).toContain('f3_sana=2026-09-30');
});

it('saqlangan (tayyor) F3 bo‘lsa — o‘sha ishlatiladi, avto yasalmaydi; MUNDARIJA da F2 bilan solishtiruv', async () => {
  m.svod = [svodSh('tayyor')];
  const z = await zipOl();
  const f3 = Object.keys(z).filter((n) => /Ф3_/.test(n));
  expect(f3).toHaveLength(1);
  expect(f3[0]).not.toContain('АВТО');
  const mund = strFromU8(unzipSync(z['00_MUNDARIJA.xlsx'])['xl/worksheets/sheet1.xml']);
  expect(mund).toMatch(/разница/i);
  expect(screen.getByTestId('f3-holat-2026-09').textContent).toContain('saqlangan');
});

it('faqat qoralama F3 — holat «qoralama bor», paketga avto Ф3', async () => {
  m.svod = [svodSh('qoralama')];
  const z = await zipOl();
  expect(Object.keys(z).filter((n) => /Ф3_/.test(n))[0]).toContain('АВТО');
  expect(screen.getByTestId('f3-holat-2026-09').textContent).toContain('qoralama bor');
});
