import { useRef, useState } from 'react';
import { omborTahlilMatn, omborTasdiq, type OmborTanlov, type OmborBuyruqNatija, type OmborXato } from '../../api/t2-ombor';
import { NatijaBlok } from '../../components/ombor/OmborKiritish';
import { omborXatoMatni } from '../../components/ombor/ombor-xato';
import { t } from '../../i18n/til';
import type { WarehouseSnapshot } from './warehouse-command';

export function WarehouseCard({ snapshot, onDone }: { snapshot: WarehouseSnapshot; onDone: (text: string) => void }) {
  const [warehouse, setWarehouse] = useState(snapshot.warehouseId);
  const [result, setResult] = useState(snapshot.result as OmborBuyruqNatija | OmborXato | null);
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  const [extra, setExtra] = useState('');
  const command = useRef(snapshot.question), selection = useRef<OmborTanlov>({});
  const regime = useRef<'bilan' | 'siz' | undefined>(undefined), locked = useRef(false);
  const run = async (confirm = false, id = warehouse, choice?: OmborTanlov, mode?: 'bilan' | 'siz', append = false) => {
    if (locked.current || done || id == null || !snapshot.warehouses.some(w => w.id === id && w.kompaniya_id === snapshot.company && w.yozish)) return;
    const token = result?.ok && result.holat === 'tasdiq_kerak' ? result.token : undefined;
    if (confirm && !token) return;
    locked.current = true; setBusy(true); setError(null);
    if (choice) selection.current = { ...selection.current, ...choice };
    if (mode) regime.current = mode;
    if (append && extra.trim()) { command.current += '\n' + extra.trim(); setExtra(''); }
    try {
      if (confirm) {
        const r = await omborTasdiq(snapshot.company, id, token!);
        if (!r.ok) { setError(omborXatoMatni(r.code, r.xabar)); return; }
        setDone(true); onDone(t('Yozildi'));
      } else {
        setResult(null);
        const r = await omborTahlilMatn(snapshot.company, id, command.current, selection.current, regime.current);
        if (!r.ok) { setError(omborXatoMatni(r.code, r.xabar)); return; }
        setResult(r);
      }
    } catch { setError(omborXatoMatni('NETWORK')); }
    finally { locked.current = false; setBusy(false); }
  };
  if (done) return null;
  const natija = result?.ok ? result : null;
  const missing = natija && !['tasdiq_kerak', 'javob', 'hisobot'].includes(natija.holat);
  return <div className="flex flex-col gap-2" aria-busy={busy}>
    {warehouse == null && snapshot.warehouses.filter(w => w.kompaniya_id === snapshot.company && w.yozish).map(w =>
      <button type="button" className="fz-btn" key={w.id} disabled={busy} onClick={() => { if (locked.current) return; setWarehouse(w.id); void run(false, w.id); }}>{w.nomi}</button>)}
    {(error || (result && !result.ok)) && <p role="alert">{error ?? (result && !result.ok ? omborXatoMatni(result.code, result.xabar) : '')}</p>}
    <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0">
      {natija && <NatijaBlok natija={natija} band={busy || natija.preview?.narx_rejim_sorov === true} onTasdiq={() => void run(true)} onBekor={() => { if (!locked.current) setDone(true); }}
        onTanlov={g => void run(false, warehouse, { nomi: g.nomi, birligi: g.birligi })}
        onVariant={v => void run(false, warehouse, v)} onRejim={r => void run(false, warehouse, undefined, r)} />}
      {missing && <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void run(false, warehouse, undefined, undefined, true); }}>
        <input aria-label={t('Material yoki buyruq')} maxLength={Math.max(0, 999 - command.current.length)} value={extra} onChange={e => setExtra(e.target.value)} />
        <button type="submit" className="fz-btn" disabled={!extra.trim()}>{t('Tushun')}</button>
      </form>}
      {warehouse != null && (!natija || error) && <button type="button" className="fz-btn" onClick={() => void run()}>{t('Tushun')}</button>}
    </fieldset>
  </div>;
}
