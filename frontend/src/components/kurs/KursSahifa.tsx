import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, GraduationCap, Play, Smartphone } from 'lucide-react';
import { t } from '../../i18n/til';
import { DARSLAR } from '../../lib/kurs/darslar';
import { GURUH_NOM, type Dars } from '../../lib/kurs/model';
import { joriyOl, darsBekor, darsBajarildi } from '../../lib/kurs/progress';
import { keyingiDars, kursYoli, qolganDaqiqa } from '../../lib/kurs/yol';
import { useKursKontekst, useProgress, yurishAmal, yurishDavom } from './store';

function DarsKarta({ d, bajarilgan, foyd, ochiq, ochish }: { d: Dars; bajarilgan: boolean; foyd: string | null; ochiq: boolean; ochish: () => void }) {
  return (
    <li data-testid={`kurs-dars-${d.id}`} className="rounded-[var(--radius-md)] border border-border bg-surface p-3">
      <div className="flex items-start gap-2">
        {bajarilgan ? <CheckCircle2 size={18} className="mt-0.5 text-ok" aria-label={t('O‘tilgan')} /> : <GraduationCap size={18} className="mt-0.5 text-text-mute" aria-hidden="true" />}
        <button type="button" className="flex-1 text-left" onClick={ochish} aria-expanded={ochiq}>
          <span className="block text-[14px] font-medium text-text">{t(d.nom)}</span>
          <span className="mt-0.5 flex items-center gap-2 text-[12px] text-text-dim">
            <Clock size={12} aria-hidden="true" />{d.daqiqa} {t('daqiqa')}{d.telefon && <><Smartphone size={12} aria-hidden="true" />{t('Telefonda')}</>}
          </span>
        </button>
        <button type="button" className="fz-btn fz-btn--primary fz-btn--sm" onClick={() => yurishAmal(foyd, { tur: 'boshla', dars: d.id })}><Play size={12} aria-hidden="true" />{bajarilgan ? t('Qayta') : t('Boshlash')}</button>
      </div>
      {ochiq && (
        <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3 text-[13px] text-text-dim">
          <p><b>{t('Maqsad')}:</b> {t(d.maqsad)}</p>
          <p><b>{t('Nega kerak')}:</b> {t(d.nega)}</p>
          <ol className="flex flex-col gap-1.5" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {d.qadamlar.map((s, i) => (<li key={i} className="flex items-start gap-2"><span className="fz-chip fz-chip--accent" style={{ minWidth: 20, justifyContent: 'center' }}>{i + 1}</span><span>{t(s.matn)}</span></li>))}
          </ol>
          {d.xatolar.length > 0 && (
            <div className="fz-note fz-note--warn"><div><b>{t('Odatiy xatolar')}:</b><ul className="mt-1 list-disc pl-4">{d.xatolar.map((x) => <li key={x}>{t(x)}</li>)}</ul></div></div>
          )}
          {d.mashq && <p className="fz-note fz-note--info">{t('Sinov obyektida mashq qiling — haqiqiy obyektda emas.')}</p>}
          <div className="flex gap-2">
            {!bajarilgan
              ? <button type="button" className="fz-btn fz-btn--sm" onClick={() => foyd && darsBajarildi(foyd, d.id)}>{t('Tugatdim')}</button>
              : <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => foyd && darsBekor(foyd, d.id)}>{t('Qayta o‘taman')}</button>}
          </div>
        </div>
      )}
    </li>
  );
}

/** «Kurs» bo‘limi: mening yo‘lim, progress, keyingi dars, jami daqiqa. Yo‘l rol va ruxsatdan hisoblanadi. */
export default function KursSahifa() {
  const { kontekst, foyd } = useKursKontekst();
  const bajarilgan = useProgress(foyd);
  const [qs, setQs] = useSearchParams();
  const [ochiq, setOchiq] = useState<string | null>(null);
  const yol = useMemo(() => kursYoli(kontekst, DARSLAR), [kontekst]);
  const keyingi = keyingiDars(yol, bajarilgan);
  const yarim = foyd ? joriyOl(foyd) : null;
  const yarimDars = yarim ? yol.darslar.find((d) => d.id === yarim.dars) : undefined;

  // Jarvis «Ko‘rsat» havolasi: ?boshla=<dars> — yo‘l-yo‘riq o‘zi boshlanadi (faqat foydalanuvchi yo‘lidagi dars).
  const boshla = qs.get('boshla');
  useEffect(() => {
    if (!boshla) return;
    if (yol.darslar.some((d) => d.id === boshla)) yurishAmal(foyd, { tur: 'boshla', dars: boshla });
    const n = new URLSearchParams(qs); n.delete('boshla'); setQs(n, { replace: true });
  }, [boshla]); // eslint-disable-line react-hooks/exhaustive-deps

  const guruhlar = useMemo(() => {
    const m = new Map<string, Dars[]>();
    for (const d of yol.darslar) m.set(d.guruh, [...(m.get(d.guruh) ?? []), d]);
    return [...m.entries()];
  }, [yol]);
  const soni = yol.darslar.length;
  const otilgan = yol.darslar.filter((d) => bajarilgan.has(d.id)).length;

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4 p-4" data-testid="kurs-sahifa">
      <header>
        <h1 className="text-[18px] font-semibold text-text">{t('Mening kursim')}</h1>
        <p className="mt-1 text-[13px] text-text-dim" data-testid="kurs-jami">
          {t('Darslar')}: {otilgan}/{soni} · {t('Qolgan vaqt')}: {qolganDaqiqa(yol, bajarilgan)} {t('daqiqa')}
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-surface-2" aria-hidden="true"><div className="h-full bg-accent" style={{ width: `${soni ? Math.round((otilgan / soni) * 100) : 0}%` }} /></div>
      </header>

      {soni === 0 && <p className="fz-note fz-note--info">{t('Sizning rolingiz uchun darslar hali yo‘q. Kompaniya tanlanganini tekshiring.')}</p>}

      {yarimDars && (
        <div className="fz-note fz-note--info items-center" data-testid="kurs-davom">
          <span className="flex-1">{t('Yarim qolgan dars')}: <b>{t(yarimDars.nom)}</b></span>
          <button type="button" className="fz-btn fz-btn--primary fz-btn--sm" onClick={() => yurishDavom(foyd)}>{t('Davom etish')}</button>
        </div>
      )}

      {keyingi && (
        <section aria-label={t('Keyingi dars')} data-testid="kurs-keyingi-dars">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-mute">{t('Keyingi dars')}</p>
          <ul className="flex flex-col gap-2" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            <DarsKarta d={keyingi} bajarilgan={false} foyd={foyd} ochiq={ochiq === keyingi.id} ochish={() => setOchiq(ochiq === keyingi.id ? null : keyingi.id)} />
          </ul>
        </section>
      )}

      {guruhlar.map(([g, royxat]) => (
        <section key={g} aria-label={t(GURUH_NOM[g as keyof typeof GURUH_NOM])}>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-mute">{t(GURUH_NOM[g as keyof typeof GURUH_NOM])}</p>
          <ul className="flex flex-col gap-2" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {royxat.map((d) => <DarsKarta key={d.id} d={d} bajarilgan={bajarilgan.has(d.id)} foyd={foyd} ochiq={ochiq === d.id} ochish={() => setOchiq(ochiq === d.id ? null : d.id)} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}
