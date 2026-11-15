/**
 * KelganTakliflar — menga yuborilgan kompaniya takliflari (@username / telefon / email orqali). Qabul qilmaguncha a'zo emas.
 * Qabul qilingach serverda cookie yangilanadi va sahifa qayta yuklanadi (yangi kompaniya vakolatlari bilan).
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { kelganTakliflar, taklifJavob, usernameXatoMatn, type KelganTaklif } from '../../api/username';
import { ROLE_LABELS } from '../../lib/company-authorization/permission-labels';
import { Karta } from '../akkaunt/AkkauntUi';

export function KelganTakliflar({ yangila = () => window.location.reload() }: { yangila?: () => void }) {
  const [royxat, setRoyxat] = useState<KelganTaklif[] | null>(null);
  const [band, setBand] = useState<number | null>(null);

  useEffect(() => {
    let tirik = true;
    void kelganTakliflar().then((r) => { if (tirik) setRoyxat(r.ok ? r.royxat : []); });
    return () => { tirik = false; };
  }, []);

  if (!royxat || royxat.length === 0) return null;

  const javob = async (x: KelganTaklif, qabul: boolean) => {
    setBand(x.id);
    const r = await taklifJavob(x.id, qabul);
    setBand(null);
    if (!r.ok) { toast(usernameXatoMatn(r.code), 'danger'); return; }
    setRoyxat((l) => (l ?? []).filter((y) => y.id !== x.id));
    toast(qabul ? t('Kompaniyaga qo‘shildingiz') : t('Taklif rad etildi'), 'ok');
    if (qabul) yangila();
  };

  return (
    <Karta sarlavha="Kompaniyaga takliflar" tavsif="Sizni kompaniyaga taklif qilishdi. Qabul qilmaguncha a’zo bo‘lmaysiz.">
      <ul className="m-0 p-0 list-none flex flex-col gap-2">
        {royxat.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] last:border-0 pb-2">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-text">{x.kompaniya_nom}</div>
              <div className="text-[12px] text-text-dim">{t(ROLE_LABELS[x.rol] || x.rol)} · {x.taklif_qiluvchi.ism}{x.taklif_qiluvchi.username ? ` @${x.taklif_qiluvchi.username}` : ''}</div>
            </div>
            <button type="button" className="fz-btn fz-btn--primary fz-btn--sm" disabled={band === x.id} onClick={() => void javob(x, true)}>
              {band === x.id ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : null}{t('Qabul qilish')}
            </button>
            <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" disabled={band === x.id} onClick={() => void javob(x, false)}>{t('Rad etish')}</button>
          </li>
        ))}
      </ul>
    </Karta>
  );
}