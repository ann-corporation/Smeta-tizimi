/** Mijozlar ro'yxati: qidiruv (ism / telefon), bitimlar soni, rozilik belgisi; bosilsa — shu mijozning bitimlari (kanban qidiruvi). */
import { useDeferredValue, useState } from 'react';
import { Search } from 'lucide-react';
import { t } from '../../i18n/til';
import { telefonKorinish } from '../../lib/sotuv/bitim-korinish';
import { Sana } from './umumiy';
import { kirit, manbaNomi } from './sotuv-umumiy';
import { useMijozlar } from './sorovlar';

export function Mijozlar({ kid, bitimlariniOch }: { kid: number; bitimlariniOch: (telefon: string) => void }) {
  const [qidiruv, setQidiruv] = useState('');
  const q = useDeferredValue(qidiruv.trim());
  const m = useMijozlar(kid, q);
  return (
    <div className="flex flex-col gap-3">
      <label className="relative max-w-sm">
        <Search size={14} className="pointer-events-none absolute left-2 top-2.5 text-text-mute" aria-hidden="true" />
        <input className={`${kirit} pl-7`} value={qidiruv} onChange={(e) => setQidiruv(e.target.value)} placeholder={t('Ism yoki telefon')} aria-label={t('Qidiruv')} />
      </label>
      {m.isLoading && <p className="text-text-mute">{t('Yuklanmoqda…')}</p>}
      {m.error && <p className="fz-note fz-note--danger">{t((m.error as Error).message)}</p>}
      {m.data && !m.data.length && <p className="text-text-mute">{t('Mijoz topilmadi.')}</p>}
      {!!m.data?.length && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-[12.5px]">
            <thead className="bg-surface text-left text-text-mute">
              <tr><th className="px-2 py-1.5">{t('F.I.O.')}</th><th className="px-2">{t('Telefon')}</th><th className="px-2">{t('Manba')}</th><th className="px-2 text-right">{t('Bitimlar')}</th><th className="px-2">{t('Rozilik')}</th><th className="px-2">{t('Qo‘shilgan')}</th></tr>
            </thead>
            <tbody>
              {m.data.map((x) => (
                <tr key={x.id} className="cursor-pointer border-t border-border/50 hover:bg-surface-2" onClick={() => bitimlariniOch(x.telefon)}>
                  <td className="px-2 py-1"><button type="button" className="text-left font-medium text-accent" onClick={(e) => { e.stopPropagation(); bitimlariniOch(x.telefon); }}>{x.fio}</button></td>
                  <td className="px-2 tabular-nums">{telefonKorinish(x.telefon)}</td>
                  <td className="px-2">{manbaNomi(x.manba)}</td>
                  <td className="px-2 text-right tabular-nums">{x.bitim_soni}</td>
                  <td className="px-2">{x.rozilik ? <span className="text-ok">{t('Bor')}</span> : <span className="text-warn">{t('Yo‘q')}</span>}</td>
                  <td className="px-2"><Sana v={x.yaratildi} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
