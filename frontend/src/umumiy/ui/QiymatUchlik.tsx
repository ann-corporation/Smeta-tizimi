import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import type { QiymatUchlik as Uchlik } from '../../lib/ustamali-summa';
import type { SummaPaket } from '../../lib/summa-paket';
import { summaTuriMatni, uchlikSababMatni, type SummaTuri } from './qiymatYorliq';
import { SummaKesimi } from './SummaKesimi';

const Yoq = ({ izoh }: { izoh?: string }) => <span className="text-text-mute" title={izoh ?? t('Manba qiymati yo‘q')}>—</span>;

/**
 * OBYEKT QIYMATI — jami summalar uchun YAGONA ko‘rinish (egasi 2026-10-27, doimiy qoida: «QQS bilan qiymat — ASOSIY»):
 *  1-qator (katta): QQS bilan (ВСЕГО);
 *  2-qator (kichik): ustamali, QQS siz (ИТОГО-4) va to‘g‘ri xarajat (ustamasiz).
 * Bu yerda hisob YO‘Q — qiymatlar `qiymatUchligi`/`portfelUchligi` dan (yoki server javobidan). Noma’lum — «—» + izoh.
 * Taxminiy (kat noma’lum) bo‘lsa ikkala ustamali qiymat ham «≈» bilan.
 */
export function QiymatUchlik({ q, yuklanmoqda = false, yorliq, kichik = false, className = '', title, asosiyBosish, rang, kesim, kiritishYoli, children }: {
  q: Uchlik;
  yuklanmoqda?: boolean;
  /** Asosiy qator yorlig‘i (sukut: «QQS bilan»), masalan «F2, QQS bilan». */
  yorliq?: string;
  kichik?: boolean;
  className?: string;
  title?: string;
  /** Asosiy raqam bosiladigan bo‘lsa (masalan dalil ochish). */
  asosiyBosish?: () => void;
  /** Asosiy raqam rangi (CSS rang, masalan sof natija ishorasi bo‘yicha). */
  rang?: string;
  /** ▸ Kesim (server summa paketi): ЧЕЛ/МАШ/МАТ/ОБ/Subpudrat + soatlar. Berilmasa — ko‘rsatilmaydi. */
  kesim?: SummaPaket | null;
  /** Qiymat kiritilmagan bo‘lsa (manba yo‘q) — «kiritilmagan» + qayerdan kiritiladi havolasi (0 ko‘rsatilmaydi). */
  kiritishYoli?: { yol: string; matn?: string };
  /** Qo‘shimcha kichik qatorlar (taxminiy izohi, qayta urinish va h.k.). */
  children?: ReactNode;
}) {
  if (q.sabab === 'SUMMA_YOQ' && kiritishYoli && !yuklanmoqda) {
    return (
      <span className={`inline-flex flex-col leading-tight ${className}`} data-testid="qiymat-uchlik" title={title}>
        <span className={kichik ? 'text-[12px]' : 'text-[15px]'} data-testid="summa-kiritilmagan">
          <span className="mr-1 text-[10px] font-normal text-text-mute">{yorliq ?? t('QQS bilan')}</span>{' '}
          <span className="text-text-mute">{t('kiritilmagan')}</span>
        </span>
        <Link className="text-[10.5px] text-accent underline" to={kiritishYoli.yol} data-testid="summa-kiritish-yoli">{kiritishYoli.matn ?? t('Qayerdan kiritiladi →')}</Link>
        {children}
      </span>
    );
  }
  const katta = kichik ? 'text-[12px]' : 'text-[15px]';
  const belgi = q.taxminiy ? '≈ ' : '';
  const sabab = uchlikSababMatni(q.sabab);
  let son: ReactNode;
  if (q.qqsBilan != null) son = <b className="text-text" style={rang ? { color: rang } : undefined}>{belgi}<FmtN val={q.qqsBilan} /></b>;
  else if (yuklanmoqda) son = <span className="text-text-mute">{t('Hisoblanmoqda…')}</span>;
  else son = <Yoq izoh={sabab} />;
  const asosiy = asosiyBosish
    ? <button type="button" className="underline decoration-dotted" onClick={asosiyBosish}>{son}</button> : son;
  return (
    <span className={`inline-flex flex-col leading-tight tabular-nums ${className}`} data-testid="qiymat-uchlik" title={title}>
      <span className={katta} data-testid="summa-qqs">
        <span className="mr-1 text-[10px] font-normal text-text-mute" data-testid="summa-qqs-yorliq">{yorliq ?? t('QQS bilan')}</span>{' '}
        {asosiy}
      </span>
      <span className="text-[10.5px] text-text-mute" data-testid="summa-ustamali">
        {t('ustamali, QQS siz')}: {q.ustamali != null ? <>{belgi}<FmtN val={q.ustamali} /></> : <Yoq izoh={sabab} />}
      </span>
      <span className="text-[10.5px] text-text-mute" data-testid="summa-ustamasiz">
        {t('to‘g‘ri xarajat (ustamasiz)')}: {q.ustamasiz != null ? <FmtN val={q.ustamasiz} /> : <Yoq />}
      </span>
      {kesim && <SummaKesimi paket={kesim} />}
      {children}
    </span>
  );
}

export function SummaYorliq({ tur, className = '' }: { tur: SummaTuri; className?: string }) {
  return <span className={`block text-[10px] font-normal leading-tight text-text-mute ${className}`} data-testid={`summa-yorliq-${tur}`}>{summaTuriMatni(tur)}</span>;
}
