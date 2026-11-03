import { useState } from 'react';
import { CheckCircle2, Flag, MapPin, Navigation, Play } from 'lucide-react';
import { t } from '../i18n/til';
import { toast } from '../umumiy/ui/Toast';
import type { Bekat, Reys } from '../api/t2-transport';
import { googleHavola, yandexHavola } from '../lib/transport/geo';
import { useTBugun, useTYoz } from './hooks';
import { FormOyna, type Maydon } from './FormOyna';
import { bugunISO, son } from './format';
import { xatoMatn } from './xato';
import { HOLAT_STAMP, holatNom } from './ReyslarTab';

/** Haydovchi uchun 375 px ko'rinish: bugungi reyslar, bekatma-bekat navigatsiya, katta tugmalar. */
export default function HaydovchiBugun({ kompaniyaId }: { kompaniyaId: number }) {
  const sana = bugunISO();
  const q = useTBugun(kompaniyaId, sana); const yoz = useTYoz(kompaniyaId);
  const [amal, setAmal] = useState<null | { tur: 'boshla' | 'bekat' | 'yetkaz'; r: Reys; b?: Bekat }>(null);
  const reyslar = (q.data?.reyslar ?? []).filter((r) => r.holat !== 'bekor');

  const maydon = (tur: 'boshla' | 'bekat' | 'yetkaz'): Maydon[] => tur === 'boshla'
    ? [{ k: 'km', nom: t('Odometr, km'), tur: 'son' }]
    : tur === 'bekat'
      ? [{ k: 'bekat_holat', nom: t('Holat'), tur: 'tanlov', majburiy: true, variantlar: [{ v: 'yetib_keldi', nom: t('Yetib keldim') }, { v: 'bajarildi', nom: t('Yuk topshirildi') }] }, { k: 'qabul_qiluvchi', nom: t('Qabul qildi (F.I.Sh.)'), tur: 'matn', keng: true }]
      : [{ k: 'km', nom: t('Odometr (tugash), km'), tur: 'son' }, { k: 'yoqilgi_sarfi_l', nom: t('Sarflangan yoqilg‘i, L'), tur: 'son' }, { k: 'yol_haqi', nom: t('Yo‘l haqi, so‘m'), tur: 'pul' }, { k: 'kutish_daqiqa', nom: t('Kutish, daqiqa'), tur: 'son' }];
  const bajar = async (data: Record<string, unknown>) => {
    if (!amal) return;
    const asos = { id: amal.r.id, versiya: amal.r.versiya, harakat: amal.tur === 'bekat' ? 'bekat' : amal.tur };
    try { await yoz.mutateAsync({ amal: 'reys_yurish', data: { ...asos, ...(amal.b ? { bekat_tartib: amal.b.tartib } : {}), ...data } }); toast(t('Saqlandi')); }
    catch (e) { throw new Error(xatoMatn(e)); }
  };
  const pt = (b: Bekat) => (b.lat != null && b.lng != null ? { lat: b.lat, lng: b.lng } : null);
  const katta = 'fz-btn flex min-h-11 flex-1 items-center justify-center gap-2 text-[14px]';

  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col gap-3 px-4 py-3" data-testid="haydovchi-bugun">
      <h2 className="text-[16px] font-semibold">{t('Bugungi reyslarim')} <small className="font-normal text-text-mute">{sana}</small></h2>
      {q.isLoading && <p className="text-[13px] text-text-mute">{t('Yuklanmoqda…')}</p>}
      {q.isError && <p role="alert" className="text-[13px] text-danger">{t('Reyslarni o‘qib bo‘lmadi.')}</p>}
      {!q.isLoading && reyslar.length === 0 && <div className="rounded-lg border border-dashed border-border p-6 text-center text-[13px] text-text-dim">{t('Bugun sizga reys biriktirilmagan.')}</div>}
      {reyslar.map((r) => {
        const nuqta = r.bekatlar.map(pt).filter(Boolean) as Array<{ lat: number; lng: number }>;
        const toliq = googleHavola(nuqta);
        return (
          <article key={r.id} className="fz-card flex flex-col gap-2 p-3">
            <div className="flex items-center justify-between"><b className="text-[14px]">{r.raqam}</b><span className={`fz-stamp ${HOLAT_STAMP[r.holat]}`}>{holatNom(r.holat)}</span></div>
            <div className="text-[13px]">{r.mashina_nomi}{r.davlat_raqami ? ` · ${r.davlat_raqami}` : ''}</div>
            {r.tannarx?.km != null && <div className="text-[12px] text-text-mute">{son(r.tannarx.km)} {t('km')}{r.reja_daqiqa ? ` · ~${r.reja_daqiqa} ${t('daq')}` : ''}</div>}
            <ol className="flex flex-col gap-2">
              {r.bekatlar.map((b) => {
                const p = pt(b); const g = p ? googleHavola([p]) : null; const y = p ? yandexHavola([p]) : null;
                return (
                  <li key={b.id} className="rounded-lg border border-border p-2">
                    <div className="flex items-start justify-between gap-2"><span className="text-[13px]"><b className="num">{b.tartib}.</b> {b.nom}<small className="block text-text-mute">{b.turi === 'yuklash' ? t('Yuklash') : b.turi === 'tushirish' ? t('Tushirish') : t('Oraliq')}{b.manzil ? ` · ${b.manzil}` : ''}</small></span>
                      {(b.holat === 'bajarildi' || b.holat === 'otkazildi') ? <CheckCircle2 className="h-5 w-5 shrink-0 text-ok" aria-label={t('Bajarildi')} /> : b.holat === 'yetib_keldi' ? <MapPin className="h-5 w-5 shrink-0 text-warn" aria-label={t('Yetib keldi')} /> : null}</div>
                    <div className="mt-1.5 flex gap-2">
                      {g && <a className={`${katta} fz-btn--ghost`} href={g} target="_blank" rel="noreferrer"><Navigation className="h-4 w-4" />{'Google'}</a>}
                      {y && <a className={`${katta} fz-btn--ghost`} href={y} target="_blank" rel="noreferrer"><Navigation className="h-4 w-4" />{'Yandex'}</a>}
                      {r.holat === 'yolda' && b.holat !== 'bajarildi' && b.holat !== 'otkazildi' && <button type="button" className={`${katta} fz-btn--primary`} onClick={() => setAmal({ tur: 'bekat', r, b })}><Flag className="h-4 w-4" />{t('Holat')}</button>}
                    </div>
                  </li>);
              })}
            </ol>
            <div className="flex gap-2">
              {toliq && <a className={`${katta} fz-btn--ghost`} href={toliq} target="_blank" rel="noreferrer"><Navigation className="h-4 w-4" />{t('Butun marshrut')}</a>}
              {r.holat === 'reja' && <button type="button" className={`${katta} fz-btn--primary`} onClick={() => setAmal({ tur: 'boshla', r })}><Play className="h-4 w-4" />{t('Boshlash')}</button>}
              {r.holat === 'yolda' && <button type="button" className={`${katta} fz-btn--primary`} onClick={() => setAmal({ tur: 'yetkaz', r })}><CheckCircle2 className="h-4 w-4" />{t('Yakunlash')}</button>}
            </div>
          </article>);
      })}
      {amal && <FormOyna ochiq sarlavha={amal.tur === 'boshla' ? t('Reysni boshlash') : amal.tur === 'bekat' ? `${t('Bekat')} ${amal.b?.tartib}` : t('Reysni yakunlash')} maydonlar={maydon(amal.tur)}
        boshlangich={amal.tur === 'bekat' ? { bekat_holat: 'bajarildi' } : {}} onSaqla={bajar} onYop={() => setAmal(null)} kenglik={420} />}
    </div>
  );
}
