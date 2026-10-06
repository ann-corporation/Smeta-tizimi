import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { qadamTaklifOl, type QadamTaklifi } from '../../api/t2-agent-ish';
import { FaoliyatIzi, IZ_HODISA, sovushMs, taklifSababi, tugmaYorligi, yolNaqshi } from '../../lib/agent-faoliyat';

const KALIT_YOQ = 't2_ai_kuzatuv';
const KALIT_RAD = 't2_ai_rad_soni';
const TEKSHIRUV_MS = 15_000;

const oqi = (k: string): string | null => { try { return window.localStorage.getItem(k); } catch { return null; } };
const yoz = (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch { /* xotira yopiq — davom etamiz */ } };

/** AI kuzatuvi yoqilganmi (foydalanuvchi tanlovi; standart — O'CHIQ). */
export const aiKuzatuvYoqilgan = () => oqi(KALIT_YOQ) === '1';

/**
 * Proaktiv yordam: foydalanuvchi AI ni YOQQANDA harakat izini (matnsiz) mahalliy yig'adi; haqiqiy qiyinchilik belgisi
 * (takroriy xato, adashish, qotib qolish) bo'lsagina serverdan ixtiyoriy BITTA taklif so'raydi. Rad etilsa — sovush vaqti uzayadi.
 */
export function useAiKuzatuv(kompaniyaId: number | undefined) {
  const { pathname } = useLocation();
  const [yoqilgan, setYoqilgan] = useState<boolean>(aiKuzatuvYoqilgan);
  const [taklif, setTaklif] = useState<QadamTaklifi | null>(null);
  const iz = useRef(new FaoliyatIzi());
  const oxirgiSorov = useRef(0);
  const band = useRef(false);
  const yol = useRef(pathname);
  yol.current = pathname;

  const almashtir = useCallback((v: boolean) => {
    yoz(KALIT_YOQ, v ? '1' : '0');
    if (!v) { iz.current.tozala(); setTaklif(null); }
    setYoqilgan(v);
  }, []);

  useEffect(() => { if (yoqilgan) iz.current.yoz('sahifa', yolNaqshi(pathname)); }, [pathname, yoqilgan]);

  useEffect(() => {
    if (!yoqilgan) return undefined;
    const bosish = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (el?.closest('button,[role="button"],a,[data-agent-action]')) iz.current.yoz('bosish', tugmaYorligi(el));
    };
    const hodisa = (e: Event) => {
      const d = (e as CustomEvent<{ tur?: 'xato' | 'saqlash' | 'qidiruv'; nom?: string }>).detail;
      if (d?.tur && d.nom) iz.current.yoz(d.tur, d.nom);
    };
    document.addEventListener('click', bosish, true);
    window.addEventListener(IZ_HODISA, hodisa);
    return () => { document.removeEventListener('click', bosish, true); window.removeEventListener(IZ_HODISA, hodisa); };
  }, [yoqilgan]);

  useEffect(() => {
    if (!yoqilgan || !kompaniyaId) return undefined;
    const id = window.setInterval(() => {
      if (band.current || document.visibilityState !== 'visible') return;
      const hozir = Date.now();
      const rad = Number(oqi(KALIT_RAD) || 0);
      if (hozir - oxirgiSorov.current < sovushMs(rad)) return;
      if (!taklifSababi(iz.current.hodisalar, hozir)) return;
      band.current = true; oxirgiSorov.current = hozir;
      void qadamTaklifOl(kompaniyaId, yolNaqshi(yol.current), iz.current.yuklash())
        .then((r) => { if (r.ok && r.natija.taklif) setTaklif(r.natija); })
        .finally(() => { band.current = false; });
    }, TEKSHIRUV_MS);
    return () => window.clearInterval(id);
  }, [yoqilgan, kompaniyaId]);

  const rad = useCallback(() => { yoz(KALIT_RAD, String(Number(oqi(KALIT_RAD) || 0) + 1)); setTaklif(null); }, []);
  const qabul = useCallback(() => { yoz(KALIT_RAD, '0'); setTaklif(null); }, []);

  return { yoqilgan, almashtir, taklif, rad, qabul };
}
