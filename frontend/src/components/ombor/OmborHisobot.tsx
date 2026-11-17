import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import { t, raqamFormatla } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { omborEksport, omborHisobot, omborNarxQoy, type DavrBelgisi, type OmborHisobot, type OmborHisobotFiltr } from '../../api/t2-ombor';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { omborXatoMatni } from './ombor-xato';

/**
 * Kirim-chiqim hisoboti: tayyor davrlar (bugun, hafta, oy, o'tgan oy, ixtiyoriy), material/yetkazuvchi/qabul qiluvchi/obyekt filtrlari,
 * jami (birlik bo'yicha, summa QQS siz va QQS bilan; storno/qaytarishlarsiz), Excel. `kompakt` — faqat bugungi ro'yxat (boshqaruvsiz).
 */
const n = (v: number | null | undefined) => (v == null ? '—' : raqamFormatla(Number(v), { maximumFractionDigits: 4 }));
const pul = (v: number | null | undefined) => (v == null ? '—' : raqamFormatla(Number(v), { maximumFractionDigits: 2 }));
const inp = 'h-[48px] w-full rounded-md border border-[var(--border-strong)] bg-bg px-3 text-[14px] text-text';
const DAVRLAR: { k: DavrBelgisi; nom: string }[] = [
  { k: 'bugun', nom: 'Bugun' }, { k: 'hafta', nom: 'Hafta' }, { k: 'oy', nom: 'Oy' }, { k: 'otgan_oy', nom: 'O‘tgan oy' }, { k: 'ixtiyoriy', nom: 'Ixtiyoriy' },
];
const SAHIFA = 50;

export function OmborHisobotPaneli({ kompaniyaId, skladId, yangilash, kompakt = false, yozishMumkin = false }: { kompaniyaId: number; skladId: number; yangilash: number; kompakt?: boolean; yozishMumkin?: boolean }) {
  const [narxQoy, setNarxQoy] = useState<{ id: number; v: string } | null>(null);
  const [davr, setDavr] = useState<DavrBelgisi>(kompakt ? 'bugun' : 'oy'); const [dan, setDan] = useState(''); const [gacha, setGacha] = useState('');
  const [op, setOp] = useState<'' | 'prixod' | 'rasxod'>(''); const [qidir, setQidir] = useState(''); const [yetkazuvchi, setYetkazuvchi] = useState(''); const [qabul, setQabul] = useState(''); const [obyekt, setObyekt] = useState('');
  const [offset, setOffset] = useState(0); const [data, setData] = useState<OmborHisobot | null>(null); const [xato, setXato] = useState<string | null>(null); const [yuk, setYuk] = useState(false); const [eks, setEks] = useState(false);
  const avlod = useRef(0);
  const filtr: OmborHisobotFiltr = {
    davr, ...(davr === 'ixtiyoriy' ? { dan: dan || undefined, gacha: gacha || undefined } : {}), operatsiya: op || undefined,
    qidir: qidir.trim() || undefined, yetkazuvchi: yetkazuvchi.trim() || undefined, qabul: qabul.trim() || undefined, obyekt: obyekt.trim() || undefined,
  };
  const kalit = JSON.stringify(filtr);
  const yukla = useCallback(async () => {
    const g = ++avlod.current; setYuk(true); setXato(null);
    const r = await omborHisobot(kompaniyaId, skladId, JSON.parse(kalit) as OmborHisobotFiltr, SAHIFA, offset);
    if (g !== avlod.current) return; setYuk(false);
    if (r.ok) setData(r); else { setData(null); setXato(omborXatoMatni(r.code)); }
  }, [kompaniyaId, skladId, kalit, offset]);
  useEffect(() => { const id = setTimeout(() => void yukla(), qidir || yetkazuvchi || qabul || obyekt ? 250 : 0); return () => clearTimeout(id); }, [yukla, yangilash, qidir, yetkazuvchi, qabul, obyekt]);
  useEffect(() => { setOffset(0); }, [kalit, kompaniyaId, skladId]);

  const eksport = async () => {
    setEks(true); const r = await omborEksport(kompaniyaId, skladId, filtr, 'hisobot'); setEks(false);
    if (!r.ok) { toast(omborXatoMatni(r.code, r.xabar), 'danger'); return; }
    downloadBlob(new Uint8Array(await r.blob.arrayBuffer()), r.faylNomi);
  };
  const narxSaqla = async () => {
    if (!narxQoy) return;
    const r = await omborNarxQoy(kompaniyaId, skladId, narxQoy.id, narxQoy.v.replace(',', '.').replace(/\s/g, ''));
    if (!r.ok) { toast(omborXatoMatni(r.code), 'danger'); return; }
    setNarxQoy(null); toast(t('Narx qo‘yildi'), 'ok'); void yukla();
  };
  const j = data?.jami;
  const chetlatilganKo_rsat = !!data && data.chetlatilgan > 0 && !kompakt;
  const sahifalash = !!data && data.jami_qator > SAHIFA;
  return <div className="flex flex-col gap-3">
    {!kompakt && <>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('Davr')}>
        {DAVRLAR.map((d) => <button key={d.k} type="button" aria-pressed={davr === d.k} onClick={() => setDavr(d.k)} className={`fz-btn min-h-[44px] ${davr === d.k ? 'fz-btn--primary' : ''}`}>{t(d.nom)}</button>)}
      </div>
      {davr === 'ixtiyoriy' && <div className="grid grid-cols-2 gap-2">
        <input type="date" aria-label={t('Dan')} value={dan} onChange={(e) => setDan(e.target.value)} className={inp} />
        <input type="date" aria-label={t('Gacha')} value={gacha} onChange={(e) => setGacha(e.target.value)} className={inp} /></div>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select aria-label={t('Amal turi')} value={op} onChange={(e) => setOp(e.target.value as typeof op)} className={inp}><option value="">{t('Kirim va chiqim')}</option><option value="prixod">{t('Faqat kirim')}</option><option value="rasxod">{t('Faqat chiqim')}</option></select>
        <input aria-label={t('Material qidirish')} placeholder={t('Material')} value={qidir} onChange={(e) => setQidir(e.target.value)} className={`${inp} sm:col-span-2`} />
        <button type="button" className="fz-btn min-h-[48px] justify-center" onClick={() => void eksport()} disabled={eks}>
          {eks ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}{t('Excel')}</button>
      </div>
      <details className="text-[13px]"><summary className="min-h-[40px] cursor-pointer py-2 text-text-dim">{t('Ko‘proq')}</summary>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input aria-label={t('Yetkazuvchi')} placeholder={t('Yetkazuvchi')} value={yetkazuvchi} onChange={(e) => setYetkazuvchi(e.target.value)} className={inp} />
          <input aria-label={t('Kimga (prorab / brigada)')} placeholder={t('Kimga (prorab / brigada)')} value={qabul} onChange={(e) => setQabul(e.target.value)} className={inp} />
          <input aria-label={t('Obyekt')} placeholder={t('Obyekt')} value={obyekt} onChange={(e) => setObyekt(e.target.value)} className={inp} /></div></details>
    </>}
    {xato && <p role="alert" className="m-0 text-[13px] text-danger">{xato}</p>}
    {j && <div className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 text-[13px] sm:grid-cols-2" aria-label={t('Jami')}>
      <div><p className="m-0 font-semibold">{t('Kirim')}: {j.kirim_soni}</p>
        <p className="m-0 text-text-dim">{j.birliklar.filter((b) => b.kirim > 0).map((b) => `${n(b.kirim)} ${b.birligi}`).join(' · ') || '—'}</p>
        {j.kirim_summa > 0 && <p className="m-0">{t('Summa (QQS siz)')}: <b>{pul(j.kirim_summa)}</b><br />{t('QQS bilan')} ({j.qqs_foiz}%): <b>{pul(j.kirim_summa_qqs)}</b></p>}
        {j.narxsiz_soni > 0 && <p className="m-0 text-warn">{t('Narxi yozilmagan kirim')}: {j.narxsiz_soni}</p>}</div>
      <div><p className="m-0 font-semibold">{t('Chiqim')}: {j.chiqim_soni}</p>
        <p className="m-0 text-text-dim">{j.birliklar.filter((b) => b.chiqim > 0).map((b) => `${n(b.chiqim)} ${b.birligi}`).join(' · ') || '—'}</p></div>
      {chetlatilganKo_rsat ? <p className="m-0 text-[12px] text-text-mute sm:col-span-2">{t('Tuzatish/storno yozuvlari hisobga olinmadi')}: {data?.chetlatilgan}</p> : null}
    </div>}
    <div className="overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-[13px]">
      <thead><tr className="text-left text-text-mute"><th className="p-2">{t('Sana')}</th><th className="p-2">{t('Amal')}</th><th className="p-2">{t('Material')}</th><th className="p-2 text-right">{t('Miqdor')}</th>
        <th className="p-2">{t('Kim / kimdan')}</th>{!kompakt && <th className="p-2 text-right">{t('Summa (QQS siz)')}</th>}{!kompakt && <th className="p-2 text-right">{t('QQS bilan')}</th>}</tr></thead>
      <tbody>{(data?.qatorlar ?? []).map((h) => <tr key={h.id} className="border-t border-border">
        <td className="whitespace-nowrap p-2">{h.sana}</td><td className="p-2">{h.operatsiya === 'prixod' ? t('Kirim') : t('Chiqim')}</td><td className="p-2">{h.nomi}</td>
        <td className="whitespace-nowrap p-2 text-right">{n(h.obyomi)} {h.birligi}</td><td className="p-2">{h.kontragent}{h.obyekt ? ` · ${h.obyekt}` : ''}</td>
        {!kompakt && <td className="whitespace-nowrap p-2 text-right">{h.summa != null ? pul(h.summa) : h.operatsiya === 'prixod' ? (narxQoy?.id === h.id
          ? <span className="inline-flex gap-1"><input aria-label={t('Narx (ixtiyoriy)')} inputMode="decimal" value={narxQoy.v} onChange={(e) => setNarxQoy({ id: h.id, v: e.target.value })} className="h-[40px] w-28 rounded-md border border-[var(--border-strong)] bg-bg px-2" />
            <button type="button" className="fz-btn min-h-[40px]" onClick={() => void narxSaqla()}>{t('Saqlash')}</button></span>
          : <span className="text-warn">{t('narxsiz')}{yozishMumkin && <button type="button" className="fz-btn ml-2 min-h-[36px]" onClick={() => setNarxQoy({ id: h.id, v: '' })}>{t('Narx qo‘yish')}</button>}</span>) : ''}</td>}
        {!kompakt && <td className="whitespace-nowrap p-2 text-right">{h.summa_qqs == null ? '' : pul(h.summa_qqs)}</td>}</tr>)}
        {!yuk && data && data.qatorlar.length === 0 && <tr><td colSpan={kompakt ? 5 : 7} className="p-6 text-center text-text-mute">{kompakt ? t('Bugun hali yozuv yo‘q.') : t('Hech narsa topilmadi.')}</td></tr>}</tbody></table></div>
    {sahifalash ? <div className="flex items-center justify-between text-[13px]">
      <span>{offset + 1}–{Math.min(offset + SAHIFA, data?.jami_qator ?? 0)} / {data?.jami_qator}</span>
      <span className="flex gap-2"><button type="button" className="fz-btn min-h-[44px]" disabled={yuk || offset === 0} onClick={() => setOffset(Math.max(0, offset - SAHIFA))}>{t('Oldingi')}</button>
        <button type="button" className="fz-btn min-h-[44px]" disabled={yuk || offset + SAHIFA >= (data?.jami_qator ?? 0)} onClick={() => setOffset(offset + SAHIFA)}>{t('Keyingi')}</button></span></div> : null}
  </div>;
}
