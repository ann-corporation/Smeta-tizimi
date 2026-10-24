import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { t } from '../../i18n/til';
import type { FaktYigindi } from '../../lib/fakt-studio';

/**
 * Fakt Studio yig'indi paneli: shu obyekt bo'yicha fakt (ustamali + ustamasiz), smetada yo'q yangi ishlar,
 * bajarilmaydigan hajmlar va F2 tayyorlashga o'tish. Barcha summalar SummaJuft orqali (ustamali asosiy, ustamasiz kichik).
 */
export function FaktStudioBar({ yigindi, obyektId, kompaniyaId, onF2, onYangiIsh, band }: {
  yigindi: FaktYigindi; obyektId: number; kompaniyaId: number; onF2?: () => void; onYangiIsh?: () => void; band?: boolean;
}) {
  const y = yigindi;
  return <section className="karta flex flex-wrap items-start gap-x-6 gap-y-2 px-3 py-2" aria-label={t('Fakt yig‘indisi')} data-testid="fakt-studio-bar">
    <div><div className="text-[10px] uppercase text-text-mute">{t('Fakt (hozircha)')}</div>
      <SummaJuft obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={y.faktUstamasiz} katKesim={y.faktKesim} /></div>
    <div><div className="text-[10px] uppercase text-text-mute">{t('Smetada yo‘q ishlar')}: <b className="text-text" data-testid="fs-yangi-soni">{y.yangiSoni}</b></div>
      {y.yangiSoni > 0 && <SummaJuft kichik obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={y.yangiUstamasiz} katKesim={y.yangiKesim} />}</div>
    <div><div className="text-[10px] uppercase text-text-mute">{t('Bajarilmaydi')}: <b className="text-text" data-testid="fs-bajarilmadi-soni">{y.bajarilmadiSoni}</b></div>
      {y.bajarilmadiSoni - y.bajarilmadiNarxsiz > 0 && <SummaJuft kichik obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={y.bajarilmadiUstamasiz} katKesim={y.bajarilmadiKesim} />}
      {y.bajarilmadiNarxsiz > 0 && <div className="text-[10px] text-warn" data-testid="fs-narxsiz">{t('narxi noma‘lum: {n} ta', { n: String(y.bajarilmadiNarxsiz) })}</div>}</div>
    <div className="ml-auto flex items-center gap-2">
      {onYangiIsh && <button type="button" onClick={onYangiIsh} className="rounded-lg border border-accent/40 px-3 py-1.5 text-[12px] font-semibold text-text hover:bg-accent/10">+ {t('Smetada yo‘q ish')}</button>}
      {onF2 && <button type="button" disabled={band} onClick={onF2} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">{t('F2 tayyorlash')} →</button>}
    </div>
  </section>;
}
