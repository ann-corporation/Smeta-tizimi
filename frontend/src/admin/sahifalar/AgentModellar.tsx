/**
 * AgentModellar.tsx — har ishchi agentning ROLI, RUXSAT REJIMI va ISHLATAYOTGAN MODELI ko'rinadi; ruxsati bor foydalanuvchi modelni tanlaydi.
 * Katalogni faqat platforma superadmini boshqaradi (kompaniya ixtiyoriy model nomini kirita olmaydi).
 */
import { useCallback, useEffect, useState } from 'react';
import { modelTanla, modellarOl, type ModellarJavobi } from '../../api/t2-agent-ish';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';

const MANBA: Record<string, string> = { kompaniya: 'Kompaniya tanlovi', platforma: 'Platforma tanlovi', standart: 'Server standarti' };
const REJIM: Record<string, string> = { read_only: 'Faqat o‘qish', command_prepare: 'Buyruq tayyorlaydi', human_approval_required: 'Odam tasdig‘i shart' };

export function AgentModellar({ kompaniyaId, tizim }: { kompaniyaId: number | null; tizim: boolean }) {
  const [d, setD] = useState<ModellarJavobi | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const k = tizim ? null : kompaniyaId;

  const yukla = useCallback(async () => {
    setXato(null);
    const r = await modellarOl(k);
    if (r.ok) setD(r.natija); else { setD(null); setXato(r.error); }
  }, [k]);
  useEffect(() => { void yukla(); }, [yukla]);

  const tanla = async (profil: string, modelId: string) => {
    const r = await modelTanla(k, profil, modelId || null);
    if (r.ok) { toast(t('Model saqlandi'), 'ok'); void yukla(); } else toast(r.error, 'danger');
  };

  if (xato) return <p className="text-xs text-text-dim">{t('Modellar ro‘yxati mavjud emas')}: {xato}</p>;
  if (!d) return <p className="text-xs text-text-dim">{t('Yuklanmoqda…')}</p>;
  const nomi = (id: string | null) => (id ? d.katalog.find((m) => m.id === id)?.nom ?? id : t('Server standarti'));
  return (
    <section className="space-y-2" aria-label={t('Agent modellari')}>
      <h2 className="text-sm font-semibold">{tizim ? t('Tizim agentlari va modellari') : t('Ishchi agentlar va modellari')}</h2>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs text-text-dim">
            <tr><th className="px-3 py-2">{t('Agent')}</th><th className="px-3 py-2">{t('Rejim')}</th><th className="px-3 py-2">{t('Doira')}</th><th className="px-3 py-2">{t('Model')}</th></tr>
          </thead>
          <tbody>
            {d.agentlar.map((a) => (
              <tr key={a.kod} className="border-t border-border align-top">
                <td className="px-3 py-2"><div className="font-medium">{a.nom || a.kod}</div><div className="text-xs text-text-dim">{a.rol}</div></td>
                <td className="px-3 py-2 text-xs">{t(REJIM[a.permission_mode] ?? a.permission_mode)}</td>
                <td className="px-3 py-2 text-xs">{a.default_scope}</td>
                <td className="px-3 py-2">
                  {d.tanlash_mumkin ? (
                    <select aria-label={`${t('Model')} — ${a.nom || a.kod}`} className="rounded border border-border bg-surface px-2 py-1 text-xs" value={a.model_id ?? ''} onChange={(e) => void tanla(a.kod, e.target.value)}>
                      <option value="">{t('Server standarti')}</option>
                      {d.katalog.map((m) => <option key={m.id} value={m.id}>{m.nom}{m.vision ? ' 👁' : ''}</option>)}
                    </select>
                  ) : <span className="text-xs">{nomi(a.model_id)}</span>}
                  <div className="mt-1 text-[10px] text-text-mute">{t(MANBA[a.model_manba] ?? a.model_manba)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!d.tanlash_mumkin && <p className="text-xs text-text-dim">{t('Modelni admin, boss yoki direktor o‘zgartira oladi.')}</p>}
    </section>
  );
}
