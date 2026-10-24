import { useState } from 'react';
import { X } from 'lucide-react';
import { t } from '../../i18n/til';
import { kalitlar, tugmaMatni, type HotkeyDef } from './core';
import { faolSohalar, useHotkeys, useHotkeyVersiya } from './useHotkeys';

/**
 * `?` — barcha faol tugmalar ro'yxati (ixcham oyna). Ilovada BIR marta (AdminShell) ulanadi: sahifalar o'z qoidalarini
 * `useHotkeys` bilan ro'yxatdan o'tkazadi, shu yerda guruhlab ko'rsatiladi. Esc yoki `?` yopadi.
 */
export function HotkeyYordam() {
  const [ochiq, setOchiq] = useState(false);
  useHotkeyVersiya();
  useHotkeys('yordam', t('Yordam'), [{ id: 'yordam.och', keys: '?', nom: t('Barcha tugmalar ro‘yxati'), run: () => { setOchiq((v) => !v); } }]);
  useHotkeys('yordam-oyna', t('Yordam oynasi'), [{ id: 'yordam.yop', keys: 'esc', nom: t('Yopish'), inInput: true, run: () => { setOchiq(false); } }], ochiq);
  if (!ochiq) return null;
  const sohalar = faolSohalar().filter((s) => s.scope !== 'yordam-oyna' && s.defs.length);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={t('Klaviatura tugmalari')} onClick={() => setOchiq(false)}>
      <div className="karta max-h-[80vh] w-full max-w-xl overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-text">{t('Klaviatura tugmalari')}</h2>
          <button type="button" onClick={() => setOchiq(false)} aria-label={t('Yopish')} className="rounded p-1 text-text-mute hover:text-text"><X size={16} /></button>
        </div>
        <p className="mb-2 text-[11px] text-text-mute">{t('Matn kiritayotganda qisqa harf tugmalari ishlamaydi.')}</p>
        {sohalar.map((s) => (
          <section key={s.scope} className="mb-3">
            <h3 className="mb-1 text-[12px] font-semibold text-text-dim">{s.nom}</h3>
            <ul className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
              {s.defs.map((d: HotkeyDef) => (
                <li key={d.id} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="truncate text-text">{d.nom}</span>
                  <span className="flex shrink-0 gap-1">{kalitlar(d).slice(0, 2).map((k) => <kbd key={k} className="rounded border border-border bg-surface-2 px-1 text-[10px] text-text-dim">{tugmaMatni(k)}</kbd>)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {sohalar.length === 0 && <p className="text-[12px] text-text-mute">{t('Bu sahifada maxsus tugmalar yo‘q.')}</p>}
      </div>
    </div>
  );
}
