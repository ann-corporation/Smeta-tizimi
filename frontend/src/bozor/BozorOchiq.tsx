/**
 * /bozor — ochiq vitrina (KIRMASDAN): qidiruv (lotin/kirill farqsiz), tur/kategoriya/hudud filtri, e'lon sahifasi, sotuvchi sahifasi + reyting.
 * Amallar (so'rov yuborish, e'lon berish, shikoyat) hisob talab qiladi: kirish sahifasiga yo'naltiriladi (state.qaytish).
 * Faqat sotuvchi E'LON QILGAN ma'lumot ko'rinadi (telefon, kompaniya, boshqa tenant ma'lumoti YO'Q). Narx doim QQS siz (birlik); QQS yorlig'i alohida.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { t } from '../i18n/til';
import { FmtN } from '../lib/format';
import { bzElon, bzFiltr, bzQidir, bzRasmUrl, bzShikoyat, bzSotuvchi, type ElonTafsilot, type OchiqElon, type SotuvchiSahifa } from '../api/t2-bozor';
import { ELON_TURLARI, HUDUDLAR, KATEGORIYALAR, kategoriyaNomi, qidiruvVariantlari } from '../lib/bozor/katalog';

const katta = 'flex min-h-[48px] items-center justify-center rounded-xl px-4 text-[16px] font-semibold';
const maydon = 'h-12 w-full rounded-lg border border-border px-3 text-[16px]';

const Yulduz = ({ r, soni }: { r: number | null; soni: number }) => (
  <span className="text-[13px] text-text-mute" title={t('Reyting')}>{r == null ? t('Baho yo‘q') : `★ ${r.toFixed(1)} (${soni})`}</span>
);
const Narx = ({ v, birlik, qqsBor }: { v: number | null; birlik: string; qqsBor?: boolean }) => (
  <span className="tabular-nums"><FmtN val={v} /> <span className="text-[12px] text-text-mute">{t('so‘m')} / {birlik}{v != null ? ` · ${qqsBor ? t('QQS bilan sotiladi') : t('QQS siz')}` : ''}</span></span>
);
const Rasm = ({ k, cl }: { k?: string; cl: string }) => (k
  ? <img src={bzRasmUrl(k)} alt="" loading="lazy" className={`${cl} object-cover`} />
  : <div className={`${cl} flex items-center justify-center bg-surface-2 text-[12px] text-text-mute`}>{t('Rasm yo‘q')}</div>);
const kirish = (qaytish: string) => ({ to: '/', state: { qaytish } });

function Sarlavha() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
      <Link to="/bozor" className="text-[20px] font-bold">{t('Qurilish bozori')}</Link>
      <nav className="flex gap-2 text-[14px]">
        <Link {...kirish('/admin/bozor-kabinet')} className="rounded-lg border border-border px-3 py-2">{t('E‘lon berish')}</Link>
        <Link to="/yuk" className="rounded-lg border border-border px-3 py-2">{t('Yuk tashish')}</Link>
      </nav>
    </header>
  );
}

function Vitrina() {
  const [q, setQ] = useState('');
  const [tur, setTur] = useState('');
  const [kat, setKat] = useState('');
  const [hudud, setHudud] = useState('');
  const [elonlar, setElonlar] = useState<OchiqElon[] | null>(null);
  const [xato, setXato] = useState(false);
  const [sonlar, setSonlar] = useState<Record<string, number>>({});
  const yukla = useCallback(async () => {
    setXato(false);
    const r = await bzQidir({ q: q.trim() ? qidiruvVariantlari(q) : undefined, tur: tur || undefined, kategoriya: kat || undefined, hudud: hudud || undefined });
    if (r.ok) setElonlar(r.natija.elonlar); else { setElonlar([]); setXato(true); }
  }, [q, tur, kat, hudud]);
  useEffect(() => { const h = setTimeout(() => void yukla(), 250); return () => clearTimeout(h); }, [yukla]);
  useEffect(() => { void bzFiltr().then((r) => { if (r.ok) setSonlar(Object.fromEntries(r.natija.kategoriyalar.map((k) => [k.kalit, k.soni]))); }); }, []);
  const kats = KATEGORIYALAR.filter((k) => !tur || k.tur === tur);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3 p-4">
      <input className={maydon} type="search" aria-label={t('Qidirish')} placeholder={t('Masalan: g‘isht, цемент, ekskavator')} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <select className="h-11 rounded-lg border border-border px-2" aria-label={t('Tur')} value={tur} onChange={(e) => { setTur(e.target.value); setKat(''); }}>
          <option value="">{t('Hammasi')}</option>{ELON_TURLARI.map((x) => <option key={x.kalit} value={x.kalit}>{t(x.nom)}</option>)}
        </select>
        <select className="h-11 rounded-lg border border-border px-2" aria-label={t('Kategoriya')} value={kat} onChange={(e) => setKat(e.target.value)}>
          <option value="">{t('Barcha kategoriyalar')}</option>{kats.map((x) => <option key={x.kalit} value={x.kalit}>{t(x.nom)}{sonlar[x.kalit] ? ` (${sonlar[x.kalit]})` : ''}</option>)}
        </select>
        <select className="h-11 rounded-lg border border-border px-2" aria-label={t('Hudud')} value={hudud} onChange={(e) => setHudud(e.target.value)}>
          <option value="">{t('Butun O‘zbekiston')}</option>{HUDUDLAR.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>
      {xato && <p role="alert" className="text-[14px] text-warn">{t('Bozor hozir ochilmadi. Birozdan keyin urinib ko‘ring.')}</p>}
      {elonlar == null ? <p className="text-text-mute">{t('Yuklanmoqda…')}</p> : elonlar.length === 0 && !xato ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
          <p>{t('Bu qidiruv bo‘yicha e‘lon yo‘q.')}</p>
          <Link {...kirish('/admin/bozor-kabinet')} className={`${katta} bg-blue-600 text-white`}>{t('Birinchi e‘lonni siz bering')}</Link>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {elonlar.map((e) => (
            <li key={e.id}>
              <Link to={`/bozor/e/${e.id}`} className="flex h-full flex-col overflow-hidden rounded-xl border border-border">
                <Rasm k={e.rasmlar[0]} cl="h-36 w-full" />
                <div className="flex flex-col gap-1 p-3">
                  <span className="text-[12px] text-text-mute">{t(ELON_TURLARI.find((x) => x.kalit === e.tur)?.nom ?? '')}{e.kategoriya && kategoriyaNomi(e.kategoriya) ? ` · ${t(kategoriyaNomi(e.kategoriya) as string)}` : ''}</span>
                  <span className="text-[16px] font-semibold">{e.sarlavha}</span>
                  <Narx v={e.narx_qqs_siz} birlik={e.birlik} qqsBor={e.qqs_bor} />
                  <span className="text-[13px] text-text-mute">{e.sotuvchi_nom}{e.hudud ? ` · ${e.hudud}` : ''} · <Yulduz r={e.sotuvchi_reyting} soni={e.sotuvchi_baho_soni} /></span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Shikoyat: hisob kerak (kirmagan bo'lsa kirish sahifasiga). Uch alohida shikoyatdan keyin e'lon avtomatik yashiriladi (sozlama). */
function Shikoyat({ elonId }: { elonId: number }) {
  const nav = useNavigate();
  const [och, setOch] = useState(false);
  const [sabab, setSabab] = useState('');
  const [holat, setHolat] = useState<'' | 'band' | 'ok' | 'xato'>('');
  const yubor = async () => {
    setHolat('band');
    const r = await bzShikoyat(elonId, sabab);
    if (r.ok) { setHolat('ok'); return; }
    if (r.code === 'AUTH_REQUIRED' || r.code === 'HTTP_401') { nav('/', { state: { qaytish: `/bozor/e/${elonId}` } }); return; }
    setHolat('xato');
  };
  if (holat === 'ok') return <p className="text-center text-[13px]">{t('Shikoyat qabul qilindi. Rahmat.')}</p>;
  if (!och) return <button type="button" onClick={() => setOch(true)} className="text-center text-[13px] text-text-mute underline">{t('Shikoyat qilish')}</button>;
  return (
    <div className="flex flex-col gap-2">
      <textarea className="min-h-[72px] rounded-lg border border-border p-2 text-[15px]" aria-label={t('Shikoyat sababi')} placeholder={t('Sabab (kamida 3 belgi)')} value={sabab} onChange={(e) => setSabab(e.target.value)} />
      <button type="button" disabled={holat === 'band' || sabab.trim().length < 3} onClick={() => void yubor()} className={`${katta} border border-border`}>{t('Yuborish')}</button>
      {holat === 'xato' && <p role="alert" className="text-[13px] text-warn">{t('Yuborib bo‘lmadi.')}</p>}
    </div>
  );
}

function ElonSahifa({ id }: { id: number }) {
  const [d, setD] = useState<ElonTafsilot | null | false>(null);
  const [rasm, setRasm] = useState(0);
  useEffect(() => { void bzElon(id).then((r) => setD(r.ok ? r.natija : false)); }, [id]);
  if (d === null) return <p className="p-4 text-text-mute">{t('Yuklanmoqda…')}</p>;
  if (d === false) return <p className="p-4">{t('E‘lon topilmadi yoki yashirilgan.')} <Link to="/bozor" className="underline">{t('Bozorga qaytish')}</Link></p>;
  const { elon: e, sotuvchi: s } = d;
  return (
    <div className="mx-auto grid max-w-4xl gap-4 p-4 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Rasm k={e.rasmlar[rasm]} cl="h-64 w-full rounded-xl" />
        {e.rasmlar.length > 1 && <div className="flex gap-2">{e.rasmlar.map((k, i) => <button key={k} type="button" aria-label={`${t('Rasm')} ${i + 1}`} onClick={() => setRasm(i)} className={`h-14 w-14 overflow-hidden rounded border ${i === rasm ? 'border-blue-600' : 'border-border'}`}><Rasm k={k} cl="h-full w-full" /></button>)}</div>}
      </div>
      <div className="flex flex-col gap-3">
        <h1 className="text-[22px] font-bold">{e.sarlavha}</h1>
        <div className="text-[18px]"><Narx v={e.narx_qqs_siz} birlik={e.birlik} qqsBor={e.qqs_bor} /></div>
        {e.min_hajm != null && <p className="text-[14px]">{t('Eng kam hajm')}: <FmtN val={e.min_hajm} /> {e.birlik}</p>}
        <p className="text-[14px] text-text-mute">{[e.hudud, e.radius_km ? `${t('yetkazish')} ≤ ${e.radius_km} km` : null].filter(Boolean).join(' · ')}</p>
        {e.tavsif && <p className="whitespace-pre-wrap text-[15px]">{e.tavsif}</p>}
        <Link to={`/bozor/s/${s.id}`} className="rounded-xl border border-border p-3">
          <span className="block font-semibold">{s.nom}</span>
          <span className="text-[13px] text-text-mute">{s.hudud ?? ''} · <Yulduz r={s.reyting.ortacha} soni={s.reyting.soni} /></span>
        </Link>
        <Link {...kirish('/admin/bozor-kabinet')} className={`${katta} bg-blue-600 text-white`}>{t('So‘rov yuborish')}</Link>
        <Shikoyat elonId={e.id} />
        <p className="text-[12px] text-text-mute">{t('Aloqa va bitim hisob ochilgach. To‘lov platformada ushlanmaydi: narxni tomonlar kelishadi.')}</p>
      </div>
    </div>
  );
}

function SotuvchiKorinish({ id }: { id: number }) {
  const [d, setD] = useState<SotuvchiSahifa | null | false>(null);
  useEffect(() => { void bzSotuvchi(id).then((r) => setD(r.ok ? r.natija : false)); }, [id]);
  if (d === null) return <p className="p-4 text-text-mute">{t('Yuklanmoqda…')}</p>;
  if (d === false) return <p className="p-4">{t('Sotuvchi topilmadi.')} <Link to="/bozor" className="underline">{t('Bozorga qaytish')}</Link></p>;
  const s = d.sotuvchi;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-bold">{s.nom}</h1>
        <span className="text-[14px] text-text-mute">{s.hudud ?? ''} · <Yulduz r={s.reyting.ortacha} soni={s.reyting.soni} /></span>
        {s.tavsif && <p className="text-[15px]">{s.tavsif}</p>}
      </div>
      <h2 className="text-[16px] font-semibold">{t('Faol e‘lonlar')}</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {d.elonlar.map((e) => <li key={e.id}><Link to={`/bozor/e/${e.id}`} className="flex gap-3 rounded-xl border border-border p-2"><Rasm k={e.rasmlar[0]} cl="h-16 w-16 rounded" /><span className="flex flex-col"><span className="font-semibold">{e.sarlavha}</span><Narx v={e.narx_qqs_siz} birlik={e.birlik} qqsBor={e.qqs_bor} /></span></Link></li>)}
      </ul>
      {d.baholar.length > 0 && (<>
        <h2 className="text-[16px] font-semibold">{t('So‘nggi baholar')}</h2>
        <ul className="flex flex-col gap-1">{d.baholar.map((b, i) => <li key={i} className="text-[14px]">★ {b.ball}{b.izoh ? ` — ${b.izoh}` : ''}</li>)}</ul>
      </>)}
    </div>
  );
}

export default function BozorOchiq() {
  const { elonId, sotuvchiId } = useParams();
  const e = Number(elonId); const s = Number(sotuvchiId);
  return (
    <main className="min-h-screen bg-bg text-text">
      <Sarlavha />
      {Number.isSafeInteger(e) && e > 0 ? <ElonSahifa id={e} /> : Number.isSafeInteger(s) && s > 0 ? <SotuvchiKorinish id={s} /> : <Vitrina />}
    </main>
  );
}
