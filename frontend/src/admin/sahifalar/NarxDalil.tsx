/**
 * NarxDalil.tsx — smeta narxlarining dalili (egasi Q4/Q5, 2026-10-01).
 * Obyekt bo'yicha: har resurs uchun manba TAKLIFI (qoidalar — lib/narx-dalil/taklif: МАШ eng
 * qimmati, ЧЕЛ/МАТ eng yangi kvartal, kod mosligi ustun) → operator tanlaydi → bog'laydi.
 * Avtomatik yozilmaydi; smeta narxi o'zgarmaydi (faqat dalil yoziladi).
 * «Обоснование цен» Excel — barcha resurslar, dalilsizlar ochiq ro'yxatda (H7).
 */
import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Link2, Unlink } from 'lucide-react';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { sbT2DaraxtOl, sbT2ObyektlarOlKomp, type T2Obyekt } from '../../api/supabase';
import {
  NARX_MANBA_TUR_NOMI, sbNarxDalilBogla, sbNarxDalilOchir, sbNarxDalillarOl, sbNarxTakliflarOl,
  type NarxDalilHolat, type NarxTaklif,
} from '../../api/t2-narx-dalil';
import { narxTakliflari } from '../../lib/narx-dalil/taklif';
import { manbaRekviziti, narxAsoslashXlsx, type AsoslashResurs } from '../../lib/narx-asoslash-export';
import { useHujjatTomonlari } from '../../umumiy/hujjat/HujjatTomonlari';
import { toast } from '../../umumiy/ui/Toast';

const pul = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 2 }));

export default function NarxDalil() {
  const { joriy } = useKompaniya();
  const kompaniyaId = joriy?.id ?? null;
  const [tomonlar] = useHujjatTomonlari(kompaniyaId ?? undefined);
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [obyektId, setObyektId] = useState<number | null>(null);
  const [takliflar, setTakliflar] = useState<NarxTaklif[]>([]);
  const [dalillar, setDalillar] = useState<NarxDalilHolat[]>([]);
  const [resurslar, setResurslar] = useState<AsoslashResurs[]>([]);
  const [tanlov, setTanlov] = useState<Map<number, number>>(new Map());
  const [varaq, setVaraq] = useState<'taklif' | 'dalil'>('taklif');
  const [yuklanmoqda, setYuklanmoqda] = useState(false);

  useEffect(() => {
    if (!kompaniyaId) return;
    void sbT2ObyektlarOlKomp(kompaniyaId).then((r) => { const q = r.ok ? r.qatorlar ?? [] : []; setObyektlar(q); setObyektId((x) => x ?? q[0]?.id ?? null); });
  }, [kompaniyaId]);

  const yukla = async () => {
    if (!kompaniyaId || !obyektId) return;
    setYuklanmoqda(true);
    const [t, d, q] = await Promise.all([
      sbNarxTakliflarOl(kompaniyaId, obyektId), sbNarxDalillarOl(kompaniyaId, obyektId),
      sbT2DaraxtOl(obyektId, 'id,tur,kat,kod,nom,birlik,hajm,narx'),
    ]);
    setYuklanmoqda(false);
    setTakliflar(t.ok ? t.qatorlar ?? [] : []);
    setDalillar(d.ok ? d.qatorlar ?? [] : []);
    setResurslar((q.ok ? q.qatorlar ?? [] : []).filter((x) => x.tur === 'rs' || x.tur === 'mat' || x.tur === 'ob')
      .map((x) => ({ qator_id: x.id, kat: x.kat, kod: x.kod, nom: x.nom, birlik: x.birlik, hajm: x.hajm, narx: x.narx })));
    setTanlov(new Map());
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void yukla(); }, [kompaniyaId, obyektId]);

  const dalilBor = useMemo(() => new Set(dalillar.map((d) => d.qator_id)), [dalillar]);
  const natijalar = useMemo(() => narxTakliflari(takliflar).filter((n) => !dalilBor.has(n.qator_id)), [takliflar, dalilBor]);
  const obyekt = obyektlar.find((o) => o.id === obyektId);

  const belgila = (qatorId: number, manbaQatorId: number | null) => setTanlov((m) => {
    const n = new Map(m);
    if (manbaQatorId == null) n.delete(qatorId); else n.set(qatorId, manbaQatorId);
    return n;
  });

  const bogla = async () => {
    if (!kompaniyaId || !obyektId || !tanlov.size) return;
    const boglar = [...tanlov].map(([qator_id, manba_qator_id]) => ({ qator_id, manba_qator_id }));
    const r = await sbNarxDalilBogla(kompaniyaId, obyektId, boglar);
    if (r.ok) { toast(`✓ ${r.boglandi ?? boglar.length} ta narx dalil bilan bog‘landi`, 'ok'); await yukla(); }
    else toast(r.error || 'Bog‘lanmadi', 'danger');
  };

  const ochir = async (d: NarxDalilHolat) => {
    if (!kompaniyaId || !obyektId) return;
    const r = await sbNarxDalilOchir(kompaniyaId, obyektId, [d.qator_id]);
    if (r.ok) { toast('Dalil olib tashlandi', 'ok'); await yukla(); } else toast(r.error || 'Xato', 'danger');
  };

  const excel = () => {
    if (!obyekt) return;
    const { bytes, faylNomi, tasdiqlangan, dalilsiz } = narxAsoslashXlsx(resurslar, dalillar, { obyektNomi: obyekt.nom, imzo: tomonlar });
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a'); a.href = url; a.download = faylNomi; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast(`«Обоснование цен»: ${tasdiqlangan} tasdiqlangan, ${dalilsiz} dalilsiz`, 'ok');
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Narx dalili</h1>
          <p className="text-xs text-text-dim">Har resurs narxi katalog / счет-фактура / КП / kalkulyatsiya bilan tasdiqlanadi. Taklifni siz tanlaysiz — smeta narxi o‘zgarmaydi.</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="border rounded px-2 py-1 text-sm max-w-xs" value={obyektId ?? ''} onChange={(e) => setObyektId(Number(e.target.value))}>{obyektlar.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}</select>
          <button type="button" onClick={excel} disabled={!obyekt || !resurslar.length} className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm disabled:opacity-40"><FileSpreadsheet size={14} /> Обоснование цен</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-text-dim">
        <span>Resurslar: <b className="text-text">{resurslar.length.toLocaleString('ru-RU')}</b></span>
        <span>Dalil bilan: <b className="text-text">{dalillar.length.toLocaleString('ru-RU')}</b></span>
        <span>Taklif bor: <b className="text-text">{natijalar.length.toLocaleString('ru-RU')}</b></span>
        <span>Dalilsiz va taklifsiz: <b className="text-text">{Math.max(0, resurslar.length - dalillar.length - natijalar.length).toLocaleString('ru-RU')}</b></span>
      </div>

      <div className="inline-flex overflow-hidden rounded border text-xs">
        <button type="button" onClick={() => setVaraq('taklif')} className={'px-3 py-1.5 ' + (varaq === 'taklif' ? 'bg-accent/15 text-accent' : '')}>Takliflar ({natijalar.length})</button>
        <button type="button" onClick={() => setVaraq('dalil')} className={'px-3 py-1.5 ' + (varaq === 'dalil' ? 'bg-accent/15 text-accent' : '')}>Bog‘langan dalillar ({dalillar.length})</button>
      </div>

      {yuklanmoqda ? <p className="text-sm text-text-dim">Yuklanmoqda…</p> : varaq === 'taklif' ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button type="button" className="rounded border px-3 py-1 text-xs" onClick={() => setTanlov(new Map(natijalar.map((n) => [n.qator_id, n.tavsiya.manba_qator_id])))}>Barcha tavsiyalarni belgilash</button>
            <button type="button" className="rounded border px-3 py-1 text-xs" onClick={() => setTanlov(new Map())}>Tozalash</button>
            <button type="button" disabled={!tanlov.size} onClick={() => void bogla()} className="inline-flex items-center gap-1 rounded bg-accent px-3 py-1 text-xs text-white disabled:opacity-40"><Link2 size={13} /> Tanlanganlarni bog‘lash ({tanlov.size})</button>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[980px] text-xs">
              <thead className="text-text-dim"><tr className="text-left"><th className="px-2 py-1.5" /><th className="px-2 py-1.5">Resurs</th><th className="px-2 py-1.5 text-right">Smeta narxi</th><th className="px-2 py-1.5">Manba (tanlang)</th><th className="px-2 py-1.5 text-right">Manba narxi</th><th className="px-2 py-1.5 text-right">Og‘ish</th><th className="px-2 py-1.5">Sabab</th></tr></thead>
              <tbody>
                {natijalar.length === 0 && <tr><td colSpan={7} className="px-2 py-4 text-center text-text-dim">Taklif yo‘q — avval «Narx manbalari»ga katalog/faktura yuklang</td></tr>}
                {natijalar.slice(0, 1000).map((n) => {
                  const nomzodlar = [n.tavsiya, ...n.boshqalar];
                  const tanlangan = tanlov.get(n.qator_id);
                  const t = nomzodlar.find((x) => x.manba_qator_id === tanlangan) ?? n.tavsiya;
                  const ogish = n.smeta_narx ? Math.round(((Number(t.manba_narx) - n.smeta_narx) / n.smeta_narx) * 10000) / 100 : null;
                  return (
                    <tr key={n.qator_id} className="border-t align-top">
                      <td className="px-2 py-1.5"><input type="checkbox" checked={tanlangan != null} onChange={(e) => belgila(n.qator_id, e.target.checked ? t.manba_qator_id : null)} /></td>
                      <td className="px-2 py-1.5"><div>{t.nom}</div><div className="text-text-dim">{n.kat} · {t.birlik} · {t.moslik === 'kod' ? 'kod bo‘yicha' : 'nom+birlik'}</div></td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{pul(n.smeta_narx)}</td>
                      <td className="px-2 py-1.5">
                        <select className="w-full border rounded px-1 py-0.5" value={t.manba_qator_id} onChange={(e) => belgila(n.qator_id, Number(e.target.value))}>
                          {nomzodlar.map((x) => <option key={x.manba_qator_id} value={x.manba_qator_id}>{NARX_MANBA_TUR_NOMI[x.manba_tur]}: {manbaRekviziti({ manba_nom: x.manba_nom, manba_raqam: x.manba_raqam, manba_sana: x.manba_sana, yetkazuvchi: x.yetkazuvchi, yetkazuvchi_inn: null, yil: x.yil, kvartal: x.kvartal, region: x.region, nds_holati: x.nds_holati })} — {pul(x.manba_narx)}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{pul(t.manba_narx)}</td>
                      <td className={'px-2 py-1.5 text-right tabular-nums ' + (ogish != null && Math.abs(ogish) > 10 ? 'text-warning font-semibold' : '')}>{ogish == null ? '—' : `${ogish > 0 ? '+' : ''}${ogish}%`}</td>
                      <td className="px-2 py-1.5 text-text-dim">{t === n.tavsiya ? n.sabab : 'operator tanlovi'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {natijalar.length > 1000 && <div className="px-2 py-1 text-xs text-text-dim">Birinchi 1000 ta ko‘rsatildi (jami {natijalar.length.toLocaleString('ru-RU')}); «Barcha tavsiyalarni belgilash» hammasini oladi.</div>}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="text-text-dim"><tr className="text-left"><th className="px-2 py-1.5">Resurs</th><th className="px-2 py-1.5 text-right">Smeta narxi</th><th className="px-2 py-1.5">Dalil</th><th className="px-2 py-1.5 text-right">Manba narxi</th><th className="px-2 py-1.5">Kim / qachon</th><th /></tr></thead>
            <tbody>
              {dalillar.length === 0 && <tr><td colSpan={6} className="px-2 py-4 text-center text-text-dim">Hali dalil bog‘lanmagan</td></tr>}
              {dalillar.map((d) => (
                <tr key={d.id} className="border-t">
                  <td className="px-2 py-1.5">{d.nom}<div className="text-text-dim">{d.kat} · {d.birlik}</div></td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{pul(d.hozirgi_narx)}</td>
                  <td className="px-2 py-1.5">{NARX_MANBA_TUR_NOMI[d.manba_tur]}: {manbaRekviziti(d)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{pul(d.manba_narx)}</td>
                  <td className="px-2 py-1.5 text-text-dim">{d.kim ?? '—'} · {d.vaqt?.slice(0, 10)}</td>
                  <td className="px-2 py-1.5 text-right"><button type="button" onClick={() => void ochir(d)} className="text-text-dim hover:text-danger" title="Dalilni olib tashlash"><Unlink size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
