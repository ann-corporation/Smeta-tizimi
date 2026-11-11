import { useEffect, useState } from 'react';
import { Truck } from 'lucide-react';
import { toast } from '../../umumiy/ui/Toast';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { IJROCHI_QADAM } from '../../lib/yetkazuvchi/buyurtma-holat';
import {
  buyurtmaOlishYoz, buyurtmaOtish, buyurtmaTafsilotOl, buyurtmaXatosi, buyurtmalarOl, type BuyurtmaQator, type BuyurtmaRoyxatQator,
} from '../../api/t2-buyurtma';
import { BuyurtmaChip } from './BuyurtmaChip';
import { kompaniyaNomi, useFaolAloqalar } from './aloqalar';

/**
 * «Menga kelgan buyurtmalar» (yetkazuvchi kabineti): har holatda BITTA asosiy tugma -
 * Qabul qilish > Bajarishni boshlash > Tayyor > Topshirdim. «Tayyor» dan oldin baza olib ketish joyini talab qiladi:
 * ombor/manzil so'raladi (faqat kerak bo'lganda). Yakuniy qabulni xaridor beradi (yetkazuvchi shu yerda kutadi).
 */
export function BuyurtmaKabinet({ kompaniyaId }: { kompaniyaId: number }) {
  const aloqalar = useFaolAloqalar(kompaniyaId);
  const [qatorlar, setQatorlar] = useState<BuyurtmaRoyxatQator[] | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [kalit, setKalit] = useState(0);
  const [bandId, setBandId] = useState<number | null>(null);
  const [olishId, setOlishId] = useState<number | null>(null);
  const [manzil, setManzil] = useState('');
  const [ochiq, setOchiq] = useState<number | null>(null);
  const [tarkib, setTarkib] = useState<BuyurtmaQator[] | null>(null);

  useEffect(() => {
    let bekor = false;
    void buyurtmalarOl({ kompaniyaId, yonalish: 'menga', limit: 100 }).then((r) => {
      if (bekor) return;
      if (r.ok) { setQatorlar(r.qatorlar); setXato(null); } else { setXato(r.error); setQatorlar((q) => q ?? []); }
    });
    return () => { bekor = true; };
  }, [kompaniyaId, kalit]);
  const qaytaYukla = () => setKalit((k) => k + 1);

  const tarkibniKoz = async (b: BuyurtmaRoyxatQator) => {
    if (ochiq === b.id) { setOchiq(null); return; }
    setOchiq(b.id); setTarkib(null);
    const r = await buyurtmaTafsilotOl(kompaniyaId, b.id);
    if (r.ok) setTarkib(r.qatorlar); else { toast(t(r.error), 'danger'); setOchiq(null); }
  };

  const qadam = async (b: BuyurtmaRoyxatQator, ga: BuyurtmaRoyxatQator['holat']) => {
    setBandId(b.id);
    try {
      const r = await buyurtmaOtish(kompaniyaId, { buyurtmaId: b.id, kutilganVersiya: b.versiya, holat: ga });
      if (!r.ok) {
        if (r.code === 'OLISH_KERAK') { setOlishId(b.id); setManzil(''); return; }
        toast(t(buyurtmaXatosi(r)), 'danger');
        if (r.code === 'VERSIYA_ESKI') qaytaYukla();
        return;
      }
      toast(t('Saqlandi'), 'ok');
      setOlishId(null);
      qaytaYukla();
    } finally { setBandId(null); }
  };

  const olishVaTayyor = async (b: BuyurtmaRoyxatQator) => {
    const m = manzil.trim();
    if (!m) { toast(t('Qayerdan olib ketilishini kiriting.'), 'warn'); return; }
    setBandId(b.id);
    try {
      const o = await buyurtmaOlishYoz(kompaniyaId, { buyurtmaId: b.id, kutilganVersiya: b.versiya, olish: { manzil: m } });
      if (!o.ok) { toast(t(buyurtmaXatosi(o)), 'danger'); if (o.code === 'VERSIYA_ESKI') qaytaYukla(); return; }
      const r = await buyurtmaOtish(kompaniyaId, { buyurtmaId: b.id, kutilganVersiya: o.versiya ?? b.versiya + 1, holat: 'tayyor' });
      if (!r.ok) { toast(t(buyurtmaXatosi(r)), 'danger'); qaytaYukla(); return; }
      toast(t('Saqlandi'), 'ok');
      setOlishId(null);
      qaytaYukla();
    } finally { setBandId(null); }
  };

  return (
    <section className="fz-panel" aria-label={t('Menga kelgan buyurtmalar')}>
      <div className="fz-panel__h"><span className="inline-flex items-center gap-2"><Truck size={14} />{t('Menga kelgan buyurtmalar')}</span><span>{qatorlar?.length ?? ''}</span></div>
      {xato && <p className="fz-note" role="alert">{xato}</p>}
      {qatorlar === null ? <div className="skel h-12 rounded" /> : qatorlar.length === 0 ? (
        <p className="text-[12.5px] text-text-mute">{t('Hozircha sizga buyurtma kelmagan.')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {qatorlar.map((b) => {
            const q = IJROCHI_QADAM[b.holat];
            const band = bandId === b.id;
            return (
              <li key={b.id} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="fz-c-shifr">{'#' + b.id}</span>{' '}
                    <span className="font-medium">{kompaniyaNomi(aloqalar, b.xaridor_kompaniya_id)}</span>{' '}
                    <span className="text-[12px] text-text-mute">{t('Qatorlar: {n}', { n: b.qator_soni })}</span>{' '}
                    {b.summa_nds_siz != null && <span className="fz-chip"><FmtN val={b.summa_nds_siz} /> {t('so‘m, QQS siz')}</span>}
                  </span>
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <BuyurtmaChip holat={b.holat} />
                    <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => void tarkibniKoz(b)}>{ochiq === b.id ? t('Yashirish') : t('Tarkibi')}</button>
                    {band ? <span className="animate-pulse text-[12px] text-text-mute">{t('Kuting…')}</span> : q ? (<>
                      {b.holat === 'yuborildi' && <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => void qadam(b, 'rad')}>{t('Rad etish')}</button>}
                      <button type="button" className="fz-btn fz-btn--primary fz-btn--sm" onClick={() => void qadam(b, q.ga)}>{t(q.tugma)}</button>
                    </>) : b.holat === 'topshirildi' ? <span className="text-[12px] text-text-mute">{t('Xaridor qabul qilishini kutmoqda')}</span> : null}
                  </span>
                </div>
                {olishId === b.id && (
                  <div className="mt-2 flex flex-wrap items-end gap-2 rounded-md border border-border p-2">
                    <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[12px]">
                      <span>{t('Qayerdan olib ketiladi (ombor, manzil)')}</span>
                      <input type="text" value={manzil} onChange={(e) => setManzil(e.target.value)} aria-label={t('Qayerdan olib ketiladi (ombor, manzil)')} />
                    </label>
                    <button type="button" className="fz-btn fz-btn--primary fz-btn--sm" disabled={band} onClick={() => void olishVaTayyor(b)}>{t('Saqlash va tayyor')}</button>
                  </div>
                )}
                {ochiq === b.id && (
                  <div className="mt-2 text-[12.5px]">
                    {tarkib === null ? <div className="skel h-8 rounded" /> : (
                      <ul className="divide-y divide-border">
                        {tarkib.map((x) => (
                          <li key={x.id} className="flex justify-between gap-3 py-1">
                            <span>{x.nom}</span>
                            <span className="tabular-nums"><FmtN val={x.miqdor} /> {x.birlik}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
