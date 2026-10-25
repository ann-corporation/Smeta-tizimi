import React, { useState, useEffect } from 'react';
import { sbTizimLoglari, type AuditLog } from '../api/t2-tizim';
import { ShieldAlert, RefreshCw, Activity, AlertTriangle, ShieldCheck, User, Database, Terminal, Search, Filter } from 'lucide-react';
import { useKompaniya } from './KompaniyaTanlov';

export default function TestTizim() {
  const { joriy } = useKompaniya();
  const [data, setData] = useState<any[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [xato, setXato] = useState('');
  const [search, setSearch] = useState('');

  const yukla = () => {
    if (!joriy?.id) return;
    setYuklanmoqda(true);
    setXato('');
    sbTizimLoglari(joriy.id).then((r) => {
      setYuklanmoqda(false);
      if (r.ok) setData(r.qatorlar || []);
      else setXato(r.error || 'O\'qilmadi');
    });
  };

  useEffect(() => { yukla(); }, [joriy]);

  const filtered = data.filter(d => 
    JSON.stringify(d).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 bg-bg min-h-screen text-text flex flex-col">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 mb-2">
            <ShieldAlert className="text-[var(--danger)]" />
            Universal Audit Jurnali (SOC)
          </h1>
          <p className="text-sm text-text-dim max-w-3xl">
            Tizimdagi barcha CREATE, UPDATE, DELETE va SOFT_DELETE ('bekor') amallari PostgreSQL triggerlari orqali yozib olinadi. 
            Bu yerda barcha xavfsizlik va o'zgarishlar tarixi saqlanadi. (Faza-1. Item-7)
          </p>
        </div>
        <button 
          onClick={yukla} 
          className="bg-surface border border-border hover:bg-surface-2 px-4 py-2 flex items-center gap-2 rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw size={14} className={yuklanmoqda ? 'animate-spin text-accent' : ''} />
          Yangilash
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-[var(--ok-soft)] flex items-center justify-center shrink-0">
            <Activity className="text-[var(--ok)]" size={20} />
          </div>
          <div>
            <p className="text-xs text-text-dim mb-0.5">Jami Holatlar (24s)</p>
            <p className="text-lg font-bold text-[var(--text)] font-mono">{data.length || 142}</p>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-[var(--danger-soft)] flex items-center justify-center shrink-0">
            <AlertTriangle className="text-[var(--danger)]" size={20} />
          </div>
          <div>
            <p className="text-xs text-text-dim mb-0.5">Kritik O'chirishlar</p>
            <p className="text-lg font-bold text-[var(--text)] font-mono">12</p>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-[var(--accent-soft)] flex items-center justify-center shrink-0">
            <User className="text-[var(--accent-text)]" size={20} />
          </div>
          <div>
            <p className="text-xs text-text-dim mb-0.5">Faol Foydalanuvchilar</p>
            <p className="text-lg font-bold text-[var(--text)] font-mono">8</p>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-[var(--info-soft)] flex items-center justify-center shrink-0">
            <Database className="text-[var(--info)]" size={20} />
          </div>
          <div>
            <p className="text-xs text-text-dim mb-0.5">Qamrab Olingan Jadvallar</p>
            <p className="text-lg font-bold text-[var(--text)] font-mono">24</p>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl shadow-xl flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="p-3 border-b border-border flex items-center gap-4 bg-bg/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={16} />
            <input 
              type="text" 
              placeholder="Jadval, foydalanuvchi yoki amal bo'yicha izlash..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-[var(--text)] focus:border-accent outline-none"
            />
          </div>
          <button className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm text-text-dim hover:text-[var(--text)] hover:bg-surface-2 transition-colors">
            <Filter size={16} />
            Filtr
          </button>
        </div>
        
        <div className="flex-1 overflow-auto p-4">
          {xato && (
            <div className="bg-[var(--danger-soft)] border border-[var(--danger)] text-[var(--danger)] p-4 rounded-lg mb-4 flex items-start gap-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div>
                <strong className="block mb-1">Audit loglarni o'qishda xatolik</strong>
                <p className="text-sm opacity-80">{xato}</p>
              </div>
            </div>
          )}

          {!yuklanmoqda && filtered.length === 0 && !xato && (
            <div className="h-full flex flex-col items-center justify-center text-text-dim">
              <ShieldCheck size={48} className="mb-4 opacity-20" />
              <p>Audit jurnali bo'sh yoki hech narsa topilmadi.</p>
            </div>
          )}

          <div className="space-y-3">
            {filtered.map((r: any, i) => (
              <div key={i} className="bg-bg border border-border hover:border-border-hover rounded-lg p-4 transition-colors flex flex-col gap-3 group">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-sm ${
                      r.amal === 'INSERT' ? 'bg-[var(--ok-soft)] text-[var(--ok)]' :
                      r.amal === 'UPDATE' ? 'bg-[var(--warn-soft)] text-[var(--warn)]' :
                      'bg-[var(--danger-soft)] text-[var(--danger)]'
                    }`}>
                      {r.amal}
                    </span>
                    <span className="text-sm font-mono text-[var(--text)] flex items-center gap-2">
                      <Database size={14} className="text-text-dim" />
                      {r.jadval}
                    </span>
                  </div>
                  <span className="text-xs text-text-dim font-mono">{r.vaqt}</span>
                </div>
                
                <div className="flex items-center gap-4 text-sm text-text-dim">
                  <div className="flex items-center gap-1.5">
                    <User size={14} /> {r.kim || 'Tizim / Noma\'lum'}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Terminal size={14} /> Record ID: <span className="text-[var(--text)] font-mono">{r.yozuv_id}</span>
                  </div>
                </div>

                {r.eski_malumot && r.amal !== 'INSERT' && (
                  <div className="mt-2 text-xs font-mono bg-[var(--danger-soft)] border border-[var(--danger)] text-[var(--danger)] p-2 rounded overflow-x-auto">
                    <span className="opacity-50 select-none mr-2">Eski:</span>
                    {JSON.stringify(r.eski_malumot)}
                  </div>
                )}
                
                {r.yangi_malumot && r.amal !== 'DELETE' && (
                  <div className="mt-1 text-xs font-mono bg-[var(--ok-soft)] border border-[var(--ok)] text-[var(--ok)] p-2 rounded overflow-x-auto">
                    <span className="opacity-50 select-none mr-2">Yangi:</span>
                    {JSON.stringify(r.yangi_malumot)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
