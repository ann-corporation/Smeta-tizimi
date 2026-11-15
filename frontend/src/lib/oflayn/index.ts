/**
 * Oflayn rejimi (Onlayn qobiq: Windows/Android/iOS/macOS ilovalari jonli saytni yuklaydi).
 * `oflaynBoshlash()` FAQAT native ko'prik bor bo'lganda ishlaydi; oddiy brauzerda hech narsa o'rnatmaydi va
 * pul ma'lumoti hech qachon diskka yozilmaydi.
 */
import { koprigaUlan, type Kopri, type OflaynHolat } from './kopri';
import { oflaynFetch } from './fetch';
import { FaktNavbat } from './navbat';
import { bannerQoy } from './banner';
import { oflaynKorinish, oflaynYangila } from './holat';

export { oflaynKorinish, oflaynObuna } from './holat';
export { oflaynUchunTayyorla } from './tayyorla';

const QAYTA_TEKSHIRISH_MS = 5 * 60_000;
const NAVBAT_DAVR_MS = 30_000;

/** Servis-worker ilova qobig'ini oldindan keshlaganini kutadi; tayyor bo'lsa native belgi yoziladi (Windows/Android yuklagichi
 *  oflayn ochilganda shu belgiga qaraydi). Xato jim: oflayn qobiq bo'lmasa, yuklagich oddiy «Qayta urinish» kartasini ko'rsatadi. */
export async function qobiqniTayyorla(kopri: Kopri, sw: ServiceWorkerContainer | undefined = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined): Promise<boolean> {
  if (!sw) return false;
  try {
    const reg = await sw.ready;
    const target = reg.active;
    if (!target) return false;
    const javob = await new Promise<{ ok?: boolean; versiya?: string }>((ok, yoq) => {
      const ch = new MessageChannel();
      const taymer = setTimeout(() => yoq(new Error('SW_TIMEOUT')), 120_000);
      ch.port1.onmessage = (e) => { clearTimeout(taymer); ok(e.data as { ok?: boolean; versiya?: string }); };
      target.postMessage({ type: 'OFLAYN_PRECACHE' }, [ch.port2]);
    });
    if (!javob?.ok || !javob.versiya) return false;
    await kopri.qobiqTayyor(javob.versiya);
    return true;
  } catch { return false; }
}

export type OflaynBoshqaruv = { toxtat(): void; navbat: FaktNavbat; qayta(): Promise<OflaynHolat | null> };

export function oflaynBoshlash(w: Window = window): OflaynBoshqaruv | null {
  const kopri = koprigaUlan(w);
  if (!kopri) return null;
  const base = w.fetch.bind(w);
  let holat: Promise<OflaynHolat | null> = Promise.resolve(null);
  const navbat = new FaktNavbat({ kopri, base, onYuborildi: () => w.dispatchEvent(new Event('oflayn-sinxron')) });

  const qayta = (): Promise<OflaynHolat | null> => {
    holat = kopri.holat().then(
      (h) => { oflaynYangila({ tayyor: h.tayyor }); return h; },
      () => { oflaynYangila({ tayyor: false }); return null; },
    );
    return holat;
  };
  const onlaynBoldi = () => {
    void qayta().then(async (h) => {
      if (!h?.tayyor) return;
      await navbat.yangilaKorinish();
      if (oflaynKorinish().navbat > 0) await navbat.yubor().catch(() => undefined);
    });
  };

  w.fetch = oflaynFetch(base, { kopri, navbat, tayyor: () => holat, origin: w.location.origin });
  void qayta().then(async (h) => {
    if (!h?.tayyor) return;
    await navbat.yangilaKorinish();
    if (h.onlayn) {
      if (oflaynKorinish().navbat > 0) void navbat.yubor().catch(() => undefined);
      void qobiqniTayyorla(kopri);
    }
  });

  // Modul skripti hujjat tahlilidan keyin ishlaydi (body bor).
  const bannerOff = bannerQoy(w.document, navbat);
  w.addEventListener('online', onlaynBoldi);
  const t1 = w.setInterval(() => { if (w.navigator.onLine !== false) void qayta(); }, QAYTA_TEKSHIRISH_MS);
  const t2 = w.setInterval(() => {
    const k = oflaynKorinish();
    if (w.navigator.onLine !== false && k.navbat > 0 && !k.yuborilmoqda && k.toxtadi !== 'sessiya') void navbat.yubor().catch(() => undefined);
  }, NAVBAT_DAVR_MS);

  return {
    navbat,
    qayta,
    toxtat() {
      w.fetch = base;
      w.removeEventListener('online', onlaynBoldi);
      w.clearInterval(t1);
      w.clearInterval(t2);
      bannerOff();
    },
  };
}
