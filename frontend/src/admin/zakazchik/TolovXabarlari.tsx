/**
 * TolovXabarlari.tsx — Forma-3 (qarz) bo'yicha to'lov xabari. Buyurtmachi: o'z to'lovini xabar qiladi (summa QQS bilan);
 * pudratchi: kelgan xabarni TASDIQLAYDI (→ t2_tolov, qarz hisobi bitta manbadan) yoki sabab bilan RAD etadi.
 * Buyurtmachi pudratchining to'lov jadvaliga yozmaydi — faqat xabar; qaror pudratchida. Ruxsat serverda.
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from '../../umumiy/ui/Toast';
import { Kiritma } from '../../umumiy/ui/Sahifa';
import { t } from '../../i18n/til';
import { tolovXabarBekor, tolovXabarlariOl, tolovXabarQarori, tolovXabarYoz, type BugunObyekt, type TolovXabari } from '../../api/t2-tomon';
import { Bolim } from './tomon-ui';
import { inp, pul, sana, tugma, tugmaAsosiy } from './tomon-yordam';

const HOLAT_NOMI: Record<TolovXabari['holat'], string> = { xabar: 'Pudratchi javobi kutilmoqda', tasdiqlangan: 'Pudratchi tasdiqladi', rad: 'Pudratchi rad etdi', bekor: 'Bekor qilindi' };
const HOLAT_RANG: Record<TolovXabari['holat'], string> = { xabar: 'fz-stamp--warn', tasdiqlangan: 'fz-stamp--ok', rad: 'fz-stamp--danger', bekor: 'fz-stamp--draft' };
const bugunISO = () => new Date().toISOString().slice(0, 10);

/** Buyurtmachi: to'lov xabarini yozish va o'zining xabarlari. `obyektlar` — portfeldagi (to'lov ruxsati bor) obyektlar. */
export function TolovXabariYozish({ kompaniyaId, obyektlar, tanlangan, onOzgardi }: { kompaniyaId: number; obyektlar: readonly BugunObyekt[]; tanlangan: number | null; onOzgardi: () => void }) {
  const [obyektId, setObyektId] = useState<number | ''>(tanlangan ?? '');
  const [summa, setSumma] = useState('');
  const [sanaV, setSanaV] = useState(bugunISO());
  const [raqam, setRaqam] = useState('');
  const [izoh, setIzoh] = useState('');
  const [band, setBand] = useState(false);
  const [royxat, setRoyxat] = useState<TolovXabari[]>([]);
  useEffect(() => { if (tanlangan != null) setObyektId(tanlangan); }, [tanlangan]);
  const ol = useCallback(async () => { const r = await tolovXabarlariOl(kompaniyaId, { yonalish: 'mendan' }); if (r.ok) setRoyxat(r.natija); }, [kompaniyaId]);
  useEffect(() => { void ol(); }, [ol]);
  const tolovBor = obyektlar.filter((o) => o.tolangan != null || o.f3 != null);
  const yubor = async () => {
    const s = Number(summa.replace(/\s/g, '').replace(',', '.'));
    if (obyektId === '') { toast(t('Obyektni tanlang'), 'danger'); return; }
    if (!Number.isFinite(s) || s <= 0) { toast(t('Summa noldan katta bo‘lishi kerak'), 'danger'); return; }
    setBand(true);
    const r = await tolovXabarYoz(kompaniyaId, { obyektId, summa: s, sana: sanaV, hujjatRaqam: raqam, izoh });
    setBand(false);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(t('To‘lov xabari pudratchiga yuborildi'), 'ok'); setSumma(''); setRaqam(''); setIzoh(''); void ol(); onOzgardi();
  };
  const bekor = async (id: number) => {
    const r = await tolovXabarBekor(kompaniyaId, id);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    void ol(); onOzgardi();
  };
  return (
    <Bolim sarlavha="To‘lov xabari (Forma-3 bo‘yicha)">
      {tolovBor.length === 0 ? <p className="text-sm text-text-dim">{t('Pudratchi hali sizga to‘lov holatini ochmagan — xabar yozish uchun u “Tomonlar aloqasi”da ruxsat berishi kerak.')}</p> : (
        <div className="grid gap-2 md:grid-cols-6">
          <label className="text-xs text-text-dim md:col-span-2">{t('Obyekt')}
            <select className={`${inp} mt-1 block w-full`} value={obyektId} onChange={(e) => setObyektId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">{t('— tanlang —')}</option>{tolovBor.map((o) => <option key={o.obyekt_id} value={o.obyekt_id}>{o.obyekt_nom} ({o.qarshi_nom})</option>)}</select></label>
          <label className="text-xs text-text-dim">{t('Summa (QQS bilan)')}<Kiritma tur="money" qiymat={summa} ozgardi={setSumma} /></label>
          <label className="text-xs text-text-dim">{t('Sana')}<input type="date" className={`${inp} mt-1 block w-full`} value={sanaV} onChange={(e) => setSanaV(e.target.value)} /></label>
          <label className="text-xs text-text-dim">{t('To‘lov topshiriq №')}<input className={`${inp} mt-1 block w-full`} value={raqam} onChange={(e) => setRaqam(e.target.value)} /></label>
          <div className="flex items-end"><button type="button" className={tugmaAsosiy} disabled={band} onClick={() => void yubor()}>{t('Xabar yuborish')}</button></div>
          <label className="text-xs text-text-dim md:col-span-6">{t('Izoh')}<input className={`${inp} mt-1 block w-full`} value={izoh} onChange={(e) => setIzoh(e.target.value)} /></label>
        </div>
      )}
      {royxat.length > 0 && (
        <ul className="mt-3 divide-y divide-border text-[13px]">{royxat.slice(0, 8).map((x) => (
          <li key={x.id} className="flex flex-wrap items-center gap-2 py-1.5">
            <span className="font-semibold">{pul(x.summa)}</span><span className="text-text-dim">{x.obyekt_nom ?? '—'} · {x.qarshi_nom ?? '—'} · {sana(x.sana)}</span>
            <span className={`fz-stamp ${HOLAT_RANG[x.holat]}`}>{t(HOLAT_NOMI[x.holat])}</span>
            {x.qaror_izoh && <span className="text-xs text-text-dim">{x.qaror_izoh}</span>}
            {x.holat === 'xabar' && <button type="button" className={`${tugma} ml-auto`} onClick={() => void bekor(x.id)}>{t('Bekor qilish')}</button>}
          </li>))}</ul>
      )}
    </Bolim>
  );
}

/** Pudratchi: kelgan to'lov xabarlari — tasdiqlash (t2_tolov ga yoziladi) yoki sabab bilan rad. Xabar bo'lmasa — hech narsa chizilmaydi. */
export function TolovXabarlariKelgan({ kompaniyaId }: { kompaniyaId: number }) {
  const [royxat, setRoyxat] = useState<TolovXabari[]>([]);
  const [sabab, setSabab] = useState<Record<number, string>>({});
  const [band, setBand] = useState(false);
  const ol = useCallback(async () => { const r = await tolovXabarlariOl(kompaniyaId, { yonalish: 'menga', holat: 'xabar' }); if (r.ok) setRoyxat(r.natija); }, [kompaniyaId]);
  useEffect(() => { void ol(); }, [ol]);
  if (royxat.length === 0) return null;
  const qaror = async (x: TolovXabari, q: 'tasdiq' | 'rad') => {
    if (q === 'rad' && (sabab[x.id] ?? '').trim().length < 3) { toast(t('Rad etish sababini yozing'), 'danger'); return; }
    setBand(true); const r = await tolovXabarQarori(kompaniyaId, x.id, q, sabab[x.id]); setBand(false);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(q === 'tasdiq' ? t('To‘lov tasdiqlandi va qarzga yozildi') : t('To‘lov xabari rad etildi'), 'ok'); void ol();
  };
  return (
    <Bolim sarlavha="Buyurtmachidan kelgan to‘lov xabarlari">
      <ul className="divide-y divide-border text-[13px]">{royxat.map((x) => (
        <li key={x.id} className="flex flex-wrap items-center gap-2 py-2">
          <span className="font-semibold">{pul(x.summa)}</span><span className="text-text-dim">{t('QQS bilan')} · {x.qarshi_nom ?? '—'} · {x.obyekt_nom ?? '—'} · {sana(x.sana)}{x.hujjat_raqam ? ` · № ${x.hujjat_raqam}` : ''}</span>
          <input className={`${inp} min-w-[180px] flex-1`} placeholder={t('Rad etish sababi')} value={sabab[x.id] ?? ''} onChange={(e) => setSabab({ ...sabab, [x.id]: e.target.value })} />
          <button type="button" className={tugmaAsosiy} disabled={band} onClick={() => void qaror(x, 'tasdiq')}>{t('Tasdiqlash')}</button>
          <button type="button" className={tugma} disabled={band} onClick={() => void qaror(x, 'rad')}>{t('Rad etish')}</button>
        </li>))}</ul>
    </Bolim>
  );
}
