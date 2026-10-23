import { useState, useEffect, useRef } from 'react';
import { useBossData, useBossObyekt } from '../../api/hooks';
import { FmtN, formatPercent } from '../../lib/format';
import { MalumotYoshi, Skelet, XatoHolat } from '../../umumiy/ui/Sahifa';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, TrendingUp, Wallet, CheckCircle, Clock, ChevronRight, ChevronDown, FileText, ArrowDownToLine, ArrowUpFromLine, HardHat, Truck, Wrench, Info, Layers, PieChart, Activity, X, AlertTriangle, Cpu, Server, Component, Zap, Users, ExternalLink } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
/* `Sahna3D` importi OLIB TASHLANDI — pastdagi AuroraBackground izohiga qara
   (takroriy WebGL canvas «alpha» yiqilishiga sabab bo'lgan). Fon endi faqat
   qobiqda (AdminShell / BossShell) chiziladi. */

// --- 3D INTERACTIVE BACKGROUND ---
export function AuroraBackground({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-full h-full min-h-screen overflow-hidden text-white font-sans selection:bg-accent/30">
      {/* ⚠️⚠️⚠️ 2026-08-17 — «Cannot read properties of null (reading 'alpha')»
          ILDIZI SHU YERDA EDI.

          Bu yerda `<Sahna3D />` — ya'ni IKKINCHI WebGL canvas ochilardi:
          birinchisini AdminShell (qobiq foni) allaqachon ochib turgan, va
          har bir admin sahifasi shu qobiq ICHIDA joylashgan. Ya'ni har
          sahifada 2 ta og'ir WebGL sahna yashardi.

          Brauzerda bir vaqtda yashovchi WebGL kontekstlari soni cheklangan
          (Chrome ~16). Sahifalar orasida yurganda kontekstlar to'planib,
          brauzer eng eskilarini majburan yo'q qiladi; three.js keyingi
          mount'da yo'qolgan kontekstdan `getContextAttributes().alpha` ni
          o'qiydi — `getContextAttributes()` esa yo'qolgan kontekstda
          spetsifikatsiya bo'yicha `null` qaytaradi → butun sahifa yiqiladi.
          Xato bir necha sahifa aylangandan keyin «deyarli hammasida»
          chiqishi ham shundan.

          YECHIM: takroriy sahna OLIB TASHLANDI. Fon qobiqda bitta marta
          chiziladi va u yerda `Sahna3DXavfsiz` bilan himoyalangan (WebGL
          yiqilsa oddiy gradientga o'tadi, ish sahifasi buzilmaydi).

          ⚠️ Bu yerga qayta `<Sahna3D />` QO'SHMANG. */}

      {/* Static Grid Overlay for texture */}
      <div 
        className="absolute inset-0 z-0 bg-[url('/grid.svg')] opacity-[0.03] pointer-events-none" 
        style={{ backgroundSize: '100px 100px' }}
      />
      <style>{`
        @keyframes cyberGlitch {
          0% { transform: translate(0) }
          20% { transform: translate(-2px, 2px); color: #0ea5e9; text-shadow: 2px 0 #f43f5e, -2px 0 #10b981; }
          21% { transform: translate(0); color: inherit; text-shadow: none; }
          40% { transform: translate(2px, -2px); color: #f43f5e; text-shadow: -2px 0 #0ea5e9, 2px 0 #10b981; }
          41% { transform: translate(0); color: inherit; text-shadow: none; }
          60% { transform: translate(-1px, -1px); color: #10b981; }
          61% { transform: translate(0); color: inherit; }
          80% { transform: translate(1px, 1px); }
          81% { transform: translate(0); }
          100% { transform: translate(0) }
        }
        @keyframes borderSweep {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @media (hover: hover) and (pointer: fine) {
          .glitch-hover:hover {
            animation: cyberGlitch 0.25s infinite;
            cursor: crosshair;
          }
          .laser-border::after {
            content: "";
            position: absolute;
            inset: -1px;
            border-radius: 16px;
            padding: 1px;
            background: linear-gradient(90deg, rgba(14,165,233,0), rgba(14,165,233,0.8), rgba(244,63,94,0.8), rgba(14,165,233,0));
            background-size: 300% 100%;
            animation: borderSweep 4s linear infinite;
            -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            -webkit-mask-composite: xor;
            mask-composite: exclude;
            opacity: 0;
            transition: opacity 0.3s;
            pointer-events: none;
          }
          .group\\/card:hover .laser-border::after {
            opacity: 1;
          }
        }
      `}</style>

      {/* Blur overlays to make text readable */}
      <div className="absolute inset-0 z-0 bg-black/30 pointer-events-none" />

      <div className="relative z-10 w-full h-full flex flex-col">
        {children}
      </div>
    </div>
  );
}

// --- UI SOUNDS (Web Audio API) ---
const useUiSound = () => {
  const playHover = () => {};
  const playClick = () => {};
  return { playHover, playClick };
};

/* ⚠️⚠️ 2026-08-17 — QOTIB QOLISH SABABI (foydalanuvchi: «шу табда
 * ҳаммасини очишни босдим ва пастга тушмоқчи бўлдим — қимирламай қолган»).
 *
 * Avval bu komponentda `useState` bor edi va `onMouseMove` HAR PIKSEL
 * harakatida `setMousePosition` chaqirardi. Ya'ni sichqoncha karta ustidan
 * o'tganda React shu kartani QAYTA CHIZARDI — sekundda yuzlab marta.
 * Obyektlar sahifasida bunday kartalar o'nlab, ustiga 60 fps ishlaydigan
 * WebGL sahna — scroll paytida sichqoncha kartalar ustidan sirg'alib
 * o'tadi va butun oyna muzlab qoladi.
 *
 * ENDI: React holati YO'Q. Sichqoncha koordinatasi to'g'ridan-to'g'ri CSS
 * o'zgaruvchisiga (`--mx`/`--my`) yoziladi va gradient shuni o'qiydi.
 * Natija ko'z uchun AYNI, lekin qayta chizish soni — NOL.
 * Ustiga `requestAnimationFrame` bilan siqamiz: kadrda bir martadan
 * ko'p yozilmaydi.
 *
 * ⚠️ Bu yerga `useState` QAYTARMANG — hover effekti uchun holat kerak emas. */
export function GlassCard({ children, className = '', onClick }: { children: React.ReactNode, className?: string, onClick?: () => void }) {
  const { playClick } = useUiSound();
  const ref = useRef<HTMLDivElement>(null);
  const kadrRef = useRef<number | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (window.innerWidth < 768) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    /* Kadrga bitta yozuv — sichqoncha 1000 hz bo'lsa ham ortiqcha ish yo'q */
    if (kadrRef.current != null) return;
    kadrRef.current = requestAnimationFrame(() => {
      kadrRef.current = null;
      el.style.setProperty('--mx', `${x}px`);
      el.style.setProperty('--my', `${y}px`);
    });
  };

  useEffect(() => () => {
    if (kadrRef.current != null) cancelAnimationFrame(kadrRef.current);
  }, []);

  const handleClick = () => {
    if (onClick) {
      if (window.innerWidth >= 768) playClick();
      onClick();
    }
  };

  return (
    <div
      ref={ref}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      className={`relative bg-slate-800/40 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl overflow-hidden group/card hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)] hover:border-white/20 ${className} laser-border`}
      style={{ ['--mx' as string]: '50%', ['--my' as string]: '50%' }}
    >
      <div
        className="pointer-events-none absolute -inset-px z-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover/card:opacity-100 mix-blend-overlay"
        style={{
          background:
            'radial-gradient(800px circle at var(--mx) var(--my), rgba(255,255,255,0.15), transparent 40%)'
        }}
      />
      <div className="relative z-10 w-full h-full">
        {children}
      </div>
    </div>
  );
}

// --- CHART (Recharts) ---
function FinancialChart({ objects }: { objects: any[] }) {
  const allSubItems = objects.flatMap(sh => sh.subItems || []).filter(o => !o.nom.startsWith('👷'));
  
  if (!allSubItems || allSubItems.length === 0) return null;
  
  const chartData = [...allSubItems].sort((a, b) => b.smeta - a.smeta).slice(0, 15).map(o => ({
    name: o.nom.length > 20 ? o.nom.substring(0, 20) + '...' : o.nom,
    Smeta: o.smeta,
    Fakt: o.fakt,
    F2: o.f2
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900/90 backdrop-blur-xl border border-white/20 p-4 rounded-xl shadow-2xl">
          <p className="text-white font-bold mb-3 border-b border-white/10 pb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-3 text-sm mb-1">
               <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></div>
               <span className="text-slate-300 w-16">{entry.name}:</span>
               <span className="text-white font-mono font-bold"><FmtN val={entry.value} /> so'm</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <GlassCard className="p-6 h-[400px] flex flex-col">
      <h3 className="text-lg font-semibold text-white/90 mb-4 flex items-center gap-2">
        <TrendingUp size={20} className="text-accent" />
        Top 15 Obyektlar Moliyaviy Oqimi
      </h3>
      
      <div className="flex-1 w-full h-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 10, left: 20, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis 
              dataKey="name" 
              stroke="rgba(255,255,255,0.3)" 
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis 
              stroke="rgba(255,255,255,0.3)"
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
              tickFormatter={(value) => `${(value / 1000000).toFixed(0)} mln`}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            <Bar dataKey="Smeta" fill="rgba(255,255,255,0.2)" radius={[4, 4, 0, 0]} barSize={15} />
            <Bar dataKey="Fakt" fill="#34d399" radius={[4, 4, 0, 0]} barSize={15} />
            <Bar dataKey="F2" fill="#38bdf8" radius={[4, 4, 0, 0]} barSize={15} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}

// --- PROFIT AND LOSS (Rentabellik Tahlili) ---
function ProfitAndLoss({ jami, objects, onKpiClick }: { jami: any, objects: any[], onKpiClick: (kpi: any) => void }) {
  const umumiyXarajat = (jami.chel || 0) + (jami.mash || 0) + (jami.mat || 0) + (jami.ob || 0) + (jami.mk || 0) + (jami.kab || 0) + (jami.sub || 0);
  const sofFoyda = (jami.smetaToza || jami.smeta || 0) - umumiyXarajat;
  const asoSmeta = jami.smetaToza || jami.smeta || 0;
  const rentabellik = asoSmeta > 0 ? (sofFoyda / asoSmeta) * 100 : 0;
  
  /* ⚡ 2026-08-16 (audit H12): `jami.progress` kelmasa (server hali
     hisoblamagan bo'lsa) `undefined/100 = NaN` bo'lib, RAHBAR EKRANIDA
     foyda «NaN» ko'rinardi. Endi 0 deb olinadi. */
  const _progress = Number(jami.progress) || 0;
  const realFoyda = (jami.tolangan || 0) - (umumiyXarajat > 0 ? (umumiyXarajat * (_progress / 100)) : 0);

  const handleClick = () => {
    const items = objects.map(o => {
      const oXarajat = (o.chel || 0) + (o.mash || 0) + (o.mat || 0) + (o.ob || 0) + (o.mk || 0) + (o.kab || 0) + (o.sub || 0);
      const oFoyda = (o.smeta || 0) - oXarajat;
      return { nom: o.nom, val: oFoyda };
    }).filter(item => item.val !== 0);
    
    onKpiClick({
      nom: "Sof Foyda (Prognoz)",
      color: "text-emerald-400",
      icon: PieChart,
      total: sofFoyda,
      description: "Tasdiqlangan Umumiy Smeta qiymatidan (Qo'shilgan qiymatsiz/Nalogsiz) Kutilayotgan barcha Xarajatlarni (Material, Ish haqi, Subpodryad va h.k) ayirib tashlangandagi qolgan sof foyda summasi. Bu loyihani tugatgandagi biznesning kutilayotgan daromadi.",
      items: items
    });
  };
  
  return (
    <GlassCard 
      onClick={handleClick}
      className="p-6 h-[320px] flex flex-col relative overflow-hidden group cursor-pointer hover:bg-white/10 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] transform hover:-translate-y-1 active:translate-y-0 transition-all duration-200"
    >
      <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-accent/10 rounded-full blur-3xl group-hover:bg-accent/20 transition-all duration-700 pointer-events-none" />
      <h3 className="text-lg font-semibold text-white/90 mb-4 flex items-center gap-2">
        <PieChart size={20} className="text-emerald-400" />
        Rentabellik va Foyda (Prognoz)
      </h3>
      
      <div className="flex-1 flex flex-col justify-center gap-5 z-10">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Kutilayotgan Sof Foyda</div>
          <div className="text-3xl font-extrabold font-mono text-emerald-400 drop-shadow-md glitch-hover">
            <FmtN val={sofFoyda} />
          </div>
        </div>
        
        <div className="flex gap-4">
          <div className="flex-1 bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col items-center">
            <div className="text-[10px] text-slate-400 uppercase mb-1">Rentabellik</div>
            <div className="text-xl font-bold font-mono text-white flex items-center gap-1 glitch-hover">
              {rentabellik.toFixed(1)}% <Activity size={14} className="text-accent" />
            </div>
          </div>
          <div className="flex-1 bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col items-center" title="Tushgan puldan qilingan ish hajmi xarajati ayirmasi">
            <div className="text-[10px] text-slate-400 uppercase mb-1">Joriy Holat (Kesh)</div>
            <div className={`text-lg font-bold font-mono ${realFoyda >= 0 ? 'text-ok' : 'text-danger'} glitch-hover`}>
              <FmtN val={realFoyda} qisqa />
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

// --- Ticker ---
function NewsTicker({ objects, jami }: { objects: any[], jami: any }) {
  const msgs = [
    `Umumiy Shartnomalar: ${formatPercent(jami.progress)} bajarildi`,
    `Bugungi Kun Tushumi va Qarzlar balansi nazoratda`,
    ...(objects.filter(o => (o.debitor || 0) > 100000000).map(o => `⚠️ DIQQAT: ${o.nom} da yirik debitor qarz!`)),
    ...(objects.filter(o => (o.fakt || 0) - (o.f2 || 0) > 50000000).map(o => `❄️ ${o.nom} da F-2 yopilmagan ishlar mavjud!`))
  ];
  const tickerText = msgs.join("   •   ");
  
  return (
    <div className="fixed bottom-0 left-0 right-0 h-10 bg-black/90 border-t border-accent/20 z-[100] flex items-center overflow-hidden backdrop-blur-md">
      <div className="bg-accent text-black font-bold text-xs h-full flex items-center px-4 uppercase tracking-widest z-10 shadow-[0_0_20px_rgba(14,165,233,0.5)]">
        LIVE TICKER
      </div>
      <div className="flex-1 overflow-hidden relative h-full flex items-center">
        <motion.div 
          initial={{ x: "100%" }}
          animate={{ x: "-100%" }}
          transition={{ repeat: Infinity, duration: Math.max(30, tickerText.length * 0.1), ease: "linear" }}
          className="whitespace-nowrap text-accent font-mono text-sm tracking-wide"
        >
          {tickerText}
        </motion.div>
      </div>
    </div>
  );
}

// --- SMART AI XULOSA ---
function SmartXulosa({ jami, objects }: { jami: any, objects: any[] }) {
  const qarzlar = jami.debitor || 0;
  const tushum = jami.tolangan || 0;
  
  // Obyektlar bo'yicha tahlil (eng yomon ko'rsatkichlar)
  const topDebitor = objects.length > 0 ? objects.reduce((prev, curr) => (prev.debitor || 0) > (curr.debitor || 0) ? prev : curr) : null;
  const topQoldiq = objects.length > 0 ? objects.reduce((prev, curr) => (prev.qoldiq || 0) > (curr.qoldiq || 0) ? prev : curr) : null;
  const muzlaganList = objects.filter(o => (o.fakt || 0) - (o.f2 || 0) > 0);
  const totalMuzlagan = muzlaganList.reduce((sum, o) => sum + ((o.fakt || 0) - (o.f2 || 0)), 0);
  
  let xavf = "Barqaror";
  let xavfColor = "text-emerald-400";
  if (qarzlar > tushum * 0.3) {
    xavf = "Yuqori Xavf (Debitorlar ko'p)";
    xavfColor = "text-danger";
  } else if (qarzlar > tushum * 0.1) {
    xavf = "O'rtacha (Qarzlarni undirish kerak)";
    xavfColor = "text-warn";
  }

  return (
    <GlassCard className="p-6 relative overflow-hidden flex flex-col h-full border-l-4 border-l-accent bg-accent/5 hover:bg-accent/10 transition-colors duration-300">
       <div className="absolute -right-10 -top-10 opacity-10 pointer-events-none">
         <Cpu size={120} className="animate-[pulse_4s_cubic-bezier(0.4,0,0.6,1)_infinite]" />
       </div>
       <div className="absolute top-6 right-6 flex items-center justify-center">
         <div className="absolute w-4 h-4 bg-accent rounded-full animate-ping opacity-70" />
         <div className="relative w-2 h-2 bg-accent rounded-full" />
       </div>
       <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
         <Activity size={20} className="text-accent" /> AI Analitik Xulosa
       </h3>
       <div className="text-slate-300 text-[14px] leading-relaxed relative z-10 space-y-3">
         <p>
           Sizda umumiy hisobda <span className="font-bold text-white"><FmtN val={jami.smeta} qisqa /></span> lik shartnomaviy ishlar bo'lib, bajarilishi <span className="font-bold text-ok">{jami.progress}%</span>.
           Biznesning joriy barqarorligi: <span className={`font-bold ${xavfColor}`}>{xavf}</span>.
         </p>
         
         <div className="bg-black/20 p-3 rounded-xl border border-white/5 space-y-2">
           {topDebitor && topDebitor.debitor > 0 && (
             <div className="flex items-start gap-2">
               <AlertTriangle size={14} className="text-red-400 mt-1 flex-shrink-0" />
               <span>
                 Eng katta debitor qarzdorlik <span className="text-white font-semibold">"{topDebitor.nom}"</span> obyektiga to'g'ri kelmoqda (<span className="text-red-400 font-mono font-bold"><FmtN val={topDebitor.debitor} qisqa /></span>).
               </span>
             </div>
           )}
           {totalMuzlagan > 0 && (
             <div className="flex items-start gap-2">
               <Info size={14} className="text-amber-400 mt-1 flex-shrink-0" />
               <span>
                 Tizimda F-2 bilan yopilmagan (tasdiqlanmagan) jami <span className="text-amber-400 font-mono font-bold"><FmtN val={totalMuzlagan} qisqa /></span> lik muzlagan mablag' mavjud!
               </span>
             </div>
           )}
           {topQoldiq && topQoldiq.qoldiq > 0 && (
             <div className="flex items-start gap-2">
               <Clock size={14} className="text-blue-400 mt-1 flex-shrink-0" />
               <span>
                 <span className="text-white font-semibold">"{topQoldiq.nom}"</span> obyektida eng katta ish hajmi qoldig'i mavjud (<span className="text-blue-400 font-mono font-bold"><FmtN val={topQoldiq.qoldiq} qisqa /></span>).
               </span>
             </div>
           )}
         </div>
       </div>
    </GlassCard>
  );
}

// --- TOP LIST ---
function TopList({ title, icon: Icon, items, color, valKey }: { title: string, icon: any, items: any[], color: string, valKey: string }) {
  return (
    <GlassCard className="p-5 h-full">
      <h3 className="text-[11px] font-bold text-slate-400 mb-4 flex items-center gap-2 uppercase tracking-widest">
        <Icon size={14} className={color} /> {title}
      </h3>
      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="flex justify-between items-center border-b border-white/5 pb-2 last:border-0 last:pb-0 group">
             <div className="text-[13px] text-slate-300 font-medium truncate pr-3 group-hover:text-white transition-colors">{item.nom}</div>
             <div className={`text-sm font-mono font-bold ${color}`}><FmtN val={item[valKey]} qisqa /></div>
          </div>
        ))}
        {items.length === 0 && <div className="text-xs text-slate-500 italic">Ma'lumot topilmadi</div>}
      </div>
    </GlassCard>
  );
}

// --- IERARXIYA (Razdellar va Oy Trendlari) ---
function RazdelRow({ nom }: { nom: string }) {
  const { data, isLoading, error } = useBossObyekt(nom);
  
  if (isLoading) return (
    <tr className="bg-black/20">
      <td colSpan={6} className="py-4 text-center text-accent/70 text-sm">Razdellar yuklanmoqda...</td>
    </tr>
  );
  
  if (error || !data) return (
    <tr className="bg-black/20">
      <td colSpan={6} className="py-4 text-center text-danger/70 text-sm">Xatolik yuz berdi</td>
    </tr>
  );
  
  if (data.rzList?.length === 0) return (
    <tr className="bg-black/20">
      <td colSpan={6} className="py-4 pl-[80px] text-white/40 text-sm italic">Razdellar mavjud emas</td>
    </tr>
  );
  
  const maxVal = Math.max(...(data.oylar || []).map(o => o.val || 0), 1);

  return (
    <>
      {[...(data.rzList ?? [])].sort((a, b) => (b.res || 0) - (a.res || 0)).map((rz, idx) => {
        const pCol = rz.progress >= 70 ? 'text-ok' : rz.progress >= 30 ? 'text-warn' : 'text-danger';
        const bgCol = rz.progress >= 70 ? 'bg-ok' : rz.progress >= 30 ? 'bg-warn' : 'bg-danger';
        return (
          <tr key={`rz-${idx}`} className="bg-black/20 border-b border-white/5 hover:bg-black/30 transition-colors">
            <td className="py-3 pl-[80px] pr-4 text-slate-300 font-medium text-sm flex items-center gap-3">
              <span className="text-white/20 font-mono text-lg">└</span>
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500/50"></div>
              {rz.nom}
            </td>
            <td className="py-3 px-4 text-right font-mono text-white/40"><FmtN val={rz.res} /></td>
            <td className="py-3 px-4 text-right font-mono text-ok/80"><FmtN val={rz.fakt} /></td>
            <td className="py-3 px-4">
              <div className="flex items-center gap-3 justify-end">
                <div className="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full ${bgCol}`} style={{ width: `${Math.min(rz.progress, 100)}%` }} />
                </div>
                <span className={`font-mono font-bold text-xs w-10 text-right ${pCol}`}>{rz.progress}%</span>
              </div>
            </td>
            <td className="py-3 px-4 text-right font-mono text-warn/80"><FmtN val={rz.f2} /></td>
            <td className="py-3 px-4 text-right">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  /* ⚡ 2026-08-16 (audit H11): `split(' - ')[1]` nomda IKKI marta
                     « - » bo'lsa faqat O'RTA bo'lagini olardi va sahifa
                     topilmasdi. Endi to'liq nom uzatiladi. */
                  window.open(`/boss/holat/${encodeURIComponent(nom)}`, '_blank');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-semibold border border-blue-500/20 transition-all hover:scale-105 active:scale-95"
                title="Batafsil ma'lumot (Drill-Down)"
              >
                <ExternalLink size={12} /> Batafsil
              </button>
            </td>
          </tr>
        );
      })}
      
      {/* Oylar Trendi */}
      {data.oylar && data.oylar.length > 0 && (
        <tr className="bg-black/30 border-b border-white/10">
          <td colSpan={6} className="py-4 pl-[80px] pr-8">
            <div className="text-xs text-white/40 font-bold mb-3 uppercase tracking-widest">📈 F-2 Oylik Dinamikasi</div>
            <div className="flex flex-col gap-2">
              {data.oylar.map((oy, idx) => {
                const w = Math.max(2, Math.round((oy.val || 0) / maxVal * 100));
                return (
                  <div key={idx} className="flex items-center gap-4">
                    <div className="w-24 text-xs text-white/50">{oy.oy}</div>
                    <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${w}%` }} transition={{ duration: 0.8 }} className="h-full bg-gradient-to-r from-accent to-indigo-400" />
                    </div>
                    <div className="w-32 text-right font-mono text-xs text-t-rs/90"><FmtN val={oy.val} /></div>
                  </div>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ObyektRow({ obj }: { obj: any }) {
  const [open, setOpen] = useState(false);
  const isSub = obj.nom.startsWith('👷');
  const pCol = obj.progress >= 70 ? 'text-ok' : obj.progress >= 30 ? 'text-warn' : 'text-danger';
  const bgCol = obj.progress >= 70 ? 'bg-ok' : obj.progress >= 30 ? 'bg-warn' : 'bg-danger';
  
  return (
    <>
      <tr onClick={() => setOpen(!open)} className="cursor-pointer bg-white/[0.01] hover:bg-blue-500/[0.05] transition-all border-b border-white/5">
        <td className="py-4 pl-[48px] pr-4 flex items-center gap-3">
          <div className={`w-5 h-5 flex items-center justify-center rounded-md transition-colors ${open ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/40 group-hover:bg-blue-500/10'}`}>
            {!isSub && (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
          </div>
          <span className={`text-[15px] ${isSub ? 'text-white/50' : 'text-blue-100 font-semibold'}`}>
            {!isSub && <FileText size={14} className="inline mr-2 text-blue-400/50" />}
            {obj.nom} 
            {obj.leaf ? <span className="text-[11px] text-white/30 ml-2 font-mono bg-white/5 px-2 py-0.5 rounded-md">[{obj.leaf}]</span> : ''}
            {(obj.fakt - obj.f2) > 0 && <span className="text-xs ml-3 text-warn/90 bg-warn/10 px-2 py-0.5 rounded-full border border-warn/20 shadow-[0_0_10px_rgba(251,191,36,0.1)]">❄️ Muzlagan: <FmtN val={obj.fakt - obj.f2} qisqa /></span>}
          </span>
        </td>
        <td className="py-4 px-4 text-right font-mono text-white/70"><FmtN val={obj.smeta} /></td>
        <td className="py-4 px-4 text-right font-mono text-ok font-medium"><FmtN val={obj.fakt} /></td>
        <td className="py-4 px-4">
          <div className="flex items-center gap-3 justify-end">
            <div className="w-24 h-2 bg-white/5 rounded-full overflow-hidden">
              <div className={`h-full ${bgCol}`} style={{ width: `${Math.min(obj.progress, 100)}%` }} />
            </div>
            <span className={`font-mono font-bold text-sm w-12 text-right ${pCol}`}>{obj.progress}%</span>
          </div>
        </td>
        <td className="py-4 px-4 text-right font-mono text-warn"><FmtN val={obj.f2} /></td>
        <td className="py-4 px-4 text-right">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              window.open(`/boss/holat/${encodeURIComponent(obj.obyekt || obj.nom)}`, '_blank');
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-xs font-bold border border-indigo-500/20 transition-all hover:scale-105 active:scale-95 shadow-[0_0_10px_rgba(99,102,241,0.1)]"
            title="Ushbu obyektning eng kichik detaligacha kirish"
          >
            <ExternalLink size={14} /> Ichiga kirish
          </button>
        </td>
      </tr>
      
      {open && !isSub && (
        <RazdelRow nom={obj.nom} />
      )}
    </>
  );
}

function ShartnomaRow({ shartnoma }: { shartnoma: any }) {
  const [open, setOpen] = useState(false);
  const pCol = shartnoma.progress >= 70 ? 'text-ok' : shartnoma.progress >= 30 ? 'text-warn' : 'text-danger';
  const bgCol = shartnoma.progress >= 70 ? 'bg-ok' : shartnoma.progress >= 30 ? 'bg-warn' : 'bg-danger';

  return (
    <>
      <tr onClick={() => setOpen(!open)} className="cursor-pointer bg-blue-500/[0.02] hover:bg-blue-500/[0.08] transition-all border-b border-blue-500/10 shadow-[inset_0_-1px_0_rgba(255,255,255,0.02)]">
        <td className="py-5 px-4 flex items-center gap-3">
          <div className={`w-6 h-6 flex items-center justify-center rounded-lg shadow-inner transition-transform duration-300 ${open ? 'bg-blue-500/20 text-blue-400 rotate-90' : 'bg-white/10 text-white/70'}`}>
            <ChevronRight size={16} />
          </div>
          <span className="font-extrabold text-white tracking-wide text-[16px] drop-shadow-sm">
            {shartnoma.nom}
            <span className="font-medium text-[11px] text-blue-300/60 ml-3 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20">{shartnoma.subItems?.length || 0} ta OBYEKT</span>
          </span>
          <div className="flex gap-2 ml-4">
             {shartnoma.tolangan > 0 && <span className="text-xs text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-md border border-emerald-400/20 font-mono shadow-[0_0_10px_rgba(52,211,153,0.1)]">💵 Kesh: <FmtN val={shartnoma.tolangan} qisqa /></span>}
             {shartnoma.debitor > 0 && <span className="text-xs text-red-400 bg-red-400/10 px-2 py-1 rounded-md border border-red-400/20 font-mono shadow-[0_0_10px_rgba(248,113,113,0.1)]">⚠ Debitor: <FmtN val={shartnoma.debitor} qisqa /></span>}
          </div>
        </td>
        <td className="py-5 px-4 text-right font-mono font-bold text-accent"><FmtN val={shartnoma.smeta} /></td>
        <td className="py-5 px-4 text-right font-mono font-bold text-ok"><FmtN val={shartnoma.fakt} /></td>
        <td className="py-5 px-4">
          <div className="flex items-center gap-4 justify-end">
            <div className="w-32 h-2.5 bg-black/40 rounded-full overflow-hidden shadow-inner">
              <div className={`h-full ${bgCol}`} style={{ width: `${Math.min(shartnoma.progress, 100)}%` }} />
            </div>
            <span className={`font-mono font-extrabold text-base w-12 text-right ${pCol}`}>{shartnoma.progress}%</span>
          </div>
        </td>
        <td className="py-5 px-4 text-right font-mono font-bold text-warn"><FmtN val={shartnoma.f2} /></td>
        <td className="py-5 px-4 text-right font-mono font-bold text-danger"><FmtN val={shartnoma.qoldiq} /></td>
      </tr>
      
      <AnimatePresence>
        {open && shartnoma.subItems?.map((obj: any, j: number) => (
          <ObyektRow key={`ob-${j}`} obj={obj} />
        ))}
      </AnimatePresence>
    </>
  );
}

// --- KPI MODAL (Tafsilotlar) ---
function KpiModal({ kpi, onClose }: { kpi: any, onClose: () => void }) {
  if (!kpi) return null;
  const KpiIcon = kpi.icon || PieChart;
  
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-2xl bg-[#0B0E14]/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="p-6 border-b border-white/10 flex justify-between items-start bg-white/5 relative z-10">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <KpiIcon size={28} className={kpi.color} />
              {kpi.nom}
            </h2>
            {kpi.description && (
              <div className="mt-3 text-sm text-slate-300 leading-relaxed max-w-xl bg-black/20 p-3 rounded-lg border border-white/5">
                <span className="font-semibold text-white">Asos (Formula):</span> {kpi.description}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors bg-white/5 hover:bg-white/10 rounded-full p-2">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-0 overflow-y-auto flex-1 scrollbar-thin relative z-10">
          <table className="w-full text-left border-collapse">
            <thead className="bg-black/40 sticky top-0 backdrop-blur-xl shadow-sm z-20">
              <tr>
                 <th className="py-4 px-6 text-xs text-white/50 font-bold uppercase tracking-wider">Obyekt / Shartnoma Nomi</th>
                 <th className="py-4 px-6 text-xs text-white/50 font-bold uppercase tracking-wider text-right">Qiymat</th>
                 <th className="py-4 px-6 text-xs text-white/50 font-bold uppercase tracking-wider text-right">Ulush</th>
              </tr>
            </thead>
            <tbody>
              {[...(kpi.items ?? [])].sort((a:any, b:any) => b.val - a.val).map((item:any, idx:number) => (
                <tr key={idx} className="border-b border-white/5 hover:bg-white/[0.04] transition-colors">
                  <td className="py-4 px-6 font-medium text-white/80">
                    <div className="flex items-center gap-3">
                      {item.nom}
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(`/boss/holat/${encodeURIComponent(item.obyekt || item.nom)}`, '_blank');
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 rounded-md text-xs text-white/70"
                        title="Ichiga kirish"
                      >
                        <ExternalLink size={12} /> Batafsil
                      </button>
                    </div>
                  </td>
                  <td className={`py-4 px-6 text-right font-mono font-bold ${kpi.color}`}><FmtN val={item.val} /></td>
                  <td className="py-4 px-6 text-right">
                     <div className="flex items-center gap-2 justify-end">
                       <div className="w-16 h-1.5 bg-black/50 rounded-full overflow-hidden shadow-inner">
                         <div className={`h-full ${kpi.color.replace('text-', 'bg-')}`} style={{ width: `${kpi.total > 0 ? (item.val / kpi.total) * 100 : 0}%` }} />
                       </div>
                       <span className="text-xs text-white/40 font-mono w-10 text-right">{kpi.total > 0 ? ((item.val / kpi.total) * 100).toFixed(1) : 0}%</span>
                     </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-6 bg-black/60 border-t border-white/10 flex justify-between items-center relative z-10 backdrop-blur-xl">
          <span className="text-slate-400 font-bold tracking-widest uppercase text-sm">Jami Summa:</span>
          <span className={`text-3xl font-mono font-black ${kpi.color} drop-shadow-md`}><FmtN val={kpi.total} /></span>
        </div>
      </motion.div>
    </div>
  );
}

// --- KLIK QILGANDA RIPPLE EFFEKTI ---
function ClickRipple() {
  const [ripples, setRipples] = useState<{x: number, y: number, id: number}[]>([]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const newRipple = { x: e.clientX, y: e.clientY, id: Date.now() };
      setRipples(r => [...r, newRipple]);
      setTimeout(() => {
        setRipples(r => r.filter(rip => rip.id !== newRipple.id));
      }, 1000);
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {ripples.map(r => (
        <div 
          key={r.id} 
          className="absolute rounded-full border-2 border-accent/60 opacity-80"
          style={{ 
            left: r.x, top: r.y, width: 40, height: 40, transform: 'translate(-50%, -50%)',
            animation: 'ripple 0.8s cubic-bezier(0, 0, 0.2, 1) forwards'
          }}
        />
      ))}
      <style>{`
        @keyframes ripple {
          0% { transform: translate(-50%, -50%) scale(0); opacity: 1; border-width: 4px; }
          100% { transform: translate(-50%, -50%) scale(4); opacity: 0; border-width: 0px; }
        }
      `}</style>
    </div>
  );
}

export default function Umumiy() {
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useBossData();
  const [activeKpi, setActiveKpi] = useState<any>(null);

  if (isLoading) {
    return (
      <AuroraBackground>
        <ClickRipple />
        <div className="h-screen flex items-center justify-center p-6">
          <div className="max-w-4xl w-full">
            <Skelet qatorlar={5} />
          </div>
        </div>
      </AuroraBackground>
    );
  }

  if (error || !data) {
    return (
      <AuroraBackground>
        <div className="p-6">
          <XatoHolat xato={error || new Error("Ma'lumot yo'q")} qayta={() => refetch()} />
        </div>
      </AuroraBackground>
    );
  }

  return (
    <AuroraBackground>
      <ClickRipple />
      <div className="max-w-[1600px] w-full mx-auto p-6 md:p-8 flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin relative z-10">
        
        {/* Apple-style Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
          <div>
            <motion.h1 
              initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
              className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-blue-100 to-slate-400 tracking-tight drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]"
            >
              Boshqaruv Markazi
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
              className="text-slate-300 text-base mt-3 flex items-center gap-3 font-medium"
            >
              Umumiy smeta hajmi va moliyaviy oqimlar holati
              {dataUpdatedAt && (
                <>
                  <span className="w-1.5 h-1.5 bg-slate-500 rounded-full"></span>
                  <MalumotYoshi vaqt={dataUpdatedAt} />
                </>
              )}
            </motion.p>
          </div>
          
          <motion.button 
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white px-5 py-2.5 rounded-2xl transition-all shadow-xl backdrop-blur-md active:scale-95"
          >
            <RefreshCw size={18} className={isFetching ? 'animate-spin text-accent' : ''} />
            <span className="font-semibold">Yangilash</span>
          </motion.button>
        </header>

        {/* Top KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          {[
            { id: "smeta", nom: "Smeta Jami", qiymat: data.jami.smeta, pct: null, color: "text-white", icon: Wallet, desc: "Barcha obyektlarning tasdiqlangan lokal smetalari (LRV) yig'indisi. Kelajakdagi daromad bazasi." },
            { id: "fakt", nom: "Bajarilgan (Fakt)", qiymat: data.jami.fakt, pct: data.jami.progress, color: "text-ok", bg: "bg-ok", icon: TrendingUp, desc: "Prorablar tomonidan kiritilib, PTB tomonidan tasdiqlangan amaldagi bajarilgan ishlar (F-2) hajmi." },
            { id: "f2", nom: "Tasdiqlangan (F2)", qiymat: data.jami.f2, pct: data.jami.f2pct, color: "text-t-rs", bg: "bg-t-rs", icon: CheckCircle, desc: "Buyurtmachi (Texnadzor) tomonidan rasman tasdiqlangan hujjatli ish hajmi." },
            { id: "qoldiq", nom: "Qoldiq", qiymat: data.jami.qoldiq, pct: null, color: "text-slate-300", icon: Clock, desc: "Smeta summasidan Bajarilgan (Fakt) summasi ayirmasi. Obyektni tugatish uchun qolgan ish hajmi." },
          ].map((kpi, idx) => (
            <motion.div key={`kpi1-${idx}`} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1, duration: 0.6, type: "spring" }}>
              <GlassCard 
                className="p-6 relative group cursor-pointer hover:bg-white/10 transition-colors border-white/10 ring-0 hover:ring-2 hover:ring-accent/50 transform hover:-translate-y-1 active:translate-y-0 duration-200"
                onClick={() => setActiveKpi({
                  nom: kpi.nom, color: kpi.color, icon: kpi.icon, total: kpi.qiymat, description: kpi.desc,
                  items: data.objects.filter(o => (o as any)[kpi.id] > 0).map(o => ({ nom: o.nom, val: (o as any)[kpi.id] }))
                })}
              >
                <div className="absolute -right-8 -top-8 w-40 h-40 bg-white/5 rounded-full blur-3xl group-hover:bg-white/10 transition-colors" />
                <h3 className="text-slate-400 font-semibold flex items-center justify-between mb-3 tracking-wide text-sm uppercase">
                  <div className="flex items-center gap-2">
                    <kpi.icon size={18} className={kpi.color} />
                    {kpi.nom}
                  </div>
                  <div title={kpi.desc} className="cursor-help">
                    <Info size={14} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
                  </div>
                </h3>
                <div className={`text-3xl font-bold tracking-tight font-mono ${kpi.color} glitch-hover`}>
                  <FmtN val={kpi.qiymat} />
                </div>
                {kpi.pct !== null && (
                  <div className="mt-5 flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-black/50 rounded-full overflow-hidden shadow-inner">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(kpi.pct, 100)}%` }} transition={{ duration: 1, delay: 0.5 }} className={`h-full ${kpi.bg} rounded-full`} />
                    </div>
                    <span className={`text-sm font-bold ${kpi.color}`}>{formatPercent(kpi.pct)}</span>
                  </div>
                )}
              </GlassCard>
            </motion.div>
          ))}
        </div>

        {/* Moliya Oqimlari */}
        <h2 className="text-sm font-bold text-slate-400 mb-4 tracking-widest uppercase">Moliyaviy Oqimlar</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {[
            { id: "tolangan", nom: "Tushum (To'langan)", qiymat: data.jami.tolangan, color: "text-emerald-400", icon: ArrowDownToLine, border: "border-emerald-500/30", bg: "bg-emerald-500/5", desc: "Buxgalteriya bo'limi tomonidan kiritilgan (Bank va Kassa orqali) mijozlar tomonidan amalda to'langan mablag'lar." },
            { id: "debitor", nom: "Debitor (Qarz)", qiymat: data.jami.debitor, color: "text-red-400", icon: ArrowUpFromLine, border: "border-red-500/30", bg: "bg-red-500/5", desc: "Tushum va Bajarilgan ish hajmi o'rtasidagi farq. Agar bajarilgan ish tushumdan ko'p bo'lsa, mijoz bizdan qarzdor (Debitor)." },
            { id: "avans", nom: "Avans", qiymat: data.jami.avans, color: "text-amber-400", icon: Layers, border: "border-amber-500/30", bg: "bg-amber-500/5", desc: "Tushum va Bajarilgan ish hajmi o'rtasidagi farq. Agar mijoz ish hajmidan ortiq to'lagan bo'lsa, bizdagi oldindan to'lov qoldig'i (Avans)." },
          ].map((kpi, idx) => (
            <motion.div key={`kpi-mol-${idx}`} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 + idx * 0.05, duration: 0.4 }}>
              <div 
                className={`p-4 rounded-xl border ${kpi.border} ${kpi.bg} backdrop-blur-md flex flex-col items-center text-center group cursor-pointer hover:bg-white/10 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] transform hover:-translate-y-1 active:translate-y-0 transition-all duration-200`}
                onClick={() => setActiveKpi({
                  nom: kpi.nom, color: kpi.color, icon: kpi.icon, total: kpi.qiymat, description: kpi.desc,
                  items: data.objects.filter(o => (o as any)[kpi.id] > 0).map(o => ({ nom: o.nom, val: (o as any)[kpi.id] }))
                })}
              >
                <kpi.icon size={24} className={`${kpi.color} mb-3 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300`} />
                <div className="text-[12px] font-bold text-slate-300 uppercase tracking-widest mb-1 group-hover:text-white transition-colors">{kpi.nom}</div>
                <div className={`text-2xl font-mono font-bold ${kpi.color}`}><FmtN val={kpi.qiymat} qisqa /></div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Operativ Nazorat (Real ERP Data) */}
        <h2 className="text-sm font-bold text-slate-400 mb-4 tracking-widest uppercase">Operativ Nazorat (ERP)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { nom: "Xodimlar", qiymat: data.jami.jamiIshchilar || 0, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", icon: HardHat, suffix: " kishi", desc: "Kadrlar modulidagi (ISHCHILAR varag'i) barcha ro'yxatdan o'tgan ishchilar soni." },
            { nom: "Texnikalar", qiymat: data.jami.jamiTexnikalar || 0, color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20", icon: Truck, suffix: " ta", desc: "Texnika modulidagi (TEXNIKA varag'i) barcha mavjud texnikalar." },
            { nom: "Faol Zayavkalar", qiymat: data.jami.faolZayavkalar || 0, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", icon: AlertTriangle, suffix: " ta", desc: "Ta'minot modulida (ZAYAVKA) yopilmagan va rad etilmagan barcha faol zayavkalar." },
            { nom: "Nuqsonlar (Sifat)", qiymat: data.jami.halQilinmaganNuqsonlar || 0, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", icon: Activity, suffix: " ta", desc: "Sifat modulidagi (NUQSON) hali yopilmagan sifat buzilish holatlari." },
          ].map((kpi, idx) => (
            <motion.div key={`erp-${idx}`} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 + idx * 0.1 }}>
              <div className={`p-5 rounded-2xl border ${kpi.border} ${kpi.bg} flex flex-col items-center justify-center text-center group transition-all duration-300 hover:scale-105 cursor-help`} title={kpi.desc}>
                <kpi.icon size={28} className={`${kpi.color} mb-3 opacity-80 group-hover:opacity-100 group-hover:animate-bounce`} />
                <div className="text-3xl font-extrabold font-mono text-white tracking-tight">
                  <FmtN val={kpi.qiymat} qisqa={false} /> <span className={`text-base font-medium ${kpi.color}`}>{kpi.suffix}</span>
                </div>
                <div className="text-xs text-slate-400 uppercase tracking-widest mt-2 font-bold group-hover:text-white transition-colors">{kpi.nom}</div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Xarajatlar Tahlili (To'liq Backend Data) */}
        <h2 className="text-sm font-bold text-slate-400 mb-4 tracking-widest uppercase">Xarajatlar Tahlili</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
          {[
            { id: "mat", nom: "Material", qiymat: data.jami.mat, color: "text-t-mat", icon: Wrench, border: "border-white/10", bg: "bg-white/5", desc: "Lokal Smetadagi barcha material resurslarning (armatura, beton va h.k) umumiy smeta narxi." },
            { id: "chel", nom: "Ish Haqi", qiymat: data.jami.chel, color: "text-blue-400", icon: HardHat, border: "border-white/10", bg: "bg-white/5", desc: "Lokal Smetadagi ishchilar (T-1, T-2) oylik maoshlari yig'indisi." },
            { id: "mash", nom: "Mexanizm", qiymat: data.jami.mash, color: "text-purple-400", icon: Truck, border: "border-white/10", bg: "bg-white/5", desc: "Lokal Smetadagi mashina va mexanizmlar xarajatlari yig'indisi." },
            { id: "ob", nom: "Uskuna", qiymat: data.jami.ob, color: "text-cyan-400", icon: Server, border: "border-white/10", bg: "bg-white/5", desc: "Obyektga o'rnatiladigan uskunalar (oborudovaniye) xarajatlari." },
            { id: "mk", nom: "Metal", qiymat: data.jami.mk, color: "text-slate-300", icon: Component, border: "border-white/10", bg: "bg-white/5", desc: "Metal konstruksiyalari bilan bog'liq maxsus xarajatlar." },
            { id: "kab", nom: "Kabel", qiymat: data.jami.kab, color: "text-yellow-500", icon: Zap, border: "border-white/10", bg: "bg-white/5", desc: "Kabel va elektrotexnika bo'yicha kiritilgan smeta qiymati." },
            { id: "sub", nom: "Subpodryad", qiymat: data.jami.sub, color: "text-orange-400", icon: Users, border: "border-white/10", bg: "bg-white/5", desc: "Qo'shimcha kelishuvlar yoki 3-tomonlarga (Subpodryadchilarga) beriladigan ishlar summasi." },
          ].map((kpi, idx) => (
            <motion.div key={`kpi-xar-${idx}`} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 + idx * 0.05, duration: 0.4 }}>
              <div 
                className={`p-4 rounded-xl border ${kpi.border} ${kpi.bg} backdrop-blur-md flex flex-col items-center text-center group cursor-pointer hover:bg-white/10 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] transform hover:-translate-y-1 active:translate-y-0 transition-all duration-200 h-full justify-center`}
                onClick={() => setActiveKpi({
                  nom: kpi.nom, color: kpi.color, icon: kpi.icon, total: kpi.qiymat, description: kpi.desc,
                  items: data.objects.filter(o => (o as any)[kpi.id] > 0).map(o => ({ nom: o.nom, val: (o as any)[kpi.id] }))
                })}
              >
                <kpi.icon size={20} className={`${kpi.color} mb-2 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300`} />
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 group-hover:text-white transition-colors">{kpi.nom}</div>
                <div className={`text-lg font-mono font-bold ${kpi.color}`}><FmtN val={kpi.qiymat} qisqa /></div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ⚠️ 2026-07-31: "Obyektlar Geo-Lokatsiyasi" xaritasi OLIB TASHLANDI —
            u haqiqiy obyekt nomlari va haqiqiy moliyaviy raqamlarni
            Math.random() bilan yasalgan SOXTA koordinatalarga qo'yib,
            Toshkent atrofida ko'rsatardi (park esa Navoiyda). Rahbar buni
            haqiqiy joylashuv deb qabul qilishi mumkin edi. GAS'da obyekt
            koordinatalari uchun HECH QANDAY manba yo'q. Haqiqiy koordinata
            maydoni qo'shilgandan keyingina xarita qaytariladi. */}
        <div className="mb-8">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4, duration: 0.6 }}>
            <FinancialChart objects={data.objects || []} />
          </motion.div>
        </div>
        
        <div className="flex flex-col lg:flex-row gap-8 mb-8">
          <motion.div className="lg:w-1/3" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5, duration: 0.6 }}>
            <ProfitAndLoss 
              jami={data.jami} 
              objects={data.objects || []} 
              onKpiClick={(kpi) => setActiveKpi(kpi)} 
            />
          </motion.div>
          
          <motion.div className="lg:w-2/3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5, duration: 0.6 }}>
            <div className="h-[320px]">
              <SmartXulosa jami={data.jami} objects={data.objects || []} />
            </div>
          </motion.div>
        </div>

        {/* AI Top Problems List */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.6 }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
             <div>
                <TopList 
                  title="Top Debitorlar (Qarzlar)" 
                  icon={AlertTriangle} 
                  color="text-red-400" 
                  valKey="debitor"
                  items={[...(data.objects || [])].sort((a,b) => ((b as any).debitor||0) - ((a as any).debitor||0)).filter(o => (o as any).debitor > 0).slice(0, 5)} 
                />
             </div>
             <div>
                <TopList 
                  title="Eng Ko'p Ish Qolgan (Qoldiq)" 
                  icon={Clock} 
                  color="text-amber-400" 
                  valKey="qoldiq"
                  items={[...(data.objects || [])].sort((a,b) => ((b as any).qoldiq||0) - ((a as any).qoldiq||0)).filter(o => (o as any).qoldiq > 0).slice(0, 5)} 
                />
             </div>
          </div>
        </motion.div>

        {/* IERARXIK JADVAL */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.6 }}>
          <h2 className="text-2xl font-bold text-white mb-6 drop-shadow">Ierarxik Moliyaviy Jadval</h2>
          <GlassCard className="w-full overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="bg-black/30 border-b border-white/10">
                  <th className="py-4 px-4 text-xs uppercase tracking-wider text-slate-400 font-bold w-[35%]">Nomi (Shartnoma / Obyekt / Razdel)</th>
                  <th className="py-4 px-4 text-xs uppercase tracking-wider text-slate-400 font-bold text-right">Mijozga narx (so'm)</th>
                  <th className="py-4 px-4 text-xs uppercase tracking-wider text-slate-400 font-bold text-right">Fakt Bajarildi</th>
                  <th className="py-4 px-4 text-xs uppercase tracking-wider text-slate-400 font-bold text-right">Progress</th>
                  <th className="py-4 px-4 text-xs uppercase tracking-wider text-slate-400 font-bold text-right">F-2 Olingan</th>
                  <th className="py-4 px-4 text-xs uppercase tracking-wider text-slate-400 font-bold text-right">Qoldiq</th>
                </tr>
              </thead>
              <tbody>
                {[...(data.objects || [])].sort((a,b) => b.smeta - a.smeta).map((sh, idx) => (
                  <ShartnomaRow key={idx} shartnoma={sh} />
                ))}
              </tbody>
            </table>
          </GlassCard>
        </motion.div>

        {/* Modal Window for Clicked KPIs */}
        <AnimatePresence>
          {activeKpi && <KpiModal kpi={activeKpi} onClose={() => setActiveKpi(null)} />}
        </AnimatePresence>

      </div>
      
      {/* GLOBAL NEWS TICKER */}
      <NewsTicker objects={data.objects || []} jami={data.jami} />
    </AuroraBackground>
  );
}
