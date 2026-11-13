/**
 * USTA / BRIGADIR / PROROB «BUGUN» — telefon uchun (≤375 px, katta tugmalar, oddiy o'zbekcha).
 * Obyekt → bugungi ishlar (qoldiq bilan) → bajarilgan hajm (katta +/−, birlik tushuntirilgan) → yuborish.
 * Usta kiritgani QORALAMA bo'lib prorab/PTO tasdig'iga ketadi; fakt.write bor foydalanuvchi esa mavjud fakt yo'liga yozadi.
 * Oflayn: kiritma IndexedDB navbatiga tushadi, internet qaytganda o'z operation_id bilan yuboriladi (takror xavfsiz).
 * Pul YO'Q: faqat hajm, material nomi, izoh va foto.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, ClipboardList, Hammer, Mic, Minus, Plus, Users, WifiOff } from 'lucide-react';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { useT2ObyektlarRoyxati } from '../../api/t2-obyektlar-kesh';
import { yangiOperationId } from '../../api/supabase';
import { bugungiIshlarManbasi, type BugunQator } from '../../lib/usta/bugungi-ishlar';
import { bajarildiYuk, type NaryadSatr } from '../../lib/usta/naryad-ish';
import { UstaNaryad } from './UstaNaryad';
import { faktTogriYoz, navbatYozuviniYubor, sbUstaQoralamalarOl } from '../../api/t2-usta';
import { hrOyOl, hrTabelSaqla, hrXodimlarOl, hrXato, type HrOy, type HrXodim } from '../../api/t2-hr';
import { keshOqi as idbKeshOqi, keshYoz as idbKeshYoz, navbatOmbori, navbatniYubor, type NavbatOmbor, type NavbatYozuv } from '../../lib/usta/navbat';
import { birlikIzohi, hajmMatni, QADAM } from '../../lib/usta/birlik';
import { toast } from '../../umumiy/ui/Toast';
import { t } from '../../i18n/til';

type Ekran = 'bosh' | 'ishlar' | 'kirit' | 'zayavka' | 'tabel';

const KESH = 'smeta-usta-ishlar-v1';
const mahalliySana = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Ish ro'yxatini oflayn uchun saqlash (faqat hajm/nom — pul yo'q). Xato bo'lsa jim. */
function keshOqi(obyektId: number, tur: string): BugunQator[] | null {
  try { const j = JSON.parse(localStorage.getItem(`${KESH}:${tur}:${obyektId}`) || 'null'); return Array.isArray(j) ? j : null; } catch { return null; }
}
function keshYoz(obyektId: number, tur: string, q: BugunQator[]) { try { localStorage.setItem(`${KESH}:${tur}:${obyektId}`, JSON.stringify(q.slice(0, 300))); } catch { /* kvota */ } }

/** Foto: eng uzun tomoni 1280 px, JPEG 0.7 — telefon kamerasidan kelgan katta fayl internetni to'ldirmasin. */
export async function fotoSiq(f: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('siqilmadi'))), 'image/jpeg', 0.7));
  } catch { return f; }
}

type OvozTanish = { start(): void; stop(): void; lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
const ovozBor = () => typeof window !== 'undefined' && !!(Reflect.get(window, 'SpeechRecognition') || Reflect.get(window, 'webkitSpeechRecognition'));

const Katta = ({ className = '', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
  <button type="button" {...p} className={`flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-4 text-[17px] font-semibold text-text active:scale-[0.99] disabled:opacity-50 ${className}`} />;

export default function UstaBugun() {
  const { joriy, superadmin } = useKompaniya() as { joriy?: { id: number; nom: string; permissions?: string[] } | null; superadmin?: boolean };
  const kid = joriy?.id ?? null;
  const ruxsat = useCallback((p: string) => !!superadmin || !!joriy?.permissions?.includes(p), [superadmin, joriy]);
  const faktYoza = ruxsat('fakt.write');
  const tabelYoza = ruxsat('hr.tabel.write');
  const { obyektlar, yuklanmoqda: obYuklanmoqda } = useT2ObyektlarRoyxati(kid);

  const [ekran, setEkran] = useState<Ekran>('bosh');
  const [obyektId, setObyektId] = useState<number | null>(null);
  const [onlayn, setOnlayn] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [navbatSoni, setNavbatSoni] = useState(0);
  const [rad, setRad] = useState<NavbatYozuv[]>([]);
  const [kutilmoqda, setKutilmoqda] = useState<number | null>(null);
  const ombor = useRef<NavbatOmbor | null>(null);
  ombor.current ??= navbatOmbori();

  const yangilaNavbat = useCallback(async () => {
    const h = await ombor.current!.hammasi();
    setNavbatSoni(h.filter((y) => !y.xato).length); setRad(h.filter((y) => !!y.xato));
  }, []);

  const yubor = useCallback(async (y: NavbatYozuv) => (faktYoza && y.tur === 'fakt' ? faktTogriYoz(y) : navbatYozuviniYubor(y)), [faktYoza]);
  const sinxron = useCallback(async () => {
    const h = await navbatniYubor(ombor.current!, yubor);
    if (h.yuborildi > 0) toast(faktYoza ? t('{n} ta yozuv yuborildi', { n: h.yuborildi }) : t('{n} ta yozuv yuborildi — prorab tasdiqlashini kutmoqda', { n: h.yuborildi }), 'ok');
    await yangilaNavbat();
  }, [yubor, yangilaNavbat, faktYoza]);

  useEffect(() => {
    const on = () => { setOnlayn(true); void sinxron(); }; const off = () => setOnlayn(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    void sinxron();
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [sinxron]);

  const obyekt = obyektlar.find((o) => o.id === obyektId) ?? null;

  /** «Tasdiq kutilmoqda» soni (obyekt bo'yicha) — faqat tarmoq bor va qoralamalar bo'lsa. */
  useEffect(() => {
    if (kid == null || obyektId == null || !onlayn || faktYoza) { setKutilmoqda(null); return; }
    let faol = true;
    void sbUstaQoralamalarOl(kid, 'qoralama', obyektId).then((r) => { if (faol) setKutilmoqda(r.ok ? (r.qatorlar?.length ?? 0) : null); }).catch(() => undefined);
    return () => { faol = false; };
  }, [kid, obyektId, onlayn, faktYoza, navbatSoni]);

  /* ───────── Ishlar ro'yxati (bugungi: qoldig'i bor ishlar) ───────── */
  const [ishlar, setIshlar] = useState<BugunQator[]>([]);
  const [ishXato, setIshXato] = useState('');
  const [yuk, setYuk] = useState(false);
  const [qidiruv, setQidiruv] = useState('');
  const [tanlangan, setTanlangan] = useState<BugunQator | null>(null);
  const [rejim, setRejim] = useState<'ish' | 'mat'>('ish');
  /** Usta o'z naryadlari (o'z birligida). Bo'sh bo'lsa — avvalgi xulq: BL qoldiqli ishlar → fakt qoralama. */
  const [naryadSatr, setNaryadSatr] = useState<NaryadSatr[]>([]);

  const qatorlarniOl = useCallback(async (oid: number, tur: 'bl' | 'mat') => {
    setYuk(true); setIshXato('');
    const eski = keshOqi(oid, tur); if (eski) setIshlar(eski);
    const r = await bugungiIshlarManbasi(oid, tur, { kompaniyaId: kid ?? undefined, naryad: !faktYoza });
    if (r.ok) {
      const q = r.qatorlar;
      if (tur === 'bl') { setNaryadSatr(r.naryad); if (r.naryad.length) void idbKeshYoz(`naryad:${oid}`, r.naryad.map((x) => ({ ...x, summa: null }))); }
      setIshlar(q); keshYoz(oid, tur, q);
    } else {
      /* Oflayn: oxirgi yuklangan naryad satrlari ham ko'rinadi (navbat bilan bir IndexedDB; summa saqlanmaydi). */
      if (tur === 'bl') void idbKeshOqi<NaryadSatr[]>(`naryad:${oid}`).then((k) => { if (k?.length) setNaryadSatr(k); });
      if (!eski) setIshXato(onlayn ? t('Ishlar ro‘yxati o‘qilmadi. Qayta urinib ko‘ring.') : t('Internet yo‘q va ro‘yxat saqlanmagan. Avval internetda bir marta oching.'));
    }
    setYuk(false);
  }, [onlayn, kid, faktYoza]);

  const obyektTanla = (id: number) => { setObyektId(id); setEkran('ishlar'); setRejim('ish'); setQidiruv(''); void qatorlarniOl(id, 'bl'); };

  const korinadigan = useMemo(() => {
    const q = qidiruv.trim().toLowerCase();
    return (q ? ishlar.filter((x) => `${x.kod ?? ''} ${x.nom}`.toLowerCase().includes(q)) : ishlar).slice(0, 60);
  }, [ishlar, qidiruv]);

  /* ───────── Kiritish ───────── */
  const [hajm, setHajm] = useState(0);
  const [izoh, setIzoh] = useState('');
  const [foto, setFoto] = useState<Blob | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [yuborilmoqda, setYuborilmoqda] = useState(false);
  const [yozmoqda, setYozmoqda] = useState(false);
  const tanish = useRef<OvozTanish | null>(null);
  useEffect(() => () => { if (fotoUrl) URL.revokeObjectURL(fotoUrl); }, [fotoUrl]);
  useEffect(() => () => { try { tanish.current?.stop(); } catch { /* ignore */ } }, []);

  const tozala = () => { setHajm(0); setIzoh(''); setFoto(null); setFotoUrl(null); setTanlangan(null); };
  const qoldiqOshdi = tanlangan?.qoldiq_hajm != null && hajm > tanlangan.qoldiq_hajm + 1e-9;

  const ovozBoshla = () => {
    const W = window as unknown as { SpeechRecognition?: new () => OvozTanish; webkitSpeechRecognition?: new () => OvozTanish };
    const C = W.SpeechRecognition ?? W.webkitSpeechRecognition; if (!C) return;
    if (yozmoqda) { try { tanish.current?.stop(); } catch { /* ignore */ } return; }
    const r = new C(); r.lang = 'uz-UZ'; r.interimResults = false; tanish.current = r;
    r.onresult = (e) => { const m = Array.from(e.results).map((x) => x[0]?.transcript ?? '').join(' ').trim(); if (m) setIzoh((o) => (o ? `${o} ${m}` : m)); };
    r.onend = () => setYozmoqda(false); r.onerror = () => { setYozmoqda(false); toast(t('Ovoz tanilmadi. Yozib kiriting.'), 'warn'); };
    setYozmoqda(true); try { r.start(); } catch { setYozmoqda(false); }
  };

  const yuborFakt = async () => {
    if (!tanlangan || kid == null || obyektId == null || hajm === 0 || yuborilmoqda) return;
    setYuborilmoqda(true);
    const y: NavbatYozuv = { id: yangiOperationId(), tur: 'fakt', kompaniyaId: kid, obyektId, yaratildi: Date.now(), urinish: 0, foto, fotoOperationId: foto ? yangiOperationId() : undefined,
      payload: { sana: mahalliySana(), qatorlar: [{ qator_id: tanlangan.qator_id, hajm }], izoh: izoh.trim() || null } };
    await ombor.current!.qosh(y); await yangilaNavbat();
    const h = await navbatniYubor(ombor.current!, yubor);
    await yangilaNavbat();
    if (h.yuborildi > 0) toast(faktYoza ? t('Saqlandi') : t('Yuborildi — prorab tasdiqlashini kutmoqda'), 'ok');
    else if (!navigator.onLine) toast(t('Internet yo‘q. Saqlab qo‘yildi — ulanganda o‘zi yuboriladi.'), 'warn');
    else toast(t('Hozir yuborilmadi. Saqlab qo‘yildi — keyinroq o‘zi yuboriladi.'), 'warn');
    setYuborilmoqda(false); tozala(); setEkran('ishlar');
  };

  /** «Bajardim» — naryad satri bo'yicha YAGONA kirish: navbatga (idempotent operation_id) → ajarildi; qabul — prorabda. */
  const bajardim = async (s: NaryadSatr, hajmUsta: number, izohMatn: string | null, tugadi: boolean) => {
    if (kid == null || obyektId == null) return;
    const y: NavbatYozuv = { id: yangiOperationId(), tur: 'naryad', kompaniyaId: kid, obyektId, yaratildi: Date.now(), urinish: 0,
      payload: { naryadId: s.naryadId, versiya: s.versiya, qatorlar: bajarildiYuk(naryadSatr.filter((x) => x.naryadId === s.naryadId), s.naryadQatorId, hajmUsta), tugadi, izoh: izohMatn } };
    await ombor.current!.qosh(y); await yangilaNavbat();
    const h = await navbatniYubor(ombor.current!, yubor); await yangilaNavbat();
    toast(h.yuborildi > 0 ? t('Yuborildi — prorab qabul qilishini kutmoqda') : t('Saqlab qo‘yildi — internet ulanganda yuboriladi.'), h.yuborildi > 0 ? 'ok' : 'warn');
    if (h.yuborildi > 0) void qatorlarniOl(obyektId, 'bl');
  };

  const yuborZayavka = async () => {
    if (!tanlangan || kid == null || obyektId == null || hajm <= 0 || yuborilmoqda) return;
    setYuborilmoqda(true);
    const y: NavbatYozuv = { id: yangiOperationId(), tur: 'zayavka', kompaniyaId: kid, obyektId, yaratildi: Date.now(), urinish: 0,
      payload: { nomi: tanlangan.nom, miqdor: hajm, birlik: tanlangan.birlik, izoh: izoh.trim() || null } };
    await ombor.current!.qosh(y);
    const h = await navbatniYubor(ombor.current!, yubor); await yangilaNavbat();
    toast(h.yuborildi > 0 ? t('Zayavka yuborildi') : t('Saqlab qo‘yildi — internet ulanganda yuboriladi.'), h.yuborildi > 0 ? 'ok' : 'warn');
    setYuborilmoqda(false); tozala(); setEkran('ishlar'); setRejim('ish'); void qatorlarniOl(obyektId, 'bl');
  };

  /* ───────── Tabel (brigadir) ───────── */
  const [xod, setXod] = useState<HrXodim[]>([]); const [oyD, setOyD] = useState<HrOy | null>(null); const [tabelXato, setTabelXato] = useState('');
  const tabelOch = async () => {
    if (kid == null) return; setEkran('tabel'); setTabelXato('');
    const oy = mahalliySana().slice(0, 7);
    const [a, b] = await Promise.all([hrXodimlarOl(kid), hrOyOl(kid, oy)]);
    if (!a.ok || !('xodimlar' in a)) { setTabelXato(t('Xodimlar ro‘yxati ochilmadi (ruxsat yoki internet).')); return; }
    setXod(a.xodimlar.filter((x) => x.holat !== 'ketgan' && (obyektId == null || !x.obyektlar.length || x.obyektlar.some((o) => o.obyekt_id === obyektId))));
    if ('tabel' in b) setOyD(b); else setTabelXato(t('Tabel o‘qilmadi.'));
  };
  const belgi = (kadr: number) => oyD?.tabel.find((x) => x.kadr_id === kadr)?.kunlar[String(new Date().getDate())] ?? null;
  const tabelBelgila = async (kadr: number, harf: 'K' | 'N') => {
    if (kid == null || !navigator.onLine) { toast(t('Tabel uchun internet kerak.'), 'warn'); return; }
    const oy = mahalliySana().slice(0, 7); const mavjud = oyD?.tabel.find((x) => x.kadr_id === kadr);
    const kunlar = { ...(mavjud?.kunlar ?? {}), [String(new Date().getDate())]: harf };
    const r = await hrTabelSaqla({ kompaniyaId: kid, oy, qatorlar: [{ kadr_id: kadr, kunlar, holat: 'qoralama' }], operationId: yangiOperationId() });
    if (!r.ok) { toast(t(hrXato(r)), 'danger'); return; }
    setOyD((o) => (o ? { ...o, tabel: [...o.tabel.filter((x) => x.kadr_id !== kadr), { kadr_id: kadr, kunlar, holat: 'qoralama', versiya: (mavjud?.versiya ?? 0) + 1, yopiq: false }] } : o));
  };

  /* ───────── Ko'rinish ───────── */
  const orqaga = () => { if (ekran === 'zayavka' && tanlangan) { setTanlangan(null); setHajm(0); } else if (ekran === 'zayavka') { tozala(); setRejim('ish'); setEkran('ishlar'); if (obyektId != null) void qatorlarniOl(obyektId, 'bl'); } else if (ekran === 'kirit') { tozala(); setEkran('ishlar'); } else if (ekran === 'tabel') setEkran('ishlar'); else { setEkran('bosh'); setObyektId(null); } };
  const sarlavha = ekran === 'bosh' ? t('Bugun') : ekran === 'tabel' ? t('Bugungi davomat') : obyekt?.nom ?? t('Obyekt');

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-3 px-3 pb-24 pt-3" data-testid="usta-bugun">
      <header className="flex items-center gap-2">
        {ekran !== 'bosh' && <button type="button" onClick={orqaga} aria-label={t('Orqaga')} className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--radius-md)] border border-border bg-surface"><ArrowLeft /></button>}
        <h1 className="m-0 min-w-0 flex-1 truncate text-[22px] font-bold text-text">{sarlavha}</h1>
      </header>

      {!onlayn && <div role="status" className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-warn-soft p-3 text-[14px] text-text"><WifiOff size={18} />{t('Internet yo‘q. Kiritganingiz saqlanadi va ulanganda o‘zi yuboriladi.')}</div>}
      {navbatSoni > 0 && <div role="status" data-testid="usta-navbat" className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-[14px] text-text">
        <span>{t('Yuborilmagan: {n} ta', { n: navbatSoni })}</span>
        <button type="button" onClick={() => void sinxron()} disabled={!onlayn} className="fz-btn fz-btn--sm">{t('Hozir yuborish')}</button></div>}
      {rad.length > 0 && <div role="alert" className="rounded-[var(--radius-md)] border border-border bg-danger-soft p-3 text-[14px] text-text">
        {rad.map((y) => <div key={y.id} className="flex items-center justify-between gap-2"><span>{y.xato}</span>
          <button type="button" className="fz-btn fz-btn--sm" onClick={() => void ombor.current!.ochir(y.id).then(yangilaNavbat)}>{t('Olib tashlash')}</button></div>)}</div>}

      {ekran === 'bosh' && <section className="flex flex-col gap-3" aria-label={t('Mening obyektlarim')}>
        <p className="m-0 text-[15px] text-text-dim">{t('Qaysi obyektda ishlayapsiz?')}</p>
        {obYuklanmoqda && <div className="skel h-14 rounded-[var(--radius-md)]" />}
        {!obYuklanmoqda && obyektlar.length === 0 && <p className="text-[15px] text-text-dim">{t('Sizga obyekt biriktirilmagan. Prorabingizga ayting.')}</p>}
        {obyektlar.map((o) => <Katta key={o.id} onClick={() => obyektTanla(o.id)}><Hammer />{o.nom}</Katta>)}
      </section>}

      {ekran === 'ishlar' && <section className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <Katta onClick={() => { setRejim('mat'); void qatorlarniOl(obyektId!, 'mat'); setEkran('zayavka'); setQidiruv(''); }} className="text-[15px]"><ClipboardList size={20} />{t('Material kerak')}</Katta>
          {tabelYoza ? <Katta onClick={() => void tabelOch()} className="text-[15px]"><Users size={20} />{t('Davomat')}</Katta> : <div />}
        </div>
        {kutilmoqda != null && kutilmoqda > 0 && <p data-testid="usta-kutilmoqda" className="m-0 rounded-[var(--radius-md)] bg-surface-2 p-3 text-[14px] text-text-dim">{t('Prorab tasdiqlashini kutayotgan yozuvlar: {n} ta', { n: kutilmoqda })}</p>}
        <input type="search" value={qidiruv} onChange={(e) => setQidiruv(e.target.value)} placeholder={t('Ishni qidiring…')} aria-label={t('Ishni qidiring')} className="input h-12 w-full px-3 text-[16px]" />
        {kid != null && naryadSatr.length > 0 && <UstaNaryad kid={kid} satrlar={naryadSatr} onlayn={onlayn} onBajardim={bajardim} />}
        <p className="m-0 text-[13px] font-semibold uppercase tracking-wide text-text-mute">{naryadSatr.length > 0 ? t('Boshqa ishlar (naryadsiz)') : t('Bugungi ishlar')}</p>
        {yuk && ishlar.length === 0 && <div className="skel h-20 rounded-[var(--radius-md)]" />}
        {ishXato && <p role="alert" className="m-0 text-[14px] text-danger">{ishXato}</p>}
        {korinadigan.map((q) => <button key={q.qator_id} type="button" onClick={() => { setTanlangan(q); setHajm(0); setEkran('kirit'); }}
          className="flex min-h-[72px] w-full flex-col items-start gap-1 rounded-[var(--radius-md)] border border-border bg-surface p-3 text-left active:scale-[0.99]">
          <span className="text-[16px] font-semibold leading-5 text-text">{q.nom}</span>
          <span className="text-[13px] text-text-dim">{t('Qoldi')}: {hajmMatni(q.qoldiq_hajm, q.birlik)}</span>
        </button>)}
        {!yuk && !ishXato && korinadigan.length === 0 && <p className="text-[15px] text-text-dim">{t('Bugun uchun ish topilmadi.')}</p>}
      </section>}

      {ekran === 'zayavka' && tanlangan === null && <section className="flex flex-col gap-3" aria-label={t('Material tanlang')}>
        <p className="m-0 text-[15px] text-text-dim">{t('Smetadagi materiallardan tanlang:')}</p>
        <input type="search" value={qidiruv} onChange={(e) => setQidiruv(e.target.value)} placeholder={t('Materialni qidiring…')} aria-label={t('Materialni qidiring')} className="input h-12 w-full px-3 text-[16px]" />
        {rejim === 'mat' && korinadigan.map((q) => <Katta key={q.qator_id} onClick={() => { setTanlangan(q); setHajm(1); }} className="justify-start text-left text-[16px]">{q.nom}<span className="ml-auto text-[13px] font-normal text-text-dim">{birlikIzohi(q.birlik) ? q.birlik : q.birlik ?? ''}</span></Katta>)}
        {yuk && ishlar.length === 0 && <div className="skel h-14 rounded-[var(--radius-md)]" />}
      </section>}

      {tanlangan && (ekran === 'kirit' || ekran === 'zayavka') && <section className="flex flex-col gap-4" aria-label={ekran === 'kirit' ? t('Bajarilgan hajm') : t('Material miqdori')}>
        <div className="rounded-[var(--radius-md)] bg-surface-2 p-3">
          <div className="text-[17px] font-semibold text-text">{tanlangan.nom}</div>
          {ekran === 'kirit' && <div className="mt-1 text-[14px] text-text-dim">{t('Qoldi')}: {hajmMatni(tanlangan.qoldiq_hajm, tanlangan.birlik)}</div>}
          {birlikIzohi(tanlangan.birlik, hajm) && <div data-testid="usta-birlik-izoh" className="mt-2 rounded-[var(--radius-sm)] bg-warn-soft p-2 text-[14px] text-text">{birlikIzohi(tanlangan.birlik, hajm)}</div>}
        </div>
        <div className="flex items-center gap-3">
          <button type="button" aria-label={t('Kamaytirish')} onClick={() => setHajm((h) => Math.max(ekran === 'zayavka' ? 0 : -1e9, Number((h - QADAM).toFixed(3))))} className="grid h-20 w-20 shrink-0 place-items-center rounded-[var(--radius-lg)] border border-border bg-surface active:scale-95"><Minus size={36} /></button>
          <input inputMode="decimal" aria-label={t('Miqdor')} value={Number.isFinite(hajm) ? String(hajm) : ''} onChange={(e) => { const v = Number(e.target.value.replace(',', '.')); setHajm(Number.isFinite(v) ? v : 0); }}
            className="input h-20 min-w-0 flex-1 text-center text-[34px] font-bold tabular-nums" />
          <button type="button" aria-label={t('Ko‘paytirish')} onClick={() => setHajm((h) => Number((h + QADAM).toFixed(3)))} className="grid h-20 w-20 shrink-0 place-items-center rounded-[var(--radius-lg)] border border-border bg-accent/15 active:scale-95"><Plus size={36} /></button>
        </div>
        <div className="text-center text-[15px] text-text-dim">{tanlangan.birlik ? `${t('Birlik')}: ${tanlangan.birlik}` : ''}</div>
        {qoldiqOshdi && ekran === 'kirit' && <p role="alert" className="m-0 rounded-[var(--radius-sm)] bg-warn-soft p-2 text-[14px] text-text">{t('Diqqat: bu qoldiqdan ko‘p. Tekshirib yuboring — prorab ko‘rib chiqadi.')}</p>}
        <textarea value={izoh} onChange={(e) => setIzoh(e.target.value)} rows={2} placeholder={t('Izoh (ixtiyoriy)')} aria-label={t('Izoh')} className="input w-full p-3 text-[16px]" />
        {ekran === 'kirit' && <div className="grid grid-cols-2 gap-2">
          <label className="flex min-h-[56px] cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface text-[16px] font-semibold text-text">
            <Camera size={22} />{foto ? t('Foto bor') : t('Foto')}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const b = await fotoSiq(f); setFoto(b); setFotoUrl(URL.createObjectURL(b)); }} />
          </label>
          {ovozBor() ? <Katta onClick={ovozBoshla} className={yozmoqda ? 'bg-danger-soft' : ''} aria-pressed={yozmoqda}><Mic size={22} />{yozmoqda ? t('Eshityapman…') : t('Gapirib yozish')}</Katta> : <div />}
        </div>}
        {fotoUrl && <img src={fotoUrl} alt={t('Foto')} className="max-h-40 w-full rounded-[var(--radius-md)] object-cover" />}
        <Katta disabled={yuborilmoqda || (ekran === 'kirit' ? hajm === 0 : hajm <= 0)} onClick={() => void (ekran === 'kirit' ? yuborFakt() : yuborZayavka())} className="bg-accent text-white">
          {yuborilmoqda ? t('Yuborilmoqda…') : ekran === 'kirit' ? (faktYoza ? t('Saqlash') : t('Yuborish')) : t('Zayavka yuborish')}
        </Katta>
        {ekran === 'kirit' && !faktYoza && <p className="m-0 text-center text-[13px] text-text-mute">{t('Prorab tasdiqlagach faktga o‘tadi.')}</p>}
      </section>}

      {ekran === 'tabel' && <section className="flex flex-col gap-2" aria-label={t('Davomat')}>
        {tabelXato && <p role="alert" className="m-0 text-[14px] text-danger">{tabelXato}</p>}
        {xod.map((x) => { const b = belgi(x.kadr_id); return <div key={x.kadr_id} className="rounded-[var(--radius-md)] border border-border bg-surface p-3">
          <div className="mb-2 text-[16px] font-semibold text-text">{x.ism}</div>
          <div className="grid grid-cols-2 gap-2">
            <Katta onClick={() => void tabelBelgila(x.kadr_id, 'K')} className={b === 'K' ? 'bg-ok-soft' : ''}>{t('Keldi')}</Katta>
            <Katta onClick={() => void tabelBelgila(x.kadr_id, 'N')} className={b === 'N' ? 'bg-danger-soft' : ''}>{t('Kelmadi')}</Katta>
          </div></div>; })}
        {!tabelXato && xod.length === 0 && <p className="text-[15px] text-text-dim">{t('Xodimlar topilmadi.')}</p>}
      </section>}
    </div>
  );
}
