/**
 * PERERASCHET bo'limi (Nakopitelniy sahifasida; egasi 2026-10-25): «pereraschet qilsang shuncha pul ziyod olasan yoki
 * shuncha minus kirasan». Hisob — `lib/pereraschet.ts` (sof), hujjat — `lib/pereraschet-export.ts`.
 * Faqat O'QIYDI: asl smeta va tasdiqlangan aktlar o'zgarmaydi. «Tuzatuvchi F2 qoralamasi» — oddiy F2 qoralama
 * (t2_akt_yarat_v2), tasdiqlash egasida (F2 tarixida); avtomatik yozish yo'q.
 */
import { Fragment, useMemo, useRef, useState, type CSSProperties } from 'react';
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
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { QiymatUchlik } from '../../umumiy/ui/QiymatUchlik';
import { Maydon } from '../../umumiy/ui/Sahifa';
import { tasdiqSora } from '../../umumiy/ui/Tasdiq';
import { IkkiTomonQator, MiniFarq, Eksa, Rang } from '../../components/nakopitelniy/PereraschetGrafik';
import { useObyektF2Aktlari } from './F2DublikatPanel';
import { katKesimYigish, qiymatUchligi, uchlikAyir, type KatKesim } from '../../lib/ustamali-summa';
import { PereraschetFakt } from './PereraschetFakt';
import { SummaYorliq } from '../../umumiy/ui/QiymatUchlik';

const SAHIFA = 100;
const bandNomi = (b: BandTur) => ({ ortiqcha: t('Ortiqcha olingan'), narx_farqi: t('Narx farqi'), olinmagan: t('Olinmay qolgan (faktda bor)'), chegirma: t('Chegirma (исключать) — asosiy ishga mutanosib emas') })[b];
const tekshirNomi = (s: TekshirSabab) => ({
  birlik_shubha: t('Birlik shubhasi (nisbat 5 martadan ortiq)'),
  smeta_hajm_yoq: t('Smetada hajm yo‘q yoki 0'),
  narx_yoq: t('Smeta narxi yo‘q'),
  chegirma_asosiy_yoq: t('Chegirma qatori — asosiy ishi topilmadi'),
  eski_smeta: t('«(ekspertizagacha)» bo‘lim — tuzatish bilan yopilmagan'),
  zamena: t('Zamena juftligi'),
  f2_hajmsiz_summa: t('F2 hajmi 0, tasdiqlangan summa bor — aktlarni tekshiring'),
  f2_summa_yoq: t('F2 summasi noma’lum — narx farqi hisoblanmadi'),
})[s];
const RANG: Record<string, string> = { '1': 'var(--ok)', '-1': 'var(--danger)' };
const rangSof = (x: number) => RANG[String(Math.sign(x))] ?? 'var(--text-dim)';

export function PereraschetBolimi({ companyId, obyektId, obyektNom, tomonlar, ndsFoiz }: {
  companyId: number; obyektId: number; obyektNom: string; tomonlar: ImzoNomlar; ndsFoiz: number | null;
}) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<PQator[] | null>(null);
  const [zamena, setZamena] = useState<{ z: Set<number>; a: Set<number> }>({ z: new Set(), a: new Set() });
  /** Rejim: «F2 vs smeta» (mavjud) yoki «Fakt bo'yicha qayta hisob» (egasi 2026-10-26). */
  const [rejim, setRejim] = useState<'smeta' | 'fakt'>('smeta');
  const [qoshimcha, setQoshimcha] = useState<Set<number>>(new Set());
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
      const [h, z, qs] = await Promise.all([
        t2ToliqOqiParallel<PQator>(sbOqi, { jadval: 't2_qator_holat', filtr: 'obyekt_id=eq.' + obyektId, ustunlar: PERERASCHET_USTUNLAR, limit: 200000 }, 'qator_id'),
        sbOqi<{ id: number; replaces_line_id: number | null }>({ jadval: 't2_qator', filtr: `obyekt_id=eq.${obyektId}&replaces_line_id=not.is.null`, ustunlar: 'id,replaces_line_id', limit: 20000 }),
        t2ToliqOqiParallel<{ id: number }>(sbOqi, { jadval: 't2_qator', filtr: `obyekt_id=eq.${obyektId}&qoshimcha=is.true`, ustunlar: 'id', limit: 200000 }, 'id'),
      ]);
      if (!h.ok || h.toliq === false) { setXato(t('Smeta qatorlari to‘liq o‘qilmadi — pereraschet chala ma’lumot ustida hisoblanmaydi.')); setRows(null); return; }
      if (!z.ok) { setXato(t('Zamena bog‘lanishlari o‘qilmadi — qayta urinib ko‘ring.')); setRows(null); return; }
      if (!qs.ok || qs.toliq === false) { setXato(t('Qo‘shimcha (smetadan tashqari) qatorlar o‘qilmadi — qayta urinib ko‘ring.')); setRows(null); return; }
      setQoshimcha(new Set((qs.qatorlar ?? []).map((x) => Number(x.id))));
      const zs = new Set<number>(); const as = new Set<number>();
      for (const x of z.qatorlar ?? []) { zs.add(Number(x.id)); if (x.replaces_line_id != null) as.add(Number(x.replaces_line_id)); }
      setZamena({ z: zs, a: as });
      setRows(h.qatorlar ?? []);
      setTanlangan(new Set()); setSahifa(0);
    } catch { setXato(t('Ma’lumotni yuklab bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring.')); }
    finally { setBusy(false); }
  };

  const bolimlar = useMemo(() => (rows ? pereraschetBolimlari(rows) : []), [rows]);
  const yaxlitIdlari = ustama.yaxlitIdlari;
  const yaxlitIdlar = useMemo(() => (rows ? yaxlitIdlari?.(rows.map((r) => ({ id: r.qator_id, ota_id: r.ota_id }))) : undefined), [rows, yaxlitIdlari]);
  const natija = useMemo(() => (rows ? pereraschetHisobla(rows, { zamenaIdlar: zamena.z, aslIdlar: zamena.a, bolimId: bolim, yaxlitIdlar }) : null), [rows, zamena, bolim, yaxlitIdlar]);
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
  /** Sof natija uchligi (egasi 2026-10-27): QQS bilan asosiy — koeffitsientlar kaskadidan (stavka qo'lda emas). */
  const sofUchlik = natija ? uchlikAyir(qiymatUchligi(ustama.hisobla(natija.plusKesim), natija.jami.plus), qiymatUchligi(ustama.hisobla(natija.minusKesim), natija.jami.minus)) : null;

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
    if (!(await tasdiqSora({ matn: [t('Tanlangan {n} qatordan tuzatuvchi F2 QORALAMASI yaratiladi (tasdiqlash — F2 tarixida, egasi tomonidan). Davom etasizmi?', { n: String(yuk.length) }), ...ogoh].join('\n\n') }))) return;
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
      <tr style={{ background: 'var(--surface-2)' }}><td colSpan={9}>
        {!tarix && <span style={{ color: 'var(--text-mute)' }}>{t('Yuklanmoqda…')}</span>}
        {!!tarix && !t2.length && <span style={{ color: 'var(--text-mute)' }}>{t('Bu qator F2 aktlarida topilmadi.')}</span>}
        {!!tarix && t2.length > 0 && (
          <table className="fz-table"><thead><tr><th>{t('Akt')}</th><th>{t('Oy')}</th><th>{t('Holat')}</th><th style={{ textAlign: 'right' }}>{t('Hajm')}</th><th style={{ textAlign: 'right' }}>{t('Narx')}</th><th style={{ textAlign: 'right' }}>{t('Summa')}</th></tr></thead>
            <tbody>{t2.map((x) => <tr key={x.akt_qator_id}><td>№ {x.raqam ?? '—'} (#{x.akt_id})</td><td>{String(x.oy).slice(0, 7)}</td><td>{x.akt_holat}</td>
              <td className="fz-c-num"><FmtN val={x.certified_quantity ?? x.hajm} kasr={3} /></td>
              <td className="fz-c-num">{(x.certified_unit_price ?? x.narx) == null ? '—' : <FmtN val={(x.certified_unit_price ?? x.narx)!} />}</td>
              <td className="fz-c-num">{(x.certified_amount ?? x.summa) == null ? '—' : <FmtN val={(x.certified_amount ?? x.summa)!} />}</td></tr>)}</tbody></table>
        )}
      </td></tr>
    );
  };

  const bandMax = natija ? Math.max(0, ...(Object.values(natija.turBoyicha) as Array<{ plus: number; minus: number }>).flatMap((x) => [x.plus, x.minus])) : 0;
  const bolimTartib = useMemo(() => (natija ? [...natija.bolimlar].sort((a, b) => Math.abs(b.sof) - Math.abs(a.sof)).slice(0, 60) : []), [natija]);
  const bolimMax = Math.max(0, ...bolimTartib.flatMap((b) => [b.plus, b.minus]));
  const sahifaMax = Math.max(0, ...korinadi.map((q) => Math.abs(q.sof)));
  const heroPlus = uPlus ?? natija?.jami.plus ?? 0;
  const heroMinus = uMinus ?? natija?.jami.minus ?? 0;
  const heroSof = uSof ?? natija?.jami.sof ?? 0;
  const ustamaBor = uPlus != null && uMinus != null;
  const th: CSSProperties = { textAlign: 'left' };
  const thN: CSSProperties = { textAlign: 'right' };

  return (
    <section className="fz-card" data-testid="pereraschet" aria-label={t('Pereraschet')}>
      <div className="fz-card__head" style={{ flexWrap: 'wrap' }}>
        <div>
          <h2 className="fz-card__title">{t('Pereraschet — ortiqcha olingan / olinmay qolgan hajm va narx farqi')}</h2>
          <p className="fz-card__sub">{t('Qayta hisoblansa: qancha ortiqcha olish mumkin yoki qancha qaytarish kerak. Faqat o‘qiydi — smeta va tasdiqlangan aktlar o‘zgarmaydi.')}</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-2)' }}>
          <div role="group" aria-label={t('Pereraschet rejimi')} style={{ display: 'inline-flex', gap: 2 }}>
            <button type="button" aria-pressed={rejim === 'smeta'} className={`fz-btn fz-btn--sm ${rejim === 'smeta' ? 'fz-btn--primary' : ''}`} onClick={() => setRejim('smeta')}>{t('F2 vs smeta')}</button>
            <button type="button" aria-pressed={rejim === 'fakt'} className={`fz-btn fz-btn--sm ${rejim === 'fakt' ? 'fz-btn--primary' : ''}`} onClick={() => setRejim('fakt')}>{t('Fakt bo‘yicha qayta hisob')}</button>
          </div>
          {rows && (
            <select aria-label={t('Uchastka / razdel')} className="input" style={{ height: 'var(--control-md)', padding: '0 8px', maxWidth: 300 }} value={bolim ?? ''}
              onChange={(e) => { setBolim(e.target.value ? Number(e.target.value) : null); setSahifa(0); setTanlangan(new Set()); }}>
              <option value="">{t('Butun obyekt')}</option>
              {bolimlar.map((b) => <option key={b.id} value={b.id}>{' '.repeat(b.daraja * 3)}{b.nom}</option>)}
            </select>
          )}
          {natija && rejim === 'smeta' && (
            <button type="button" className="fz-btn" onClick={() => void excel()}>
              <Download /> {t('Pereraschet (Excel)')}
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => void yukla()} className="fz-btn fz-btn--primary">
            <Calculator /> {rows ? t('Qayta hisoblash') : t('Pereraschetni hisoblash')}
          </button>
        </div>
      </div>
      <div className="fz-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {busy && <p role="status" style={{ margin: 0 }}>{t('Smeta qatorlari o‘qilmoqda…')}</p>}
        {xato && <div role="alert" className="fz-note fz-note--danger"><AlertTriangle /><span>{xato}</span></div>}
        {!natija && !busy && !xato && <div className="fz-note fz-note--info"><span>{t('Hisoblash tugmasini bosing: har bir smeta qatori fakt va tasdiqlangan F2 bilan solishtiriladi.')}</span></div>}

        {rows && rejim === 'fakt' && (
          <PereraschetFakt companyId={companyId} obyektId={obyektId} obyektNom={obyektNom} tomonlar={tomonlar} ndsFoiz={ndsFoiz}
            rows={rows} qoshimcha={qoshimcha} bolim={bolim} bolimNomi={bolimNomi} aktlar={aktlar} onYaratildi={() => setYangila((x) => x + 1)} />
        )}

        {natija && rejim === 'smeta' && (
          <>
            <div className="fz-kpis">
              <div className="fz-kpi">
                <span className="fz-kpi__label"><i style={{ background: 'var(--ok)' }} />{t('Olish mumkin (+)')}</span>
                <SummaJuft obyektId={obyektId} kompaniyaId={companyId} ustamasiz={natija.jami.plus} katKesim={natija.plusKesim} />
              </div>
              <div className="fz-kpi">
                <span className="fz-kpi__label"><i style={{ background: 'var(--danger)' }} />{t('Qaytarish kerak (−)')}</span>
                <SummaJuft obyektId={obyektId} kompaniyaId={companyId} ustamasiz={natija.jami.minus} katKesim={natija.minusKesim} />
              </div>
              <div className="fz-kpi">
                <span className="fz-kpi__label"><i style={{ background: rangSof(sofUchlik?.qqsBilan ?? natija.jami.sof) }} />{t('Sof natija')}</span>
                {sofUchlik && <QiymatUchlik q={{ ...sofUchlik, ustamasiz: natija.jami.sof }} rang={sofUchlik.qqsBilan == null ? undefined : rangSof(sofUchlik.qqsBilan)} />}
              </div>
            </div>

            <div className="fz-panel">
              <div className="fz-panel__h"><span>{t('Umumiy natija: plyus va minus')}</span><span>{ustamaBor ? t('ustamali') : t('ustamasiz')}</span></div>
              <IkkiTomonQator nom={t('Sof natija')} sub={t('Qatorlar soni: {n}', { n: natija.jami.soni })} plus={heroPlus} minus={heroMinus} max={Math.max(heroPlus, heroMinus)} sof={heroSof} baland={22} />
              <Eksa><Rang rang="var(--danger)" matn={t('chap: qaytarish kerak (−)')} /><Rang rang="var(--ok)" matn={t('o‘ng: olish mumkin (+)')} /></Eksa>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: 'var(--space-4)' }}>
              <div className="fz-panel" style={{ overflowX: 'auto' }}>
                <div className="fz-panel__h"><span>{t('Sabab bo‘yicha')}</span><span>{t('ustamasiz')}</span></div>
                {(Object.keys(natija.turBoyicha) as BandTur[]).map((b) => (
                  <IkkiTomonQator key={b} nom={bandNomi(b)} plus={natija.turBoyicha[b].plus} minus={natija.turBoyicha[b].minus} max={bandMax} sof={natija.turBoyicha[b].plus - natija.turBoyicha[b].minus} />
                ))}
                {natija.faktNormaPlus > 0 && <span className="fz-kpi__sub" style={{ color: 'var(--warn)' }}>{t('shundan BL norma bo‘yicha fakt')}: <FmtN val={natija.faktNormaPlus} /></span>}
                <span className="fz-kpi__sub" style={{ color: 'var(--warn)' }}>{t('Tekshirish kerak (pulga kirmagan)')}: {natija.tekshirTaxminiy.soni} · ≈ +<FmtN val={natija.tekshirTaxminiy.plus} /> / −<FmtN val={natija.tekshirTaxminiy.minus} /></span>
              </div>
              {natija.bolimlar.length > 1 && (
                <div className="fz-panel" style={{ overflowX: 'auto' }}>
                  <div className="fz-panel__h"><span>{t('Razdellar bo‘yicha')} ({natija.bolimlar.length})</span><span>{t('katta farqdan boshlab')}</span></div>
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {bolimTartib.map((b) => (
                      <IkkiTomonQator key={String(b.bolimId)} nom={b.yol[b.yol.length - 1] || t('Bo‘limsiz')} sub={b.yol.slice(0, -1).join(' › ') || undefined} plus={b.plus} minus={b.minus} max={bolimMax} sof={b.sof} baland={10} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="fz-panel">
              <div className="fz-panel__h"><span>{t('Tuzatuvchi F2 qoralamasi')}</span><span>{t('tanlangan: {n}', { n: tanlangan.size })}</span></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 'var(--space-2)' }}>
                <button type="button" className="fz-btn fz-btn--sm" onClick={() => hammasi('minus')}>{t('Barcha minuslarni tanlash')}</button>
                <button type="button" className="fz-btn fz-btn--sm" onClick={() => hammasi('plus')}>{t('Barcha pluslarni tanlash')}</button>
                <button type="button" className="fz-btn fz-btn--sm fz-btn--ghost" onClick={() => hammasi('yoq')}>{t('Tanlovni tozalash')}</button>
                <span style={{ flex: 1 }} />
                <Maydon nom={t('F2 raqami')}><input className="input" style={{ width: 110, height: 'var(--control-sm)', padding: '0 8px' }} value={raqam} onChange={(e) => setRaqam(e.target.value)} placeholder={t('12-П')} /></Maydon>
                <Maydon nom={t('Oy')}><input type="month" className="input" style={{ height: 'var(--control-sm)', padding: '0 8px' }} value={oy} onChange={(e) => setOy(e.target.value)} /></Maydon>
                <button type="button" disabled={!yuk.length || yozilmoqda} onClick={() => void qoralama()} className="fz-btn fz-btn--primary">
                  <FilePlus2 /> {t('Tuzatuvchi F2 qoralamasi')} ({yuk.length}; <FmtN val={yukJami} />)
                </button>
              </div>
              {masalalar.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>{masalalar.map((m, i) => <li key={i} style={{ color: m.daraja === 'blok' ? 'var(--danger)' : 'var(--warn)' }}>{m.matn}</li>)}</ul>}
            </div>

            <div className="fz-table-wrap" style={{ maxHeight: '60vh' }}>
              <table className="fz-table">
                <thead><tr>
                  <th style={{ width: 28 }} /><th style={th}>{t('Ish / resurs')}</th><th>{t('Birlik')}</th>
                  <th style={thN}>{t('Smeta hajm')}</th><th style={thN}>{t('Fakt')}</th><th style={thN}>{t('F2 hajm')}</th>
                  <th style={thN}>{t('Smeta narx / F2 narx')}<SummaYorliq tur="narx" /></th><th style={th}>{t('Sabab')}</th><th style={thN}>{t('Summa (ustamasiz)')}</th>
                </tr></thead>
                <tbody>
                  {korinadi.map((q) => (
                    <Fragment key={q.qatorId}>
                      <tr style={{ cursor: 'pointer' }} onClick={() => void tarixOch(q.qatorId)}>
                        <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={t('Tanlash')} checked={tanlangan.has(q.qatorId)} onChange={() => belgila(q.qatorId)} /></td>
                        <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{ochiq === q.qatorId ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{q.kod ? `${q.kod} ` : ''}{q.nom}</span>
                          <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>{q.bolimYol.join(' › ')}</div></td>
                        <td className="fz-c-unit" style={{ textAlign: 'center' }}>{q.birlik ?? '—'}</td>
                        <td className="fz-c-num">{q.smetaHajm == null ? '—' : <FmtN val={q.smetaHajm} kasr={3} />}</td>
                        <td className="fz-c-num"><FmtN val={q.faktHajm} kasr={3} />{q.eslatma.includes('fakt_norma') && <span style={{ marginLeft: 4, color: 'var(--warn)' }} title={t('Fakt ish (BL) faktidan norma bo‘yicha hosila')}>{t('norma')}</span>}</td>
                        <td className="fz-c-num"><FmtN val={q.f2Hajm} kasr={3} /></td>
                        <td className="fz-c-num">{q.smetaNarx == null ? '—' : <FmtN val={q.smetaNarx} />} / {q.f2Narx == null ? '—' : <FmtN val={q.f2Narx} />}</td>
                        <td style={{ fontSize: 12 }}>{q.bandlar.map((b) => <div key={b.tur} style={{ color: rangSof(b.summa) }}>{bandNomi(b.tur)}: <FmtN val={b.summa} /></div>)}
                          {q.chegirma?.asosiy && <div style={{ color: 'var(--text-mute)' }}>{t('Asosiy ish {kod}: F2 {x}% olingan, chegirma {y}% qo‘llangan', { kod: q.chegirma.asosiy.kod ?? '', x: (Math.min(1, Math.max(0, q.chegirma.asosiy.ulush)) * 100).toFixed(1), y: (q.chegirma.y * 100).toFixed(1) })}</div>}
                          {q.eslatma.includes('smetadan_tashqari') && <div style={{ color: 'var(--text-mute)' }}>{t('Smetadan tashqari fakt (pulga kirmaydi, DS kerak)')}</div>}
                          {q.eslatma.includes('narx_farqi_hisoblanmadi') && <div style={{ color: 'var(--text-mute)' }}>{t('F2 summasi noma’lum — narx farqi hisoblanmadi')}</div>}</td>
                        <td className="fz-c-num" style={{ fontWeight: 600, color: rangSof(q.sof) }}>
                          <FmtN val={q.sof} />
                          <div><MiniFarq sof={q.sof} max={sahifaMax} /></div>
                        </td>
                      </tr>
                      {ochiq === q.qatorId && tarixRow(q)}
                    </Fragment>
                  ))}
                  {!korinadi.length && <tr><td colSpan={9} style={{ color: 'var(--text-mute)' }}>{t('Pereraschetga tushadigan qator topilmadi.')}</td></tr>}
                </tbody>
              </table>
            </div>
            {sahifaSoni > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 12 }}>
                <button type="button" disabled={sahifa === 0} onClick={() => setSahifa((p) => p - 1)} className="fz-btn fz-btn--sm">{t('Oldingi')}</button>
                <span>{sahifa + 1} / {sahifaSoni}</span>
                <button type="button" disabled={sahifa + 1 >= sahifaSoni} onClick={() => setSahifa((p) => p + 1)} className="fz-btn fz-btn--sm">{t('Keyingi')}</button>
              </div>
            )}

            {natija.tekshirish.length > 0 && (
              <details className="fz-note fz-note--warn" style={{ display: 'block' }}>
                <summary style={{ cursor: 'pointer' }}>{t('Tekshirish kerak (pulga kirmagan)')}: {natija.tekshirish.length}</summary>
                <div className="fz-table-wrap" style={{ marginTop: 8, maxHeight: 320 }}>
                  <table className="fz-table"><tbody>{natija.tekshirish.slice(0, 300).map((q) => (
                    <tr key={q.qatorId}>
                      <td>{q.kod ? `${q.kod} ` : ''}{q.nom}<div style={{ fontSize: 11, color: 'var(--text-mute)' }}>{q.bolimYol.join(' › ')}</div>
                        {q.tekshir.some((s) => s === 'f2_hajmsiz_summa' || s === 'f2_summa_yoq') && <div className="mt-1 flex flex-wrap items-start gap-2 text-[11px] text-text-mute">
                          <span>{t('Tasdiqlangan F2 summasi')}</span>
                          <SummaJuft kichik obyektId={obyektId} kompaniyaId={companyId} ustamasiz={q.f2Summa} katKesim={katKesimYigish([q], (r) => r.kat, (r) => r.f2Summa)} />
                        </div>}
                      </td>
                      <td className="fz-c-unit">{q.birlik ?? '—'}</td>
                      <td className="fz-c-num">{q.smetaHajm == null ? '—' : <FmtN val={q.smetaHajm} kasr={3} />} / <FmtN val={q.f2Hajm} kasr={3} /></td>
                      <td style={{ color: 'var(--warn)' }}>{q.tekshir.map(tekshirNomi).join('; ')}</td>
                      <td className="fz-c-num" style={{ color: rangSof(q.sof) }}>{q.sof ? <>≈ <FmtN val={q.sof} /></> : '—'}</td>
                    </tr>))}</tbody></table>
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </section>
  );
}
