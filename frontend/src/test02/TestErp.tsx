import { MoneyInput } from '../umumiy/ui/MoneyInput';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { sbKadrlarOl, sbKadrYarat, sbTexnikalarOl, sbTexnikaYarat, sbResursBekor, type KadrMustaqil, type TexnikaMustaqil } from '../api/t2-resurs';
import { Users, Truck, Wrench, ShieldCheck, Plus, Search, Building2, MapPin, HardHat, FileText, CheckCircle2, RefreshCw, Save, X, Trash2 } from 'lucide-react';
import { useKompaniya } from './KompaniyaTanlov';
import { toast } from '../umumiy/ui/Toast';
import { onEntityChanged } from '../api/entity-consistency';

export default function TestErp() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { joriy } = useKompaniya();
  const [modul, setModul] = useState<'kadrlar'|'texnika'|'sifat'>((params.get('modul') as any) || 'kadrlar');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [fNomi, setFNomi] = useState('');
  const [fToifa, setFToifa] = useState('');
  const [fNarx, setFNarx] = useState('');

  const [kadrlarList, setKadrlarList] = useState<KadrMustaqil[]>([]);
  const [texnikaList, setTexnikaList] = useState<TexnikaMustaqil[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [saqlamoqda, setSaqlamoqda] = useState(false);

  const yukla = async () => {
    if (!joriy) return;
    setYuklanmoqda(true);
    try {
      if (modul === 'kadrlar') {
        const res = await sbKadrlarOl(joriy.id);
        setKadrlarList(res.qatorlar || []);
      } else if (modul === 'texnika') {
        const res = await sbTexnikalarOl(joriy.id);
        setTexnikaList(res.qatorlar || []);
      }
    } catch (e: any) {
      toast(e.message, 'danger');
    } finally {
      setYuklanmoqda(false);
    }
  };

  useEffect(() => {
    yukla();
  }, [joriy, modul]);
  useEffect(() => onEntityChanged((event) => {
    const type = modul === 'kadrlar' ? 'kadr' : modul === 'texnika' ? 'texnika' : null;
    if (joriy && type && event.detail.kompaniyaId === joriy.id && event.detail.type === type) yukla();
  }), [joriy, modul]);

  const saqlash = async () => {
    if (!joriy) return;
    if (!fNomi) return toast("Nomini / F.I.Sh kiriting", "warn");
    setSaqlamoqda(true);
    try {
      if (modul === 'kadrlar') {
        await sbKadrYarat({
          kompaniyaId: joriy.id,
          ismSharif: fNomi,
          lavozim: fToifa || 'Ishchi',
          oylikMaosh: Number(fNarx) || undefined
        });
      } else if (modul === 'texnika') {
        await sbTexnikaYarat({
          kompaniyaId: joriy.id,
          nomi: fNomi,
          davlatRaqami: fToifa || undefined,
          yoqilgiMejori: Number(fNarx) || undefined
        });
      }
      toast("Muvaffaqiyatli saqlandi!", "ok");
      setIsFormOpen(false);
      setFNomi('');
      setFToifa('');
      setFNarx('');
      yukla();
    } catch (e: any) {
      toast(e.message, 'danger');
    } finally {
      setSaqlamoqda(false);
    }
  };

  const bekorQil = async (tur: 'kadr' | 'texnika', id: number, version: number, nom: string) => {
    if (!joriy || !confirm('«' + nom + '» bekor qilinsinmi? Tarix saqlanadi.')) return;
    const r = await sbResursBekor(tur, joriy.id, id, version);
    if (r.ok) { toast('Bekor qilindi', 'ok'); yukla(); }
    else toast(r.error || 'Bekor qilinmadi', 'danger');
  };

  return (
    <div className="p-6 bg-bg min-h-screen text-text">

      {/* HEADER */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 mb-2">
            <Building2 className="text-blue-500" />
            Korxona Resurslarini Boshqarish (ERP)
          </h1>
          <p className="text-text-dim text-sm max-w-2xl">
            Kompaniyaning markazlashgan HR, Maxsus texnikalar parki va Mehnat muhofazasi (HSE) boshqaruvi. Bu resurslar Obyektlarga dinamik biriktiriladi.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={yukla} className="p-2.5 bg-surface border border-border rounded-lg text-text hover:text-white transition-colors">
            <RefreshCw size={18} className={yuklanmoqda ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setIsFormOpen(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-lg shadow-blue-900/20"
          >
            <Plus size={18} />
            {modul === 'kadrlar' ? 'Yangi Xodim' : modul === 'texnika' ? 'Yangi Texnika' : 'Yangi Yozuv'}
          </button>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-1 bg-surface border border-border p-1 rounded-lg w-max mb-6">
        {[
          { id: 'kadrlar', label: 'Xodimlar va Brigadalar', icon: Users },
          { id: 'texnika', label: 'Texnika Parki va Mexanizatsiya', icon: Truck },
          { id: 'sifat', label: 'Mehnat Muhofazasi (HSE) va Sifat', icon: ShieldCheck }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setModul(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${modul === tab.id ? 'bg-bg text-white shadow-sm border border-border' : 'text-text-dim hover:text-white hover:bg-surface-2'}`}
          >
            <tab.icon size={16} className={modul === tab.id ? 'text-blue-400' : ''} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* WRITE FORM MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-border flex justify-between items-center bg-bg/50">
              <h3 className="font-bold text-white flex items-center gap-2">
                {modul === 'kadrlar' ? <HardHat className="text-blue-400"/> : <Truck className="text-blue-400"/>}
                {modul === 'kadrlar' ? 'Xodimni ro\'yxatga olish' : 'Texnikani ro\'yxatga olish'}
              </h3>
              <button onClick={() => setIsFormOpen(false)} className="text-text-dim hover:text-white"><X size={20}/></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-dim mb-1">
                  {modul === 'kadrlar' ? 'F.I.Sh' : 'Texnika Nomi / Markasi'}
                </label>
                <input
                  type="text"
                  value={fNomi}
                  onChange={e => setFNomi(e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-white focus:border-accent outline-none"
                  placeholder={modul === 'kadrlar' ? 'G\'aniyev Zafar' : 'CAT 320 Ekskavator'}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-dim mb-1">
                    {modul === 'kadrlar' ? 'Lavozim / Kasb' : 'Davlat Raqami'}
                  </label>
                  <input
                    type="text"
                    value={fToifa}
                    onChange={e => setFToifa(e.target.value)}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-white focus:border-accent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-dim mb-1">
                    {modul === 'kadrlar' ? 'Oylik Maosh' : 'Yoqilg\'i / Motochas'}
                  </label>
                  <MoneyInput grouping={modul === 'kadrlar'} ungroupedType="text"

                    value={fNarx}
                    onValueChange={(moneyValue) => setFNarx(moneyValue.replace(/[^0-9]/g, ''))}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-white font-mono focus:border-accent outline-none"
                  />
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-border mt-4">
                <button onClick={() => setIsFormOpen(false)} className="px-4 py-2 text-text-dim hover:text-white transition-colors">Bekor qilish</button>
                <button
                  onClick={saqlash}
                  disabled={saqlamoqda}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-lg shadow-blue-900/20"
                >
                  {saqlamoqda ? <RefreshCw size={18} className="animate-spin"/> : <Save size={18}/>}
                  Saqlash
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONTENT: KADRLAR */}
      {modul === 'kadrlar' && (
        <div className="bg-surface border border-border rounded-xl shadow-xl overflow-hidden">
          <div className="p-4 border-b border-border bg-bg/50">
            <div className="relative w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={16} />
              <input
                type="text"
                placeholder="Xodim ishlari, kasb yoki brigada bo'yicha..."
                className="w-full bg-surface border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:border-accent outline-none"
              />
            </div>
          </div>
          {kadrlarList.length === 0 && !yuklanmoqda ? (
            <div className="p-8 text-center text-text-dim">
              Hali xodimlar kiritilmagan.
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-surface-2 border-b border-border text-text-dim font-medium">
                  <th className="px-6 py-4">F.I.Sh</th>
                  <th className="px-6 py-4">Kasb / Lavozim</th>
                  <th className="px-6 py-4 text-center">Holat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {kadrlarList.map(k => (
                  <tr key={k.id} className="hover:bg-bg/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-white flex items-center gap-2">
                      <Users size={16} className="text-blue-500" />
                      {k.ism_sharif}
                    </td>
                    <td className="px-6 py-4 text-text-dim">{k.lavozim}</td>
                    <td className="px-6 py-4 text-center">
                      <button onClick={() => navigate('/admin/test/xarita?tugun=kadr:' + k.id)} className="text-[11px] text-sky-400 hover:text-sky-300 mr-2">Mindmap</button>
                      <button onClick={() => bekorQil('kadr', k.id, k.versiya, k.ism_sharif)} className="text-[11px] text-rose-400 hover:text-rose-300 mr-2" title="Soft delete"><Trash2 size={13} /></button>
                      <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider">
                        {k.obyektlar?.length > 0 ? 'Obyektda' : 'Zaxirada'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* CONTENT: TEXNIKA */}
      {modul === 'texnika' && (
        <div className="bg-surface border border-border rounded-xl shadow-xl overflow-hidden">
          <div className="p-4 border-b border-border bg-bg/50">
            <div className="relative w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={16} />
              <input
                type="text"
                placeholder="Texnika nomi yoki davlat raqami bo'yicha..."
                className="w-full bg-surface border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:border-accent outline-none"
              />
            </div>
          </div>
          {texnikaList.length === 0 && !yuklanmoqda ? (
            <div className="p-8 text-center text-text-dim">
              Hali texnikalar kiritilmagan.
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-surface-2 border-b border-border text-text-dim font-medium">
                  <th className="px-6 py-4">Texnika Nomi</th>
                  <th className="px-6 py-4">Davlat Raqami</th>
                  <th className="px-6 py-4 text-center">Holat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {texnikaList.map(t => (
                  <tr key={t.id} className="hover:bg-bg/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-white flex items-center gap-2">
                      <Truck size={16} className="text-amber-500" />
                      {t.nomi}
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-sky-300">
                      {t.davlat_raqami ? (
                        <span className="border border-sky-500/30 px-2 py-0.5 rounded bg-sky-950/20">{t.davlat_raqami}</span>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button onClick={() => navigate('/admin/test/xarita?tugun=texnika:' + t.id)} className="text-[11px] text-sky-400 hover:text-sky-300 mr-2">Mindmap</button>
                      <button onClick={() => bekorQil('texnika', t.id, t.versiya, t.nomi)} className="text-[11px] text-rose-400 hover:text-rose-300 mr-2" title="Soft delete"><Trash2 size={13} /></button>
                      <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider">
                        {t.obyektlar?.length > 0 ? 'Ishlamoqda' : 'Garajda'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* CONTENT: SIFAT (HSE) */}
      {modul === 'sifat' && (
        <div className="bg-surface border border-border rounded-xl p-12 text-center shadow-xl">
          <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-emerald-500/20">
            <ShieldCheck size={32} className="text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-3">Sifat va Mehnat Muhofazasi Jurnallari (HSE)</h2>
          <p className="text-text-dim max-w-lg mx-auto mb-8">
            Jarayonda... Obyektlardagi yong'in xavfsizligi, instruktaj jurnallari va GOST sifat nazorati aktlari shu yerda yuritiladi.
          </p>
        </div>
      )}

    </div>
  );
}
