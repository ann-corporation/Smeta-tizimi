/**
 * SorovlarRoyxati.tsx — sinov so'rovlari ro'yxati. yonalish='kelgan' — laboratoriya «Bugun» (kelgan so'rovlar); 'yuborilgan' — pudratchi (o'z so'rovlari, qayta sinov).
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from '../../umumiy/ui/Toast';
import { sorovlarOl, type SorovQisqa } from '../../api/t2-lab-sorov';
import { t } from '../../i18n/til';

const NATIJA_STAMP: Record<string, string> = { mos: 'fz-stamp--ok', mos_emas: 'fz-stamp--danger', kutilmoqda: 'fz-stamp--warn' };
const NATIJA_NOM: Record<string, string> = { mos: 'Mos', mos_emas: 'Mos emas', kutilmoqda: 'Kutilmoqda' };

export function SorovlarRoyxati({ kompaniyaId, yonalish, tanlangan, onTanla, yangilash = 0, obyektId, aosrId, faqatOchiq = false, onQayta }: {
  kompaniyaId: number; yonalish: 'kelgan' | 'yuborilgan'; tanlangan?: number | null; onTanla?: (id: number) => void; yangilash?: number;
  obyektId?: number | null; aosrId?: number | null; faqatOchiq?: boolean; onQayta?: (s: SorovQisqa) => void;
}) {
  const [royxat, setRoyxat] = useState<SorovQisqa[] | null>(null);
  const ol = useCallback(async () => {
    const r = await sorovlarOl(kompaniyaId, { yonalish, holat: faqatOchiq ? 'ochiq' : undefined, obyektId, aosrId });
    if (!r.ok) { toast(r.error, 'danger'); setRoyxat([]); return; }
    setRoyxat(r.natija);
  }, [kompaniyaId, yonalish, faqatOchiq, obyektId, aosrId]);
  useEffect(() => { void ol(); }, [ol, yangilash]);

  if (royxat == null) return <p className="text-xs text-text-dim">{t('Yuklanmoqda…')}</p>;
  if (royxat.length === 0) return <p className="text-sm text-text-dim">{yonalish === 'kelgan' ? t('Hozircha kelgan sinov so‘rovi yo‘q') : t('Sinov so‘rovi yuborilmagan')}</p>;
  return (
    <ul className="max-h-[60vh] space-y-1 overflow-auto" data-testid="sorovlar-royxati">
      {royxat.map((x) => (
        <li key={x.id}>
          <div className={`rounded border px-2 py-1.5 text-xs ${tanlangan === x.id ? 'border-accent bg-accent/5' : 'border-border'}`}>
            <button type="button" onClick={() => onTanla?.(x.id)} className="block w-full text-left">
              <div className="flex items-center justify-between gap-2"><b>{x.sinov_nom}{x.konstruksiya ? ` — ${x.konstruksiya}` : ''}</b>
                <span className={`fz-stamp ${NATIJA_STAMP[x.natija] ?? ''}`}>{t(NATIJA_NOM[x.natija] ?? x.natija)}</span></div>
              <div className="text-text-dim">{x.qarshi_nom} · {x.obyekt_nom ?? '—'}{x.aosr_raqam ? ` · АОСР № ${x.aosr_raqam}` : ''}{x.muddat ? ` · ${x.muddat}` : ''}
                {x.kechikkan && <b className="text-danger"> · {t('Kechikkan')}</b>}{x.qayta_sinov && <span> · {t('qayta sinov')}</span>}{x.protokol_raqam ? ` · № ${x.protokol_raqam}` : ''}</div>
            </button>
            {onQayta && x.natija === 'mos_emas' && x.majburiy && (
              <button type="button" className="fz-btn fz-btn--sm mt-1" onClick={() => onQayta(x)}>{t('Qayta sinov so‘rash')}</button>)}
          </div>
        </li>))}
    </ul>
  );
}
