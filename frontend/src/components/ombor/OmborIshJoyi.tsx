import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, LoaderCircle, Search } from 'lucide-react';
import { t, raqamFormatla } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { yangiOperationId } from '../../api/supabase';
import {
  omborEksport, omborQoldiq, omborQoldiqSana, omborTarix, omborTuzat,
  type OmborFiltr, type OmborGuruh, type OmborHarakat, type OmborQoldiq, type OmborTarix,
} from '../../api/t2-ombor';
import { OpsOyna } from '../kompaniya-ops/OpsUi';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { OmborKiritish } from './OmborKiritish';
import { OmborHisobotPaneli } from './OmborHisobot';
import { OmborLugat } from './OmborLugat';
import { omborXatoMatni } from './ombor-xato';

/**
 * Omborchi ish joyi — SODDA: bitta kiritish qatori (matn/ovoz) + takliflar + Kirim/Chiqim tugmalari, bugungi ro'yxat, «Hisobot» va «Qoldiq».
 * Murakkab narsalar (filtrlar, Excel, tuzatish) «Ko'proq» ostida. Hamma narsa `/api/ombor-buyruq` orqali — Android va Telegram bilan bir xil server mantiqi.
 */
const n = (v: number | null | undefined) => (v == null ? '—' : raqamFormatla(Number(v), { maximumFractionDigits: 4 }));
const bugun = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
const inp = 'h-[48px] w-full rounded-md border border-[var(--border-strong)] bg-bg px-3 text-[14px] text-text';
type Tab = 'bugun' | 'hisobot' | 'qoldiq' | 'lugat';

export function OmborIshJoyi({ kompaniyaId, skladId, skladNomi, yozishMumkin }: { kompaniyaId: number; skladId: number; skladNomi: string; yozishMumkin: boolean }) {
  const [tab, setTab] = useState<Tab>('bugun');
  const [yangilash, setYangilash] = useState(0);
  const yan = () => setYangilash((x) => x + 1);
  return <section className="flex flex-col gap-4" aria-label={t('Omborchi ish joyi')}>
    {yozishMumkin && <OmborKiritish kompaniyaId={kompaniyaId} skladId={skladId} onYozildi={yan} />}
    <div className="flex gap-1 border-b border-border" role="tablist" aria-label={skladNomi}>
      {(['bugun', 'hisobot', 'qoldiq', 'lugat'] as const).map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
        className={`-mb-px min-h-[44px] flex-1 border-b-2 px-3 text-[14px] font-medium sm:flex-none sm:px-4 ${tab === k ? 'border-accent text-text' : 'border-transparent text-text-mute'}`}>
        {k === 'bugun' ? t('Bugun') : k === 'hisobot' ? t('Hisobot') : k === 'qoldiq' ? t('Qoldiq') : t('Ombor lugati')}</button>)}
    </div>
    {tab === 'bugun' && <OmborHisobotPaneli kompaniyaId={kompaniyaId} skladId={skladId} yangilash={yangilash} kompakt />}
    {tab === 'hisobot' && <OmborHisobotPaneli kompaniyaId={kompaniyaId} skladId={skladId} yangilash={yangilash} yozishMumkin={yozishMumkin} />}
    {tab === 'lugat' && <OmborLugat kompaniyaId={kompaniyaId} skladId={skladId} yozishMumkin={yozishMumkin} />}
    {tab === 'qoldiq' && <QoldiqJadval kompaniyaId={kompaniyaId} skladId={skladId} yozishMumkin={yozishMumkin} yangilash={yangilash} onO_zgardi={yan} />}
  </section>;
}

/* ───────────── ostatka (birlashgan), istalgan sanada ───────────── */
function QoldiqJadval({ kompaniyaId, skladId, yozishMumkin, yangilash, onO_zgardi }: { kompaniyaId: number; skladId: number; yozishMumkin: boolean; yangilash: number; onO_zgardi: () => void }) {
  const [qidir, setQidir] = useState(''); const [tur, setTur] = useState(''); const [musbat, setMusbat] = useState<'1' | '0'>('1'); const [sana, setSana] = useState('');
  const [offset, setOffset] = useState(0); const [data, setData] = useState<OmborQoldiq | null>(null); const [xato, setXato] = useState<string | null>(null);
  const [yuk, setYuk] = useState(false); const [karta, setKarta] = useState<OmborGuruh | null>(null); const [eks, setEks] = useState(false); const avlod = useRef(0);
  const SAHIFA = 50;
  const o_tgan = !!sana && sana < bugun();
  const yukla = useCallback(async () => {
    const g = ++avlod.current; setYuk(true); setXato(null);
    const f: OmborFiltr = { qidir: qidir.trim() || undefined, tur: tur || undefined, musbat, tartib: 'nom' };
    const r = o_tgan ? await omborQoldiqSana(kompaniyaId, skladId, sana, f, SAHIFA, offset) : await omborQoldiq(kompaniyaId, skladId, f, SAHIFA, offset);
    if (g !== avlod.current) return; setYuk(false);
    if (r.ok) setData(r); else { setData(null); setXato(omborXatoMatni(r.code)); }
  }, [kompaniyaId, skladId, qidir, tur, musbat, offset, sana, o_tgan]);
  useEffect(() => { const id = setTimeout(() => void yukla(), qidir ? 250 : 0); return () => clearTimeout(id); }, [yukla, yangilash, qidir]);
  useEffect(() => { setOffset(0); }, [qidir, tur, musbat, sana, kompaniyaId, skladId]);

  const eksport = async () => {
    setEks(true); const r = await omborEksport(kompaniyaId, skladId, { qidir: qidir.trim() || undefined, tur: tur || undefined, musbat } as Record<string, string>, 'qoldiq', o_tgan ? sana : undefined); setEks(false);
    if (!r.ok) { toast(omborXatoMatni(r.code, r.xabar), 'danger'); return; }
    // Yagona yuklab berish yo'li: tizim imzosi + manba QR (token serverda yechilgan — /api/ombor-buyruq eksport).
    downloadBlob(new Uint8Array(await r.blob.arrayBuffer()), r.faylNomi);
  };
  const jami = data?.jami ?? 0;
  return <div className="flex flex-col gap-3">
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
      <label className="relative block sm:col-span-2"><Search size={15} className="absolute left-3 top-4 text-text-mute" aria-hidden="true" />
        <input aria-label={t('Material qidirish')} placeholder={t('Qidirish: nom, lotin yoki kirill')} value={qidir} onChange={(e) => setQidir(e.target.value)} className={`${inp} pl-9`} /></label>
      <label className="flex items-center gap-2 text-[13px]"><span className="shrink-0 text-text-dim">{t('Sana')}</span>
        <input type="date" aria-label={t('Ostatka sanasi')} value={sana} max={bugun()} onChange={(e) => setSana(e.target.value)} className={inp} /></label>
      <button type="button" className="fz-btn min-h-[48px] justify-center" onClick={() => void eksport()} disabled={eks}>
        {eks ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}{t('Excel')}</button>
    </div>
    <details className="text-[13px]"><summary className="min-h-[40px] cursor-pointer py-2 text-text-dim">{t('Ko‘proq')}</summary>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {!o_tgan && <select aria-label={t('Material turi')} value={tur} onChange={(e) => setTur(e.target.value)} className={`${inp} sm:w-56`}>
          <option value="">{t('Hamma turlar')}</option>{(data?.turlar ?? []).map((x) => <option key={x} value={x}>{x}</option>)}</select>}
        <label className="flex min-h-[40px] items-center gap-2"><input type="checkbox" checked={musbat === '1'} onChange={(e) => setMusbat(e.target.checked ? '1' : '0')} />{t('Faqat ostatkasi bor')}</label>
      </div></details>
    {o_tgan && <p className="m-0 text-[12px] text-text-dim">{t('Ostatka')}: {sana}</p>}
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
    if (r.ok) setTarix(r); else setXato(omborXatoMatni(r.code));
  }, [kompaniyaId, skladId, guruh]);
  useEffect(() => { void yukla(); }, [yukla]);
  const yubor = async (bekorQil: boolean) => {
    if (!tuzat) return;
    if (!tuzat.sabab.trim() || (!bekorQil && !(Number(tuzat.miqdor.replace(',', '.')) > 0))) { setXato(t('Sabab va to‘g‘ri miqdorni yozing.')); return; }
    setTuzat({ ...tuzat, band: true }); setXato(null);
    const r = await omborTuzat(kompaniyaId, skladId, { harakat_id: tuzat.h.id, yangi: bekorQil ? null : { miqdor: tuzat.miqdor.replace(',', '.') }, sabab: tuzat.sabab.trim(), operation_id: tuzat.op });
    if (!r.ok) { setTuzat({ ...tuzat, band: false }); setXato(omborXatoMatni(r.code)); return; }
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
