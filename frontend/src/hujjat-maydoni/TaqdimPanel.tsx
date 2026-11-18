/**
 * TaqdimPanel.tsx - Taqdimlar: kompaniya faylini/papkasini aloqadagi tomonga (pudratchi / sub / buyurtmachi) o'zgarmas SURAT sifatida yuborish.
 * Oluvchi tomon faqat o'qiydi (ko'rish / yuklab olish); yuboruvchi qaytarib oladi. Mavjud t2_tomon_aloqa (faol aloqa) va hodisalar jurnali qayta ishlatiladi.
 */
import { useCallback, useEffect, useState } from 'react';
import { Download, FileText, Folder, Send, Undo2, X } from 'lucide-react';
import { toast } from '../umumiy/ui/Toast';
import { matnSora } from '../umumiy/ui/Tasdiq';
import { t, tilLocale } from '../i18n/til';
import { hmHajm } from '../api/t2-hujjat-maydoni';
import {
  hmTaqdimNishon, hmTaqdimOlUrl, hmTaqdimQaytar, hmTaqdimRoyxat, hmTaqdimTafsilot, hmTaqdimYarat,
  type HmAloqa, type HmTaqdim, type HmTaqdimTafsilot,
} from '../api/t2-hujjat-maydoni-2';

const XATO: Record<string, string> = {
  TAQDIM_ALOQA_YOQ: 'Faol aloqa topilmadi.', TAQDIM_SHAXSIY: 'Shaxsiy fayl taqdim qilinmaydi: avval kompaniya diskiga ko‘chiring.',
  TAQDIM_BOSH: 'Taqdim qilinadigan fayl topilmadi.', TAQDIM_KO_P: 'Papkada 200 tadan ko‘p fayl bor: kichikroq papka tanlang.', RUXSAT_YOQ: 'Bu amal uchun ruxsat yo‘q.',
};
const xm = (x: { code: string; xato?: string }) => t(XATO[x.code] ?? x.xato ?? 'Amal bajarilmadi.');

/** Fayl/papka panelidan: «Taqdim qilish» oynasi. */
export function TaqdimDialog(p: { kompaniyaId: number; nishonTuri: 'fayl' | 'papka'; nishonId: number; nom: string; onYop: () => void }) {
  const [aloqalar, setAloqalar] = useState<HmAloqa[] | null>(null);
  const [aloqa, setAloqa] = useState<number | null>(null);
  const [izoh, setIzoh] = useState('');
  const [band, setBand] = useState(false);
  useEffect(() => { void hmTaqdimNishon(p.kompaniyaId).then((r) => { if (r.ok) { setAloqalar(r.royxat); setAloqa(r.royxat[0]?.aloqa_id ?? null); } else { toast(xm(r), 'danger'); setAloqalar([]); } }); }, [p.kompaniyaId]);
  const yubor = async () => {
    if (!aloqa) return;
    setBand(true);
    const r = await hmTaqdimYarat({ nishonTuri: p.nishonTuri, nishonId: p.nishonId, aloqaId: aloqa, izoh });
    setBand(false);
    if (!r.ok) { toast(xm(r), 'danger'); return; }
    toast(t('Taqdim yuborildi: {n} fayl', { n: r.fayl_soni }), 'ok'); p.onYop();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={t('Taqdim qilish')}>
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-4 text-[13px]">
        <div className="mb-2 flex items-start justify-between gap-2"><div className="font-semibold text-text">{t('Taqdim qilish')}: <span className="font-normal">{p.nom}</span></div>
          <button type="button" aria-label={t('Yopish')} onClick={p.onYop}><X size={16} /></button></div>
        <p className="mb-3 text-[12px] text-text-mute">{t('Oluvchi shu paytdagi nusxani faqat ko‘ra oladi va yuklab oladi. Keyin faylni o‘zgartirsangiz ham, taqdim qilingan nusxa o‘zgarmaydi. Qaytarib olish mumkin.')}</p>
        {aloqalar === null && <p className="text-text-mute">{t('Yuklanmoqda…')}</p>}
        {aloqalar?.length === 0 && <p role="status">{t('Faol aloqa yo‘q: avval pudratchi / sub / buyurtmachi bilan aloqa o‘rnating.')}</p>}
        {!!aloqalar?.length && (
          <div className="space-y-2">
            <label className="block"><span className="text-[12px] text-text-dim">{t('Kimga')}</span>
              <select className="input mt-1 h-9 w-full" value={aloqa ?? ''} onChange={(e) => setAloqa(Number(e.target.value))}>
                {aloqalar.map((a) => <option key={a.aloqa_id} value={a.aloqa_id}>{a.nom} · {a.rol}</option>)}
              </select></label>
            <label className="block"><span className="text-[12px] text-text-dim">{t('Izoh (ixtiyoriy)')}</span>
              <textarea className="input mt-1 w-full" rows={2} maxLength={1000} value={izoh} onChange={(e) => setIzoh(e.target.value)} /></label>
            <button type="button" className="fz-btn fz-btn--primary" disabled={band || !aloqa} onClick={() => void yubor()}><Send size={14} /> {t('Yuborish')}</button>
          </div>)}
      </div>
    </div>
  );
}

/** «Taqdimlar» bo'limi: kelgan / yuborilgan, tafsilot, yuklab olish, qaytarish. */
export function TaqdimPanel({ kompaniyaId }: { kompaniyaId: number }) {
  const [yonalish, setYonalish] = useState<'kelgan' | 'yuborilgan'>('kelgan');
  const [royxat, setRoyxat] = useState<HmTaqdim[] | null>(null);
  const [tanlangan, setTanlangan] = useState<HmTaqdimTafsilot | null>(null);
  const yukla = useCallback(async () => {
    const r = await hmTaqdimRoyxat(kompaniyaId, yonalish);
    if (r.ok) setRoyxat(r.royxat); else { setRoyxat([]); toast(xm(r), 'danger'); }
  }, [kompaniyaId, yonalish]);
  useEffect(() => { setTanlangan(null); setRoyxat(null); void yukla(); }, [yukla]);
  const och = async (id: number) => { const r = await hmTaqdimTafsilot(id); if (r.ok) setTanlangan(r); else toast(xm(r), 'danger'); };
  const qaytar = async () => {
    if (!tanlangan) return;
    const sabab = await matnSora({ matn: t('Qaytarish sababi (ixtiyoriy)') });
    if (sabab == null) return;
    const r = await hmTaqdimQaytar(tanlangan.id, sabab);
    if (!r.ok) toast(xm(r), 'danger'); else { toast(t('Taqdim qaytarib olindi'), 'ok'); setTanlangan(null); void yukla(); }
  };
  return (
    <div>
      <div className="mb-2 flex gap-1" role="tablist" aria-label={t('Taqdim yo‘nalishi')}>
        {(['kelgan', 'yuborilgan'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={yonalish === k} onClick={() => setYonalish(k)} className={`rounded px-3 py-1 text-[12px] ${yonalish === k ? 'bg-accent/15 font-semibold' : 'text-text-dim hover:bg-surface-2'}`}>{t(k === 'kelgan' ? 'Kelgan' : 'Yuborilgan')}</button>))}
      </div>
      <div className="flex flex-col gap-3 lg:flex-row">
        <table className="fz-table min-w-0 flex-1"><thead><tr><th>{t('Nomi')}</th><th>{yonalish === 'kelgan' ? t('Kimdan') : t('Kimga')}</th><th>{t('Sana')}</th><th>{t('Holat')}</th></tr></thead><tbody>
          {(royxat ?? []).map((x) => (
            <tr key={x.id} className={tanlangan?.id === x.id ? 'bg-accent/10' : ''}>
              <td><button type="button" className="flex items-center gap-2 text-left hover:underline" onClick={() => void och(x.id)}>{x.nishon_turi === 'papka' ? <Folder size={14} /> : <FileText size={14} />}<span className="truncate">{x.nom}</span>
                <span className="text-[11px] text-text-mute">({x.fayl_soni} · {hmHajm(x.jami_bayt)})</span></button></td>
              <td>{x.kompaniya}</td><td className="text-[12px] text-text-mute">{new Date(x.vaqt).toLocaleDateString(tilLocale())}</td>
              <td>{x.holat === 'faol' ? <span className="fz-stamp fz-stamp--ok">{t('faol')}</span> : <span className="fz-stamp" title={x.sabab ?? undefined}>{t('qaytarilgan')}</span>}</td></tr>))}
          {royxat && !royxat.length && <tr><td colSpan={4} className="py-6 text-center text-text-mute">{yonalish === 'kelgan' ? t('Hali hech kim fayl taqdim qilmagan.') : t('Siz hali fayl taqdim qilmagansiz. Faylni tanlab «Taqdim qilish» ni bosing.')}</td></tr>}
        </tbody></table>
        {tanlangan && (
          <aside className="w-full shrink-0 rounded-lg border border-border bg-surface p-3 text-[13px] lg:w-[340px]" aria-label={t('Taqdim tafsiloti')}>
            <div className="flex items-start justify-between gap-2"><div className="min-w-0 font-semibold">{tanlangan.nom}</div><button type="button" aria-label={t('Yopish')} onClick={() => setTanlangan(null)}><X size={16} /></button></div>
            {tanlangan.izoh && <p className="mt-1 whitespace-pre-wrap text-text-dim">{tanlangan.izoh}</p>}
            <p className="mt-1 text-[11px] text-text-mute">{t('O‘zgarmas nusxa: faqat ko‘rish va yuklab olish.')}</p>
            <ul className="mt-2 space-y-1">{tanlangan.fayllar.map((f) => (
              <li key={f.id} className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate">{f.yol ? `${f.yol}/` : ''}{f.nom} <span className="text-text-mute">v{f.raqam} · {hmHajm(f.bayt)}</span></span>
                <a className="fz-btn" href={hmTaqdimOlUrl(tanlangan.id, f.id)} aria-label={t('Yuklab olish')}><Download size={13} /></a></li>))}
              {!tanlangan.fayllar.length && <li className="text-text-mute">{t('Taqdim qaytarib olingan yoki aloqa yopilgan: fayllar ko‘rinmaydi.')}</li>}</ul>
            {tanlangan.qaytarish_mumkin && <button type="button" className="fz-btn mt-3" onClick={() => void qaytar()}><Undo2 size={13} /> {t('Qaytarib olish')}</button>}
          </aside>)}
      </div>
    </div>
  );
}
