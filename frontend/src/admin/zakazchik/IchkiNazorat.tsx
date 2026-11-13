/**
 * IchkiNazorat.tsx — pudratchida «Ichki nazorat»: kompaniya sozlamasi (sukut O'CHIQ, bloklamaydi) va ichki tekshiruv navbati.
 * Yoqilgan bo'lsa ichki qabulsiz hujjat tashqariga yuborilmaydi; tashqi tomon faqat «ichki nazoratdan o'tgan: ha/yo'q, kim, qachon» ni ko'radi.
 */
import { useCallback, useEffect, useState } from 'react';
import { ichkiNavbatOl, ichkiQaror, nazoratSozlamaOl, nazoratSozlamaSaqla, type IchkiNavbat, type NazoratSozlama } from '../../api/t2-tomon';
import { toast } from '../../umumiy/ui/Toast';
import { t } from '../../i18n/til';
import { Bolim } from './tomon-ui';
import { inp, tugma, tugmaAsosiy } from './tomon-yordam';

export default function IchkiNazorat({ kompaniyaId }: { kompaniyaId: number }) {
  const [s, setS] = useState<NazoratSozlama | null>(null);
  const [navbat, setNavbat] = useState<IchkiNavbat>([]);
  const [izoh, setIzoh] = useState<Record<number, string>>({});

  const ol = useCallback(async () => {
    const [a, b] = await Promise.all([nazoratSozlamaOl(kompaniyaId), ichkiNavbatOl(kompaniyaId)]);
    if (a.ok) setS(a.natija);
    if (b.ok) setNavbat(b.natija);
  }, [kompaniyaId]);
  useEffect(() => { void ol(); }, [ol]);

  const almashtir = async (v: boolean) => {
    const r = await nazoratSozlamaSaqla(kompaniyaId, { ichkiMajburiy: v });
    if (r.ok) await ol(); else toast(r.error, 'danger');
  };
  const qaror = async (id: number, resurs: string, manba: number, q: 'qabul' | 'rad') => {
    const matn = (izoh[id] ?? '').trim();
    if (q === 'rad' && matn.length < 3) { toast(t('Rad etish uchun sabab yozing'), 'warn'); return; }
    const r = await ichkiQaror(kompaniyaId, resurs, manba, q, matn);
    if (r.ok) await ol(); else toast(r.error, 'danger');
  };

  return (
    <Bolim sarlavha="Ichki nazorat">
      <label className="flex items-center gap-2 text-[13px] mb-2">
        <input type="checkbox" checked={s?.ichki_majburiy ?? false} onChange={(e) => void almashtir(e.target.checked)} data-testid="ichki-majburiy" />
        {t('Hujjat tashqariga yuborilishidan oldin ichki nazoratdan o‘tsin')}
      </label>
      <p className="text-xs text-text-dim mb-2">{t('Sukut: o‘chiq (yuborishni to‘smaydi). Yoqilsa ichki tasdiqsiz hujjat buyurtmachi/texnadzorga ketmaydi.')}</p>
      <ul className="divide-y divide-border text-[13px]" data-testid="ichki-navbat">
        {navbat.map((x) => (
          <li key={x.id} className="py-2 flex flex-wrap gap-2 items-center">
            <b>{x.resurs} #{x.manba_id}</b><span className="text-text-dim">{x.izoh}</span>
            <input className={`${inp} flex-1 min-w-0`} value={izoh[x.id] ?? ''} placeholder={t('Izoh (rad uchun majburiy)')} aria-label={t('Izoh')} onChange={(e) => setIzoh((m) => ({ ...m, [x.id]: e.target.value }))} />
            <button type="button" className={tugmaAsosiy} onClick={() => void qaror(x.id, x.resurs, x.manba_id, 'qabul')}>{t('Ichki nazoratdan o‘tdi')}</button>
            <button type="button" className={tugma} onClick={() => void qaror(x.id, x.resurs, x.manba_id, 'rad')}>{t('Rad etish')}</button>
          </li>))}
        {navbat.length === 0 && <li className="py-2 text-text-dim">{t('Ichki tekshiruv navbati bo‘sh')}</li>}
      </ul>
    </Bolim>
  );
}
