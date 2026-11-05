import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calculator, FileUp, ShieldAlert } from 'lucide-react';
import { F2Oyna } from './F2Oyna';
import { F2StornoOyna, type F2StornoAkt } from './F2StornoOyna';
import { F2PodvalBackfillOyna } from './F2PodvalBackfillOyna';
import { aktPodvallariniOl } from '../../api/t2-akt-podval';
import type { StornoReestrAkt } from '../../lib/f2-storno';
import { t } from '../../i18n/til';

type PodvalHolat = 'tekshir' | 'bor' | 'yoq' | 'xato';

/** Pereraschet yo'li: F2 tayyorlash shu qoralamani ochadi, storno bloki tepada, yangi hajmlar pastda. */
const pereraschetManzil = (obyektId: number, aktId: number, manbaAktId: number) =>
  `/admin/f2-tayyorlash?obyekt=${obyektId}&akt=${aktId}&pereraschet=${manbaAktId}`;

/**
 * BIR TUGMALI PERERASCHET (egasi 2026-11-05): tasdiqlangan F2 dan —
 *  (a) hujjat podvali (`t2_akt_podval`) bo'lmasa, avval «F2 podvalini fayldan tiklash» (podvalsiz davom — faqat ongli ogohlantirish bilan);
 *  (b) storno qoralamasi `F2StornoOyna` mantig'i bilan (ikki marta storno himoyasi, qayta urinish), fakt SUKUT bo'yicha «o'zgartirma»
 *      (pereraschet — fakt allaqachon to'g'ri);
 *  (c) yaratilgach to'g'ri F2 tayyorlashga: `?akt=<yangi qoralama>` — yangi plyus hajmlar fakt bo'yicha storno bloki ostida.
 */
export function PereraschetOyna(p: { obyektId: number; kompaniyaId: number | null; akt: F2StornoAkt; reestr: readonly StornoReestrAkt[]; onYop: () => void }) {
  const navigate = useNavigate();
  const [podval, setPodval] = useState<PodvalHolat>('tekshir');
  const [tiklash, setTiklash] = useState(false);
  const [podvalsizRozi, setPodvalsizRozi] = useState(false);
  const [podvalsiz, setPodvalsiz] = useState(false);

  const tekshir = useCallback(async () => {
    setPodval('tekshir');
    try {
      const r = await aktPodvallariniOl(p.obyektId);
      if (!r.ok) { setPodval('xato'); return; }
      setPodval(r.podvallar.some((x) => x.akt_id === p.akt.id && (x.blok ?? '') === '') ? 'bor' : 'yoq');
    } catch { setPodval('xato'); }
  }, [p.obyektId, p.akt.id]);
  useEffect(() => { void tekshir(); }, [tekshir]);

  const raqam = p.akt.raqam || String(p.akt.id);
  if (tiklash && p.kompaniyaId) {
    return <F2PodvalBackfillOyna obyektId={p.obyektId} kompaniyaId={p.kompaniyaId} onYop={() => setTiklash(false)} onTugadi={() => { setTiklash(false); void tekshir(); }} />;
  }
  if (podval === 'bor' || podvalsiz) {
    return (
      <F2StornoOyna obyektId={p.obyektId} akt={p.akt} reestr={p.reestr} faktRejimSukut="ozgartirma" onYop={p.onYop}
        onYaratildi={(id) => navigate(pereraschetManzil(p.obyektId, id, p.akt.id))} />
    );
  }
  return (
    <F2Oyna label={t('Pereraschet')} onYop={p.onYop} kenglik={640}>
      <div className="fz-card__head" style={{ padding: '10px 16px' }}><h3 className="fz-card__title"><Calculator size={15} aria-hidden="true" /> {t('Pereraschet: F2 №{r}', { r: raqam })}</h3></div>
      <div className="space-y-3 p-4 text-[13px]" data-testid="pereraschet-oyna">
        {podval === 'tekshir' && <div className="skel min-h-[80px] rounded-xl" />}
        {podval === 'xato' && (
          <p role="alert" className="fz-note fz-note--danger"><ShieldAlert />{t('Hujjat podvali o‘qilmadi. Qayta urinib ko‘ring.')}
            <button type="button" className="fz-btn fz-btn--sm" onClick={() => void tekshir()}>{t('Qayta urinib ko‘rish')}</button></p>
        )}
        {podval === 'yoq' && (
          <>
            <p data-testid="pereraschet-podval-yoq" className="fz-note fz-note--warn"><ShieldAlert />{t('F2 №{r} ning hujjat podvali (ustama foizlari) saqlanmagan. Eski F2 minus bloki to‘g‘ri hisoblanishi uchun avval podvalni asl F2 faylidan tiklang.', { r: raqam })}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="pereraschet-podval-tiklash" className="fz-btn fz-btn--primary" disabled={!p.kompaniyaId} onClick={() => setTiklash(true)}><FileUp aria-hidden="true" />{t('F2 podvalini fayldan tiklash')}</button>
            </div>
            <label className="flex items-start gap-1.5 text-text-dim">
              <input type="checkbox" data-testid="pereraschet-podvalsiz-rozi" checked={podvalsizRozi} onChange={(e) => setPodvalsizRozi(e.target.checked)} />
              <span>{t('Podvalsiz davom etaman: eski F2 minus bloki SMETA podvali bilan hisoblanadi va asl F2 summasidan farq qilishi mumkin.')}</span>
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="fz-btn fz-btn--ghost" onClick={p.onYop}>{t('Yopish')}</button>
              <button type="button" data-testid="pereraschet-podvalsiz" className="fz-btn" disabled={!podvalsizRozi} onClick={() => setPodvalsiz(true)}>{t('Podvalsiz davom etish')}</button>
            </div>
          </>
        )}
      </div>
    </F2Oyna>
  );
}

export default PereraschetOyna;
