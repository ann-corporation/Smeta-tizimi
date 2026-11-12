import { useMemo, useRef, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { ModalOyna } from '../pto-workspace/ModalOyna';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { FmtN } from '../../lib/format';
import { toast } from '../../umumiy/ui/Toast';
import { t } from '../../i18n/til';
import { yangiOperationId } from '../../api/supabase';
import { sbT2TolovYoz } from '../../api/t2-buxgalteriya';
import { TOLOV_TURLARI, bosTolovShakl, tolovTekshir, tolovYuki, type TolovShakl, type TolovTuri } from '../../lib/tolov-forma';

export type TolovShartnoma = { id: number; raqam: string; nom?: string | null; taraf?: string | null; jami_nds_bilan?: number | null };

const kirit = 'w-full rounded-md border border-border bg-surface px-2 py-1.5 text-[13px] text-text outline-none focus:border-accent';
const yorliq = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-mute';

/**
 * To'lov kiritish oynasi — UMUMIY (pudratchi «Moliya» sahifasi ham, buyurtmachi ko'rinishi ham shuni ishlatadi).
 * Shartnoma oldindan tanlanadi (qatordan ochilsa). Summa — QQS bilan (bankdan o'tgan haqiqiy pul), ustama qo'llanmaydi;
 * bo'sh summa saqlanmaydi (NULL ≠ 0). Takror bosish ikkinchi to'lov yaratmaydi (operation_id bir oyna uchun bitta).
 */
export function TolovForma({ kompaniyaId, shartnomalar, shartnomaId = null, yop, onSaved }: {
  kompaniyaId: number; shartnomalar: readonly TolovShartnoma[]; shartnomaId?: number | null; yop: () => void; onSaved?: () => void;
}) {
  const [shakl, setShakl] = useState<TolovShakl>(() => bosTolovShakl(shartnomaId ?? (shartnomalar.length === 1 ? shartnomalar[0].id : null)));
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [urinildi, setUrinildi] = useState(false);
  const operatsiya = useRef(yangiOperationId());
  const xatolar = useMemo(() => tolovTekshir(shakl), [shakl]);
  const xato = (j: string) => (urinildi ? xatolar.find((x) => x.joy === j)?.matn : undefined);
  const ozgar = (p: Partial<TolovShakl>) => setShakl((s) => ({ ...s, ...p }));
  const sh = shartnomalar.find((x) => x.id === shakl.shartnomaId) ?? null;

  const saqla = async () => {
    setUrinildi(true);
    const yuk = tolovYuki(shakl);
    if (!yuk || saqlanmoqda) return;
    setSaqlanmoqda(true);
    try {
      const r = await sbT2TolovYoz({ ...yuk, operationId: operatsiya.current });
      if (!r.ok) { toast(r.error || r.sabab || t('To‘lov saqlanmadi'), 'danger'); return; }
      toast(r.takror ? t('Bu to‘lov allaqachon saqlangan.') : t('To‘lov saqlandi.'), 'ok');
      onSaved?.();
      yop();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('To‘lov saqlanmadi'), 'danger');
    } finally { setSaqlanmoqda(false); }
  };

  return (
    <ModalOyna sarlavha="To‘lov kiritish" ikon={<CreditCard className="text-accent" size={18} aria-hidden="true" />} yop={yop} kenglik={520}>
      <form className="space-y-3" data-kompaniya={kompaniyaId} onSubmit={(e) => { e.preventDefault(); void saqla(); }}>
        <label className="block"><span className={yorliq}>{t('Shartnoma')} *</span>
          <select aria-label={t('Shartnoma')} className={kirit} value={shakl.shartnomaId ?? ''} onChange={(e) => ozgar({ shartnomaId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">{t('— tanlang —')}</option>
            {shartnomalar.map((s) => <option key={s.id} value={s.id}>№ {s.raqam}{s.nom ? ` — ${s.nom}` : ''}</option>)}
          </select>
          {xato('shartnoma') && <span className="text-[11px] text-danger">{t(xato('shartnoma') as string)}</span>}
        </label>
        {sh && <p className="text-[12px] text-text-mute" data-testid="tolov-shartnoma-jami">
          {t('Shartnoma summasi (QQS bilan)')}: {sh.jami_nds_bilan == null ? <b>—</b> : <b className="tabular-nums text-text"><FmtN val={sh.jami_nds_bilan} /></b>}
        </p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className={yorliq}>{t('Turi')}</span>
            <select aria-label={t('Turi')} className={kirit} value={shakl.tur} onChange={(e) => ozgar({ tur: e.target.value as TolovTuri })}>
              {TOLOV_TURLARI.map((x) => <option key={x.id} value={x.id}>{t(x.nom)} — {t(x.izoh)}</option>)}
            </select>
          </label>
          <label className="block"><span className={yorliq}>{t('Sana')} *</span>
            <input type="date" aria-label={t('Sana')} className={kirit} value={shakl.sana} onChange={(e) => ozgar({ sana: e.target.value })} />
            {xato('sana') && <span className="text-[11px] text-danger">{t(xato('sana') as string)}</span>}
          </label>
        </div>
        <label className="block"><span className={yorliq}>{t('Summa, so‘m (QQS bilan)')} *</span>
          <MoneyInput aria-label={t('Summa')} inputMode="decimal" className={`${kirit} tabular-nums`} value={shakl.summa} onValueChange={(v) => ozgar({ summa: v })} placeholder={t('Haqiqatda o‘tkazilgan pul')} autoFocus />
          <span className="mt-0.5 block text-[11px] text-text-mute">{t('To‘lov — haqiqiy pul harakati: ustama qo‘llanmaydi. Summa bankdan o‘tgan QQS bilan miqdor.')}</span>
          {xato('summa') && <span className="text-[11px] text-danger">{t(xato('summa') as string)}</span>}
        </label>
        <label className="block"><span className={yorliq}>{t('Izoh')}</span>
          <textarea aria-label={t('Izoh')} rows={2} className={kirit} value={shakl.izoh} maxLength={500} onChange={(e) => ozgar({ izoh: e.target.value })} />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="fz-btn fz-btn--ghost" onClick={yop}>{t('Bekor qilish')}</button>
          <button type="submit" className="fz-btn fz-btn--primary" disabled={saqlanmoqda}>{saqlanmoqda ? t('Saqlanmoqda…') : t('Saqlash')}</button>
        </div>
      </form>
    </ModalOyna>
  );
}
