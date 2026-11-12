/**
 * Yetkazuvchi «Bugun» (ekotizim V3, tomon: yetkazuvchi): bitta sodda ekran — 4 katta tugma, har birida bitta keyingi qadam.
 *   1) Kelgan so'rovlar -> narx va muddat bering   2) Takliflarim -> g'olib bo'ldimmi
 *   3) Buyurtmalar -> qabul / boshlash / tayyor / topshirdim (+ «Transport so'rash»)   4) Transport -> Yuk birjasi
 * Yangi jadval/modul yo'q: mavjud tender (t2_birja_*), buyurtma (t2_buyurtma*) va yuk birjasi (t2_yb_*) zanjiri ulanadi.
 * To'lov: xaridor qabul qilgach qarz yetkazuvchi nomiga xaridorning qarzdorlik jadvalida paydo bo'ladi; to'lov o'sha yerda yopadi.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Gavel, PackageCheck, RefreshCw, Truck } from 'lucide-react';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { t } from '../../i18n/til';
import { tenderRoyxatOl, type TenderRoyxatQator } from '../../api/t2-tender';
import { buyurtmalarOl, type BuyurtmaRoyxatQator } from '../../api/t2-buyurtma';
import { ybYuklarim, type YukQator } from '../../api/t2-yuk-birjasi';
import { YUK_YAKUNIY } from '../../lib/yuk-birjasi/holat';
import { buyurtmaHisobi, sorovHisobi } from '../../lib/yetkazuvchi/bugun';
import { BuyurtmaKabinet } from '../../components/buyurtma/BuyurtmaKabinet';
import { Bosh, sanaVaqt, turNomi } from '../tender/tender-ui';

function Katak({ ikon, nom, son, izoh, tugma, yol, rang }: { ikon: ReactNode; nom: string; son: number | null; izoh: string; tugma: string; yol: string; rang?: 'warn' | 'ok' }) {
  return (
    <section className="fz-panel flex flex-col gap-2" aria-label={nom}>
      <div className="flex items-center gap-2 text-[13px] text-text-mute">{ikon}<span>{nom}</span></div>
      <div className={`text-[30px] font-semibold tabular-nums leading-none ${rang === 'warn' ? 'text-warn' : rang === 'ok' ? 'text-ok' : ''}`}>{son ?? '—'}</div>
      <p className="text-[12.5px] text-text-mute">{izoh}</p>
      <Link to={yol} className="fz-btn fz-btn--primary mt-auto w-full text-center">{tugma}</Link>
    </section>
  );
}

export default function YetkazuvchiBugun() {
  const { joriy } = useKompaniya();
  const [sorov, setSorov] = useState<TenderRoyxatQator[] | null>(null);
  const [buyurtma, setBuyurtma] = useState<BuyurtmaRoyxatQator[] | null>(null);
  const [yuklar, setYuklar] = useState<YukQator[] | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [yuk, setYuk] = useState(false);
  const [kalit, setKalit] = useState(0);

  const yukla = useCallback(async () => {
    if (!joriy) return;
    setYuk(true);
    /* Bitta to'lqin (parallel): har bir manba mustaqil — biri yiqilsa qolganlari ko'rinaveradi, sababi yozib qo'yiladi. */
    const [menga, ochiq, buy, yb] = await Promise.all([
      tenderRoyxatOl({ kompaniyaId: joriy.id, yonalish: 'menga', limit: 100 }),
      tenderRoyxatOl({ kompaniyaId: joriy.id, yonalish: 'ochiq', limit: 100 }),
      buyurtmalarOl({ kompaniyaId: joriy.id, yonalish: 'menga', limit: 100 }),
      ybYuklarim(joriy.id, { limit: 100 }),
    ]);
    setYuk(false);
    const xatolar: string[] = [];
    if (menga.ok || ochiq.ok) setSorov([...(menga.ok ? menga.natija.qatorlar : []), ...(ochiq.ok ? ochiq.natija.qatorlar : [])]);
    else { setSorov([]); xatolar.push(menga.error ?? ochiq.error ?? ''); }
    if (buy.ok) setBuyurtma(buy.qatorlar); else { setBuyurtma([]); xatolar.push(buy.error); }
    if (yb.ok) setYuklar(yb.natija.yuklar); else { setYuklar([]); xatolar.push(yb.error ?? ''); }
    setXato(xatolar.filter(Boolean)[0] ?? null);
  }, [joriy]);
  useEffect(() => { void yukla(); }, [yukla, kalit]);

  const s = useMemo(() => sorovHisobi(sorov ?? []), [sorov]);
  const b = useMemo(() => buyurtmaHisobi(buyurtma ?? []), [buyurtma]);
  const faolYuk = useMemo(() => (yuklar ?? []).filter((q) => !YUK_YAKUNIY.has(q.holat)).length, [yuklar]);

  if (!joriy) return <Sahifa sarlavha="Yetkazuvchi: bugun"><Bosh>{t('Kompaniya tanlang.')}</Bosh></Sahifa>;
  const tayyor = sorov !== null && buyurtma !== null && yuklar !== null;

  return (
    <Sahifa
      sarlavha="Yetkazuvchi: bugun"
      tavsif="Sizga kelgan so‘rovlar, narx taklifingiz natijasi, buyurtmalar va transport — bitta joyda."
      amallar={<button type="button" className="fz-btn fz-btn--ghost" onClick={() => setKalit((k) => k + 1)} disabled={yuk}><RefreshCw className={yuk ? 'animate-spin' : ''} /> {t('Yangilash')}</button>}
    >
      <div className="flex flex-col gap-4 overflow-auto">
        {xato && <p className="fz-note" role="alert">{t(xato)}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Katak ikon={<Gavel size={16} />} nom={t('Kelgan so‘rovlar')} son={tayyor ? s.yangi.length : null} rang={s.yangi.length ? 'warn' : undefined}
            izoh={t('Narx va muddat berishingizni kutmoqda')} tugma={t('Narx berish')} yol={s.yangi[0] ? `/admin/tender?id=${s.yangi[0].id}` : '/admin/tender'} />
          <Katak ikon={<ClipboardList size={16} />} nom={t('Mening takliflarim')} son={tayyor ? s.kutilmoqda.length : null}
            izoh={tayyor ? t('Kutilmoqda. Yutgan: {y}, yutqazgan: {q}', { y: s.yutdim.length, q: s.yutqazdim.length }) : ''} tugma={t('Takliflarni ko‘rish')} yol="/admin/tender" />
          <Katak ikon={<PackageCheck size={16} />} nom={t('Buyurtmalar: sizning qadamingiz')} son={tayyor ? b.harakatKerak.length : null} rang={b.harakatKerak.length ? 'warn' : undefined}
            izoh={tayyor ? t('Xaridor qabulini kutayotgan: {n}', { n: b.qabulKutilmoqda.length }) : ''} tugma={t('Buyurtmalarga')} yol="#buyurtmalar" />
          <Katak ikon={<Truck size={16} />} nom={t('Transport')} son={tayyor ? faolYuk : null}
            izoh={t('Faol yuk e’lonlari. Tayyor buyurtmadan «Transport so‘rash» bosing.')} tugma={t('Yuk birjasi')} yol="/admin/yuk-birjasi" />
        </div>

        {s.yangi.length > 0 && (
          <section className="fz-panel" aria-label={t('Kelgan so‘rovlar')}>
            <div className="fz-panel__h"><span>{t('Kelgan so‘rovlar')}</span><span>{s.yangi.length}</span></div>
            <ul className="divide-y divide-border text-[13px]">
              {s.yangi.slice(0, 6).map((q) => (
                <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0"><span className="fz-c-shifr">{q.raqam ?? `#${q.id}`}</span> <span className="font-medium">{q.nom}</span>{' '}
                    <span className="text-text-mute">{q.egasi_nom ?? ''} · {turNomi(q.tur)} · {t('Qatorlar: {n}', { n: q.qator_soni })}{q.muddat ? ` · ${t('muddat')}: ${sanaVaqt(q.muddat)}` : ''}</span></span>
                  <Link to={`/admin/tender?id=${q.id}`} className="fz-btn fz-btn--primary fz-btn--sm">{t('Narx berish')}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div id="buyurtmalar"><BuyurtmaKabinet key={kalit} kompaniyaId={joriy.id} /></div>
      </div>
    </Sahifa>
  );
}
