/**
 * useSaqlanmagan — «saqlanmagan o'zgarish» uchun YAGONA hook (SaqlashPaneli shuni ishlatadi).
 *
 * Nima qiladi:
 *  1) saqlash holati: bosh → saqlanmoqda → saqlandi | xato (qayta bosish to'silgan, takror chaqiruv yo'q);
 *  2) Ctrl+S / Cmd+S → saqlash (preventDefault; Esc hech narsani bekor QILMAYDI);
 *  3) sahifani yopish/yangilash: `beforeunload` (_shared/versiya `saqlanmaganIsh` orqali — yangi versiya bannerida ham hisobga olinadi);
 *  4) ilova ichida boshqa sahifaga o'tish (havola bosish): tasdiq dialogi. Ilova `BrowserRouter` (data router emas), shuning uchun
 *     react-router `useBlocker` ishlamaydi — havola bosishlari document'da ushlanadi. Brauzer «orqaga» tugmasi bu yerda ushlanmaydi
 *     (u uchun Fakt/Ish varag'ida qoralama saqlanadi).
 */
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { UNSAFE_NavigationContext } from 'react-router-dom';
import { t } from '../../i18n/til';
import { useHotkeys } from '../../lib/hotkeys/useHotkeys';
import { saqlanmaganIsh } from '../../_shared/versiya';
import { tasdiqSora } from './tasdiq-yadro';

export type SaqlashHolati = 'bosh' | 'saqlanmoqda' | 'saqlandi' | 'xato';
/** `false` qaytarsa — saqlanmadi (sababini chaqiruvchi o'zi ko'rsatgan, masalan toast); istisno — xato matni panelda chiqadi. */
export type SaqlashFn = () => Promise<unknown> | unknown;

type Navigator = { push: (to: string) => void };
const faol = new Map<string, { soni: number; nav: Navigator | null }>();
let ulangan = false;

function havolaUshla(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
  let url: URL;
  try { url = new URL(a.href, window.location.href); } catch { return; }
  if (url.origin !== window.location.origin) return;
  if (url.pathname === window.location.pathname && url.search === window.location.search) return; // shu sahifa (#hash ham)
  const nav = [...faol.values()].map((v) => v.nav).find(Boolean);
  if (!nav) return;
  e.preventDefault(); e.stopPropagation();
  const manzil = url.pathname + url.search + url.hash;
  void tasdiqSora({
    sarlavha: t('Saqlanmagan o‘zgarishlar bor'),
    matn: t('Bu sahifada saqlanmagan o‘zgarishlar bor. Chiqsangiz, ular yo‘qoladi.'),
    tasdiqMatni: t('Saqlamasdan chiqish'), bekorMatni: t('Qolish'), xavfli: true,
  }).then((ha) => { if (ha) nav.push(manzil); });
}
function ulashniYangila() {
  const kerak = [...faol.values()].some((v) => v.soni > 0);
  if (kerak && !ulangan) { document.addEventListener('click', havolaUshla, true); ulangan = true; }
  if (!kerak && ulangan) { document.removeEventListener('click', havolaUshla, true); ulangan = false; }
}

export function useSaqlanmagan(o: {
  /** Sahifadagi shu shakl uchun barqaror belgi (masalan 'fakt-jurnal'). */
  kalit: string;
  /** Saqlanmagan o'zgarishlar soni (0 = toza). */
  soni: number;
  saqla: SaqlashFn;
  /** Ctrl+S / Cmd+S ni shu hook ushlaydi (sahifa o'zi ushlasa — false). */
  klaviatura?: boolean;
  /** Ish brauzer qoralamasida ham turibdi (yangi versiya bannerida shuni aytadi). */
  qoralama?: boolean;
  /** Tashqi «band» (sahifa o'z saqlash holatini yuritsa). */
  band?: boolean;
  /** Saqlash mumkin emas (masalan xatoli qator bor). */
  taqiq?: boolean;
}) {
  const { kalit, soni, klaviatura = true, qoralama } = o;
  const [holat, setHolat] = useState<SaqlashHolati>('bosh');
  const [xato, setXato] = useState<string | null>(null);
  const ishda = useRef(false);
  const tirik = useRef(true);
  const taymer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saqlaRef = useRef(o.saqla); saqlaRef.current = o.saqla;
  const taqiqRef = useRef(o.taqiq); taqiqRef.current = o.taqiq;
  const nav = (useContext(UNSAFE_NavigationContext) as { navigator?: Navigator } | null)?.navigator ?? null;

  useEffect(() => { tirik.current = true; return () => { tirik.current = false; if (taymer.current) clearTimeout(taymer.current); }; }, []);

  // beforeunload + yangi versiya bannerida hisobga olish
  useEffect(() => {
    saqlanmaganIsh(kalit, soni > 0, { qoralama });
    return () => saqlanmaganIsh(kalit, false);
  }, [kalit, soni, qoralama]);

  // ilova ichidagi havolalar qo'riqchisi
  useEffect(() => {
    faol.set(kalit, { soni, nav });
    ulashniYangila();
    return () => { faol.delete(kalit); ulashniYangila(); };
  }, [kalit, soni, nav]);

  const saqlaBajar = useCallback(async () => {
    if (ishda.current || taqiqRef.current) return;
    ishda.current = true;
    if (taymer.current) clearTimeout(taymer.current);
    setHolat('saqlanmoqda'); setXato(null);
    try {
      const r = await saqlaRef.current();
      if (!tirik.current) return;
      if (r === false) { setHolat('bosh'); return; }
      setHolat('saqlandi');
      taymer.current = setTimeout(() => { if (tirik.current) setHolat('bosh'); }, 2500);
    } catch (e) {
      if (!tirik.current) return;
      setHolat('xato'); setXato(e instanceof Error && e.message ? e.message : t('Saqlab bo‘lmadi'));
    } finally { ishda.current = false; }
  }, []);

  useHotkeys(`saqlash:${kalit}`, t('Saqlash'), [
    { id: `saqlash.${kalit}`, keys: 'ctrl+s' /* Cmd = Ctrl (lib/hotkeys/core) */, nom: t('Saqlash'), inInput: true, enabled: () => soni > 0, run: () => { void saqlaBajar(); } },
  ], klaviatura);

  return { holat: o.band ? 'saqlanmoqda' as SaqlashHolati : holat, band: !!o.band || holat === 'saqlanmoqda', xato, saqlaBajar };
}
