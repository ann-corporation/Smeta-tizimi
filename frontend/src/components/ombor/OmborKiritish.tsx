import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, LoaderCircle, Mic, Square, X } from 'lucide-react';
import { t, raqamFormatla } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { yangiOperationId } from '../../api/supabase';
import {
  omborTahlilMatn, omborTahlilOvoz, omborTaklif, omborTasdiq, omborYoz,
  type OmborBuyruqNatija, type OmborKontragentTaklif, type OmborNomzod, type OmborTaklif, type OmborTanlov,
} from '../../api/t2-ombor';
import { omborXatoMatni } from './ombor-xato';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { narxBilanga, narxSizga } from '../../lib/ombor-moslash/narx';

/**
 * Omborchi YAGONA kiritish paneli: Kirim/Chiqim tugmasi + bitta kiritish qatori (matn yoki ovoz) + aqlli takliflar + bir bosishlik tasdiq kartasi.
 * Takliflar shu omborning o'z tarixidan (server: /api/ombor-buyruq taklif) — material, birlik, odatiy miqdor, narx (QQS siz/bilan), yetkazuvchi.
 * Yetkazuvchi tanlansa — uning odatiy materiallari. Tasdiq kartasida hammasi to'ldirilgan, tahrirlash mumkin; bitta «Saqlash».
 * Gap bilan buyruq («sement 10 tonna keldi») va savol («o'tgan oy sement qancha keldi») ham shu qatordan — server tushunadi.
 */
const n = (v: number | null | undefined) => (v == null ? '—' : raqamFormatla(Number(v), { maximumFractionDigits: 4 }));
const pul = (v: number | null | undefined) => (v == null ? '—' : raqamFormatla(Number(v), { maximumFractionDigits: 2 }));
const bugun = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
const inp = 'h-[48px] w-full rounded-md border border-[var(--border-strong)] bg-bg px-3 text-[14px] text-text';
type Tur = 'prixod' | 'chiqim';
type Rejim = 'bilan' | 'siz';
const rejimKalit = (k: number, s: number) => `ombor-narx-rejim:${k}:${s}`;
const rejimOl = (k: number, s: number): Rejim => { try { return localStorage.getItem(rejimKalit(k, s)) === 'siz' ? 'siz' : 'bilan'; } catch { return 'bilan'; } };
const rejimSaqla = (k: number, s: number, r: Rejim) => { try { localStorage.setItem(rejimKalit(k, s), r); } catch { /* xotirasiz ham ishlaydi */ } };
type Karta = { nomi: string; birligi: string; miqdor: string; narx: string; kontragent: string; sana: string; yangi: boolean; qoldiq: number | null; op: string; narxSoraldi?: boolean };

export function OmborKiritish({ kompaniyaId, skladId, onYozildi }: { kompaniyaId: number; skladId: number; onYozildi: () => void }) {
  const [tur, setTur] = useState<Tur>('prixod');
  const [matn, setMatn] = useState(''); const [ochiq, setOchiq] = useState(false);
  const [takliflar, setTakliflar] = useState<OmborTaklif[]>([]); const [kontragentlar, setKontragentlar] = useState<OmborKontragentTaklif[]>([]); const [qqs, setQqs] = useState(12);
  const [rejim, setRejim] = useState<Rejim>(() => rejimOl(kompaniyaId, skladId));
  const rejimTanla = (r: Rejim) => { setRejim(r); rejimSaqla(kompaniyaId, skladId, r); };
  const [yetkazuvchi, setYetkazuvchi] = useState<string | null>(null);
  const [karta, setKarta] = useState<Karta | null>(null);
  const [natija, setNatija] = useState<OmborBuyruqNatija | null>(null);
  const [band, setBand] = useState(false); const [xato, setXato] = useState<string | null>(null); const [yozilmoqda, setYozilmoqda] = useState(false);
  const rec = useRef<MediaRecorder | null>(null); const bo_laklar = useRef<Blob[]>([]); const avlod = useRef(0); const miqdorRef = useRef<HTMLInputElement>(null);

  // Takliflar: fokusda yoki yozilganda; kartada kerak emas.
  useEffect(() => {
    if (karta || natija || !(ochiq || matn || yetkazuvchi)) return;
    const g = ++avlod.current;
    const id = setTimeout(() => {
      void omborTaklif(kompaniyaId, skladId, matn.trim(), tur, yetkazuvchi ?? undefined, 6).then((r) => {
        if (g !== avlod.current || !r.ok) return;
        setTakliflar(r.takliflar); setKontragentlar(r.kontragentlar); setQqs(r.qqs_foiz);
      });
    }, matn.trim() ? 200 : 0);
    return () => clearTimeout(id);
  }, [matn, ochiq, tur, yetkazuvchi, karta, natija, kompaniyaId, skladId]);

  const tozala = () => { tanlovlar.current = {}; setMatn(''); setKarta(null); setNatija(null); setYetkazuvchi(null); setTakliflar([]); setKontragentlar([]); setXato(null); };
  const turTanla = (x: Tur) => { setTur(x); tozala(); setOchiq(true); };

  const tanla = (e: OmborTaklif) => {
    setKarta({ nomi: e.nomi, birligi: e.birligi, miqdor: e.miqdor_median != null ? String(e.miqdor_median) : '',
      narx: tur === 'prixod' && e.narx_oxirgi != null ? String(rejim === 'bilan' ? e.narx_oxirgi_qqs ?? e.narx_oxirgi : e.narx_oxirgi) : '', kontragent: yetkazuvchi ?? e.kontragent ?? '', sana: bugun(), yangi: false, qoldiq: e.qoldiq ?? null, op: yangiOperationId() });
    setTakliflar([]); setKontragentlar([]); setOchiq(false);
    setTimeout(() => miqdorRef.current?.focus(), 0);
  };
  const yangiMaterial = () => {
    if (!matn.trim()) return;
    setKarta({ nomi: matn.trim(), birligi: '', miqdor: '', narx: '', kontragent: yetkazuvchi ?? '', sana: bugun(), yangi: true, qoldiq: null, op: yangiOperationId() });
    setTakliflar([]); setKontragentlar([]); setOchiq(false);
    setTimeout(() => miqdorRef.current?.focus(), 0);
  };

  const saqla = async (narxsizDavom = false) => {
    if (!karta) return; setXato(null);
    const m = karta.miqdor.replace(',', '.').trim(); const narx = karta.narx.replace(',', '.').replace(/\s/g, '').trim();
    if (!karta.nomi.trim() || !karta.birligi.trim() || !(Number(m) > 0)) { setXato(t('Material, birlik va miqdorni kiriting.')); return; }
    if (narx && !(Number(narx) > 0)) { setXato(t('Narx noto‘g‘ri.')); return; }
    // Narx ixtiyoriy: yozilmagan va tarixda ham yo'q bo'lsa — bir marta yumshoq so'raladi; «O'tkazib yuborish» yoki ikkinchi «Saqlash» baribir saqlaydi.
    if (tur === 'prixod' && !narx && !karta.narxSoraldi && !narxsizDavom) { setKarta({ ...karta, narxSoraldi: true }); return; }
    setBand(true);
    const r = await omborYoz(kompaniyaId, skladId, { operatsiya: tur, nomi: karta.nomi.trim(), birligi: karta.birligi.trim(), miqdor: m, ...(tur === 'prixod' && narx ? { narx, narx_rejim: rejim } : {}), sana: karta.sana, kontragent: karta.kontragent.trim() || undefined, operation_id: karta.op });
    setBand(false);
    if (!r.ok) { setXato(omborXatoMatni(r.code)); return; }
    toast(`${tur === 'prixod' ? t('Kirim yozildi') : t('Chiqim yozildi')}: ${karta.nomi.trim()} ${n(Number(m))} ${karta.birligi}`, 'ok');
    tozala(); onYozildi();
  };

  const tahlilNatija = (r: Awaited<ReturnType<typeof omborTahlilMatn>>) => {
    setBand(false);
    if (!r.ok) { setNatija(null); setXato(omborXatoMatni(r.code, r.xabar)); return; }
    setNatija(r); if (r.matn) setMatn(r.matn);
  };
  // Ketma-ket savollar (material -> yetkazuvchi -> obyekt): oldingi tanlovlar saqlanadi, aks holda savol qayta chiqadi. Matn o'zgarsa yoki bekor qilinsa tozalanadi.
  const tanlovlar = useRef<OmborTanlov>({});
  const yubor = async (tanlov?: OmborTanlov, rejimTanlov?: Rejim) => {
    if (!matn.trim()) return; setXato(null); setBand(true); setOchiq(false);
    if (tanlov) tanlovlar.current = { ...tanlovlar.current, ...tanlov };
    const jamiTanlov = Object.keys(tanlovlar.current).length ? tanlovlar.current : undefined;
    tahlilNatija(await omborTahlilMatn(kompaniyaId, skladId, matn.trim(), jamiTanlov, rejimTanlov ?? rejimOl(kompaniyaId, skladId)));
  };
  const yozishBosh = async () => {
    setXato(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream); bo_laklar.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) bo_laklar.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((x) => x.stop()); setYozilmoqda(false); setBand(true);
        void omborTahlilOvoz(kompaniyaId, skladId, new Blob(bo_laklar.current, { type: mr.mimeType || 'audio/webm' })).then(tahlilNatija);
      };
      rec.current = mr; mr.start(); setYozilmoqda(true);
    } catch { setXato(t('Mikrofonga ruxsat berilmadi.')); }
  };
  const yozishTugat = () => rec.current?.state === 'recording' && rec.current.stop();
  const tasdiqla = async () => {
    if (!natija?.token) return; setBand(true);
    const r = await omborTasdiq(kompaniyaId, skladId, natija.token); setBand(false);
    if (!r.ok) { setXato(omborXatoMatni(r.code)); return; }
    toast(r.takror ? t('Bu amal allaqachon yozilgan.') : t('Yozildi'), 'ok'); tozala(); onYozildi();
  };
  const kirimMi = tur === 'prixod';
  const narxXom = karta ? Number(karta.narx.replace(',', '.').replace(/\s/g, '')) : NaN;
  const narxSiz = karta && narxXom > 0 ? narxSizga(narxXom, rejim, qqs) : null;
  // Rejim almashganda kiritilgan narx o'sha narxni saqlab o'zgaradi (QQS bilan <-> siz), tanlov ombor bo'yicha eslab qolinadi.
  const qqsAlmashtir = (r: Rejim) => {
    if (r === rejim) return;
    if (karta && narxSiz != null) setKarta({ ...karta, narx: String(r === 'bilan' ? narxBilanga(narxSiz, qqs) : narxSiz) });
    rejimTanla(r);
  };
  const kutilgan = !karta && !natija;
  const panelKo_rinadi = kutilgan && (ochiq || !!matn || !!yetkazuvchi) && (takliflar.length > 0 || kontragentlar.length > 0 || !!matn.trim());

  return <div className="flex flex-col gap-3" aria-label={t('Kiritish')}>
    <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('Amal turi')}>
      <button type="button" aria-pressed={kirimMi} onClick={() => turTanla('prixod')} className={`fz-btn min-h-[52px] justify-center text-[15px] font-semibold ${kirimMi ? 'fz-btn--primary' : ''}`}><ArrowDownToLine size={18} aria-hidden="true" />{t('Kirim')}</button>
      <button type="button" aria-pressed={!kirimMi} onClick={() => turTanla('chiqim')} className={`fz-btn min-h-[52px] justify-center text-[15px] font-semibold ${!kirimMi ? 'fz-btn--primary' : ''}`}><ArrowUpFromLine size={18} aria-hidden="true" />{t('Chiqim')}</button>
    </div>

    <div className="relative">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <input aria-label={t('Material yoki buyruq')} value={matn} autoComplete="off" inputMode="search" disabled={!!karta}
            placeholder={kirimMi ? t('Nima keldi? Yozing yoki ayting: «sement 10 tonna»') : t('Nima berildi? Yozing yoki ayting: «mix 20 kg Aliga»')}
            onFocus={() => setOchiq(true)} onBlur={() => setTimeout(() => setOchiq(false), 150)}
            onChange={(e) => { setMatn(e.target.value); setNatija(null); setOchiq(true); tanlovlar.current = {}; }}
            onKeyDown={(e) => { if (e.key !== 'Enter') return; e.preventDefault(); if (/\d/.test(matn) || /(qancha|qoldiq|hisobot|nima)/i.test(matn)) void yubor(); else yangiMaterial(); }}
            className={inp} />
          {matn && !karta && <button type="button" aria-label={t('Tozalash')} onClick={tozala} className="absolute right-2 top-3 text-text-mute"><X size={18} aria-hidden="true" /></button>}
        </div>
        <button type="button" aria-label={yozilmoqda ? t('To‘xtatish') : t('Ovoz bilan')} onClick={() => (yozilmoqda ? yozishTugat() : void yozishBosh())} disabled={(band && !yozilmoqda) || !!karta}
          className={`fz-btn min-h-[48px] min-w-[48px] justify-center ${yozilmoqda ? 'fz-btn--primary' : ''}`}>{yozilmoqda ? <Square size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}</button>
        {kutilgan && /\d|qancha|qoldiq|hisobot/i.test(matn) && <button type="button" onClick={() => void yubor()} disabled={band || !matn.trim()} className="fz-btn min-h-[48px] justify-center">{band ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : t('Tushun')}</button>}
      </div>

      {panelKo_rinadi ? <div className="mt-2 rounded-md border border-[var(--border-strong)] bg-bg" role="listbox" aria-label={t('Takliflar')}>
        {yetkazuvchi && <p className="m-0 flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-[13px]"><span>{kirimMi ? t('Yetkazuvchi') : t('Kimga')}: <b>{yetkazuvchi}</b></span>
          <button type="button" className="fz-btn min-h-[36px]" onClick={() => setYetkazuvchi(null)}>{t('Bekor')}</button></p>}
        {takliflar.map((e) => <button key={e.nomi + '|' + e.birligi} type="button" role="option" aria-selected={false} onMouseDown={(ev) => ev.preventDefault()} onClick={() => tanla(e)}
          className="flex min-h-[56px] w-full flex-col items-start justify-center gap-0.5 border-b border-border px-3 py-2 text-left text-[14px] last:border-b-0 hover:bg-bg-alt">
          <span className="flex w-full items-baseline justify-between gap-3"><span className="min-w-0 break-words font-medium">{e.nomi}</span><span className="shrink-0 text-[12px] text-text-dim">{e.birligi}</span></span>
          <span className="text-[12px] text-text-dim">{[
            e.miqdor_median != null ? `${t('odatda')} ${n(e.miqdor_median)}` : null,
            kirimMi && e.narx_oxirgi != null ? `${t('narx')} ${pul(e.narx_oxirgi)} (${t('QQS bilan')} ${pul(e.narx_oxirgi_qqs)})` : null,
            e.kontragent, !kirimMi && e.qoldiq != null ? `${t('Ostatka')}: ${n(e.qoldiq)}` : null].filter(Boolean).join(' · ')}</span></button>)}
        {!yetkazuvchi && kontragentlar.length > 0 && <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2" aria-label={kirimMi ? t('Yetkazuvchilar') : t('Qabul qiluvchilar')}>
          {kontragentlar.map((k) => <button key={k.nomi} type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => { setYetkazuvchi(k.nomi); setMatn(''); }}
            className="fz-btn min-h-[40px]" title={k.materiallar.map((m) => m.nomi).join(', ')}>{k.nomi}</button>)}</div>}
        {matn.trim() && <button type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={yangiMaterial} className="min-h-[48px] w-full px-3 py-2 text-left text-[14px] text-accent hover:bg-bg-alt">+ {t('Yangi material')}: «{matn.trim()}»</button>}
      </div> : null}
    </div>

    {xato && <p role="alert" className="m-0 text-[13px] text-danger">{xato}</p>}
    {natija?.ai_xabar && <p className="m-0 text-[12px] text-warn">{natija.ai_xabar}</p>}

    {karta && <form className="rounded-lg border border-accent p-3" onSubmit={(e) => { e.preventDefault(); void saqla(); }} aria-label={t('Tasdiq kartasi')}>
      <p className="m-0 flex items-start justify-between gap-2 text-[15px] font-semibold"><span>{kirimMi ? t('KIRIM') : t('CHIQIM')}: {karta.nomi}</span>
        <button type="button" aria-label={t('Bekor')} className="fz-btn min-h-[40px]" onClick={tozala}><X size={16} aria-hidden="true" /></button></p>
      {karta.qoldiq != null && !kirimMi && <p className="m-0 mt-1 text-[12px] text-text-dim">{t('Ostatka')}: {n(karta.qoldiq)} {karta.birligi}</p>}
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input ref={miqdorRef} aria-label={t('Miqdor')} placeholder={t('Miqdor')} inputMode="decimal" value={karta.miqdor} onChange={(e) => setKarta({ ...karta, miqdor: e.target.value })} className={inp} />
        <input aria-label={t('Birlik')} placeholder={t('Birlik')} value={karta.birligi} onChange={(e) => setKarta({ ...karta, birligi: e.target.value })} className={inp} />
        {kirimMi && <MoneyInput aria-label={t('Narx (ixtiyoriy)')} placeholder={t('Narx (ixtiyoriy, QQS siz)')} inputMode="decimal" value={karta.narx} onValueChange={(v) => setKarta({ ...karta, narx: v })} className={inp} />}
        <input aria-label={kirimMi ? t('Yetkazuvchi') : t('Kimga (prorab / brigada)')} placeholder={kirimMi ? t('Yetkazuvchi') : t('Kimga (prorab / brigada)')} value={karta.kontragent} onChange={(e) => setKarta({ ...karta, kontragent: e.target.value })} className={inp} />
      </div>
      {kirimMi && <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-text-dim" role="group" aria-label={t('Narx QQS bilan yoki QQS siz')}>
        <button type="button" aria-pressed={rejim === 'bilan'} className={`fz-btn min-h-[40px] ${rejim === 'bilan' ? 'fz-btn--primary' : ''}`} onClick={() => qqsAlmashtir('bilan')}>{t('QQS bilan')}</button>
        <button type="button" aria-pressed={rejim === 'siz'} className={`fz-btn min-h-[40px] ${rejim === 'siz' ? 'fz-btn--primary' : ''}`} onClick={() => qqsAlmashtir('siz')}>{t('QQS siz')}</button>
        {narxSiz != null && <span>{t('QQS siz')}: <b>{pul(narxSiz)}</b> · {t('QQS bilan')} ({qqs}%): <b>{pul(narxBilanga(narxSiz, qqs))}</b>{Number(karta.miqdor.replace(',', '.')) > 0 ? ` · ${t('Jami')} (${t('QQS siz')}): ${pul(narxSiz * Number(karta.miqdor.replace(',', '.')))}` : ''}</span>}</div>}
      {kirimMi && karta.narxSoraldi && !karta.narx.trim() && <p role="status" className="m-0 mt-2 flex flex-wrap items-center gap-2 text-[13px] text-warn">{t('Narxi ma’lummi? (o‘tkazib yuborish mumkin)')}
        <button type="button" className="fz-btn min-h-[40px]" onClick={() => void saqla(true)}>{t('O‘tkazib yuborish')}</button></p>}
      <input type="date" aria-label={t('Sana')} value={karta.sana} max={bugun()} onChange={(e) => setKarta({ ...karta, sana: e.target.value })} className={`${inp} mt-2 sm:w-48`} />
      <button type="submit" disabled={band} className="fz-btn fz-btn--primary mt-3 min-h-[52px] w-full justify-center text-[15px] font-semibold">
        {band && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}{t('Saqlash')}</button>
    </form>}

    {natija && <NatijaBlok natija={natija} band={band} onTasdiq={() => void tasdiqla()} onBekor={() => setNatija(null)} onTanlov={(g) => void yubor({ nomi: g.nomi, birligi: g.birligi })} onVariant={(v) => void yubor(v)} onRejim={(r) => { rejimTanla(r); void yubor(undefined, r); }} />}
  </div>;
}

/* ───────────── gap/ovoz buyrug'i natijasi: tasdiq kartasi, ostatka, hisobot ───────────── */
export function NatijaBlok({ natija, band, onTasdiq, onBekor, onTanlov, onVariant, onRejim }: { natija: OmborBuyruqNatija; band: boolean; onTasdiq: () => void; onBekor: () => void; onTanlov: (g: OmborNomzod) => void; onVariant: (v: OmborTanlov) => void; onRejim: (r: Rejim) => void }) {
  const p = natija.preview as Record<string, unknown> | undefined;
  const boshqalar = (natija.nomzodlar ?? []).filter((g) => g.nomi !== p?.nomi).slice(0, 4);
  if (natija.holat === 'tasdiq_kerak' && p) {
    return <div className="rounded-md border border-accent p-3" role="group" aria-label={t('Tasdiqlash kartasi')}>
      <p className="m-0 text-[14px] font-semibold">{p.amal === 'bekor' ? t('Yozuvni BEKOR qilish') : p.amal === 'tuzat' ? t('Yozuvni TUZATISH') : p.tur === 'prixod' ? t('KIRIM') : t('CHIQIM')}
        {p.harakat_id != null && <> #{String(p.harakat_id)}</>}</p>
      {p.nomi != null && <p className="m-0 mt-1 text-[14px]">{String(p.nomi)} — <b>{n(Number(p.miqdor))} {String(p.birligi)}</b> · {String(p.sana)}</p>}
      {p.tur === 'prixod' && p.narx != null && <p className="m-0 text-[13px] text-text-dim">{t('QQS siz')}: <b>{pul(Number(p.narx))}</b> · {t('QQS bilan')}: <b>{pul(Number(p.narx_bilan))}</b></p>}
      {p.narx_rejim_sorov === true && <p className="m-0 flex flex-wrap items-center gap-2 text-[13px] text-warn" role="status">{t('Narx QQS bilanmi yoki QQS sizmi?')}
        <button type="button" className="fz-btn min-h-[40px]" onClick={() => onRejim('bilan')}>{t('QQS bilan')}</button><button type="button" className="fz-btn min-h-[40px]" onClick={() => onRejim('siz')}>{t('QQS siz')}</button></p>}
      {p.kontragent != null && <p className="m-0 text-[13px] text-text-dim">{String(p.kontragent)}</p>}
      {p.qoldiq_hozir != null && <p className="m-0 text-[13px] text-text-dim">{t('Ostatka')}: {n(Number(p.qoldiq_hozir))} → <b>{n(Number(p.qoldiq_keyin))}</b></p>}
      {p.yangi != null && <p className="m-0 text-[13px] text-text-dim">{t('Yangi qiymat')}: {JSON.stringify(p.yangi)}</p>}
      {((p.ogohlantirish as string[] | undefined) ?? []).map((o) => <p key={o} className="m-0 text-[12px] text-warn">⚠ {o}</p>)}
      {boshqalar.length > 0 && <NomzodRoyxati nomzodlar={boshqalar} sarlavha={t('Boshqa nom kerakmi? Eslatmadan tanlang')} onTanla={onTanlov} />}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className="fz-btn fz-btn--primary min-h-[48px] justify-center" disabled={band} onClick={onTasdiq}>{t('Tasdiqlash')}</button>
        <button type="button" className="fz-btn min-h-[48px] justify-center" onClick={onBekor}>{t('Bekor')}</button>
      </div></div>;
  }
  if (natija.holat === 'material_topilmadi') return <NomzodRoyxati nomzodlar={natija.nomzodlar ?? []} sarlavha={t('Qaysi material?')} onTanla={onTanlov} />;
  if (natija.holat === 'hisobot' && natija.hisobot) return <HisobotQisqa h={natija.hisobot} />;
  if (natija.holat === 'javob') return <div className="text-[13px]">
    {natija.sana && <p className="m-0 mb-1 text-text-dim">{t('Ostatka')} · {natija.sana}</p>}
    {natija.nomzodlar?.slice(0, 15).map((g) => <p key={g.kalit + g.birligi} className="m-0 flex justify-between gap-3 border-b border-border py-1"><span>{g.nomi}</span><b>{n(g.qoldiq)} {g.birligi}</b></p>)}
    {natija.tarix?.qatorlar?.slice(0, 8).map((x) => <p key={x.id} className="m-0 py-0.5">{x.sana} {x.operatsiya === 'prixod' ? '+' : '−'}{n(x.obyomi)} {x.birligi} #{x.id}</p>)}</div>;
  if (natija.holat === 'yozuv_tanlang') return <div className="text-[13px]"><p className="m-0 mb-1 text-text-dim">{t('Tuzatish uchun aniq yozuvni tanlang — ro‘yxatdan «Tuzatish» tugmasidan foydalaning yoki buyruqqa yozuv raqamini qo‘shing (#123).')}</p>
    {natija.nomzodlar_yozuv?.map((x) => <p key={x.id} className="m-0 py-0.5">#{x.id} {x.sana} {x.nomi} {n(x.obyomi)} {x.birligi}</p>)}</div>;
  // «Tushunmadim» o'rniga: server bitta qisqa savol beradi (+ bosiladigan takliflar: kirim/chiqim, yetkazuvchi, material).
  if (natija.savol && (natija.holat === 'savol' || natija.holat === 'tushunilmadi' || natija.holat === 'toldirish_kerak')) {
    return <div className="rounded-md border border-border p-3 text-[13px]" role="status">
      <p className="m-0 text-text">{natija.savol}</p>
      {(natija.variantlar ?? []).length > 0 && <div className="mt-2 flex flex-wrap gap-2">{(natija.variantlar ?? []).map((v) => <button key={v.yorliq} type="button" className="fz-btn min-h-[40px]" disabled={band} onClick={() => onVariant(v.tanlov)}>{v.yorliq}</button>)}</div>}
    </div>;
  }
  return <p className="m-0 text-[13px] text-warn">{natija.holat === 'qoldiq_yetmaydi' ? `${t('Ostatka yetmaydi')}: ${n(natija.hozirgi_qoldiq)} < ${n(natija.sorlagan)}` : natija.holat === 'toldirish_kerak' ? `${t('Yetarli ma’lumot yo‘q')}: ${(natija.yetishmaydi ?? []).join(', ')}` : t('Tushunmadim yoki ma’lumot yetarli emas. Aniqroq ayting.')}</p>;
}

function NomzodRoyxati({ nomzodlar, sarlavha, onTanla }: { nomzodlar: OmborNomzod[]; sarlavha: string; onTanla: (g: OmborNomzod) => void }) {
  return <div className="mt-3"><p className="m-0 mb-1 text-[13px] text-text-dim">{sarlavha}</p>
    {nomzodlar.map((g) => <button key={g.kalit + g.birligi} type="button" onClick={() => onTanla(g)} className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left text-[14px]">
      <span>{g.nomi}</span><span className="text-[12px] text-text-dim">{n(g.qoldiq)} {g.birligi}</span></button>)}</div>;
}

/** Savolga javob (hisobot): davr, jami (birlik bo'yicha), summa QQS siz/bilan, oxirgi qatorlar. */
function HisobotQisqa({ h }: { h: NonNullable<OmborBuyruqNatija['hisobot']> }) {
  const j = h.jami;
  return <div className="rounded-md border border-border p-3 text-[13px]" role="group" aria-label={t('Hisobot')}>
    <p className="m-0 font-semibold">{t('Kirim / chiqim')} · {h.davr.dan ?? '…'} — {h.davr.gacha ?? '…'}</p>
    <p className="m-0 mt-1">{t('Kirim')}: <b>{j.kirim_soni}</b> · {j.birliklar.filter((b) => b.kirim > 0).map((b) => `${n(b.kirim)} ${b.birligi}`).join(', ') || '—'}</p>
    {j.kirim_summa > 0 && <p className="m-0 text-text-dim">{t('Summa (QQS siz)')}: {pul(j.kirim_summa)} · {t('QQS bilan')} ({j.qqs_foiz}%): {pul(j.kirim_summa_qqs)}</p>}
    {j.narxsiz_soni > 0 && <p className="m-0 text-warn">{t('Narxi yozilmagan kirim')}: {j.narxsiz_soni}</p>}
    <p className="m-0">{t('Chiqim')}: <b>{j.chiqim_soni}</b> · {j.birliklar.filter((b) => b.chiqim > 0).map((b) => `${n(b.chiqim)} ${b.birligi}`).join(', ') || '—'}</p>
    {h.qatorlar.slice(0, 10).map((x) => <p key={x.id} className="m-0 border-t border-border py-0.5">{x.sana.slice(5)} {x.operatsiya === 'prixod' ? '+' : '−'}{n(x.obyomi)} {x.birligi} {x.nomi}{x.kontragent ? ` · ${x.kontragent}` : ''}</p>)}
    {h.qator_soni > 10 && <p className="m-0 text-text-mute">… {h.qator_soni - 10}</p>}
    {h.qator_soni === 0 && <p className="m-0 text-text-mute">{t('Bu davrda yozuv yo‘q.')}</p>}
  </div>;
}
