import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { sbGrafikHolatOl } from '../api/t2-grafik';
import { CalendarDays } from 'lucide-react';
import { useKompaniya } from './KompaniyaTanlov';

/* ⚠️ 2026-08-27 (Claude): avval bo'sh/xato javobda `MOCK_GRAFIK`
 * (to'qilgan "Kotlovan qazish" va h.k.) ko'rsatilardi — olib
 * tashlandi, bo'sh bo'lsa OCHIQ "ma'lumot yo'q" holati. */
export default function TestGrafik() {
  const [params] = useSearchParams();
  const { joriy } = useKompaniya();
  const aktKomp = joriy?.id;
  const obyektId = params.get('obyekt') ? Number(params.get('obyekt')) : null;
  const [grafik, setGrafik] = useState<any[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [xato, setXato] = useState('');

  useEffect(() => {
    if (!aktKomp || !obyektId) return;
    setYuklanmoqda(true);
    setXato('');
    sbGrafikHolatOl(aktKomp, obyektId).then(r => {
      setYuklanmoqda(false);
      if (r.ok) {
        setGrafik(r.qatorlar || []);
      } else {
        setXato(r.error || 'O\'qilmadi');
        setGrafik([]);
      }
    });
  }, [aktKomp, obyektId]);

  return (
    <div className="p-6 bg-[var(--surface)] text-[var(--text)] min-h-screen">
      <div className="flex justify-between items-center mb-6 border-b border-[var(--border)] pb-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--warn)] flex items-center gap-2">
            <CalendarDays />
            Kalendar Grafik (Gantt) {obyektId ? '(Obyekt: ' + obyektId + ')' : ''}
          </h1>
          <p className="text-sm text-[var(--text-dim)] mt-1">Loyiha rejalashtirish va amalda bajarilish muddatlari</p>
        </div>
      </div>

      {xato && (
        <div className="mb-4 p-3 bg-[var(--danger)]/20 border border-[var(--danger)]/30 text-[var(--danger)] rounded-lg text-sm">{xato}</div>
      )}

      {yuklanmoqda ? <div className="text-[var(--text-mute)] animate-pulse">Yuklanmoqda...</div> : (
        <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg overflow-x-auto shadow-lg">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--surface-3)] text-[var(--text-dim)] sticky top-0">
              <tr>
                <th className="p-4 font-medium">Ish / Kategoriya</th>
                <th className="p-4 font-medium">Holat</th>
                <th className="p-4 font-medium">Boshlanish</th>
                <th className="p-4 font-medium">Tugash</th>
                <th className="p-4 font-medium text-center">Davomiylik</th>
                <th className="p-4 font-medium">Tugallangan (%)</th>
              </tr>
            </thead>
            <tbody>
              {grafik.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-[var(--text-mute)]">Hech qanday grafik topilmadi. Avval obyekt tanlang.</td></tr>
              )}
              {grafik.map((g, i) => (
                <tr key={i} className="border-t border-[var(--border)]/50 hover:bg-[var(--surface-2)]">
                  <td className="p-4 font-medium text-[var(--text)] max-w-sm truncate">{g.nom || g.nomi || g.ish_turi || '-'}</td>
                  <td className="p-4">
                    <span className={
                      "px-2 py-1 rounded text-xs font-medium " +
                      (g.holat === 'bajarildi' ? 'bg-[var(--ok)]/20 text-[var(--ok)]'
                        : g.holat === 'jarayonda' ? 'bg-[var(--warn)]/20 text-[var(--warn)]'
                        : 'bg-[var(--surface-3)] text-[var(--text-dim)]')
                    }>
                      {(g.holat || 'reja').toUpperCase()}
                    </span>
                  </td>
                  <td className="p-4 text-[var(--text-dim)]">{g.boshlanish_sana ? String(g.boshlanish_sana).substring(0, 10) : '-'}</td>
                  <td className="p-4 text-[var(--text-dim)]">{g.tugash_sana ? String(g.tugash_sana).substring(0, 10) : '-'}</td>
                  <td className="p-4 text-center font-mono">{g.kun || '-'} kun</td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-full bg-[var(--surface-3)] rounded-full h-2 max-w-[120px] overflow-hidden">
                        <div className="bg-[var(--ok)] h-2 rounded-full transition-all duration-1000" style={{ width: (g.foiz || 0) + '%' }}></div>
                      </div>
                      <span className="text-xs text-[var(--text-dim)] font-mono">{g.foiz || 0}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
