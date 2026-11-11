/**
 * ZakazchigaYuborish.tsx — hujjatni faol aloqadagi tomonga (buyurtmachi / texnik nazorat) RASMIY yuborish:
 *   resurs 'f2'   — ichki tasdiqlangan F2;  resurs 'aosr' — qoralama АОСР (/admin/aosr).
 * Yuborish = hujjatni qarshi tomon ko'rishiga ochish + qaror kutish. Qarshi tomon uni tahrirlay olmaydi; qaror o'zgarmaydi.
 * Tugma yonida holat doim ko'rinadi: yuborilgan / ko'rib chiqilmoqda / QAYTARILDI (izoh bilan) / qabul qilindi.
 * Qaytarilgan bo'lsa — «Qayta yuborish»; qabul qilingan bo'lsa — faqat belgi. Server ham hamma narsani tekshiradi.
 */
import { useState } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import { Send } from 'lucide-react';
import { toast } from '../../umumiy/ui/Toast';
import { aloqalarOl, taqdimYubor, type Aloqa } from '../../api/t2-tomon';
import { t } from '../../i18n/til';
import { HolatBelgi } from './tomon-ui';
import { useYuborilganTaqdim } from './taqdim-holat-hook';
import { inp, tugma, tugmaAsosiy } from './tomon-yordam';

export type YuboriladiganResurs = 'f2' | 'aosr';
const JADVAL: Record<YuboriladiganResurs, string> = { f2: 't2_akt', aosr: 't2_aosr' };


export function ZakazchigaYuborish({ kompaniyaId, aktId, resurs = 'f2' }: { kompaniyaId: number | null | undefined; aktId: number; resurs?: YuboriladiganResurs }) {
  const [ochiq, setOchiq] = useState(false);
  const [aloqalar, setAloqalar] = useState<Aloqa[]>([]);
  const [tanlov, setTanlov] = useState<number | ''>('');
  const [izoh, setIzoh] = useState('');
  const [band, setBand] = useState(false);
  const routerBor = useInRouterContext();
  const { taqdim, yangila } = useYuborilganTaqdim(kompaniyaId, JADVAL[resurs], aktId);
  if (!kompaniyaId) return null;

  const och = async () => {
    setOchiq(true);
    const r = await aloqalarOl(kompaniyaId);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    const faol = r.natija.filter((a) => a.holat === 'faol');
    setAloqalar(faol);
    setTanlov(faol.length === 1 ? faol[0].id : '');
  };
  const yubor = async () => {
    if (tanlov === '') return;
    setBand(true); const r = await taqdimYubor(kompaniyaId, tanlov, resurs, aktId, izoh); setBand(false);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(resurs === 'aosr' ? t('АОСР yuborildi — buyurtmachi / texnadzor qarori kutilmoqda') : t('F2 yuborildi — zakazchik qarori kutilmoqda'), 'ok');
    setOchiq(false); setIzoh(''); void yangila();
  };

  const holat = taqdim?.holat ?? null;
  const qaytardi = holat === 'tuzatish' || holat === 'rad';   // qarshi tomon qaytardi — tuzatib qayta yuboriladi
  const yubora = holat == null || qaytardi || holat === 'qaytarilgan';
  const belgi = taqdim && holat !== 'qaytarilgan' ? <HolatBelgi holat={taqdim.holat} turi="taqdim" /> : null;

  return (
    <span className="relative inline-flex flex-wrap items-center gap-1.5">
      {belgi && (routerBor
        ? <Link to={`/admin/taqdimlar?id=${taqdim!.id}&yonalish=yuborilgan`} className="no-underline" title={t('Buyurtmachi bilan yozishma va qaror')}>{belgi}</Link>
        : belgi)}
      {qaytardi && taqdim?.qaror_izoh && (
        <span role="status" className="max-w-[260px] truncate text-[11px] text-warn" title={taqdim.qaror_izoh}>{t('Qaytardi')}: {taqdim.qaror_izoh}</span>
      )}
      {yubora && (
        <button type="button" onClick={() => void och()} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-text">
          <Send size={13} />{qaytardi ? t('Qayta yuborish') : t('Zakazchikka yuborish')}</button>
      )}
      {ochiq && (
        <div role="dialog" aria-label={t('Zakazchikka yuborish')} className="absolute right-0 top-full z-30 mt-1 w-80 rounded-lg border border-border bg-surface p-3 text-left shadow-xl">
          {aloqalar.length === 0 ? (
            <p className="text-xs text-text-dim">{t('Faol aloqa yo‘q. Avval “Tomonlar aloqasi” sahifasida zakazchik bilan ulaning.')}</p>
          ) : (
            <div className="space-y-2">
              <label className="block text-xs text-text-dim">{t('Kimga')}
                <select className={`${inp} mt-1 block w-full`} value={tanlov} onChange={(e) => setTanlov(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">{t('— tanlang —')}</option>
                  {aloqalar.map((a) => <option key={a.id} value={a.id}>{a.qarshi_nom} ({a.qarshi_rol})</option>)}
                </select></label>
              <label className="block text-xs text-text-dim">{t('Izoh')}
                <textarea className={`${inp} mt-1 block h-14 w-full`} value={izoh} onChange={(e) => setIzoh(e.target.value)} /></label>
              <p className="text-[11px] text-text-dim">{t('Yuborilgach hujjat zakazchikka ochiladi va tahrirlanmaydi; qaror — zakazchikda.')}</p>
            </div>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className={tugma} onClick={() => setOchiq(false)}>{t('Yopish')}</button>
            {aloqalar.length > 0 && <button type="button" className={tugmaAsosiy} disabled={band || tanlov === ''} onClick={() => void yubor()}>{t('Yuborish')}</button>}
          </div>
        </div>
      )}
    </span>
  );
}
