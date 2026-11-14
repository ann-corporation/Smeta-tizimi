import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { ModalOyna } from '../pto-workspace/ModalOyna';
import { t } from '../../i18n/til';
import { kursKontekstOrnat } from '../../lib/kurs/kontekst-store';
import { kursYoli, sahifaDarslari } from '../../lib/kurs/yol';
import { useKursKontekst, useProgress, yurishAmal } from './store';

/**
 * Har sahifadagi «Darslar» tugmasi: shu sahifa uchun SHU ROL darslari ro‘yxati (bo‘lmasa tugma chiqmaydi).
 * Shuningdek Jarvis repetitori uchun joriy kurs kontekstini o‘rnatadi.
 */
export function KursYordam() {
  const { kontekst, foyd } = useKursKontekst();
  const joy = useLocation();
  const bajarilgan = useProgress(foyd);
  const [ochiq, setOchiq] = useState(false);
  const yol = useMemo(() => kursYoli(kontekst), [kontekst]);
  const darslar = useMemo(() => sahifaDarslari(yol, joy.pathname), [yol, joy.pathname]);

  useEffect(() => { kursKontekstOrnat(kontekst.rol ? kontekst : null); return () => kursKontekstOrnat(null); }, [kontekst]);
  useEffect(() => { setOchiq(false); }, [joy.pathname]);

  if (!darslar.length) return null;
  return (
    <>
      <button type="button" data-kurs="yordam" data-testid="kurs-yordam-tugma" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm"
        aria-label={t('Shu sahifa uchun darslar')} title={t('Shu sahifa uchun darslar')} onClick={() => setOchiq(true)}>
        <GraduationCap aria-hidden="true" />
      </button>
      {ochiq && (
        <ModalOyna sarlavha={t('Shu sahifa uchun darslar')} kenglik={460} yop={() => setOchiq(false)} ikon={<GraduationCap className="text-accent" size={18} aria-hidden="true" />}>
          <ul className="flex flex-col gap-2" style={{ listStyle: 'none', padding: 0, margin: 0 }} data-testid="kurs-yordam-royxat">
            {darslar.map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border p-2">
                <span className="flex-1 text-[13px] text-text">{t(d.nom)}<span className="block text-[11px] text-text-dim">{d.daqiqa} {t('daqiqa')}{bajarilgan.has(d.id) ? ` · ${t('O‘tilgan')}` : ''}</span></span>
                <button type="button" className="fz-btn fz-btn--primary fz-btn--sm" onClick={() => { setOchiq(false); yurishAmal(foyd, { tur: 'boshla', dars: d.id }); }}>{t('Ko‘rsat')}</button>
              </li>
            ))}
          </ul>
          <div className="mt-3 text-right"><Link to="/admin/kurs" className="text-[12px] text-accent" onClick={() => setOchiq(false)}>{t('Butun kursim')}</Link></div>
        </ModalOyna>
      )}
    </>
  );
}
