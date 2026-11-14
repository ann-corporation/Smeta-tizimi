/**
 * NarxDalil.tsx — smeta narxlarining dalili (egasi Q4/Q5, 2026-10-01).
 * Obyekt bo'yicha: har resurs uchun manba TAKLIFI (qoidalar — lib/narx-dalil/taklif: МАШ eng
 * qimmati, ЧЕЛ/МАТ eng yangi kvartal, kod mosligi ustun) → operator tanlaydi → bog'laydi.
 * Avtomatik yozilmaydi; smeta narxi o'zgarmaydi (faqat dalil yoziladi).
 * «Обоснование цен» Excel — barcha resurslar, dalilsizlar ochiq ro'yxatda (H7).
 */
import { ObyektOptionlari } from '../../umumiy/ui/ObyektOptionlari';
import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Link2, Unlink } from 'lucide-react';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { useGlobalObyektId, usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import { sbT2DaraxtOl, sbT2ObyektlarOlKomp, type T2Obyekt } from '../../api/supabase';
import {
  NARX_MANBA_TUR_NOMI, obyektHududBelgila, obyektHududOl, sbNarxDalilBogla, sbNarxDalilOchir, sbNarxDalillarOl, sbNarxTakliflarOl,
  type NarxDalilHolat, type NarxTaklif,
} from '../../api/t2-narx-dalil';
import { narxTakliflari } from '../../lib/narx-dalil/taklif';
import { manbaRekviziti, narxAsoslashXlsx, type AsoslashResurs } from '../../lib/narx-asoslash-export';
import { narxIzohi } from '../../lib/narx-dalil/izoh';
import { HUDUDLAR, hududNomi, joylashuvdanHudud } from '../../lib/hudud';
import { t } from '../../i18n/til';
import { useHujjatTomonlari } from '../../umumiy/hujjat/HujjatTomonlari';
import { toast } from '../../umumiy/ui/Toast';
import { NarxProtokolPanel } from './NarxProtokolPanel';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { dalilQamrovi, narxOgish } from '../../lib/narx-korinish';
import { ManbaChip, OgishMeter, QamrovChizigi } from '../../components/narx/NarxKorinish';
import { SummaYorliq } from '../../umumiy/ui/QiymatUchlik';

const pul = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 2 }));

export default function NarxDalil() {
  const { joriy } = useKompaniya();
  const kompaniyaId = joriy?.id ?? null;
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [obyektId, setObyektId] = useGlobalObyektId(); // yagona yuqori tanlov (navigatsiya oqimi)
  const ws = usePTOWorkspace();
  const [tomonlar] = useHujjatTomonlari(kompaniyaId ?? undefined, obyektId);
  const [takliflar, setTakliflar] = useState<NarxTaklif[]>([]);
  const [dalillar, setDalillar] = useState<NarxDalilHolat[]>([]);
  const [resurslar, setResurslar] = useState<AsoslashResurs[]>([]);
  const [tanlov, setTanlov] = useState<Map<number, number>>(new Map());
  const [varaq, setVaraq] = useState<'taklif' | 'dalil' | 'protokol'>('taklif');
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  /* Egasi 2026-10-03: chel.-soat narxi obyekt hududidan — xaritadagi joylashuvdan taklif yoki qo'lda tanlash. */
  const [hudud, setHudud] = useState<{ hudud: string | null; lat: number | null; lng: number | null } | null>(null);
  const hududTaklif = hudud && !hudud.hudud ? joylashuvdanHudud(hudud.lat, hudud.lng) : null;
  const hududSaqla = async (k: string | null) => {
    if (!obyektId) return;
    const r = await obyektHududBelgila(obyektId, k);
    if (!r.ok) { toast(r.error || t('Hudud saqlanmadi'), 'danger'); return; }
    setHudud((h) => ({ lat: h?.lat ?? null, lng: h?.lng ?? null, hudud: k }));
    toast(t('Obyekt hududi saqlandi — chel.-soat narxlari shu hududdan'), 'ok');
    await yukla();
  };

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
  useEffect(() => { setHudud(null); if (obyektId) void obyektHududOl(obyektId).then(setHudud); }, [obyektId]);

  const dalilBor = useMemo(() => new Set(dalillar.map((d) => d.qator_id)), [dalillar]);
  const hammaTaklif = useMemo(() => narxTakliflari(takliflar), [takliflar]);
  const natijalar = useMemo(() => hammaTaklif.filter((n) => !dalilBor.has(n.qator_id)), [hammaTaklif, dalilBor]);
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

  // An official document — billed by filled cells like every other one; the file is given only after payment.
  const excel = async () => {
    if (!obyekt || !kompaniyaId) return;
    const { bytes, faylNomi, tasdiqlangan, dalilsiz } = narxAsoslashXlsx(resurslar, dalillar, { obyektNomi: obyekt.nom, imzo: tomonlar });
    const tk = await hujjatTokenBilan({ kompaniyaId, bytes, hujjat: 'OBOSNOVANIE_NARX', sabab: `Обоснование цен · ${obyekt.nom}`, obyekt: obyekt.id }, () => {
      downloadBlob(bytes, faylNomi); // tizim imzosi shu yo'lda qo'yiladi
    });
    if (!tk.ok) { toast(tk.xabar, 'danger'); return; }
    toast(`«Обоснование цен»: ${tasdiqlangan} tasdiqlangan, ${dalilsiz} dalilsiz${tk.xabar ? ' · ' + tk.xabar : ''}`, 'ok');
  };

  const qamrov = dalilQamrovi(resurslar.length, dalillar.length, natijalar.length);
  const VARAQLAR = [['taklif', t('Takliflar ({n})', { n: String(natijalar.length) })], ['dalil', t('Bog‘langan dalillar ({n})', { n: String(dalillar.length) })], ['protokol', t('Протокол согласования цен')]] as const;
  const MOSLIK: Record<NarxTaklif['moslik'], string> = { kod: t('kod bo‘yicha'), nom_birlik: t('nom+birlik'), hudud: t('hudud bo‘yicha') };
  const amallar = <>
    {!ws.isProvider && <select aria-label={t('Obyekt')} className="h-8 max-w-xs px-2 text-[13px]" value={obyektId ?? ''} onChange={(e) => setObyektId(Number(e.target.value))}><ObyektOptionlari obyektlar={obyektlar} /></select>}
    <button type="button" onClick={() => void excel()} disabled={!obyekt || !resurslar.length} className="fz-btn"><FileSpreadsheet size={14} /> Обоснование цен</button>
  </>;

  return (
    <Sahifa sarlavha="Narx dalili" tavsif="Har resurs narxi katalog / счет-фактура / КП / kalkulyatsiya bilan tasdiqlanadi. Taklifni siz tanlaysiz — smeta narxi o‘zgarmaydi." amallar={amallar}>
    <div className="flex flex-col gap-3">
      <div className="fz-doc__panels">
        <section className="fz-panel" aria-label={t('Dalil qamrovi')}>
          <div className="fz-panel__h"><span>{t('Dalil qamrovi')}</span><span>{t('{n} resurs', { n: resurslar.length.toLocaleString('ru-RU') })}</span></div>
          <QamrovChizigi aria={t('Dalil qamrovi')} bolaklar={qamrov.bolaklar}
            nomlar={{ dalil: t('Dalil bilan'), taklif: t('Taklif bor'), yoq: t('Dalilsiz va taklifsiz') }}
            ranglar={{ dalil: 'var(--ok)', taklif: 'var(--accent)', yoq: 'var(--surface-3)' }} />
        </section>
        <section className="fz-panel" aria-label={t('Obyekt hududi')}>
          <div className="fz-panel__h"><span>{t('Obyekt hududi (chel.-soat narxi shu hududdan):')}</span></div>
          <select aria-label={t('Obyekt hududi')} className="h-8 px-2 text-[13px]" value={hudud?.hudud ?? ''} onChange={(e) => void hududSaqla(e.target.value || null)} disabled={!obyektId || !hudud}>
            <option value="">{t('— tanlanmagan —')}</option>
            {HUDUDLAR.map((h) => <option key={h.kalit} value={h.kalit}>{h.nom}</option>)}
          </select>
          {hududTaklif && (
            <button type="button" onClick={() => void hududSaqla(hududTaklif)} className="fz-btn fz-btn--sm self-start border-accent/50 text-[var(--accent-text)]">
              {t('Xaritadagi joylashuvga ko‘ra: {nom} — tasdiqlash', { nom: hududNomi(hududTaklif) ?? '' })}
            </button>
          )}
          {hudud && !hudud.hudud && !hududTaklif && <span className="fz-chip fz-chip--warn self-start">{t('Xaritada joylashuv belgilanmagan — hududni qo‘lda tanlang')}</span>}
        </section>
      </div>

      <div className="inline-flex gap-0.5 self-start rounded-[var(--radius-sm)] border border-border bg-surface-2 p-0.5" role="tablist">
        {VARAQLAR.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={varaq === k} onClick={() => setVaraq(k)} className={'fz-btn fz-btn--sm ' + (varaq === k ? 'border-transparent bg-accent/15 text-text' : 'fz-btn--ghost')}>{l}</button>)}
      </div>

      {yuklanmoqda ? <div className="skel h-40 rounded-[var(--radius-md)]" role="status" aria-label={t('Yuklanmoqda…')} /> : varaq === 'protokol' ? (
        kompaniyaId && obyekt ? <NarxProtokolPanel kompaniyaId={kompaniyaId} obyektId={obyekt.id} obyektNomi={obyekt.nom} takliflar={hammaTaklif} dalillar={dalillar} imzo={tomonlar} /> : null
      ) : varaq === 'taklif' ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="fz-btn fz-btn--sm" onClick={() => setTanlov(new Map(natijalar.map((n) => [n.qator_id, n.tavsiya.manba_qator_id])))}>{t('Barcha tavsiyalarni belgilash')}</button>
            <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => setTanlov(new Map())}>{t('Tozalash')}</button>
            <button type="button" disabled={!tanlov.size} onClick={() => void bogla()} className="fz-btn fz-btn--primary fz-btn--sm"><Link2 size={13} /> {t('Tanlanganlarni bog‘lash ({n})', { n: String(tanlov.size) })}</button>
            <span className="ml-auto text-[11.5px] text-text-mute">{t('Og‘ish: markaz — smeta narxi; o‘ngga — manba qimmat, chapga — arzon; 10% dan ortig‘i sariq.')}</span>
          </div>
          <div className="fz-table-wrap">
            <table className="fz-table min-w-[1080px] text-[12.5px]">
              <thead><tr><th style={{ width: 32 }} /><th>{t('Resurs')}</th><th className="fz-c-num">{t('Smeta narxi')}<SummaYorliq tur="narx" /></th><th>{t('Manba (tanlang)')}</th><th className="fz-c-num">{t('Manba narxi')}</th><th>{t('Og‘ish')}</th><th>{t('Sabab')}</th></tr></thead>
              <tbody>
                {natijalar.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-text-mute">{t('Taklif yo‘q — avval «Narx manbalari»ga katalog/faktura yuklang')}</td></tr>}
                {natijalar.slice(0, 1000).map((n) => {
                  const nomzodlar = [n.tavsiya, ...n.boshqalar];
                  const tanlangan = tanlov.get(n.qator_id);
                  const tanlanganTaklif = nomzodlar.find((x) => x.manba_qator_id === tanlangan) ?? n.tavsiya;
                  const og = narxOgish(Number(tanlanganTaklif.manba_narx), n.smeta_narx);
                  return (
                    <tr key={n.qator_id} className={tanlangan != null ? 'bg-accent/[.05]' : ''} style={{ verticalAlign: 'top' }}>
                      <td><input type="checkbox" aria-label={t('Tanlash: {nom}', { nom: tanlanganTaklif.nom ?? '' })} checked={tanlangan != null} onChange={(e) => belgila(n.qator_id, e.target.checked ? tanlanganTaklif.manba_qator_id : null)} /></td>
                      <td><div className="font-medium">{tanlanganTaklif.nom}</div><div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11.5px] text-text-mute">{n.kat && <span className="fz-chip">{n.kat}</span>}<span>{tanlanganTaklif.birlik}</span><span className={`fz-chip ${tanlanganTaklif.moslik === 'kod' ? 'fz-chip--accent' : ''}`}>{MOSLIK[tanlanganTaklif.moslik] ?? tanlanganTaklif.moslik}</span></div></td>
                      <td className="fz-c-num">{pul(n.smeta_narx)}</td>
                      <td>
                        <div className="flex items-center gap-1.5"><ManbaChip tur={tanlanganTaklif.manba_tur} />
                        <select className="h-7 min-w-0 flex-1 px-1 text-[12px]" value={tanlanganTaklif.manba_qator_id} onChange={(e) => belgila(n.qator_id, Number(e.target.value))}>
                          {nomzodlar.map((x) => <option key={x.manba_qator_id} value={x.manba_qator_id}>{NARX_MANBA_TUR_NOMI[x.manba_tur]}: {manbaRekviziti({ manba_nom: x.manba_nom, manba_raqam: x.manba_raqam, manba_sana: x.manba_sana, yetkazuvchi: x.yetkazuvchi, yetkazuvchi_inn: null, yil: x.yil, kvartal: x.kvartal, region: x.region, nds_holati: x.nds_holati, ishlab_chiqaruvchi: x.ishlab_chiqaruvchi, nds_izoh: x.nds_izoh })} — {pul(x.manba_narx)}</option>)}
                        </select></div>
                        {/* Egasi 2026-10-02: narx qayerdan — "katalog 2026 2-kv · Toshkent sh. · zavod · NDS siz". */}
                        <div className="mt-1 text-[11px] text-text-mute">{narxIzohi(tanlanganTaklif)}</div>
                        {tanlanganTaklif.manba_nom_qator && (
                          <div className="mt-0.5 break-words text-[11.5px] text-text">
                            <span className="text-text-mute">{t('Katalogdagi aynan nomi:')} </span>{tanlanganTaklif.manba_nom_qator}
                          </div>
                        )}
                      </td>
                      <td className="fz-c-num font-medium">{pul(tanlanganTaklif.manba_narx)}</td>
                      <td><OgishMeter og={og} /></td>
                      <td className="text-[12px] text-text-dim">{tanlanganTaklif === n.tavsiya ? n.sabab : <span className="fz-chip">{t('operator tanlovi')}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {natijalar.length > 1000 && <div className="px-3 py-1.5 text-[12px] text-text-mute">{t('Birinchi 1000 ta ko‘rsatildi (jami {n}); «Barcha tavsiyalarni belgilash» hammasini oladi.', { n: natijalar.length.toLocaleString('ru-RU') })}</div>}
          </div>
        </div>
      ) : (
        <div className="fz-table-wrap">
          <table className="fz-table min-w-[1000px] text-[12.5px]">
            <thead><tr><th>{t('Resurs')}</th><th className="fz-c-num">{t('Smeta narxi')}<SummaYorliq tur="narx" /></th><th>{t('Dalil')}</th><th className="fz-c-num">{t('Manba narxi')}</th><th>{t('Og‘ish')}</th><th>{t('Kim / qachon')}</th><th /></tr></thead>
            <tbody>
              {dalillar.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-text-mute">{t('Hali dalil bog‘lanmagan')}</td></tr>}
              {dalillar.map((d) => (
                <tr key={d.id}>
                  <td><div className="font-medium">{d.nom}</div><div className="text-[11.5px] text-text-mute">{d.kat} · {d.birlik}</div></td>
                  <td className="fz-c-num">{pul(d.hozirgi_narx)}</td>
                  <td>
                    <div className="flex items-center gap-1.5"><span className="fz-stamp fz-stamp--ok">{t('Tasdiqlangan')}</span><ManbaChip tur={d.manba_tur} /></div>
                    <div className="mt-1 text-[12px] text-text-dim">{manbaRekviziti(d)}</div>
                    {d.manba_nom_qator && <div className="mt-0.5 break-words text-[11.5px] text-text-mute">{t('Katalogdagi aynan nomi:')} {d.manba_nom_qator}</div>}
                  </td>
                  <td className="fz-c-num">{pul(d.manba_narx)}</td>
                  <td><OgishMeter og={narxOgish(d.manba_narx, d.hozirgi_narx)} /></td>
                  <td className="text-[12px] text-text-dim">{d.kim ?? '—'} · {d.vaqt?.slice(0, 10) ?? '—'}</td>
                  <td className="text-right"><button type="button" onClick={() => void ochir(d)} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm hover:text-danger" title={t('Dalilni olib tashlash')} aria-label={t('Dalilni olib tashlash')}><Unlink size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </Sahifa>
  );
}
