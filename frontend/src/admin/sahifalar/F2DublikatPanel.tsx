/**
 * F2 yozishdan oldingi DUBLIKAT tekshiruv paneli (F2 import + F2 tayyorlash). Hisob — lib/f2-dublikat/tekshiruv.
 * BLOK (qizil) — yozish tugmasi ishlamaydi; OGOHLANTIRISH (sariq) — yozishga to‘sqinlik qilmaydi, operator ko‘rib qaror qiladi.
 */
import { useEffect, useState } from 'react';
import { sbOqi } from '../../api/supabase';
import type { DAkt, Masala } from '../../lib/f2-dublikat/tekshiruv';
import { t } from '../../i18n/til';

/** Obyektning F2 aktlari (id, raqam, oy, holat, hujjat jami, manba). `yangila` o‘zgarsa qayta o‘qiladi. */
export function useObyektF2Aktlari(objectId: number | null, yangila = 0): { aktlar: DAkt[]; yuklandi: boolean } {
  const [h, setH] = useState<{ kalit: string; aktlar: DAkt[] } | null>(null);
  const kalit = objectId ? `${objectId}:${yangila}` : '';
  useEffect(() => {
    if (!objectId) return;
    let faol = true;
    void Promise.resolve(sbOqi<DAkt>({ jadval: 't2_akt', filtr: `obyekt_id=eq.${objectId}&tur=eq.f2`, ustunlar: 'id,raqam,oy,holat,hujjat_jami,manba', limit: 5000 }))
      .then((r) => { if (faol) setH({ kalit, aktlar: r?.ok ? r.qatorlar ?? [] : [] }); })
      .catch(() => { if (faol) setH({ kalit, aktlar: [] }); });
    return () => { faol = false; };
  }, [objectId, kalit]);
  const joriy = h?.kalit === kalit ? h : null;
  return { aktlar: joriy?.aktlar ?? [], yuklandi: !kalit || !!joriy };
}

export function F2DublikatPanel({ masalalar, obyektId, yangilaHref }: {
  masalalar: readonly Masala[]; obyektId: number | null;
  /** «Mavjud F2 ni yangilash» havolasi (yangi oynada ochiladi — joriy ish yo‘qolmaydi). */
  yangilaHref?: (aktId: number) => string;
}) {
  if (!masalalar.length) return null;
  return <section aria-label={t('Dublikat tekshiruvi')} className="space-y-1.5">
    {masalalar.map((m, i) => {
      const blok = m.daraja === 'blok';
      return <div key={m.kod + '-' + i} role={blok ? 'alert' : 'status'}
        className={`karta border p-2.5 text-[13px] ${blok ? 'border-danger/50 bg-danger/10 text-danger' : 'border-warn/50 bg-warn/10 text-warn'}`}>
        <p className="font-semibold">{blok ? '⛔ ' : '⚠ '}{m.matn}</p>
        {blok && m.aktIdlar.length > 0 && <div className="mt-1 flex flex-wrap items-center gap-2">
          {yangilaHref && m.aktIdlar.map((id) => <a key={id} className="tugma h-7 px-2" href={yangilaHref(id)} target="_blank" rel="noopener noreferrer">{t('Mavjud F2 ni yangilash (akt #{id})', { id })}</a>)}
          {obyektId != null && <a className="underline text-accent" href={`/admin/f2-tarix?obyekt=${obyektId}`} target="_blank" rel="noopener noreferrer">{t('Mavjud F2 tarixini boshqa oynada ochish')}</a>}
        </div>}
      </div>;
    })}
  </section>;
}