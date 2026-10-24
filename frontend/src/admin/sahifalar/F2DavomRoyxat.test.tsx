import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { T2F2DavomQator } from '../../api/t2-f2-davom';

const m = vi.hoisted(() => ({ ol: vi.fn() }));
vi.mock('../../api/t2-f2-davom', () => ({ f2DavomRoyxatOl: m.ol }));
import { F2DavomRoyxat } from './F2DavomRoyxat';

const q = (job_id: number, oy: string, raqam: string, o: Partial<T2F2DavomQator> = {}): T2F2DavomQator => ({
  job_id, obyekt_id: 153, obyekt_nom: 'O', raqam, oy, fayl: null, akt_idx: 0, status: 'queued', jami: 10, aniq: 5, taklif: 0, topilmadi: 5, otkaz: 0,
  yangilandi: '2026-10-24', yaratildi: '2026-10-24', kim: null, yozilgan: false, akt_id: null, akt_holat: null, ...o,
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Davom ettiriladigan F2 lar — ketma-ketlik', () => {
  it('eski oydan yangiga tartiblanadi va faqat eng eski yozilmagan F2 «Navbatdagi» belgisini oladi', async () => {
    m.ol.mockResolvedValue({ ok: true, qatorlar: [q(1, '2026-05', '37'), q(2, '2025-12', '16'), q(3, '2025-09', '6', { yozilgan: true, akt_id: 9 }), q(4, '2025-09', '7')] });
    render(<F2DavomRoyxat kompaniyaId={123} obyektId={153} onOchish={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByText(/№ \d+/).length).toBeGreaterThan(0));
    const raqamlar = screen.getAllByText(/^№ \d+/).map((e) => e.textContent?.replace('Navbatdagi', '').trim());
    expect(raqamlar).toEqual(['№ 7', '№ 16', '№ 37']);
    expect(screen.getAllByText('Navbatdagi')).toHaveLength(1);
    expect(screen.getByText('Navbatdagi').parentElement?.textContent).toContain('№ 7');
  });
});