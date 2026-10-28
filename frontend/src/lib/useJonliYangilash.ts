/**
 * Yengil «jonli» yangilash (polling): har `oraliq` ms da `yukla` chaqiriladi, lekin
 *   - sahifa yashirin (`document.hidden`) bo'lsa — so'rov yuborilmaydi; qaytganda bir marta darhol yangilanadi;
 *   - xato bo'lsa — kutish ikki baravar oshadi (`maxOraliq` gacha), muvaffaqiyatdan keyin asl oraliqqa qaytadi;
 *   - bir vaqtda faqat BITTA so'rov (oldingisi tugamaguncha yangisi boshlanmaydi) — so'rov bo'roni yo'q;
 *   - `yoqilgan=false` — umuman so'rov yo'q (masalan, ruxsat yo'q).
 * `yangila()` — qo'lda yangilash (o'sha navbat qoidasi bilan).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type JonliHolat = { oxirgi: Date | null; yuklanmoqda: boolean; xatoSoni: number; keyingiMs: number };

export function keyingiOraliq(oraliq: number, xatoSoni: number, maxOraliq: number): number {
  if (xatoSoni <= 0) return oraliq;
  return Math.min(maxOraliq, oraliq * 2 ** Math.min(xatoSoni, 10));
}

export function useJonliYangilash(yukla: () => Promise<boolean>, { oraliq, maxOraliq, yoqilgan = true }: { oraliq: number; maxOraliq: number; yoqilgan?: boolean }) {
  const [holat, setHolat] = useState<JonliHolat>({ oxirgi: null, yuklanmoqda: false, xatoSoni: 0, keyingiMs: oraliq });
  const yuklaRef = useRef(yukla);
  yuklaRef.current = yukla;
  const band = useRef(false);
  const xatoSoni = useRef(0);
  const taymer = useRef<number | null>(null);
  const tirik = useRef(true);

  const rejala = useCallback((ms: number) => {
    if (taymer.current != null) window.clearTimeout(taymer.current);
    taymer.current = window.setTimeout(() => { taymer.current = null; void bajar(); }, ms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bajar = useCallback(async () => {
    if (!tirik.current || band.current) return;
    if (typeof document !== 'undefined' && document.hidden) return; // ko'ringanda `visibilitychange` qayta boshlaydi
    band.current = true;
    setHolat((h) => ({ ...h, yuklanmoqda: true }));
    let ok = false;
    try { ok = await yuklaRef.current(); } catch { ok = false; }
    band.current = false;
    if (!tirik.current) return;
    xatoSoni.current = ok ? 0 : xatoSoni.current + 1;
    const keyingi = keyingiOraliq(oraliq, xatoSoni.current, maxOraliq);
    setHolat((h) => ({ oxirgi: ok ? new Date() : h.oxirgi, yuklanmoqda: false, xatoSoni: xatoSoni.current, keyingiMs: keyingi }));
    rejala(keyingi);
  }, [oraliq, maxOraliq, rejala]);

  useEffect(() => {
    tirik.current = true;
    if (!yoqilgan) return () => { tirik.current = false; };
    void bajar();
    const korindi = () => { if (!document.hidden) void bajar(); };
    document.addEventListener('visibilitychange', korindi);
    return () => {
      tirik.current = false;
      document.removeEventListener('visibilitychange', korindi);
      if (taymer.current != null) window.clearTimeout(taymer.current);
      taymer.current = null;
    };
  }, [yoqilgan, bajar]);

  const yangila = useCallback(() => { void bajar(); }, [bajar]);
  return { ...holat, yangila };
}
