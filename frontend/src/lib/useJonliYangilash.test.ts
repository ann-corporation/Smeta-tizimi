import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { keyingiOraliq, useJonliYangilash } from './useJonliYangilash';

let yashirin = false;
beforeEach(() => {
  vi.useFakeTimers();
  yashirin = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => yashirin });
});
afterEach(() => { vi.useRealTimers(); });

const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

describe('useJonliYangilash', () => {
  it('ochilganda bir marta, keyin har 30 soniyada', async () => {
    const yukla = vi.fn(async () => true);
    renderHook(() => useJonliYangilash(yukla, { oraliq: 30_000, maxOraliq: 300_000 }));
    await flush();
    expect(yukla).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(yukla).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(yukla).toHaveBeenCalledTimes(3);
  });

  it('sahifa yashirin bo‘lsa so‘ramaydi; ko‘ringanda bir marta darhol yangilaydi', async () => {
    const yukla = vi.fn(async () => true);
    renderHook(() => useJonliYangilash(yukla, { oraliq: 30_000, maxOraliq: 300_000 }));
    await flush();
    expect(yukla).toHaveBeenCalledTimes(1);
    yashirin = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    expect(yukla).toHaveBeenCalledTimes(1);
    yashirin = false;
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await flush();
    expect(yukla).toHaveBeenCalledTimes(2);
  });

  it('xatoda kutish ortadi, muvaffaqiyatdan keyin asl oraliqqa qaytadi', async () => {
    let ok = false;
    const yukla = vi.fn(async () => ok);
    const { result } = renderHook(() => useJonliYangilash(yukla, { oraliq: 30_000, maxOraliq: 300_000 }));
    await flush();
    expect(result.current.xatoSoni).toBe(1);
    expect(result.current.keyingiMs).toBe(60_000);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(yukla).toHaveBeenCalledTimes(1); // hali kutyapti (60 s)
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(yukla).toHaveBeenCalledTimes(2);
    expect(result.current.keyingiMs).toBe(120_000);
    ok = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(result.current.xatoSoni).toBe(0);
    expect(result.current.keyingiMs).toBe(30_000);
    expect(result.current.oxirgi).not.toBeNull();
  });

  it('bir vaqtda faqat bitta so‘rov — qo‘lda bosish bo‘roni yo‘q', async () => {
    let tugat: (v: boolean) => void = () => {};
    const yukla = vi.fn(() => new Promise<boolean>((r) => { tugat = r; }));
    const { result } = renderHook(() => useJonliYangilash(yukla, { oraliq: 30_000, maxOraliq: 300_000 }));
    await flush();
    act(() => { result.current.yangila(); result.current.yangila(); result.current.yangila(); });
    expect(yukla).toHaveBeenCalledTimes(1);
    await act(async () => { tugat(true); });
    act(() => { result.current.yangila(); });
    expect(yukla).toHaveBeenCalledTimes(2);
  });

  it('yoqilmagan — umuman so‘rov yo‘q', async () => {
    const yukla = vi.fn(async () => true);
    renderHook(() => useJonliYangilash(yukla, { oraliq: 30_000, maxOraliq: 300_000, yoqilgan: false }));
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(yukla).not.toHaveBeenCalled();
  });

  it('kutish chegarasi', () => {
    expect(keyingiOraliq(30_000, 0, 300_000)).toBe(30_000);
    expect(keyingiOraliq(30_000, 3, 300_000)).toBe(240_000);
    expect(keyingiOraliq(30_000, 9, 300_000)).toBe(300_000);
  });
});
