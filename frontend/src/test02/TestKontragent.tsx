import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Building2, UserCircle, MapPin, CreditCard, CheckCircle2, AlertCircle, Building, Save, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from '../umumiy/ui/Toast';
import { useKompaniya } from './KompaniyaTanlov';
import { sbKontragentSaqla, sbKontragentlarOl, sbKontragentOchir, type Kontragent } from '../api/t2-kontragent';
import { onEntityChanged } from '../api/entity-consistency';

export default function TestKontragent() {
  const navigate = useNavigate();
  const { joriy } = useKompaniya();
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [royxatYuklanmoqda, setRoyxatYuklanmoqda] = useState(false);
  const [kontragentlar, setKontragentlar] = useState<Kontragent[]>([]);
  const [rolFiltr, setRolFiltr] = useState('');
  const korinadigan = rolFiltr ? kontragentlar.filter((k) => k.mavqe === rolFiltr) : kontragentlar;

  // Form states
  const [inn, setInn] = useState('');
  const [formData, setFormData] = useState({
    nom: '',
    rahbar: '',
    manzil: '',
    mfo: '',
    hisobRaqam: '',
    qqsTolovchi: false,
    mavqe: 'subpudratchi' as any
  });

  const royxatniYangila = async () => {
    if (!joriy) return;
    setRoyxatYuklanmoqda(true);
    try {
      const res = await sbKontragentlarOl(joriy.id);
      setKontragentlar(res.qatorlar || []);
    } catch (e: any) {
      toast(e.message, 'danger');
    } finally {
      setRoyxatYuklanmoqda(false);
    }
  };

  useEffect(() => {
    royxatniYangila();
  }, [joriy]);
  useEffect(() => onEntityChanged((event) => {
    if (joriy && event.detail.kompaniyaId === joriy.id && event.detail.type === 'kontragent') royxatniYangila();
  }), [joriy]);

  const handleFetchINN = async () => {
    // ⚠️ QAT'IY QOIDA: Bu yerda endi mock yo'q!
    // Haqiqiy Didox/Soliq API bog'lanmaguncha biz faqat ma'lumotni qo'lda kiritishni so'raymiz.
    toast("Didox API hali ulanmagan. Iltimos, ma'lumotlarni qo'lda kiriting.", "warn");
  };

  const handleSave = async () => {
    if (!joriy) return;
    if (!formData.nom.trim()) {
      toast("Kompaniya nomini kiritish shart!", "danger");
      return;
    }

    setYuklanmoqda(true);
    try {
      await sbKontragentSaqla({
        kompaniyaId: joriy.id,
        inn: inn || undefined,
        nom: formData.nom,
        rahbar: formData.rahbar,
        manzil: formData.manzil,
        mfo: formData.mfo,
        hisobRaqam: formData.hisobRaqam,
        qqsTolovchi: formData.qqsTolovchi,
        mavqe: formData.mavqe
      });
      toast("Kontragent bazaga saqlandi!", "ok");
      
      // Tozalash
      setInn('');
      setFormData({ nom: '', rahbar: '', manzil: '', mfo: '', hisobRaqam: '', qqsTolovchi: false, mavqe: 'subpudratchi' });
      royxatniYangila();
    } catch (e: any) {
      toast(e.message, "danger");
    } finally {
      setYuklanmoqda(false);
    }
  };

  const handleOchir = async (id: number) => {
    if (!confirm("Haqiqatan ham o'chirmoqchimisiz?")) return;
    try {
      await sbKontragentOchir(id);
      toast("O'chirildi", "ok");
      royxatniYangila();
    } catch (e: any) {
      toast(e.message, "danger");
    }
  };

  if (!joriy) {
    return <div className="p-6 text-warn">Kompaniya tanlanmagan</div>;
  }

  return (
    <div className="p-6 bg-bg min-h-screen text-text overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 mb-2 text-white">
            <Building className="text-accent" />
            Kontragentlar va Hamkorlar Reestri
          </h1>
          <p className="text-text-dim text-sm">
            Tizimga yangi Buyurtmachi, Pudratchi, Loyihachi yoki Ta'minotchi qo'shish.
            Hozircha Didox integratsiyasi yo'qligi sababli rekvizitlar qo'lda kiritiladi.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* YANGI QO'SHISH FORMASI */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-surface border border-border rounded-xl p-5 shadow-xl">
              <h2 className="text-lg font-bold text-white mb-4">Yangi kontragent qo'shish</h2>
              
              <div className="space-y-4 text-sm">
                <div>
                  <label className="block font-medium text-text-dim mb-1">STIR (INN)</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      maxLength={9}
                      value={inn}
                      onChange={(e) => setInn(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="9 xonali raqam"
                      className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 font-mono text-white focus:border-accent outline-none"
                    />
                    <button 
                      onClick={handleFetchINN}
                      className="bg-surface-2 hover:bg-surface-3 border border-border text-white px-3 py-2 rounded-lg flex items-center gap-2 transition-colors"
                      title="Didox'dan tortish (Hozircha ishlamaydi)"
                    >
                      <Search size={16} />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-text-dim mb-1">Kompaniya To'liq Nomi *</label>
                  <input 
                    type="text"
                    value={formData.nom}
                    onChange={(e) => setFormData(p => ({...p, nom: e.target.value}))}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-white focus:border-accent outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-medium text-text-dim mb-1">Rahbar F.I.O</label>
                    <input 
                      type="text"
                      value={formData.rahbar}
                      onChange={(e) => setFormData(p => ({...p, rahbar: e.target.value}))}
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-white focus:border-accent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-text-dim mb-1">Mavqei (Roli)</label>
                    <select
                      value={formData.mavqe}
                      onChange={(e) => setFormData(p => ({...p, mavqe: e.target.value as any}))}
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-white focus:border-accent outline-none appearance-none"
                    >
                      <option value="buyurtmachi">Buyurtmachi</option>
                      <option value="pudratchi">Bosh Pudratchi</option>
                      <option value="subpudratchi">Subpudratchi</option>
                      <option value="loyihachi">Loyihachi</option>
                      <option value="taminotchi">Ta'minotchi</option>
                      <option value="laboratoriya">Laboratoriya (Лаборатория)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-text-dim mb-1">Yuridik Manzil</label>
                  <input 
                    type="text"
                    value={formData.manzil}
                    onChange={(e) => setFormData(p => ({...p, manzil: e.target.value}))}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-white focus:border-accent outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-medium text-text-dim mb-1">Hisob Raqami</label>
                    <input 
                      type="text"
                      maxLength={20}
                      value={formData.hisobRaqam}
                      onChange={(e) => setFormData(p => ({...p, hisobRaqam: e.target.value.replace(/[^0-9]/g, '')}))}
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 font-mono text-white focus:border-accent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-text-dim mb-1">MFO Kodi</label>
                    <input 
                      type="text"
                      maxLength={5}
                      value={formData.mfo}
                      onChange={(e) => setFormData(p => ({...p, mfo: e.target.value.replace(/[^0-9]/g, '')}))}
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 font-mono text-white focus:border-accent outline-none"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="qqs"
                    checked={formData.qqsTolovchi}
                    onChange={(e) => setFormData(p => ({...p, qqsTolovchi: e.target.checked}))}
                    className="w-4 h-4 accent-accent rounded border-border"
                  />
                  <label htmlFor="qqs" className="text-sm font-medium text-text cursor-pointer">
                    QQS (NDS) to'lovchisi
                  </label>
                </div>

                <div className="pt-4 mt-4 border-t border-border">
                  <button 
                    onClick={handleSave} 
                    disabled={yuklanmoqda}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg font-medium flex justify-center items-center gap-2 transition-colors shadow-lg shadow-emerald-900/20"
                  >
                    {yuklanmoqda ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />}
                    Bazaga Saqlash
                  </button>
                </div>

              </div>
            </div>
          </div>

          {/* MAVJUD KONTRAGENTLAR RO'YXATI */}
          <div className="lg:col-span-7">
            <div className="bg-surface border border-border rounded-xl shadow-xl flex flex-col h-full">
              <div className="p-4 border-b border-border flex justify-between items-center bg-bg/50 rounded-t-xl">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <Building2 size={18} className="text-accent" />
                  Mavjud Kontragentlar
                </h3>
                <select
                  value={rolFiltr}
                  onChange={(e) => setRolFiltr(e.target.value)}
                  aria-label="Rol bo'yicha filtr"
                  className="ml-auto mr-2 bg-bg border border-border rounded-lg px-2 py-1 text-xs text-text outline-none"
                >
                  <option value="">Barcha rollar</option>
                  <option value="buyurtmachi">Buyurtmachi</option>
                  <option value="pudratchi">Bosh Pudratchi</option>
                  <option value="subpudratchi">Subpudratchi</option>
                  <option value="loyihachi">Loyihachi</option>
                  <option value="taminotchi">Ta'minotchi</option>
                  <option value="laboratoriya">Laboratoriya</option>
                </select>
                <button onClick={royxatniYangila} className="p-1.5 text-text-dim hover:text-white transition-colors">
                  <RefreshCw size={16} className={royxatYuklanmoqda ? "animate-spin" : ""} />
                </button>
              </div>

              <div className="p-0 overflow-y-auto max-h-[600px] scrollbar-thin">
                {korinadigan.length === 0 ? (
                  <div className="p-8 text-center text-text-dim">
                    Hozircha hech qanday kontragent qo'shilmagan.
                  </div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="bg-surface-2 sticky top-0 z-10 shadow-sm border-b border-border">
                      <tr className="text-text-dim font-medium">
                        <th className="px-4 py-3">Kompaniya Nomi</th>
                        <th className="px-4 py-3">INN / MFO</th>
                        <th className="px-4 py-3">Roli</th>
                        <th className="px-4 py-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {korinadigan.map(k => (
                        <tr key={k.id} className="hover:bg-bg/50 transition-colors group">
                          <td className="px-4 py-3">
                            <div className="font-bold text-white">{k.nom}</div>
                            <div className="text-[11px] text-text-dim flex items-center gap-1 mt-0.5">
                              {k.qqs_tolovchi ? <CheckCircle2 size={10} className="text-emerald-400" /> : <AlertCircle size={10} className="text-rose-400" />}
                              {k.qqs_tolovchi ? 'QQS to\'lovchi' : 'QQS siz'}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-mono text-xs">{k.inn || '-'}</div>
                            <div className="font-mono text-[11px] text-text-dim mt-0.5">{k.mfo || '-'}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="bg-surface-2 text-text px-2 py-1 rounded text-[11px] font-medium border border-border uppercase">
                              {k.mavqe || '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => navigate('/admin/test/xarita?tugun=kontragent:' + k.id)}
                              className="text-[11px] text-sky-400 hover:text-sky-300 mr-2"
                            >Mindmap</button>
                            <button 
                              onClick={() => handleOchir(k.id)}
                              className="text-text-dim hover:text-rose-400 transition-colors p-1.5 opacity-0 group-hover:opacity-100"
                              title="O'chirish"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
