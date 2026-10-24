import type { ReactNode } from 'react';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import type { KatKesim } from '../../lib/ustamali-summa';
import { pulMatni as pul, ustamaIzohi } from './ustamaIzohi';
import { useUstamaliSumma } from './useUstamaliSumma';

/**
 * Pul summasi JUFTI (egasi 2026-10-24: har summa ustamali ham ko‘rinsin): USTAMALI — asosiy (katta),
 * ustamasiz — yonida kichik. Ustama koeffitsientlari `useUstamaliSumma(obyektId)` dan; hisob yagona
 * `ustamaliHisobla` (mavjud nakrutka kaskadi). Kat noma’lum qismi taxminiy deb aniq yoziladi — o‘ylab topilmaydi.
 * `ustamasiz` — ko‘rsatiladigan to‘liq summa (NDS siz); `katKesim` — shu summaning kategoriya bo‘yicha taqsimoti.
 */
export function SummaJuft({ obyektId, ustamasiz, katKesim, shartnomaId, kompaniyaId, kichik = false, className = '' }: {
  obyektId: number | null | undefined; ustamasiz: number | null | undefined; katKesim?: KatKesim | null;
  shartnomaId?: number | null; kompaniyaId?: number | null; kichik?: boolean; className?: string;
}) {
  const h = useUstamaliSumma(obyektId, { kompaniyaId, shartnomaId });
  const u = katKesim ? h.hisobla(katKesim) : null;
  const katta = kichik ? 'text-[12px]' : 'text-[14px]';
  const bilinmaydi = ustamasiz == null || !Number.isFinite(ustamasiz);
  const nomalumBor = !!u && u.ustamali != null && (u.nomalum.soni > 0 || u.nomalum.summa !== 0);
  /** Hech bir qatorning kategoriyasi ma’lum emas — ustamali 0 emas, NOMA’LUM. */
  const hechBiriYoq = nomalumBor && u!.ustamasiz === 0;
  const taxminiy = nomalumBor && !hechBiriYoq;
  let asosiy: ReactNode;
  if (bilinmaydi) asosiy = <span className="text-text-mute" title={t('Manba qiymati yo‘q')}>—</span>;
  else if (h.holat === 'yuklanmoqda' && katKesim) asosiy = <span className="text-text-mute">{t('Hisoblanmoqda…')}</span>;
  else if (u?.ustamali != null && !hechBiriYoq) asosiy = <b className="text-text"><FmtN val={u.ustamali} /></b>;
  else asosiy = <span className="text-warn">{t('ustamali noma’lum')}</span>;
  return (
    <span className={`inline-flex flex-col leading-tight tabular-nums ${className}`} title={ustamaIzohi(u, ustamasiz)} data-testid="summa-juft">
      <span className={katta} data-testid="summa-ustamali">{asosiy}</span>
      {!bilinmaydi && <span className="text-[10.5px] text-text-mute" data-testid="summa-ustamasiz">{t('ustamasiz')}: <FmtN val={ustamasiz} /></span>}
      {taxminiy && <span className="text-[10px] text-warn" data-testid="summa-taxminiy">{t('taxminiy (kat noma’lum: {pul} so‘m)', { pul: pul(u!.nomalum.summa) })}</span>}
      {hechBiriYoq && <span className="text-[10px] text-warn" data-testid="summa-kat-nomalum">{t('kat noma’lum: {pul} so‘m', { pul: pul(u!.nomalum.summa) })}</span>}
      {h.holat === 'xato' && katKesim && !bilinmaydi && <button type="button" className="text-left text-[10px] text-warn underline" onClick={h.retry}>{t('Ustama o‘qilmadi — qayta urinish')}</button>}
    </span>
  );
}
