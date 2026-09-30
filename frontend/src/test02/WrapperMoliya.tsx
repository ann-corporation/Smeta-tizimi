import React, { useState } from 'react';
import { Briefcase, CreditCard, FileText } from 'lucide-react';
import TestShartnoma from './TestShartnoma';
import TestTolov from './TestTolov';
import TestFaktura from './TestFaktura';

/* 2026-09-30 egasi: "Smeta & F2" tabi olib tashlandi — smeta, F2, fakt PTO bo'limida
   (/admin/holat, /admin/f2); moliya paneli faqat shartnoma, to'lov va fakturalar. */
export default function WrapperMoliya() {
  const [activeTab, setActiveTab] = useState<'shartnoma' | 'tolov' | 'faktura'>('shartnoma');

  return (
    <div className="h-full flex flex-col bg-transparent">
      {/* Wrapper Tabs */}
      <div className="flex items-center gap-2 px-6 pt-4 border-b border-white/10 bg-black/20">
        <button
          onClick={() => setActiveTab('shartnoma')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'shartnoma' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-white'}`}
        >
          <Briefcase size={16} /> Shartnomalar
        </button>
        <button
          onClick={() => setActiveTab('tolov')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'tolov' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-white'}`}
        >
          <CreditCard size={16} /> To'lovlar (Tranzaksiyalar)
        </button>
        <button
          onClick={() => setActiveTab('faktura')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'faktura' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-white'}`}
        >
          <FileText size={16} /> PDF Fakturalar (AI)
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'shartnoma' && <TestShartnoma />}
        {activeTab === 'tolov' && <TestTolov />}
        {activeTab === 'faktura' && <TestFaktura />}
      </div>
    </div>
  );
}
