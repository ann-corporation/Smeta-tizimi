import { useCallback, useEffect, useState } from 'react';
import { useKompaniya } from '../kontekst/KompaniyaKontekst';
import { jurnalOl, type JurnalYozuvi } from '../../api/t2-agent-ish';
import { t } from '../../i18n/til';
import { AiQadamlar } from './AiQadamlar';
import { HARAKAT_NOMI } from './ai-harakat';
import { harakatMuhr, tokenMatn } from '../../lib/ai-korinish';

const TUR: Record<string, string> = { savol: 'Savol', rad: 'Doiradan tashqari (rad)', salom: 'Salomlashuv', xato: 'Xato' };
const HOLAT: Record<string, string> = { kutilmoqda: 'Tasdiq kutmoqda', tasdiqlandi: 'Tasdiqlandi', rad: 'Rad etildi', bajarildi: 'Bajarildi', xato: 'Xato' };

/** AI faoliyat jurnali: har savol, har qadam, har taklif qilingan harakat va uning taqdiri. Admin butun kompaniya jurnalini ko'radi. */
export function AiJurnal({ kompaniyaId, admin }: { kompaniyaId: number; admin: boolean }) {
  /* Egasi 2026-10-27: AI model/provayder nomi — tizimga oid, faqat platforma superadmini (server ham yashiradi). */
  const { superadmin } = useKompaniya();
  const [royxat, setRoyxat] = useState<JurnalYozuvi[] | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [hamma, setHamma] = useState(false);
  const yukla = useCallback(async () => {
    const r = await jurnalOl(kompaniyaId, hamma);
    if (r.ok) { setRoyxat(r.natija.natija); setXato(null); } else { setRoyxat(null); setXato(r.error); }
  }, [kompaniyaId, hamma]);
  useEffect(() => { void yukla(); }, [yukla]);

  return (
    <div className="flex-1 space-y-2 overflow-y-auto p-4 text-sm">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-xs text-text-dim">{t('AI nima qilganining to‘liq tarixi: savollar, har qadam va taklif qilingan harakatlar.')}</p>
        {admin && <label className="flex items-center gap-1 text-xs text-text-dim"><input type="checkbox" checked={hamma} onChange={(e) => setHamma(e.target.checked)} />{t('Butun kompaniya')}</label>}
      </div>
      {xato && <p role="alert" className="text-xs text-danger">{xato}</p>}
      {royxat && royxat.length === 0 && <p className="text-xs text-text-mute">{t('Hali yozuv yo‘q.')}</p>}
      {royxat?.map((j) => (
        <article key={j.id} className="fz-panel gap-1.5 p-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-mute">
            <span className={`fz-stamp ${j.rad ? 'fz-stamp--warn' : j.tur === 'xato' ? 'fz-stamp--danger' : 'fz-stamp--info'}`}>{t(TUR[j.tur] ?? j.tur)}</span>
            <span>{new Date(j.vaqt).toLocaleString('ru-RU')}</span>
            {j.kim && <span>· {j.kim}</span>}
            <span className="ml-auto tabular-nums">{j.model && j.model !== 'local' ? `${superadmin ? `${j.model} · ` : ''}${j.kirish_token + j.chiqish_token} ${t('token')}` : t('token sarflanmadi')}</span>
          </div>
          {j.model && j.model !== 'local' && (() => { const kir = tokenMatn(j.kirish_token), chiq = tokenMatn(j.chiqish_token); return (
            <div className="flex flex-wrap gap-1.5 text-[11px]" data-testid="ai-token-sarf">
              <span className="fz-chip" title={t('Modelga yuborilgan matn (savol, kontekst, qoidalar)')}>{t('Kirdi')}: {t(kir.kalit, { n: kir.n })}</span>
              <span className="fz-chip" title={t('Model yozgan javob')}>{t('Chiqdi')}: {t(chiq.kalit, { n: chiq.n })}</span>
            </div>); })()}
          {j.savol && <p className="mt-1 text-text">{j.savol}</p>}
          {j.javob && <p className="mt-1 line-clamp-3 text-xs text-text-dim">{j.javob}</p>}
          {j.harakatlar.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-xs">
              {j.harakatlar.map((h) => <li key={h.id} className="flex flex-wrap items-center gap-1.5 text-text-dim">{t(HARAKAT_NOMI[h.amal] ?? h.amal)} <span className={`fz-stamp ${harakatMuhr(h.holat).cls}`}>{t(HOLAT[h.holat] ?? h.holat)}</span></li>)}
            </ul>
          )}
          <AiQadamlar qadamlar={j.qadamlar} />
        </article>
      ))}
    </div>
  );
}
