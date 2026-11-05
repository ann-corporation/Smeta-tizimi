import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Compass } from 'lucide-react';
import { t } from '../../i18n/til';
import { sbT2AktReestrOl } from '../../api/supabase';
import { t2ObyektNakrutka } from '../../api/t2-nakrutka';
import { aktlardanHolat, joriyOy, keyingiQadam, QADAMLAR, type ObyektHolati, type QadamTuri } from '../../lib/qollanma/keyingiQadam';

const QADAM_NOMI: Record<QadamTuri, string> = {
  smeta: 'Smeta', podval: 'Podval', fakt: 'Fakt', f2: 'F2', tasdiqlash: 'Tasdiqlash', portfel: 'Portfel',
};

const NOMALUM: ObyektHolati = { smetaBor: null, podvalBor: null, faktBor: null, f2JoriyOyBor: null, qoralamaSoni: null, tasdiqlanganSoni: null };

/**
 * «Keyingi qadam» murabbiyi: obyekt holatini mavjud o'qishlardan (akt reestri + obyekt nakrutka manbai) yig'ib,
 * `keyingiQadam()` tanlagan bitta ishni tugma bilan taklif qiladi. Yangi SQL yo'q; o'qib bo'lmasa — panel chiqmaydi.
 * `smetaBor` — sahifa allaqachon bilgan qiymat (null — hali yuklanmoqda).
 */
export function KeyingiQadamPanel({ obyektId, smetaBor, obyektNom }: { obyektId: number; smetaBor: boolean | null; obyektNom?: string | null }) {
  const [holat, setHolat] = useState<ObyektHolati>(NOMALUM);

  useEffect(() => {
    let faol = true;
    setHolat({ ...NOMALUM, smetaBor });
    if (smetaBor !== true) return () => { faol = false; };
    // async o'ram: o'qish sinxron xato bersa ham panel sahifani buzmaydi — shunchaki chiqmaydi.
    void Promise.allSettled([(async () => sbT2AktReestrOl(obyektId))(), (async () => t2ObyektNakrutka(obyektId))()]).then(([a, n]) => {
      if (!faol) return;
      const aktlar = a.status === 'fulfilled' && a.value.ok ? (a.value.qatorlar ?? []) : null;
      const manba = n.status === 'fulfilled' && n.value.ok ? n.value.nk_manba ?? null : null;
      setHolat({
        smetaBor,
        // Egasi qoidasi: nakrutka foizlari smeta podvalidan. Manba noma'lum (eski server/xato) — podval qadami o'tkaziladi.
        podvalBor: manba == null ? null : manba === 'smeta_podvali',
        ...(aktlar ? aktlardanHolat(aktlar, joriyOy()) : { faktBor: null, f2JoriyOyBor: null, qoralamaSoni: null, tasdiqlanganSoni: null }),
      });
    });
    return () => { faol = false; };
  }, [obyektId, smetaBor]);

  const q = keyingiQadam(holat, obyektId);
  if (!q) return null;
  const joriy = QADAMLAR.indexOf(q.tur);
  return (
    <section className="fz-card" aria-label={t('Keyingi qadam')} data-testid="keyingi-qadam">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Compass className="shrink-0 text-accent" size={18} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-mute">
            {t('Keyingi qadam')}{obyektNom ? ` · ${obyektNom}` : ''}
          </p>
          <p className="text-[13px] text-text-dim">{t(q.izoh)}</p>
          <ol className="mt-1.5 flex flex-wrap gap-1" style={{ listStyle: 'none', padding: 0, margin: 0 }} aria-label={t('Ish tartibi')}>
            {QADAMLAR.map((x, i) => (
              <li key={x} className={`fz-chip ${i === joriy ? 'fz-chip--accent' : ''}`} aria-current={i === joriy ? 'step' : undefined}
                style={i < joriy ? { opacity: 0.7 } : undefined}>
                {i < joriy && <Check size={11} aria-hidden="true" />}{t(QADAM_NOMI[x])}
              </li>
            ))}
          </ol>
        </div>
        <Link to={q.yol} className="fz-btn fz-btn--primary shrink-0" data-testid="keyingi-qadam-tugma">
          {t(q.matn, q.n != null ? { n: q.n } : undefined)}<ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
