/** F2 portfeli (tez): ochilganda smeta/F2 tafsilotlari O'QILMAYDI; jadval bitta so'rovda; summa serverdan; hujjat_jami zaxirasi yo'q. */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { SummaPaket } from '../../lib/summa-paket';
import type { ReestrMalumot } from '../../api/t2-f2-reestr';

const portfelOl = vi.fn();
const aktSummalarParallel = vi.fn();
const portfelObyektOl = vi.fn();
vi.mock('../../api/t2-f2-portfel', () => ({ portfelOl: (...a: unknown[]) => portfelOl(...a), aktSummalarParallel: (...a: unknown[]) => aktSummalarParallel(...a), portfelBarchaAktlar: vi.fn() }));
vi.mock('../../api/f2-oylik-paket', () => ({ portfelObyektOl: (...a: unknown[]) => portfelObyektOl(...a) }));
vi.mock('../../lib/token-hujjat', () => ({ hujjatTokenBilan: vi.fn() }));

import { F2Portfel } from './F2Portfel';

const paket = (q: number): SummaPaket => ({
  qqs_bilan: q, qqs: q - q / 1.12, ustamali: q / 1.12, ustamasiz: q / 1.12 / 1.1, qqs_foiz: 12, ustamasiz_qism: 0,
  kesim: { chel: 0, mash: 0, mat: 0, ob: 0, subpudrat: 0, svod: 0, ustamasiz: 0, nomalum: 0 }, soat: { chel: 0, mash: 0, mashinist: 0 }, subpudratchilar: [], narxsiz_soni: 0, qator_soni: 2,
});
const malumot = { obyektlar: [{ id: 1, nom: 'O1', loyiha_id: null, jami: 1, narxsiz: 0 }], aktlar: [{ id: 10, obyekt_id: 1 }], shartnomalar: new Map([[1, [{ id: 5, raqam: '6', nom: 'lot', jami_nds_bilan: null, summa_bez_nds: null }]]]), loyihalar: new Map(), manbaXato: 0, faylNomlari: new Map() } as unknown as ReestrMalumot;

beforeEach(() => {
  portfelOl.mockReset(); aktSummalarParallel.mockReset(); portfelObyektOl.mockReset();
  window.history.replaceState({}, '', '/?portfel=1&shartnoma=5');
  portfelOl.mockResolvedValue({
    shartnoma: { id: 5, raqam: '6', nom: 'lot', jami_nds_bilan: null }, jami: { tasdiqlangan: paket(224), qoralama: paket(112), hammasi: paket(336) },
    soni: { tasdiqlangan: 1, qoralama: 1, bekor: 1, jami: 3 }, obyektlar: [{ id: 1, nom: 'O1', tasdiqlangan_soni: 1, qoralama_soni: 1, bekor_soni: 1, f2: paket(224), f2_qoralama: paket(112) }],
    aktlar: [
      { id: 10, obyekt_id: 1, obyekt_nom: 'O1', raqam: '1', oy: '2026-01-01', sana: null, holat: 'tasdiqlangan', versiya: 1, lifecycle_status: 'approved', hujjat_jami: 7777, forma3_id: null, manba: 'tizim' },
      { id: 11, obyekt_id: 1, obyekt_nom: 'O1', raqam: '2', oy: '2026-02-01', sana: null, holat: 'qoralama', versiya: 1, lifecycle_status: 'draft', hujjat_jami: 8888, forma3_id: null, manba: 'tizim' },
      { id: 12, obyekt_id: 1, obyekt_nom: 'O1', raqam: '3', oy: '2026-03-01', sana: null, holat: 'bekor', versiya: 1, lifecycle_status: 'cancelled', hujjat_jami: 9999, forma3_id: null, manba: 'tizim' },
    ],
    sahifa: { limit: 200, offset: 0, jami: 3, yana_bor: false },
  });
  aktSummalarParallel.mockImplementation(async (_k: number, idlar: number[], tayyor: (x: Map<number, SummaPaket | null>, n: number) => void) => {
    tayyor(new Map(idlar.map((id) => [id, paket(id === 10 ? 224 : 112)] as const)), idlar.length);
  });
});

describe('F2Portfel (tez)', () => {
  it('ochilganda: bitta ro‘yxat so‘rovi, smeta O‘QILMAYDI, bekor akt summasi so‘ralmaydi', async () => {
    render(<F2Portfel kompaniyaId={1} malumot={malumot} tashkilot="T" />);
    await waitFor(() => expect(screen.getByTestId('portfel-jami')).toBeTruthy());
    expect(portfelOl).toHaveBeenCalledTimes(1);
    expect(portfelObyektOl).not.toHaveBeenCalled();
    await waitFor(() => expect(aktSummalarParallel).toHaveBeenCalledTimes(1));
    expect(aktSummalarParallel.mock.calls[0][1]).toEqual([10, 11]); // 12 — bekor
  });
  it('akt summasi serverdan; hujjat_jami (7777/8888/9999) ekranda yo‘q', async () => {
    const { container } = render(<F2Portfel kompaniyaId={1} malumot={malumot} tashkilot="T" />);
    await waitFor(() => expect(container.textContent).toContain('№ 1'));
    await waitFor(() => expect(container.textContent).toContain('224'));
    expect(container.textContent).not.toMatch(/7\s?777|8\s?888|9\s?999/);
  });
});
