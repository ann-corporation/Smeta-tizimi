import { useEffect, useState } from 'react';
import { t } from '../i18n/til';
import { OpsMaydon, OpsOyna } from '../components/kompaniya-ops/OpsUi';
import { MoneyInput } from '../umumiy/ui/MoneyInput';
import { INP, raqamYoki } from './format';

export type Maydon = {
  k: string; nom: string; tur: 'matn' | 'son' | 'pul' | 'sana' | 'tanlov' | 'ha_yoq'; majburiy?: boolean; izoh?: string;
  variantlar?: Array<{ v: string; nom: string }>; keng?: boolean;
};
type Qiymat = Record<string, unknown>;
type Saqla = { (data: Qiymat): Promise<void> };

/** Deklarativ forma: son maydonlari bo'sh bo'lsa null (kiritilmagan) yuboriladi — 0 emas. */
export function FormOyna({ ochiq, sarlavha, maydonlar, boshlangich, onSaqla, onYop, kenglik = 560 }: {
  ochiq: boolean; sarlavha: string; maydonlar: Maydon[]; boshlangich: Qiymat; kenglik?: number;
  onSaqla: Saqla; onYop: () => void;
}) {
  const [v, setV] = useState<Record<string, string>>({});
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');
  useEffect(() => {
    if (!ochiq) return;
    setV(Object.fromEntries(maydonlar.map((m) => [m.k, boshlangich[m.k] == null ? '' : String(boshlangich[m.k])])));
    setXato('');
  }, [ochiq, boshlangich, maydonlar]);

  const saqla = async () => {
    const data: Qiymat = { ...(boshlangich.id != null ? { id: boshlangich.id, versiya: boshlangich.versiya } : {}) };
    for (const m of maydonlar) {
      const s = (v[m.k] ?? '').trim();
      if (m.majburiy && s === '') { setXato(t('«{nom}» majburiy', { nom: m.nom })); return; }
      if (m.tur === 'son' || m.tur === 'pul') {
        const n = raqamYoki(s);
        if (s !== '' && n == null) { setXato(t('«{nom}» raqam bo‘lishi kerak', { nom: m.nom })); return; }
        if (n != null && n < 0) { setXato(t('«{nom}» manfiy bo‘lmasligi kerak', { nom: m.nom })); return; }
        data[m.k] = n;
      } else if (m.tur === 'ha_yoq') data[m.k] = s === 'ha';
      else data[m.k] = s === '' ? null : s;
    }
    setBand(true); setXato('');
    try { await onSaqla(data); onYop(); } catch (e) { setXato(e instanceof Error ? e.message : t('Saqlab bo‘lmadi')); } finally { setBand(false); }
  };

  return (
    <OpsOyna ochiq={ochiq} sarlavha={sarlavha} onYop={onYop} band={band} kenglik={kenglik}
      amallar={<>
        <button type="button" className="fz-btn" onClick={onYop} disabled={band}>{t('Bekor')}</button>
        <button type="button" className="fz-btn fz-btn--primary" onClick={() => void saqla()} disabled={band}>{band ? t('Saqlanmoqda…') : t('Saqlash')}</button>
      </>}>
      {xato && <div role="alert" className="rounded-lg border border-danger px-3 py-2 text-[12px] text-danger">{xato}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {maydonlar.map((m) => (
          <div key={m.k} className={m.keng ? 'sm:col-span-2' : ''}>
            <OpsMaydon nom={m.nom} majburiy={m.majburiy} izoh={m.izoh}>
              {m.tur === 'tanlov' || m.tur === 'ha_yoq' ? (
                <select className={INP} value={v[m.k] ?? ''} onChange={(e) => setV({ ...v, [m.k]: e.target.value })}>
                  {m.tur === 'ha_yoq'
                    ? <><option value="yoq">{t('Yo‘q')}</option><option value="ha">{t('Ha')}</option></>
                    : <>{!m.majburiy && <option value="">{t('— tanlanmagan —')}</option>}{m.variantlar?.map((o) => <option key={o.v} value={o.v}>{o.nom}</option>)}</>}
                </select>
              ) : m.tur === 'pul' ? (
                <MoneyInput className={INP} value={v[m.k] ?? ''} placeholder={t('kiritilmagan')} onValueChange={(raw) => setV({ ...v, [m.k]: raw })} />
              ) : (
                <input className={INP} type={m.tur === 'sana' ? 'date' : 'text'} inputMode={m.tur === 'son' ? 'decimal' : undefined} value={v[m.k] ?? ''}
                  placeholder={m.tur === 'son' ? t('kiritilmagan') : undefined} onChange={(e) => setV({ ...v, [m.k]: e.target.value })} />
              )}
            </OpsMaydon>
          </div>
        ))}
      </div>
    </OpsOyna>
  );
}
