import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Download, LoaderCircle, Mic, Search, Square } from 'lucide-react';
import { t, raqamFormatla } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { yangiOperationId } from '../../api/supabase';
import {
  omborEksport, omborQoldiq, omborRoyxat, omborTahlilMatn, omborTahlilOvoz, omborTarix, omborTasdiq, omborTuzat, omborYoz,
  type OmborBuyruqNatija, type OmborFiltr, type OmborGuruh, type OmborHarakat, type OmborNomzod, type OmborQoldiq, type OmborRoyxat, type OmborTarix,
} from '../../api/t2-ombor';
import { OpsOyna } from '../kompaniya-ops/OpsUi';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';

/**
 * Omborchi ish joyi (markaziy ombor): tez kirim/chiqim, birlashgan ostatka (variantlar bitta qatorda), harakatlar, material kartasi,
 * ovoz/matn buyrug'i, Excel. Hamma narsa `/api/ombor-buyruq` orqali — Android va Telegram bilan bir xil server mantiqi.
 */
const n = (v: number | null | undefined) => (v == null ? '—' : raqamFormatla(Number(v), { maximumFractionDigits: 4 }));
const bugun = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
const KOD: Record<string, string> = {
  QOLDIQ_YETMAYDI: 'Ostatka yetmaydi — chiqim yozilmadi.', PERMISSION_DENIED: 'Bu amal uchun ruxsat yo‘q.', DATE_IN_FUTURE: 'Sana kelajakda bo‘lishi mumkin emas.',
  INVALID_INPUT: 'Ma’lumot noto‘g‘ri (nom, birlik, miqdor).', OPERATION_ID_CONFLICT: 'Bu amal boshqa ma’lumot bilan yuborilgan. Sahifani yangilang.',
  NETWORK: 'Aloqa yo‘q. Qayta urinib ko‘ring.', ALREADY_REVERSED: 'Bu yozuv allaqachon tuzatilgan.', MOVEMENT_NOT_CORRECTABLE: 'Bu yozuvni tuzatib bo‘lmaydi.',
  TOKEN_YETMAYDI: 'Tokenlar yetarli emas.', BYUDJET_TUGADI: 'AI oylik limiti tugadi.', VOICE_NOT_CONFIGURED: 'Ovozni matnga o‘tkazish yoqilmagan.',
};
const xatoMatni = (code?: string, xabar?: string) => t(KOD[code ?? ''] ?? xabar ?? 'Bajarilmadi. Birozdan keyin urinib ko‘ring.');
const inp = 'h-[48px] w-full rounded-md border border-[var(--border-strong)] bg-bg px-3 text-[14px] text-text';

export function OmborIshJoyi({ kompaniyaId, skladId, skladNomi, yozishMumkin }: { kompaniyaId: number; skladId: number; skladNomi: string; yozishMumkin: boolean }) {
  const [tab, setTab] = useState<'qoldiq' | 'harakat'>('qoldiq');
  const [yangilash, setYangilash] = useState(0);
  const yan = () => setYangilash((x) => x + 1);
  return <section className="flex flex-col gap-4" aria-label={t('Omborchi ish joyi')}>
    {yozishMumkin && <BuyruqQutisi kompaniyaId={kompaniyaId} skladId={skladId} onYozildi={yan} />}
    {yozishMumkin && <TezKiritish kompaniyaId={kompaniyaId} skladId={skladId} onYozildi={yan} />}
    <div className="flex gap-1 border-b border-border" role="tablist" aria-label={skladNomi}>
      {(['qoldiq', 'harakat'] as const).map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
        className={`-mb-px min-h-[44px] border-b-2 px-4 text-[14px] font-medium ${tab === k ? 'border-accent text-text' : 'border-transparent text-text-mute'}`}>
        {k === 'qoldiq' ? t('Ostatka') : t('Kirim / chiqim')}</button>)}
    </div>
    {tab === 'qoldiq' ? <QoldiqJadval kompaniyaId={kompaniyaId} skladId={skladId} yozishMumkin={yozishMumkin} yangilash={yangilash} onO_zgardi={yan} />
      : <HarakatJadval kompaniyaId={kompaniyaId} skladId={skladId} yozishMumkin={yozishMumkin} yangilash={yangilash} onO_zgardi={yan} />}
  </section>;
}

/* ───────────── tez kiritish: bir necha harf → tanlash → miqdor → saqlash ───────────── */
function TezKiritish({ kompaniyaId, skladId, onYozildi }: { kompaniyaId: number; skladId: number; onYozildi: () => void }) {
  const [tur, setTur] = useState<'prixod' | 'chiqim'>('prixod');
  const [nom, setNom] = useState(''); const [birlik, setBirlik] = useState(''); const [miqdor, setMiqdor] = useState('');
  const [kontragent, setKontragent] = useState(''); const [sana, setSana] = useState(bugun());
  const [tanlangan, setTanlangan] = useState<OmborGuruh | null>(null);
  const [takliflar, setTakliflar] = useState<OmborGuruh[]>([]);
  const [band, setBand] = useState(false); const [xato, setXato] = useState<string | null>(null);
  const op = useRef(yangilangan()); const miqdorRef = useRef<HTMLInputElement>(null); const avlod = useRef(0);
  function yangilangan() { return yangiOperationId(); }

  useEffect(() => {
    if (tanlangan || nom.trim().length < 2) { setTakliflar([]); return; }
    const g = ++avlod.current;
    const id = setTimeout(() => { void omborQoldiq(kompaniyaId, skladId, { qidir: nom, musbat: '0' }, 6).then((r) => { if (g === avlod.current && r.ok) setTakliflar(r.qatorlar); }); }, 220);
    return () => clearTimeout(id);
  }, [nom, tanlangan, kompaniyaId, skladId]);

  const tanla = (g: OmborGuruh) => { setTanlangan(g); setNom(g.nomi); setBirlik(g.birligi); setTakliflar([]); setTimeout(() => miqdorRef.current?.focus(), 0); };
  const tozala = () => { setNom(''); setBirlik(''); setMiqdor(''); setKontragent(''); setTanlangan(null); setTakliflar([]); op.current = yangilangan(); };
  const saqla = async () => {
    setXato(null);
    const m = miqdor.replace(',', '.').trim();
    if (!nom.trim() || !birlik.trim() || !(Number(m) > 0)) { setXato(t('Material, birlik va miqdorni kiriting.')); return; }
    if (tur === 'chiqim' && !tanlangan) { setXato(t('Chiqim uchun ro‘yxatdan materialni tanlang.')); return; }
    setBand(true);
    const r = await omborYoz(kompaniyaId, skladId, { operatsiya: tur, nomi: nom.trim(), birligi: birlik.trim(), miqdor: m, sana, kontragent: kontragent.trim() || undefined, operation_id: op.current });
    setBand(false);
    if (!r.ok) { setXato(xatoMatni(r.code)); return; }
    toast(`${tur === 'prixod' ? t('Kirim yozildi') : t('Chiqim yozildi')}: ${nom.trim()} ${n(Number(m))} ${birlik}`, 'ok');
    tozala(); onYozildi();
  };

  return <form className="rounded-lg border border-border p-3" onSubmit={(e) => { e.preventDefault(); void saqla(); }} aria-label={t('Tez kiritish')}>
    <div className="mb-3 grid grid-cols-2 gap-2" role="group" aria-label={t('Amal turi')}>
      <button type="button" aria-pressed={tur === 'prixod'} onClick={() => setTur('prixod')} className={`fz-btn min-h-[48px] justify-center ${tur === 'prixod' ? 'fz-btn--primary' : ''}`}><ArrowDownToLine size={16} aria-hidden="true" />{t('Kirim')}</button>
      <button type="button" aria-pressed={tur === 'chiqim'} onClick={() => setTur('chiqim')} className={`fz-btn min-h-[48px] justify-center ${tur === 'chiqim' ? 'fz-btn--primary' : ''}`}><ArrowUpFromLine size={16} aria-hidden="true" />{t('Chiqim')}</button>
    </div>
    <div className="relative">
      <input aria-label={t('Material')} placeholder={t('Material: bir necha harf yozing (lotin/kirill)')} value={nom} autoComplete="off" inputMode="search"
        onChange={(e) => { setNom(e.target.value); setTanlangan(null); }} className={inp} />
      {takliflar.length > 0 && <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-[var(--border-strong)] bg-bg shadow-lg" role="listbox" aria-label={t('Takliflar')}>
        {takliflar.map((g) => <li key={g.kalit + g.birligi} role="option" aria-selected={false}>
          <button type="button" onClick={() => tanla(g)} className="flex min-h-[48px] w-full items-center justify-between gap-3 px-3 py-2 text-left text-[14px] hover:bg-bg-alt">
            <span className="min-w-0 flex-1 break-words">{g.nomi}{g.variantlar_soni > 1 && <span className="ml-1 text-[11px] text-text-mute">({g.variantlar_soni} {t('yozuv')})</span>}</span>
            <span className="shrink-0 text-[12px] text-text-dim">{n(g.qoldiq)} {g.birligi}</span></button></li>)}
      </ul>}
    </div>
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <input ref={miqdorRef} aria-label={t('Miqdor')} placeholder={t('Miqdor')} inputMode="decimal" value={miqdor} onChange={(e) => setMiqdor(e.target.value)} className={inp} />
      <input aria-label={t('Birlik')} placeholder={t('Birlik')} value={birlik} onChange={(e) => setBirlik(e.target.value)} className={inp} />
      <input aria-label={tur === 'prixod' ? t('Yetkazuvchi') : t('Kimga (prorab / brigada)')} placeholder={tur === 'prixod' ? t('Yetkazuvchi') : t('Kimga (prorab / brigada)')} value={kontragent} onChange={(e) => setKontragent(e.target.value)} className={`${inp} col-span-2 sm:col-span-1`} />
      <input type="date" aria-label={t('Sana')} value={sana} max={bugun()} onChange={(e) => setSana(e.target.value)} className={`${inp} col-span-2 sm:col-span-1`} />
    </div>
    {tanlangan && <p className="m-0 mt-2 text-[12px] text-text-dim">{t('Ombordagi ostatka')}: <b>{n(tanlangan.qoldiq)} {tanlangan.birligi}</b></p>}
    {xato && <p role="alert" className="m-0 mt-2 text-[13px] text-danger">{xato}</p>}
    <button type="submit" disabled={band} className="fz-btn fz-btn--primary mt-3 min-h-[52px] w-full justify-center text-[15px] font-semibold">
      {band && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}{t('Saqlash')}</button>
  </form>;
}

/* ───────────── ovoz / matn buyrug'i → preview → tasdiq ───────────── */
function BuyruqQutisi({ kompaniyaId, skladId, onYozildi }: { kompaniyaId: number; skladId: number; onYozildi: () => void }) {
  const [matn, setMatn] = useState(''); const [band, setBand] = useState(false); const [yozilmoqda, setYozilmoqda] = useState(false);
  const [natija, setNatija] = useState<OmborBuyruqNatija | null>(null); const [xato, setXato] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null); const bo_laklar = useRef<Blob[]>([]);

  const tahlilNatija = (r: Awaited<ReturnType<typeof omborTahlilMatn>>) => {
    setBand(false);
    if (!r.ok) { setNatija(null); setXato(xatoMatni(r.code, r.xabar)); return; }
    setNatija(r); if (r.matn) setMatn(r.matn);
  };
  const yubor = async (tanlov?: { nomi: string; birligi: string }) => {
    if (!matn.trim()) return; setXato(null); setBand(true);
    tahlilNatija(await omborTahlilMatn(kompaniyaId, skladId, matn.trim(), tanlov));
  };
  const yozishBosh = async () => {
    setXato(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream); bo_laklar.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) bo_laklar.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((x) => x.stop()); setYozilmoqda(false); setBand(true);
        const blob = new Blob(bo_laklar.current, { type: mr.mimeType || 'audio/webm' });
        void omborTahlilOvoz(kompaniyaId, skladId, blob).then(tahlilNatija);
      };
      rec.current = mr; mr.start(); setYozilmoqda(true);
    } catch { setXato(t('Mikrofonga ruxsat berilmadi.')); }
  };
  const yozishTugat = () => rec.current?.state === 'recording' && rec.current.stop();
  const tasdiqla = async () => {
    if (!natija?.token) return; setBand(true);
    const r = await omborTasdiq(kompaniyaId, skladId, natija.token); setBand(false);
    if (!r.ok) { setXato(xatoMatni(r.code)); return; }
    toast(r.takror ? t('Bu amal allaqachon yozilgan.') : t('Yozildi'), 'ok'); setNatija(null); setMatn(''); onYozildi();
  };
  const p = natija?.preview as Record<string, unknown> | undefined;

  return <div className="rounded-lg border border-border p-3" aria-label={t('Ovozli yoki matnli buyruq')}>
    <div className="flex gap-2">
      <input aria-label={t('Buyruq')} placeholder={t('Masalan: «sement 10 tonna keldi» yoki «mix 20 kg Aliga berdim»')} value={matn} onChange={(e) => setMatn(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void yubor(); }} className={inp} />
      <button type="button" aria-label={yozilmoqda ? t('To‘xtatish') : t('Ovoz bilan')} onClick={() => (yozilmoqda ? yozishTugat() : void yozishBosh())} disabled={band && !yozilmoqda}
        className={`fz-btn min-h-[48px] min-w-[48px] justify-center ${yozilmoqda ? 'fz-btn--primary' : ''}`}>{yozilmoqda ? <Square size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}</button>
      <button type="button" onClick={() => void yubor()} disabled={band || !matn.trim()} className="fz-btn min-h-[48px] justify-center">{band ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : t('Tushun')}</button>
    </div>
    {xato && <p role="alert" className="m-0 mt-2 text-[13px] text-danger">{xato}</p>}
    {natija?.ai_xabar && <p className="m-0 mt-2 text-[12px] text-warn">{natija.ai_xabar}</p>}
    {natija && natija.holat === 'tasdiq_kerak' && p && <div className="mt-3 rounded-md border border-accent p-3" role="group" aria-label={t('Tasdiqlash kartasi')}>
      <p className="m-0 text-[14px] font-semibold">{p.amal === 'bekor' ? t('Yozuvni BEKOR qilish') : p.amal === 'tuzat' ? t('Yozuvni TUZATISH') : p.tur === 'prixod' ? t('KIRIM') : t('CHIQIM')}
        {p.harakat_id != null && <> #{String(p.harakat_id)}</>}</p>
      {p.nomi != null && <p className="m-0 mt-1 text-[14px]">{String(p.nomi)} — <b>{n(Number(p.miqdor))} {String(p.birligi)}</b> · {String(p.sana)}</p>}
      {p.kontragent != null && <p className="m-0 text-[13px] text-text-dim">{String(p.kontragent)}</p>}
      {p.qoldiq_hozir != null && <p className="m-0 text-[13px] text-text-dim">{t('Ostatka')}: {n(Number(p.qoldiq_hozir))} → <b>{n(Number(p.qoldiq_keyin))}</b></p>}
      {p.yangi != null && <p className="m-0 text-[13px] text-text-dim">{t('Yangi qiymat')}: {JSON.stringify(p.yangi)}</p>}
      {((p.ogohlantirish as string[] | undefined) ?? []).map((o) => <p key={o} className="m-0 text-[12px] text-warn">⚠ {o}</p>)}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className="fz-btn fz-btn--primary min-h-[48px] justify-center" disabled={band} onClick={() => void tasdiqla()}>{t('Tasdiqlash')}</button>
        <button type="button" className="fz-btn min-h-[48px] justify-center" onClick={() => setNatija(null)}>{t('Bekor')}</button>
      </div></div>}
    {natija && (natija.holat === 'material_tanlang' || natija.holat === 'material_topilmadi') && <NomzodRoyxati nomzodlar={natija.nomzodlar ?? []} sarlavha={t('Qaysi material?')} onTanla={(g) => void yubor({ nomi: g.nomi, birligi: g.birligi })} />}
    {natija?.holat === 'javob' && <div className="mt-3 text-[13px]">
      {natija.nomzodlar?.slice(0, 5).map((g) => <p key={g.kalit + g.birligi} className="m-0 flex justify-between gap-3 border-b border-border py-1"><span>{g.nomi}</span><b>{n(g.qoldiq)} {g.birligi}</b></p>)}
      {natija.tarix?.qatorlar?.slice(0, 8).map((x) => <p key={x.id} className="m-0 py-0.5">{x.sana} {x.operatsiya === 'prixod' ? '+' : '−'}{n(x.obyomi)} {x.birligi} #{x.id}</p>)}</div>}
    {natija?.holat === 'yozuv_tanlang' && <div className="mt-3 text-[13px]"><p className="m-0 mb-1 text-text-dim">{t('Tuzatish uchun aniq yozuvni tanlang — ro‘yxatdan «Tuzatish» tugmasidan foydalaning yoki buyruqqa yozuv raqamini qo‘shing (#123).')}</p>
      {natija.nomzodlar_yozuv?.map((x) => <p key={x.id} className="m-0 py-0.5">#{x.id} {x.sana} {x.nomi} {n(x.obyomi)} {x.birligi}</p>)}</div>}
    {natija && ['toldirish_kerak', 'tushunilmadi', 'qoldiq_yetmaydi', 'obyekt_tanlang', 'sana_kelajakda', 'yozuv_topilmadi', 'nom_kerak', 'yangi_qiymat_kerak'].includes(natija.holat) &&
      <p className="m-0 mt-2 text-[13px] text-warn">{natija.holat === 'qoldiq_yetmaydi' ? `${t('Ostatka yetmaydi')}: ${n(natija.hozirgi_qoldiq)} < ${n(natija.sorlagan)}` : natija.holat === 'toldirish_kerak' ? `${t('Yetarli ma’lumot yo‘q')}: ${(natija.yetishmaydi ?? []).join(', ')}` : t('Tushunmadim yoki ma’lumot yetarli emas. Aniqroq ayting.')}</p>}
  </div>;
}

function NomzodRoyxati({ nomzodlar, sarlavha, onTanla }: { nomzodlar: OmborNomzod[]; sarlavha: string; onTanla: (g: OmborNomzod) => void }) {
  return <div className="mt-3"><p className="m-0 mb-1 text-[13px] text-text-dim">{sarlavha}</p>
    {nomzodlar.map((g) => <button key={g.kalit + g.birligi} type="button" onClick={() => onTanla(g)} className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left text-[14px]">
      <span>{g.nomi}</span><span className="text-[12px] text-text-dim">{n(g.qoldiq)} {g.birligi}</span></button>)}</div>;
}

/* ───────────── ostatka (birlashgan) ───────────── */
function QoldiqJadval({ kompaniyaId, skladId, yozishMumkin, yangilash, onO_zgardi }: { kompaniyaId: number; skladId: number; yozishMumkin: boolean; yangilash: number; onO_zgardi: () => void }) {
  const [qidir, setQidir] = useState(''); const [tur, setTur] = useState(''); const [musbat, setMusbat] = useState<'1' | '0'>('1');
  const [offset, setOffset] = useState(0); const [data, setData] = useState<OmborQoldiq | null>(null); const [xato, setXato] = useState<string | null>(null);
  const [yuk, setYuk] = useState(false); const [karta, setKarta] = useState<OmborGuruh | null>(null); const [eks, setEks] = useState(false); const avlod = useRef(0);
  const filtr: OmborFiltr = { qidir: qidir.trim() || undefined, tur: tur || undefined, musbat, tartib: 'nom' };
  const SAHIFA = 50;
  const yukla = useCallback(async () => {
    const g = ++avlod.current; setYuk(true); setXato(null);
    const r = await omborQoldiq(kompaniyaId, skladId, { qidir: qidir.trim() || undefined, tur: tur || undefined, musbat, tartib: 'nom' }, SAHIFA, offset);
    if (g !== avlod.current) return; setYuk(false);
    if (r.ok) setData(r); else { setData(null); setXato(xatoMatni(r.code)); }
  }, [kompaniyaId, skladId, qidir, tur, musbat, offset]);
  useEffect(() => { const id = setTimeout(() => void yukla(), qidir ? 250 : 0); return () => clearTimeout(id); }, [yukla, yangilash, qidir]);
  useEffect(() => { setOffset(0); }, [qidir, tur, musbat, kompaniyaId, skladId]);

  const eksport = async () => {
    setEks(true); const r = await omborEksport(kompaniyaId, skladId, filtr as Record<string, string>); setEks(false);
    if (!r.ok) { toast(xatoMatni(r.code, r.xabar), 'danger'); return; }
    // Yagona yuklab berish yo'li: tizim imzosi + manba QR (token serverda yechilgan — /api/ombor-buyruq eksport).
    downloadBlob(new Uint8Array(await r.blob.arrayBuffer()), r.faylNomi);
  };
  const jami = data?.jami ?? 0;
  return <div className="flex flex-col gap-3">
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
      <label className="relative block sm:col-span-2"><Search size={15} className="absolute left-3 top-4 text-text-mute" aria-hidden="true" />
        <input aria-label={t('Material qidirish')} placeholder={t('Qidirish: nom, lotin yoki kirill')} value={qidir} onChange={(e) => setQidir(e.target.value)} className={`${inp} pl-9`} /></label>
      <select aria-label={t('Material turi')} value={tur} onChange={(e) => setTur(e.target.value)} className={inp}>
        <option value="">{t('Hamma turlar')}</option>{(data?.turlar ?? []).map((x) => <option key={x} value={x}>{x}</option>)}</select>
      <button type="button" className="fz-btn min-h-[48px] justify-center" onClick={() => void eksport()} disabled={eks}>
        {eks ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}{t('Excel')}</button>
    </div>
    <label className="flex min-h-[40px] items-center gap-2 text-[13px]"><input type="checkbox" checked={musbat === '1'} onChange={(e) => setMusbat(e.target.checked ? '1' : '0')} />{t('Faqat ostatkasi bor')}</label>
    {xato && <p role="alert" className="m-0 text-[13px] text-danger">{xato}</p>}
    <div className="overflow-x-auto"><table className="w-full min-w-[560px] border-collapse text-[13px]">
      <thead><tr className="text-left text-text-mute"><th className="p-2">{t('Material')}</th><th className="p-2">{t('Birlik')}</th><th className="p-2 text-right">{t('Kirim')}</th><th className="p-2 text-right">{t('Chiqim')}</th><th className="p-2 text-right">{t('Ostatka')}</th></tr></thead>
      <tbody>{(data?.qatorlar ?? []).map((g) => <tr key={g.kalit + g.birligi} className="cursor-pointer border-t border-border hover:bg-bg-alt" tabIndex={0} onClick={() => setKarta(g)} onKeyDown={(e) => { if (e.key === 'Enter') setKarta(g); }}>
        <td className="p-2">{g.nomi}{g.variantlar_soni > 1 && <span className="ml-1 text-[11px] text-text-mute">({g.variantlar_soni} {t('yozuv')})</span>}</td>
        <td className="p-2">{g.birligi}</td><td className="p-2 text-right">{n(g.kirim)}</td><td className="p-2 text-right">{n(g.chiqim)}</td>
        <td className={`p-2 text-right font-semibold ${g.qoldiq < 0 ? 'text-danger' : ''}`}>{n(g.qoldiq)}</td></tr>)}
        {!yuk && data && data.qatorlar.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-text-mute">{t('Hech narsa topilmadi.')}</td></tr>}</tbody></table></div>
    <Sahifalash jami={jami} offset={offset} sahifa={SAHIFA} yuk={yuk} onO_zgar={setOffset} />
    {karta && <MaterialKartasi kompaniyaId={kompaniyaId} skladId={skladId} guruh={karta} yozishMumkin={yozishMumkin} onYop={() => setKarta(null)} onO_zgardi={() => { onO_zgardi(); void yukla(); }} />}
  </div>;
}

function Sahifalash({ jami, offset, sahifa, yuk, onO_zgar }: { jami: number; offset: number; sahifa: number; yuk: boolean; onO_zgar: (o: number) => void }) {
  if (jami <= sahifa) return null;
  return <div className="flex items-center justify-between text-[13px]">
    <span>{offset + 1}–{Math.min(offset + sahifa, jami)} / {jami}</span>
    <span className="flex gap-2"><button type="button" className="fz-btn min-h-[44px]" disabled={yuk || offset === 0} onClick={() => onO_zgar(Math.max(0, offset - sahifa))}>{t('Oldingi')}</button>
      <button type="button" className="fz-btn min-h-[44px]" disabled={yuk || offset + sahifa >= jami} onClick={() => onO_zgar(offset + sahifa)}>{t('Keyingi')}</button></span></div>;
}

/* ───────────── material kartasi: tarix + tuzatish ───────────── */
const TUZATILADI = new Set(['ombor_prixod_v1', 'ombor_chiqim_v1', 'ombor_prixod_sinxron_v1', 'c11_warehouse_receipt_v1']);
function MaterialKartasi({ kompaniyaId, skladId, guruh, yozishMumkin, onYop, onO_zgardi }: { kompaniyaId: number; skladId: number; guruh: OmborGuruh; yozishMumkin: boolean; onYop: () => void; onO_zgardi: () => void }) {
  const [tarix, setTarix] = useState<OmborTarix | null>(null); const [xato, setXato] = useState<string | null>(null);
  const [tuzat, setTuzat] = useState<{ h: OmborHarakat; miqdor: string; sabab: string; op: string; band: boolean } | null>(null);
  const yukla = useCallback(async () => {
    const r = await omborTarix(kompaniyaId, skladId, guruh.kalit, guruh.birligi, 100);
    if (r.ok) setTarix(r); else setXato(xatoMatni(r.code));
  }, [kompaniyaId, skladId, guruh]);
  useEffect(() => { void yukla(); }, [yukla]);
  const yubor = async (bekorQil: boolean) => {
    if (!tuzat) return;
    if (!tuzat.sabab.trim() || (!bekorQil && !(Number(tuzat.miqdor.replace(',', '.')) > 0))) { setXato(t('Sabab va to‘g‘ri miqdorni yozing.')); return; }
    setTuzat({ ...tuzat, band: true }); setXato(null);
    const r = await omborTuzat(kompaniyaId, skladId, { harakat_id: tuzat.h.id, yangi: bekorQil ? null : { miqdor: tuzat.miqdor.replace(',', '.') }, sabab: tuzat.sabab.trim(), operation_id: tuzat.op });
    if (!r.ok) { setTuzat({ ...tuzat, band: false }); setXato(xatoMatni(r.code)); return; }
    toast(t('Tuzatildi'), 'ok'); setTuzat(null); await yukla(); onO_zgardi();
  };
  return <OpsOyna ochiq sarlavha={guruh.nomi} onYop={onYop} kenglik={720}>
    <p className="m-0 text-[13px] text-text-dim">{t('Ostatka')}: <b>{n(guruh.qoldiq)} {guruh.birligi}</b> · {t('Kirim')} {n(guruh.kirim)} · {t('Chiqim')} {n(guruh.chiqim)}{guruh.variantlar_soni > 1 && <> · {guruh.variantlar_soni} {t('xil yozilish bitta materialga jamlangan')}</>}</p>
    {xato && <p role="alert" className="m-0 mt-2 text-[13px] text-danger">{xato}</p>}
    <ul className="m-0 mt-3 list-none p-0">{(tarix?.qatorlar ?? []).map((h) => <li key={h.id} className={`border-t border-border py-2 text-[13px] ${h.teskari ? 'opacity-50 line-through' : ''}`}>
      <div className="flex items-start justify-between gap-3"><span><b>{h.sana}</b> · {h.operatsiya === 'prixod' ? '+' : '−'}{n(h.obyomi)} {h.birligi}<br /><span className="text-text-dim">{h.nomi}{h.postavshik ? ` · ${h.postavshik}` : ''}{h.qabul_qiluvchi ? ` → ${h.qabul_qiluvchi}` : ''}</span></span>
        {yozishMumkin && !h.teskari && TUZATILADI.has(h.manba) && <button type="button" className="fz-btn min-h-[40px]" onClick={() => setTuzat({ h, miqdor: String(h.obyomi), sabab: '', op: yangiOperationId(), band: false })}>{t('Tuzatish')}</button>}</div>
      {tuzat?.h.id === h.id && <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input aria-label={t('Yangi miqdor')} inputMode="decimal" value={tuzat.miqdor} onChange={(e) => setTuzat({ ...tuzat, miqdor: e.target.value })} className={inp} />
        <input aria-label={t('Sabab')} placeholder={t('Sabab (majburiy)')} value={tuzat.sabab} onChange={(e) => setTuzat({ ...tuzat, sabab: e.target.value })} className={inp} />
        <div className="flex gap-2"><button type="button" className="fz-btn fz-btn--primary min-h-[48px] flex-1 justify-center" disabled={tuzat.band} onClick={() => void yubor(false)}>{t('Saqlash')}</button>
          <button type="button" className="fz-btn min-h-[48px] flex-1 justify-center" disabled={tuzat.band} onClick={() => void yubor(true)}>{t('Bekor qilish')}</button></div></div>}</li>)}</ul>
  </OpsOyna>;
}

/* ───────────── kirim / chiqim ro'yxati ───────────── */
function HarakatJadval({ kompaniyaId, skladId, yangilash }: { kompaniyaId: number; skladId: number; yozishMumkin: boolean; yangilash: number; onO_zgardi: () => void }) {
  const [op, setOp] = useState<'' | 'prixod' | 'rasxod'>(''); const [qidir, setQidir] = useState(''); const [dan, setDan] = useState(''); const [gacha, setGacha] = useState('');
  const [offset, setOffset] = useState(0); const [data, setData] = useState<OmborRoyxat | null>(null); const [xato, setXato] = useState<string | null>(null); const [yuk, setYuk] = useState(false); const avlod = useRef(0);
  const SAHIFA = 50;
  const yukla = useCallback(async () => {
    const g = ++avlod.current; setYuk(true); setXato(null);
    const r = await omborRoyxat(kompaniyaId, skladId, { operatsiya: op || undefined, qidir: qidir.trim() || undefined, dan: dan || undefined, gacha: gacha || undefined }, SAHIFA, offset);
    if (g !== avlod.current) return; setYuk(false);
    if (r.ok) setData(r); else { setData(null); setXato(xatoMatni(r.code)); }
  }, [kompaniyaId, skladId, op, qidir, dan, gacha, offset]);
  useEffect(() => { const id = setTimeout(() => void yukla(), qidir ? 250 : 0); return () => clearTimeout(id); }, [yukla, yangilash, qidir]);
  useEffect(() => { setOffset(0); }, [op, qidir, dan, gacha, kompaniyaId, skladId]);
  return <div className="flex flex-col gap-3">
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      <select aria-label={t('Amal turi')} value={op} onChange={(e) => setOp(e.target.value as typeof op)} className={inp}><option value="">{t('Kirim va chiqim')}</option><option value="prixod">{t('Faqat kirim')}</option><option value="rasxod">{t('Faqat chiqim')}</option></select>
      <input aria-label={t('Material qidirish')} placeholder={t('Material')} value={qidir} onChange={(e) => setQidir(e.target.value)} className={`${inp} sm:col-span-2`} />
      <input type="date" aria-label={t('Dan')} value={dan} onChange={(e) => setDan(e.target.value)} className={inp} />
      <input type="date" aria-label={t('Gacha')} value={gacha} onChange={(e) => setGacha(e.target.value)} className={inp} />
    </div>
    {xato && <p role="alert" className="m-0 text-[13px] text-danger">{xato}</p>}
    <div className="overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-[13px]">
      <thead><tr className="text-left text-text-mute"><th className="p-2">{t('Sana')}</th><th className="p-2">{t('Amal')}</th><th className="p-2">{t('Material')}</th><th className="p-2 text-right">{t('Miqdor')}</th><th className="p-2">{t('Kim / kimdan')}</th></tr></thead>
      <tbody>{(data?.qatorlar ?? []).map((h) => <tr key={h.id} className={`border-t border-border ${h.teskari ? 'opacity-50 line-through' : ''}`}>
        <td className="p-2 whitespace-nowrap">{h.sana}</td><td className="p-2">{h.operatsiya === 'prixod' ? t('Kirim') : t('Chiqim')}</td><td className="p-2">{h.nomi}</td>
        <td className="p-2 text-right whitespace-nowrap">{n(h.obyomi)} {h.birligi}</td><td className="p-2">{h.operatsiya === 'prixod' ? h.postavshik : h.qabul_qiluvchi}</td></tr>)}
        {!yuk && data && data.qatorlar.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-text-mute">{t('Hech narsa topilmadi.')}</td></tr>}</tbody></table></div>
    <Sahifalash jami={data?.jami ?? 0} offset={offset} sahifa={SAHIFA} yuk={yuk} onO_zgar={setOffset} />
  </div>;
}
