import { useState } from 'react';
import { Ban, ShieldAlert } from 'lucide-react';
import { F2Oyna } from './F2Oyna';
import { FmtN } from '../../lib/format';
import { davrNomi } from '../../lib/f2-hujjat-korinish';
import { t, tilLocale } from '../../i18n/til';
import { f2LifecycleError } from '../../lib/f2-lifecycle-workflow';
import { f2BekorBajar, type F2BekorAkt, type F2BekorNatija } from '../../lib/f2-bekor';
import { yangiOperationId } from '../../api/supabase';
import { t2AktLifecycleTransition } from '../../api/t2-akt-lifecycle';

export type F2BekorOynaAkt = F2BekorAkt & { oy: string | null; hujjat_jami: number | null; qator_soni: number | null };

/**
 * F2 ni bekor qilish oynasi (shu oynada, yangi sahifa yo'q): akt raqami / oy / summa / qatorlar soni, majburiy sabab,
 * foydalanuvchi ko'rgan versiya bilan (CAS). Bir nechta akt — ketma-ket, birinchi xatoda to'xtaydi.
 */
export function F2BekorOyna(p: {
  kompaniyaId: number; aktlar: readonly F2BekorOynaAkt[];
  onYop: () => void; onTugadi: (n: F2BekorNatija) => void;
}) {
  const [sabab, setSabab] = useState('');
  const [band, setBand] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [xato, setXato] = useState('');
  const tasdiqlanganSoni = p.aktlar.filter((a) => a.lifecycle_status === 'approved').length;

  async function bajar() {
    if (!sabab.trim()) { setXato(t('Bekor qilish sababi majburiy.')); return; }
    setBand(true); setXato('');
    const n = await f2BekorBajar(p.aktlar, sabab, (a) => t2AktLifecycleTransition({
      kompaniyaId: p.kompaniyaId, aktId: a.id, toStatus: 'cancelled', expectedVersion: a.versiya,
      operationId: yangiOperationId(), reason: sabab.trim(),
    }), (i, j) => setProgress([i, j]));
    setBand(false);
    if (n.xato) {
      const akt = p.aktlar.find((a) => a.id === n.xato?.aktId);
      setXato(`${t('F2 №{r}', { r: akt?.raqam || String(n.xato.aktId) })}: ${t(f2LifecycleError(n.xato.code ?? undefined))}`
        + (n.bajarildi.length ? ` ${t('({n} tasi bekor qilindi)', { n: n.bajarildi.length })}` : ''));
    }
    p.onTugadi(n);
  }

  return (
    <F2Oyna label={t('F2 ni bekor qilish')} onYop={band ? undefined : p.onYop} kenglik={620}>
      <div className="fz-card__head" style={{ padding: '10px 16px' }}><h3 className="fz-card__title"><Ban size={15} aria-hidden="true" /> {t('F2 ni bekor qilish')}</h3></div>
      <div className="space-y-3 p-4 text-[13px]">
        <table className="w-full text-[12.5px]">
          <thead><tr className="text-left text-text-dim"><th>{t('Raqam')}</th><th>{t('Davr')}</th><th className="text-right">{t('Summa')}</th><th className="text-right">{t('Qatorlar')}</th><th>{t('Holat')}</th></tr></thead>
          <tbody>
            {p.aktlar.map((a) => (
              <tr key={a.id} data-testid="f2-bekor-akt">
                <td>№ {a.raqam || '—'}</td>
                <td>{davrNomi(a.oy ?? '', tilLocale()) || '—'}</td>
                <td className="text-right"><FmtN val={a.hujjat_jami} kasr={0} /></td>
                <td className="text-right">{a.qator_soni ?? '—'}</td>
                <td>{a.lifecycle_status === 'approved' ? t('Tasdiqlangan') : t(a.lifecycle_status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {tasdiqlanganSoni > 0 && <p className="fz-note fz-note--warn"><ShieldAlert />{t('{n} ta tasdiqlangan F2 bekor qilinadi: hujjat va qatorlari tarixda qoladi, lekin LRV, qoldiq va Nakopitelniy jamilaridan chiqadi.', { n: tasdiqlanganSoni })}</p>}
        <label className="block text-xs text-text-dim">{t('Bekor qilish sababi (majburiy)')}
          <textarea data-boshlang-fokus aria-label={t('Bekor qilish sababi')} value={sabab} onChange={(e) => setSabab(e.target.value)} rows={2} maxLength={2000} className="mt-1 block w-full" placeholder={t('Masalan: yangi smetaga qayta import')} />
        </label>
        {progress && band && <p className="text-text-dim">{t('{i} / {j} bekor qilindi…', { i: progress[0], j: progress[1] })}</p>}
        {xato && <p role="alert" className="fz-note fz-note--danger"><ShieldAlert />{xato}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="fz-btn fz-btn--ghost" onClick={p.onYop} disabled={band}>{t('Yopish')}</button>
          <button type="button" className="fz-btn fz-btn--danger" onClick={() => void bajar()} disabled={band || !sabab.trim()}>
            {band ? '…' : t('{n} ta F2 ni bekor qilish', { n: p.aktlar.length })}
          </button>
        </div>
      </div>
    </F2Oyna>
  );
}

export default F2BekorOyna;
