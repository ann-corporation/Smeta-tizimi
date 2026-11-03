/**
 * HujjatAylanish.tsx — /admin/hujjat-aylanish. Tomonlar orasidagi hujjat aylanishi bir joyda:
 *   Kiruvchi quti (menga kelgan: tasdiq kutayotgan hujjat, xat, ochiq murojaat/predpisaniya) · Tasdiq zanjirlari (tartib, holat, izoh, qayta yuborish)
 *   · Xatlar reestri (kiruvchi/chiquvchi, raqamli) · Shablonlar (laboratoriya protokoli, osvidetelstvovaniya akti, predpisaniya, soprovod xat).
 * Dizayn: docs/architecture/HUJJAT_AYLANISH_LOGISTIKA_V1.md. Ruxsat, tartib va raqamlash serverda; fayllar — R2 (hujjat reyestri).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Paperclip } from 'lucide-react';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { sbLoyihaUmumiy } from '../../api/t2-loyiha';
import { hujjatYukla, hujjatYuklabOlishUrl } from '../../api/t2-hujjat-canonical';
import { aloqalarOl, type Aloqa } from '../../api/t2-tomon';
import {
  XAT_TURLARI, kiruvchiOl, xatQabul, xatTafsilotOl, xatYubor, xatlarOl, zanjirBekor, zanjirQarori, zanjirQayta, zanjirTafsilotOl, zanjirYarat, zanjirlarOl,
  type Kiruvchi, type XatQisqa, type XatTafsilot, type XatTuri, type ZanjirQisqa, type ZanjirTafsilot,
} from '../../api/t2-hujjat-aylanish';
import { STANDART_ZANJIRLAR, egasiAmallari, menQarorChiqaraman, type ZanjirModel } from '../../lib/hujjat-aylanish/zanjir';
import { SHABLON_TURLARI, type ShablonTuri } from '../../lib/hujjat-aylanish/toliqlik';
import { t } from '../../i18n/til';
import { Bolim } from './tomon-ui';
import { inp, sana, tugma, tugmaAsosiy } from './tomon-yordam';

type Tab = 'kiruvchi' | 'zanjir' | 'xat' | 'shablon';
const ZANJIR_HOLAT: Record<string, string> = { jarayonda: 'Jarayonda', tasdiqlandi: 'Tasdiqlandi', rad: 'Rad etildi', qaytarildi: 'Qaytarildi — tuzatish kerak', bekor: 'Bekor qilingan' };
const QADAM_HOLAT: Record<string, string> = { kutilmoqda: 'Kutilmoqda', navbat: 'Navbatda', tasdiqlandi: 'Tasdiqlandi', rad: 'Rad etildi', qaytarildi: 'Qaytarildi' };
const XAT_TUR_NOMI: Record<XatTuri, string> = { xat: 'Xat', soprovod: 'Soprovod xat', talabnoma: 'Talabnoma', ogohlantirish: 'Ogohlantirish', javob_xati: 'Javob xati', boshqa: 'Boshqa' };
const XAT_HOLAT_NOMI: Record<string, string> = { yuborilgan: 'Yuborilgan', olindi: 'Qabul qilindi', javob_berildi: 'Javob berilgan' };
const HUJJAT_TURI_NOMI: Record<string, string> = {
  aosr: 'АОСР (yashirin ishlar akti)', lab_protokol: 'Laboratoriya protokoli', akt_osvidetelstvovaniya: 'Osvidetelstvovaniya akti',
  loyiha_ozgarish: 'Loyiha o‘zgarishi', ekspertiza_javob: 'Ekspertiza izohiga javob',
};
const SHABLON_NOMI: Record<ShablonTuri, string> = {
  lab_protokol: 'Laboratoriya sinov protokoli', akt_osvidetelstvovaniya: 'Osvidetelstvovaniya akti', predpisaniya: 'Texnik nazorat predpisaniyasi', soprovod_xat: 'Soprovod xat',
};

const kech = (b: boolean) => (b ? <span className="ml-1 rounded bg-danger/15 px-1 text-[11px] text-danger">{t('muddat o‘tgan')}</span> : null);

/** Bitta faylni R2 ga yuklaydi (kompaniyaning umumiy loyihasi ostida); hujjat ID qaytaradi. */
async function faylYukla(kompaniyaId: number, file: File | null, turi: string): Promise<number | null | 'xato'> {
  if (!file) return null;
  const lr = await sbLoyihaUmumiy(kompaniyaId);
  if (!lr.ok || !lr.id) { toast(lr.error || t('Fayl uchun loyiha topilmadi'), 'danger'); return 'xato'; }
  const r = await hujjatYukla({ file, kompaniyaId, loyihaId: lr.id, documentType: turi });
  if (!r.ok) { toast(r.xato || t('Fayl yuklanmadi'), 'danger'); return 'xato'; }
  return r.data.document_id;
}

/* ───────────── Kiruvchi quti ───────────── */
function KiruvchiQuti({ kompaniyaId, ochish }: { kompaniyaId: number; ochish: (tab: Tab, id: number) => void }) {
  const [d, setD] = useState<Kiruvchi | null>(null);
  const [xato, setXato] = useState('');
  useEffect(() => { void kiruvchiOl(kompaniyaId).then((r) => { if (r.ok) { setD(r.natija); setXato(''); } else setXato(r.error); }); }, [kompaniyaId]);
  if (xato) return <p className="text-sm text-danger">{xato}</p>;
  if (!d) return <p className="text-sm text-text-dim">{t('Yuklanmoqda…')}</p>;
  const bosh = !d.zanjirlar.length && !d.xatlar.length && !d.murojaatlar.length;
  return (
    <div className="space-y-4">
      {bosh && <p className="text-sm text-text-dim">{t('Hozircha sizdan hech narsa kutilmayapti.')}</p>}
      {d.zanjirlar.length > 0 && <Bolim sarlavha={`${t('Tasdiqingiz kutilmoqda')} (${d.sanoq.zanjir})`}>
        <ul className="space-y-1">{d.zanjirlar.map((z) => (
          <li key={z.id} className="text-sm"><button type="button" className="text-accent underline" onClick={() => ochish('zanjir', z.id)}>{z.sarlavha}</button>
            <span className="text-text-dim"> · {z.egasi_nom} · {z.rol}{z.muddat ? ` · ${t('muddat')}: ${z.muddat}` : ''}{z.raund > 1 ? ` · ${t('raund')} ${z.raund}` : ''}</span>{kech(z.kechikkan)}</li>))}</ul>
      </Bolim>}
      {d.xatlar.length > 0 && <Bolim sarlavha={`${t('Kiruvchi xatlar')} (${d.sanoq.xat})`}>
        <ul className="space-y-1">{d.xatlar.map((x) => (
          <li key={x.id} className="text-sm"><button type="button" className="text-accent underline" onClick={() => ochish('xat', x.id)}>{x.raqam} — {x.mavzu}</button>
            <span className="text-text-dim"> · {x.qarshi_nom} · {t(XAT_TUR_NOMI[x.turi] ?? x.turi)}{x.javob_muddati ? ` · ${t('javob muddati')}: ${x.javob_muddati}` : ''}</span>{kech(x.kechikkan)}</li>))}</ul>
      </Bolim>}
      {d.murojaatlar.length > 0 && <Bolim sarlavha={`${t('Ochiq murojaat va predpisaniyalar')} (${d.sanoq.murojaat})`} amal={<Link to="/admin/murojaatlar" className="text-xs text-accent underline">{t('Hammasi')}</Link>}>
        <ul className="space-y-1">{d.murojaatlar.map((m) => (
          <li key={m.id} className="text-sm">{m.sarlavha}<span className="text-text-dim"> · {m.beruvchi_nom} · {m.turi}{m.muddat ? ` · ${t('muddat')}: ${m.muddat}` : ''}</span>{kech(m.kechikkan)}</li>))}</ul>
      </Bolim>}
    </div>
  );
}

/* ───────────── Tasdiq zanjiri ───────────── */
function ZanjirTafsilotPaneli({ kompaniyaId, id, yangila }: { kompaniyaId: number; id: number; yangila: () => void }) {
  const [d, setD] = useState<ZanjirTafsilot | null>(null);
  const [izoh, setIzoh] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [band, setBand] = useState(false);
  const ol = useCallback(async () => { const r = await zanjirTafsilotOl(kompaniyaId, id); if (r.ok) setD(r.natija); else toast(r.error, 'danger'); }, [kompaniyaId, id]);
  useEffect(() => { setD(null); setIzoh(''); setFile(null); void ol(); }, [ol]);
  if (!d) return <p className="text-xs text-text-dim">{t('Yuklanmoqda…')}</p>;
  const z = d.zanjir;
  const model: ZanjirModel = { holat: z.holat, meniki: z.meniki, qadamlar: d.qadamlar.map((q) => ({ tartib: q.tartib, holat: q.holat, men: q.men, muddat: q.muddat })) };
  const ega = egasiAmallari(model);
  const qaror = async (q: 'tasdiqlash' | 'rad' | 'qaytarish') => {
    if (q !== 'tasdiqlash' && izoh.trim().length < 3) { toast(t('Sababni yozing'), 'danger'); return; }
    setBand(true); const r = await zanjirQarori(kompaniyaId, id, q, izoh); setBand(false);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    setIzoh(''); yangila(); void ol();
  };
  const qayta = async () => {
    setBand(true);
    const doc = await faylYukla(kompaniyaId, file, 'zanjir_hujjat');
    if (doc === 'xato') { setBand(false); return; }
    const r = await zanjirQayta(kompaniyaId, id, izoh, doc); setBand(false);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(t('Qayta yuborildi'), 'ok'); setIzoh(''); setFile(null); yangila(); void ol();
  };
  const bekor = async () => { setBand(true); const r = await zanjirBekor(kompaniyaId, id, izoh); setBand(false); if (!r.ok) toast(r.error, 'danger'); else { yangila(); void ol(); } };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm"><b>{z.sarlavha}</b>
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px]">{t(HUJJAT_TURI_NOMI[z.hujjat_turi] ?? z.hujjat_turi)}</span>
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px]">{t(ZANJIR_HOLAT[z.holat] ?? z.holat)}{z.raund > 1 ? ` · ${t('raund')} ${z.raund}` : ''}</span>
        {z.document_id != null && <a className="text-xs text-accent underline" href={hujjatYuklabOlishUrl(z.document_id)}><Paperclip size={11} className="mr-1 inline" />{t('Hujjat fayli')}</a>}</div>
      <ol className="space-y-1">{d.qadamlar.map((q) => (
        <li key={q.tartib} className={`text-sm ${q.holat === 'navbat' ? 'font-semibold' : ''}`}>{q.tartib}. {q.rol} — {q.kompaniya_nom ?? '—'} · {t(QADAM_HOLAT[q.holat] ?? q.holat)}
          {q.muddat ? <span className="text-text-dim"> · {t('muddat')}: {q.muddat}</span> : null}{q.izoh ? <span className="text-text-dim"> · {q.izoh}</span> : null}</li>))}</ol>
      <div>
        <div className="text-xs font-semibold">{t('Tarix')}</div>
        <ul className="mt-1 max-h-44 space-y-0.5 overflow-auto">{d.tarix.map((h, i) => (
          <li key={i} className={`text-xs ${h.men ? 'text-text' : 'text-text-dim'}`}><span className="tabular-nums">{sana(h.vaqt)}</span> · {h.kompaniya_nom ?? '—'} · <b>{h.harakat}</b>{h.izoh ? ` — ${h.izoh}` : ''}</li>))}</ul>
      </div>
      {(menQarorChiqaraman(model) || ega.qayta || ega.bekor) && (
        <div className="space-y-2 rounded border border-border p-2">
          <textarea className={`${inp} block h-16 w-full`} value={izoh} onChange={(e) => setIzoh(e.target.value)} placeholder={t('Izoh (rad etish va qaytarishda majburiy)')} />
          {ega.qayta && <input type="file" className="block text-xs" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label={t('Tuzatilgan hujjat fayli')} />}
          <div className="flex flex-wrap gap-2">
            {menQarorChiqaraman(model) && <>
              <button type="button" className={tugmaAsosiy} disabled={band} onClick={() => void qaror('tasdiqlash')}>{t('Tasdiqlash')}</button>
              <button type="button" className={tugma} disabled={band} onClick={() => void qaror('qaytarish')}>{t('Tuzatishga qaytarish')}</button>
              <button type="button" className={tugma} disabled={band} onClick={() => void qaror('rad')}>{t('Rad etish')}</button></>}
            {ega.qayta && <button type="button" className={tugmaAsosiy} disabled={band} onClick={() => void qayta()}>{t('Tuzatib qayta yuborish')}</button>}
            {ega.bekor && <button type="button" className={tugma} disabled={band} onClick={() => void bekor()}>{t('Bekor qilish')}</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function ZanjirYaratish({ kompaniyaId, aloqalar, onYaratildi }: { kompaniyaId: number; aloqalar: Aloqa[]; onYaratildi: () => void }) {
  const { joriy } = useKompaniya();
  const faol = aloqalar.filter((a) => a.holat === 'faol' && a.qarshi_kompaniya_id != null);
  const [turi, setTuri] = useState('aosr');
  const [sarlavha, setSarlavha] = useState('');
  const [qadamlar, setQadamlar] = useState<Array<{ kompaniyaId: number | ''; rol: string; muddat: string }>>([{ kompaniyaId: '', rol: 'texnadzor', muddat: '' }]);
  const [file, setFile] = useState<File | null>(null);
  const [band, setBand] = useState(false);
  const shablonQadamlar = (tur: string) => setQadamlar((STANDART_ZANJIRLAR[tur] ?? ['texnadzor']).map((rol) => ({
    kompaniyaId: faol.find((a) => a.qarshi_rol.toLowerCase().includes(rol.slice(0, 5)))?.qarshi_kompaniya_id ?? '', rol, muddat: '',
  })));
  const tayyor = sarlavha.trim().length >= 3 && qadamlar.length > 0 && qadamlar.every((q) => q.kompaniyaId !== '' && q.rol.trim().length >= 2);
  const yubor = async () => {
    setBand(true);
    const doc = await faylYukla(kompaniyaId, file, 'zanjir_hujjat');
    if (doc === 'xato') { setBand(false); return; }
    const r = await zanjirYarat(kompaniyaId, { hujjatTuri: turi, sarlavha, documentId: doc, qadamlar: qadamlar.map((q) => ({ kompaniyaId: Number(q.kompaniyaId), rol: q.rol.trim(), muddat: q.muddat })) });
    setBand(false);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(t('Tasdiqqa yuborildi'), 'ok'); setSarlavha(''); setFile(null); onYaratildi();
  };
  return (
    <div className="space-y-2">
      <div className="grid gap-2 md:grid-cols-3">
        <label className="text-xs text-text-dim">{t('Hujjat turi')}
          <select className={`${inp} mt-1 block w-full`} value={turi} onChange={(e) => { setTuri(e.target.value); shablonQadamlar(e.target.value); }}>
            {Object.keys(HUJJAT_TURI_NOMI).map((k) => <option key={k} value={k}>{t(HUJJAT_TURI_NOMI[k])}</option>)}</select></label>
        <label className="text-xs text-text-dim md:col-span-2">{t('Sarlavha')}<input className={`${inp} mt-1 block w-full`} value={sarlavha} onChange={(e) => setSarlavha(e.target.value)} /></label>
      </div>
      <div className="text-xs font-semibold">{t('Tasdiq tartibi')}</div>
      {qadamlar.map((q, i) => (
        <div key={i} className="grid gap-2 md:grid-cols-4">
          <select className={inp} value={q.kompaniyaId} onChange={(e) => setQadamlar(qadamlar.map((x, j) => (j === i ? { ...x, kompaniyaId: e.target.value ? Number(e.target.value) : '' } : x)))} aria-label={t('Kompaniya')}>
            <option value="">{t('— kompaniya —')}</option>
            {joriy && <option value={kompaniyaId}>{joriy.nom} ({t('o‘zimiz')})</option>}
            {faol.map((a) => <option key={a.id} value={a.qarshi_kompaniya_id ?? ''}>{a.qarshi_nom} ({a.qarshi_rol})</option>)}</select>
          <input className={inp} value={q.rol} onChange={(e) => setQadamlar(qadamlar.map((x, j) => (j === i ? { ...x, rol: e.target.value } : x)))} aria-label={t('Qadam roli')} />
          <input type="date" className={inp} value={q.muddat} onChange={(e) => setQadamlar(qadamlar.map((x, j) => (j === i ? { ...x, muddat: e.target.value } : x)))} aria-label={t('Muddat')} />
          <button type="button" className={tugma} disabled={qadamlar.length < 2} onClick={() => setQadamlar(qadamlar.filter((_, j) => j !== i))}>{t('Olib tashlash')}</button>
        </div>))}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={tugma} disabled={qadamlar.length >= 8} onClick={() => setQadamlar([...qadamlar, { kompaniyaId: '', rol: 'texnadzor', muddat: '' }])}>{t('Qadam qo‘shish')}</button>
        <input type="file" className="text-xs" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label={t('Hujjat fayli')} />
        <button type="button" className={tugmaAsosiy} disabled={band || !tayyor} onClick={() => void yubor()}>{t('Tasdiqqa yuborish')}</button>
      </div>
    </div>
  );
}

function Zanjirlar({ kompaniyaId, aloqalar, tanlash, tanlangan }: { kompaniyaId: number; aloqalar: Aloqa[]; tanlash: (id: number | null) => void; tanlangan: number | null }) {
  const [yonalish, setYonalish] = useState<'menga' | 'mendan'>('menga');
  const [royxat, setRoyxat] = useState<ZanjirQisqa[]>([]);
  const [xato, setXato] = useState('');
  const yukla = useCallback(async () => { const r = await zanjirlarOl(kompaniyaId, { yonalish }); if (r.ok) { setRoyxat(r.natija); setXato(''); } else setXato(r.error); }, [kompaniyaId, yonalish]);
  useEffect(() => { void yukla(); }, [yukla]);
  return (
    <div className="space-y-4">
      <Bolim sarlavha={t('Yangi hujjatni tasdiqqa yuborish')}><ZanjirYaratish kompaniyaId={kompaniyaId} aloqalar={aloqalar} onYaratildi={() => void yukla()} /></Bolim>
      <Bolim sarlavha={t('Tasdiq zanjirlari')} amal={
        <select className={inp} value={yonalish} onChange={(e) => setYonalish(e.target.value as 'menga' | 'mendan')} aria-label={t('Yo‘nalish')}>
          <option value="menga">{t('Menga tasdiqqa kelgan')}</option><option value="mendan">{t('Men yuborgan')}</option></select>}>
        {xato && <p className="text-sm text-danger">{xato}</p>}
        {!royxat.length && !xato && <p className="text-sm text-text-dim">{t('Zanjirlar yo‘q.')}</p>}
        <ul className="space-y-1">{royxat.map((z) => (
          <li key={z.id} className="text-sm"><button type="button" className={`underline ${tanlangan === z.id ? 'font-semibold text-text' : 'text-accent'}`} onClick={() => tanlash(tanlangan === z.id ? null : z.id)}>{z.sarlavha}</button>
            <span className="text-text-dim"> · {t(HUJJAT_TURI_NOMI[z.hujjat_turi] ?? z.hujjat_turi)} · {t(ZANJIR_HOLAT[z.holat] ?? z.holat)}{z.navbat_rol && z.holat === 'jarayonda' ? ` · ${t('navbat')}: ${z.navbat_rol}` : ''}</span>
            {z.navbat_menda && <span className="ml-1 rounded bg-accent/15 px-1 text-[11px]">{t('sizning navbatingiz')}</span>}</li>))}</ul>
        {tanlangan != null && <div className="mt-3 border-t border-border pt-3"><ZanjirTafsilotPaneli kompaniyaId={kompaniyaId} id={tanlangan} yangila={() => void yukla()} /></div>}
      </Bolim>
    </div>
  );
}

/* ───────────── Xatlar ───────────── */
function XatYozish({ kompaniyaId, aloqalar, otaXat, onYuborildi }: { kompaniyaId: number; aloqalar: Aloqa[]; otaXat: XatTafsilot['xat'] | null; onYuborildi: () => void }) {
  const faol = aloqalar.filter((a) => a.holat === 'faol' && a.qarshi_kompaniya_id != null);
  const [qabul, setQabul] = useState<number | ''>('');
  const [turi, setTuri] = useState<XatTuri>('xat');
  const [mavzu, setMavzu] = useState('');
  const [matn, setMatn] = useState('');
  const [muddat, setMuddat] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [band, setBand] = useState(false);
  useEffect(() => { if (otaXat) { setQabul(otaXat.qarshi_kompaniya_id); setTuri('javob_xati'); setMavzu(`Re: ${otaXat.mavzu}`); } }, [otaXat]);
  useEffect(() => { if (qabul === '' && faol.length === 1) setQabul(faol[0].qarshi_kompaniya_id ?? ''); }, [faol, qabul]);
  if (!faol.length) return <p className="text-sm text-text-dim">{t('Xat yuborish uchun avval faol aloqa kerak (Tomonlar aloqasi).')}</p>;
  const yubor = async () => {
    if (qabul === '') return;
    setBand(true);
    const doc = await faylYukla(kompaniyaId, file, 'xat');
    if (doc === 'xato') { setBand(false); return; }
    const r = await xatYubor(kompaniyaId, { qabulKompaniyaId: qabul, turi, mavzu, matn, javobMuddati: muddat, documentId: doc, otaXatId: otaXat?.id ?? null });
    setBand(false);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(`${t('Xat yuborildi')}: ${r.natija.raqam}`, 'ok'); setMavzu(''); setMatn(''); setMuddat(''); setFile(null); onYuborildi();
  };
  return (
    <div className="grid gap-2 md:grid-cols-4">
      <label className="text-xs text-text-dim">{t('Kimga')}
        <select className={`${inp} mt-1 block w-full`} value={qabul} onChange={(e) => setQabul(e.target.value ? Number(e.target.value) : '')}>
          <option value="">{t('— tanlang —')}</option>{faol.map((a) => <option key={a.id} value={a.qarshi_kompaniya_id ?? ''}>{a.qarshi_nom} ({a.qarshi_rol})</option>)}</select></label>
      <label className="text-xs text-text-dim">{t('Turi')}
        <select className={`${inp} mt-1 block w-full`} value={turi} onChange={(e) => setTuri(e.target.value as XatTuri)}>{XAT_TURLARI.map((x) => <option key={x} value={x}>{t(XAT_TUR_NOMI[x])}</option>)}</select></label>
      <label className="text-xs text-text-dim md:col-span-2">{t('Mavzu')}<input className={`${inp} mt-1 block w-full`} value={mavzu} onChange={(e) => setMavzu(e.target.value)} /></label>
      <label className="text-xs text-text-dim md:col-span-3">{t('Matn')}<textarea className={`${inp} mt-1 block h-20 w-full`} value={matn} onChange={(e) => setMatn(e.target.value)} /></label>
      <label className="text-xs text-text-dim">{t('Javob muddati')}<input type="date" className={`${inp} mt-1 block w-full`} value={muddat} onChange={(e) => setMuddat(e.target.value)} /></label>
      <div className="flex flex-wrap items-end gap-2 md:col-span-4">
        <input type="file" className="text-xs" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label={t('Ilova fayli')} />
        <button type="button" className={tugmaAsosiy} disabled={band || qabul === '' || mavzu.trim().length < 3} onClick={() => void yubor()}>{t('Xat yuborish')}</button>
      </div>
    </div>
  );
}

function Xatlar({ kompaniyaId, aloqalar, tanlangan, tanlash }: { kompaniyaId: number; aloqalar: Aloqa[]; tanlangan: number | null; tanlash: (id: number | null) => void }) {
  const [yonalish, setYonalish] = useState<'kiruvchi' | 'chiquvchi'>('kiruvchi');
  const [royxat, setRoyxat] = useState<XatQisqa[]>([]);
  const [d, setD] = useState<XatTafsilot | null>(null);
  const [javob, setJavob] = useState(false);
  const [xato, setXato] = useState('');
  const yukla = useCallback(async () => { const r = await xatlarOl(kompaniyaId, { yonalish }); if (r.ok) { setRoyxat(r.natija); setXato(''); } else setXato(r.error); }, [kompaniyaId, yonalish]);
  useEffect(() => { void yukla(); }, [yukla]);
  useEffect(() => { setD(null); setJavob(false); if (tanlangan != null) void xatTafsilotOl(kompaniyaId, tanlangan).then((r) => { if (r.ok) setD(r.natija); else toast(r.error, 'danger'); }); }, [kompaniyaId, tanlangan]);
  const qabulQil = async (id: number) => { const r = await xatQabul(kompaniyaId, id); if (!r.ok) { toast(r.error, 'danger'); return; } toast(`${t('Kiruvchi raqam')}: ${r.natija.kiruvchi_raqam}`, 'ok'); void yukla(); tanlash(id); };
  return (
    <div className="space-y-4">
      <Bolim sarlavha={javob && d ? `${t('Javob xati')}: ${d.xat.chiquvchi_raqam}` : t('Yangi xat')}><XatYozish kompaniyaId={kompaniyaId} aloqalar={aloqalar} otaXat={javob && d ? d.xat : null} onYuborildi={() => { setJavob(false); void yukla(); }} /></Bolim>
      <Bolim sarlavha={t('Xatlar reestri')} amal={
        <select className={inp} value={yonalish} onChange={(e) => { setYonalish(e.target.value as 'kiruvchi' | 'chiquvchi'); tanlash(null); }} aria-label={t('Yo‘nalish')}>
          <option value="kiruvchi">{t('Kiruvchi')}</option><option value="chiquvchi">{t('Chiquvchi')}</option></select>}>
        {xato && <p className="text-sm text-danger">{xato}</p>}
        {!royxat.length && !xato && <p className="text-sm text-text-dim">{t('Xatlar yo‘q.')}</p>}
        <ul className="space-y-1">{royxat.map((x) => (
          <li key={x.id} className="text-sm"><button type="button" className={`underline ${tanlangan === x.id ? 'font-semibold text-text' : 'text-accent'}`} onClick={() => tanlash(tanlangan === x.id ? null : x.id)}>{x.kiruvchi ? (x.kiruvchi_raqam ?? x.chiquvchi_raqam) : x.chiquvchi_raqam} — {x.mavzu}</button>
            <span className="text-text-dim"> · {x.qarshi_nom} · {t(XAT_TUR_NOMI[x.turi] ?? x.turi)} · {t(XAT_HOLAT_NOMI[x.holat] ?? x.holat)} · {x.sana}{x.javob_muddati ? ` · ${t('javob muddati')}: ${x.javob_muddati}` : ''}</span>{kech(x.kechikkan)}</li>))}</ul>
        {d && <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
          <div><b>{d.xat.mavzu}</b> <span className="text-text-dim">· {d.xat.yuboruvchi_nom} → {d.xat.qabul_nom} · {d.xat.chiquvchi_raqam}{d.xat.kiruvchi_raqam ? ` / ${d.xat.kiruvchi_raqam}` : ''}</span></div>
          {d.xat.matn && <p className="whitespace-pre-wrap rounded border border-border px-2 py-1.5">{d.xat.matn}</p>}
          {d.xat.document_id != null && <a className="text-xs text-accent underline" href={hujjatYuklabOlishUrl(d.xat.document_id)}><Paperclip size={11} className="mr-1 inline" />{t('Ilova fayli')}</a>}
          {d.xat.kiruvchi && <div className="flex gap-2">
            {!d.xat.kiruvchi_raqam && <button type="button" className={tugmaAsosiy} onClick={() => void qabulQil(d.xat.id)}>{t('Qabul qilish (kiruvchi raqam berish)')}</button>}
            {d.xat.holat !== 'javob_berildi' && <button type="button" className={tugma} onClick={() => setJavob(true)}>{t('Javob yozish')}</button>}</div>}
        </div>}
      </Bolim>
    </div>
  );
}

/* ───────────── Shablonlar ───────────── */
const MAYDONLAR: Record<ShablonTuri, ReadonlyArray<{ k: string; nom: string; katta?: boolean }>> = {
  lab_protokol: [{ k: 'laboratoriya', nom: 'Laboratoriya' }, { k: 'sinovTuri', nom: 'Sinov turi' }, { k: 'konstruksiya', nom: 'Konstruksiya / namuna olingan joy' }, { k: 'marka', nom: 'Marka / sinf' },
    { k: 'normativ', nom: 'Normativ hujjat (ShNK/GOST)' }, { k: 'xulosa', nom: 'Xulosa (mos / mos emas)', katta: true }],
  akt_osvidetelstvovaniya: [{ k: 'ishNomi', nom: 'Nima ko‘rsatilmoqda' }, { k: 'loyiha', nom: 'Loyiha shifri / chizmalar' }, { k: 'ishTavsifi', nom: 'Bajarilgan ishlar tavsifi', katta: true },
    { k: 'materiallar', nom: 'Materiallar (sertifikatlar)', katta: true }, { k: 'chetlanishlar', nom: 'Loyihadan chetlanishlar', katta: true }, { k: 'xulosa', nom: 'Komissiya qarori', katta: true }],
  predpisaniya: [{ k: 'muddat', nom: 'Bartaraf etish muddati' }, { k: 'normativ', nom: 'Asos (norma, band)' }, { k: 'nuqsonlar', nom: 'Nuqsonlar (har qator — bitta nuqson)', katta: true }],
  soprovod_xat: [{ k: 'qabulQiluvchi', nom: 'Kimga' }, { k: 'mavzu', nom: 'Mavzu' }, { k: 'muddat', nom: 'Javob muddati' }, { k: 'matn', nom: 'Matn', katta: true }, { k: 'ilovalar', nom: 'Ilovalar (har qator — bitta hujjat)', katta: true }],
};

function Shablonlar() {
  const { joriy } = useKompaniya();
  const [tur, setTur] = useState<ShablonTuri>('lab_protokol');
  const [q, setQ] = useState<Record<string, string>>({});
  const [yetishmaydi, setYetishmaydi] = useState<Array<{ nom: string; sabab: string }>>([]);
  const ol = (k: string, v: string) => setQ((x) => ({ ...x, [k]: v }));
  const qatorlar = (s: string) => (q[s] ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
  const yukla = async () => {
    const { shablonYoz } = await import('../../lib/hujjat-aylanish/shablon');
    const { downloadBlob } = await import('../../lib/construction-document-control/export/download-helper');
    const kirish = {
      ...q, obyekt: q.obyekt, raqam: q.raqam, sana: q.sana, pudratchi: joriy?.nom ?? q.pudratchi, yuboruvchi: joriy?.nom ?? q.yuboruvchi,
      nuqsonlar: tur === 'predpisaniya' ? qatorlar('nuqsonlar').map((matn) => ({ matn })) : undefined,
      ilovalar: tur === 'soprovod_xat' ? qatorlar('ilovalar').map((nom) => ({ nom })) : undefined,
      korsatkichlar: undefined,
    };
    const r = shablonYoz(tur, kirish);
    downloadBlob(r.bytes, r.faylNomi);
    setYetishmaydi((await import('../../lib/hujjat-aylanish/toliqlik')).shablonToliqligi(tur, kirish));
  };
  return (
    <Bolim sarlavha={t('Hujjat shablonlari')}>
      <p className="mb-2 text-xs text-text-dim">{t('Yetishmagan maydonlar hujjat ichida «e’tibor talab qiladigan o‘rinlar» bo‘lib chiqadi; hech narsa o‘ylab topilmaydi.')}</p>
      <div className="grid gap-2 md:grid-cols-4">
        <label className="text-xs text-text-dim">{t('Shablon')}
          <select className={`${inp} mt-1 block w-full`} value={tur} onChange={(e) => { setTur(e.target.value as ShablonTuri); setYetishmaydi([]); }}>
            {SHABLON_TURLARI.map((x) => <option key={x} value={x}>{t(SHABLON_NOMI[x])}</option>)}</select></label>
        <label className="text-xs text-text-dim">{t('Raqam')}<input className={`${inp} mt-1 block w-full`} value={q.raqam ?? ''} onChange={(e) => ol('raqam', e.target.value)} /></label>
        <label className="text-xs text-text-dim">{t('Sana')}<input type="date" className={`${inp} mt-1 block w-full`} value={q.sana ?? ''} onChange={(e) => ol('sana', e.target.value)} /></label>
        <label className="text-xs text-text-dim">{t('Obyekt')}<input className={`${inp} mt-1 block w-full`} value={q.obyekt ?? ''} onChange={(e) => ol('obyekt', e.target.value)} /></label>
        {MAYDONLAR[tur].map((m) => (
          <label key={m.k} className={`text-xs text-text-dim ${m.katta ? 'md:col-span-2' : ''}`}>{t(m.nom)}
            {m.katta ? <textarea className={`${inp} mt-1 block h-16 w-full`} value={q[m.k] ?? ''} onChange={(e) => ol(m.k, e.target.value)} />
              : <input className={`${inp} mt-1 block w-full`} value={q[m.k] ?? ''} onChange={(e) => ol(m.k, e.target.value)} />}</label>))}
      </div>
      <div className="mt-3"><button type="button" className={tugmaAsosiy} onClick={() => void yukla()}>{t('Hujjatni yuklab olish (.xlsx)')}</button></div>
      {yetishmaydi.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-danger">{yetishmaydi.map((y) => <li key={y.nom}>{y.nom}: {y.sabab}</li>)}</ul>}
    </Bolim>
  );
}

/* ───────────── Sahifa ───────────── */
export default function HujjatAylanish() {
  const { joriy } = useKompaniya();
  const kompaniyaId = joriy?.id ?? null;
  const [tab, setTab] = useState<Tab>('kiruvchi');
  const [zanjirId, setZanjirId] = useState<number | null>(null);
  const [xatId, setXatId] = useState<number | null>(null);
  const [aloqalar, setAloqalar] = useState<Aloqa[]>([]);
  useEffect(() => { if (kompaniyaId) void aloqalarOl(kompaniyaId).then((r) => { if (r.ok) setAloqalar(r.natija); }); }, [kompaniyaId]);
  const ochish = (yangi: Tab, id: number) => { setTab(yangi); if (yangi === 'zanjir') setZanjirId(id); else setXatId(id); };
  const tablar = useMemo(() => ([['kiruvchi', 'Kiruvchi hujjatlar'], ['zanjir', 'Tasdiq zanjirlari'], ['xat', 'Xatlar reestri'], ['shablon', 'Shablonlar']] as Array<[Tab, string]>), []);
  if (!kompaniyaId) return <KompaniyaKerak nima={t('Hujjat aylanishi')} />;
  return (
    <Sahifa sarlavha={t('Hujjat aylanishi')} tavsif={t('Tomonlar orasida hujjat, xat va tasdiq — raqamli, muddatli, izohli.')}>
      <div className="mb-3 flex flex-wrap gap-2" role="tablist">
        {tablar.map(([k, nom]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? tugmaAsosiy : tugma} onClick={() => setTab(k)}>{t(nom)}</button>)}
      </div>
      {tab === 'kiruvchi' && <KiruvchiQuti kompaniyaId={kompaniyaId} ochish={ochish} />}
      {tab === 'zanjir' && <Zanjirlar kompaniyaId={kompaniyaId} aloqalar={aloqalar} tanlangan={zanjirId} tanlash={setZanjirId} />}
      {tab === 'xat' && <Xatlar kompaniyaId={kompaniyaId} aloqalar={aloqalar} tanlangan={xatId} tanlash={setXatId} />}
      {tab === 'shablon' && <Shablonlar />}
    </Sahifa>
  );
}
