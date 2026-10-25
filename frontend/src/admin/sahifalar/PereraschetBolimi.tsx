/**
 * PERERASCHET bo'limi (Nakopitelniy sahifasida; egasi 2026-10-25): «pereraschet qilsang shuncha pul ziyod olasan yoki
 * shuncha minus kirasan». Hisob — `lib/pereraschet.ts` (sof), hujjat — `lib/pereraschet-export.ts`.
 * Faqat O'QIYDI: asl smeta va tasdiqlangan aktlar o'zgarmaydi. «Tuzatuvchi F2 qoralamasi» — oddiy F2 qoralama
 * (t2_akt_yarat_v2), tasdiqlash egasida (F2 tarixida); avtomatik yozish yo'q.
 */
import { Fragment, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Calculator, ChevronDown, ChevronRight, Download, FilePlus2 } from 'lucide-react';
import { sbOqi, sbT2AktYaratV2, yangiOperationId } from '../../api/supabase';
import { t2ToliqOqiParallel } from '../../api/t2-toliq-oqish';
import { sbT2F2TafsilotOl, type F2Tafsilot } from '../../api/t2-narx';
import { tokenBilan } from '../../api/t2-token';
import { PERERASCHET_USTUNLAR, pereraschetBolimlari, pereraschetHisobla, tuzatuvchiYuk, type BandTur, type PNatijaQator, type PQator, type TekshirSabab } from '../../lib/pereraschet';
import { pereraschetXlsx } from '../../lib/pereraschet-export';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { bloklarmi, dublikatTekshiruv } from '../../lib/f2-dublikat/tekshiruv';
import type { ImzoNomlar } from '../../lib/hujjat-yozuvchi';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { useUstamaliSumma } from '../../umumiy/ui/useUstamaliSumma';
import { useObyektF2Aktlari } from './F2DublikatPanel';
import type { KatKesim } from '../../lib/ustamali-summa';

const SAHIFA = 100;
const bandNomi = (b: BandTur) => ({ ortiqcha: t('Ortiqcha olingan'), narx_farqi: t('Narx farqi'), olinmagan: t('Olinmay qolgan (faktda bor)'), chegirma: t('Chegirma (исключать) — asosiy ishga mutanosib emas') })[b];
const tekshirNomi = (s: TekshirSabab) => ({
  birlik_shubha: t('Birlik shubhasi (nisbat 5 martadan ortiq)'),
  smeta_hajm_yoq: t('Smetada hajm yo‘q yoki 0'),
  narx_yoq: t('Smeta narxi yo‘q'),
  chegirma_asosiy_yoq: t('Chegirma qatori — asosiy ishi topilmadi'),
  eski_smeta: t('«(ekspertizagacha)» bo‘lim — tuzatish bilan yopilmagan'),
  zamena: t('Zamena juftligi'),
})[s];
const RANG: Record<string, string> = { '1': 'text-success', '-1': 'text-danger' };
const rang = (x: number) => RANG[String(Math.sign(x))] ?? '';

export function PereraschetBolimi({ companyId, obyektId, obyektNom, tomonlar, ndsFoiz }: {
  companyId: number; obyektId: number; obyektNom: string; tomonlar: ImzoNomlar; ndsFoiz: number | null;
}) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<PQator[] | null>(null);
  const [zamena, setZamena] = useState<{ z: Set<number>; a: Set<number> }>({ z: new Set(), a: new Set() });
  const [busy, setBusy] = useState(false);
  const [xato, setXato] = useState('');
  const [bolim, setBolim] = useState<number | null>(null);
  const [sahifa, setSahifa] = useState(0);
  const [ochiq, setOchiq] = useState<number | null>(null);
  const [tarix, setTarix] = useState<F2Tafsilot[] | null>(null);
  const [tanlangan, setTanlangan] = useState<Set<number>>(new Set());
  const [raqam, setRaqam] = useState('');
  const [oy, setOy] = useState(() => new Date().toISOString().slice(0, 7));
  const [yozilmoqda, setYozilmoqda] = useState(false);
  const [yangila, setYangila] = useState(0);
  const operationId = useRef(yangiOperationId());
  const ustama = useUstamaliSumma(obyektId, { kompaniyaId: companyId });
  const { aktlar } = useObyektF2Aktlari(rows ? obyektId : null, yangila);

  const yukla = async () => {
    setBusy(true); setXato(''); setTarix(null); setOchiq(null);
    try {
      const [h, z] = await Promise.all([
        t2ToliqOqiParallel<PQator>(sbOqi, { jadval: 't2_qator_holat', filtr: 'obyekt_id=eq.' + obyektId, ustunlar: PERERASCHET_USTUNLAR, limit: 200000 }, 'qator_id'),
        sbOqi<{ id: number; replaces_line_id: number | null }>({ jadval: 't2_qator', filtr: `obyekt_id=eq.${obyektId}&replaces_line_id=not.is.null`, ustunlar: 'id,replaces_line_id', limit: 20000 }),
      ]);
      if (!h.ok || h.toliq === false) { setXato(t('Smeta qatorlari to‘liq o‘qilmadi — pereraschet chala ma’lumot ustida hisoblanmaydi.')); setRows(null); return; }
      if (!z.ok) { setXato(t('Zamena bog‘lanishlari o‘qilmadi — qayta urinib ko‘ring.')); setRows(null); return; }
      const zs = new Set<number>(); const as = new Set<number>();
      for (const x of z.qatorlar ?? []) { zs.add(Number(x.id)); if (x.replaces_line_id != null) as.add(Number(x.replaces_line_id)); }
      setZamena({ z: zs, a: as });
      setRows(h.qatorlar ?? []);
      setTanlangan(new Set()); setSahifa(0);
    } catch { setXato(t('Ma’lumotni yuklab bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring.')); }
    finally { setBusy(false); }
  };

  const bolimlar = useMemo(() => (rows ? pereraschetBolimlari(rows) : []), [rows]);
  const natija = useMemo(() => (rows ? pereraschetHisobla(rows, { zamenaIdlar: zamena.z, aslIdlar: zamena.a, bolimId: bolim }) : null), [rows, zamena, bolim]);
  const bolimNomi = bolim != null ? bolimlar.find((b) => b.id === bolim)?.nom ?? null : null;

  /** Ustamali (ИТОГО-4, NDS siz): kat noma'lum qism ustamasiz qo'shiladi (SummaJuft bilan bir xil qoida). */
  const ustamali = (k: KatKesim | undefined): number | null => {
    if (!k) return null;
    const u = ustama.hisobla(k);
    return u?.ustamali == null ? null : u.ustamali + u.nomalum.summa;
  };
  const uPlus = ustamali(natija?.plusKesim);
  const uMinus = ustamali(natija?.minusKesim);
  const uSof = uPlus != null && uMinus != null ? uPlus - uMinus : null;
  const ndsAsos = uSof ?? natija?.jami.sof ?? 0;
  const nds = ndsFoiz != null ? Math.round(ndsAsos * ndsFoiz) / 100 : null;

  const tarixOch = async (id: number) => {
    if (ochiq === id) { setOchiq(null); return; }
    setOchiq(id);
    if (tarix) return;
    const r = await sbT2F2TafsilotOl({ obyektId, tur: 'f2' });
    if (r.ok) setTarix(r.qatorlar ?? []); else toast(t('F2 tarixi o‘qilmadi.'), 'warn');
  };

  const excel = async () => {
    if (!natija) return;
    try {
      const h = pereraschetXlsx(natija, { obyektNomi: obyektNom, bolimNomi, imzo: tomonlar, ndsFoiz, ustamali: uPlus != null && uMinus != null ? { plus: uPlus, minus: uMinus } : null });
      const r = await hujjatTokenBilan({ kompaniyaId: companyId, bytes: h.bytes, hujjat: 'PERERASCHET', sabab: `Перерасчёт · ${obyektNom}${bolimNomi ? ` · ${bolimNomi}` : ''}`, obyekt: obyektId, yacheykalar: h.yacheykalar },
        () => downloadBlob(h.bytes, h.faylNomi));
      if (!r.ok) toast(r.xabar, 'danger'); else if (r.xabar) toast(r.xabar, 'ok');
    } catch { toast(t('Excel fayli tuzilmadi.'), 'danger'); }
  };

  const yuk = useMemo(() => (natija ? tuzatuvchiYuk(natija.hisobda, tanlangan) : []), [natija, tanlangan]);
  const yukJami = yuk.reduce((s, y) => s + y.certifiedAmount, 0);
  const masalalar = useMemo(() => (yuk.length ? dublikatTekshiruv({ aktlar, oy, raqam, jami: yukJami, ozAktId: null, manbaAktIdlar: [] }) : []), [yuk, aktlar, oy, raqam, yukJami]);
  const qoralama = async () => {
    if (!yuk.length || yozilmoqda) return;
    if (!raqam.trim()) { toast(t('Tuzatuvchi F2 raqamini kiriting (masalan 12-П).'), 'warn'); return; }
    if (bloklarmi(masalalar)) { toast(masalalar.filter((m) => m.daraja === 'blok').map((m) => m.matn).join('\n'), 'danger'); return; }
    const ogoh = masalalar.filter((m) => m.daraja === 'ogoh').map((m) => m.matn);
    if (!window.confirm([t('Tanlangan {n} qatordan tuzatuvchi F2 QORALAMASI yaratiladi (tasdiqlash — F2 tarixida, egasi tomonidan). Davom etasizmi?', { n: String(yuk.length) }), ...ogoh].join('\n\n'))) return;
    setYozilmoqda(true);
    try {
      const yacheyka = yuk.length * 3;
      const r = await tokenBilan({ kompaniyaId: companyId, amal: 'f2_qoralama', birlikSoni: yacheyka, meta: { obyekt: obyektId, qator: yuk.length, yacheyka, manba: 'pereraschet' } }, async () => {
        const res = await sbT2AktYaratV2({ obyektId, oy: `${oy}-01`, operationId: operationId.current, raqam: raqam.trim(), qatorlar: yuk });
        if (!res.ok) throw new Error(res.error || res.xabar || 'F2 qoralama yaratilmadi.');
        return res;
      });
      if (!r.ok) { toast(r.xabar, 'danger'); return; }
      operationId.current = yangiOperationId();
      setTanlangan(new Set()); setYangila((x) => x + 1);
      toast(t('Tuzatuvchi F2 qoralamasi yaratildi. Tasdiqlash — F2 tarixida.'), 'ok', undefined, 12000, { label: t('Ochish'), onClick: () => navigate(`/admin/f2-tarix?obyekt=${obyektId}`) });
    } catch { toast(t('Javob olinmadi. Qayta urinib ko‘ring.'), 'danger'); }
    finally { setYozilmoqda(false); }
  };

  const qatorlar = natija?.hisobda ?? [];
  const korinadi = qatorlar.slice(sahifa * SAHIFA, sahifa * SAHIFA + SAHIFA);
  const sahifaSoni = Math.max(1, Math.ceil(qatorlar.length / SAHIFA));
  const belgila = (id: number) => setTanlangan((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const hammasi = (tur: 'plus' | 'minus' | 'hammasi' | 'yoq') => setTanlangan(new Set(tur === 'yoq' ? [] : qatorlar.filter((q) => tur === 'hammasi' || Math.sign(q.sof) === (tur === 'plus' ? 1 : -1)).map((q) => q.qatorId)));

  const tarixRow = (q: PNatijaQator) => {
    const t2 = (tarix ?? []).filter((x) => x.qator_id === q.qatorId);
    return (
      <tr className="bg-surface-2/40"><td colSpan={9} className="px-3 py-2">
        {!tarix && <span className="text-text-mute">{t('Yuklanmoqda…')}</span>}
        {!!tarix && !t2.length && <span className="text-text-mute">{t('Bu qator F2 aktlarida topilmadi.')}</span>}
        {!!tarix && t2.length > 0 && (
          <table className="text-[11px]"><thead><tr className="text-text-mute"><th className="px-2 text-left">{t('Akt')}</th><th className="px-2 text-left">{t('Oy')}</th><th className="px-2 text-left">{t('Holat')}</th><th className="px-2 text-right">{t('Hajm')}</th><th className="px-2 text-right">{t('Narx')}</th><th className="px-2 text-right">{t('Summa')}</th></tr></thead>
            <tbody>{t2.map((x) => <tr key={x.akt_qator_id}><td className="px-2">№ {x.raqam ?? '—'} (#{x.akt_id})</td><td className="px-2">{String(x.oy).slice(0, 7)}</td><td className="px-2">{x.akt_holat}</td>
              <td className="px-2 text-right tabular-nums"><FmtN val={x.certified_quantity ?? x.hajm} kasr={3} /></td>
              <td className="px-2 text-right tabular-nums">{(x.certified_unit_price ?? x.narx) == null ? '—' : <FmtN val={(x.certified_unit_price ?? x.narx)!} />}</td>
              <td className="px-2 text-right tabular-nums">{(x.certified_amount ?? x.summa) == null ? '—' : <FmtN val={(x.certified_amount ?? x.summa)!} />}</td></tr>)}</tbody></table>
        )}
      </td></tr>
    );
  };

  return (
    <details className="rounded-lg border border-border p-3" data-testid="pereraschet">
      <summary className="cursor-pointer text-sm font-semibold">{t('Pereraschet — ortiqcha olingan / olinmay qolgan hajm va narx farqi')}</summary>
      <div className="mt-2 flex flex-wrap items-end gap-2 text-[13px]">
        <button type="button" disabled={busy} onClick={() => void yukla()} className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg bg-accent text-white text-sm disabled:opacity-50">
          <Calculator size={14} /> {rows ? t('Qayta hisoblash') : t('Pereraschetni hisoblash')}
        </button>
        {rows && (
          <label className="text-[12px]">{t('Uchastka / razdel')}
            <select className="ml-2 border rounded px-2 py-1 max-w-[360px]" value={bolim ?? ''} onChange={(e) => { setBolim(e.target.value ? Number(e.target.value) : null); setSahifa(0); setTanlangan(new Set()); }}>
              <option value="">{t('Butun obyekt')}</option>
              {bolimlar.map((b) => <option key={b.id} value={b.id}>{' '.repeat(b.daraja * 3)}{b.nom}</option>)}
            </select>
          </label>
        )}
        {natija && (
          <button type="button" onClick={() => void excel()} className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border text-sm hover:border-accent/50">
            <Download size={14} /> {t('Pereraschet (Excel)')}
          </button>
        )}
      </div>
      {busy && <p role="status" className="mt-2 text-[12px]">{t('Smeta qatorlari o‘qilmoqda…')}</p>}
      {xato && <p role="alert" className="mt-2 text-danger flex items-center gap-1.5 text-[12px]"><AlertTriangle size={14} /> {xato}</p>}

      {natija && (
        <>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4 text-[12px]">
            <div className="karta p-2"><div className="text-text-mute">{t('Olish mumkin (+)')}</div>
              <div className="text-success font-semibold tabular-nums">{uPlus == null ? t('ustamali noma’lum') : <FmtN val={uPlus} />}</div>
              <div className="text-text-mute">{t('ustamasiz')}: <FmtN val={natija.jami.plus} /></div></div>
            <div className="karta p-2"><div className="text-text-mute">{t('Qaytarish kerak (−)')}</div>
              <div className="text-danger font-semibold tabular-nums">{uMinus == null ? t('ustamali noma’lum') : <FmtN val={uMinus} />}</div>
              <div className="text-text-mute">{t('ustamasiz')}: <FmtN val={natija.jami.minus} /></div></div>
            <div className="karta p-2"><div className="text-text-mute">{t('Sof natija (NDS siz)')}</div>
              <div className={`font-semibold tabular-nums ${rang(uSof ?? natija.jami.sof)}`}>{uSof == null ? t('ustamali noma’lum') : <FmtN val={uSof} />}</div>
              <div className="text-text-mute">{t('ustamasiz')}: <FmtN val={natija.jami.sof} /></div></div>
            <div className="karta p-2"><div className="text-text-mute">{t('Sof natija NDS bilan')}{ndsFoiz != null ? ` (${ndsFoiz}%)` : ''}</div>
              <div className={`font-semibold tabular-nums ${rang(ndsAsos)}`}>{nds == null ? t('QQS stavkasi kiritilmagan') : <FmtN val={ndsAsos + nds} />}</div>
              {uSof == null && <div className="text-warn">{t('ustamasiz summadan hisoblandi')}</div>}</div>
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-[12px]">
            {(Object.keys(natija.turBoyicha) as BandTur[]).map((b) => (
              <span key={b}>{bandNomi(b)}: <span className="text-success tabular-nums">+<FmtN val={natija.turBoyicha[b].plus} /></span> / <span className="text-danger tabular-nums">−<FmtN val={natija.turBoyicha[b].minus} /></span></span>
            ))}
            {natija.faktNormaPlus > 0 && <span className="text-warn">{t('shundan BL norma bo‘yicha fakt')}: <FmtN val={natija.faktNormaPlus} /></span>}
            <span className="text-warn">{t('Tekshirish kerak (pulga kirmagan)')}: {natija.tekshirTaxminiy.soni} · ≈ +<FmtN val={natija.tekshirTaxminiy.plus} /> / −<FmtN val={natija.tekshirTaxminiy.minus} /></span>
          </div>

          {natija.bolimlar.length > 1 && (
            <details className="mt-2 text-[12px]">
              <summary className="cursor-pointer">{t('Razdellar bo‘yicha')} ({natija.bolimlar.length})</summary>
              <table className="mt-1 w-full"><tbody>{natija.bolimlar.slice(0, 60).map((b) => (
                <tr key={String(b.bolimId)} className="border-b border-border/40"><td className="px-1">{b.yol.join(' › ') || t('Bo‘limsiz')}</td>
                  <td className="px-1 text-right text-success tabular-nums"><FmtN val={b.plus} /></td><td className="px-1 text-right text-danger tabular-nums"><FmtN val={b.minus} /></td>
                  <td className={`px-1 text-right font-semibold tabular-nums ${rang(b.sof)}`}><FmtN val={b.sof} /></td></tr>))}</tbody></table>
            </details>
          )}

          <div className="mt-3 flex flex-wrap items-end gap-2 text-[12px]">
            <button type="button" className="h-7 px-2 rounded border" onClick={() => hammasi('minus')}>{t('Barcha minuslarni tanlash')}</button>
            <button type="button" className="h-7 px-2 rounded border" onClick={() => hammasi('plus')}>{t('Barcha pluslarni tanlash')}</button>
            <button type="button" className="h-7 px-2 rounded border" onClick={() => hammasi('yoq')}>{t('Tanlovni tozalash')}</button>
            <label>{t('F2 raqami')}<input className="ml-1 w-24 border rounded px-2 py-0.5" value={raqam} onChange={(e) => setRaqam(e.target.value)} placeholder={t('12-П')} /></label>
            <label>{t('Oy')}<input type="month" className="ml-1 border rounded px-2 py-0.5" value={oy} onChange={(e) => setOy(e.target.value)} /></label>
            <button type="button" disabled={!yuk.length || yozilmoqda} onClick={() => void qoralama()}
              className="h-7 px-2 inline-flex items-center gap-1 rounded bg-accent text-white disabled:opacity-50">
              <FilePlus2 size={13} /> {t('Tuzatuvchi F2 qoralamasi')} ({yuk.length}; <FmtN val={yukJami} />)
            </button>
          </div>
          {masalalar.length > 0 && <ul className="mt-1 text-[12px]">{masalalar.map((m, i) => <li key={i} className={m.daraja === 'blok' ? 'text-danger' : 'text-warn'}>{m.matn}</li>)}</ul>}

          <div className="mt-2 karta overflow-auto max-h-[60vh]">
            <table className="w-full text-[11px] border-collapse">
              <thead className="sticky top-0 bg-surface-2"><tr className="text-text-mute">
                <th className="px-1" /><th className="px-2 text-left">{t('Ish / resurs')}</th><th className="px-2">{t('Birlik')}</th>
                <th className="px-2 text-right">{t('Smeta hajm')}</th><th className="px-2 text-right">{t('Fakt')}</th><th className="px-2 text-right">{t('F2 hajm')}</th>
                <th className="px-2 text-right">{t('Smeta narx / F2 narx')}</th><th className="px-2 text-left">{t('Sabab')}</th><th className="px-2 text-right">{t('Summa (ustamasiz)')}</th>
              </tr></thead>
              <tbody>
                {korinadi.map((q) => (
                  <Fragment key={q.qatorId}>
                    <tr className="border-t border-border/60 hover:bg-surface-2/40 cursor-pointer" onClick={() => void tarixOch(q.qatorId)}>
                      <td className="px-1" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={t('Tanlash')} checked={tanlangan.has(q.qatorId)} onChange={() => belgila(q.qatorId)} /></td>
                      <td className="px-2"><span className="inline-flex items-center gap-1">{ochiq === q.qatorId ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{q.kod ? `${q.kod} ` : ''}{q.nom}</span>
                        <div className="text-[10px] text-text-mute">{q.bolimYol.join(' › ')}</div></td>
                      <td className="px-2 text-center">{q.birlik ?? '—'}</td>
                      <td className="px-2 text-right tabular-nums">{q.smetaHajm == null ? '—' : <FmtN val={q.smetaHajm} kasr={3} />}</td>
                      <td className="px-2 text-right tabular-nums"><FmtN val={q.faktHajm} kasr={3} />{q.eslatma.includes('fakt_norma') && <span className="ml-1 text-warn" title={t('Fakt ish (BL) faktidan norma bo‘yicha hosila')}>{t('norma')}</span>}</td>
                      <td className="px-2 text-right tabular-nums"><FmtN val={q.f2Hajm} kasr={3} /></td>
                      <td className="px-2 text-right tabular-nums">{q.smetaNarx == null ? '—' : <FmtN val={q.smetaNarx} />} / {q.f2Narx == null ? '—' : <FmtN val={q.f2Narx} />}</td>
                      <td className="px-2">{q.bandlar.map((b) => <div key={b.tur} className={rang(b.summa)}>{bandNomi(b.tur)}: <FmtN val={b.summa} /></div>)}
                        {q.chegirma?.asosiy && <div className="text-text-mute">{t('Asosiy ish {kod}: F2 {x}% olingan, chegirma {y}% qo‘llangan', { kod: q.chegirma.asosiy.kod ?? '', x: (Math.min(1, Math.max(0, q.chegirma.asosiy.ulush)) * 100).toFixed(1), y: (q.chegirma.y * 100).toFixed(1) })}</div>}
                        {q.eslatma.includes('smetadan_tashqari') && <div className="text-text-mute">{t('Smetadan tashqari fakt (pulga kirmaydi, DS kerak)')}</div>}
                        {q.eslatma.includes('narx_farqi_hisoblanmadi') && <div className="text-text-mute">{t('F2 summasi noma’lum — narx farqi hisoblanmadi')}</div>}</td>
                      <td className={`px-2 text-right font-semibold tabular-nums ${rang(q.sof)}`}><FmtN val={q.sof} /></td>
                    </tr>
                    {ochiq === q.qatorId && tarixRow(q)}
                  </Fragment>
                ))}
                {!korinadi.length && <tr><td colSpan={9} className="px-2 py-3 text-text-mute">{t('Pereraschetga tushadigan qator topilmadi.')}</td></tr>}
              </tbody>
            </table>
          </div>
          {sahifaSoni > 1 && (
            <div className="mt-1 flex items-center gap-2 text-[12px]">
              <button type="button" disabled={sahifa === 0} onClick={() => setSahifa((p) => p - 1)} className="px-2 py-1 border rounded disabled:opacity-40">{t('Oldingi')}</button>
              <span>{sahifa + 1} / {sahifaSoni}</span>
              <button type="button" disabled={sahifa + 1 >= sahifaSoni} onClick={() => setSahifa((p) => p + 1)} className="px-2 py-1 border rounded disabled:opacity-40">{t('Keyingi')}</button>
            </div>
          )}

          {natija.tekshirish.length > 0 && (
            <details className="mt-3 text-[12px]">
              <summary className="cursor-pointer text-warn">{t('Tekshirish kerak (pulga kirmagan)')}: {natija.tekshirish.length}</summary>
              <table className="mt-1 w-full"><tbody>{natija.tekshirish.slice(0, 300).map((q) => (
                <tr key={q.qatorId} className="border-b border-border/40">
                  <td className="px-1">{q.kod ? `${q.kod} ` : ''}{q.nom}<div className="text-[10px] text-text-mute">{q.bolimYol.join(' › ')}</div></td>
                  <td className="px-1">{q.birlik ?? '—'}</td>
                  <td className="px-1 text-right tabular-nums">{q.smetaHajm == null ? '—' : <FmtN val={q.smetaHajm} kasr={3} />} / <FmtN val={q.f2Hajm} kasr={3} /></td>
                  <td className="px-1 text-warn">{q.tekshir.map(tekshirNomi).join('; ')}</td>
                  <td className={`px-1 text-right tabular-nums ${rang(q.sof)}`}>{q.sof ? <>≈ <FmtN val={q.sof} /></> : '—'}</td>
                </tr>))}</tbody></table>
            </details>
          )}
        </>
      )}
    </details>
  );
}
