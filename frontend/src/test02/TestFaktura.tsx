import { moveRow, RowOrderControls } from '../components/row-order/RowOrderControls';
import { useState, useEffect, useRef } from 'react';
import { sbFakturalarOl, sbFakturaYoz, sbSkladgaYozish, sbT2ObyektlarOl, yangiOperationId, type T2Faktura, type T2Obyekt } from '../api/supabase';
import { useFakturaAiParse } from '../api/hooks';
import { FileText, CheckCircle2, PackagePlus, AlertCircle, Building2, FileUp, X, Save } from 'lucide-react';
import { useKompaniya } from './KompaniyaTanlov';
import { toast } from '../umumiy/ui/Toast';

const invoiceRowKeys = new WeakMap<object, string>();
function invoiceRowKey(row: object) { let key=invoiceRowKeys.get(row); if(!key){key=crypto.randomUUID();invoiceRowKeys.set(row,key);}return key; }

export default function TestFaktura() {
  const { joriy } = useKompaniya();
  const aktKomp = joriy?.id ?? 0;
  const [opId, setOpId] = useState(yangiOperationId());

  const [fakturalar, setFakturalar] = useState<T2Faktura[]>([]);
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [tanlanganObId, setTanlanganObId] = useState<number | null>(null);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [xato, setXato] = useState('');

  // AI o'qish uchun holatlar
  const aiParse = useFakturaAiParse();
  const [modalOchiq, setModalOchiq] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parsingStatus, setParsingStatus] = useState('');
  const [yangiFaktura, setYangiFaktura] = useState<T2Faktura | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aktKomp) { setObyektlar([]); return; }
    sbT2ObyektlarOl(aktKomp).then(r => {
      if (r.ok && r.qatorlar) {
        setObyektlar(r.qatorlar);
        if (r.qatorlar.length > 0) setTanlanganObId(r.qatorlar[0].id);
      }
    });
    fakturalarniYukla();
  }, [aktKomp]);

  const fakturalarniYukla = () => {
    setYuklanmoqda(true);
    sbFakturalarOl(aktKomp).then((r: any) => {
      setYuklanmoqda(false);
      if (r.ok) {
        setFakturalar(r.qatorlar || []);
      } else {
        setXato(r.error || 'Xato yuz berdi');
      }
    });
  };

  const skladgaQabulQil = async (faktura: T2Faktura) => {
    if (!tanlanganObId) {
      setXato('Obyekt tanlanmagan!');
      return;
    }
    
    setYuklanmoqda(true);
    setXato('');
    
    try {
      if (!faktura.items || faktura.items.length === 0) {
        setXato('Bu fakturada tovarlar ro\'yxati yo\'q. Skladga qabul qilib bo\'lmaydi.');
        setYuklanmoqda(false);
        return;
      }
      const items = faktura.items;

      for (const item of items) {
        const res = await sbSkladgaYozish(aktKomp, 'prixod', {
          obyekt_id: tanlanganObId, operatsiya: 'prixod',
          turi: 'mat',
          sana: new Date().toISOString().split('T')[0],
          nomi: item.nomi,
          birligi: item.birligi,
          obyomi: Number(item.miqdori || item.obyomi)
        });
        if (!res.ok) throw new Error(res.error || 'Skladga yozishda xato');
      }

      const fRes = await sbFakturaYoz({ ...faktura, holat: 'tasdiqlangan', operation_id: opId });
      if (!fRes.ok) throw new Error(fRes.error || 'Faktura holatini yangilashda xato');

      fakturalarniYukla();
      setOpId(yangiOperationId());
      toast('Skladga muvaffaqiyatli qabul qilindi', 'ok');
    } catch (err: any) {
      setXato(err.message);
      toast(err.message, 'danger');
    } finally {
      setYuklanmoqda(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsParsing(true);
    setYangiFaktura(null);
    const file = files[0];
    
    try {
      setParsingStatus(`AI o'qimoqda: ${file.name}`);
      
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      const parseRes = await aiParse.mutateAsync({ 
        base64, 
        mimeType: file.type || 'application/pdf', 
        nomi: file.name 
      });

      if (!parseRes?.ok || !parseRes.items) {
         toast(`${file.name} ni o'qishda xato: ${parseRes?.xabar}`, 'danger');
         return;
      }

      const items = parseRes.items;
      const supplier = parseRes.supplier || "Noma'lum";
      
      if (items.length > 0) {
        const jamiSumma = items.reduce((acc: number, item: any) => acc + (Number(item.jamiNdsBilan) || 0), 0);
        const yangi: T2Faktura = {
          kompaniya_id: aktKomp,
          raqam: items[0].fakturaRaqami || 'NO_NUM',
          sana: items[0].kelganSana || new Date().toLocaleDateString('ru-RU'),
          kontragent: supplier,
          inn: items[0].postavshikInn || '',
          summa: jamiSumma,
          holat: 'yangi',
          items: items.map((it: any) => ({
             nomi: it.nomi,
             birligi: it.birligi,
             miqdori: it.miqdori,
             narxi: it.narxi,
             summa: it.jamiNdsBilan
          }))
        };
        setYangiFaktura(yangi);
        toast(`Jami ${items.length} ta tovar topildi`, 'ok');
      } else {
        toast("Faktura ichidan tovarlarni ajratib bo'lmadi.", 'warn');
      }
      
    } catch (err: any) {
      console.error(err);
      toast("Fakturani o'qishda xato: " + (err.message || err));
    } finally {
      setIsParsing(false);
      setParsingStatus('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleYangiFakturaSaqlash = async () => {
    if (!yangiFaktura) return;
    setYuklanmoqda(true);
    try {
      const res = await sbFakturaYoz({ ...yangiFaktura, operation_id: yangiOperationId() });
      if (res.ok) {
        toast('Faktura muvaffaqiyatli saqlandi', 'ok');
        setModalOchiq(false);
        setYangiFaktura(null);
        fakturalarniYukla();
      } else {
        toast(`Xato: ${res.error}`, 'danger');
      }
    } catch (err: any) {
      toast(err.message, 'danger');
    } finally {
      setYuklanmoqda(false);
    }
  };

  return (
    <div className="p-6 text-white h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-sky-400 flex items-center gap-2">
            <FileText className="text-sky-400" />
            Fakturalar (PDF / Didox Integratsiyasi)
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Fakturalarni sun'iy intellekt orqali o'qish va Skladga avto-kirim qilish
          </p>
        </div>
        <button 
          onClick={() => setModalOchiq(true)}
          className="bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-lg"
        >
          <FileUp size={18} /> Faktura Yuklash (AI)
        </button>
      </div>

      {xato && (
        <div className="bg-red-500/20 text-red-300 p-3 rounded mb-4 flex items-center gap-2 border border-red-500/30">
          <AlertCircle size={16} /> {xato}
        </div>
      )}

      <div className="bg-[var(--surface-2)] border border-border rounded-lg p-4 mb-6 flex items-center gap-4">
        <Building2 className="text-zinc-400" size={20} />
        <span className="text-zinc-300">Qaysi obyekt skladiga qabul qilinadi:</span>
        <select 
          className="bg-black border border-border rounded p-1.5 text-sm w-64 focus:outline-none focus:border-sky-500"
          value={tanlanganObId || ''}
          onChange={e => setTanlanganObId(Number(e.target.value))}
        >
          {obyektlar.map(o => (
            <option key={o.id} value={o.id}>{o.nom}</option>
          ))}
        </select>
      </div>

      {yuklanmoqda && <div className="text-sky-400 mb-4 animate-pulse">Yuklanmoqda...</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {fakturalar.map((f, i) => (
          <div key={i} className="border border-border p-5 bg-[var(--surface-1)] rounded-lg shadow-xl relative overflow-hidden group">
            {f.holat === 'tasdiqlangan' && (
              <div className="absolute top-0 right-0 bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-bl-lg text-xs font-bold border-b border-l border-emerald-500/30 flex items-center gap-1">
                <CheckCircle2 size={12} /> Qabul qilingan
              </div>
            )}
            
            <h2 className="font-bold text-lg mb-2 text-zinc-100 flex items-center gap-2">
              № {f.raqam}
            </h2>
            
            <div className="grid grid-cols-2 gap-2 text-sm text-zinc-400 mb-4">
              <div><span className="text-zinc-500">Sana:</span> {f.sana}</div>
              <div><span className="text-zinc-500">INN:</span> {f.inn}</div>
              <div className="col-span-2"><span className="text-zinc-500">Kontragent:</span> <span className="text-amber-200/80">{f.kontragent}</span></div>
              <div className="col-span-2"><span className="text-zinc-500">Summa:</span> <b className="text-emerald-400">{(Number(f.summa)).toLocaleString('ru-RU')} so'm</b></div>
            </div>

            <div className="bg-black/40 p-3 rounded border border-white/5 mb-4 max-h-[150px] overflow-y-auto custom-scrollbar">
              <div className="text-xs text-zinc-500 mb-2 font-medium">Tarkibidagi tovarlar:</div>
              {f.items && f.items.length > 0 ? (
                <ul className="text-xs text-zinc-300 space-y-1">
                  {f.items.map((item: any, idx: number) => (
                    <li key={idx} className="flex justify-between border-b border-white/5 pb-1">
                      <span className="truncate pr-2" title={item.nomi}>{item.nomi}</span>
                      <span className="text-sky-400 font-mono shrink-0 whitespace-nowrap">{item.miqdori || item.obyomi} {item.birligi}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-zinc-600 italic">Tovarlar ro'yxati kelmagan</div>
              )}
            </div>

            {f.holat === 'yangi' && (
              <button 
                onClick={() => skladgaQabulQil(f)}
                disabled={yuklanmoqda}
                className="w-full bg-sky-600/20 text-sky-400 hover:bg-sky-600 hover:text-white border border-sky-600/50 py-2 rounded-lg flex items-center justify-center gap-2 transition-all font-medium disabled:opacity-50"
              >
                <PackagePlus size={18} />
                Skladga Kirim Qilish
              </button>
            )}
          </div>
        ))}
        {fakturalar.length === 0 && !yuklanmoqda && (
          <div className="col-span-full text-center text-zinc-500 py-10 border border-dashed border-border rounded-lg bg-[var(--surface-1)]">
            Hozircha fakturalar yo'q. EHF (PDF) fayllarni yuklang.
          </div>
        )}
      </div>

      {/* AI Parse Modal */}
      {modalOchiq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="flex w-full max-w-3xl flex-col shadow-2xl border border-white/10 relative overflow-hidden bg-[#12121a] rounded-xl max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-white/10 bg-black/40 p-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <FileUp className="text-sky-400" size={20} />
                AI orqali PDF o'qish
              </h2>
              <button onClick={() => setModalOchiq(false)} className="text-zinc-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 flex flex-col gap-4 overflow-y-auto">
              {!yangiFaktura ? (
                <div className="border-2 border-dashed border-white/20 rounded-xl p-12 flex flex-col items-center justify-center text-center gap-4 hover:bg-white/5 transition-colors cursor-pointer" onClick={() => !isParsing && fileInputRef.current?.click()}>
                  <input 
                    type="file" 
                    accept=".pdf, image/png, image/jpeg, image/jpg"
                    className="hidden" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload} 
                  />
                  <div className="w-16 h-16 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400">
                    <FileUp size={32} />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-white mb-1">PDF Hujjat tanlang</h3>
                    <p className="text-sm text-zinc-400">Faktura PDF faylini yuklang, AI o'zi o'qiydi</p>
                  </div>
                  <button 
                    disabled={isParsing}
                    className="bg-sky-600 hover:bg-sky-500 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50 mt-2"
                  >
                    {isParsing ? 'O\'qilmoqda...' : 'Fayl tanlash'}
                  </button>
                  {parsingStatus && <div className="text-sky-400 text-sm mt-2 animate-pulse">{parsingStatus}</div>}
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4 bg-black/30 p-4 rounded-lg border border-white/5">
                    <div><span className="text-zinc-500 text-xs">Faktura №:</span> <p className="font-bold">{yangiFaktura.raqam}</p></div>
                    <div><span className="text-zinc-500 text-xs">Sana:</span> <p className="font-bold">{yangiFaktura.sana}</p></div>
                    <div className="col-span-2"><span className="text-zinc-500 text-xs">Kontragent:</span> <p className="font-bold text-amber-200">{yangiFaktura.kontragent}</p></div>
                    <div><span className="text-zinc-500 text-xs">INN:</span> <p className="font-mono">{yangiFaktura.inn}</p></div>
                    <div><span className="text-zinc-500 text-xs">Jami Summa:</span> <p className="font-bold text-emerald-400">{(yangiFaktura.summa).toLocaleString('ru-RU')} so'm</p></div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-zinc-300 mb-2 border-b border-white/10 pb-2">O'qilgan Tovarlar ({yangiFaktura.items?.length})</h3>
                    <div className="max-h-[30vh] overflow-y-auto custom-scrollbar pr-2 space-y-2">
                      {yangiFaktura.items?.map((it, idx) => (
                        <div key={invoiceRowKey(it)} className="bg-white/5 p-2 rounded flex items-center justify-between gap-4 border border-transparent hover:border-white/10">
                          <RowOrderControls index={idx} count={yangiFaktura.items?.length ?? 0} label={it.nomi} onMove={to=>setYangiFaktura(current=>current ? {...current, items:moveRow(current.items ?? [],idx,to)} : current)} /><span className="text-sm font-medium flex-1 truncate" title={it.nomi}>{it.nomi}</span>
                          <span className="text-xs bg-black/40 px-2 py-1 rounded text-sky-300 font-mono">
                            {it.miqdori} {it.birligi} x {it.narxi?.toLocaleString('ru-RU')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-3 justify-end mt-4 pt-4 border-t border-white/10">
                    <button onClick={() => setYangiFaktura(null)} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors">
                      Bekor qilish
                    </button>
                    <button onClick={handleYangiFakturaSaqlash} disabled={yuklanmoqda} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-2 transition-colors disabled:opacity-50">
                      <Save size={18} />
                      Tizimga Saqlash
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
