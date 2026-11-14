import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { t } from '../../i18n/til';
import { korilganOl, korilganYoz, korilmaganlar, yangiliklarOl, type Yangilik } from '../../_shared/versiya';

/**
 * «Tizimda nima yangi» — sarlavhadagi kichik belgi + ochiladigan ro'yxat (navigatsiya oqimi, 2026-11-11).
 * Avval pastki-chapdagi suzuvchi oyna jadval va «Saqlash» tugmasini yopardi. Endi kontentni yopmaydi: ko'rilmagan
 * yozuv bo'lsagina «Yangi» belgisi ko'rinadi; «Tushunarli» bosilganda shu yozuvgacha ko'rilgan hisoblanadi (har yangi yozuvda bir marta).
 */
export function NimaYangiBelgi() {
  const [yangi, setYangi] = useState<Yangilik[]>([]);
  const [eng, setEng] = useState(0);
  const [ochiq, setOchiq] = useState(false);
  useEffect(() => {
    let tirik = true;
    void yangiliklarOl().then((r) => {
      if (!tirik || !r.length) return;
      const korilgan = korilganOl();
      if (korilgan == null) { korilganYoz(r[0].id); return; } // birinchi kirish — eski tarixni ko'rsatmaymiz
      setEng(r[0].id);
      setYangi(korilmaganlar(r, korilgan));
    });
    return () => { tirik = false; };
  }, []);
  if (!yangi.length) return null;
  const yop = () => { korilganYoz(eng); setYangi([]); setOchiq(false); };
  return (
    <div className="relative" data-testid="nima-yangi-belgi">
      <button type="button" aria-expanded={ochiq} onClick={() => setOchiq((v) => !v)}
        className="inline-flex h-8 items-center gap-1 rounded-md border border-accent/40 px-2 text-[11px] font-semibold text-accent">
        <Sparkles size={13} aria-hidden="true" /> {t('Yangi')} · {yangi.length}
      </button>
      {ochiq && (
        <div role="dialog" aria-label={t('Tizimda nima yangi')} className="absolute right-0 top-9 z-40 max-h-[60vh] w-[min(420px,calc(100vw-2rem))] overflow-auto rounded-lg border border-border bg-surface p-3 text-[12px] shadow-lg">
          {yangi.map((y) => (
            <div key={y.id} className="mb-2">
              <div className="font-semibold">{y.sana ? `${y.sana} — ` : ''}{y.sarlavha}</div>
              {y.bandlar.map((b, i) => <div key={i} className="ml-2 mt-0.5 text-text-dim">• {b}</div>)}
            </div>
          ))}
          <button type="button" className="fz-btn fz-btn--primary fz-btn--sm" onClick={yop}>{t('Tushunarli')}</button>
        </div>
      )}
    </div>
  );
}