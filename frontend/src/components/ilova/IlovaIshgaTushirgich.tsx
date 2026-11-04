/**
 * Ilova ishga tushirgich («Google Workspace» uslubi, ekotizim P1): yuqori paneldagi tugma — kompaniya yoqqan va foydalanuvchiga
 * ko'rinadigan ilovalar to'ri. Ilova tanlansa — uning birinchi sahifasi ochiladi va yon menyuda faqat shu ilova ko'rinadi.
 * Ro'yxat sof funksiyadan (navFiltr.ilovalarRoyxati): o'chirilgan ilova yoki ruxsatsiz ilova bu yerda ham yo'q.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Building2, Calculator, ClipboardList, FileOutput, FileStack, LayoutGrid, Truck, Users, Box } from 'lucide-react';
import { t } from '../../i18n/til';
import type { IlovaKod } from '../../lib/ilova/ilovalar';
import type { IlovaKarta } from '../../lib/nav/navFiltr';

const IKONKA: Partial<Record<IlovaKod, typeof Box>> = {
  pto: Calculator, ff: FileOutput, moliya: Briefcase, sotuv: Building2, xarid: ClipboardList, hr: Users, logistika: Truck, hujjat: FileStack,
};

export function IlovaIshgaTushirgich({ ilovalar, joriy, onTanla }: { ilovalar: readonly IlovaKarta[]; joriy: IlovaKod | null; onTanla?: (kod: IlovaKod) => void }) {
  const [ochiq, setOchiq] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    if (!ochiq) return;
    const tashqari = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOchiq(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOchiq(false); };
    document.addEventListener('mousedown', tashqari);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', tashqari); document.removeEventListener('keydown', esc); };
  }, [ochiq]);

  if (!ilovalar.length) return null;
  return (
    <div ref={ref} className="relative">
      <button type="button" className="os-menu-button" aria-label={t('Ilovalar')} aria-haspopup="dialog" aria-expanded={ochiq} onClick={() => setOchiq((v) => !v)}>
        <LayoutGrid size={17} />
      </button>
      {ochiq && (
        <div role="dialog" aria-label={t('Ilovalar')} className="fz-card absolute left-0 top-full z-50 mt-2 w-[min(92vw,22rem)] p-3 shadow-lg">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-mute">{t('Ilovalar')}</p>
          <ul className="grid grid-cols-3 gap-2">
            {ilovalar.map((i) => {
              const Ikonka = IKONKA[i.kod] ?? Box;
              const faol = joriy === i.kod;
              return (
                <li key={i.kod}>
                  <button
                    type="button"
                    title={t(i.izoh)}
                    aria-current={faol ? 'true' : undefined}
                    className={`flex w-full flex-col items-center gap-1 rounded-lg border px-2 py-2 text-center text-[11.5px] leading-tight ${faol ? 'border-accent bg-accent/10 text-text' : 'border-border/60 text-text-dim hover:border-accent/50 hover:text-text'}`}
                    onClick={() => { setOchiq(false); onTanla?.(i.kod); nav(i.yol); }}
                  >
                    <Ikonka size={20} strokeWidth={1.75} aria-hidden="true" />
                    <span>{t(i.nom)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
