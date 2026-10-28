import type { ReactNode } from 'react';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { qiymatUchligi, type KatKesim } from '../../lib/ustamali-summa';
import { pulMatni as pul, ustamaIzohi } from './ustamaIzohi';
import { useUstamaliSumma } from './useUstamaliSumma';
import { QiymatUchlik } from './QiymatUchlik';

/**
 * JAMI summa (egasi 2026-10-27, doimiy qoida): sukut `rejim="qqs"` — QQS BILAN qiymat asosiy (katta), ostida kichik:
 * ustamali (QQS siz) va to‘g‘ri xarajat (ustamasiz) — yagona `QiymatUchlik` ko‘rinishi.
 * `rejim="ustamali"` — faqat ish jadvallaridagi QATOR summalari uchun (jami emas): avvalgi juftlik.
 *
 * Pul summasi JUFTI (egasi 2026-10-24: har summa ustamali ham ko‘rinsin): USTAMALI — asosiy (katta),
 * ustamasiz — yonida kichik. Ustama koeffitsientlari `useUstamaliSumma(obyektId)` dan; hisob yagona
 * `ustamaliHisobla` (mavjud nakrutka kaskadi). Kat noma’lum qismi taxminiy deb aniq yoziladi — o‘ylab topilmaydi.
 * `ustamasiz` — ko‘rsatiladigan to‘liq summa (NDS siz); `katKesim` — shu summaning kategoriya bo‘yicha taqsimoti.
 */
export function SummaJuft({ obyektId, ustamasiz, katKesim, shartnomaId, kompaniyaId, kichik = false, className = '', rejim = 'qqs', yorliq }: {
  obyektId: number | null | undefined; ustamasiz: number | null | undefined; katKesim?: KatKesim | null;
  shartnomaId?: number | null; kompaniyaId?: number | null; kichik?: boolean; className?: string;
  /** `qqs` (sukut) — jami: QQS bilan asosiy; `ustamali` — qator summasi (ish jadvali ichida). */
  rejim?: 'qqs' | 'ustamali';
  /** `qqs` rejimida asosiy qator yorlig‘i (sukut «QQS bilan»). */
  yorliq?: string;
}) {
  const h = useUstamaliSumma(obyektId, { kompaniyaId, shartnomaId });
  const u = katKesim ? h.hisobla(katKesim) : null;
  if (rejim === 'qqs') {
    const q = qiymatUchligi(u, ustamasiz);
    return (
      <QiymatUchlik q={q} kichik={kichik} className={className} yorliq={yorliq} title={ustamaIzohi(u, ustamasiz)}
        yuklanmoqda={!!katKesim && q.sabab !== 'SUMMA_YOQ' && h.holat === 'yuklanmoqda'}>
        {q.taxminiy && <span className="text-[10px] text-warn" data-testid="summa-taxminiy">{t('taxminiy (kat noma’lum: {pul} so‘m)', { pul: pul(q.nomalum) })}</span>}
        {u?.qadamlar?.yaxlit != null && <span className="text-[10px] text-text-mute" data-testid="summa-svod-yaxlit">{t('shundan svod yaxlit (ustamasiz): {pul} so‘m', { pul: pul(u.qadamlar.yaxlit) })}</span>}
        {q.sabab === 'KAT_NOMALUM' && <span className="text-[10px] text-warn" data-testid="summa-kat-nomalum">{t('kat noma’lum: {pul} so‘m', { pul: pul(q.nomalum) })}</span>}
        {h.holat === 'xato' && katKesim && q.ustamasiz != null && <button type="button" className="text-left text-[10px] text-warn underline" onClick={h.retry}>{t('Ustama o‘qilmadi — qayta urinish')}</button>}
      </QiymatUchlik>
    );
  }
  const katta = kichik ? 'text-[12px]' : 'text-[14px]';
  const bilinmaydi = ustamasiz == null || !Number.isFinite(ustamasiz);
  const nomalumBor = !!u && u.ustamali != null && (u.nomalum.soni > 0 || u.nomalum.summa !== 0);
  /** Hech bir qatorning kategoriyasi ma’lum emas — ustamali 0 emas, NOMA’LUM. */
  const hechBiriYoq = nomalumBor && u!.ustamasiz === 0;
  const taxminiy = nomalumBor && !hechBiriYoq;
  let asosiy: ReactNode;
  if (bilinmaydi) asosiy = <span className="text-text-mute" title={t('Manba qiymati yo‘q')}>—</span>;
  else if (h.holat === 'yuklanmoqda' && katKesim) asosiy = <span className="text-text-mute">{t('Hisoblanmoqda…')}</span>;
  // Kat noma'lum qism ustamasiz qiymati bilan QO'SHILADI (ustama o'ylab topilmaydi, lekin pul tushib ham qolmaydi):
  // aks holda katta raqam faqat ma'lum qismni ko'rsatib, ustamasizdan kichik chiqardi (egasi sinovi 2026-10-24).
  else if (u?.ustamali != null && !hechBiriYoq) asosiy = <b className="text-text">{taxminiy ? '≈ ' : ''}<FmtN val={taxminiy ? u.ustamali + u.nomalum.summa : u.ustamali} /></b>;
  else asosiy = <span className="text-warn">{t('ustamali noma’lum')}</span>;
  return (
    <span className={`inline-flex flex-col leading-tight tabular-nums ${className}`} title={ustamaIzohi(u, ustamasiz)} data-testid="summa-juft">
      <span className={katta} data-testid="summa-ustamali">{asosiy}</span>
      {!bilinmaydi && <span className="text-[10.5px] text-text-mute" data-testid="summa-ustamasiz">{t('ustamasiz')}: <FmtN val={ustamasiz} /></span>}
      {taxminiy && <span className="text-[10px] text-warn" data-testid="summa-taxminiy">{t('taxminiy (kat noma’lum: {pul} so‘m)', { pul: pul(u!.nomalum.summa) })}</span>}
      {u?.qadamlar?.yaxlit != null && <span className="text-[10px] text-text-mute" data-testid="summa-svod-yaxlit">{t('shundan svod yaxlit (ustamasiz): {pul} so‘m', { pul: pul(u.qadamlar.yaxlit) })}</span>}
      {hechBiriYoq && <span className="text-[10px] text-warn" data-testid="summa-kat-nomalum">{t('kat noma’lum: {pul} so‘m', { pul: pul(u!.nomalum.summa) })}</span>}
      {h.holat === 'xato' && katKesim && !bilinmaydi && <button type="button" className="text-left text-[10px] text-warn underline" onClick={h.retry}>{t('Ustama o‘qilmadi — qayta urinish')}</button>}
    </span>
  );
}
