import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowRight, BookOpen, Briefcase, Building2, ClipboardList, FileSpreadsheet, FileText, HelpCircle, History, Layers, Palette, Percent, Settings, Sparkles,
} from 'lucide-react';
import { ModalOyna } from '../pto-workspace/ModalOyna';
import { t } from '../../i18n/til';
import { kartaTop, keyingiYol, urlObyekti, type QollanmaIkon, type QollanmaKarta as Karta } from '../../lib/qollanma/reestr';
import { avtoKorsatilsinmi, avtoOchir, foydalanuvchiKaliti, keyinroqDeb, korildiDeb } from '../../lib/qollanma/korilgan';

const IKON: Record<QollanmaIkon, typeof Building2> = {
  obyekt: Building2, smeta: FileSpreadsheet, studio: Sparkles, podval: Percent, fakt: ClipboardList, f2: FileText,
  tarix: History, reestr: Layers, portfel: Briefcase, nakopitelniy: BookOpen, dizayn: Palette, sozlama: Settings,
};

/** «Bu sahifa nima beradi» oynasi: foyda (1 qator) + 3 qadam + ixtiyoriy keyingi qadam. Fokus tuzog'i va Esc — ModalOyna da. */
export function QollanmaOyna({ karta, obyektId, tushunarli, keyinroq, korsatmang }: {
  karta: Karta; obyektId: number | null;
  tushunarli: () => void; keyinroq: () => void; korsatmang?: () => void;
}) {
  const Ikon = karta.ikon ? IKON[karta.ikon] : HelpCircle;
  return (
    <ModalOyna sarlavha={karta.sarlavha} kenglik={480} yop={keyinroq} ikon={<Ikon className="text-accent" size={18} aria-hidden="true" />}>
      <div data-testid="qollanma-karta" data-kalit={karta.kalit} className="flex flex-col gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-mute">{t('Bu sahifa nima beradi')}</p>
          <p className="mt-1 text-[14px] font-medium leading-snug text-text">{t(karta.nimaBeradi)}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-mute">{t('Qanday ishlatiladi')}</p>
          <ol className="mt-2 flex flex-col gap-2" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {karta.qadamlar.map((q, i) => (
              <li key={q} className="flex items-start gap-2.5 text-[13px] text-text-dim">
                <span className="fz-chip fz-chip--accent" style={{ minWidth: 20, justifyContent: 'center' }}>{i + 1}</span>
                <span>{t(q)}</span>
              </li>
            ))}
          </ol>
        </div>
        {karta.keyingi && (
          <Link to={keyingiYol(karta.keyingi.yol, obyektId)} onClick={tushunarli} className="fz-note items-center no-underline" data-testid="qollanma-keyingi">
            <ArrowRight size={14} aria-hidden="true" />
            <span><b>{t('Keyingi qadam')}:</b> {t(karta.keyingi.matn)}</span>
          </Link>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          {korsatmang && <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm mr-auto" onClick={korsatmang}>{t('Ko‘rsatmang')}</button>}
          <button type="button" className="fz-btn" onClick={keyinroq}>{t('Keyinroq')}</button>
          <button type="button" className="fz-btn fz-btn--primary" onClick={tushunarli} autoFocus>{t('Tushunarli')}</button>
        </div>
      </div>
    </ModalOyna>
  );
}

/**
 * AdminShell sarlavhasidagi «?» tugmasi + birinchi tashrifda avtomatik karta. Kartasi yo'q sahifada hech narsa chiqmaydi.
 * `foydalanuvchi` — sessiya emaili (har foydalanuvchiga alohida «ko'rildi» belgisi); hali noma'lum bo'lsa avtomatik karta kutadi.
 */
export function QollanmaBoshqaruv({ foydalanuvchi }: { foydalanuvchi: string | null | undefined }) {
  const joy = useLocation();
  const karta = kartaTop(joy.pathname, joy.search);
  const obyektId = urlObyekti(joy.pathname, joy.search);
  const foyd = foydalanuvchiKaliti(foydalanuvchi);
  const [ochiq, setOchiq] = useState<{ kalit: string; avto: boolean } | null>(null);
  const oxirgi = useRef<string | null>(null);

  useEffect(() => {
    if (!karta) { setOchiq(null); oxirgi.current = null; return; }
    if (!foyd) return;                                   // sessiya hali kelmagan — kutamiz
    const belgi = foyd + '|' + karta.kalit;
    if (oxirgi.current === belgi) return;                // shu karta sahifasida qolyapmiz (boshqa obyekt) — qayta chiqmaydi
    oxirgi.current = belgi;
    setOchiq(avtoKorsatilsinmi(foyd, karta.kalit) ? { kalit: karta.kalit, avto: true } : null);
  }, [karta, foyd]);

  if (!karta) return null;
  const korinadi = ochiq?.kalit === karta.kalit;
  const yop = () => setOchiq(null);
  return (
    <>
      <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" data-testid="qollanma-tugma"
        aria-label={t('Bu sahifa nima beradi')} title={t('Bu sahifa nima beradi')} onClick={() => setOchiq({ kalit: karta.kalit, avto: false })}>
        <HelpCircle aria-hidden="true" />
      </button>
      {korinadi && (
        <QollanmaOyna karta={karta} obyektId={obyektId}
          tushunarli={() => { if (foyd) korildiDeb(foyd, karta.kalit); yop(); }}
          keyinroq={() => { if (foyd && ochiq?.avto) keyinroqDeb(foyd, karta.kalit); yop(); }}
          korsatmang={foyd && ochiq?.avto ? () => { avtoOchir(foyd, karta.kalit); yop(); } : undefined} />
      )}
    </>
  );
}
