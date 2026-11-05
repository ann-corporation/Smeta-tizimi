/**
 * SHARTNOMA ASL HUJJATLARI — shartnoma kartasida: asosiy shartnoma va har qo'shimcha kelishuv (DS) fayllari (PDF / skan).
 * Yuklash: kanonik R2 (/api/hujjat-yukla, turi 'shartnoma') → bog' (shartnoma_hujjat_bogla_v1). Yuklab olish: /api/hujjat-ol (R2).
 * DS ro'yxati (raqam, sana, summa QQS bilan) — mavjud t2_shartnoma_ds dan; DS qo'shish/tahrirlash — Nakopitelniy sahifasida.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileText, Link2, Paperclip, Unlink, Upload } from 'lucide-react';
import { FmtN } from '../../lib/format';
import { t as tr } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { yangiOperationId } from '../../api/supabase';
import { hujjatYuklabOlishUrl } from '../../api/t2-hujjat-canonical';
import {
  shartnomaFaylYukla, shartnomaHujjatAjrat, shartnomaHujjatBogla, shartnomaHujjatlarOl, shartnomaHujjatXato,
  type ShartnomaFayl, type ShartnomaHujjatlar as Malumot,
} from '../../api/t2-shartnoma-hujjat';
import { hajmKorinish, joriySumma, sanaKorinish } from '../../lib/shartnoma-hujjat-korinish';

const QABUL = '.pdf,.jpg,.jpeg,.png,.tif,.tiff,.doc,.docx,.xls,.xlsx,application/pdf,image/*';

export function ShartnomaHujjatlar({ kompaniyaId, shartnomaId }: { kompaniyaId: number | null; shartnomaId: number }) {
  const [m, setM] = useState<Malumot | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [band, setBand] = useState(false);
  const [tanlangan, setTanlangan] = useState('');
  const fayl = useRef<HTMLInputElement>(null);
  const nishon = useRef<number | null>(null);

  const yukla = useCallback(async () => {
    if (!kompaniyaId) return;
    const r = await shartnomaHujjatlarOl(kompaniyaId, shartnomaId);
    if (r.ok) { setM(r.natija); setXato(null); } else { setM(null); setXato(r.error); }
  }, [kompaniyaId, shartnomaId]);
  useEffect(() => { void yukla(); }, [yukla]);

  function tanla(dsId: number | null) { nishon.current = dsId; fayl.current?.click(); }

  async function faylTanlandi(fs: FileList | null) {
    if (!kompaniyaId || !fs || fs.length === 0 || band) return;
    setBand(true);
    let soni = 0;
    for (const f of Array.from(fs)) {
      const r = await shartnomaFaylYukla({ file: f, kompaniyaId, shartnomaId, dsId: nishon.current });
      if (r.ok) soni += 1; else toast(`${f.name}: ${r.xato}`, 'danger');
    }
    setBand(false);
    if (fayl.current) fayl.current.value = '';
    if (soni) toast(tr('{n} ta fayl R2 ga saqlandi va bog‘landi', { n: soni }), 'ok');
    await yukla();
  }

  async function ajrat(h: ShartnomaFayl) {
    if (!kompaniyaId || band) return;
    setBand(true);
    const r = await shartnomaHujjatAjrat({ kompaniyaId, id: h.id, operationId: yangiOperationId() });
    setBand(false);
    if (!r.ok) { toast(shartnomaHujjatXato(r), 'danger'); return; }
    toast(tr('Fayl shartnomadan ajratildi (R2 da saqlanib qoladi)'), 'ok');
    await yukla();
  }

  async function boglaMavjud() {
    const [idXom, dsXom] = tanlangan.split(':');
    const id = Number(idXom);
    if (!kompaniyaId || !Number.isSafeInteger(id) || id <= 0 || band) return;
    setBand(true);
    const r = await shartnomaHujjatBogla({ kompaniyaId, shartnomaId, documentId: id, dsId: dsXom ? Number(dsXom) : null, operationId: yangiOperationId() });
    setBand(false);
    if (!r.ok) { toast(shartnomaHujjatXato(r), 'danger'); return; }
    setTanlangan('');
    await yukla();
  }

  const fayllar = (dsId: number | null) => (m?.hujjatlar ?? []).filter((h) => (h.ds_id ?? null) === dsId);
  const royxat = (hs: ShartnomaFayl[]) => (hs.length === 0 ? <p className="text-[12px] text-text-mute">{tr('Fayl biriktirilmagan')}</p> : (
    <ul className="space-y-0.5">{hs.map((h) => (
      <li key={h.id} className="flex items-center gap-2 text-[12px]">
        <FileText size={12} className="shrink-0 text-text-mute" />
        <span className="min-w-0 flex-1 truncate text-text" title={h.original_filename ?? ''}>{h.original_filename || `#${h.document_id}`}</span>
        <span className="shrink-0 tabular-nums text-text-mute">{hajmKorinish(h.size_bytes)}</span>
        {h.saqlangan
          ? <a href={hujjatYuklabOlishUrl(h.document_id)} download className="fz-btn fz-btn--ghost fz-btn--sm" aria-label={tr('Yuklab olish')}><Download size={12} />{tr('Yuklab olish')}</a>
          : <span className="fz-chip fz-chip--warn">{tr('saqlanmoqda')}</span>}
        <button type="button" disabled={band} onClick={() => void ajrat(h)} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" aria-label={tr('Shartnomadan ajratish')}><Unlink size={12} /></button>
      </li>
    ))}</ul>
  ));

  return (
    <section className="fz-panel text-[12.5px]" aria-label={tr('Asl hujjatlar va qo‘shimcha kelishuvlar')}>
      <input ref={fayl} type="file" multiple accept={QABUL} className="hidden" aria-label={tr('Fayl tanlash')} onChange={(e) => void faylTanlandi(e.target.files)} />
      <div className="mb-1.5 flex items-center gap-2">
        <Paperclip size={14} className="text-text-mute" />
        <p className="fz-panel__h">{tr('Asl hujjatlar va qo‘shimcha kelishuvlar')}</p>
        <button type="button" disabled={band || !kompaniyaId} onClick={() => tanla(null)} className="fz-btn fz-btn--sm ml-auto"><Upload size={12} />{band ? tr('Yuklanmoqda…') : tr('Shartnoma faylini yuklash')}</button>
      </div>
      {xato && <p role="alert" className="text-[12px] text-danger">{xato}</p>}
      {!m && !xato && <div className="skel h-12 rounded-md" />}
      {m && <>
        <p className="mb-1 flex justify-between gap-2"><span>{tr('Shartnoma')} № {m.shartnoma.raqam}{m.shartnoma.sana ? ` · ${sanaKorinish(m.shartnoma.sana)}` : ''}</span>
          <span className="tabular-nums">{tr('Joriy summa (QQS bilan)')}: <b>{joriySumma(m) == null ? '—' : <FmtN val={joriySumma(m) as number} />}</b></span></p>
        {royxat(fayllar(null))}
        <div className="mt-2 border-t border-border/50 pt-1.5">
          <div className="mb-1 flex items-center gap-2"><span className="font-semibold text-text">{tr('Qo‘shimcha kelishuvlar (DS)')}</span><span className="fz-chip">{m.ds.length}</span>
            <Link to="/admin/nakopitelniy" className="ml-auto text-[11px] text-accent hover:underline">{tr('DS qo‘shish / tahrirlash — Nakopitelniy')}</Link></div>
          {m.ds.length === 0 ? <p className="text-[12px] text-text-mute">{tr('DS kiritilmagan')}</p> : (
            <ul className="space-y-1.5">{m.ds.map((d) => (
              <li key={d.id} className="rounded-md border border-border px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text">№ {d.raqam}</span>
                  <span className="text-text-mute">{sanaKorinish(d.sana)}</span>
                  <span className="ml-auto tabular-nums text-text"><FmtN val={d.jami_nds_bilan} /></span>
                  <button type="button" disabled={band || !kompaniyaId} onClick={() => tanla(d.id)} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" aria-label={tr('DS faylini yuklash')}><Upload size={12} /></button>
                </div>
                {d.izoh && <p className="truncate text-[11px] text-text-mute">{d.izoh}</p>}
                <div className="mt-1">{royxat(fayllar(d.id))}</div>
              </li>
            ))}</ul>
          )}
        </div>
        {m.boglanmagan.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-1.5">
            <Link2 size={12} className="text-text-mute" />
            <select aria-label={tr('Yuklangan, lekin bog‘lanmagan fayl')} value={tanlangan} onChange={(e) => setTanlangan(e.target.value)}
              className="min-w-0 max-w-[16rem] flex-1 rounded border border-border bg-surface px-1 py-0.5 text-[12px] text-text-dim">
              <option value="">{tr('Bog‘lanmagan fayl…')}</option>
              {m.boglanmagan.map((b) => <option key={b.document_id} value={String(b.document_id)}>{b.original_filename || `#${b.document_id}`}</option>)}
              {m.ds.flatMap((d) => m.boglanmagan.map((b) => <option key={`${b.document_id}:${d.id}`} value={`${b.document_id}:${d.id}`}>{`${b.original_filename || '#' + b.document_id} → DS № ${d.raqam}`}</option>))}
            </select>
            <button type="button" disabled={band || !tanlangan} onClick={() => void boglaMavjud()} className="fz-btn fz-btn--sm">{tr('Bog‘lash')}</button>
          </div>
        )}
        <p className="mt-1.5 text-[11px] text-text-mute">{tr('Fayllar kompaniyaning yopiq R2 omborida saqlanadi; yuklab olish faqat kompaniya a’zolariga.')}</p>
      </>}
    </section>
  );
}
