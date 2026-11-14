/**
 * AosrFotoBiriktir.tsx - pudratchi АОСР ga foto biriktiradi (bajarilgan yashirin ish rasmlari). Rasmlar R2 ga yuklanadi (FotoYuklash),
 * so'ng t2_aosr_foto_biriktir_v1 orqali aktga ulanadi; texnadzor qaror oynasida ularni ko'radi.
 */
import { useState } from 'react';
import { toast } from '../../umumiy/ui/Toast';
import { aosrFotoBiriktir } from '../../api/t2-nazorat';
import { t } from '../../i18n/til';
import { FotoYuklash } from './FotoYuklash';

export function AosrFotoBiriktir({ kompaniyaId, aosrId }: { kompaniyaId: number; aosrId: number }) {
  const [ochiq, setOchiq] = useState(false);
  const [idlar, setIdlar] = useState<number[]>([]);
  const [band, setBand] = useState(false);
  async function saqla() {
    if (!idlar.length) return;
    setBand(true);
    const r = await aosrFotoBiriktir(kompaniyaId, aosrId, idlar);
    setBand(false);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(t('Foto aktga biriktirildi'), 'ok'); setIdlar([]); setOchiq(false);
  }
  if (!ochiq) return <button type="button" className="fz-btn fz-btn--sm" onClick={() => setOchiq(true)}>{t('Foto biriktirish')}</button>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <FotoYuklash kompaniyaId={kompaniyaId} idlar={idlar} onOzgardi={setIdlar} hujjatTuri="aosr_foto" max={20} />
      <button type="button" className="fz-btn fz-btn--sm fz-btn--primary" disabled={band || idlar.length === 0} onClick={() => void saqla()}>{t('Aktga biriktirish')}</button>
      <button type="button" className="fz-btn fz-btn--sm" onClick={() => { setOchiq(false); setIdlar([]); }}>{t('Bekor qilish')}</button>
    </span>
  );
}
