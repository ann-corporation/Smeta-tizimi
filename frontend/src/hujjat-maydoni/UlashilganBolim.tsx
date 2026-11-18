/**
 * UlashilganBolim.tsx - «Ulashilgan» tabi: menga ulashilgan fayllar, men taqdim qilganlar, menga taqdim qilinganlar (ilgari alohida «Taqdimlar» tabi edi).
 * Kompaniyasiz foydalanuvchida faqat «Menga ulashilgan» (taqdim kompaniya fayllari uchun).
 */
import { useState } from 'react';
import { Download, Eye, FileText, Folder } from 'lucide-react';
import { t } from '../i18n/til';
import { hmDarajaNomi, hmOlUrl, type HmUlashilgan } from '../api/t2-hujjat-maydoni';
import { TaqdimPanel } from './TaqdimPanel';

export type UlashilganKichik = 'menga' | 'yuborilgan' | 'kelgan';

export function UlashilganBolim({ kompId, royxat, yuklanmoqda, onKorish }: {
  kompId: number | null; royxat: HmUlashilgan[]; yuklanmoqda: boolean; onKorish: (f: { id: number; nom: string }) => void;
}) {
  const [kichik, setKichik] = useState<UlashilganKichik>('menga');
  const tablar: Array<[UlashilganKichik, string]> = [['menga', 'Menga ulashilgan'], ...(kompId ? [['yuborilgan', 'Men taqdim qilganlar'] as [UlashilganKichik, string], ['kelgan', 'Menga taqdim qilinganlar'] as [UlashilganKichik, string]] : [])];
  return (
    <div>
      {tablar.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-1" role="tablist" aria-label={t('Ulashilgan bo‘limlari')}>
          {tablar.map(([k, nom]) => (
            <button key={k} type="button" role="tab" aria-selected={kichik === k} onClick={() => setKichik(k)}
              className={`rounded px-3 py-1 text-[12px] ${kichik === k ? 'bg-accent/15 font-semibold' : 'text-text-dim hover:bg-surface-2'}`}>{t(nom)}</button>))}
        </div>)}
      {kichik === 'menga' && (
        <table className="fz-table"><thead><tr><th>{t('Nomi')}</th><th>{t('Daraja')}</th><th>{t('Kim ulashdi')}</th><th /></tr></thead><tbody>
          {royxat.map((u) => (
            <tr key={u.turi + u.id}><td>{u.turi === 'papka' ? <Folder size={14} className="mr-1 inline" /> : <FileText size={14} className="mr-1 inline" />}{u.nom}</td><td>{t(hmDarajaNomi(u.daraja))}</td><td>{u.bergan ?? '—'}</td>
              <td className="text-right">{u.turi === 'fayl' && <><button type="button" className="fz-btn" aria-label={t('Ko‘rish')} onClick={() => onKorish({ id: u.id, nom: u.nom })}><Eye size={13} /></button>{' '}<a className="fz-btn" href={hmOlUrl(u.id)} aria-label={t('Yuklab olish')}><Download size={13} /></a></>}</td></tr>
          ))}
          {!royxat.length && !yuklanmoqda && <tr><td className="py-6 text-center text-text-mute" colSpan={4}>{t('Hali hech kim fayl ulashmagan.')}</td></tr>}
        </tbody></table>)}
      {kichik !== 'menga' && kompId && <TaqdimPanel kompaniyaId={kompId} yonalish={kichik} />}
    </div>
  );
}