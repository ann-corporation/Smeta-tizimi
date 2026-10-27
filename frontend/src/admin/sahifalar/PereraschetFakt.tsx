/**
 * «Fakt bo'yicha qayta hisob» — PereraschetBolimi ichidagi ikkinchi rejim (egasi 2026-10-26: «hamma olingan F2 ni minus
 * qilib, keyin fakt hajmlarini qayta belgilab pereraschet»). Hisob — `lib/pereraschet-fakt.ts` (sof), hujjat —
 * `pereraschetFaktXlsx`. Faqat O'QIYDI; «Pereraschet F2 qoralamasi» — oddiy F2 qoralama(lar) (t2_akt_yarat_v2),
 * tasdiqlash egasida (F2 tarixida). Asl smeta va tasdiqlangan aktlar o'zgarmaydi.
 */
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Download, ExternalLink, FilePlus2 } from 'lucide-react';
import { sbT2AktYaratV2, yangiOperationId } from '../../api/supabase';
import { tokenBilan } from '../../api/t2-token';
import type { PQator } from '../../lib/pereraschet';
import { faktJurnalHavola, faktPereraschetHisobla, farqYuk, qaytaYuk, stornoYuk, type BoglanmaganSabab, type FaktFormat, type FaktTekshirSabab } from '../../lib/pereraschet-fakt';
import { pereraschetFaktXlsx } from '../../lib/pereraschet-export';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { bloklarmi, dublikatTekshiruv } from '../../lib/f2-dublikat/tekshiruv';
import type { ImzoNomlar } from '../../lib/hujjat-yozuvchi';
import type { KatKesim } from '../../lib/ustamali-summa';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { useUstamaliSumma } from '../../umumiy/ui/useUstamaliSumma';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { Maydon } from '../../umumiy/ui/Sahifa';
import { tasdiqSora } from '../../umumiy/ui/Tasdiq';
import { IkkiTomonQator, MiniFarq, Eksa, Rang } from '../../components/nakopitelniy/PereraschetGrafik';

const SAHIFA = 100;
const RANG: Record<string, string> = { '1': 'var(--ok)', '-1': 'var(--danger)' };
const rangSof = (x: number) => RANG[String(Math.sign(x))] ?? 'var(--text-dim)';
const boglanmaganNomi = (s: BoglanmaganSabab) => ({
  eski_smeta: t('«(ekspertizagacha)» bo‘lim'),
  smeta_hajm_yoq: t('Smetada hajm yo‘q'),
  qoshimcha_narxsiz: t('F2 importida qo‘shilgan (smetada yo‘q, narxsiz)'),
})[s];
const tekshirNomi = (s: FaktTekshirSabab) => ({
  narx_yoq: t('Smeta narxi yo‘q'),
  f2_summa_nomalum: t('F2 summasi noma’lum'),
  chegirma: t('Chegirma qatori — «F2 vs smeta» rejimida ko‘ring'),
})[s];

type Aktlar = Parameters<typeof dublikatTekshiruv>[0]['aktlar'];

export function PereraschetFakt({ companyId, obyektId, obyektNom, tomonlar, ndsFoiz, rows, qoshimcha, bolim, bolimNomi, aktlar, onYaratildi }: {
  companyId: number; obyektId: number; obyektNom: string; tomonlar: ImzoNomlar; ndsFoiz: number | null;
  rows: readonly PQator[]; qoshimcha: ReadonlySet<number>; bolim: number | null; bolimNomi: string | null;
  aktlar: Aktlar; onYaratildi: () => void;
}) {
  const navigate = useNavigate();
  const ustama = useUstamaliSumma(obyektId, { kompaniyaId: companyId });
  const [format, setFormat] = useState<FaktFormat>('storno');
  const [sahifa, setSahifa] = useState(0);
  const [raqam, setRaqam] = useState('');
  const [oy, setOy] = useState(() => new Date().toISOString().slice(0, 7));
  const [yozilmoqda, setYozilmoqda] = useState(false);
  const operationId = useRef({ a: yangiOperationId(), b: yangiOperationId() });

  const yaxlitIdlari = ustama.yaxlitIdlari;
  const yaxlitIdlar = useMemo(() => yaxlitIdlari?.(rows.map((r) => ({ id: r.qator_id, ota_id: r.ota_id }))), [rows, yaxlitIdlari]);
  const n = useMemo(() => faktPereraschetHisobla(rows, { qoshimchaIdlar: qoshimcha, bolimId: bolim, yaxlitIdlar }), [rows, qoshimcha, bolim, yaxlitIdlar]);

  /** Ustamali (ИТОГО-4, NDS siz): kat noma'lum qism ustamasiz qo'shiladi (SummaJuft bilan bir xil qoida). */
  const ustamali = (k: KatKesim): number | null => { const u = ustama.hisobla(k); return u?.ustamali == null ? null : u.ustamali + u.nomalum.summa; };
  const uKerak = ustamali(n.kerakKesim); const uOlingan = ustamali(n.olinganKesim);
  const uPlus = ustamali(n.plusKesim); const uMinus = ustamali(n.minusKesim);
  const uSof = format === 'storno' ? (uKerak != null && uOlingan != null ? uKerak - uOlingan : null) : (uPlus != null && uMinus != null ? uPlus - uMinus : null);
  const ndsAsos = uSof ?? n.jami.sof;
  const nds = ndsFoiz != null ? Math.round(ndsAsos * ndsFoiz) / 100 : null;

  const storno = useMemo(() => stornoYuk(n), [n]);
  const qayta = useMemo(() => qaytaYuk(n), [n]);
  const farq = useMemo(() => farqYuk(n), [n]);
  const yukSoni = format === 'storno' ? storno.qatorlar.length + qayta.qatorlar.length : farq.qatorlar.length;
  const yukJami = format === 'storno' ? storno.jami + qayta.jami : farq.jami;
  const masalalar = useMemo(() => (yukSoni ? dublikatTekshiruv({ aktlar, oy, raqam, jami: yukJami, ozAktId: null, manbaAktIdlar: [] }) : []), [yukSoni, aktlar, oy, raqam, yukJami]);

  const excel = async () => {
    try {
      const h = pereraschetFaktXlsx(n, { obyektNomi: obyektNom, bolimNomi, imzo: tomonlar, ndsFoiz,
        ustamali: uKerak != null && uOlingan != null && uPlus != null && uMinus != null ? { kerak: uKerak, olingan: uOlingan, plus: uPlus, minus: uMinus } : null });
      const r = await hujjatTokenBilan({ kompaniyaId: companyId, bytes: h.bytes, hujjat: 'PERERASCHET', sabab: `Перерасчёт по факту · ${obyektNom}${bolimNomi ? ` · ${bolimNomi}` : ''}`, obyekt: obyektId, yacheykalar: h.yacheykalar },
        () => downloadBlob(h.bytes, h.faylNomi));
      if (!r.ok) toast(r.xabar, 'danger'); else if (r.xabar) toast(r.xabar, 'ok');
    } catch { toast(t('Excel fayli tuzilmadi.'), 'danger'); }
  };

  const qoralama = async () => {
    if (!yukSoni || yozilmoqda) return;
    const rq = raqam.trim();
    if (!rq) { toast(t('Pereraschet F2 raqamini kiriting (masalan 12-П).'), 'warn'); return; }
    if (bloklarmi(masalalar)) { toast(masalalar.filter((m) => m.daraja === 'blok').map((m) => m.matn).join('\n'), 'danger'); return; }
    const ogoh = masalalar.filter((m) => m.daraja === 'ogoh').map((m) => m.matn);
    const sigmadi = format === 'storno' ? storno.sigmadi : farq.sigmadi;
    const matn = format === 'storno'
      ? t('Ikki F2 QORALAMASI yaratiladi: «{a}» — storno ({s} qator), «{b}» — fakt bo‘yicha ({q} qator). Tasdiqlash — F2 tarixida, egasi tomonidan. Davom etasizmi?', { a: `${rq}-С`, b: `${rq}-Ф`, s: String(storno.qatorlar.length), q: String(qayta.qatorlar.length) })
      : t('Pereraschet F2 QORALAMASI yaratiladi ({n} qator, faqat farq). Tasdiqlash — F2 tarixida, egasi tomonidan. Davom etasizmi?', { n: String(farq.qatorlar.length) });
    const sig = sigmadi.soni ? [t('{n} pozitsiya qoralamaga sig‘madi (hajm farqi 0, faqat narx farqi: {s}) — ularni «To‘liq storno + qayta» formati qamraydi.', { n: String(sigmadi.soni), s: sigmadi.summa.toFixed(2) })] : [];
    if (!(await tasdiqSora({ matn: [matn, ...sig, ...ogoh].join('\n\n') }))) return;
    setYozilmoqda(true);
    try {
      const birlik = yukSoni * 3;
      const r = await tokenBilan({ kompaniyaId: companyId, amal: 'f2_qoralama', birlikSoni: birlik, meta: { obyekt: obyektId, qator: yukSoni, yacheyka: birlik, manba: 'pereraschet_fakt', format } }, async () => {
        const yarat = async (raq: string, qatorlar: typeof farq.qatorlar, op: string) => {
          const res = await sbT2AktYaratV2({ obyektId, oy: `${oy}-01`, operationId: op, raqam: raq, qatorlar });
          if (!res.ok) throw new Error(res.error || res.xabar || 'F2 qoralama yaratilmadi.');
          return res;
        };
        if (format === 'farq') return yarat(rq, farq.qatorlar, operationId.current.a);
        if (storno.qatorlar.length) await yarat(`${rq}-С`, storno.qatorlar, operationId.current.a);
        if (qayta.qatorlar.length) {
          try { return await yarat(`${rq}-Ф`, qayta.qatorlar, operationId.current.b); }
          catch (e) { throw new Error(`${t('Storno qoralamasi yaratildi, lekin fakt bo‘yicha qoralama yaratilmadi — qayta urinib ko‘ring (storno takrorlanmaydi).')} ${e instanceof Error ? e.message : ''}`); }
        }
        return { ok: true };
      });
      if (!r.ok) { toast(r.xabar, 'danger'); return; }
      operationId.current = { a: yangiOperationId(), b: yangiOperationId() };
      onYaratildi();
      toast(t('Pereraschet F2 qoralamasi yaratildi. Tasdiqlash — F2 tarixida.'), 'ok', undefined, 12000, { label: t('Ochish'), onClick: () => navigate(`/admin/f2-tarix?obyekt=${obyektId}`) });
    } catch { toast(t('Javob olinmadi. Qayta urinib ko‘ring.'), 'danger'); }
    finally { setYozilmoqda(false); }
  };

  const qatorlar = n.hisobda;
  const korinadi = qatorlar.slice(sahifa * SAHIFA, sahifa * SAHIFA + SAHIFA);
  const sahifaSoni = Math.max(1, Math.ceil(qatorlar.length / SAHIFA));
  const sahifaMax = Math.max(0, ...korinadi.map((q) => Math.abs(q.farq)));
  const bolimTartib = n.bolimlar.slice(0, 60);
  const bolimMax = Math.max(0, ...bolimTartib.flatMap((b) => [b.plus, b.minus]));
  const heroA = format === 'storno' ? (uKerak ?? n.jami.kerak) : (uPlus ?? n.jami.plus);
  const heroB = format === 'storno' ? (uOlingan ?? n.jami.olingan) : (uMinus ?? n.jami.minus);
  const faktsizSumma = n.faktsizF2.reduce((s, p) => s + p.f2Summa, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }} data-testid="pereraschet-fakt">
      <div className="fz-note fz-note--info"><span>{t('Fakt bo‘yicha qayta hisob: har smeta pozitsiyasi uchun «bo‘lishi kerak» = fakt × smeta narxi, «olingan» = barcha tasdiqlangan F2 (tuzatish aktlari bilan). Smetaga bog‘lanmagan olingan F2 to‘liq minus.')}</span></div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-2)' }}>
        <div role="group" aria-label={t('Chiqish formati')} style={{ display: 'inline-flex', gap: 2 }}>
          <button type="button" aria-pressed={format === 'storno'} className={`fz-btn fz-btn--sm ${format === 'storno' ? 'fz-btn--primary' : ''}`} onClick={() => setFormat('storno')}>{t('To‘liq storno + qayta')}</button>
          <button type="button" aria-pressed={format === 'farq'} className={`fz-btn fz-btn--sm ${format === 'farq' ? 'fz-btn--primary' : ''}`} onClick={() => setFormat('farq')}>{t('Faqat farq')}</button>
        </div>
        <span style={{ flex: 1 }} />
        <button type="button" className="fz-btn" onClick={() => void excel()}><Download /> {t('Pereraschet (Excel)')}</button>
      </div>

      <div className="fz-kpis">
        <div className="fz-kpi">
          <span className="fz-kpi__label"><i style={{ background: 'var(--ok)' }} />{format === 'storno' ? t('Fakt bo‘yicha bo‘lishi kerak (+)') : t('Olish mumkin (+)')}</span>
          {format === 'storno'
            ? <SummaJuft obyektId={obyektId} kompaniyaId={companyId} ustamasiz={n.jami.kerak} katKesim={n.kerakKesim} />
            : <SummaJuft obyektId={obyektId} kompaniyaId={companyId} ustamasiz={n.jami.plus} katKesim={n.plusKesim} />}
        </div>
        <div className="fz-kpi">
          <span className="fz-kpi__label"><i style={{ background: 'var(--danger)' }} />{format === 'storno' ? t('Olingan F2 — storno (−)') : t('Qaytarish kerak (−)')}</span>
          {format === 'storno'
            ? <SummaJuft obyektId={obyektId} kompaniyaId={companyId} ustamasiz={n.jami.olingan} katKesim={n.olinganKesim} />
            : <SummaJuft obyektId={obyektId} kompaniyaId={companyId} ustamasiz={n.jami.minus} katKesim={n.minusKesim} />}
        </div>
        <div className="fz-kpi">
          <span className="fz-kpi__label"><i style={{ background: rangSof(uSof ?? n.jami.sof) }} />{t('Sof natija (NDS siz)')}</span>
          <span className="tabular-nums" style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.25 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: rangSof(uSof ?? n.jami.sof) }}>{uSof == null ? <span style={{ color: 'var(--warn)' }}>{t('ustamali noma’lum')}</span> : <FmtN val={uSof} />}</span>
            <span style={{ fontSize: 10.5, color: 'var(--text-mute)' }}>{t('ustamasiz')}: <FmtN val={n.jami.sof} /></span>
          </span>
        </div>
        <div className="fz-kpi">
          <span className="fz-kpi__label"><i style={{ background: rangSof(ndsAsos) }} />{t('Sof natija NDS bilan')}{ndsFoiz != null ? ` (${ndsFoiz}%)` : ''}</span>
          <span className="fz-kpi__value" style={{ fontSize: 14, color: nds == null ? 'var(--text-mute)' : rangSof(ndsAsos) }}>{nds == null ? t('QQS stavkasi kiritilmagan') : <FmtN val={ndsAsos + nds} />}</span>
          {uSof == null && <span className="fz-kpi__sub" style={{ color: 'var(--warn)' }}>{t('ustamasiz summadan hisoblandi')}</span>}
        </div>
      </div>

      <div className="fz-panel">
        <div className="fz-panel__h"><span>{format === 'storno' ? t('Storno va fakt bo‘yicha qayta') : t('Pozitsiya bo‘yicha farq')}</span><span>{uSof != null ? t('ustamali') : t('ustamasiz')}</span></div>
        <IkkiTomonQator nom={t('Sof natija')} sub={t('Pozitsiyalar soni: {n}', { n: n.jami.soni })} plus={heroA} minus={heroB} max={Math.max(heroA, heroB)} sof={heroA - heroB} baland={22} />
        <Eksa><Rang rang="var(--danger)" matn={format === 'storno' ? t('chap: olingan F2 (storno)') : t('chap: qaytarish kerak (−)')} /><Rang rang="var(--ok)" matn={format === 'storno' ? t('o‘ng: fakt bo‘yicha') : t('o‘ng: olish mumkin (+)')} /></Eksa>
        <span className="fz-kpi__sub">{t('Ikkala format natijasi bir xil')}: {t('fakt bo‘yicha')} <FmtN val={n.jami.kerak} /> − {t('olingan')} <FmtN val={n.jami.olingan} /> = +<FmtN val={n.jami.plus} /> − <FmtN val={n.jami.minus} /> = <b style={{ color: rangSof(n.jami.sof) }}><FmtN val={n.jami.sof} /></b> ({t('ustamasiz')})</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 'var(--space-4)' }}>
        <div className="fz-panel">
          <div className="fz-panel__h"><span>{t('Smetaga bog‘lanmagan olingan')} ({n.boglanmagan.length})</span><span>{t('to‘liq minus')}: −<FmtN val={n.jami.olinganBoglanmagan} /></span></div>
          {n.boglanmagan.length === 0 && <span style={{ color: 'var(--text-mute)', fontSize: 12 }}>{t('Yo‘q — barcha olingan F2 smeta pozitsiyalariga bog‘langan.')}</span>}
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            <table className="fz-table"><tbody>{n.boglanmagan.slice(0, 200).map((p) => (
              <tr key={p.qatorId}>
                <td>{p.kod ? `${p.kod} ` : ''}{p.nom}<div style={{ fontSize: 11, color: 'var(--text-mute)' }}>{boglanmaganNomi(p.boglanmaganSabab!)}{p.eslatma.includes('fakt_bor_smetada_yoq') ? ` · ${t('fakt bor')}` : ''}</div></td>
                <td className="fz-c-num"><FmtN val={p.f2Hajm} kasr={3} /> {p.birlik ?? ''}</td>
                <td className="fz-c-num" style={{ color: 'var(--danger)' }}>−<FmtN val={p.f2Summa} /></td>
              </tr>))}</tbody></table>
          </div>
        </div>
        <div className="fz-panel">
          <div className="fz-panel__h"><span>{t('Fakti yo‘q, lekin F2 olingan')} ({n.faktsizF2.length})</span><span>−<FmtN val={faktsizSumma} /></span></div>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('Bu pozitsiyalarda fakt belgilanmagan — fakt jurnalida qayta belgilang, so‘ng qayta hisoblang.')}</span>
          <div><button type="button" className="fz-btn fz-btn--sm" disabled={!n.faktsizF2.length} onClick={() => navigate(faktJurnalHavola(obyektId, bolim))}><ExternalLink /> {t('Fakt jurnalida ochish (filtr bilan)')}</button></div>
        </div>
      </div>

      {n.bolimlar.length > 1 && (
        <div className="fz-panel" style={{ overflowX: 'auto' }}>
          <div className="fz-panel__h"><span>{t('Razdellar bo‘yicha')} ({n.bolimlar.length})</span><span>{t('katta farqdan boshlab')} · {t('ustamasiz')}</span></div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {bolimTartib.map((b) => <IkkiTomonQator key={String(b.bolimId)} nom={b.yol[b.yol.length - 1] || t('Bo‘limsiz')} sub={b.yol.slice(0, -1).join(' › ') || undefined} plus={b.plus} minus={b.minus} max={bolimMax} sof={b.sof} baland={10} />)}
          </div>
        </div>
      )}

      <div className="fz-panel">
        <div className="fz-panel__h"><span>{t('Pereraschet F2 qoralamasi')}</span><span>{format === 'storno' ? t('ikki qoralama: storno va fakt bo‘yicha') : t('bitta qoralama: faqat farq')}</span></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 'var(--space-2)' }}>
          <Maydon nom={t('F2 raqami')}><input className="input" style={{ width: 110, height: 'var(--control-sm)', padding: '0 8px' }} value={raqam} onChange={(e) => setRaqam(e.target.value)} placeholder={t('12-П')} /></Maydon>
          <Maydon nom={t('Oy')}><input type="month" className="input" style={{ height: 'var(--control-sm)', padding: '0 8px' }} value={oy} onChange={(e) => setOy(e.target.value)} /></Maydon>
          <button type="button" disabled={!yukSoni || yozilmoqda} onClick={() => void qoralama()} className="fz-btn fz-btn--primary">
            <FilePlus2 /> {t('Pereraschet F2 qoralamasi')} ({yukSoni}; <FmtN val={yukJami} />)
          </button>
        </div>
        {format === 'farq' && farq.sigmadi.soni > 0 && <div className="fz-note fz-note--warn"><AlertTriangle /><span>{t('{n} pozitsiya qoralamaga sig‘madi (hajm farqi 0, faqat narx farqi: {s}) — ularni «To‘liq storno + qayta» formati qamraydi.', { n: String(farq.sigmadi.soni), s: farq.sigmadi.summa.toFixed(2) })}</span></div>}
        {format === 'storno' && storno.sigmadi.soni > 0 && <div className="fz-note fz-note--warn"><AlertTriangle /><span>{t('{n} pozitsiyada F2 hajmi 0, summasi bor — storno qoralamasiga kirmadi ({s}).', { n: String(storno.sigmadi.soni), s: storno.sigmadi.summa.toFixed(2) })}</span></div>}
        {masalalar.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>{masalalar.map((m, i) => <li key={i} style={{ color: m.daraja === 'blok' ? 'var(--danger)' : 'var(--warn)' }}>{m.matn}</li>)}</ul>}
      </div>

      <div className="fz-table-wrap" style={{ maxHeight: '60vh' }}>
        <table className="fz-table">
          <thead><tr>
            <th style={{ textAlign: 'left' }}>{t('Ish / resurs')}</th><th>{t('Birlik')}</th>
            <th style={{ textAlign: 'right' }}>{t('Smeta hajm')}</th><th style={{ textAlign: 'right' }}>{t('Fakt (hisobda)')}</th><th style={{ textAlign: 'right' }}>{t('F2 hajm')}</th>
            <th style={{ textAlign: 'right' }}>{t('Smeta narx')}</th><th style={{ textAlign: 'right' }}>{t('Bo‘lishi kerak')}</th><th style={{ textAlign: 'right' }}>{t('Olingan')}</th><th style={{ textAlign: 'right' }}>{t('Farq (ustamasiz)')}</th>
          </tr></thead>
          <tbody>
            {korinadi.map((p) => (
              <tr key={p.qatorId}>
                <td>{p.kod ? `${p.kod} ` : ''}{p.nom}
                  <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>{p.bolimYol.join(' › ')}</div>
                  {!p.boglangan && <div style={{ fontSize: 11, color: 'var(--warn)' }}>{t('Smetaga bog‘lanmagan')}: {boglanmaganNomi(p.boglanmaganSabab!)}</div>}
                  {p.eslatma.includes('smetadan_tashqari') && <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>{t('Smetadan tashqari fakt (pulga kirmaydi, DS kerak)')}</div>}
                  {p.faktsizF2 && <div style={{ fontSize: 11, color: 'var(--warn)' }}>{t('Fakti yo‘q, lekin F2 olingan')}</div>}</td>
                <td className="fz-c-unit" style={{ textAlign: 'center' }}>{p.birlik ?? '—'}</td>
                <td className="fz-c-num">{p.smetaHajm == null ? '—' : <FmtN val={p.smetaHajm} kasr={3} />}</td>
                <td className="fz-c-num">{p.boglangan ? <FmtN val={p.hisobFakt} kasr={3} /> : '—'}{p.eslatma.includes('fakt_norma') && <span style={{ marginLeft: 4, color: 'var(--warn)' }}>{t('norma')}</span>}</td>
                <td className="fz-c-num"><FmtN val={p.f2Hajm} kasr={3} /></td>
                <td className="fz-c-num">{p.smetaNarx == null ? '—' : <FmtN val={p.smetaNarx} />}</td>
                <td className="fz-c-num"><FmtN val={p.kerak} /></td>
                <td className="fz-c-num"><FmtN val={p.f2Summa} /></td>
                <td className="fz-c-num" style={{ fontWeight: 600, color: rangSof(p.farq) }}><FmtN val={p.farq} /><div><MiniFarq sof={p.farq} max={sahifaMax} /></div></td>
              </tr>
            ))}
            {!korinadi.length && <tr><td colSpan={9} style={{ color: 'var(--text-mute)' }}>{t('Pereraschetga tushadigan qator topilmadi.')}</td></tr>}
          </tbody>
        </table>
      </div>
      {sahifaSoni > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 12 }}>
          <button type="button" disabled={sahifa === 0} onClick={() => setSahifa((x) => x - 1)} className="fz-btn fz-btn--sm">{t('Oldingi')}</button>
          <span>{sahifa + 1} / {sahifaSoni}</span>
          <button type="button" disabled={sahifa + 1 >= sahifaSoni} onClick={() => setSahifa((x) => x + 1)} className="fz-btn fz-btn--sm">{t('Keyingi')}</button>
        </div>
      )}

      {n.tekshirish.length > 0 && (
        <details className="fz-note fz-note--warn" style={{ display: 'block' }}>
          <summary style={{ cursor: 'pointer' }}>{t('Tekshirish kerak (pulga kirmagan)')}: {n.tekshirish.length} · {t('olingan')} <FmtN val={n.tekshirOlingan} /></summary>
          <div className="fz-table-wrap" style={{ marginTop: 8, maxHeight: 320 }}>
            <table className="fz-table"><tbody>{n.tekshirish.slice(0, 300).map((p) => (
              <tr key={p.qatorId}>
                <td>{p.kod ? `${p.kod} ` : ''}{p.nom}<div style={{ fontSize: 11, color: 'var(--text-mute)' }}>{p.bolimYol.join(' › ')}</div></td>
                <td className="fz-c-unit">{p.birlik ?? '—'}</td>
                <td className="fz-c-num"><FmtN val={p.f2Hajm} kasr={3} /> / <FmtN val={p.faktHajm} kasr={3} /></td>
                <td style={{ color: 'var(--warn)' }}>{p.tekshir.map(tekshirNomi).join('; ')}</td>
                <td className="fz-c-num"><FmtN val={p.f2Summa} /></td>
              </tr>))}</tbody></table>
          </div>
        </details>
      )}
    </div>
  );
}
