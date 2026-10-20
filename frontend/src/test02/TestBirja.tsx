import { MoneyInput } from '../umumiy/ui/MoneyInput';
import { useState, useEffect } from 'react';
import { ShoppingCart, Gavel, PackageSearch, Plus, TrendingDown, Clock, ChevronRight, X, Save, RefreshCw, Handshake, CheckCircle2 } from 'lucide-react';
import { toast } from '../umumiy/ui/Toast';
import { FmtN } from '../lib/format';
import { useKompaniya } from './KompaniyaTanlov';
import {
  sbBirjaSorovOl,
  sbBirjaTakliflarOl,
  sbBirjaRfqYarat,
  sbBirjaTaklifBer,
  type BirjaRfq,
  type BirjaTaklif
} from '../api/t2-birja';

export default function TestBirja() {
  const { joriy } = useKompaniya();
  const [activeTab, setActiveTab] = useState<'rfq' | 'taklif' | 'tarix'>('rfq');
  const [rfqList, setRfqList] = useState<BirjaRfq[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Yangi RFQ
  const [yangiRfq, setYangiRfq] = useState({ nom: '', birlik: 'tonna', hajm: '', izoh: '' });
  const [saqlamoqda, setSaqlamoqda] = useState(false);

  // Tanlangan RFQ va Takliflar
  const [tanlanganRfq, setTanlanganRfq] = useState<BirjaRfq | null>(null);
  const [takliflar, setTakliflar] = useState<BirjaTaklif[]>([]);
  const [taklifYuklanmoqda, setTaklifYuklanmoqda] = useState(false);

  // Yangi taklif berish
  const [yangiTaklif, setYangiTaklif] = useState({ narx: '', izoh: '' });

  const yuklaRfq = async () => {
    setYuklanmoqda(true);
    try {
      const res = await sbBirjaSorovOl();
      setRfqList(res.qatorlar || []);
    } catch (e: any) {
      toast(e.message, 'danger');
    } finally {
      setYuklanmoqda(false);
    }
  };

  useEffect(() => {
    yuklaRfq();
  }, []);

  const handleYaratRfq = async () => {
    if (!joriy) return toast("Kompaniya tanlang", "warn");
    if (!yangiRfq.nom || !yangiRfq.hajm) return toast("Nomi va hajmini kiriting", "warn");

    setSaqlamoqda(true);
    try {
      await sbBirjaRfqYarat({
        nom: yangiRfq.nom,
        birlik: yangiRfq.birlik,
        hajm: Number(yangiRfq.hajm),
        izoh: yangiRfq.izoh,
        kompaniya_id: joriy.id
      });
      toast("Yangi RFQ tenderga qo'yildi!", "ok");
      setIsModalOpen(false);
      setYangiRfq({ nom: '', birlik: 'tonna', hajm: '', izoh: '' });
      yuklaRfq();
    } catch (e: any) {
      toast(e.message, "danger");
    } finally {
      setSaqlamoqda(false);
    }
  };

  const korishRfq = async (r: BirjaRfq) => {
    setTanlanganRfq(r);
    setTaklifYuklanmoqda(true);
    try {
      const res = await sbBirjaTakliflarOl(r.id);
      setTakliflar(res.qatorlar || []);
    } catch (e: any) {
      toast(e.message, 'danger');
    } finally {
      setTaklifYuklanmoqda(false);
    }
  };

  const handleTaklifBer = async () => {
    if (!tanlanganRfq || !joriy) return;
    if (!yangiTaklif.narx) return toast("Narxni kiriting", "warn");

    setSaqlamoqda(true);
    try {
      await sbBirjaTaklifBer(tanlanganRfq.id, joriy.id, Number(yangiTaklif.narx), yangiTaklif.izoh);
      toast("Taklif yuborildi!", "ok");
      setYangiTaklif({ narx: '', izoh: '' });
      // qayta yuklash
      const res = await sbBirjaTakliflarOl(tanlanganRfq.id);
      setTakliflar(res.qatorlar || []);
    } catch (e: any) {
      toast(e.message, "danger");
    } finally {
      setSaqlamoqda(false);
    }
  };

  return (
    <div className="p-6 bg-bg min-h-screen text-text">
      {/* HEADER */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 mb-2">
            <ShoppingCart className="text-cyan-400" />
            B2B Xarid Birjasi (Tenderlar)
          </h1>
          <p className="text-text-dim text-sm max-w-2xl">
            Moddiy ehtiyojlar asosida (Viborka) avtomatik tender so'rovlari (RFQ) yuborish va tijoriy takliflarni taqqoslash.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={yuklaRfq} className="p-2.5 bg-surface border border-border rounded-lg text-text hover:text-white transition-colors">
            <RefreshCw size={18} className={yuklanmoqda ? "animate-spin" : ""} />
          </button>
          <button onClick={() => setIsModalOpen(true)} className="bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-lg shadow-cyan-900/20">
            <Plus size={18} />
            Yangi RFQ Yaratish
          </button>
        </div>
      </div>

      {/* KPI & AI INSIGHT */}
      <div className="bg-gradient-to-r from-cyan-900/20 to-blue-900/10 border border-cyan-500/20 rounded-xl p-5 mb-8 flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0">
          <TrendingDown className="text-cyan-400" size={20} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-cyan-300 mb-1">AI Bozor Tahlili</h3>
          <p className="text-sm text-text-dim leading-relaxed">
            Siz izlayotgan <strong className="text-white">Sement</strong> o'rtacha bozor narxi joriy haftada pasaydi.
            Xaridni hozir amalga oshirish orqali 4% gacha tejamkorlikka erishish mumkin. Tizim eng yaxshi takliflarni avtomatik saralaydi.
          </p>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-1 bg-surface border border-border p-1 rounded-lg w-max mb-6">
        {[
          { id: 'rfq', label: 'Faol So\'rovlar (RFQ)', icon: Gavel },
          { id: 'taklif', label: 'Kelgan Takliflar', icon: PackageSearch },
          { id: 'tarix', label: 'Xarid Tarixi', icon: Clock }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id as any); setTanlanganRfq(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-bg text-white shadow-sm border border-border' : 'text-text-dim hover:text-white hover:bg-surface-2'}`}
          >
            <tab.icon size={16} className={activeTab === tab.id ? 'text-cyan-400' : ''} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* RFQ MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border p-6 rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-6 border-b border-border pb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Gavel className="text-cyan-400" size={20}/>
                Yangi RFQ qo'shish
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-text-dim hover:text-white"><X size={20}/></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-dim mb-1">Tovarning to'liq nomi</label>
                <input
                  value={yangiRfq.nom}
                  onChange={e => setYangiRfq({...yangiRfq, nom: e.target.value})}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-white focus:border-cyan-500 outline-none"
                  placeholder="masalan: M400 Sement"
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-text-dim mb-1">Hajm</label>
                  <input
                    type="number"
                    value={yangiRfq.hajm}
                    onChange={e => setYangiRfq({...yangiRfq, hajm: e.target.value})}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-white font-mono focus:border-cyan-500 outline-none"
                    placeholder="100"
                  />
                </div>
                <div className="w-1/3">
                  <label className="block text-sm font-medium text-text-dim mb-1">O'lchov birligi</label>
                  <select
                    value={yangiRfq.birlik}
                    onChange={e => setYangiRfq({...yangiRfq, birlik: e.target.value})}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-white focus:border-cyan-500 outline-none appearance-none"
                  >
                    <option value="tonna">tonna</option>
                    <option value="m2">m2</option>
                    <option value="m3">m3</option>
                    <option value="kg">kg</option>
                    <option value="dona">dona</option>
                    <option value="litr">litr</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-dim mb-1">Qo'shimcha izoh</label>
                <textarea
                  value={yangiRfq.izoh}
                  onChange={e => setYangiRfq({...yangiRfq, izoh: e.target.value})}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-white focus:border-cyan-500 outline-none min-h-[80px]"
                  placeholder="Zavodga qo'shimcha talablar..."
                />
              </div>

              <button
                onClick={handleYaratRfq}
                disabled={saqlamoqda}
                className="w-full bg-cyan-600 hover:bg-cyan-500 text-white py-2.5 rounded-lg font-medium mt-2 flex items-center justify-center gap-2"
              >
                {saqlamoqda ? <RefreshCw className="animate-spin" size={18}/> : <Save size={18}/>}
                Tenderga e'lon qilish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONTENT: RFQ LIST & TAKLIFLAR */}
      {activeTab === 'rfq' && (
        !tanlanganRfq ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {rfqList.length === 0 && !yuklanmoqda && (
              <div className="col-span-full py-12 text-center text-text-dim bg-surface rounded-xl border border-border">
                Hali hech qanday RFQ e'lon qilinmagan.
              </div>
            )}

            {rfqList.map(rfq => (
              <div key={rfq.id} className="bg-surface border border-border hover:border-cyan-500/50 transition-colors rounded-xl p-5 shadow-lg flex flex-col group">
                <div className="flex justify-between items-start mb-4">
                  <span className="text-xs font-mono font-bold text-text-dim bg-bg px-2 py-1 rounded">#{rfq.id}</span>
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-full ${rfq.holat === 'faol' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'}`}>
                    {rfq.holat}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-white mb-2 leading-tight group-hover:text-cyan-300 transition-colors">{rfq.nom}</h3>

                <div className="flex gap-4 mb-4 pb-4 border-b border-border/50">
                  <div>
                    <p className="text-[10px] uppercase text-text-dim mb-0.5">Talab Hajmi</p>
                    <p className="text-sm font-bold text-sky-400"><FmtN val={rfq.hajm} /> {rfq.birlik}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-text-dim mb-0.5">Sana</p>
                    <p className="text-sm font-medium text-text">{new Date(rfq.yaratilgan_vaqt).toLocaleDateString('uz-UZ')}</p>
                  </div>
                </div>

                <button
                  onClick={() => korishRfq(rfq)}
                  className="w-full mt-auto bg-surface-2 hover:bg-cyan-900/30 hover:text-cyan-300 text-white py-2 rounded-lg text-sm font-medium transition-colors border border-transparent hover:border-cyan-500/30 flex items-center justify-center gap-2"
                >
                  Batafsil & Takliflar <ChevronRight size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-xl shadow-xl overflow-hidden flex flex-col md:flex-row">
            {/* CHAP TOMON: RFQ DETAILS & TAKLIF QO'SHISH */}
            <div className="w-full md:w-1/3 bg-surface-2 p-6 border-r border-border flex flex-col">
              <button onClick={() => setTanlanganRfq(null)} className="text-cyan-400 hover:text-cyan-300 text-sm font-medium flex items-center gap-1 mb-6">
                <ChevronRight size={16} className="rotate-180" /> Orqaga
              </button>

              <div className="mb-6">
                <div className="text-xs font-mono text-text-dim mb-1">RFQ #{tanlanganRfq.id}</div>
                <h2 className="text-xl font-bold text-white leading-tight mb-2">{tanlanganRfq.nom}</h2>
                <div className="inline-block bg-bg border border-border px-3 py-1 rounded text-sm text-sky-400 font-bold mb-4">
                  <FmtN val={tanlanganRfq.hajm} /> {tanlanganRfq.birlik}
                </div>
                {tanlanganRfq.izoh && (
                  <div className="bg-bg/50 p-3 rounded-lg text-sm text-text-dim border border-border">
                    {tanlanganRfq.izoh}
                  </div>
                )}
              </div>

              {tanlanganRfq.kompaniya_id !== joriy?.id && (
                <div className="mt-auto pt-6 border-t border-border">
                  <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><Handshake size={16} className="text-emerald-400"/> Taklif yuborish</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-text-dim mb-1">Sizning narxingiz (so'm/{tanlanganRfq.birlik})</label>
                      <MoneyInput

                        value={yangiTaklif.narx}
                        onValueChange={(moneyValue) => setYangiTaklif({...yangiTaklif, narx: moneyValue})}
                        className="w-full bg-bg border border-border rounded p-2 text-emerald-400 font-bold font-mono outline-none focus:border-emerald-500"
                        placeholder="masalan: 1200000"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-text-dim mb-1">Izoh / Muddat</label>
                      <input
                        type="text"
                        value={yangiTaklif.izoh}
                        onChange={e => setYangiTaklif({...yangiTaklif, izoh: e.target.value})}
                        className="w-full bg-bg border border-border rounded p-2 text-white outline-none focus:border-emerald-500"
                        placeholder="3 kunda yetkazib beramiz"
                      />
                    </div>
                    <button
                      onClick={handleTaklifBer}
                      disabled={saqlamoqda}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded font-medium flex items-center justify-center gap-2"
                    >
                      {saqlamoqda ? <RefreshCw className="animate-spin" size={16}/> : <CheckCircle2 size={16}/>}
                      Yuborish
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* O'NG TOMON: KELIB TUSHKAN TAKLIFLAR RO'YXATI */}
            <div className="w-full md:w-2/3 p-6 bg-bg">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <PackageSearch className="text-cyan-400" />
                Kelib tushgan takliflar ({takliflar.length})
              </h3>

              {taklifYuklanmoqda ? (
                <div className="flex justify-center p-8"><RefreshCw className="animate-spin text-text-dim" /></div>
              ) : takliflar.length === 0 ? (
                <div className="border border-border/50 border-dashed rounded-xl p-8 text-center text-text-dim flex flex-col items-center justify-center">
                  <Clock size={32} className="mb-3 opacity-50" />
                  <p>Hozircha hech qanday zavod taklif bermagan.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin">
                  {takliflar.map((t, idx) => (
                    <div key={t.id} className={`bg-surface border p-4 rounded-xl flex items-center justify-between ${idx === 0 ? 'border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'border-border'}`}>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-white">Kompaniya #{t.kompaniya_id}</span>
                          {idx === 0 && <span className="bg-emerald-500/10 text-emerald-400 text-[10px] px-2 py-0.5 rounded font-bold uppercase border border-emerald-500/20">Eng arzon</span>}
                        </div>
                        <div className="text-sm text-text-dim">{t.izoh || "Izohsiz"}</div>
                        <div className="text-xs text-text-mute mt-2">{new Date(t.yaratilgan_vaqt).toLocaleString('uz-UZ')}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold font-mono text-emerald-400"><FmtN val={t.narx} /></div>
                        <div className="text-xs text-text-dim">so'm/{tanlanganRfq.birlik}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* TARIQ / TAKLIF TAB EMPTY STATES */}
      {activeTab === 'taklif' && (
        <div className="bg-surface border border-border rounded-xl p-12 text-center shadow-xl">
           <PackageSearch size={32} className="text-cyan-400 mx-auto mb-4" />
           <p className="text-text-dim">Bu yerda siz tomondan boshqa kompaniyalarga berilgan takliflar (Sotuv) ko'rinadi.</p>
        </div>
      )}
      {activeTab === 'tarix' && (
        <div className="bg-surface border border-border rounded-xl p-12 text-center shadow-xl">
           <Clock size={32} className="text-cyan-400 mx-auto mb-4" />
           <p className="text-text-dim">Yopilgan va hal qilingan tenderlar tarixi.</p>
        </div>
      )}

    </div>
  );
}
