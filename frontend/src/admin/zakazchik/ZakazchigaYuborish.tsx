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
import { TAQDIM_MANBA_JADVAL, taqdimQabulRollari } from '../../lib/hujjat-dvigatel';
import { HolatBelgi } from './tomon-ui';
import { useYuborilganTaqdim } from './taqdim-holat-hook';
import { inp, tugma, tugmaAsosiy } from './tomon-yordam';

/** Qaysi resurslar shu tugma bilan yuboriladi va manba jadvali — yagona hujjat dvigateli reestridan (lib/hujjat-dvigatel). */
export type YuboriladiganResurs = keyof typeof TAQDIM_MANBA_JADVAL;
const JADVAL: Record<YuboriladiganResurs, string> = TAQDIM_MANBA_JADVAL;

/** «Kimga» ro'yxati: faqat shu hujjat turini qabul qila oladigan rolli faol aloqalar (reestrdan; reestrda yo'q bo'lsa — hammasi). */
export function qabulQiluvchilar(aloqalar: readonly Aloqa[], resurs: string): Aloqa[] {
  const rollar = taqdimQabulRollari(resurs);
  return aloqalar.filter((a) => a.holat === 'faol' && (!rollar || rollar.includes(a.qarshi_rol)));
}


/** Hujjatda aniqlangan kamchiliklar bilan yuborishda aniq ogohlantirish + ongli tasdiq (kamchilik yo'q bo'lsa — hech narsa). */
function kamchilikOgohlantirish(kamchiliklar: readonly string[], tasdiq: boolean, setTasdiq: (v: boolean) => void) {
  if (kamchiliklar.length === 0) return null;
  return (
    <div role="alert" className="fz-note fz-note--warn space-y-1" data-testid="yuborish-kamchilik">
      <p className="text-xs font-semibold">{t('Hujjatda {n} ta kamchilik bor', { n: kamchiliklar.length })}</p>
      <ul className="list-disc pl-4 text-[11px]">{kamchiliklar.slice(0, 5).map((k) => <li key={k}>{t(k)}</li>)}</ul>
      <label className="flex items-center gap-1.5 text-[11px]"><input type="checkbox" checked={tasdiq} onChange={(e) => setTasdiq(e.target.checked)} />{t('Kamchiliklar bilan yuboraman')}</label>
    </div>
  );
}

export function ZakazchigaYuborish({ kompaniyaId, aktId, resurs = 'f2', kamchiliklar = [], onYuborildi }: { kompaniyaId: number | null | undefined; aktId: number; resurs?: YuboriladiganResurs; kamchiliklar?: readonly string[]; onYuborildi?: () => void }) {
  const [ochiq, setOchiq] = useState(false);
  const [aloqalar, setAloqalar] = useState<Aloqa[]>([]);
  const [tanlov, setTanlov] = useState<number | ''>('');
  const [izoh, setIzoh] = useState('');
  const [band, setBand] = useState(false);
  const [kamchilikTasdiq, setKamchilikTasdiq] = useState(false);
  const routerBor = useInRouterContext();
  const { taqdim, yangila } = useYuborilganTaqdim(kompaniyaId, JADVAL[resurs], aktId);
  if (!kompaniyaId) return null;

  const och = async () => {
    setOchiq(true);
    const r = await aloqalarOl(kompaniyaId);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    setKamchilikTasdiq(false);
    const faol = qabulQiluvchilar(r.natija, resurs);
    setAloqalar(faol);
    setTanlov(faol.length === 1 ? faol[0].id : '');
  };
  const yubor = async () => {
    if (tanlov === '' || (kamchiliklar.length > 0 && !kamchilikTasdiq)) return;
    setBand(true); const r = await taqdimYubor(kompaniyaId, tanlov, resurs, aktId, izoh); setBand(false);
    if (!r.ok) {
      /* «Taraf aloqa yo'q» kabi xato sababi tushuntiriladi (audit 115): faol aloqa o'rnatilmagan. */
      toast(/aloqa/i.test(String(r.error)) ? t('Tanlangan tomon bilan faol aloqa yo‘q — avval «Buyurtmachi bilan aloqa o‘rnatish» ni bajaring.') : r.error, /aloqa/i.test(String(r.error)) ? 'warn' : 'danger');
      return;
    }
    toast(resurs === 'aosr' ? t('АОСР yuborildi — buyurtmachi / texnadzor qarori kutilmoqda') : t('F2 yuborildi — zakazchik qarori kutilmoqda'), 'ok');
    setOchiq(false); setIzoh(''); void yangila(); onYuborildi?.();
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
            <div className="space-y-2">
              <p className="text-xs text-text-dim">{t('Yuborib bo‘lmaydi: bu hujjatni qabul qiladigan tomon (buyurtmachi yoki texnadzor) bilan faol aloqa yo‘q. Hujjat faqat aloqadagi tomonga yuboriladi.')}</p>
              {routerBor && <Link to="/admin/aloqalar" className={`${tugmaAsosiy} inline-block no-underline`}>{t('Buyurtmachi bilan aloqa o‘rnatish')}</Link>}
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-xs text-text-dim">{t('Kimga')}
                <select className={`${inp} mt-1 block w-full`} value={tanlov} onChange={(e) => setTanlov(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">{t('— tanlang —')}</option>
                  {aloqalar.map((a) => <option key={a.id} value={a.id}>{a.qarshi_nom} ({a.qarshi_rol})</option>)}
                </select></label>
              <label className="block text-xs text-text-dim">{t('Izoh')}
                <textarea className={`${inp} mt-1 block h-14 w-full`} value={izoh} onChange={(e) => setIzoh(e.target.value)} /></label>
              {kamchilikOgohlantirish(kamchiliklar, kamchilikTasdiq, setKamchilikTasdiq)}
              <p className="text-[11px] text-text-dim">{t('Yuborilgach hujjat zakazchikka ochiladi va tahrirlanmaydi; qaror — zakazchikda.')}</p>
            </div>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className={tugma} onClick={() => setOchiq(false)}>{t('Yopish')}</button>
            {aloqalar.length > 0 && <button type="button" className={tugmaAsosiy} disabled={band || tanlov === '' || (kamchiliklar.length > 0 && !kamchilikTasdiq)} onClick={() => void yubor()}>{t('Yuborish')}</button>}
          </div>
        </div>
      )}
    </span>
  );
}
