/**
 * QatorIzohlari.tsx - taqdim qilingan F2 aktning HAR QATORIGA izoh (P4 t2_izoh). Buyurtmachi yozadi, pudratchi (PTO) o'z
 * ekranida ko'radi, javob beradi va "hal qilindi" deb belgilaydi. Asl akt qatori o'zgarmaydi. Ruxsat serverda:
 * buyurtmachi faqat o'ziga TAQDIM qilingan aktga yoza oladi; ichki izoh (aloqasiz) faqat akt egasi tenantda ko'rinadi.
 */
import { useState } from 'react';
import { toast } from '../../umumiy/ui/Toast';
import { qatorIzohHal, qatorIzohYoz, type QatorIzoh } from '../../api/t2-tomon';
import { t } from '../../i18n/til';
import { inp, sana, tugma, tugmaAsosiy } from './tomon-yordam';

export function QatorIzohTugma({ soni, jami, ochiq, onClick }: { soni: number; jami: number; ochiq: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={ochiq} className={`rounded border px-1.5 py-0.5 text-[11px] hover:border-accent ${soni > 0 ? 'border-warn/50 text-warn' : 'border-border text-text-dim'}`}>
      {jami === 0 ? t('Izoh') : soni > 0 ? `${t('Izoh')}: ${soni}` : `${t('Izoh')} ✓ ${jami}`}
    </button>
  );
}

export function QatorIzohMuloqot({ kompaniyaId, aloqaId, aktQatorId, izohlar, ichkiMumkin, yangila }: {
  kompaniyaId: number; aloqaId: number; aktQatorId: number; izohlar: QatorIzoh[]; ichkiMumkin: boolean; yangila: () => void;
}) {
  const [matn, setMatn] = useState('');
  const [ota, setOta] = useState<number | null>(null);
  const [ichki, setIchki] = useState(false);
  const [band, setBand] = useState(false);

  const yubor = async () => {
    if (!matn.trim()) return;
    setBand(true);
    const r = await qatorIzohYoz(kompaniyaId, { aloqaId: ichki ? null : aloqaId, aktQatorId, matn, otaIzohId: ota });
    setBand(false);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    setMatn(''); setOta(null); yangila();
  };
  const hal = async (i: QatorIzoh) => {
    setBand(true); const r = await qatorIzohHal(kompaniyaId, i.id, i.versiya, i.holat === 'faol'); setBand(false);
    if (!r.ok) { toast(r.error, 'danger'); yangila(); return; }
    yangila();
  };

  return (
    <div className="space-y-2 bg-surface-2/40 px-2 py-2">
      {izohlar.length === 0 && <p className="text-xs text-text-dim">{t('Bu qatorga hali izoh yo‘q')}</p>}
      <ul className="space-y-1">{izohlar.map((i) => (
        <li key={i.id} className={`rounded border px-2 py-1 text-xs ${i.ota_izoh_id ? 'ml-4' : ''} ${i.holat === 'hal_qilingan' ? 'border-ok/40 opacity-70' : 'border-border'}`}>
          <div className="flex flex-wrap items-center gap-2 text-text-dim">
            <b className="text-text">{i.kompaniya_nom ?? '—'}</b><span className="tabular-nums">{sana(i.yaratildi)}</span>
            {i.ichki && <span className="rounded bg-surface-2 px-1">{t('ichki')}</span>}
            {i.holat === 'hal_qilingan' && <span className="text-ok">{t('hal qilindi')}</span>}
          </div>
          <div className="whitespace-pre-wrap">{i.matn}</div>
          <div className="mt-1 flex gap-2">
            {!i.ichki && <button type="button" className="text-accent underline" disabled={band} onClick={() => setOta(i.id)}>{t('Javob yozish')}</button>}
            <button type="button" className="text-accent underline" disabled={band} onClick={() => void hal(i)}>{i.holat === 'faol' ? t('Hal qilindi') : t('Qayta ochish')}</button>
          </div>
        </li>))}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[220px] flex-1 text-[11px] text-text-dim">{ota ? t('Javob') : t('Yangi izoh')}
          <textarea className={`${inp} mt-1 block h-14 w-full text-xs`} value={matn} maxLength={4000} onChange={(e) => setMatn(e.target.value)} placeholder={t('Shu qator bo‘yicha izoh yozing')} /></label>
        {ichkiMumkin && <label className="flex items-center gap-1 text-[11px] text-text-dim"><input type="checkbox" checked={ichki} onChange={(e) => setIchki(e.target.checked)} />{t('Ichki (buyurtmachiga ko‘rinmaydi)')}</label>}
        {ota && <button type="button" className={tugma} onClick={() => setOta(null)}>{t('Javobni bekor qilish')}</button>}
        <button type="button" className={tugmaAsosiy} disabled={band || !matn.trim()} onClick={() => void yubor()}>{t('Yuborish')}</button>
      </div>
    </div>
  );
}
