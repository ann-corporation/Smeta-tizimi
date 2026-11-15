/**
 * QulfProvider -- tizim darajasidagi ilova qulfi (bo'sh turish / yashirin varaq) + step-up tasdiq oynasi (STEP_UP_KERAK).
 * Sayt va Windows ilova (Tauri) uchun bir xil. Yoqilgan bo'lsa (PIN yoki biometrik sozlangan) -- N daqiqa harakatsiz qolsa to'liq ekran qulf.
 * Qulf holati localStorage'da saqlanadi: sahifani yangilash/yopib-ochish qulfni olib tashlamaydi.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { qulfSoz, tauriMi, type QulfHolatJavob } from './api';
import { interseptorOrnat } from './interseptor';
import { BOSH_STANDART_DAQ, keyingiTekshiruvMs, qulfKerakmi } from './mantiq';
import { QulfOyna } from './QulfOyna';
import { tizimdanChiq } from '../umumiy/kontekst/chiqish';

const LS_OXIRGI = 'qulf.oxirgi';
const LS_QULF = 'qulf.qulf';
const LS_DAQ = 'qulf.daq';
const LS_YOQ = 'qulf.yoqilgan';
const FAOLLIK_YOZISH_MS = 5000;

const lsOl = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsYoz = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* xotira yopiq */ } };

type Ctx = { holat: QulfHolatJavob | null; yangila(): Promise<void>; qulfla(): void };
const QulfKontekst = createContext<Ctx>({ holat: null, yangila: async () => {}, qulfla: () => {} });
export const useQulf = () => useContext(QulfKontekst);

export function QulfProvider({ children }: { children: ReactNode }) {
  const [holat, setHolat] = useState<QulfHolatJavob | null>(null);
  const [qulflangan, setQulflangan] = useState<boolean>(() => lsOl(LS_QULF) === '1');
  const [tasdiq, setTasdiq] = useState<{ usullar: string[] } | null>(null);
  const kutish = useRef<((ok: boolean) => void)[]>([]);
  const oxirgiFaol = useRef<number>(Number(lsOl(LS_OXIRGI)) || Date.now());
  const yashirinBoshi = useRef<number | null>(null);
  const yozilgan = useRef(0);

  const kalitlar = holat?.kalitlar ?? [];
  const webauthnBor = !tauriMi() && kalitlar.some((k) => k.tur === 'webauthn');
  /* Holat yuklanguncha oxirgi ma'lum qiymatdan (localStorage) foydalanamiz: sahifa yangilanganda kontent bir lahza ham ochilib qolmasin. */
  const yoqilgan = holat ? (holat.ok && (!!holat.pin_bor || kalitlar.length > 0)) : lsOl(LS_YOQ) === '1';
  const daq = holat?.bosh_vaqt_daq ?? (Number(lsOl(LS_DAQ)) || BOSH_STANDART_DAQ);

  const yangila = useCallback(async () => {
    const r = await qulfSoz<QulfHolatJavob>('holat');
    if (r.status === 401 || r.status === 501) { setHolat(null); lsYoz(LS_YOQ, null); return; }
    if (!r.ok) return; // vaqtincha xato: oldingi holat saqlanadi
    setHolat(r);
    lsYoz(LS_DAQ, String(r.bosh_vaqt_daq ?? BOSH_STANDART_DAQ));
    lsYoz(LS_YOQ, r.pin_bor || (r.kalitlar?.length ?? 0) > 0 ? '1' : null);
  }, []);

  const qulfla = useCallback(() => { lsYoz(LS_QULF, '1'); setQulflangan(true); }, []);
  const ochish = useCallback(() => {
    oxirgiFaol.current = Date.now(); yashirinBoshi.current = null;
    lsYoz(LS_OXIRGI, String(oxirgiFaol.current)); lsYoz(LS_QULF, null);
    setQulflangan(false);
    const k = kutish.current; kutish.current = []; setTasdiq(null);
    k.forEach((f) => f(true)); // ochilish PIN/biometrik tasdiqi serverda ham tasdiq tokenini bergan
  }, []);

  // Boshlang'ich holat + sessiya o'zgarishi (kirish) + fokus
  useEffect(() => {
    void yangila();
    const f = () => { if (document.visibilityState === 'visible') void yangila(); };
    window.addEventListener('focus', f);
    window.addEventListener('qulf:yangila', f);
    return () => { window.removeEventListener('focus', f); window.removeEventListener('qulf:yangila', f); };
  }, [yangila]);

  // Step-up interseptori
  useEffect(() => {
    function sora(usullar: string[]) {
      return new Promise((resolve: (value: boolean) => void) => { kutish.current.push(resolve); setTasdiq({ usullar }); });
    }
    return interseptorOrnat(sora);
  }, []);

  // Faollik kuzatuvi
  useEffect(() => {
    const faol = () => {
      const n = Date.now(); oxirgiFaol.current = n;
      if (n - yozilgan.current > FAOLLIK_YOZISH_MS) { yozilgan.current = n; lsYoz(LS_OXIRGI, String(n)); }
    };
    const hodisalar: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'pointermove'];
    hodisalar.forEach((h) => window.addEventListener(h, faol, { passive: true }));
    return () => hodisalar.forEach((h) => window.removeEventListener(h, faol));
  }, []);

  // Qulflash qarori: taymer + varaq ko'rinishi + ochilishdagi tekshiruv
  useEffect(() => {
    if (!yoqilgan) return;
    const tekshir = () => {
      if (qulfKerakmi({ yoqilgan, oxirgiFaol: oxirgiFaol.current, yashirinBoshi: yashirinBoshi.current, hozir: Date.now(), daqiqa: daq })) qulfla();
    };
    const korinish = () => {
      if (document.visibilityState === 'hidden') yashirinBoshi.current = Date.now();
      else { tekshir(); yashirinBoshi.current = null; }
    };
    document.addEventListener('visibilitychange', korinish);
    tekshir();
    const iv = window.setInterval(tekshir, Math.min(15_000, keyingiTekshiruvMs(oxirgiFaol.current, Date.now(), daq)));
    return () => { document.removeEventListener('visibilitychange', korinish); window.clearInterval(iv); };
  }, [yoqilgan, daq, qulfla]);

  // Qulf paytida kontent yashiriladi: ildiz inert (klaviatura/ekran o'quvchi ham yetmaydi)
  useEffect(() => {
    const root = document.getElementById('root'); if (!root) return;
    if (qulflangan && yoqilgan) { root.setAttribute('inert', ''); root.style.visibility = 'hidden'; }
    else { root.removeAttribute('inert'); root.style.visibility = ''; }
    return () => { root.removeAttribute('inert'); root.style.visibility = ''; };
  }, [qulflangan, yoqilgan]);

  // Qulf bayrog'i bor, lekin PIN endi yo'q (o'chirilgan): qulfni olib tashlaymiz
  useEffect(() => { if (holat && !yoqilgan && qulflangan) ochish(); }, [holat, yoqilgan, qulflangan, ochish]);

  const bekor = useCallback(() => { const k = kutish.current; kutish.current = []; setTasdiq(null); k.forEach((f) => f(false)); }, []);
  const qiymat = useMemo(() => ({ holat, yangila, qulfla }), [holat, yangila, qulfla]);

  return (
    <QulfKontekst.Provider value={qiymat}>
      {children}
      {yoqilgan && qulflangan && (
        <QulfOyna rejim="qulf" pinBor={holat ? !!holat.pin_bor : true} biometrik={webauthnBor} onOchildi={ochish} onChiqish={() => { void tizimdanChiq(); }} />
      )}
      {tasdiq && !qulflangan && (
        <QulfOyna rejim="tasdiq" pinBor={tasdiq.usullar.includes('pin')} biometrik={webauthnBor} usullar={tasdiq.usullar} onOchildi={ochish} onBekor={bekor} />
      )}
    </QulfKontekst.Provider>
  );
}
