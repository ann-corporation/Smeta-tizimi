import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, TrendingUp, HandCoins, Building2, CreditCard, PieChart, Activity, Briefcase, FileSignature, Receipt, Truck, HardHat, ShoppingCart, Info, Search, Trash2 } from 'lucide-react';
import { AuroraBackground, GlassCard } from '../../boss/sahifalar/Umumiy';
import { FmtN } from '../../lib/format';
import { useBuxDashboard, useXarajatlar, useXarajatYoz, useXarajatOchir } from '../../api/hooks';
import { Skelet } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';

export function Buxgalteriya() {
  const dash = useBuxDashboard();
  const xarajatlar = useXarajatlar();
  /* ⚡⚡⚡ 2026-08-17 (audit): `apiXarajatYoz` va `apiXarajatOchir` GAS da BOR,
     hook'lari ham YOZILGAN — lekin hech bir sahifa ularni chaqirmasdi. Ya'ni
     ХАРАЖАТЛАР varag'ini FAQAT Google Sheets ni qo'lda ochib to'ldirish
     mumkin edi. Endi saytdan kiritiladi va o'chiriladi. */
  const xarajatYoz = useXarajatYoz();
  const xarajatOchir = useXarajatOchir();
  const [qidiruv, setQidiruv] = useState('');
  const [tab, setTab] = useState<'kassa' | 'xarajat' | 'shartnoma'>('kassa');
  const [yangi, setYangi] = useState({ sana: '', toifa: '', summa: '', izoh: '' });

  if (dash.isLoading || xarajatlar.isLoading || !dash.data) {
    return (
      <AuroraBackground>
        <div className="p-8"><Skelet qatorlar={5} /></div>
      </AuroraBackground>
    );
  }

  const d = dash.data;
  const xarajatRoyxati = xarajatlar.data || [];

  /* ⚠️ 2026-08-17 (audit): avval bu funksiya `x.manba` bo'yicha ikonka
     tanlardi va jadvalda «Manba va Toifa» ustuni bor edi. Lekin ХАРАЖАТЛАР
     varag'ida MANBA USTUNI YO'Q — `apiXarajatOl` faqat
     {row, sana, toifa, summa, izoh} qaytaradi. Ya'ni `x.manba` HAR DOIM
     undefined bo'lib, hamma qatorda bir xil «Boshqa» yozuvi chiqardi:
     foydalanuvchi ma'lumot bor deb o'ylaydigan, aslida bo'sh ustun.
     Endi ikonka TOIFA bo'yicha tanlanadi — bu maydon haqiqatan mavjud. */
  const xarajatToifaIkona = (toifa: string | undefined) => {
    const t = String(toifa || '').toLowerCase();
    if (/кадр|kadr|ish haqi|иш ҳақи|oylik/.test(t)) return <HardHat size={14} className="text-blue-400" />;
    if (/таъмин|taminot|материал|material|xarid/.test(t)) return <ShoppingCart size={14} className="text-yellow-400" />;
    if (/техник|texnika|транспорт|yoqilg|ёқилғ/.test(t)) return <Truck size={14} className="text-purple-400" />;
    return <Receipt size={14} className="text-slate-400" />;
  };

  async function xarajatQosh() {
    const summa = Number(String(yangi.summa).replace(/[^\d.-]/g, ''));
    if (!summa) { toast('Summa kiriting', 'warn'); return; }
    if (!yangi.toifa.trim()) { toast('Toifa kiriting', 'warn'); return; }
    try {
      await xarajatYoz.mutateAsync({
        sana: yangi.sana || undefined,
        toifa: yangi.toifa.trim(),
        summa,
        izoh: yangi.izoh,
      });
      setYangi({ sana: '', toifa: '', summa: '', izoh: '' });
      toast('Xarajat qo\'shildi', 'ok');
    } catch (e: any) { toast(`Qo'shilmadi: ${e.message}`, 'danger', undefined, 9000); }
  }

  async function xarajatOchirish(x: { row: number; sana?: string; toifa?: string; summa?: number }) {
    if (!window.confirm(`Xarajat o'chirilsinmi?\n${x.sana || ''} · ${x.toifa || ''}\n`
      + `${(x.summa || 0).toLocaleString('ru-RU')} so'm`)) return;
    try {
      await xarajatOchir.mutateAsync(x.row);
      toast('Xarajat o\'chirildi', 'ok');
    } catch (e: any) { toast(`O'chirilmadi: ${e.message}`, 'danger', undefined, 9000); }
  }

  const filtrlanganXarajatlar = xarajatRoyxati.filter(x => 
    /* ⚡ 2026-08-16 (audit H8): izoh/toifa bo'sh bo'lsa
       `undefined.toLowerCase()` sahifani BUTUNLAY qulatardi (oq ekran). */
    String(x.izoh ?? '').toLowerCase().includes(qidiruv.toLowerCase()) || 
    String(x.toifa ?? '').toLowerCase().includes(qidiruv.toLowerCase())
  );

  return (
    <AuroraBackground>
      <div className="max-w-[1600px] mx-auto p-6 flex flex-col h-full overflow-hidden relative z-10">
        
        <header className="mb-6">
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-400 tracking-tight flex items-center gap-3">
            <Wallet className="text-emerald-400" size={32} />
            Yagona Buxgalteriya va Moliya
          </h1>
          <p className="text-slate-400 mt-2 text-sm">Barcha modullardagi (Ta'minot, Kadrlar, Texnika) tranzaksiyalar markazi</p>
        </header>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <GlassCard className="p-5 flex items-center gap-4 hover:bg-white/5 transition-colors border-emerald-500/20">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <CreditCard size={24} />
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Kassa Qoldig'i</div>
              <div className="text-2xl font-bold font-mono text-white"><FmtN val={d.kassaQoldiq} qisqa /></div>
            </div>
          </GlassCard>
          
          <GlassCard className="p-5 flex items-center gap-4 hover:bg-white/5 transition-colors border-blue-500/20">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400">
              <TrendingUp size={24} />
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Bizning Haqimiz (Debitor)</div>
              <div className="text-2xl font-bold font-mono text-emerald-300"><FmtN val={d.jamiDebitor} qisqa /></div>
            </div>
          </GlassCard>

          <GlassCard className="p-5 flex items-center gap-4 hover:bg-white/5 transition-colors border-rose-500/20">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-400">
              <HandCoins size={24} />
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Qarzimiz (Kreditor)</div>
              <div className="text-2xl font-bold font-mono text-rose-300"><FmtN val={d.jamiKreditor} qisqa /></div>
            </div>
          </GlassCard>

          <GlassCard className="p-5 flex items-center gap-4 hover:bg-white/5 transition-colors border-orange-500/20">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-400">
              <PieChart size={24} />
            </div>
            <div>
              {/* ⚠️ 2026-08-17 (audit): yorliq «Jami Xarajat (Modullardan)» edi,
                  lekin `jamiXarajat` — `apiXarajatOl()` yig'indisi, ya'ni
                  ХАРАЖАТЛАР varag'i. Modullar buxgalteriya daftariga hali
                  ULANMAGAN (pastdagi blok shuni rostini aytadi), demak yorliq
                  mavjud bo'lmagan manbani ko'rsatib turgan edi. */}
              <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Jami Xarajat (qo'lda kiritilgan)</div>
              <div className="text-2xl font-bold font-mono text-white"><FmtN val={d.jamiXarajat} qisqa /></div>
            </div>
          </GlassCard>
        </div>

        <div className="flex-1 bg-[#0B0E14]/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          
          <div className="p-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-4 bg-white/5">
            <div className="flex gap-2">
               <button 
                 onClick={() => setTab('kassa')}
                 className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${tab === 'kassa' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25' : 'bg-black/40 text-slate-400 hover:text-white border border-white/10'}`}
               >
                 <Activity size={16} /> Asosiy Analitika
               </button>
               <button 
                 onClick={() => setTab('xarajat')}
                 className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${tab === 'xarajat' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25' : 'bg-black/40 text-slate-400 hover:text-white border border-white/10'}`}
               >
                 <Receipt size={16} /> Xarajatlar tarixi
               </button>
               <button 
                 onClick={() => setTab('shartnoma')}
                 className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${tab === 'shartnoma' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25' : 'bg-black/40 text-slate-400 hover:text-white border border-white/10'}`}
               >
                 <FileSignature size={16} /> Shartnomalar Holati
               </button>
            </div>

            {tab === 'xarajat' && (
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Izoh bo'yicha izlash..."
                  value={qidiruv}
                  onChange={e => setQidiruv(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                />
              </div>
            )}
          </div>

          <div className="flex-1 overflow-auto scrollbar-thin">
            
            {tab === 'kassa' && (
              <div className="p-8">
                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <GlassCard className="p-6 bg-blue-500/5 border-blue-500/20 relative overflow-hidden">
                       <h3 className="text-xl font-bold text-blue-400 flex items-center gap-2 mb-6">
                         <Building2 size={24} /> Obyektlar Bo'yicha Rentabellik
                       </h3>
                       <div className="space-y-6 relative z-10">
                          <div className="flex justify-between items-end border-b border-white/5 pb-2">
                             <div>
                               <div className="text-sm font-bold text-white">Shartnomaviy Summa</div>
                               <div className="text-xs text-slate-400 mt-1">Jami kutilayotgan daromad</div>
                             </div>
                             <div className="text-xl font-mono text-blue-300"><FmtN val={d.jami.dog} /> so'm</div>
                          </div>
                          <div className="flex justify-between items-end border-b border-white/5 pb-2">
                             <div>
                               <div className="text-sm font-bold text-white">Bajarilgan Ishlar (F2)</div>
                               <div className="text-xs text-emerald-400 mt-1">Haqiqatda bajarilgan hajm</div>
                             </div>
                             <div className="text-xl font-mono text-emerald-300"><FmtN val={d.jami.bajarilgan} /> so'm</div>
                          </div>
                          <div className="flex justify-between items-end border-b border-white/5 pb-2">
                             <div>
                               <div className="text-sm font-bold text-white">Tushgan To'lovlar</div>
                               <div className="text-xs text-slate-400 mt-1">Kassaga kirim qilingan pul</div>
                             </div>
                             <div className="text-xl font-mono text-emerald-400 font-bold"><FmtN val={d.jami.tolangan} /> so'm</div>
                          </div>
                       </div>
                    </GlassCard>

                    <GlassCard className="p-6 bg-emerald-500/5 border-emerald-500/20">
                       <h3 className="text-xl font-bold text-emerald-400 flex items-center gap-2 mb-6">
                         <Briefcase size={24} /> Modullardan Tushgan Xarajatlar
                       </h3>
                       <div className="space-y-4">
                          <div className="flex items-center gap-4 bg-black/40 p-4 rounded-xl border border-white/5">
                             <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center text-yellow-400"><ShoppingCart size={20}/></div>
                             <div className="flex-1">
                               <div className="text-sm font-bold text-white">Ta'minot va Materiallar</div>
                               <div className="text-xs text-slate-400">Markaziy Ombordan kiritilgan</div>
                             </div>
                             {/* ⚡⚡⚡ 2026-08-16 SOXTA RAQAM OLIB TASHLANDI (audit C5).
                                 Bu yerda `18500000` QO'LDA YOZILGAN test raqami turgandi
                                 va u HAQIQIY moliyaviy ma'lumot sifatida ko'rsatilardi.
                                 Rahbar shu raqamga qarab qaror qabul qilishi mumkin edi.
                                 Ta'minot moduli buxgalteriya daftariga hali ulanmagan —
                                 shuni ROSTINI aytamiz, son o'ylab topmaymiz. */}
                             <div className="text-[12px] text-slate-500 italic">ma'lumot ulanmagan</div>
                          </div>
                          <div className="flex items-center gap-4 bg-black/40 p-4 rounded-xl border border-white/5">
                             <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400"><HardHat size={20}/></div>
                             <div className="flex-1">
                               <div className="text-sm font-bold text-white">Kadrlar va Oylik Maoshlar</div>
                               <div className="text-xs text-slate-400">Tabel bo'yicha hisoblangan qarz</div>
                             </div>
                             <div className="text-[12px] text-slate-500 italic">ma'lumot ulanmagan</div>
                          </div>
                          <div className="flex items-center gap-4 bg-black/40 p-4 rounded-xl border border-white/5">
                             <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400"><Truck size={20}/></div>
                             <div className="flex-1">
                               <div className="text-sm font-bold text-white">Texnika va Yoqilg'i</div>
                               <div className="text-xs text-slate-400">Avtomat sarflandi va remont</div>
                             </div>
                             <div className="text-[12px] text-slate-500 italic">ma'lumot ulanmagan</div>
                          </div>
                       </div>
                       
                       <div className="mt-6 flex items-start gap-3 text-xs text-slate-400 bg-blue-500/10 p-4 rounded-lg border border-blue-500/20">
                          <Info size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
                          <p>Barcha xarajatlar To'lovlar moduli bo'limi orqali kassadan chiqarilmaydi. Ular modullarda qayd etilganda kreditor (qarz) ga o'tadi va Moliya bo'limi tomonidan tasdiqlangach kassadan haqiqiy pul yechiladi.</p>
                       </div>
                    </GlassCard>
                 </div>
              </div>
            )}

            {tab === 'xarajat' && (
              <div>
                {/* ⚡ 2026-08-17 (audit): kiritish formasi. Avval bu bo'lim faqat
                    o'qish edi va ХАРАЖАТЛАР varag'ini to'ldirishning saytdagi
                    yo'li YO'Q edi (API bor, UI yo'q). */}
                <div className="px-6 py-4 border-b border-white/10 bg-black/20">
                  <p className="text-[11px] uppercase tracking-widest text-slate-400 mb-3">Yangi xarajat</p>
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] text-slate-500 uppercase">Sana</span>
                      <input type="date" value={yangi.sana}
                        onChange={(e) => setYangi({ ...yangi, sana: e.target.value })}
                        className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white
                                   focus:outline-none focus:border-emerald-500/50 w-[150px]" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] text-slate-500 uppercase">Toifa *</span>
                      <input value={yangi.toifa}
                        onChange={(e) => setYangi({ ...yangi, toifa: e.target.value })}
                        placeholder="masalan: Ёқилғи"
                        className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white
                                   focus:outline-none focus:border-emerald-500/50 w-[170px]" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] text-slate-500 uppercase">Summa *</span>
                      <MoneyInput  value={yangi.summa}
                        onValueChange={(moneyValue) => setYangi({ ...yangi, summa: moneyValue })}
                        className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white
                                   text-right focus:outline-none focus:border-emerald-500/50 w-[160px]" />
                    </label>
                    <label className="flex flex-col gap-1 flex-1 min-w-[180px]">
                      <span className="text-[10px] text-slate-500 uppercase">Izoh</span>
                      <input value={yangi.izoh}
                        onChange={(e) => setYangi({ ...yangi, izoh: e.target.value })}
                        placeholder="ixtiyoriy"
                        className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white
                                   focus:outline-none focus:border-emerald-500/50 w-full" />
                    </label>
                    <button onClick={xarajatQosh} disabled={xarajatYoz.isPending}
                      className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white
                                 text-sm font-bold transition-colors disabled:opacity-40">
                      {xarajatYoz.isPending ? 'Saqlanmoqda…' : '+ Qo\'shish'}
                    </button>
                  </div>
                </div>

                <table className="w-full text-left border-collapse">
                  <thead className="bg-black/60 sticky top-0 z-20 backdrop-blur-md">
                    <tr>
                      <th className="py-4 px-6 text-xs text-slate-400 font-bold uppercase tracking-wider w-24">Sana</th>
                      {/* «Manba va Toifa» → «Toifa»: manba ustuni jadvalda YO'Q edi,
                          har qatorda bir xil «Boshqa» chiqardi */}
                      <th className="py-4 px-6 text-xs text-slate-400 font-bold uppercase tracking-wider w-48">Toifa</th>
                      <th className="py-4 px-6 text-xs text-slate-400 font-bold uppercase tracking-wider">Izoh / Tranzaksiya detali</th>
                      <th className="py-4 px-6 text-xs text-slate-400 font-bold uppercase tracking-wider text-right w-48">Summa</th>
                      <th className="py-4 px-4 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrlanganXarajatlar.map((x: any, idx: number) => (
                      <motion.tr
                        key={x.row}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group"
                      >
                        <td className="py-4 px-6 text-sm text-slate-400 font-mono">{x.sana}</td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
                            {xarajatToifaIkona(x.toifa)} {x.toifa || '—'}
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="text-sm text-slate-300">{x.izoh}</div>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="text-base font-bold font-mono text-rose-400 bg-rose-500/10 px-3 py-1 rounded inline-block border border-rose-500/20">
                            - <FmtN val={x.summa} />
                          </div>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <button onClick={() => xarajatOchirish(x)}
                            disabled={xarajatOchir.isPending}
                            aria-label="Xarajatni o'chirish"
                            title="Xarajatni o'chirish"
                            className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10
                                       opacity-0 group-hover:opacity-100 focus-visible:opacity-100
                                       transition-all disabled:opacity-40">
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                    {filtrlanganXarajatlar.length === 0 && (
                      <tr><td colSpan={5} className="py-12 text-center text-slate-500">
                        {qidiruv ? `«${qidiruv}» bo'yicha topilmadi` : 'Hali xarajat kiritilmagan — yuqoridagi formadan qo\'shing'}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'shartnoma' && (
              <table className="w-full text-left border-collapse">
                <thead className="bg-black/60 sticky top-0 z-20 backdrop-blur-md">
                  <tr>
                    <th className="py-4 px-6 text-xs text-slate-400 font-bold uppercase tracking-wider">Shartnoma / Obyekt</th>
                    <th className="py-4 px-6 text-xs text-slate-400 font-bold uppercase tracking-wider text-right">Summa (Kelishuv)</th>
                    <th className="py-4 px-6 text-xs text-slate-400 font-bold uppercase tracking-wider text-right">Bajarilgan Ish (F2)</th>
                    <th className="py-4 px-6 text-xs text-slate-400 font-bold uppercase tracking-wider text-right">Kassaga Tushgan</th>
                    <th className="py-4 px-6 text-xs text-slate-400 font-bold uppercase tracking-wider text-center">Holat</th>
                  </tr>
                </thead>
                <tbody>
                  {d.qatorlar.map((r: any, idx: number) => (
                    <motion.tr 
                      key={r.no}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group"
                    >
                      <td className="py-4 px-6">
                        <div className="font-semibold text-white/90 text-sm flex items-center gap-2"><FileSignature size={14} className="text-blue-400" /> № {r.no}</div>
                        <div className="text-xs text-slate-400 mt-1">{r.nomi} ({r.taraf})</div>
                      </td>
                      <td className="py-4 px-6 text-right font-mono text-sm text-slate-300 font-bold"><FmtN val={r.dog_summa} /></td>
                      <td className="py-4 px-6 text-right font-mono text-sm text-emerald-400">
                        <FmtN val={r.bajarilgan} />
                        <div className="text-[10px] text-emerald-500/70 mt-1">{r.bajarilgan_pct}% bajarildi</div>
                      </td>
                      <td className="py-4 px-6 text-right font-mono text-sm text-blue-400 font-bold">
                        <FmtN val={r.tolangan} />
                        <div className="text-[10px] text-blue-500/70 mt-1">{r.tolangan_pct}% to'landi</div>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-1 rounded text-[10px] font-bold uppercase">{r.holat}</span>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            )}

          </div>
        </div>
      </div>
    </AuroraBackground>
  );
}
