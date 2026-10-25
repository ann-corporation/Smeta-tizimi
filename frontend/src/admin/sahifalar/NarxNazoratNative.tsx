import { ObyektOptionlari } from '../../umumiy/ui/ObyektOptionlari';
import { MarketPriceComparison } from '../../components/smeta-studio-pro/MarketPriceComparison';
/**
 * NarxNazoratNative.tsx — NARX NAZORATI (Price Control), Holat.tsx ichiga
 * ulangan real ekran (T2-PTO-DAILY-FINAL-CUTOVER-008 P0.9). Adapted from
 * test02/TestNarxNazorati.tsx (o'sha yerdagi mantiq o'zgarishsiz) --
 * AdditionalReplacementNative/ResursVedomostNative bilan bir xil naqsh:
 * o'z obyekt selectoriga ega, Holat.tsx'ning GAS-nom asosidagi daraxtidan
 * MUSTAQIL, canonical numeric obyekt_id orqali ishlaydi.
 *
 * BU PROCUREMENT SAVING EMAS. F2 qaysi narxda sertifikatlangani
 * (t2_akt_qator.certified_unit_price) va shu qator uchun REFERENCE narx
 * (smeta baseline snapshot, F2 yaratilgan payt muzlagan) orasidagi farqni
 * ko'rsatadi. Narx reference'dan YUQORI bo'lsa — bu "foyda" emas,
 * PRICE JUSTIFICATION (basis/protokol) nazorati.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ShieldAlert, Lock, TriangleAlert, FileWarning, Loader2, RefreshCw, Info } from 'lucide-react';
import { t } from '../../i18n/til';
import { NARX_MUHR } from '../../umumiy/daraxt/narx-muhr';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { sbT2ObyektlarOlKomp } from '../../api/supabase';
import { priceControlOl, PRICE_STATE_BADGE, type PriceControlLine } from '../../api/t2-price-control';

type Filtr = 'hammasi' | 'muzlagan' | 'xavf_ostida' | 'yuqori_narx' | 'protokolsiz';

export default function NarxNazoratNative({ obyektId: fixedObjectId }: { obyektId?: number } = {}) {
  const { joriy, yuklanmoqda: kompYuk } = useKompaniya();
  const [obyektlar, setObyektlar] = useState<{ id: number; nom: string }[]>([]);
  const [obyektId, setObyektId] = useState<number | null>(fixedObjectId ?? null);
  const [qatorlar, setQatorlar] = useState<PriceControlLine[] | null>(null);
  const [yuk, setYuk] = useState(false);
  const [xato, setXato] = useState('');
  const [filtr, setFiltr] = useState<Filtr>('hammasi');

  useEffect(() => {
    if (!joriy?.id) return;
    sbT2ObyektlarOlKomp(joriy.id).then((r) => {
      if (r.ok) setObyektlar((r.qatorlar as { id: number; nom: string }[]) || []);
    });
  }, [joriy?.id]);

  useEffect(() => {
    setObyektId(fixedObjectId ?? null);
  }, [fixedObjectId]);

  const yukla = () => {
    if (!obyektId) return;
    setYuk(true); setXato('');
    priceControlOl(obyektId).then((r) => {
      setYuk(false);
      if (!r.ok) { setXato(r.error || 'Yuklanmadi'); setQatorlar(null); return; }
      setQatorlar(r.qatorlar);
    });
  };
  useEffect(() => { if (obyektId) yukla(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [obyektId]);

  const jami = useMemo(() => {
    const q = qatorlar || [];
    return {
      muzlagan: q.reduce((a, x) => a + (x.frozen_amount || 0), 0),
      xavf: q.reduce((a, x) => a + (x.at_risk_amount || 0), 0),
      yuqoriBasisTalab: q.filter((x) => x.price_state === 'ABOVE_REFERENCE_MISSING_BASIS').length,
      protokolsiz: q.filter((x) => x.price_state === 'ABOVE_REFERENCE_MISSING_BASIS' || x.price_state === 'ABOVE_APPROVED_BASIS').length,
    };
  }, [qatorlar]);

  const suzilgan = useMemo(() => {
    const q = qatorlar || [];
    switch (filtr) {
      case 'muzlagan': return q.filter((x) => x.frozen_amount > 0);
      case 'xavf_ostida': return q.filter((x) => x.at_risk_amount > 0);
      case 'yuqori_narx': return q.filter((x) => x.price_state === 'ABOVE_APPROVED_BASIS' || x.price_state === 'ABOVE_REFERENCE_MISSING_BASIS');
      case 'protokolsiz': return q.filter((x) => x.price_state === 'ABOVE_REFERENCE_MISSING_BASIS');
      default: return q;
    }
  }, [qatorlar, filtr]);

  const pul = (n: number | null | undefined) => n == null ? '—' : Math.round(n).toLocaleString('uz-UZ');

  if (kompYuk) return <div className="p-6 text-sm text-text-dim flex items-center gap-2"><Loader2 className="animate-spin" size={15} /> {t('yuklanmoqda…')}</div>;

  const yuqori = (qatorlar || []).filter((x) => x.price_state === 'ABOVE_APPROVED_BASIS' || x.price_state === 'ABOVE_REFERENCE_MISSING_BASIS' || x.price_state === 'ABOVE_REFERENCE_JUSTIFIED').length;
  /* Filtr kartalari: bosilganda jadval shu bo'yicha suziladi (qayta bosilsa — barchasi). */
  const kartalar: ReadonlyArray<{ id: Filtr; nom: string; qiymat: string | number; ikon: ReactNode; ton?: string }> = [
    { id: 'muzlagan', nom: 'Jami muzlagan summa', qiymat: pul(jami.muzlagan), ikon: <Lock size={13} aria-hidden="true" />, ton: 'var(--info)' },
    { id: 'xavf_ostida', nom: 'Hozir xavf ostidagi summa', qiymat: pul(jami.xavf), ikon: <TriangleAlert size={13} aria-hidden="true" />, ton: 'var(--warn)' },
    { id: 'yuqori_narx', nom: 'Reference‘dan yuqori F2', qiymat: yuqori, ikon: <ShieldAlert size={13} aria-hidden="true" /> },
    { id: 'protokolsiz', nom: 'Basis/protokolsiz qatorlar', qiymat: jami.protokolsiz, ikon: <FileWarning size={13} aria-hidden="true" />, ton: 'var(--danger)' },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Obyekt ish joyida (obyektId berilgan) katalog taqqoslashni ota sahifa o'zi ko'rsatadi — ikki marta chizilmasin. */}
      {!fixedObjectId && <MarketPriceComparison objectId={obyektId} companyId={joriy?.id ?? null} />}
      <div className="flex items-center gap-3 flex-wrap">
        {!fixedObjectId && <h2 className="text-[14px] font-semibold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}><ShieldAlert size={15} className="text-accent" aria-hidden="true" /> {t('Narx nazorati')}</h2>}
        {!fixedObjectId && <select className="h-8 rounded-md border border-[var(--border-strong)] bg-surface-2 px-2 text-[12px]" value={obyektId ?? ''} onChange={(e) => setObyektId(Number(e.target.value) || null)}>
          <option value="">{t('— obyekt tanlang —')}</option>
          <ObyektOptionlari obyektlar={obyektlar} kompaniyaId={joriy?.id} />
        </select>}
        {obyektId && <button type="button" className="fz-btn fz-btn--sm fz-btn--ghost" onClick={yukla} disabled={yuk}>
          <RefreshCw className={yuk ? 'animate-spin' : ''} aria-hidden="true" /> {t('yangilash')}
        </button>}
      </div>

      <div className="fz-note fz-note--info max-w-3xl">
        <Info aria-hidden="true" />
        <div>
          <b>{t('Bu xarid tejami emas.')}</b>{' '}
          {t('F2 qaysi narxda sertifikatlangani va shu qator uchun reference (smeta baseline, F2 yaratilgan payt muzlagan) narx orasidagi farq ko‘rsatiladi.')}
          <ul className="mt-1.5 flex flex-col gap-1">
            <li><span className="fz-stamp fz-stamp--info" style={{ marginRight: 6 }}>{t('Muzlagan')}</span>{t('past narxda yopilgan qism')}</li>
            <li><span className="fz-stamp fz-stamp--warn" style={{ marginRight: 6 }}>{t('Xavf ostida')}</span>{t('hali tasdiqlanmagan qism')}</li>
            <li><span className="fz-stamp fz-stamp--danger" style={{ marginRight: 6 }}>{t('Basis kerak')}</span>{t('narx reference‘dan yuqori — bu foyda emas, asos (protokol) nazorati')}</li>
          </ul>
        </div>
      </div>

      {!obyektId && <div className="fz-note"><Info aria-hidden="true" />{t('Obyekt tanlanmagan.')}</div>}

      {obyektId && (
        <>
          <div className="fz-kpis">
            {kartalar.map((k) => (
              <button key={k.id} type="button" aria-pressed={filtr === k.id} onClick={() => setFiltr(filtr === k.id ? 'hammasi' : k.id)}
                className="fz-kpi rounded-md border bg-surface p-3 text-left"
                style={{ cursor: 'pointer', borderColor: filtr === k.id ? 'var(--accent)' : 'var(--border)', boxShadow: filtr === k.id ? '0 0 0 1px var(--accent)' : undefined }}>
                <span className="fz-kpi__label"><span style={{ color: k.ton ?? 'var(--text-dim)', display: 'inline-flex' }}>{k.ikon}</span>{t(k.nom)}</span>
                <span className="fz-kpi__value">{k.qiymat}</span>
              </button>
            ))}
          </div>

          {filtr !== 'hammasi' && (
            <button type="button" className="fz-btn fz-btn--sm fz-btn--ghost self-start" onClick={() => setFiltr('hammasi')}>← {t('barcha qatorlarni ko‘rsatish')}</button>
          )}

          {yuk && <div className="text-[12px] text-text-dim flex items-center gap-2"><Loader2 className="animate-spin" size={13} /> {t('yuklanmoqda…')}</div>}
          {xato && <div role="alert" className="fz-note fz-note--danger"><TriangleAlert aria-hidden="true" />{xato}</div>}

          {!yuk && !xato && qatorlar && qatorlar.length === 0 && (
            <div className="fz-note">
              <Info aria-hidden="true" />
              <span>{t('Bu obyektda hali tasdiqlangan (exact-source, v2) F2 qatori yo‘q — narx nazorati faqat')} <code>t2_akt_yarat_v2</code> {t('orqali yaratilgan F2 qatorlar uchun ishlaydi.')}</span>
            </div>
          )}

          {!yuk && suzilgan.length > 0 && (
            <div className="fz-table-wrap">
              <table className="fz-table min-w-[860px]">
                <thead>
                  <tr>
                    <th>{t('Kod')}</th><th>{t('Nom')}</th>
                    <th className="fz-c-num">{t('Reference narx')}</th>
                    <th className="fz-c-num">F2 {t('narx')}</th>
                    <th className="fz-c-num">{t('Farq')}</th>
                    <th className="fz-c-num">{t('Muzlagan')}</th>
                    <th className="fz-c-num">{t('Xavf ostida')}</th>
                    <th>{t('Holat')}</th>
                  </tr>
                </thead>
                <tbody>
                  {suzilgan.map((q) => {
                    const b = PRICE_STATE_BADGE[q.price_state];
                    const muhr = NARX_MUHR[q.price_state];
                    return (
                      <tr key={q.qator_id}>
                        <td className="fz-c-shifr">{q.kod || '—'}</td>
                        <td className="max-w-[280px] truncate" title={q.nom ?? undefined}>{q.nom}</td>
                        <td className="fz-c-num">{pul(q.reference_unit_price)}</td>
                        <td className="fz-c-num">{pul(q.certified_unit_price)}</td>
                        <td className="fz-c-num" style={{ color: q.price_delta == null ? undefined : q.price_delta > 0 ? 'var(--danger)' : q.price_delta < 0 ? 'var(--ok)' : undefined }}>{q.price_delta == null ? '—' : (q.price_delta > 0 ? '+' : '') + pul(q.price_delta)}</td>
                        <td className="fz-c-num">{q.frozen_amount > 0 ? pul(q.frozen_amount) : '—'}</td>
                        <td className="fz-c-num">{q.at_risk_amount > 0 ? pul(q.at_risk_amount) : '—'}</td>
                        <td title={t(b.label)}><span className={`fz-stamp fz-stamp--${muhr.ton}`}>{t(muhr.soz)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
