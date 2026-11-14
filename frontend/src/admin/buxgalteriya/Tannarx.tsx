import { useState } from 'react';
import { Undo2 } from 'lucide-react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { yangiOperationId } from '../../api/supabase';
import { buxTannarx, buxXato, type TannarxNatija } from '../../api/t2-bux-hisob';
import { Izoh, Son, XatoQator } from './umumiy';
import { kirit, td, th } from './yordamchi';

function oylar(n = 6, d = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; });
}

/** Tannarx (себестоимость): davr yopishdan oldin obyekt xarajatini (2010) daromad tan olingan obyektlar uchun sotilgan tannarxga (9110) o'tkazish. Ko'rik → yozish; bekor = storno. */
export function Tannarx({ kid, onOzgardi, tasdiqlaydi }: { kid: number; onOzgardi: () => void; tasdiqlaydi: boolean }) {
  const [oy, setOy] = useState(oylar()[0]);
  const [d, setD] = useState<TannarxNatija | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [band, setBand] = useState(false);

  const yur = async (amal: 'yop' | 'bekor', dry: boolean) => {
    setBand(true);
    const r = await buxTannarx({ kompaniyaId: kid, oy, amal, dry, operationId: yangiOperationId() });
    setBand(false);
    if (!r.ok) { setXato(buxXato(r)); setD(null); return; }
    setXato(null); setD(r);
    if (!dry) { toast(amal === 'yop' ? t('Tannarx yozildi: {n} ta obyekt', { n: r.soni ?? 0 }) : t('Tannarx bekor qilindi (storno): {n} ta obyekt', { n: r.soni ?? 0 }), 'ok'); onOzgardi(); }
  };

  return (
    <div className="space-y-3">
      <XatoQator xato={xato} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold">{t('Tannarx (себестоимость) — davr yopish qadami')}</span>
        <Izoh matn={t('Daromad (Forma-3) tan olingan obyektning xarajati (hisob 2010) sotilgan tannarxga (9110) o‘tkaziladi. Usul — T: buxgalter bilan tasdiqlang. Avval ko‘rik, keyin yozish; xarajat o‘zgarsa qayta yurgizish farqni yozadi, «Bekor» — storno. Oyni yopishdan OLDIN bajaring.')} />
        <select aria-label={t('Oy')} className={`${kirit} w-32`} value={oy} onChange={(e) => { setOy(e.target.value); setD(null); }}>{oylar().map((o) => <option key={o} value={o}>{o}</option>)}</select>
        <button type="button" className="fz-btn" disabled={band} onClick={() => void yur('yop', true)}>{t('Ko‘rik')}</button>
        {tasdiqlaydi && <button type="button" className="fz-btn" disabled={band || !d || !d.dry || (d.soni ?? 0) === 0} onClick={() => void yur('yop', false)}>{t('Tannarxni yozish')}</button>}
        {tasdiqlaydi && <button type="button" className="fz-btn" disabled={band} title={t('Shu oygacha yozilgan tannarxni qaytaradi (storno)')} onClick={() => void yur('bekor', false)}><Undo2 size={13} /> {t('Bekor')}</button>}
      </div>
      {d && (
        <div className="overflow-x-auto" role="status">
          <p className="mb-1 text-[12px] text-text-mute">{t('Obyektlar: {n}; jami farq:', { n: d.soni ?? 0 })} <Son v={d.jami ?? 0} /> ({d.dt} / {d.kt})</p>
          <table className="w-full min-w-[560px] text-[12.5px]" aria-label={t('Tannarx ko‘rigi')}>
            <thead><tr className="text-left text-[11px] uppercase text-text-mute"><th className={th}>{t('Obyekt')}</th><th className={`${th} text-right`}>{t('Xarajat (2010)')}</th><th className={`${th} text-right`}>{t('Daromad')}</th><th className={`${th} text-right`}>{t('Avval o‘tkazilgan')}</th><th className={`${th} text-right`}>{t('Yoziladi')}</th></tr></thead>
            <tbody>
              {(d.qatorlar ?? []).length === 0 && <tr><td colSpan={5} className="px-2 py-4 text-center text-text-mute">{t('O‘zgarish yo‘q.')}</td></tr>}
              {(d.qatorlar ?? []).map((q) => (
                <tr key={q.obyekt_id} className="border-t border-border/50"><td className={td}>#{q.obyekt_id}</td><td className={`${td} text-right`}><Son v={q.xarajat} /></td><td className={`${td} text-right`}><Son v={q.daromad} /></td><td className={`${td} text-right`}><Son v={q.avval} /></td><td className={`${td} text-right`}><Son v={q.farq} qalin /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
