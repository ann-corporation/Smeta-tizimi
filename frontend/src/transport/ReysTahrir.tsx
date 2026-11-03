import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, MapPinned, Plus, Trash2 } from 'lucide-react';
import { t } from '../i18n/til';
import { OpsMaydon, OpsOyna } from '../components/kompaniya-ops/OpsUi';
import { MoneyInput } from '../umumiy/ui/MoneyInput';
import { toast } from '../umumiy/ui/Toast';
import type { Haydovchi, Joy, Mashina, Reys, Tarif, YoqilgiNarx } from '../api/t2-transport';
import { googleHavola, marshrutQur, osrmAdapter, yandexHavola, type MarshrutNatija } from '../lib/transport/geo';
import { tannarxHisobla } from '../lib/transport/xarajat';
import { narxHisobla } from '../lib/transport/narxlash';
import { INP, NarxQqs, Tannarx, bugunISO, raqamYoki, som } from './format';
import { xatoMatn } from './xato';
import { lazy, Suspense } from 'react';

const Xarita = lazy(() => import('./TransportXarita'));

type D = Record<string, unknown>;
type Saqla = { (data: D): Promise<void> };
type BekatF = { turi: 'yuklash' | 'tushirish' | 'oraliq'; nom: string; obyekt_id: string; lat: string; lng: string; manzil: string };
type YukF = { nom: string; birlik: string; miqdor: string; ogirlik_t: string; obyekt_id: string; tushirish_tartib: string };

const ROUTING_URL = (import.meta.env.VITE_ROUTING_URL as string | undefined) ?? 'https://router.project-osrm.org';
const yolOlish = ROUTING_URL ? osrmAdapter(ROUTING_URL) : null;

export default function ReysTahrir({ ochiq, boshlangich, mashinalar, haydovchilar, joylar, tariflar, yoqilgiNarxlari, onSaqla, onYop }: {
  ochiq: boolean; boshlangich: Reys | null; mashinalar: Mashina[]; haydovchilar: Haydovchi[]; joylar: Joy[]; tariflar: Tarif[]; yoqilgiNarxlari: YoqilgiNarx[];
  onSaqla: Saqla; onYop: () => void;
}) {
  const [sana, setSana] = useState(bugunISO());
  const [mashinaId, setMashinaId] = useState(''); const [haydId, setHaydId] = useState('');
  const [turi, setTuri] = useState<'ichki' | 'tashqi'>('ichki'); const [mijoz, setMijoz] = useState('');
  const [tarifId, setTarifId] = useState(''); const [narx, setNarx] = useState(''); const [izoh, setIzoh] = useState(''); const [koef, setKoef] = useState('1');
  const [bekatlar, setBekatlar] = useState<BekatF[]>([]); const [yuklar, setYuklar] = useState<YukF[]>([]);
  const [marshrut, setMarshrut] = useState<MarshrutNatija | null>(null); const [hisob, setHisob] = useState(false);
  const [xato, setXato] = useState(''); const [band, setBand] = useState(false);

  useEffect(() => {
    if (!ochiq) return;
    const r = boshlangich;
    setSana(r?.sana ?? bugunISO()); setMashinaId(r ? String(r.mashina_id) : ''); setHaydId(r?.haydovchi_id ? String(r.haydovchi_id) : '');
    setTuri(r?.buyurtmachi_turi ?? 'ichki'); setMijoz(r?.mijoz_nom ?? ''); setTarifId(r?.tarif_id ? String(r.tarif_id) : ''); setNarx(r?.narx_qqs_siz != null ? String(r.narx_qqs_siz) : '');
    setIzoh(r?.izoh ?? ''); setKoef(String(r?.norma_koef ?? 1)); setMarshrut(r?.reja_km != null ? { km: r.reja_km, daqiqa: r.reja_daqiqa ?? 0, manba: r.marshrut_manba === 'yol' ? 'yol' : 'taxminiy', geometriya: null } : null);
    setBekatlar(r ? r.bekatlar.map((b) => ({ turi: b.turi, nom: b.nom, obyekt_id: b.obyekt_id ? String(b.obyekt_id) : '', lat: b.lat != null ? String(b.lat) : '', lng: b.lng != null ? String(b.lng) : '', manzil: b.manzil ?? '' }))
      : [{ turi: 'yuklash', nom: '', obyekt_id: '', lat: '', lng: '', manzil: '' }, { turi: 'tushirish', nom: '', obyekt_id: '', lat: '', lng: '', manzil: '' }]);
    setYuklar(r ? r.yuklar.map((y) => ({ nom: y.nom, birlik: y.birlik ?? '', miqdor: y.miqdor != null ? String(y.miqdor) : '', ogirlik_t: y.ogirlik_t != null ? String(y.ogirlik_t) : '', obyekt_id: y.obyekt_id ? String(y.obyekt_id) : '', tushirish_tartib: y.tushirish_tartib ? String(y.tushirish_tartib) : '' })) : []);
    setXato('');
  }, [ochiq, boshlangich]);

  const mashina = mashinalar.find((m) => String(m.id) === mashinaId) ?? null;
  const hayd = haydovchilar.find((h) => String(h.id) === haydId) ?? null;
  const tarif = tariflar.find((x) => String(x.id) === tarifId) ?? null;
  const nuqta = (b: BekatF) => { const lat = raqamYoki(b.lat), lng = raqamYoki(b.lng); return lat != null && lng != null ? { lat, lng } : null; };
  const nuqtalar = bekatlar.map(nuqta);
  const tayyorNuqtalar = nuqtalar.every(Boolean) && nuqtalar.length >= 2 ? (nuqtalar as Array<{ lat: number; lng: number }>) : null;
  const jamiTonna = yuklar.reduce<number | null>((s, y) => { const o = raqamYoki(y.ogirlik_t); return o == null ? s : (s ?? 0) + o; }, null);

  const tn = useMemo(() => mashina ? tannarxHisobla(
    { yoqilgiTuri: mashina.yoqilgi_turi as 'dizel', norma100km: mashina.norma_100km, normaMotosoat: mashina.norma_motosoat, egalik: mashina.egalik, amortKm: mashina.amort_km, amortSoat: mashina.amort_soat,
      ijaraKm: mashina.ijara_km, ijaraSoat: mashina.ijara_soat, ijaraKun: mashina.ijara_kun, kutishSoatNarx: mashina.kutish_soat_narx },
    hayd ? { tolovTuri: hayd.tolov_turi, tolovStavka: hayd.tolov_stavka, ijtimoiyFoiz: hayd.ijtimoiy_foiz } : null,
    { sana, rejaKm: marshrut?.km ?? null, rejaDaqiqa: marshrut?.daqiqa ?? null, kmBoshi: null, kmOxiri: null, faktKm: null, motoBoshi: null, motoOxiri: null, ishSoat: null, boshlandi: null, tugadi: null,
      kutishDaqiqa: null, yoqilgiSarfiL: null, yoqilgiNarxFakt: null, normaKoef: raqamYoki(koef) ?? 1, yolHaqi: null, boshqaXarajat: null },
    yoqilgiNarxlari.map((n) => ({ yoqilgiTuri: n.yoqilgi_turi, sana: n.sana, narx: n.narx })),
  ) : null, [mashina, hayd, sana, marshrut, koef, yoqilgiNarxlari]);

  const tavsiya = useMemo(() => tarif ? narxHisobla({ kmNarx: tarif.km_narx, tonnaKmNarx: tarif.tonna_km_narx, soatNarx: tarif.soat_narx, reysNarx: tarif.reys_narx, minimalSumma: tarif.minimal_summa,
    marjaFoiz: tarif.marja_foiz, qqsFoiz: tarif.qqs_foiz, qqsKiritilgan: tarif.qqs_kiritilgan }, { km: marshrut?.km ?? null, tonna: jamiTonna, soat: tn?.soat ?? null }, tn ? { jami: tn.jami, toliq: tn.toliq } : null) : null, [tarif, marshrut, jamiTonna, tn]);

  const hisobla = async () => {
    if (!tayyorNuqtalar) { setXato(t('Marshrut uchun barcha bekatlarda koordinata bo‘lishi kerak (obyekt tanlang yoki xaritadan belgilang).')); return; }
    setHisob(true); setXato('');
    try { setMarshrut(await marshrutQur(tayyorNuqtalar, yolOlish)); } finally { setHisob(false); }
  };
  const bekatObyekt = (i: number, id: string) => {
    const o = joylar.find((x) => String(x.id) === id);
    setBekatlar(bekatlar.map((b, j) => (j === i ? { ...b, obyekt_id: id, nom: o ? o.nom : b.nom, lat: o?.lat != null ? String(o.lat) : b.lat, lng: o?.lng != null ? String(o.lng) : b.lng } : b)));
  };
  const xaritaBos = (p: { lat: number; lng: number }) => {
    const i = bekatlar.findIndex((b) => !nuqta(b));
    if (i >= 0) setBekatlar(bekatlar.map((b, j) => (j === i ? { ...b, lat: p.lat.toFixed(6), lng: p.lng.toFixed(6), nom: b.nom || t('Nuqta {n}', { n: j + 1 }) } : b)));
  };

  const saqla = async () => {
    if (!mashinaId) { setXato(t('Mashinani tanlang')); return; }
    if (bekatlar.length < 2 || bekatlar.some((b) => !b.nom.trim())) { setXato(t('Kamida 2 ta bekat va har birining nomi bo‘lishi kerak')); return; }
    const s = (v: string) => (v.trim() === '' ? null : v.trim());
    const data = {
      ...(boshlangich ? { id: boshlangich.id, versiya: boshlangich.versiya } : {}),
      sana, mashina_id: Number(mashinaId), haydovchi_id: haydId ? Number(haydId) : null, buyurtmachi_turi: turi, mijoz_nom: turi === 'tashqi' ? s(mijoz) : null,
      tarif_id: tarifId ? Number(tarifId) : null, reja_km: marshrut?.km ?? null, reja_daqiqa: marshrut?.daqiqa ?? null, marshrut_manba: marshrut ? marshrut.manba : null,
      norma_koef: raqamYoki(koef) ?? 1, narx_qqs_siz: raqamYoki(narx), izoh: s(izoh),
      bekatlar: bekatlar.map((b) => ({ turi: b.turi, nom: b.nom.trim(), obyekt_id: b.obyekt_id ? Number(b.obyekt_id) : null, lat: raqamYoki(b.lat), lng: raqamYoki(b.lng), manzil: s(b.manzil) })),
      yuklar: yuklar.filter((y) => y.nom.trim()).map((y) => ({ nom: y.nom.trim(), birlik: s(y.birlik), miqdor: raqamYoki(y.miqdor), ogirlik_t: raqamYoki(y.ogirlik_t), obyekt_id: y.obyekt_id ? Number(y.obyekt_id) : null,
        tushirish_tartib: y.tushirish_tartib ? Number(y.tushirish_tartib) : null })),
    };
    setBand(true); setXato('');
    try { await onSaqla(data); toast(t('Reys saqlandi')); onYop(); } catch (e) { setXato(xatoMatn(e)); } finally { setBand(false); }
  };

  const oshdi = mashina?.yuk_t != null && jamiTonna != null && mashina.yuk_t < jamiTonna;
  const xaritaJoylar = joylar.filter((j) => j.lat != null && j.lng != null) as Array<{ id: number; nom: string; lat: number; lng: number }>;
  const g = tayyorNuqtalar ? googleHavola(tayyorNuqtalar) : null, y = tayyorNuqtalar ? yandexHavola(tayyorNuqtalar) : null;

  return (
    <OpsOyna ochiq={ochiq} sarlavha={boshlangich ? t('Reys {raqam}', { raqam: boshlangich.raqam ?? '' }) : t('Yangi reys')} onYop={onYop} kenglik={920} band={band}
      amallar={<>
        <button type="button" className="fz-btn" onClick={onYop} disabled={band}>{t('Bekor')}</button>
        <button type="button" className="fz-btn fz-btn--primary" onClick={() => void saqla()} disabled={band}>{band ? t('Saqlanmoqda…') : t('Reysni saqlash')}</button>
      </>}>
      {xato && <div role="alert" className="rounded-lg border border-danger px-3 py-2 text-[12px] text-danger">{xato}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <OpsMaydon nom={t('Sana')} majburiy><input type="date" className={INP} value={sana} onChange={(e) => setSana(e.target.value)} /></OpsMaydon>
        <OpsMaydon nom={t('Mashina / texnika')} majburiy><select className={INP} value={mashinaId} onChange={(e) => { setMashinaId(e.target.value); const m = mashinalar.find((x) => String(x.id) === e.target.value); if (m?.haydovchi_id && !haydId) setHaydId(String(m.haydovchi_id)); }}>
          <option value="">{t('— tanlang —')}</option>{mashinalar.filter((m) => m.holat === 'faol').map((m) => <option key={m.id} value={m.id}>{m.nomi}{m.davlat_raqami ? ` · ${m.davlat_raqami}` : ''}</option>)}</select></OpsMaydon>
        <OpsMaydon nom={t('Haydovchi')}><select className={INP} value={haydId} onChange={(e) => setHaydId(e.target.value)}><option value="">{t('— tanlanmagan —')}</option>
          {haydovchilar.filter((h) => h.holat === 'faol').map((h) => <option key={h.id} value={h.id}>{h.ism}</option>)}</select></OpsMaydon>
        <OpsMaydon nom={t('Buyurtmachi')}><select className={INP} value={turi} onChange={(e) => setTuri(e.target.value as 'ichki' | 'tashqi')}><option value="ichki">{t('Ichki (o‘z obyektlarimiz)')}</option><option value="tashqi">{t('Tashqi mijoz')}</option></select></OpsMaydon>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between"><b className="text-[13px]">{t('Marshrut bekatlari')}</b>
          <button type="button" className="fz-btn fz-btn--sm" onClick={() => setBekatlar([...bekatlar, { turi: 'tushirish', nom: '', obyekt_id: '', lat: '', lng: '', manzil: '' }])}><Plus />{t('Bekat qo‘shish')}</button></div>
        <div className="flex flex-col gap-2">
          {bekatlar.map((b, i) => (
            <div key={i} className="grid grid-cols-2 items-end gap-2 rounded-lg border border-border p-2 sm:grid-cols-[28px_110px_1fr_1fr_90px_90px_32px]">
              <span className="num pb-1.5 text-center text-[12px] font-semibold">{i + 1}</span>
              <select className={`${INP} h-8 px-2 text-[12px]`} aria-label={t('Bekat turi')} value={b.turi} onChange={(e) => setBekatlar(bekatlar.map((x, j) => (j === i ? { ...x, turi: e.target.value as BekatF['turi'] } : x)))}>
                <option value="yuklash">{t('Yuklash')}</option><option value="tushirish">{t('Tushirish')}</option><option value="oraliq">{t('Oraliq')}</option></select>
              <select className={`${INP} h-8 px-2 text-[12px]`} aria-label={t('Obyekt')} value={b.obyekt_id} onChange={(e) => bekatObyekt(i, e.target.value)}>
                <option value="">{t('Obyekt (ixtiyoriy)')}</option>{joylar.map((o) => <option key={o.id} value={o.id}>{o.nom}{o.lat == null ? ` (${t('koordinatasiz')})` : ''}</option>)}</select>
              <input className={`${INP} h-8 px-2 text-[12px]`} aria-label={t('Nomi')} placeholder={t('Nomi (ombor, zavod…)')} value={b.nom} onChange={(e) => setBekatlar(bekatlar.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))} />
              <input className={`${INP} h-8 px-2 text-[12px]`} aria-label={t('Kenglik (lat)')} placeholder={'lat'} inputMode="decimal" value={b.lat} onChange={(e) => setBekatlar(bekatlar.map((x, j) => (j === i ? { ...x, lat: e.target.value } : x)))} />
              <input className={`${INP} h-8 px-2 text-[12px]`} aria-label={t('Uzunlik (lng)')} placeholder={'lng'} inputMode="decimal" value={b.lng} onChange={(e) => setBekatlar(bekatlar.map((x, j) => (j === i ? { ...x, lng: e.target.value } : x)))} />
              <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" aria-label={t('Bekatni o‘chirish')} disabled={bekatlar.length <= 2} onClick={() => setBekatlar(bekatlar.filter((_, j) => j !== i))}><Trash2 /></button>
            </div>))}
        </div>
        <p className="mt-1 text-[11px] text-text-mute">{t('Koordinatasiz bekat uchun xaritani bosing: nuqta birinchi bo‘sh bekatga qo‘yiladi.')}</p>
      </div>

      <Suspense fallback={<div className="h-[260px] rounded-lg border border-border" />}>
        <Xarita joylar={xaritaJoylar} balandlik={260} onXaritaBos={xaritaBos}
          marshrutlar={tayyorNuqtalar ? [{ id: 1, nom: t('Reja'), rang: 'var(--accent, #2563eb)', chiziq: marshrut?.geometriya ?? null, nuqtalar: tayyorNuqtalar.map((p, i) => ({ ...p, nom: bekatlar[i].nom })) }] : []} />
      </Suspense>
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <button type="button" className="fz-btn fz-btn--sm" onClick={() => void hisobla()} disabled={hisob}><MapPinned />{hisob ? t('Hisoblanmoqda…') : t('Masofa va vaqtni hisoblash')}</button>
        {marshrut && <span className="num"><b>{marshrut.km} {t('km')}</b> · ~{marshrut.daqiqa} {t('daq')} · <span className={marshrut.manba === 'yol' ? 'text-ok' : 'text-warn'}>{marshrut.manba === 'yol' ? t('yo‘l bo‘yicha (OSRM)') : t('taxminiy: to‘g‘ri chiziq × 1,3')}</span></span>}
        {g && <a className="fz-btn fz-btn--ghost fz-btn--sm" href={g} target="_blank" rel="noreferrer"><ExternalLink />{'Google Maps'}</a>}
        {y && <a className="fz-btn fz-btn--ghost fz-btn--sm" href={y} target="_blank" rel="noreferrer"><ExternalLink />{'Yandex Maps'}</a>}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between"><b className="text-[13px]">{t('Yuk')}</b>
          <button type="button" className="fz-btn fz-btn--sm" onClick={() => setYuklar([...yuklar, { nom: '', birlik: '', miqdor: '', ogirlik_t: '', obyekt_id: '', tushirish_tartib: '' }])}><Plus />{t('Yuk qo‘shish')}</button></div>
        {yuklar.map((u, i) => (
          <div key={i} className="mb-1 grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_70px_80px_80px_1fr_70px_32px]">
            <input className={`${INP} h-8 px-2 text-[12px]`} aria-label={t('Material')} placeholder={t('Material / yuk nomi')} value={u.nom} onChange={(e) => setYuklar(yuklar.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))} />
            <input className={`${INP} h-8 px-2 text-[12px]`} aria-label={t('Birlik')} placeholder={t('birlik')} value={u.birlik} onChange={(e) => setYuklar(yuklar.map((x, j) => (j === i ? { ...x, birlik: e.target.value } : x)))} />
            <input className={`${INP} h-8 px-2 text-[12px]`} aria-label={t('Miqdor')} placeholder={t('miqdor')} inputMode="decimal" value={u.miqdor} onChange={(e) => setYuklar(yuklar.map((x, j) => (j === i ? { ...x, miqdor: e.target.value } : x)))} />
            <input className={`${INP} h-8 px-2 text-[12px]`} aria-label={t('Og‘irlik, t')} placeholder={t('t (og‘irlik)')} inputMode="decimal" value={u.ogirlik_t} onChange={(e) => setYuklar(yuklar.map((x, j) => (j === i ? { ...x, ogirlik_t: e.target.value } : x)))} />
            <select className={`${INP} h-8 px-2 text-[12px]`} aria-label={t('Qaysi obyektga')} value={u.obyekt_id} onChange={(e) => setYuklar(yuklar.map((x, j) => (j === i ? { ...x, obyekt_id: e.target.value } : x)))}>
              <option value="">{t('Obyekt (xarajat ulushi uchun)')}</option>{joylar.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}</select>
            <input className={`${INP} h-8 px-2 text-[12px]`} aria-label={t('Tushirish bekati')} placeholder={t('bekat №')} inputMode="numeric" value={u.tushirish_tartib} onChange={(e) => setYuklar(yuklar.map((x, j) => (j === i ? { ...x, tushirish_tartib: e.target.value } : x)))} />
            <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" aria-label={t('Yukni o‘chirish')} onClick={() => setYuklar(yuklar.filter((_, j) => j !== i))}><Trash2 /></button>
          </div>))}
        {oshdi && <p className="text-[12px] text-warn">{t('Yuk ({a} t) mashina sig‘imidan ({b} t) oshib ketdi.', { a: jamiTonna ?? 0, b: mashina?.yuk_t ?? 0 })}</p>}
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
        <div>
          <b className="text-[13px]">{t('Reja tannarxi (ichki)')}</b>
          {tn ? <ul className="mt-1 space-y-0.5 text-[12px]">
            <li>{t('Yoqilg‘i')}: <span className="num">{som(tn.yoqilgi.summa)}</span> <small className="text-text-mute">({tn.yoqilgi.normaL != null ? `${tn.yoqilgi.normaL} L` : t('me‘yor yo‘q')})</small></li>
            <li>{t('Haydovchi (soliq bilan)')}: <span className="num">{som(tn.haydovchi)}</span></li>
            <li>{t('Amortizatsiya / ijara')}: <span className="num">{som(tn.amortizatsiya)}</span></li>
            <li className="pt-1"><Tannarx jami={tn.jami} toliq={tn.toliq} /></li>
            {!tn.toliq && <li className="text-warn">{t('Yetishmaydi')}: {tn.yetishmaydi.join(', ')}</li>}
          </ul> : <p className="text-[12px] text-text-mute">{t('Mashinani tanlang')}</p>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {turi === 'tashqi' && <OpsMaydon nom={t('Mijoz nomi')}><input className={INP} value={mijoz} onChange={(e) => setMijoz(e.target.value)} /></OpsMaydon>}
          <OpsMaydon nom={t('Tarif')}><select className={INP} value={tarifId} onChange={(e) => setTarifId(e.target.value)}><option value="">{t('— tarifsiz —')}</option>{tariflar.filter((x) => x.holat === 'faol').map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}</select></OpsMaydon>
          <OpsMaydon nom={turi === 'tashqi' ? t('Mijozga narx, QQS siz') : t('Ichki qiymat, QQS siz')}><MoneyInput className={INP} value={narx} placeholder={t('kiritilmagan')} onValueChange={setNarx} /></OpsMaydon>
          <OpsMaydon nom={t('Me‘yor koeffitsienti')} izoh={t('Qish/yomon yo‘l: 1,1–1,3')}><input className={INP} inputMode="decimal" value={koef} onChange={(e) => setKoef(e.target.value)} /></OpsMaydon>
          {tavsiya && tavsiya.tavsiyaQqsSiz != null && (
            <div className="col-span-2 rounded-lg bg-surface p-2 text-[12px]">
              <div className="flex items-center justify-between gap-2"><span>{t('Tavsiya etilgan narx')}</span><NarxQqs qqsSiz={tavsiya.tavsiyaQqsSiz} qqsFoiz={tarif?.qqs_foiz ?? 12} /></div>
              <button type="button" className="fz-btn fz-btn--sm mt-1" onClick={() => setNarx(String(tavsiya.tavsiyaQqsSiz))}>{t('Narxga qo‘llash')}</button>
              {tavsiya.yetishmaydi.length > 0 && <p className="text-warn">{t('Tarif uchun yetishmaydi')}: {tavsiya.yetishmaydi.join(', ')}</p>}
            </div>)}
        </div>
      </div>
      <OpsMaydon nom={t('Izoh')}><textarea className={INP} rows={2} value={izoh} onChange={(e) => setIzoh(e.target.value)} /></OpsMaydon>
    </OpsOyna>
  );
}
