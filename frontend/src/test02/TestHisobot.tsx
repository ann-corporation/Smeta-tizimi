import { useState, useEffect } from 'react';
import { sbBossInitOl, sbBossDataOl } from '../api/t2-hisobot';
import { BarChart3, RefreshCw } from 'lucide-react';
import { FmtN } from '../lib/format';
import { useKompaniya } from './KompaniyaTanlov';

/* ⚠️ 2026-08-27 (Claude): bu yerda avval `MOCK_INIT`/`MOCK_DATA` bor
 * edi — real ma'lumot bo'sh yoki xato bo'lsa TO'QILGAN raqamlar
 * (masalan "250 000 000 foyda") jim ko'rsatilardi. Foydalanuvchi
 * to'g'ri payqadi: "Boss tahlil ham yo'q joydan to'qib yotibdi".
 * Olib tashlandi — bo'sh bo'lsa OCHIQ "ma'lumot yo'q" holati. */
export default function TestHisobot() {
  const { joriy } = useKompaniya();
  const [initData, setInitData] = useState<any>(null);
  const [data, setData] = useState<any[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [xato, setXato] = useState('');

  const yukla = () => {
    if (!joriy?.id) return;
    setYuklanmoqda(true);
    setXato('');
    Promise.all([
      sbBossInitOl(joriy.id).then((r: any) => {
        if (r.ok) setInitData((r.qatorlar && r.qatorlar[0]) || null);
        else setXato((prev: string) => prev || r.error || 'O\'qilmadi');
      }),
      sbBossDataOl(joriy.id).then((r: any) => {
        if (r.ok) setData(r.qatorlar || []);
        else setXato((prev: string) => prev || r.error || 'O\'qilmadi');
      })
    ]).finally(() => setYuklanmoqda(false));
  };

  useEffect(() => { yukla(); }, [joriy]);

  return (
    <div className="p-6 bg-[var(--surface)] text-[var(--text)] min-h-screen">
      <div className="flex justify-between items-center mb-6 border-b border-[var(--border)] pb-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--kat-ob)] flex items-center gap-2">
            <BarChart3 /> Boss Hisoboti (Tahlil)
          </h1>
          <p className="text-sm text-[var(--text-dim)] mt-1">Kompaniya moliya va ko'rsatkichlari dinamikasi</p>
        </div>
        <button onClick={yukla} className="bg-[var(--kat-ob)] hover:bg-[var(--kat-ob)] px-4 py-2 rounded flex items-center gap-2">
          <RefreshCw size={16} className={yuklanmoqda ? 'animate-spin' : ''} /> Yangilash
        </button>
      </div>

      {xato && (
        <div className="mb-4 p-3 bg-[var(--danger)]/20 border border-[var(--danger)]/30 text-[var(--danger)] rounded-lg text-sm">{xato}</div>
      )}

      {yuklanmoqda && !initData ? <div className="text-[var(--text-mute)] animate-pulse">Yuklanmoqda...</div> : (
        <div className="flex flex-col gap-6">
          {!initData && data.length === 0 && !xato && (
            <div className="text-center text-[var(--text-mute)] py-10 border border-dashed border-[var(--border)] rounded-lg">
              Hozircha tahlil uchun ma'lumot yo'q.
            </div>
          )}
          {initData && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[var(--bg)] border border-[var(--border)] p-4 rounded-lg border-t-4 border-t-[var(--ok)] shadow-lg">
                <div className="text-[var(--text-mute)] text-sm mb-1">Jami Foyda</div>
                <div className="text-2xl font-bold text-[var(--ok)]"><FmtN val={initData.foyda || 0} /></div>
              </div>
              <div className="bg-[var(--bg)] border border-[var(--border)] p-4 rounded-lg border-t-4 border-t-[var(--info)] shadow-lg">
                <div className="text-[var(--text-mute)] text-sm mb-1">Daromad</div>
                <div className="text-2xl font-bold text-[var(--info)]"><FmtN val={initData.daromad || 0} /></div>
              </div>
              <div className="bg-[var(--bg)] border border-[var(--border)] p-4 rounded-lg border-t-4 border-t-[var(--danger)] shadow-lg">
                <div className="text-[var(--text-mute)] text-sm mb-1">Xarajatlar</div>
                <div className="text-2xl font-bold text-[var(--danger)]"><FmtN val={initData.xarajat || 0} /></div>
              </div>
              <div className="bg-[var(--bg)] border border-[var(--border)] p-4 rounded-lg border-t-4 border-t-[var(--warn)] shadow-lg">
                <div className="text-[var(--text-mute)] text-sm mb-1">Qoldiq Kassa</div>
                <div className="text-2xl font-bold text-[var(--warn)]"><FmtN val={initData.kassa || 0} /></div>
              </div>
            </div>
          )}

          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg overflow-hidden shadow-lg">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--surface-3)] text-[var(--text-dim)]">
                <tr>
                  <th className="p-4 font-medium">Obyekt / Kategoriya</th>
                  <th className="p-4 font-medium text-right">Kirim</th>
                  <th className="p-4 font-medium text-right">Chiqim</th>
                  <th className="p-4 font-medium text-right">Foyda</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-[var(--text-mute)]">Hech qanday tahlil topilmadi.</td></tr>}
                {data.map((d, i) => (
                  <tr key={i} className="border-t border-[var(--border)]/50 hover:bg-[var(--surface-2)]">
                    <td className="p-4 font-medium">{d.kategoriya || d.nom || '-'}</td>
                    <td className="p-4 text-right text-[var(--ok)]"><FmtN val={d.kirim || 0} /></td>
                    <td className="p-4 text-right text-[var(--danger)]"><FmtN val={d.chiqim || 0} /></td>
                    <td className="p-4 text-right font-bold text-[var(--info)]"><FmtN val={(d.kirim || 0) - (d.chiqim || 0)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
