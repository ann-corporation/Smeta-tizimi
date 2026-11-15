// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ farq: vi.fn() }));
vi.mock('../../api/t2-qator-muhr', () => ({ qatorMuhrFarqOl: api.farq }));

import { useMuhrFarq } from './MuhrFarqXulosa';

type Q = { id: number; versiya: number };
const rows = (n: number, v = 1): Q[] => Array.from({ length: n }, (_, i) => ({ id: i + 1, versiya: v }));

describe('useMuhrFarq — so‘rov tartibi (tezlik)', () => {
  beforeEach(() => { api.farq.mockReset(); api.farq.mockResolvedValue({ ok: true, qatorlar: [] }); });

  it('obyekt ochilishida daraxt qatorlarini KUTMASDAN darhol o‘qiydi, qatorlar kelishi qayta o‘qimaydi', async () => {
    const { rerender } = renderHook(({ q }: { q: Q[] }) => useMuhrFarq(5, q), { initialProps: { q: [] as Q[] } });
    await waitFor(() => expect(api.farq).toHaveBeenCalledTimes(1));
    expect(api.farq).toHaveBeenCalledWith(5);
    await act(async () => { rerender({ q: rows(3) }); });
    expect(api.farq).toHaveBeenCalledTimes(1);
  });

  it('qatorlar keyin o‘zgarsa (versiya) qayta o‘qiladi; o‘zgarmasa yo‘q', async () => {
    const { rerender } = renderHook(({ q }: { q: Q[] }) => useMuhrFarq(5, q), { initialProps: { q: rows(3) } });
    await waitFor(() => expect(api.farq).toHaveBeenCalledTimes(1));
    await act(async () => { rerender({ q: rows(3) }); });
    expect(api.farq).toHaveBeenCalledTimes(1);
    await act(async () => { rerender({ q: rows(3, 2) }); });
    await waitFor(() => expect(api.farq).toHaveBeenCalledTimes(2));
  });

  it('natija eski obyektdan kelsa qo‘llanmaydi; obyektsiz o‘qilmaydi', async () => {
    let tugat!: (v: unknown) => void;
    api.farq.mockImplementationOnce(() => new Promise((res) => { tugat = res; }));
    const { result, rerender } = renderHook(({ id }: { id: number | null }) => useMuhrFarq(id, []), { initialProps: { id: 5 as number | null } });
    await waitFor(() => expect(api.farq).toHaveBeenCalledTimes(1));
    api.farq.mockResolvedValueOnce({ ok: true, qatorlar: [] });
    await act(async () => { rerender({ id: 6 }); });
    await act(async () => { tugat({ ok: true, qatorlar: [{ qator_id: 1, holat: 'ozgargan' }] }); });
    expect(result.current.royxat.length).toBe(0);
    await act(async () => { rerender({ id: null }); });
    expect(api.farq).toHaveBeenCalledTimes(2);
  });
});
