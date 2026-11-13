import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { t } from '../../i18n/til';
import { darsOl } from '../../lib/kurs/darslar';
import { korsatkichElementi } from '../../lib/kurs/element';
import { sahifaYoli } from '../../lib/kurs/yol';
import { useKursKontekst, useYurish, yurishAmal } from './store';

type Ramka = { x: number; y: number; w: number; h: number };

/**
 * Jonli yo‘l-yo‘riq: haqiqiy ekranda bitta qadamni yoritadi. «Chiqish» — joyi eslab qolinadi (kurs sahifasida «Davom etish»).
 * Ma’lumot yozmaydi: faqat sahifani ochadi va elementni ko‘rsatadi.
 */
export function KursYurish() {
  const holat = useYurish();
  const { foyd } = useKursKontekst();
  const joy = useLocation();
  const navigate = useNavigate();
  const [ramka, setRamka] = useState<Ramka | null>(null);
  const dars = holat ? darsOl(holat.dars) : undefined;
  const qadam = dars && holat ? dars.qadamlar[holat.qadam] : undefined;
  const yol = qadam ? sahifaYoli(qadam.sahifa) : undefined;

  // Qadam almashganda tegishli sahifaga o‘tamiz (faqat shu paytda; foydalanuvchi keyin erkin yuradi).
  useEffect(() => {
    if (yol && window.location.pathname !== yol) navigate(yol + window.location.search);
  }, [dars?.id, holat?.qadam, yol]); // eslint-disable-line react-hooks/exhaustive-deps

  // Yoritish: element kech paydo bo‘lishi mumkin — qisqa interval bilan qayta qidiramiz.
  useEffect(() => {
    if (!qadam) { setRamka(null); return; }
    const yangila = () => {
      const el = korsatkichElementi(qadam.korsatkich);
      if (!el) { setRamka((r) => (r ? null : r)); return; }
      const r = el.getBoundingClientRect();
      setRamka((o) => (o && o.x === r.left && o.y === r.top && o.w === r.width && o.h === r.height ? o : { x: r.left, y: r.top, w: r.width, h: r.height }));
    };
    yangila();
    const id = window.setInterval(yangila, 400);
    const kor = korsatkichElementi(qadam.korsatkich);
    kor?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    return () => window.clearInterval(id);
  }, [qadam, joy.pathname]);

  if (!holat || !dars || !qadam) return null;
  const oxirgi = holat.qadam + 1 >= dars.qadamlar.length;
  return (
    <>
      {ramka && (
        <div aria-hidden="true" data-testid="kurs-ramka"
          style={{ position: 'fixed', left: ramka.x - 4, top: ramka.y - 4, width: ramka.w + 8, height: ramka.h + 8, border: '2px solid var(--accent, #4f8cff)', borderRadius: 8, boxShadow: '0 0 0 4px rgba(79,140,255,.25)', pointerEvents: 'none', zIndex: 9998 }} />
      )}
      <div role="dialog" aria-label={t(dars.nom)} data-testid="kurs-yurish"
        className="fixed left-3 right-3 bottom-3 z-[9999] mx-auto flex max-w-[460px] flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-surface p-3 shadow-lg">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-text-mute">
          <span className="flex-1 truncate">{t(dars.nom)}</span>
          <span data-testid="kurs-qadam">{holat.qadam + 1}/{dars.qadamlar.length}</span>
          <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" aria-label={t('Chiqish')} title={t('Chiqish (keyin davom etasiz)')}
            onClick={() => yurishAmal(foyd, { tur: 'chiqish' })}><X aria-hidden="true" /></button>
        </div>
        <p className="text-[14px] font-medium leading-snug text-text">{t(qadam.matn)}</p>
        {qadam.natija && <p className="text-[12px] text-text-dim">{t('Natija')}: {t(qadam.natija)}</p>}
        <div className="flex items-center gap-2">
          <button type="button" className="fz-btn fz-btn--sm" disabled={holat.qadam === 0} onClick={() => yurishAmal(foyd, { tur: 'oldingi' })}><ArrowLeft aria-hidden="true" size={14} />{t('Orqaga')}</button>
          <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => yurishAmal(foyd, { tur: 'otkaz' })}>{t('O‘tkazib yuborish')}</button>
          <button type="button" className="fz-btn fz-btn--primary fz-btn--sm ml-auto" data-testid="kurs-keyingi" autoFocus onClick={() => yurishAmal(foyd, { tur: 'keyingi' })}>
            {oxirgi ? t('Tugatish') : t('Keyingisi')}{!oxirgi && <ArrowRight aria-hidden="true" size={14} />}
          </button>
        </div>
      </div>
    </>
  );
}
