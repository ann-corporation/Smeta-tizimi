import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { omborLugatRoyxat, omborLugatTahrir, type OmborLugatAmal, type OmborLugatYozuv } from '../../api/t2-ombor';
import { omborXatoMatni } from './ombor-xato';

/**
 * Ombor lugati: tizim tushungan va omborchi tasdiqlagan iboralar (ibora -> mavjud material / yetkazuvchi nomi). Dublikatlarni birlashtirish, nomini ozgartirish, ochirish.
 * Server: /api/ombor-buyruq (lugat_royxat / lugat_tahrir) — web, Android, Telegram va Jarvis bir xil lugatdan foydalanadi. Yozuvga ruxsat faqat omborchida.
 */
const inp = 'h-[44px] w-full rounded-md border border-[var(--border-strong)] bg-bg px-3 text-[14px] text-text';
type Tur = 'material' | 'kontragent';

export function OmborLugat({ kompaniyaId, skladId, yozishMumkin }: { kompaniyaId: number; skladId: number; yozishMumkin: boolean }) {
  const [tur, setTur] = useState<Tur>('material');
  const [qator, setQator] = useState<OmborLugatYozuv[] | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [band, setBand] = useState(false);
  const [tanlangan, setTanlangan] = useState<number[]>([]);
  const [tahrir, setTahrir] = useState<{ id: number; v: string } | null>(null);
  const [yangi, setYangi] = useState({ ibora: '', kanonik: '' });
  const [birlash, setBirlash] = useState('');
  const avlod = useRef(0);

  const yukla = useCallback(async () => {
    const a = ++avlod.current;
    const r = await omborLugatRoyxat(kompaniyaId, skladId, tur);
    if (a !== avlod.current) return;
    if (!r.ok) { setXato(r.code === 'MIGRATSIYA_YOQ' ? t('Lugat hali ulanmagan.') : omborXatoMatni(r.code, r.xabar)); setQator([]); return; }
    setXato(null); setQator(r.qatorlar); setTanlangan([]);
  }, [kompaniyaId, skladId, tur]);
  useEffect(() => { setQator(null); void yukla(); }, [yukla]);
  useEffect(() => { const r = avlod; return () => { r.current++; }; }, []);

  const bajar = async (a: OmborLugatAmal, ok: string) => {
    setBand(true);
    const r = await omborLugatTahrir(kompaniyaId, skladId, a);
    setBand(false);
    if (!r.ok) { toast(omborXatoMatni(r.code, r.xabar), 'danger'); return; }
    toast(ok, 'ok'); setTahrir(null); setBirlash(''); setYangi({ ibora: '', kanonik: '' }); void yukla();
  };
  const bosh = (id: number) => setTanlangan((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id]));

  return <section className="flex flex-col gap-3" aria-label={t('Ombor lugati')}>
    <p className="m-0 text-[13px] text-text-mute">{t('Tizim tushungan va siz tasdiqlagan iboralar. Keyingi safar shu iboralar darhol topiladi.')}</p>
    <div className="flex gap-2" role="tablist">
      {(['material', 'kontragent'] as const).map((k) => <button key={k} type="button" role="tab" aria-selected={tur === k} onClick={() => setTur(k)}
        className={`fz-btn min-h-[40px] ${tur === k ? 'border-accent' : ''}`}>{k === 'material' ? t('Material') : t('Yetkazuvchi')}</button>)}
    </div>
    {xato && <p className="m-0 text-[13px] text-warn" role="alert">{xato}</p>}
    {qator === null && !xato && <LoaderCircle size={18} className="animate-spin" aria-label={t('Yuklanmoqda')} />}
    {qator && qator.length === 0 && !xato && <p className="m-0 text-[13px] text-text-mute">{t('Lugat hozircha bosh. Tasdiqlangan moslashuvlar shu yerda paydo boladi.')}</p>}
    {qator && qator.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[520px] border-collapse text-[13px]">
      <thead><tr className="text-left text-text-mute">{yozishMumkin && <th className="w-8" />}<th className="p-2">{t('Ibora')}</th><th className="p-2">{t('Mavjud nom')}</th><th className="p-2 text-right">{t('Ishlatilgan')}</th>{yozishMumkin && <th className="w-40" />}</tr></thead>
      <tbody>{qator.map((q) => <tr key={q.id} className="border-t border-border">
        {yozishMumkin && <td className="p-2"><input type="checkbox" aria-label={t('Birlashtirish uchun tanlash')} checked={tanlangan.includes(q.id)} onChange={() => bosh(q.id)} /></td>}
        <td className="p-2">{q.ibora}</td>
        <td className="p-2">{tahrir?.id === q.id
          ? <input className={inp} value={tahrir.v} maxLength={500} onChange={(e) => setTahrir({ id: q.id, v: e.target.value })} aria-label={t('Mavjud nom')} />
          : q.kanonik}</td>
        <td className="p-2 text-right">{q.soni}</td>
        {yozishMumkin && <td className="p-2"><div className="flex justify-end gap-1">
          {tahrir?.id === q.id
            ? <><button type="button" className="fz-btn min-h-[36px]" disabled={band || !tahrir.v.trim()} onClick={() => void bajar({ lugat_amal: 'nomla', yuk: { id: q.id, kanonik: tahrir.v.trim() } }, t('Saqlandi'))}>{t('Saqlash')}</button>
              <button type="button" className="fz-btn min-h-[36px]" onClick={() => setTahrir(null)}>{t('Bekor')}</button></>
            : <><button type="button" className="fz-btn min-h-[36px]" disabled={band} onClick={() => setTahrir({ id: q.id, v: q.kanonik })}>{t('Nomini ozgartirish')}</button>
              <button type="button" className="fz-btn min-h-[36px]" disabled={band} onClick={() => void bajar({ lugat_amal: 'ochir', yuk: { id: q.id } }, t('Olib tashlandi'))}>{t('Olib tashlash')}</button></>}
        </div></td>}
      </tr>)}</tbody></table></div>}
    {yozishMumkin && tanlangan.length > 1 && <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3">
      <input className={`${inp} flex-1`} value={birlash} maxLength={500} onChange={(e) => setBirlash(e.target.value)} placeholder={t('Birlashtirilgan nom')} aria-label={t('Birlashtirilgan nom')} />
      <button type="button" className="fz-btn min-h-[44px]" disabled={band || !birlash.trim()} onClick={() => void bajar({ lugat_amal: 'birlashtir', yuk: { ids: tanlangan, kanonik: birlash.trim() } }, t('Birlashtirildi'))}>{t('Birlashtirish')} ({tanlangan.length})</button>
    </div>}
    {yozishMumkin && <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3">
      <input className={`${inp} flex-1`} value={yangi.ibora} maxLength={200} onChange={(e) => setYangi({ ...yangi, ibora: e.target.value })} placeholder={t('Ibora')} aria-label={t('Ibora')} />
      <input className={`${inp} flex-1`} value={yangi.kanonik} maxLength={500} onChange={(e) => setYangi({ ...yangi, kanonik: e.target.value })} placeholder={t('Mavjud nom')} aria-label={t('Mavjud nom')} />
      <button type="button" className="fz-btn min-h-[44px]" disabled={band || !yangi.ibora.trim() || !yangi.kanonik.trim()} onClick={() => void bajar({ lugat_amal: 'qosh', yuk: { tur, ibora: yangi.ibora.trim(), kanonik: yangi.kanonik.trim() } }, t('Qoshildi'))}>{t('Qoshish')}</button>
    </div>}
  </section>;
}