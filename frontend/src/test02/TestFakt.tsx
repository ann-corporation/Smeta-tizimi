import React, { useState, useEffect } from 'react';
import { useKompaniya } from './KompaniyaTanlov';
import { ClipboardList, Smartphone, Table as TableIcon, CheckCircle2, AlertTriangle, Save } from 'lucide-react';
import { sbQatorHolatOl, sbFaktYoz, sbFaktBelgila, type QatorHolat, type FaktQator } from '../api/t2-fakt';
import { sbT2ObyektlarOlKomp, type T2Obyekt } from '../api/supabase';
import { toast } from '../umumiy/ui/Toast';
import { FmtN } from '../lib/format';
import { useVirtualizer } from '@tanstack/react-virtual';

export default function TestFakt() {
  const { joriy } = useKompaniya();
  const [activeTab, setActiveTab] = useState<'prorab' | 'pto'>('prorab');
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [tanlanganObyekt, setTanlanganObyekt] = useState<number | null>(null);
  
  const [qatorlar, setQatorlar] = useState<QatorHolat[]>([]);
  const [loading, setLoading] = useState(false);

  // Prorab Form State
  const [sana, setSana] = useState(new Date().toISOString().split('T')[0]);
  const [kiritishlar, setKiritishlar] = useState<Record<number, string>>({}); // qator_id -> string hajm

  useEffect(() => {
    if (joriy) {
      sbT2ObyektlarOlKomp(joriy.id).then(res => {
        setObyektlar(res.qatorlar || []);
      });
    }
  }, [joriy]);

  useEffect(() => {
    if (tanlanganObyekt) {
      yuklash(tanlanganObyekt);
    } else {
      setQatorlar([]);
    }
  }, [tanlanganObyekt]);

  const yuklash = async (objId: number) => {
    setLoading(true);
    const res = await sbQatorHolatOl(objId);
    if (res.ok) {
      setQatorlar(res.qatorlar || []);
      setKiritishlar({}); // reset inputs
    }
    setLoading(false);
  };

  const prorabSaqlash = async () => {
    if (!tanlanganObyekt) return;
    
    const yuborishQatorlar: FaktQator[] = [];
    for (const [idStr, val] of Object.entries(kiritishlar)) {
      const v = parseFloat(val);
      if (!isNaN(v) && v !== 0) {
        yuborishQatorlar.push({
          qator_id: Number(idStr),
          hajm: v
        });
      }
    }

    if (yuborishQatorlar.length === 0) {
      toast("Hech narsa kiritilmadi", "ok");
      return;
    }

    setLoading(true);
    // Generate simple UUID-like string for operation_id
    const opId = crypto.randomUUID();
    
    const res = await sbFaktYoz({
      obyektId: tanlanganObyekt,
      sana,
      qatorlar: yuborishQatorlar,
      operationId: opId,
      izoh: "Prorab kunlik hisoboti"
    });

    if (res.ok) {
      if (res.ogohlantirish_soni && res.ogohlantirish_soni > 0) {
        toast(`${res.qator_soni} qator saqlandi, lekin ${res.ogohlantirish_soni} ta ogohlantirish (smeta oshishi) bor.`, "danger");
      } else {
        toast(`Fakt saqlandi! Hujjat: ${res.raqam}`, "ok");
      }
      yuklash(tanlanganObyekt);
    } else {
      toast(res.error || "Xatolik yuz berdi", "danger");
    }
    setLoading(false);
  };

  const ptoJamiOzgarishi = async (qatorId: number, yangiJami: number) => {
    const res = await sbFaktBelgila({
      qatorId,
      yangiJami
    });
    
    if (res.ok) {
      if (res.ozgarmadi) {
        toast("O'zgarish yo'q", "ok");
      } else {
        toast(`Jami belgilandi, +${res.farq} fakt yozildi`, "ok");
        if (tanlanganObyekt) yuklash(tanlanganObyekt);
      }
    } else {
      toast(res.error || "Xatolik", "danger");
    }
  };

  return (
    <div className="h-full flex flex-col bg-bg text-text p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <ClipboardList className="text-[var(--accent-text)]" />
            Bajarilgan Ishlar (Fakt)
          </h1>
          <p className="text-text-dim text-sm mt-1">
            Prorabning kunlik kiritishlari va PTO jamlanmasi (Zero-loading state)
          </p>
        </div>
        
        <div className="flex bg-surface border border-border rounded-lg p-1">
          <button
            onClick={() => setActiveTab('prorab')}
            className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors ${activeTab === 'prorab' ? 'bg-[var(--accent)]/20 text-[var(--accent-text)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]'}`}
          >
            <Smartphone size={16} /> Prorab (Kunlik)
          </button>
          <button
            onClick={() => setActiveTab('pto')}
            className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors ${activeTab === 'pto' ? 'bg-[var(--accent)]/20 text-[var(--accent-text)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]'}`}
          >
            <TableIcon size={16} /> PTO (Jadval)
          </button>
        </div>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <label className="block text-xs font-medium text-text-dim mb-1 uppercase tracking-wider">Obyektni tanlang</label>
          <select 
            className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-[var(--text)] focus:border-[var(--accent)] outline-none"
            value={tanlanganObyekt || ''}
            onChange={e => setTanlanganObyekt(Number(e.target.value))}
          >
            <option value="">-- Tanlang --</option>
            {obyektlar.map(o => (
              <option key={o.id} value={o.id}>{o.nom}</option>
            ))}
          </select>
        </div>
        {activeTab === 'prorab' && (
          <div>
            <label className="block text-xs font-medium text-text-dim mb-1 uppercase tracking-wider">Sana</label>
            <input 
              type="date" 
              className="bg-surface border border-border rounded-lg px-4 py-2.5 text-[var(--text)] focus:border-[var(--accent)] outline-none"
              value={sana}
              onChange={e => setSana(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="flex-1 bg-surface border border-border rounded-xl overflow-hidden shadow-2xl relative">
        {!tanlanganObyekt ? (
          <div className="absolute inset-0 flex items-center justify-center text-text-dim">
            Yuqoridan obyekt tanlang
          </div>
        ) : loading && qatorlar.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-text-dim animate-pulse">
            Yuklanmoqda...
          </div>
        ) : activeTab === 'prorab' ? (
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-auto p-4 space-y-3">
              {qatorlar.filter(q => (q.qoldiq_hajm ?? 0) > 0 || (kiritishlar[q.qator_id] !== undefined)).map(q => (
                <div key={q.id} className="bg-bg/50 border border-border p-4 rounded-xl flex items-center gap-4 hover:border-[var(--accent)]/30 transition-colors">
                  <div className="flex-1">
                    <div className="text-xs text-text-dim font-mono mb-1">{q.kod}</div>
                    <div className="font-medium text-sm leading-tight text-[var(--text)] mb-2">{q.nom}</div>
                    <div className="text-xs text-[var(--accent-text)] font-bold bg-[var(--accent)]/10 px-2 py-1 rounded inline-flex">
                      Qoldiq: {<FmtN val={q.qoldiq_hajm} />} {q.birlik}
                    </div>
                  </div>
                  <div className="w-32">
                    <input 
                      type="number"
                      placeholder="Bajarildi..."
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-[var(--text)] font-mono focus:border-[var(--accent)] outline-none placeholder:text-[var(--text-mute)]"
                      value={kiritishlar[q.qator_id] || ''}
                      onChange={e => setKiritishlar({...kiritishlar, [q.qator_id]: e.target.value})}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-border bg-bg/80 flex justify-end">
              <button 
                onClick={prorabSaqlash}
                disabled={loading || Object.keys(kiritishlar).length === 0}
                className="bg-[var(--accent)] hover:brightness-110 disabled:opacity-50 text-[var(--on-accent)] px-6 py-2.5 rounded-lg font-bold transition-colors shadow-lg  flex items-center gap-2"
              >
                {loading ? 'Saqlanmoqda...' : <><Save size={18}/> Bajarilganini Saqlash</>}
              </button>
            </div>
          </div>
        ) : (
          <VirtualTable qatorlar={qatorlar} ptoJamiOzgarishi={ptoJamiOzgarishi} />
        )}
      </div>
    </div>
  );
}


// 20k rows uchun Virtualization!
function VirtualTable({ qatorlar, ptoJamiOzgarishi }: { qatorlar: QatorHolat[], ptoJamiOzgarishi: any }) {
  const parentRef = React.useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: qatorlar.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 45, // default row height
    overscan: 10,
  });

  return (
    <div ref={parentRef} className="h-full overflow-auto relative">
      <table className="w-full text-left text-sm whitespace-nowrap table-fixed">
        <thead className="sticky top-0 bg-surface-2 border-b border-border text-text-dim font-medium text-[10px] uppercase tracking-wider z-20">
          <tr>
            <th className="px-4 py-3 w-24">Kod</th>
            <th className="px-4 py-3 w-1/3">Ish nomi</th>
            <th className="px-4 py-3 text-right w-24">Smeta Jami</th>
            <th className="px-4 py-3 text-right text-[var(--accent-text)] w-32">FAKT Jami</th>
            <th className="px-4 py-3 text-right text-[var(--info)] w-24">2 Jami</th>
            <th className="px-4 py-3 text-right text-[var(--warn)] w-24">Qoldiq</th>
          </tr>
        </thead>
        <tbody 
          className="divide-y divide-border/50 relative"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const q = qatorlar[virtualRow.index];
            return (
              <tr 
                key={q.id} 
                className="hover:bg-bg/50 transition-colors absolute w-full"
                style={{
                  top: 0,
                  left: 0,
                  transform: `translateY(${virtualRow.start}px)`,
                  height: `${virtualRow.size}px`
                }}
              >
                <td className="px-4 py-2 font-mono text-[11px] text-[var(--text-mute)] w-24 overflow-hidden text-ellipsis">{q.kod}</td>
                <td className="px-4 py-2 whitespace-normal text-xs text-[var(--text)] leading-tight w-1/3 overflow-hidden" title={q.nom}>
                  <div className="line-clamp-2">{q.nom}</div>
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs text-[var(--text)] w-24">
                  <FmtN val={q.smeta_hajm} /> {q.birlik}
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs w-32">
                  <input 
                    type="number"
                    className="w-20 bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded px-2 py-1 text-[var(--accent-text)] font-bold text-right outline-none focus:border-[var(--accent)]"
                    defaultValue={q.fakt_hajm}
                    onBlur={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val !== q.fakt_hajm) {
                        ptoJamiOzgarishi(q.qator_id, val);
                      }
                    }}
                    onKeyDown={(e) => {
                       if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                  />
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs text-[var(--info)] w-24">
                  <FmtN val={q.f2_hajm} />
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs text-[var(--warn)] font-bold bg-[var(--warn)]/5 w-24">
                  {<FmtN val={q.qoldiq_hajm} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
