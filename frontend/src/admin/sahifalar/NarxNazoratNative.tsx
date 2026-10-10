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
import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, Lock, TriangleAlert, FileWarning, Loader2, RefreshCw } from 'lucide-react';
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

  if (kompYuk) return <div className="p-6 text-sm text-text-dim flex items-center gap-2"><Loader2 className="animate-spin" size={15} /> yuklanmoqda…</div>;

  return (
    <div className="p-4 flex flex-col gap-4">
      <MarketPriceComparison objectId={obyektId} companyId={joriy?.id ?? null} />
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-sm font-semibold flex items-center gap-2"><ShieldAlert size={15} className="text-accent" /> Narx nazorati</h2>
        {!fixedObjectId && <select className="input py-1 text-[12px]" value={obyektId ?? ''} onChange={(e) => setObyektId(Number(e.target.value) || null)}>
          <option value="">— obyekt tanlang —</option>
          {obyektlar.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
        </select>}
        {obyektId && <button className="text-[12px] text-text-dim hover:text-text flex items-center gap-1" onClick={yukla} disabled={yuk}>
          <RefreshCw size={12} className={yuk ? 'animate-spin' : ''} /> yangilash
        </button>}
      </div>

      <p className="text-[11px] text-text-mute max-w-2xl">
        BU PROCUREMENT SAVING EMAS. F2 qaysi narxda sertifikatlangani va shu qator uchun
        REFERENCE (smeta baseline, F2 yaratilgan payt muzlagan) narx orasidagi farq —
        past narxda yopilgan qism 🔒 <b>muzlagan</b>, hali tasdiqlanmagan qismi ⚠ <b>xavf ostida</b>.
        Narx reference'dan yuqori bo'lsa bu "foyda" emas — 📄/🔴 basis (protokol) nazorati.
      </p>

      {!obyektId && <div className="text-[12px] text-text-dim">Obyekt tanlanmagan.</div>}

      {obyektId && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button onClick={() => setFiltr('muzlagan')}
              className={`karta p-3 text-left ${filtr === 'muzlagan' ? 'ring-1 ring-accent' : ''}`}>
              <div className="text-[11px] text-text-dim flex items-center gap-1"><Lock size={12} /> Jami muzlagan summa</div>
              <div className="text-lg font-semibold mt-1">{pul(jami.muzlagan)}</div>
            </button>
            <button onClick={() => setFiltr('xavf_ostida')}
              className={`karta p-3 text-left ${filtr === 'xavf_ostida' ? 'ring-1 ring-accent' : ''}`}>
              <div className="text-[11px] text-text-dim flex items-center gap-1"><TriangleAlert size={12} /> Hozir xavf ostidagi summa</div>
              <div className="text-lg font-semibold mt-1">{pul(jami.xavf)}</div>
            </button>
            <button onClick={() => setFiltr('yuqori_narx')}
              className={`karta p-3 text-left ${filtr === 'yuqori_narx' ? 'ring-1 ring-accent' : ''}`}>
              <div className="text-[11px] text-text-dim flex items-center gap-1"><ShieldAlert size={12} /> Reference'dan yuqori F2</div>
              <div className="text-lg font-semibold mt-1">{(qatorlar || []).filter((x) => x.price_state === 'ABOVE_APPROVED_BASIS' || x.price_state === 'ABOVE_REFERENCE_MISSING_BASIS' || x.price_state === 'ABOVE_REFERENCE_JUSTIFIED').length}</div>
            </button>
            <button onClick={() => setFiltr('protokolsiz')}
              className={`karta p-3 text-left ${filtr === 'protokolsiz' ? 'ring-1 ring-accent' : ''}`}>
              <div className="text-[11px] text-text-dim flex items-center gap-1"><FileWarning size={12} /> Basis/protokolsiz qatorlar</div>
              <div className="text-lg font-semibold mt-1">{jami.protokolsiz}</div>
            </button>
          </div>

          {filtr !== 'hammasi' && (
            <button className="text-[11px] text-accent self-start" onClick={() => setFiltr('hammasi')}>← barcha qatorlarni ko'rsatish</button>
          )}

          {yuk && <div className="text-[12px] text-text-dim flex items-center gap-2"><Loader2 className="animate-spin" size={13} /> yuklanmoqda…</div>}
          {xato && <div className="text-[12px] text-rose-300">{xato}</div>}

          {!yuk && !xato && qatorlar && qatorlar.length === 0 && (
            <div className="text-[12px] text-text-dim karta p-4">
              Bu obyektda hali certified (exact-source, v2) F2 qatori yo'q — narx nazorati faqat
              <code> t2_akt_yarat_v2</code> orqali yaratilgan F2 qatorlar uchun ishlaydi.
            </div>
          )}

          {!yuk && suzilgan.length > 0 && (
            <div className="overflow-x-auto karta">
              <table className="text-[12px] w-full min-w-[860px]">
                <thead>
                  <tr className="text-left text-text-dim border-b border-border">
                    <th className="py-1.5 px-2">Kod</th><th className="px-2">Nom</th>
                    <th className="px-2 text-right">Reference narx</th>
                    <th className="px-2 text-right">F2 narx</th>
                    <th className="px-2 text-right">Farq</th>
                    <th className="px-2 text-right">🔒 Muzlagan</th>
                    <th className="px-2 text-right">⚠ Xavf ostida</th>
                    <th className="px-2">Holat</th>
                  </tr>
                </thead>
                <tbody>
                  {suzilgan.map((q) => {
                    const b = PRICE_STATE_BADGE[q.price_state];
                    return (
                      <tr key={q.qator_id} className="border-b border-border/40">
                        <td className="py-1.5 px-2 text-text-mute">{q.kod || '—'}</td>
                        <td className="px-2 truncate max-w-[280px]">{q.nom}</td>
                        <td className="px-2 text-right">{pul(q.reference_unit_price)}</td>
                        <td className="px-2 text-right">{pul(q.certified_unit_price)}</td>
                        <td className="px-2 text-right">{q.price_delta == null ? '—' : (q.price_delta > 0 ? '+' : '') + pul(q.price_delta)}</td>
                        <td className="px-2 text-right">{q.frozen_amount > 0 ? pul(q.frozen_amount) : '—'}</td>
                        <td className="px-2 text-right">{q.at_risk_amount > 0 ? pul(q.at_risk_amount) : '—'}</td>
                        <td className={`px-2 ${b.className}`}>{b.emoji} {b.label}</td>
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
