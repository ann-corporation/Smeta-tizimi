/**
 * SaqlashPaneli — YAGONA yopishqoq saqlash paneli (egasi 2026-11-15: «o'zgartirgach saqlash uchun eng pastgacha skroll qilaman»).
 * Shakl/jadval o'zgargan zahoti ekran PASTIDA turadi (sahifa skrolli ichida `sticky bottom-0`), skrollga bog'liq emas:
 *   «O‘zgarishlar saqlanmagan (N)» · [Bekor qilish] · [Saqlash  Ctrl+S]
 * Saqlash funksiyasi — sahifaning o'zinikidi (xulq o'zgarmaydi); panel faqat holat/klaviatura/chiqish himoyasini beradi (useSaqlanmagan).
 * Joylash: panelni skrollanadigan kontent ICHIDA, shaklning OXIRIGA qo'ying (sticky shu skroll konteyneriga yopishadi).
 */
import type { ReactNode } from 'react';
import { AlertTriangle, Check, RotateCcw, Save } from 'lucide-react';
import { t } from '../../i18n/til';
import { useSaqlanmagan, type SaqlashFn } from './useSaqlanmagan';

export function SaqlashPaneli({ kalit, soni, saqla, bekor, band, taqiq, klaviatura = true, qoralama, qoshimcha, tugmalar, className = '' }: {
  kalit: string;
  soni: number;
  saqla: SaqlashFn;
  /** Bekor qilish (o'zgarishlarni tashlash). Berilmasa tugma chiqmaydi. */
  bekor?: () => void;
  /** Sahifa o'z saqlash holatini yuritsa (tugma «Saqlanmoqda…» bo'ladi). */
  band?: boolean;
  /** Saqlash mumkin emas (xatoli qator va h.k.): tugma o'chiq. */
  taqiq?: boolean;
  /** Ctrl+S ni panel ushlasin (sahifa o'zi ushlasa — false; belgi baribir ko'rinadi). */
  klaviatura?: boolean;
  qoralama?: boolean;
  /** Matn yonidagi qo'shimcha belgilar (xato soni, sana…). */
  qoshimcha?: ReactNode;
  /** «Bekor qilish»dan oldingi qo'shimcha tugmalar (masalan «Orqaga»). */
  tugmalar?: ReactNode;
  className?: string;
}) {
  const h = useSaqlanmagan({ kalit, soni, saqla, klaviatura, qoralama, band, taqiq });
  const korinadi = soni > 0 || h.holat === 'saqlandi' || h.holat === 'saqlanmoqda' || h.holat === 'xato';
  if (!korinadi) return null;
  const toza = soni === 0 && h.holat === 'saqlandi';
  return (
    <div role="region" aria-label={t('Saqlash paneli')} data-testid="saqlash-paneli" data-holat={h.holat}
      className={`sticky bottom-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-md)] border bg-surface px-4 py-2.5 ${toza ? 'border-ok/50' : h.holat === 'xato' ? 'border-danger/60' : 'border-accent/50'} ${className}`}
      style={{ boxShadow: 'var(--shadow-pop)' }}>
      <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-text">
        {toza ? <><Check size={14} className="text-ok" aria-hidden="true" /> {t('Saqlandi')}</>
          : h.holat === 'saqlanmoqda' ? t('Saqlanmoqda…')
          : t('O‘zgarishlar saqlanmagan ({n})', { n: String(soni) })}
      </span>
      {h.holat === 'xato' && <span role="alert" className="inline-flex items-center gap-1 text-[12px] text-danger"><AlertTriangle size={13} aria-hidden="true" /> {h.xato}</span>}
      {qoshimcha}
      {!toza && <div className="ml-auto flex flex-wrap items-center gap-2">
        {tugmalar}
        {bekor && <button type="button" onClick={bekor} disabled={h.band} className="fz-btn fz-btn--ghost"><RotateCcw size={13} aria-hidden="true" /> {t('Bekor qilish')}</button>}
        <button type="button" onClick={() => void h.saqlaBajar()} disabled={h.band || !!taqiq} className="fz-btn fz-btn--primary">
          <Save size={14} aria-hidden="true" /> {h.band ? t('Saqlanmoqda…') : t('Saqlash')}
          <kbd className="fz-kbd hidden sm:inline">{'Ctrl+S'}</kbd>
        </button>
      </div>}
    </div>
  );
}
