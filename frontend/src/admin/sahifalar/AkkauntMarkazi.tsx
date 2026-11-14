/**
 * AkkauntMarkazi — /admin/akkaunt: ekotizimning BIRINCHI qadami (akkaunt va tizim sozlamalari markazi).
 * Chap bo‘lim navigatsiyasi (mobilda gorizontal), bo‘lim `?bolim=` orqali tanlanadi (havola ulashish mumkin).
 */
import { useCallback, useRef, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Bell, Building2, CreditCard, KeyRound, LaptopMinimal, LayoutGrid, Palette, PenLine, ShieldCheck, UserRound } from 'lucide-react';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { t } from '../../i18n/til';
import {
  BildirishnomaBolimi, HubBolimi, KirishBolimi, KompaniyalarBolimi, KorinishBolimi, ProfilBolimi, TarifBolimi, XavfsizlikBolimi,
} from '../../components/akkaunt/Bolimlar';
import { DesktopBolimi } from '../../components/akkaunt/DesktopBolimi';
import { ImzoBolimi } from '../../components/imzo/KalitlarKarta';

const BOLIMLAR = [
  { id: 'kirish', nom: 'Kirish usullari', Ikon: KeyRound, Korinish: KirishBolimi },
  { id: 'profil', nom: 'Profil', Ikon: UserRound, Korinish: ProfilBolimi },
  { id: 'kompaniyalar', nom: 'Kompaniyalar va rollar', Ikon: Building2, Korinish: KompaniyalarBolimi },
  { id: 'xavfsizlik', nom: 'Xavfsizlik', Ikon: ShieldCheck, Korinish: XavfsizlikBolimi },
  { id: 'imzo', nom: 'Mening imzom', Ikon: PenLine, Korinish: ImzoBolimi },
  { id: 'bildirishnoma', nom: 'Bildirishnomalar', Ikon: Bell, Korinish: BildirishnomaBolimi },
  { id: 'desktop', nom: 'Windows dastur', Ikon: LaptopMinimal, Korinish: DesktopBolimi },
  { id: 'korinish', nom: 'Ko‘rinish', Ikon: Palette, Korinish: KorinishBolimi },
  { id: 'tarif', nom: 'Tarif va hisob', Ikon: CreditCard, Korinish: TarifBolimi },
  { id: 'hub', nom: 'Sozlamalar markazi', Ikon: LayoutGrid, Korinish: HubBolimi },
] as const;

export default function AkkauntMarkazi() {
  const [qp, setQp] = useSearchParams();
  const kamaytir = useReducedMotion();
  const navRef = useRef<HTMLDivElement>(null);
  const faol = BOLIMLAR.find((b) => b.id === qp.get('bolim')) ?? BOLIMLAR.find((b) => b.id === 'profil') ?? BOLIMLAR[0];
  const tanla = useCallback((id: string) => setQp({ bolim: id }, { replace: true }), [setQp]);

  const klavish = (e: KeyboardEvent) => {
    const i = BOLIMLAR.findIndex((b) => b.id === faol.id);
    let y = i;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') y = (i + 1) % BOLIMLAR.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') y = (i - 1 + BOLIMLAR.length) % BOLIMLAR.length;
    else if (e.key === 'Home') y = 0;
    else if (e.key === 'End') y = BOLIMLAR.length - 1;
    else return;
    e.preventDefault();
    tanla(BOLIMLAR[y].id);
    const hedef = BOLIMLAR[y].id;
    requestAnimationFrame(() => { const el = navRef.current?.querySelector(`[data-bolim="${hedef}"]`); if (el instanceof HTMLElement) el.focus(); });
  };

  const Korinish = faol.Korinish;
  return (
    <Sahifa sarlavha="Akkaunt markazi" tavsif="Akkaunt, kompaniyalar va rollar, xavfsizlik, ko‘rinish va tarif. Kompaniya va tizim sozlamalari — Sozlamalar markazida.">
      <div className="flex flex-col md:flex-row gap-4 items-start">
        <div ref={navRef} role="tablist" aria-orientation="vertical" aria-label={t('Akkaunt bo‘limlari')} onKeyDown={klavish}
          className="flex md:flex-col gap-1 w-full md:w-56 shrink-0 overflow-x-auto md:overflow-visible pb-1 md:pb-0 md:sticky md:top-0">
          {BOLIMLAR.map(({ id, nom, Ikon }) => {
            const a = id === faol.id;
            return (
              <button key={id} type="button" role="tab" id={`akkaunt-tab-${id}`} data-bolim={id} aria-selected={a} aria-controls="akkaunt-panel"
                tabIndex={a ? 0 : -1} onClick={() => tanla(id)}
                className="relative flex items-center gap-2 rounded-md px-3 text-[13px] whitespace-nowrap cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
                style={{ height: 'var(--control-lg)', color: a ? 'var(--text)' : 'var(--text-dim)', fontWeight: a ? 600 : 500 }}>
                {a && <motion.span layoutId="akkaunt-faol" transition={{ duration: kamaytir ? 0 : 0.18 }} className="absolute inset-0 rounded-md" style={{ background: 'var(--accent-soft)', border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)' }} />}
                <Ikon size={15} aria-hidden="true" className="relative" />
                <span className="relative">{t(nom)}</span>
              </button>
            );
          })}
        </div>
        <div id="akkaunt-panel" role="tabpanel" aria-labelledby={`akkaunt-tab-${faol.id}`} className="flex-1 min-w-0 w-full max-w-5xl">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={faol.id} initial={kamaytir ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={kamaytir ? { opacity: 0 } : { opacity: 0, y: -4 }} transition={{ duration: kamaytir ? 0 : 0.14 }}>
              <Korinish />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </Sahifa>
  );
}
