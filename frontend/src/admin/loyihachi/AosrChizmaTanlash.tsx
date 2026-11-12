/**
 * AosrChizmaTanlash.tsx — АОСР «Chizmalar № / sana» maydonini JORIY chizma revizyasidan to'ldirish.
 * Pudratchi shu aktga tayangan chizmalarni tanlaydi (revizya server tomonda joriyga bog'lanadi); matn avtomatik yig'iladi,
 * chizma yangilansa — bog'lanish «eskirgan» deb ko'rsatiladi va bir bosishda yangilanadi. Ruxsat serverda.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '../../umumiy/ui/Toast';
import { chizmaBoglash, chizmaTaasiriOl, chizmalarOl, type Boglanish, type ToplamKorinishi } from '../../api/t2-loyihachi';
import { aosrLoyihaHujjatiMatni, joriyRevizyasi } from '../../lib/loyihachi/chizma-yadro';
import { t } from '../../i18n/til';

export function AosrChizmaTanlash({ kompaniyaId, obyektId, aosrId, onToldir }: { kompaniyaId: number; obyektId: number; aosrId: number | undefined; onToldir: (matn: string) => void }) {
  const [toplamlar, setToplamlar] = useState<ToplamKorinishi[]>([]);
  const [boglanishlar, setBoglanishlar] = useState<Boglanish[]>([]);
  const [tanlangan, setTanlangan] = useState<number | ''>('');
  const [band, setBand] = useState(false);
  const yukla = useCallback(async () => {
    const [a, b] = await Promise.all([chizmalarOl(kompaniyaId, obyektId), chizmaTaasiriOl(kompaniyaId, obyektId)]);
    if (a.ok) setToplamlar(a.natija.toplamlar.filter((x) => !x.egasi));
    if (b.ok) setBoglanishlar(b.natija.boglanishlar);
  }, [kompaniyaId, obyektId]);
  useEffect(() => { void yukla(); }, [yukla]);

  const mening = useMemo(() => boglanishlar.filter((b) => aosrId != null && b.aosr_id === aosrId), [boglanishlar, aosrId]);
  const eskirgan = mening.filter((b) => b.joriy != null && b.ishlatilgan < b.joriy);
  const sanaOl = (toplamId: number, revizya: number) => toplamlar.find((x) => x.id === toplamId)?.revizyalar.find((r) => r.revizya === revizya)?.ruxsat_vaqti ?? null;

  const bog = async (toplamId: number, revizya: number) => {
    if (aosrId == null) return false;
    const r = await chizmaBoglash(kompaniyaId, { toplamId, revizya, obyektId, aosrId, harakat: 'qosh' });
    if (!r.ok) { toast(r.error, 'danger'); return false; }
    return true;
  };
  const qosh = async () => {
    const x = toplamlar.find((q) => q.id === tanlangan); const j = x && joriyRevizyasi(x.revizyalar);
    if (!x || !j) { toast(t('Bu chizmaning chiqarilgan revizyasi yo‘q'), 'warn'); return; }
    setBand(true); if (await bog(x.id, j.revizya)) await yukla(); setBand(false); setTanlangan('');
  };
  const hammasiniYangila = async () => {
    setBand(true);
    for (const b of eskirgan) if (!(await bog(b.toplam_id, b.joriy!))) break;
    await yukla(); setBand(false);
  };
  const toldir = () => {
    const matn = aosrLoyihaHujjatiMatni(mening.map((b) => {
      const rev = b.joriy ?? b.ishlatilgan;
      return { marka: b.marka, varaq: b.varaq, bosqich: b.bosqich, revizya: rev, sana: sanaOl(b.toplam_id, rev) };
    }));
    if (!matn) { toast(t('Avval chizmani tanlab qo‘shing'), 'warn'); return; }
    onToldir(matn);
  };

  if (aosrId == null) return <p className="text-[11px] text-text-dim">{t('Chizmadan to‘ldirish uchun avval aktni saqlang')}</p>;
  if (toplamlar.length === 0 && mening.length === 0) return null;
  return (
    <div className="mt-1 space-y-1 rounded border border-border p-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={t('Chizma')} className="h-7 px-1 text-[12px]" value={tanlangan} onChange={(e) => setTanlangan(e.target.value ? Number(e.target.value) : '')}>
          <option value="">{t('— chizma tanlang —')}</option>
          {toplamlar.filter((x) => joriyRevizyasi(x.revizyalar)).map((x) => <option key={x.id} value={x.id}>{x.marka}-{x.varaq} ({x.bosqich})</option>)}</select>
        <button type="button" className="fz-btn fz-btn--sm" disabled={band || tanlangan === ''} onClick={() => void qosh()}>{t('Joriy revizya bilan qo‘shish')}</button>
        <button type="button" className="fz-btn fz-btn--sm fz-btn--primary" disabled={mening.length === 0} onClick={toldir}>{t('Maydonni chizmadan to‘ldirish')}</button>
      </div>
      {mening.length > 0 && <div className="text-text-dim">{mening.map((b) => `${b.marka}-${b.varaq} rev.${b.ishlatilgan}`).join('; ')}</div>}
      {eskirgan.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-warn">
          {t('Chizma yangilangan — akt eski revizyaga tayangan')}: {eskirgan.map((b) => `${b.marka}-${b.varaq} (${b.ishlatilgan} → ${b.joriy})`).join('; ')}
          <button type="button" className="fz-btn fz-btn--sm" disabled={band} onClick={() => void hammasiniYangila()}>{t('Joriy revizyaga yangilash')}</button>
        </div>)}
    </div>
  );
}
