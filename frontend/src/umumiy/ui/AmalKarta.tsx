import type { AmalNatija } from '../../lib/reestr/amal-motor';
import type { AmalTasdiq } from '../../lib/reestr/amal';
import { t } from '../../i18n/til';

/** Jarvis amal kartasi holati: savol -> ko'rinish -> (pul bo'lsa) ikkinchi tasdiq -> natija. */
export type AmalXolati = {
  kalit: string;
  nom: string;
  faza: 'savol' | 'korinish' | 'ikki' | 'ruxsatYoq' | 'band' | 'bajarildi' | 'xato' | 'bekor';
  tasdiq: AmalTasdiq;
  natija?: AmalNatija;
};

/**
 * AMAL KARTASI (ekotizim V2, 3-qadam): oldindan ko'rish matni xabarning o'zida; bu yerda faqat tasdiq tugmalari va natija havolasi.
 * Pul/qaytarib bo'lmas amal: «Tasdiqlash» dan keyin ALOHIDA «Tasdiqlayman» chiqadi (bitta bosish yozmaydi).
 */
export function AmalKarta({ x, onTasdiq, onBekor, onOchish }: { x: AmalXolati; onTasdiq: () => void; onBekor: () => void; onOchish: (yol: string) => void }) {
  const faol = x.faza === 'korinish' || x.faza === 'ikki';
  return (
    <div className="mt-2 rounded-md border border-border p-2 text-xs" data-testid="amal-karta" data-faza={x.faza}>
      {faol && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onTasdiq} className={`rounded-md px-3 py-1.5 font-medium text-[var(--on-accent)] ${x.faza === 'ikki' ? 'bg-danger' : 'bg-accent'}`}>
            {x.faza === 'ikki' ? t('Tasdiqlayman') : t('Tasdiqlash')}
          </button>
          <button type="button" onClick={onBekor} className="rounded-md border border-border px-3 py-1.5 text-text-dim hover:text-text">{t('Bekor qilish')}</button>
          {x.faza === 'korinish' && x.tasdiq === 'ikkiTasdiq' && <span className="text-text-mute">{t('Pul yoki qaytarib bo‘lmas amal: ikki marta tasdiqlanadi')}</span>}
          {x.faza === 'ikki' && <span className="text-text-mute">{t('Oxirgi tasdiq: bosganingizdan keyin yoziladi')}</span>}
        </div>
      )}
      {x.faza === 'band' && <span className="text-text-dim">{t('Bajarilmoqda…')}</span>}
      {x.faza === 'bajarildi' && (
        <div className="flex items-center gap-2"><span className="text-ok">{t('Bajarildi')}</span>
          {x.natija?.havola && <button type="button" onClick={() => onOchish(x.natija?.havola as string)} className="rounded-md border border-accent/50 px-2 py-1 text-accent hover:bg-accent/10">{t('Natijani ochish')}</button>}
          {x.natija?.takror && <span className="text-text-mute">{t('Bu amal avval bajarilgan — qayta yozilmadi')}</span>}
        </div>
      )}
      {x.faza === 'bekor' && <span className="text-text-mute">{t('Bekor qilindi — hech narsa yozilmadi')}</span>}
    </div>
  );
}