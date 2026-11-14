/**
 * Og'ir bo'lmagan, lekin kechiktirsa bo'ladigan ishni brauzer bo'sh turganda (requestIdleCallback, bo'lmasa qisqa taymer) bajaradi.
 * Qaytgan funksiya — bekor qilish. `maksMs` dan keyin baribir bajariladi (ishni cheksiz kechiktirmaydi).
 */
export function bandsizdaBajar(f: () => void, maksMs = 1500): () => void {
  const w = typeof window !== 'undefined' ? (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void }) : undefined;
  if (w?.requestIdleCallback) {
    const h = w.requestIdleCallback(f, { timeout: maksMs });
    return () => w.cancelIdleCallback?.(h);
  }
  const h = setTimeout(f, 0);
  return () => clearTimeout(h);
}
