import { useCallback, useEffect, useMemo, useState } from 'react';
import { t } from '../../i18n/til';
import { buxNdsOl, type BuxNds, type BuxNdsQator } from '../../api/t2-bux-hisob';
import { ndsJami, MANBA_NOM } from '../../lib/buxgalteriya/hisob';
import { Izoh, Son, XatoQator } from './umumiy';
import { ddmmyyyy, td, th, type Davr } from './yordamchi';

function Reyestr({ nom, qatorlar, izoh }: { nom: string; qatorlar: BuxNdsQator[]; izoh: string }) {
  const j = useMemo(() => ndsJami(qatorlar), [qatorlar]);
  return (
    <section className="space-y-1">
      <h3 className="text-[13px] font-semibold">{nom}<Izoh matn={izoh} /></h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-[12.5px]" aria-label={nom}>
          <thead><tr className="text-left text-[11px] uppercase text-text-mute">
            <th className={th}>{t('Sana')}</th><th className={th}>{t('Hujjat')}</th><th className={th}>{t('Kontragent')}</th><th className={th}>{t('STIR')}</th>
            <th className={`${th} text-right`}>{t('QQS siz')}</th><th className={`${th} text-right`}>{t('QQS')}</th><th className={`${th} text-right`}>{t('QQS bilan')}</th>
          </tr></thead>
          <tbody>
            {qatorlar.length === 0 && <tr><td colSpan={7} className="px-2 py-4 text-center text-text-mute">{t('Bu davrda hujjat yo‘q.')}</td></tr>}
            {qatorlar.map((x) => (
              <tr key={`${x.manba_tur}:${x.manba_id}`} className="border-t border-border/50">
                <td className={td}>{ddmmyyyy(x.sana)}</td>
                <td className={td}>{x.hujjat ?? '—'} <span className="text-[10.5px] text-text-mute">{MANBA_NOM[x.manba_tur] ? t(MANBA_NOM[x.manba_tur]) : x.manba_tur}</span></td>
                <td className={td}>{x.kontragent ?? '—'}</td><td className={td}>{x.inn ?? '—'}</td>
                <td className={`${td} text-right`}><Son v={x.asos} /></td><td className={`${td} text-right`}><Son v={x.nds} /></td><td className={`${td} text-right`}><Son v={x.jami} /></td>
              </tr>
            ))}
            {qatorlar.length > 0 && (
              <tr className="border-t border-border font-semibold"><td className={td} colSpan={4}>{t('Jami')}</td>
                <td className={`${td} text-right`}><Son v={j.asos} /></td><td className={`${td} text-right`}><Son v={j.nds} /></td><td className={`${td} text-right`}><Son v={j.jami} /></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** QQS reyestri: sotuv (chiqarilgan QQS) va xarid (hisobga olinadigan QQS). */
export function Nds({ kid, davr, versiya }: { kid: number; davr: Davr; versiya: number }) {
  const [d, setD] = useState<BuxNds | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const yukla = useCallback(async () => {
    const r = await buxNdsOl(kid, { dan: davr.dan, gacha: davr.gacha });
    if (r.ok) { setD(r.natija); setXato(null); } else setXato(r.error);
  }, [kid, davr.dan, davr.gacha]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void yukla(); }, [yukla, versiya]);
  const s = useMemo(() => ndsJami(d?.sotuv ?? []), [d]);
  const x = useMemo(() => ndsJami(d?.xarid ?? []), [d]);
  return (
    <div className="space-y-5">
      <XatoQator xato={xato} />
      <div className="fz-panel grid grid-cols-3 gap-2 text-[12.5px]" aria-label={t('QQS xulosa')}>
        <div><span className="mb-1 block text-[11px] uppercase text-text-mute">{t('Chiqarilgan QQS (sotuv)')}</span><Son v={s.nds} qalin /></div>
        <div><span className="mb-1 block text-[11px] uppercase text-text-mute">{t('Hisobga olinadigan QQS (xarid)')}</span><Son v={x.nds} qalin /></div>
        <div><span className="mb-1 block text-[11px] uppercase text-text-mute">{t('Byudjetga to‘lanadi (farq)')}<Izoh matn={t('Sotuvdagi QQS minus xariddagi QQS. Minus bo‘lsa — hisobga olinadi.')} /></span><Son v={d ? s.nds - x.nds : null} qalin /></div>
      </div>
      <Reyestr nom={t('Sotuv reyestri')} qatorlar={d?.sotuv ?? []} izoh={t('Forma-3 (hisob-faktura) bo‘yicha realizatsiya va chiqarilgan QQS.')} />
      <Reyestr nom={t('Xarid reyestri')} qatorlar={d?.xarid ?? []} izoh={t('Ombor kirimi va subpudrat dalolatnomalari bo‘yicha xarid va hisobga olinadigan QQS. QQS to‘lamaydigan kontragentda QQS ajratilmaydi.')} />
    </div>
  );
}
