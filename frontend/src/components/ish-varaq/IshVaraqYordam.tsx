import { X } from 'lucide-react';
import { t } from '../../i18n/til';
import { VARAQ_TUGMALAR } from '../../lib/ish-varaq/tugmalar';

/** «?» — Ish varag'i klaviatura yordami oynasi. Yopish: Esc yoki «?» (IshVaraq'da ro'yxatdan o'tgan), fon yoki × tugma. */
export function IshVaraqYordam({ ochiq, yop }: { ochiq: boolean; yop: () => void }) {
  if (!ochiq) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={t('Ish varag‘i: tugmalar')} data-testid="varaq-yordam" onClick={yop}>
      <div className="karta max-h-[80vh] w-full max-w-2xl overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-text">{t('Ish varag‘i: tugmalar')}</h2>
          <button type="button" onClick={yop} aria-label={t('Yopish')} className="rounded p-1 text-text-mute hover:text-text"><X size={16} /></button>
        </div>
        <p className="mb-2 text-[11px] text-text-mute">{t('Matn kiritayotganda qisqa harf tugmalari ishlamaydi.')}</p>
        {VARAQ_TUGMALAR.map((g) => (
          <section key={g.guruh} className="mb-3">
            <h3 className="mb-1 text-[12px] font-semibold text-text-dim">{t(g.guruh)}</h3>
            <ul className="grid gap-y-0.5">
              {g.qatorlar.map((q) => (
                <li key={`${g.guruh}-${q.tugma}`} className="flex items-start justify-between gap-3 text-[12px]">
                  <span className="text-text">{t(q.nom)}</span>
                  <kbd className="shrink-0 rounded border border-border bg-surface-2 px-1 text-[10px] text-text-dim">{q.tugma}</kbd>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
