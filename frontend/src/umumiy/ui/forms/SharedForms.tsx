import { MoneyInput } from '../MoneyInput';
import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { t } from '../../../i18n/til';

export type FieldType = 'text' | 'number' | 'textarea' | 'select' | 'date' | 'money';

export interface FieldConfig {
  key: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  defaultValue?: any;
}

export interface EntityConfig {
  type: string;
  title: string;
  fields: FieldConfig[];
}

export const ENTITY_CONFIGS: Record<string, EntityConfig> = {
  loyiha: {
    type: 'loyiha',
    title: 'Loyiha',
    fields: [
      { key: 'nom', label: 'Loyiha nomi', required: true, placeholder: 'Masalan, Tashkent City Mall' },
      { key: 'hudud', label: 'Hudud / Manzil', placeholder: 'Toshkent sh.' },
      { key: 'byudjet', label: "Byudjet (Mo'ljal)", type: 'money' },
    ]
  },
  shartnoma: {
    type: 'shartnoma',
    title: 'Shartnoma',
    fields: [
      { key: 'raqam', label: 'Shartnoma raqami', required: true },
      { key: 'nom', label: 'Shartnoma nomi / predmeti', required: true },
      { key: 'taraf', label: 'Taraf (kim bilan)' },
      { key: 'summaBezNds', label: 'Summa (QQS siz)', type: 'money' },
      { key: 'nds', label: 'QQS (%)', type: 'number', defaultValue: '12' },
      { key: 'izoh', label: 'Izoh', type: 'textarea' },
    ]
  },
  kontragent: {
    type: 'kontragent',
    title: 'Kontragent',
    fields: [
      { key: 'nom', label: 'Kompaniya nomi', required: true },
      { key: 'inn', label: 'STIR (9 raqam)' },
    ]
  },
  sklad: {
    type: 'sklad',
    title: 'Sklad',
    fields: [
      { key: 'nom', label: 'Sklad nomi', required: true },
      { key: 'manzil', label: 'Manzil' },
      { key: 'masul', label: "Mas'ul shaxs" },
    ]
  },
  texnika: {
    type: 'texnika',
    title: 'Texnika',
    fields: [
      { key: 'nom', label: 'Texnika nomi', required: true },
      { key: 'davlat_raqami', label: 'Davlat raqami' },
    ]
  },
  kadr: {
    type: 'kadr',
    title: 'Xodim',
    fields: [
      { key: 'nom', label: 'Ism sharif', required: true },
      { key: 'lavozim', label: 'Lavozim', required: true },
    ]
  },
  zayavka: {
    type: 'zayavka',
    title: 'Zayavka',
    fields: [
      { key: 'obyektId', label: 'Obyekt', required: true, type: 'select', options: [] }, // options pass dynamic via props
      { key: 'materialId', label: 'Material (ixtiyoriy)', type: 'select', options: [] },
      { key: 'itemText', label: 'Maxsulot / Xizmat nomi', required: true },
      { key: 'requestedQty', label: 'Miqdor', type: 'number', required: true },
      { key: 'unit', label: "O'lchov birligi" },
      { key: 'requiredDate', label: 'Qachonga kerak?', type: 'date' },
      { key: 'priority', label: 'Muhimligi', type: 'select', options: [
        {value: 'low', label: 'Past'},
        {value: 'normal', label: "O'rta"},
        {value: 'high', label: 'Yuqori'}
      ], defaultValue: 'normal' },
      { key: 'note', label: 'Qo\'shimcha izoh', type: 'textarea' },
    ]
  }
};

interface SharedEntityFormProps {
  entityType: string;
  initialData?: Record<string, any>;
  dynamicOptions?: Record<string, {value: string; label: string}[]>;
  onSubmit: (data: Record<string, any>) => void | Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

export function SharedEntityForm({ entityType, initialData = {}, dynamicOptions, onSubmit, onCancel, isLoading }: SharedEntityFormProps) {
  const config = ENTITY_CONFIGS[entityType];
  
  const [data, setData] = useState<Record<string, any>>(() => {
    const init = { ...initialData };
    if (config) {
      config.fields.forEach(f => {
        if (init[f.key] === undefined && f.defaultValue !== undefined) {
          init[f.key] = f.defaultValue;
        }
      });
    }
    return init;
  });

  if (!config) return <div className="fz-note fz-note--danger">{t('Sozlama topilmadi:')} {entityType}</div>;

  const handleChange = (key: string, val: any) => {
    setData(prev => ({ ...prev, [key]: val }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {config.fields.map(field => {
        const value = data[field.key] ?? '';
        const options = dynamicOptions?.[field.key] || field.options;

        return (
          <div key={field.key}>
            <label className="mb-1 block text-[12px] font-medium text-text-dim">
              {t(field.label)} {field.required && <span className="text-danger">*</span>}
            </label>
            {field.type === 'money' ? <MoneyInput value={value} onValueChange={v => handleChange(field.key, v)} placeholder={field.placeholder ? t(field.placeholder) : undefined} required={field.required} className="input w-full px-3 py-2 text-[13px]" /> : field.type === 'textarea' ? (
              <textarea
                value={value}
                onChange={e => handleChange(field.key, e.target.value)}
                placeholder={field.placeholder ? t(field.placeholder) : undefined}
                className="input w-full px-3 py-2 text-[13px] resize-none"
                rows={3}
                required={field.required}
              />
            ) : field.type === 'select' ? (
              <select
                value={value}
                onChange={e => handleChange(field.key, e.target.value)}
                className="input w-full px-3 py-2 text-[13px]"
                required={field.required}
              >
                <option value="">{t('Tanlang...')}</option>
                {options?.map(opt => (
                  <option key={opt.value} value={opt.value}>{t(opt.label)}</option>
                ))}
              </select>
            ) : (
              <input
                type={field.type || 'text'}
                value={value}
                onChange={e => handleChange(field.key, e.target.value)}
                placeholder={field.placeholder ? t(field.placeholder) : undefined}
                required={field.required}
                className="input w-full px-3 py-2 text-[13px]"
              />
            )}
          </div>
        );
      })}
      
      <div className="pt-4 flex justify-end gap-3 mt-4">
        {onCancel && (
          <button type="button" onClick={onCancel} className="fz-btn fz-btn--ghost">
            {t('Bekor qilish')}
          </button>
        )}
        <button 
          type="submit" 
          disabled={isLoading}
          className="fz-btn fz-btn--primary"
        >
          {isLoading ? t('Saqlanmoqda...') : t('Saqlash')}
        </button>
      </div>
    </form>
  );
}

// Wrapper for Modal rendering
export function EntityFormModal({ entityType, title, color: _color, onClose, ...props }: SharedEntityFormProps & { title?: string, color?: string, onClose: () => void }) {
  const config = ENTITY_CONFIGS[entityType];
  // Esc — yopadi (Firuza dialog qoidasi). `color` eski chaqiruvlar uchun qabul qilinadi, rang tokenlardan.
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const sarlavha = title ? t(title) : `${t('Yangi')} ${t(config?.title ?? 'yozuv')}`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'color-mix(in srgb, var(--bg) 72%, transparent)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title ? t(title) : t(config?.title ?? 'Yangi yozuv')} className="fz-card w-full max-w-md" style={{ boxShadow: 'var(--shadow-pop)' }} onClick={e => e.stopPropagation()}>
        <div className="fz-card__head">
          <h3 className="fz-card__title">{sarlavha}</h3>
          <button type="button" onClick={onClose} aria-label={t('Yopish')} title={t('Yopish')} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm"><X size={18} /></button>
        </div>
        <div className="fz-card__body"><SharedEntityForm entityType={entityType} onCancel={onClose} {...props} /></div>
      </div>
    </div>
  );
}
