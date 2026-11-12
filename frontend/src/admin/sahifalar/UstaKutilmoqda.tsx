/**
 * «Tasdiqlash kutilmoqda» — usta/brigadir telefondan kiritgan QORALAMA faktlar (prorab/PTO, fakt.write).
 * Tasdiq → mavjud fakt_yoz_v2 yo'li (obyekt+sana bo'yicha bitta hujjat); rad → sabab bilan qaytadi. Pul ko'rsatilmaydi.
 */
import { useCallback, useEffect, useState } from 'react';
import { yangiOperationId } from '../../api/supabase';
import { sbUstaQaror, sbUstaQoralamalarOl, ustaXatoMatni, type UstaQoralama } from '../../api/t2-usta';
import { hajmMatni } from '../../lib/usta/birlik';
import { naryadlarOl } from '../../api/t2-naryad';
import type { NaryadQisqa } from '../../lib/naryad';
import { toast } from '../../umumiy/ui/Toast';
import { t } from '../../i18n/til';

/** Tasdiqlanmagan qoralama shuncha kundan keyin ajratib ko'rsatiladi (muddat yo'q — faqat belgi; lead 2026-11-12). */
export const ESKIRGAN_KUN = 3;
export const qoralamaYoshi = (createdAt: string, hozir = Date.now()): number => { const t0 = Date.parse(createdAt); return Number.isFinite(t0) ? Math.floor((hozir - t0) / 86_400_000) : 0; };

export type UstaQatorNomi = { id: number; nom: string | null; birlik?: string | null };

export function UstaKutilmoqda({ kompaniyaId, obyektId, qatorlar, onTasdiqlandi }: {
  kompaniyaId: number; obyektId: number; qatorlar: readonly UstaQatorNomi[]; onTasdiqlandi?: () => void;
}) {
  const [royxat, setRoyxat] = useState<UstaQoralama[]>([]);
  const [band, setBand] = useState(false);
  /** Usta «Bajardim» deb yuborgan naryadlar — qabul MAVJUD naryad sahifasida (yangi qabul mantig'i yo'q). */
  const [naryadlar, setNaryadlar] = useState<NaryadQisqa[]>([]);
  const yukla = useCallback(async () => {
    const [r, nar] = await Promise.all([sbUstaQoralamalarOl(kompaniyaId, 'qoralama', obyektId), naryadlarOl(kompaniyaId, { obyektId, holat: 'bajarildi', limit: 20 }).catch(() => null)]);
    setRoyxat(r.ok ? (r.qatorlar ?? []) : []);
    setNaryadlar(nar ?? []);
  }, [kompaniyaId, obyektId]);
  useEffect(() => { void yukla(); }, [yukla]);

  const qaror = async (idlar: number[], q: 'tasdiqlangan' | 'rad') => {
    if (!idlar.length || band) return;
    let sabab: string | null = null;
    if (q === 'rad') { sabab = window.prompt(t('Nima uchun rad etasiz? (ustaga ko‘rinadi)')) ; if (sabab == null) return; }
    setBand(true);
    const r = await sbUstaQaror({ kompaniyaId, idlar, qaror: q, izoh: sabab, operationId: yangiOperationId() });
    setBand(false);
    if (!r.ok) { toast(t(ustaXatoMatni(r)), 'danger'); return; }
    toast(q === 'tasdiqlangan' ? t('Tasdiqlandi — faktga yozildi') : t('Rad etildi'), 'ok');
    setRoyxat((l) => l.filter((x) => !idlar.includes(x.id)));
    if (q === 'tasdiqlangan') onTasdiqlandi?.();
    void yukla();
  };

  if (!royxat.length && !naryadlar.length) return null;
  const nom = (id: number) => qatorlar.find((x) => x.id === id);
  return (
    <section className="fz-card flex flex-col gap-2 p-3" aria-label={t('Tasdiqlash kutilmoqda')} data-testid="usta-tasdiq-kutilmoqda">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-[14px] font-semibold text-text">{t('Tasdiqlash kutilmoqda')} ({royxat.length + naryadlar.length})</h3>
        {royxat.length > 0 && <button type="button" disabled={band} onClick={() => void qaror(royxat.map((x) => x.id), 'tasdiqlangan')} className="fz-btn fz-btn--primary fz-btn--sm">{t('Hammasini tasdiqlash')}</button>}
      </div>
      <p className="m-0 text-[12px] text-text-mute">{t('Usta va brigadirlar telefondan kiritgan hajmlar. Tasdiqlagach faktga o‘tadi.')}</p>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {naryadlar.map((n) => (
          <li key={`naryad-${n.id}`} data-testid="usta-naryad-kutilmoqda" className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface-2 px-2.5 py-1.5 text-[13px]">
            <span className="min-w-0 flex-1"><b className="text-text">{t('Naryad')} {n.raqam}</b><span className="ml-2 text-text-dim">{n.usta_nom} · {t('{n} ta ish bajarildi', { n: n.qator_soni })}</span></span>
            <a href={`/admin/naryad?id=${n.id}`} className="fz-btn fz-btn--primary fz-btn--sm">{t('Qabul')}</a>
          </li>))}
        {royxat.map((x) => { const q = nom(x.qator_id); const yosh = qoralamaYoshi(x.created_at); const eski = yosh >= ESKIRGAN_KUN; return (
          <li key={x.id} data-eskirgan={eski ? 'ha' : undefined} className={`flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-[13px] ${eski ? 'border-warn bg-warn-soft' : 'border-border bg-surface-2'}`}>
            <span className="min-w-0 flex-1"><b className="text-text">{q?.nom || `#${x.qator_id}`}</b>
              <span className="ml-2 text-text-dim">{hajmMatni(Number(x.hajm), q?.birlik)} · {x.sana}</span>
              {eski && <span className="block font-semibold text-warn">{t('Eskirgan: {n} kundan beri kutmoqda', { n: yosh })}</span>}
              {x.izoh && <span className="block text-text-mute">{x.izoh}</span>}
              {x.foto_hujjat_id != null && <span className="block text-text-mute">{t('Foto biriktirilgan')} (#{x.foto_hujjat_id})</span>}</span>
            <button type="button" disabled={band} onClick={() => void qaror([x.id], 'tasdiqlangan')} className="fz-btn fz-btn--sm">{t('Tasdiqlash')}</button>
            <button type="button" disabled={band} onClick={() => void qaror([x.id], 'rad')} className="fz-btn fz-btn--ghost fz-btn--sm">{t('Rad etish')}</button>
          </li>); })}
      </ul>
    </section>
  );
}
