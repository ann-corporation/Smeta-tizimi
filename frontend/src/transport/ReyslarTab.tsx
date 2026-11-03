import { lazy, Suspense, useMemo, useState } from 'react';
import { ExternalLink, Plus } from 'lucide-react';
import { t } from '../i18n/til';
import { OpsBoshQator, OpsOyna } from '../components/kompaniya-ops/OpsUi';
import { toast } from '../umumiy/ui/Toast';
import { tannarxKorinish, type Bekat, type Reys } from '../api/t2-transport';
import { googleHavola, yandexHavola } from '../lib/transport/geo';
import { harakatMumkinmi, REYS_HOLATLARI, type ReysHolat } from '../lib/transport/holat';
import { useTJoylar, useTPark, useTReyslar, useTSozlama, useTYoz } from './hooks';
import { FormOyna, type Maydon } from './FormOyna';
import ReysTahrir from './ReysTahrir';
import { NarxQqs, Tannarx, bugunISO, foiz, oyBoshiISO, som, son } from './format';
import { xatoMatn } from './xato';

const Xarita = lazy(() => import('./TransportXarita'));

export const holatNom = (h: ReysHolat) => ({ reja: t('Reja'), yolda: t('Yo‘lda'), yetkazildi: t('Yetkazildi'), yopildi: t('Yopildi'), bekor: t('Bekor') })[h];
export const HOLAT_STAMP: Record<ReysHolat, string> = { reja: 'fz-stamp--info', yolda: 'fz-stamp--warn', yetkazildi: 'fz-stamp--ok', yopildi: 'fz-stamp--ok', bekor: 'fz-stamp--danger' };
const RANG = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#65a30d', '#c026d3'];

type Amal = 'boshla' | 'bekat' | 'yetkaz' | 'yop' | 'bekor' | 'otkaz';

export default function ReyslarTab({ kompaniyaId, dispetcher, haydovchi: haydRuxsat, moliyaYozish }: { kompaniyaId: number; dispetcher: boolean; haydovchi: boolean; moliyaYozish: boolean }) {
  const [dan, setDan] = useState(oyBoshiISO()); const [gacha, setGacha] = useState(bugunISO());
  const [koruv, setKoruv] = useState<'doska' | 'royxat' | 'xarita'>('doska');
  const reyslar = useTReyslar(kompaniyaId, dan, gacha); const park = useTPark(kompaniyaId); const joylar = useTJoylar(kompaniyaId); const soz = useTSozlama(kompaniyaId);
  const yoz = useTYoz(kompaniyaId);
  const [tahrir, setTahrir] = useState<{ reys: Reys | null } | null>(null);
  const [ochiqId, setOchiqId] = useState<number | null>(null);
  const [amal, setAmal] = useState<null | { tur: Amal; reys: Reys; bekat?: Bekat }>(null);
  const royxat = reyslar.data?.reyslar ?? [];
  const ochiq = royxat.find((r) => r.id === ochiqId) ?? null;
  const guruh = useMemo(() => Object.fromEntries(REYS_HOLATLARI.map((h) => [h, royxat.filter((r) => r.holat === h)])) as Record<ReysHolat, Reys[]>, [royxat]);

  const buyruq = async (a: 'reys_saqla' | 'reys_yurish' | 'reys_yop' | 'reys_bekor' | 'xarajat_otkaz', data: Record<string, unknown>) => {
    try { await yoz.mutateAsync({ amal: a, data }); } catch (e) { throw new Error(xatoMatn(e)); }
  };
  const num = (d: Record<string, unknown>, ...k: string[]) => { for (const x of k) if (d[x] === '') d[x] = null; return d; };

  const amalMaydonlar = (a: Amal, r: Reys): Maydon[] => {
    if (a === 'boshla') return [{ k: 'km', nom: t('Odometr (boshlanish), km'), tur: 'son', izoh: t('Bo‘sh qoldirilsa mashina odometri olinadi') }, { k: 'moto', nom: t('Moto-soat (boshlanish)'), tur: 'son' }];
    if (a === 'bekat') return [{ k: 'bekat_holat', nom: t('Holat'), tur: 'tanlov', majburiy: true, variantlar: [{ v: 'yetib_keldi', nom: t('Yetib keldi') }, { v: 'bajarildi', nom: t('Bajarildi (yuk topshirildi)') }, { v: 'otkazildi', nom: t('O‘tkazib yuborildi') }] },
      { k: 'qabul_qiluvchi', nom: t('Qabul qiluvchi (F.I.Sh.)'), tur: 'matn' }, { k: 'tasdiq_turi', nom: t('Tasdiq turi'), tur: 'tanlov', variantlar: [{ v: 'imzo', nom: t('Imzo') }, { v: 'foto', nom: t('Foto') }] },
      { k: 'tasdiq_ref', nom: t('Tasdiq havolasi (keyinroq foto/imzo yuklash)'), tur: 'matn', keng: true }, { k: 'izoh', nom: t('Izoh'), tur: 'matn', keng: true }];
    if (a === 'yetkaz') return [{ k: 'km', nom: t('Odometr (tugash), km'), tur: 'son' }, { k: 'moto', nom: t('Moto-soat (tugash)'), tur: 'son' }, { k: 'bosh_km', nom: t('Bo‘sh yurish, km'), tur: 'son' },
      { k: 'kutish_daqiqa', nom: t('Bekor turish, daqiqa'), tur: 'son' }, { k: 'yoqilgi_sarfi_l', nom: t('Haqiqiy yoqilg‘i sarfi, L'), tur: 'son' }, { k: 'yoqilgi_quyildi_l', nom: t('Quyilgan yoqilg‘i, L'), tur: 'son' },
      { k: 'yol_haqi', nom: t('Yo‘l haqi, so‘m'), tur: 'pul' }, { k: 'boshqa_xarajat', nom: t('Boshqa xarajat, so‘m'), tur: 'pul' }, { k: 'boshqa_izoh', nom: t('Boshqa xarajat izohi'), tur: 'matn', keng: true }];
    if (a === 'yop') return [{ k: 'yoqilgi_sarfi_l', nom: t('Haqiqiy yoqilg‘i sarfi, L'), tur: 'son' }, { k: 'yoqilgi_narx_fakt', nom: t('Haqiqiy yoqilg‘i narxi, so‘m/L'), tur: 'pul' }, { k: 'kutish_daqiqa', nom: t('Bekor turish, daqiqa'), tur: 'son' },
      { k: 'bosh_km', nom: t('Bo‘sh yurish, km'), tur: 'son' }, { k: 'yol_haqi', nom: t('Yo‘l haqi, so‘m'), tur: 'pul' }, { k: 'boshqa_xarajat', nom: t('Boshqa xarajat, so‘m'), tur: 'pul' },
      { k: 'narx_qqs_siz', nom: r.buyurtmachi_turi === 'tashqi' ? t('Mijozga narx, QQS siz') : t('Ichki qiymat, QQS siz'), tur: 'pul' }];
    if (a === 'bekor') return [{ k: 'sabab', nom: t('Bekor qilish sababi'), tur: 'matn', majburiy: true, keng: true }];
    return [{ k: 'toliq_emas_ham', nom: t('Tannarx to‘liq bo‘lmasa ham o‘tkazish'), tur: 'ha_yoq', izoh: t('Faqat ma‘lum moddalar yig‘indisi o‘tadi (QQS siz, МАШ).') }];
  };
  const amalBoshlangich = (a: Amal, r: Reys): Record<string, unknown> => a === 'yop'
    ? { yoqilgi_sarfi_l: r.yoqilgi_sarfi_l, yoqilgi_narx_fakt: r.yoqilgi_narx_fakt, kutish_daqiqa: r.kutish_daqiqa, bosh_km: r.bosh_km, yol_haqi: r.yol_haqi, boshqa_xarajat: r.boshqa_xarajat, narx_qqs_siz: r.narx_qqs_siz }
    : a === 'bekat' ? { bekat_holat: 'bajarildi' } : a === 'otkaz' ? { toliq_emas_ham: 'yoq' } : {};
  const amalBajar = async (data: Record<string, unknown>) => {
    if (!amal) return; const { tur, reys, bekat } = amal; const base = { id: reys.id, versiya: reys.versiya };
    if (tur === 'otkaz') { await buyruq('xarajat_otkaz', { id: reys.id, toliq_emas_ham: data.toliq_emas_ham === true }); toast(t('Xarajat obyektlarga o‘tkazildi')); return; }
    if (tur === 'bekor') { await buyruq('reys_bekor', { ...base, sabab: data.sabab }); toast(t('Reys bekor qilindi')); return; }
    if (tur === 'yop') { await buyruq('reys_yop', { ...base, ...num({ ...data }, 'narx_qqs_siz') }); toast(t('Reys yopildi, tannarx muhrlandi')); return; }
    const harakat = tur === 'bekat' ? { harakat: 'bekat', bekat_tartib: bekat?.tartib } : { harakat: tur };
    await buyruq('reys_yurish', { ...base, ...harakat, ...data }); toast(t('Saqlandi'));
  };

  const tugma = (tur: Amal, nom: string, r: Reys, ruxsat: boolean, bekat?: Bekat, birlamchi = false) => {
    if (!ruxsat) return null;
    return <button type="button" className={`fz-btn fz-btn--sm ${birlamchi ? 'fz-btn--primary' : ''}`} onClick={() => setAmal({ tur, reys: r, bekat })}>{nom}</button>;
  };
  const nuqtalar = (r: Reys) => r.bekatlar.filter((b) => b.lat != null && b.lng != null).map((b) => ({ lat: b.lat as number, lng: b.lng as number, nom: b.nom, holat: b.holat }));
  const xaritaMarshrutlar = royxat.filter((r) => r.holat !== 'bekor' && nuqtalar(r).length >= 2).slice(0, 40).map((r, i) => ({ id: r.id, nom: `${r.raqam ?? r.id}`, rang: RANG[i % RANG.length], nuqtalar: nuqtalar(r), chiziq: null }));
  const joyXarita = (joylar.data?.obyektlar ?? []).filter((j) => j.lat != null && j.lng != null) as Array<{ id: number; nom: string; lat: number; lng: number }>;

  const Karta = ({ r }: { r: Reys }) => (
    <button type="button" onClick={() => setOchiqId(r.id)} className="fz-card w-full p-2.5 text-left transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between gap-2"><b className="text-[12px]">{r.raqam}</b><span className="num text-[11px] text-text-mute">{r.sana}</span></div>
      <div className="mt-0.5 text-[12px]">{r.mashina_nomi}{r.davlat_raqami ? ` · ${r.davlat_raqami}` : ''}</div>
      <div className="text-[11px] text-text-mute">{r.haydovchi_ism ?? t('haydovchi biriktirilmagan')}</div>
      <div className="mt-1 truncate text-[11px] text-text-dim">{r.bekatlar.map((b) => b.nom).join(' → ')}</div>
      <div className="mt-1 flex items-center justify-between text-[11px]"><span className="num">{r.tannarx?.km != null ? `${son(r.tannarx.km)} ${t('km')}` : t('km kiritilmagan')}</span>
        {r.tannarx && <Tannarx jami={r.tannarx.jami} toliq={r.tannarx.toliq} />}</div>
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" aria-label={t('Dan')} value={dan} onChange={(e) => setDan(e.target.value)} className="h-8 rounded-lg border border-border bg-bg px-2 text-[12px]" />
        <input type="date" aria-label={t('Gacha')} value={gacha} onChange={(e) => setGacha(e.target.value)} className="h-8 rounded-lg border border-border bg-bg px-2 text-[12px]" />
        <div className="inline-flex overflow-hidden rounded-lg border border-border" role="group" aria-label={t('Ko‘rinish')}>
          {(['doska', 'royxat', 'xarita'] as const).map((k) => <button key={k} type="button" aria-pressed={koruv === k} onClick={() => setKoruv(k)} className={`px-3 py-1 text-[12px] ${koruv === k ? 'bg-accent text-white' : ''}`}>{k === 'doska' ? t('Doska') : k === 'royxat' ? t('Ro‘yxat') : t('Xarita')}</button>)}
        </div>
        {dispetcher && <button type="button" className="fz-btn fz-btn--primary ml-auto" onClick={() => setTahrir({ reys: null })}><Plus />{t('Yangi reys')}</button>}
      </div>
      {reyslar.isError && <div role="alert" className="rounded-lg border border-danger px-3 py-2 text-[12px] text-danger">{t('Reyslarni o‘qib bo‘lmadi.')}</div>}

      {koruv === 'doska' && (
        <div className="grid gap-3 overflow-x-auto md:grid-cols-5">
          {REYS_HOLATLARI.map((h) => (
            <div key={h} className="min-w-[220px]">
              <div className="mb-1.5 flex items-center justify-between"><span className={`fz-stamp ${HOLAT_STAMP[h]}`}>{holatNom(h)}</span><span className="num text-[12px] text-text-mute">{guruh[h].length}</span></div>
              <div className="flex flex-col gap-2">{guruh[h].map((r) => <Karta key={r.id} r={r} />)}{guruh[h].length === 0 && <div className="rounded-lg border border-dashed border-border p-3 text-center text-[11px] text-text-mute">{t('Bo‘sh')}</div>}</div>
            </div>))}
        </div>)}

      {koruv === 'royxat' && (
        <div className="overflow-x-auto"><table className="fz-table w-full text-[12px]">
          <thead><tr><th>{t('Reys')}</th><th>{t('Sana')}</th><th>{t('Mashina')}</th><th>{t('Haydovchi')}</th><th>{t('Marshrut')}</th><th>{t('Km')}</th><th>{t('Holat')}</th><th>{t('Tannarx (QQS siz)')}</th><th>{t('Narx (QQS bilan)')}</th></tr></thead>
          <tbody>
            {royxat.length === 0 && <OpsBoshQator ustun={9} matn={t('Tanlangan davrda reys yo‘q')} />}
            {royxat.map((r) => (
              <tr key={r.id} className="cursor-pointer" onClick={() => setOchiqId(r.id)}>
                <td className="font-medium">{r.raqam}</td><td>{r.sana}</td><td>{r.mashina_nomi}</td><td>{r.haydovchi_ism ?? '—'}</td>
                <td className="max-w-[240px] truncate">{r.bekatlar.map((b) => b.nom).join(' → ')}</td><td className="num">{son(r.tannarx?.km)}</td>
                <td><span className={`fz-stamp ${HOLAT_STAMP[r.holat]}`}>{holatNom(r.holat)}</span></td>
                <td>{r.tannarx ? <Tannarx jami={r.tannarx.jami} toliq={r.tannarx.toliq} /> : '—'}</td><td><NarxQqs qqsSiz={r.narx_qqs_siz} qqsFoiz={r.qqs_foiz} /></td>
              </tr>))}
          </tbody></table></div>)}

      {koruv === 'xarita' && (
        <Suspense fallback={<div className="h-[460px] rounded-lg border border-border" />}>
          <Xarita joylar={joyXarita} marshrutlar={xaritaMarshrutlar} balandlik={460} />
          <p className="text-[11px] text-text-mute">{t('Obyektlar — tizimdagi koordinatalar bo‘yicha. Reys chiziqlari bekatlar orasidagi to‘g‘ri chiziq (yo‘l bo‘yicha marshrut reys kartasida).')}</p>
        </Suspense>)}

      {tahrir && park.data && (
        <ReysTahrir ochiq boshlangich={tahrir.reys} mashinalar={park.data.mashinalar} haydovchilar={park.data.haydovchilar} joylar={joylar.data?.obyektlar ?? []}
          tariflar={soz.data?.tariflar ?? []} yoqilgiNarxlari={soz.data?.yoqilgi_narxlari ?? []} onSaqla={(d) => buyruq('reys_saqla', d)} onYop={() => setTahrir(null)} />)}

      <OpsOyna ochiq={!!ochiq} sarlavha={ochiq ? `${t('Reys')} ${ochiq.raqam ?? ''}` : ''} onYop={() => setOchiqId(null)} kenglik={760}
        amallar={ochiq && <>
          {tugma('bekor', t('Bekor qilish'), ochiq, dispetcher && harakatMumkinmi(ochiq.holat, 'bekor'))}
          {dispetcher && harakatMumkinmi(ochiq.holat, 'tahrir') && <button type="button" className="fz-btn fz-btn--sm" onClick={() => { setTahrir({ reys: ochiq }); setOchiqId(null); }}>{t('Tahrirlash')}</button>}
          {tugma('boshla', t('Reysni boshlash'), ochiq, (haydRuxsat || dispetcher) && harakatMumkinmi(ochiq.holat, 'boshla'), undefined, true)}
          {tugma('yetkaz', t('Yetkazildi'), ochiq, (haydRuxsat || dispetcher) && harakatMumkinmi(ochiq.holat, 'yetkaz'), undefined, true)}
          {tugma('yop', t('Yopish va tannarxni muhrlash'), ochiq, dispetcher && harakatMumkinmi(ochiq.holat, 'yop'), undefined, true)}
          {tugma('otkaz', t('Obyekt xarajatiga o‘tkazish'), ochiq, moliyaYozish && ochiq.holat === 'yopildi' && ochiq.taqsimot.some((q) => q.holat === 'hisoblangan'), undefined, true)}
        </>}>
        {ochiq && <ReysTafsilot r={ochiq} obyektNom={(id) => joylar.data?.obyektlar.find((o) => o.id === id)?.nom ?? `#${id}`} bekatTugma={(b) => (haydRuxsat || dispetcher) && ochiq.holat === 'yolda' && b.holat !== 'bajarildi' && b.holat !== 'otkazildi'
          ? <button type="button" className="fz-btn fz-btn--sm" onClick={() => setAmal({ tur: 'bekat', reys: ochiq, bekat: b })}>{t('Bekat holati')}</button> : null} />}
      </OpsOyna>

      {amal && (
        <FormOyna ochiq sarlavha={amal.tur === 'otkaz' ? t('Xarajatga o‘tkazish') : amal.tur === 'yop' ? t('Reysni yopish') : amal.tur === 'bekor' ? t('Reysni bekor qilish') : amal.tur === 'bekat' ? `${t('Bekat')} ${amal.bekat?.tartib}: ${amal.bekat?.nom}` : amal.tur === 'boshla' ? t('Reysni boshlash') : t('Reysni yakunlash')}
          maydonlar={amalMaydonlar(amal.tur, amal.reys)} boshlangich={amalBoshlangich(amal.tur, amal.reys)} onSaqla={amalBajar} onYop={() => setAmal(null)} kenglik={520} />)}
    </div>
  );
}

/** Reys tafsiloti: bekatlar, yuk, tannarx tarkibi, ulushlar. Fayl tashqarisida ham (haydovchi ko'rinishida) ishlatiladi. */
export function ReysTafsilot({ r, obyektNom, bekatTugma }: { r: Reys; obyektNom: (id: number) => string; bekatTugma?: (b: Bekat) => React.ReactNode }) {
  const pts = r.bekatlar.filter((b) => b.lat != null && b.lng != null).map((b) => ({ lat: b.lat as number, lng: b.lng as number }));
  const g = googleHavola(pts), y = yandexHavola(pts);
  const tn = r.tannarx ? tannarxKorinish(r.tannarx) : null;
  const holatB = (h: Bekat['holat']) => ({ kutilmoqda: t('Kutilmoqda'), yetib_keldi: t('Yetib keldi'), bajarildi: t('Bajarildi'), otkazildi: t('O‘tkazildi') })[h];
  return (
    <div className="flex flex-col gap-3 text-[12px]">
      <div className="flex flex-wrap items-center gap-2"><span className={`fz-stamp ${HOLAT_STAMP[r.holat]}`}>{holatNom(r.holat)}</span><span>{r.sana}</span><span>{r.mashina_nomi}</span><span>{r.haydovchi_ism ?? t('haydovchi biriktirilmagan')}</span>
        <span className="text-text-mute">{r.buyurtmachi_turi === 'tashqi' ? `${t('Tashqi')}: ${r.mijoz_nom ?? '—'}` : t('Ichki')}</span>
        {g && <a className="fz-btn fz-btn--ghost fz-btn--sm" href={g} target="_blank" rel="noreferrer"><ExternalLink />{'Google Maps'}</a>}{y && <a className="fz-btn fz-btn--ghost fz-btn--sm" href={y} target="_blank" rel="noreferrer"><ExternalLink />{'Yandex'}</a>}</div>
      {r.holat === 'bekor' && <div className="rounded-lg border border-danger px-3 py-2 text-danger">{t('Bekor sababi')}: {r.bekor_sabab}</div>}
      <ol className="flex flex-col gap-1">
        {r.bekatlar.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2 py-1.5">
            <span><b className="num">{b.tartib}.</b> {b.nom} <small className="text-text-mute">({b.turi === 'yuklash' ? t('yuklash') : b.turi === 'tushirish' ? t('tushirish') : t('oraliq')}{b.obyekt_id ? ` · ${obyektNom(b.obyekt_id)}` : ''})</small>
              {b.qabul_qiluvchi && <small className="block text-text-mute">{t('Qabul qildi')}: {b.qabul_qiluvchi}{b.tasdiq_turi ? ` · ${b.tasdiq_turi === 'imzo' ? t('imzo') : t('foto')}` : ''}</small>}</span>
            <span className="flex items-center gap-2"><span className="fz-chip">{holatB(b.holat)}</span>{bekatTugma?.(b)}</span>
          </li>))}
      </ol>
      {r.yuklar.length > 0 && <div><b>{t('Yuk')}</b><ul className="mt-0.5">{r.yuklar.map((u) => <li key={u.id}>{u.nom} — <span className="num">{son(u.miqdor)} {u.birlik ?? ''}</span>{u.ogirlik_t != null ? <span className="num"> · {son(u.ogirlik_t, 2)} {t('t')}</span> : null}{u.obyekt_id ? ` → ${obyektNom(u.obyekt_id)}` : ''}</li>)}</ul></div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-2">
          <b>{r.holat === 'yopildi' ? t('Tannarx (muhrlangan, QQS siz)') : t('Tannarx (hisob-kitob, QQS siz)')}</b>
          {tn ? <table className="mt-1 w-full"><tbody>
            <tr><td>{t('Masofa')}</td><td className="num text-right">{son(tn.km)} {t('km')} {tn.kmManba === 'reja' ? <small className="text-warn">({t('reja')})</small> : null}</td></tr>
            <tr><td>{t('Yoqilg‘i')}{tn.yoqilgi.ogishFoiz != null ? <small className={tn.yoqilgi.ogishFoiz > 10 ? 'text-danger' : 'text-text-mute'}> ({t('me‘yordan')} {tn.yoqilgi.ogishFoiz > 0 ? '+' : ''}{tn.yoqilgi.ogishFoiz}%)</small> : null}</td><td className="num text-right">{som(tn.yoqilgi.summa)}</td></tr>
            <tr><td>{t('Haydovchi')}</td><td className="num text-right">{som(tn.haydovchi)}</td></tr>
            <tr><td>{t('Amortizatsiya / ijara')}</td><td className="num text-right">{som(tn.amortizatsiya)}</td></tr>
            <tr><td>{t('Bekor turish')}</td><td className="num text-right">{som(tn.kutish)}</td></tr>
            <tr><td>{t('Yo‘l haqi / boshqa')}</td><td className="num text-right">{tn.yolHaqi == null && tn.boshqa == null ? '—' : som((tn.yolHaqi ?? 0) + (tn.boshqa ?? 0))}</td></tr>
            <tr className="border-t border-border"><td><b>{t('Jami')}</b></td><td className="text-right"><Tannarx jami={tn.jami} toliq={tn.toliq} /></td></tr>
          </tbody></table> : <p className="text-text-mute">—</p>}
          {tn && !tn.toliq && <p className="mt-1 text-warn">{t('Yetishmaydi')}: {tn.yetishmaydi.join(', ')}</p>}
        </div>
        <div className="rounded-lg border border-border p-2">
          <b>{r.buyurtmachi_turi === 'tashqi' ? t('Mijozga narx') : t('Ichki qiymat')}</b>
          <div className="mt-1"><NarxQqs qqsSiz={r.narx_qqs_siz} qqsFoiz={r.qqs_foiz} /></div>
          {r.narx_qqs_siz != null && tn && <p className="mt-1">{t('Foyda (QQS siz)')}: <b className={r.narx_qqs_siz - tn.jami < 0 ? 'text-danger' : 'text-ok'}>{som(r.narx_qqs_siz - tn.jami)}</b> · {foiz(r.narx_qqs_siz ? ((r.narx_qqs_siz - tn.jami) / r.narx_qqs_siz) * 100 : null)}{!tn.toliq && <small className="text-warn"> ({t('tannarx to‘liq emas')})</small>}</p>}
          {r.taqsimot.length > 0 && <div className="mt-2"><b>{t('Obyektlarga ulush')}</b><ul>{r.taqsimot.map((q) => <li key={q.id}>{obyektNom(q.obyekt_id)}: <span className="num">{som(q.summa_qqs_siz)}</span> <small className="text-text-mute">({Math.round(q.ulush * 1000) / 10}% · {q.asos === 'ogirlik' ? t('og‘irlik') : t('teng')}{q.holat === 'otkazilgan' ? ` · ${t('xarajatga o‘tgan')}` : ''})</small></li>)}</ul></div>}
        </div>
      </div>
    </div>
  );
}

