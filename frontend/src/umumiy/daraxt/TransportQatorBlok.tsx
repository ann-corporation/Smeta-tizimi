import { useState } from 'react';
import { t } from '../../i18n/til';
import { TRANSPORT_USULLAR, type TransportUsul } from '../../lib/transport-yoy/kirish';
import { USUL_NOMI, type TransportBelgi, type TransportBelgilaFn } from '../../lib/transport-yoy/panel';
import { transportXatoMatni } from '../../api/transport-api';

/** Qator tafsilotidagi «Transport turini o'zgartirish» (faqat material qatori): bitta tanlov + bitta tugma. */
export function TransportQatorBlok({ qatorId, belgi, onBelgila }: {
  qatorId: number; belgi: TransportBelgi | undefined;
  onBelgila: TransportBelgilaFn;
}) {
  const hozir: TransportUsul = belgi?.usul ?? 'foiz';
  const [tanlov, setTanlov] = useState<TransportUsul>(hozir);
  const [band, setBand] = useState(false);
  const [xabar, setXabar] = useState<{ ok: boolean; matn: string } | null>(null);
  const ozgardi = tanlov !== hozir;
  const saqla = async () => {
    setBand(true); setXabar(null);
    const r = await onBelgila(qatorId, tanlov);
    setBand(false);
    setXabar(r.ok ? { ok: true, matn: t('Transport turi o‘zgartirildi') } : { ok: false, matn: t(transportXatoMatni(r.code, r.xabar)) });
  };
  return (
    <div className="rounded-md border border-border bg-surface-2 p-3" data-testid="transport-qator-blok">
      <p className="fz-panel__h">{t('Transport turi')}</p>
      <p className="mt-1 text-[11.5px] text-text-mute">{t('Bitta material uchun bitta usul — transport ikki marta hisoblanmaydi.')}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select className="fz-input" aria-label={t('Transport turini o‘zgartirish')} value={tanlov} disabled={band} onChange={(e) => { setTanlov(e.target.value as TransportUsul); setXabar(null); }}>
          {TRANSPORT_USULLAR.map((u) => <option key={u} value={u}>{t(USUL_NOMI[u])}</option>)}
        </select>
        <button type="button" className="fz-btn fz-btn--sm fz-btn--primary" disabled={band || !ozgardi} onClick={() => void saqla()}>{band ? t('Saqlanmoqda…') : t('Saqlash')}</button>
      </div>
      {xabar && <p role={xabar.ok ? 'status' : 'alert'} className={`mt-2 text-[12px] ${xabar.ok ? 'text-ok' : 'text-danger'}`}>{xabar.matn}</p>}
    </div>
  );
}
