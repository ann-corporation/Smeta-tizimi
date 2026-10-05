import React, { useState } from 'react';
import { X } from 'lucide-react';
import { t } from '../../../i18n/til';

export type FieldType = 'text' | 'number' | 'textarea' | 'select' | 'date';

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
      { key: 'byudjet', label: "Byudjet (Mo'ljal)", type: 'number' },
    ]
  },
  shartnoma: {
    type: 'shartnoma',
    title: 'Shartnoma',
    fields: [
      { key: 'raqam', label: 'Shartnoma raqami', required: true },
      { key: 'nom', label: 'Shartnoma nomi / predmeti', required: true },
      { key: 'taraf', label: 'Taraf (kim bilan)' },
      { key: 'summaBezNds', label: 'Summa (QQS siz)', type: 'number' },
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

  if (!config) return <div className="p-4 text-red-500">{t('Sozlama topilmadi:')} {entityType}</div>;

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
            <label className="block text-[12px] font-medium text-zinc-400 mb-1">
              {t(field.label)} {field.required && <span className="text-rose-400">*</span>}
            </label>
            {field.type === 'textarea' ? (
              <textarea
                value={value}
                onChange={e => handleChange(field.key, e.target.value)}
                placeholder={field.placeholder ? t(field.placeholder) : undefined}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none resize-none"
                rows={3}
                required={field.required}
              />
            ) : field.type === 'select' ? (
              <select
                value={value}
                onChange={e => handleChange(field.key, e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
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
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
              />
            )}
          </div>
        );
      })}
      
      <div className="pt-4 flex justify-end gap-3 mt-4">
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2 text-zinc-400 hover:text-white transition-colors text-sm font-medium">
            {t('Bekor qilish')}
          </button>
        )}
        <button 
          type="submit" 
          disabled={isLoading}
          className="bg-indigo-600 hover:bg-indigo-500 px-5 py-2 rounded-lg text-white text-sm font-medium transition-colors shadow-lg shadow-indigo-900/20 disabled:opacity-50"
        >
          {isLoading ? t('Saqlanmoqda...') : t('Saqlash')}
        </button>
      </div>
    </form>
  );
}

// Wrapper for Modal rendering
export function EntityFormModal({ entityType, title, color = '#38bdf8', onClose, ...props }: SharedEntityFormProps & { title?: string, color?: string, onClose: () => void }) {
  const config = ENTITY_CONFIGS[entityType];
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title ? t(title) : t(config?.title ?? 'Yangi yozuv')} className="bg-[#111827] border border-white/10 rounded-xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
          <h3 className="font-bold text-lg" style={{ color }}>{title ? t(title) : `${t('Yangi')} ${t(config?.title ?? 'yozuv')}`}</h3>
          <button onClick={onClose} aria-label={t('Yopish')} title={t('Yopish')} className="text-zinc-500 hover:text-white"><X size={18} /></button>
        </div>
        <SharedEntityForm entityType={entityType} onCancel={onClose} {...props} />
      </div>
    </div>
  );
}
