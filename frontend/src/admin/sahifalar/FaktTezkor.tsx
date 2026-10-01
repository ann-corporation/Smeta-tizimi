import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Plus, Repeat2, Save, Search, X } from 'lucide-react';
import { yangiOperationId, type T2Qator } from '../../api/supabase';
import { sbFaktYoz } from '../../api/t2-fakt';
import { TEZKOR_XATO_MATN, tezkorPaket, tezkorQatorlar, type TezkorHolat, type TezkorQator } from '../../lib/fakt-tezkor';
import { FmtN } from '../../lib/format';
import { toast } from '../../umumiy/ui/Toast';
import { SmetadanTashqariModal, type Bolim } from './SmetadanTashqariModal';

const KORSATISH = 400;

/**
 * Tezkor fakt (egasi, 2026-10-01): bir nechta qatorga "bugun bajarildi" hajmini yozib, BITTA
 * tugma bilan BITTA tranzaksiyada saqlash. Qator yonida — zamena; yuqorida — smetadan tashqari
 * ish. Smetasiz obyektda ham ishlaydi (jadval bo'sh — faqat "smetadan tashqari ish").
 */
export function FaktTezkor({ kompaniyaId, obyektId, rows, states, onSaqlandi }: {
  kompaniyaId: number; obyektId: number;
  rows: readonly T2Qator[]; states: readonly TezkorHolat[];
  onSaqlandi: () => Promise<void> | void;
}) {
  const [sana, setSana] = useState(() => new Date().toISOString().slice(0, 10));
  const [kiritilgan, setKiritilgan] = useState<Record<number, string>>({});
  const [qidiruv, setQidiruv] = useState('');
  const [faqatQoldiq, setFaqatQoldiq] = useState(false);
  const [band, setBand] = useState(false);
  const [modal, setModal] = useState<{ zamena?: TezkorQator | null; bolimId?: number | null } | null>(null);
  const operationId = useRef(yangiOperationId());
  const inputlar = useRef<Array<HTMLInputElement | null>>([]);

  const qatorlar = useMemo(() => tezkorQatorlar(rows, states), [rows, states]);
  const bolimlar = useMemo<Bolim[]>(() => rows.filter((r) => r.tur === 'rz').map((r) => ({
    id: r.id, versiya: r.versiya, nom: `${'· '.repeat(r.daraja ?? 0)}${[r.kod, r.nom].filter(Boolean).join(' ')}`,
  })), [rows]);
  const korinadi = useMemo(() => {
    const q = qidiruv.trim().toLowerCase();
    return qatorlar.filter((x) => (!faqatQoldiq || (x.qoldiq ?? 0) > 0 || kiritilgan[x.id])
      && (!q || `${x.kod ?? ''} ${x.nom} ${x.bolim}`.toLowerCase().includes(q)));
  }, [qatorlar, qidiruv, faqatQoldiq, kiritilgan]);
  const paket = useMemo(() => tezkorPaket(kiritilgan, qatorlar), [kiritilgan, qatorlar]);
  const xatoMap = useMemo(() => new Map(paket.xatolar.map((x) => [x.qatorId, x.xato])), [paket.xatolar]);

  const yoz = (id: number, v: string) => setKiritilgan((o) => { const n = { ...o }; if (v === '') delete n[id]; else n[id] = v; return n; });
  const keyingi = (e: KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); inputlar.current[i + 1]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); inputlar.current[i - 1]?.focus(); }
  };

  const saqla = async () => {
    if (!paket.ok || band) return;
    setBand(true);
    try {
      const r = await sbFaktYoz({ obyektId, sana, operationId: operationId.current, qatorlar: paket.qatorlar, izoh: `Tezkor fakt: ${paket.qatorlar.length} qator` });
      if (!r.ok) { toast(r.error || r.xabar || 'Fakt saqlanmadi.', 'danger'); return; }
      toast(`${paket.qatorlar.length} ta qator bitta amalda saqlandi — F2 qoldig‘i yangilandi.`, 'ok');
      setKiritilgan({}); operationId.current = yangiOperationId();
      await onSaqlandi();
    } catch { toast('Javob olinmadi. Qayta bosing — takroriy saqlash xavfsiz (bir xil amal ID).', 'danger'); }
    finally { setBand(false); }
  };

  const soni = Object.keys(kiritilgan).length;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <section className="karta flex flex-wrap items-end gap-2 p-2.5">
        <label className="text-[12px] font-medium">Sana<input type="date" value={sana} onChange={(e) => setSana(e.target.value)} className="input mt-1 block h-9 px-2 text-[13px]" aria-label="Fakt sanasi" /></label>
        <div className="relative min-w-[220px] flex-1"><Search size={14} className="absolute left-2 top-[0.6rem] text-text-mute" />
          <input value={qidiruv} onChange={(e) => setQidiruv(e.target.value)} placeholder="Ish, kod yoki bo‘lim bo‘yicha qidirish…" aria-label="Qidirish" className="input h-9 w-full pl-7 pr-7 text-[13px]" />
          {qidiruv && <button onClick={() => setQidiruv('')} className="absolute right-2 top-[0.6rem] text-text-mute" aria-label="Tozalash"><X size={14} /></button>}</div>
        <label className="flex items-center gap-1.5 pb-2 text-[12px] text-text-dim"><input type="checkbox" checked={faqatQoldiq} onChange={(e) => setFaqatQoldiq(e.target.checked)} /> faqat bajarilmaganlar</label>
        <button onClick={() => setModal({})} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-accent/40 px-3 text-[12px] font-semibold text-text hover:bg-accent/10"><Plus size={14} className="text-accent" /> Smetadan tashqari ish</button>
        <button onClick={() => void saqla()} disabled={!paket.ok || band} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-4 text-[12px] font-semibold text-white disabled:opacity-50"><Save size={14} /> {band ? 'Saqlanmoqda…' : soni ? `Hammasini saqlash (${soni})` : 'Hammasini saqlash'}</button>
      </section>
      {paket.xatolar.length > 0 && <p role="alert" className="text-[12px] text-warn">{paket.xatolar.length} ta qatorda xato bor — tuzating, keyin saqlanadi.</p>}

      {qatorlar.length === 0
        ? <section className="karta p-5 text-[13px] text-text-dim">Bu obyektda smeta yo‘q. Bajarilgan ishlarni <b className="text-text">«Smetadan tashqari ish»</b> tugmasi bilan kiriting — resurslari bilan birga faktga va F2 ga tayyor holda yoziladi.</section>
        : <section className="karta min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[960px] text-left text-[12px]">
            <thead className="sticky top-0 z-10 bg-surface-2 text-text-dim"><tr>
              <th className="p-2">Ish / resurs</th><th className="w-16">Birlik</th><th className="w-24 text-right">Smeta</th><th className="w-24 text-right">Fakt</th><th className="w-24 text-right">Qoldiq</th><th className="w-36 text-right">Bugun bajarildi (+)</th><th className="w-28 p-2" />
            </tr></thead>
            <tbody>{korinadi.slice(0, KORSATISH).map((x, i) => {
              const xato = xatoMap.get(x.id);
              return <tr key={x.id} className={`border-t border-border/60 align-top ${kiritilgan[x.id] ? 'bg-accent/5' : ''}`}>
                <td className="p-2"><div className="text-[10px] text-text-mute">{x.bolim}</div>
                  <div className={x.tur === 'bl' ? 'font-medium' : 'pl-3 text-text-dim'}>{x.kod ? <span className="mr-1 text-text-mute">{x.kod}</span> : null}{x.nom}
                    {x.qoshimcha && <span className="ml-1.5 rounded bg-accent/10 px-1 text-[10px] text-accent">qo‘shimcha</span>}
                    {x.zamena && <span className="ml-1.5 rounded bg-warn/10 px-1 text-[10px] text-warn">zamena</span>}</div></td>
                <td>{x.birlik}</td>
                <td className="text-right"><FmtN val={x.smeta} /></td>
                <td className="text-right text-ok"><FmtN val={x.fakt} /></td>
                <td className="text-right"><FmtN val={x.qoldiq} /></td>
                <td className="text-right"><input ref={(el) => { inputlar.current[i] = el; }} value={kiritilgan[x.id] ?? ''} onChange={(e) => yoz(x.id, e.target.value)} onKeyDown={(e) => keyingi(e, i)} inputMode="decimal" aria-label={`Bugun bajarildi: ${x.nom}`}
                  className={`w-28 rounded border bg-bg px-2 py-1 text-right font-mono ${xato ? 'border-warn' : 'border-border'}`} />
                  {xato && <div className="text-[10px] text-warn">{TEZKOR_XATO_MATN[xato]}</div>}</td>
                <td className="p-2 text-right whitespace-nowrap">
                  {(x.qoldiq ?? 0) > 0 && <button onClick={() => yoz(x.id, String(x.qoldiq))} title="Qoldiqni to‘liq bajarildi deb yozish" className="mr-1 rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-surface-2">100%</button>}
                  {x.otaId != null && <button onClick={() => setModal({ zamena: x })} title="Zamena: boshqa material/ish bilan almashtirish" className="inline-flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-warn/10"><Repeat2 size={11} /> zamena</button>}
                </td>
              </tr>;
            })}</tbody>
          </table>
          {korinadi.length > KORSATISH && <p className="p-2 text-center text-[11px] text-text-mute">Birinchi {KORSATISH} ta qator ko‘rsatildi ({korinadi.length} tadan) — qidiruv bilan toraytiring.</p>}
        </section>}

      {modal && <SmetadanTashqariModal kompaniyaId={kompaniyaId} obyektId={obyektId} sana={sana} bolimlar={bolimlar}
        zamena={modal.zamena} boshBolimId={modal.bolimId} onYop={() => setModal(null)}
        onSaqlandi={(xabar) => { setModal(null); toast(xabar, 'ok'); void onSaqlandi(); }} />}
    </div>
  );
}
