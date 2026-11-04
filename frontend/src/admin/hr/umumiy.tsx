import { t } from '../../i18n/til';
import { hrXato, type HrYoz } from '../../api/t2-hr';
import { toast } from '../../umumiy/ui/Toast';

export { useHrYukla, type Qayta, type HrYuklagich, type YuklaNatija } from './yukla';

/** Yozuv natijasini ko'rsatadi: muvaffaqiyatda `ok`, aks holda xato toasti. */
export function yozNatija(r: HrYoz, okMatn: string): boolean {
  if (r.ok && r.code == null) { toast(t(okMatn), 'ok'); return true; }
  toast(t(hrXato(r)), 'danger', undefined, 8000);
  return false;
}

export function XatoQutisi({ xato }: { xato: string | null }) {
  if (!xato) return null;
  return <div className="rounded-md border border-danger bg-danger-soft p-3 text-[13px] text-danger" role="alert">{t(hrXato({ error: xato }))}</div>;
}

export function OyTanlov({ oy, onChange }: { oy: string; onChange: (oy: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-[12px] text-text-mute">{t('Oy')}
      <input type="month" className="input h-8 px-2 text-[13px]" value={oy} onChange={(e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) onChange(e.target.value); }} aria-label={t('Oy')} />
    </label>
  );
}
