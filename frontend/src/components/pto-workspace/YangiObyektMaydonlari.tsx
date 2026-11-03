import { AlertTriangle } from 'lucide-react';
import { t } from '../../i18n/til';
import { nomiBirXilObyektlar } from '../../lib/loyihasiz-obyekt';

/** `loyihaId` qiymati: '' = loyihasiz, YANGI_LOYIHA = shu oynada yangi loyiha yaratiladi, aks holda loyiha id. */
export const YANGI_LOYIHA = '__yangi__';

const kirit = 'mt-1 h-9 w-full rounded-md border border-[var(--border-strong)] bg-bg px-3 text-sm text-text';

/**
 * «Yangi obyekt» oynasining nom + loyiha maydonlari: loyiha tanlovi ixtiyoriy (bo'sh qolsa ogohlantiriladi, to'sib qo'yilmaydi),
 * «yangi loyiha» varianti va kompaniyada xuddi shu (normallashgan) nomli obyekt bo'lsa dublikat ogohlantirishi.
 */
export function YangiObyektMaydonlari({ kompaniyaId, mavjud, loyihalar, nom, onNom, loyihaId, onLoyiha, yangiLoyihaNom, onYangiLoyihaNom, onEnter }: {
  kompaniyaId: number;
  mavjud: ReadonlyArray<{ id: number; nom: string; kompaniya_id?: number | null }>;
  loyihalar: ReadonlyArray<{ id: number; nom: string }>;
  nom: string; onNom: (v: string) => void;
  loyihaId: string; onLoyiha: (v: string) => void;
  yangiLoyihaNom: string; onYangiLoyihaNom: (v: string) => void;
  onEnter?: () => void;
}) {
  const dublikatlar = nomiBirXilObyektlar(mavjud, nom, kompaniyaId);
  return (
    <>
      <label className="mb-3 block text-sm">
        <span className="text-[12px] text-text-dim">{t('Nomi')}</span>
        <input value={nom} onChange={(e) => onNom(e.target.value)} autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter' && nom.trim()) onEnter?.(); }}
          className={kirit} placeholder={t('Masalan: Amfiteatr, blok A')} />
      </label>
      {dublikatlar.length > 0 && (
        <div role="alert" className="fz-note fz-note--warn mb-3" data-testid="obyekt-dublikat">
          <AlertTriangle aria-hidden="true" />
          <span>{t('Shu nomli obyekt kompaniyada allaqachon bor: {nom}. Dublikat yaratmaslik uchun mavjudini oching.', { nom: dublikatlar.map((d) => d.nom).join(', ') })}</span>
        </div>
      )}
      <label className="mb-3 block text-sm">
        <span className="text-[12px] text-text-dim">{t('Loyiha (ixtiyoriy)')}</span>
        <select value={loyihaId} onChange={(e) => onLoyiha(e.target.value)} aria-label={t('Loyiha (ixtiyoriy)')}
          className="mt-1 h-9 w-full rounded-md border border-[var(--border-strong)] bg-bg px-2 text-sm text-text">
          <option value="">{t('— Loyihasiz —')}</option>
          {loyihalar.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
          <option value={YANGI_LOYIHA}>{t('+ Yangi loyiha…')}</option>
        </select>
      </label>
      {loyihaId === YANGI_LOYIHA && (
        <label className="mb-3 block text-sm">
          <span className="text-[12px] text-text-dim">{t('Yangi loyiha nomi')}</span>
          <input value={yangiLoyihaNom} onChange={(e) => onYangiLoyihaNom(e.target.value)} className={kirit} placeholder={t('Masalan: Parkent')} />
        </label>
      )}
      {loyihaId === '' && (
        <div className="fz-note fz-note--warn mb-4" data-testid="obyekt-loyihasiz-ogoh">
          <AlertTriangle aria-hidden="true" />
          <span>{t('Loyiha tanlanmadi: obyekt «Loyihasiz obyektlar» guruhida turadi. Keyinroq «Loyihaga biriktirish» bilan biriktirish mumkin.')}</span>
        </div>
      )}
    </>
  );
}
