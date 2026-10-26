import React, { useState } from 'react';
import { Mail, Send, CheckCircle2, XCircle, Clock, FileText, MessageSquare, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function TestKorrespondensiya() {
  const [activeTab, setActiveTab] = useState<'xatlar' | 'loyihalar' | 'etirozlar'>('loyihalar');

  return (
    <div className="h-full flex flex-col bg-[var(--bg)] text-[var(--text)] p-6 overflow-y-auto custom-scrollbar">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="text-[var(--accent-text)]" /> B2B Korrespondensiya & EDO
          </h1>
          <p className="text-[var(--text-dim)] text-sm mt-1">Zakazchik, Loyihachi va Pudratchi o'rtasida rasmiy xat almashinuv markazi</p>
        </div>
        <button className="bg-[var(--accent)] hover:brightness-110 text-[var(--on-accent)] px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-lg">
          <Send size={16} /> Yangi xat yuborish
        </button>
      </div>

      <div className="flex gap-2 mb-6 border-b border-[var(--border)] pb-2">
        <button onClick={() => setActiveTab('loyihalar')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'loyihalar' ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]' : 'hover:bg-[var(--surface-3)] text-[var(--text-dim)]'}`}>Loyiha Tasdiqlash</button>
        <button onClick={() => setActiveTab('xatlar')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'xatlar' ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]' : 'hover:bg-[var(--surface-3)] text-[var(--text-dim)]'}`}>Rasmiy Xatlar</button>
        <button onClick={() => setActiveTab('etirozlar')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'etirozlar' ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]' : 'hover:bg-[var(--surface-3)] text-[var(--text-dim)]'}`}>E'tiroz va Takliflar</button>
      </div>

      {activeTab === 'loyihalar' && (
        <div className="grid grid-cols-1 gap-4">
          {[
            { id: 1, nomi: "Tashqi Fasad Chizmalari v2.0", loyihachi: "Loyiha-Stroy MChJ", holat: "zakazchik", sana: "24 Okt, 2026" },
            { id: 2, nomi: "Oqava suv tarmoqlari plani", loyihachi: "Suv-Loyiha XK", holat: "pudratchi", sana: "22 Okt, 2026" },
            { id: 3, nomi: "Ventilyatsiya tizimi (Qavat-1)", loyihachi: "Eco-Havo MChJ", holat: "tasdiqlangan", sana: "20 Okt, 2026" },
          ].map((l, i) => (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} key={l.id} className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:bg-[var(--surface-3)] transition-colors">
              <div className="flex items-start gap-4 flex-1">
                <div className="w-12 h-12 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)] flex items-center justify-center shrink-0">
                  <FileText className="text-[var(--accent-text)]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[var(--text)] mb-1">{l.nomi}</h3>
                  <p className="text-sm text-[var(--text-dim)] flex items-center gap-4">
                    <span>Loyihachi: <span className="text-[var(--text-dim)]">{l.loyihachi}</span></span>
                    <span>Sana: {l.sana}</span>
                  </p>
                </div>
              </div>

              {/* Workflow Pipeline */}
              <div className="flex items-center gap-2 flex-1 max-w-lg w-full">
                <div className="flex-1 flex flex-col items-center gap-2 relative">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center z-10 bg-[var(--ok)] text-[var(--on-accent)] shadow-[0_0_12px_var(--ok-soft)]`}>
                    <CheckCircle2 size={16} />
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-[var(--ok)] font-bold text-center">Loyihachi<br/>Yubordi</span>
                </div>
                <div className={`h-1 flex-1 -mx-4 z-0 ${l.holat === 'tasdiqlangan' || l.holat === 'pudratchi' || l.holat === 'zakazchik' ? 'bg-[var(--ok)]' : 'bg-[var(--surface-2)]'}`}></div>
                <div className="flex-1 flex flex-col items-center gap-2 relative">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center z-10 ${l.holat === 'tasdiqlangan' || l.holat === 'pudratchi' ? 'bg-[var(--ok)] text-[var(--on-accent)] shadow-[0_0_12px_var(--ok-soft)]' : l.holat === 'zakazchik' ? 'bg-[var(--warn)] text-[var(--on-accent)] animate-pulse shadow-[0_0_12px_var(--ok-soft)]' : 'bg-[var(--surface-2)] text-[var(--text-mute)]'}`}>
                    {l.holat === 'zakazchik' ? <Clock size={16} /> : <CheckCircle2 size={16} />}
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider text-center font-bold ${l.holat === 'tasdiqlangan' || l.holat === 'pudratchi' ? 'text-[var(--ok)]' : l.holat === 'zakazchik' ? 'text-[var(--warn)]' : 'text-[var(--text-mute)]'}`}>Zakazchik<br/>Tasdig'i</span>
                </div>
                <div className={`h-1 flex-1 -mx-4 z-0 ${l.holat === 'tasdiqlangan' ? 'bg-[var(--ok)]' : 'bg-[var(--surface-2)]'}`}></div>
                <div className="flex-1 flex flex-col items-center gap-2 relative">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center z-10 ${l.holat === 'tasdiqlangan' ? 'bg-[var(--ok)] text-[var(--on-accent)] shadow-[0_0_12px_var(--ok-soft)]' : l.holat === 'pudratchi' ? 'bg-[var(--warn)] text-[var(--on-accent)] animate-pulse shadow-[0_0_12px_var(--ok-soft)]' : 'bg-[var(--surface-2)] text-[var(--text-mute)]'}`}>
                    {l.holat === 'tasdiqlangan' ? <CheckCircle2 size={16} /> : l.holat === 'pudratchi' ? <Clock size={16} /> : <Clock size={16} />}
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider text-center font-bold ${l.holat === 'tasdiqlangan' ? 'text-[var(--ok)]' : l.holat === 'pudratchi' ? 'text-[var(--warn)]' : 'text-[var(--text-mute)]'}`}>Pudratchi<br/>Qabuli</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button className="p-2 hover:bg-[var(--surface-3)] rounded-lg text-[var(--text-dim)] hover:text-[var(--text)] transition-colors" title="Ko'rish">
                  <Eye size={20} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {activeTab === 'etirozlar' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[var(--surface-2)] border border-[var(--warn)] rounded-xl p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3">
              <span className="bg-[var(--warn-soft)] text-[var(--warn)] text-xs px-2 py-1 rounded font-bold uppercase">Jarayonda</span>
            </div>
            <div className="flex gap-3 items-center mb-4">
              <AlertCircle className="text-[var(--warn)]" size={24} />
              <h3 className="font-bold text-lg">Poydevor beton markasi bo'yicha e'tiroz</h3>
            </div>
            <p className="text-[var(--text-dim)] text-sm mb-4 leading-relaxed">
              <strong>Zakazchik xati:</strong> Hurmatli loyihachi, geologik xulosaga asosan poydevor uchun M350 emas, balki sulfatga chidamli M400 markali beton ishlatilishi tavsiya qilingan. Iltimos, chizmaga o'zgartirish kiriting.
            </p>
            <div className="flex justify-between items-center text-xs text-[var(--text-mute)]">
              <span>Kimga: Loyiha-Stroy MChJ, Bosh Pudratchi MChJ</span>
              <span>23 Okt, 2026</span>
            </div>
            <div className="mt-4 pt-4 border-t border-[var(--border)] flex gap-2">
              <button className="flex-1 bg-[var(--warn-soft)] hover:bg-[var(--warn-soft)] text-[var(--warn)] py-2 rounded-lg text-sm font-medium transition-colors">Javob yozish</button>
              <button className="flex-1 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text)] py-2 rounded-lg text-sm font-medium transition-colors">Yopish</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Temporary Eye icon since it's missing in imports above sometimes
function Eye(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>; }
