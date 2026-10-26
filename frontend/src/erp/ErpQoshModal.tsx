import { MoneyInput } from '../umumiy/ui/MoneyInput';
import { reportMoneyValidity } from '../lib/money-input';
import { useRef, useState } from 'react';
import { t } from '../i18n/til';
import { OpsMaydon, OpsOyna } from '../components/kompaniya-ops/OpsUi';

export type ErpOption = string | { value: string; label: string };

export type ErpField = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea' | 'date' | 'money';
  options?: ErpOption[];
  required?: boolean;
  placeholder?: string;
};

interface ErpQoshModalProps {
  isOpen: boolean;
  title: string;
  fields: ErpField[];
  onClose: () => void;
  onSubmit: (values: Record<string, any>) => void | Promise<void>;
  isSaving?: boolean;
  /** Modal ochilganda oldindan to'ldiriladigan qiymatlar (masalan tanlangan texnika) */
  initial?: Record<string, any>;
}

/** ERP qo'shish/tahrirlash oynasi (Firuza: role=dialog, Esc — yopadi). Yorliq va variantlar t() orqali. */
export function ErpQoshModal({ isOpen, title, fields, onClose, onSubmit, isSaving, initial }: ErpQoshModalProps) {
  const moneyScope = useRef<HTMLDivElement>(null);
  const [qiymatlar, setQiymatlar] = useState<Record<string, any>>(initial || {});
  const [xato, setXato] = useState('');
  // Modal har ochilganda initial qiymatlarni qayta o'rnatamiz (eski kiritilgan qiymat qolib ketmasin)
  const [ochiqEdi, setOchiqEdi] = useState(false);
  if (isOpen && !ochiqEdi) { setOchiqEdi(true); setQiymatlar(initial || {}); setXato(''); }
  if (!isOpen && ochiqEdi) setOchiqEdi(false);

  if (!isOpen) return null;

  const set = (key: string, val: any) => setQiymatlar((prev) => ({ ...prev, [key]: val }));

  const yuborish = async () => {
    if (!reportMoneyValidity(moneyScope.current)) return;
    for (const f of fields) {
      /* ⚡ 2026-08-16 (audit H14): `!qiymatlar[key]` da `!0 === true` — majburiy RAQAM maydoniga 0 kiritilsa forma
         yuborilmasdi. Endi faqat HAQIQATAN bo'sh qiymat rad etiladi — va sababi ko'rsatiladi. */
      const v = qiymatlar[f.key];
      if (f.required && (v === undefined || v === null || v === '')) { setXato(t('«{m}» maydonini to‘ldiring.', { m: t(f.label) })); return; }
    }
    setXato('');
    await onSubmit(qiymatlar);
    setQiymatlar(initial || {});
  };

  return (
    <OpsOyna ochiq={isOpen} onYop={onClose} band={isSaving} sarlavha={title} kenglik={520}
      amallar={<>
        <button type="button" onClick={onClose} disabled={isSaving} className="fz-btn fz-btn--ghost">{t('Bekor qilish')}</button>
        <button type="button" onClick={() => void yuborish()} disabled={isSaving} className="fz-btn fz-btn--primary">
          {isSaving ? t('Saqlanmoqda…') : t('Saqlash')}
        </button>
      </>}>
      <div ref={moneyScope} className="space-y-3">
        {fields.map((f) => (
          <OpsMaydon key={f.key} nom={t(f.label)} majburiy={f.required}>
            {f.type === 'money' ? (
              <MoneyInput numericValue value={qiymatlar[f.key] ?? ''} onValueChange={(v) => set(f.key, v === '' ? '' : Number(v))} placeholder={f.placeholder} required={f.required} className="h-8 w-full px-2 text-right text-[13px] tabular-nums" />
            ) : f.type === 'select' ? (
              <select value={qiymatlar[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)}>
                <option value="">{t('— tanlang —')}</option>
                {(f.options || []).map((o) => {
                  const val = typeof o === 'string' ? o : o.value;
                  const lab = typeof o === 'string' ? t(o) : o.label;
                  return <option key={val} value={val}>{lab}</option>;
                })}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea className="resize-none" rows={3} placeholder={f.placeholder} value={qiymatlar[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
            ) : (
              <input type={f.type} placeholder={f.placeholder} value={qiymatlar[f.key] ?? ''}
                onChange={(e) => set(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)} />
            )}
          </OpsMaydon>
        ))}
        {xato && <p role="alert" className="fz-note fz-note--warn">{xato}</p>}
      </div>
    </OpsOyna>
  );
}
