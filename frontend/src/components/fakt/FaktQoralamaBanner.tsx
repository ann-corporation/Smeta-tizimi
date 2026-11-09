import { History } from 'lucide-react';
import { t } from '../../i18n/til';
import type { QoralamaZiddiyat } from '../../lib/fakt-jurnal-qoralama';

/** Brauzer qoralamasidan tiklangan kiritmalar haqida banner (hodisa 2026-11-09): «Saqlash» / «Bekor qilish». */
export function FaktQoralamaBanner({ soni, ziddiyatlar, nomi, band, onSaqla, onBekor }: {
  soni: number;
  ziddiyatlar: readonly QoralamaZiddiyat[];
  /** Qator nomi (ziddiyat ro'yxati uchun); topilmasa — #id. */
  nomi: (id: number) => string | null | undefined;
  band?: boolean;
  onSaqla: () => void;
  onBekor: () => void;
}) {
  const korsat = ziddiyatlar.slice(0, 5);
  return <div role="status" data-testid="fakt-qoralama-banner" className="fz-note fz-note--warn flex flex-wrap items-center gap-2 text-[12px]">
    <History size={14} aria-hidden="true"/>
    <span className="font-semibold">{t('Saqlanmagan {n} ta o‘zgarish tiklandi', { n: soni })}</span>
    {ziddiyatlar.length > 0 && <span data-testid="fakt-qoralama-ziddiyat">
      {t('{n} ta qator tiklanmadi — qator o‘chirilgan yoki fakti boshqa joyda o‘zgargan:', { n: ziddiyatlar.length })}{' '}
      {korsat.map((z) => nomi(z.yozuv.id) || `#${z.yozuv.id}`).join(', ')}{ziddiyatlar.length > korsat.length ? '…' : ''}
    </span>}
    <span className="ml-auto flex gap-1.5">
      {soni > 0 && <button type="button" className="fz-btn fz-btn--sm fz-btn--primary" disabled={band} onClick={onSaqla}>{t('Saqlash')}</button>}
      <button type="button" className="fz-btn fz-btn--sm" disabled={band} onClick={onBekor}>{t('Bekor qilish')}</button>
    </span>
  </div>;
}
