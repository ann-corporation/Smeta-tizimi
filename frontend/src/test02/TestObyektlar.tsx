import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, AlertTriangle, MapPin, Plus, FolderKanban } from 'lucide-react';
import { ProjectNavigator } from '../components/pto-workspace/ProjectNavigator';
import { t } from '../i18n/til';
import { Sahifa } from '../umumiy/ui/Sahifa';
import { sbT2ObyektlarOlKomp, sbObyektOchirish, sbObyektTahrirlash, sbObyektLokatsiyaBelgila, sbT2ObyektYarat, type T2Obyekt } from '../api/supabase';
import { sbT2LoyihalarOl, type T2Loyiha } from '../api/t2-loyiha';
import { toast } from '../umumiy/ui/Toast';
import { useKompaniya } from './KompaniyaTanlov';
import { usePTOWorkspace } from '../umumiy/kontekst/PTOWorkspaceContext';
import { ObyektUlash } from '../components/ulash/ObyektUlash';

const ObjectLocationMap = lazy(() => import('../components/pto-workspace/ObjectLocationMap'));

type Qator = T2Obyekt;

export default function TestObyektlar() {
  const navigate = useNavigate();
  const { joriy } = useKompaniya();
  const kompYuklanmoqda = joriy === undefined;
  const qc = useQueryClient();
  const workspace = usePTOWorkspace();

  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [qatorlar, setQatorlar] = useState<Qator[] | null>(null);
  const [xato, setXato] = useState('');
  const generation = useRef(0);
  const [loadedCompany, setLoadedCompany] = useState<number | null>(null);
  const currentRows = loadedCompany === joriy?.id ? qatorlar : null;

  // Edit State
  const [editObj, setEditObj] = useState<Qator | null>(null);
  const [ulashObj, setUlashObj] = useState<Qator | null>(null);
  const [nomi, setNomi] = useState('');
  const [tur, setTur] = useState('');
  const [position, setPosition] = useState<[number, number] | null>(null);

  // T2-PTO-OWNER-CRITICAL-CLOSURE P0-1: production obyekt yaratish.
  const [loyihalar, setLoyihalar] = useState<T2Loyiha[]>([]);
  const [yaratishOchiq, setYaratishOchiq] = useState(false);
  const [yangiNom, setYangiNom] = useState('');
  const [yangiLoyihaId, setYangiLoyihaId] = useState('');
  const [yaratilmoqda, setYaratilmoqda] = useState(false);

  useEffect(() => {
    if (!joriy?.id) { setLoyihalar([]); return; }
    let active = true;
    void sbT2LoyihalarOl(joriy.id).then(r => { if (active && r.ok) setLoyihalar(r.qatorlar || []); });
    return () => { active = false; };
  }, [joriy?.id]);

  const obyektYarat = async () => {
    if (!joriy?.id || !yangiNom.trim()) return;
    setYaratilmoqda(true);
    try {
      const r = await sbT2ObyektYarat({ kompaniyaId: joriy.id, loyihaId: yangiLoyihaId ? Number(yangiLoyihaId) : null, nom: yangiNom.trim() });
      if (!r.ok) { toast(r.xato || r.error || r.code || 'Obyekt yaratilmadi', 'danger'); return; }
      toast('Obyekt yaratildi', 'ok');
      setYaratishOchiq(false); setYangiNom(''); setYangiLoyihaId('');
      sinxronla();
    } catch (e: any) {
      toast('Xatolik: ' + (e?.message || e), 'danger');
    } finally { setYaratilmoqda(false); }
  };

  const handleOchirish = async (e: any, o: Qator) => {
    e.stopPropagation();
    if(!confirm(`"${o.nom}" obyektini arxivga (korzinka) o'tkazasizmi?`)) return;
    try {
      setYuklanmoqda(true);
      await sbObyektOchirish(o.id, o.nom);
      toast("Obyekt Korzinkaga o'tkazildi", 'ok');
      sinxronla();
    } catch(err: any) {
      toast('Xatolik: ' + err.message, 'danger');
      setYuklanmoqda(false);
    }
  };

  const handleTahrir = (e: any, o: Qator) => {
    e.stopPropagation();
    setEditObj(o);
    setNomi(o.nom);
    setTur(o.tur || '');
    if (o.lat != null && o.lng != null) {
      setPosition([o.lat, o.lng]);
    } else {
      setPosition(null);
    }
  };

  const saqlashTahrir = async () => {
    if(!editObj) return;
    try {
      setYuklanmoqda(true);
      
      // Agar nom yoki tur o'zgargan bo'lsa
      if (nomi !== editObj.nom || tur !== (editObj.tur || '')) {
        await sbObyektTahrirlash(editObj.id, nomi, tur);
      }
      
      // Agar lokatsiya o'zgargan bo'lsa
      if (position) {
        await sbObyektLokatsiyaBelgila(editObj.id, position[0], position[1], editObj.versiya || 0);
      }

      toast('Obyekt tahrirlandi', 'ok');
      setEditObj(null);
      sinxronla();
    } catch(err: any) {
      toast('Xatolik: ' + err.message, 'danger');
      setYuklanmoqda(false);
    }
  };

  const yukla = useCallback(async () => {
    if (kompYuklanmoqda) return;
    const request = ++generation.current;
    if (!joriy?.id) { setQatorlar([]); setLoadedCompany(null); return; }
    setYuklanmoqda(true); setXato('');
    try {
      const r = await sbT2ObyektlarOlKomp(joriy.id);
      if (request !== generation.current) return;
      setLoadedCompany(joriy.id);
      if (!r.ok) { setXato(r.error || t('Obyektlar o‘qilmadi')); setQatorlar(null); }
      else setQatorlar((r.qatorlar as Qator[]) || []);
    } catch (e) { if (request === generation.current) setXato(e instanceof Error ? e.message : t('Obyektlar o‘qilmadi')); }
    finally { if (request === generation.current) setYuklanmoqda(false); }
  }, [kompYuklanmoqda, joriy?.id]);
  const invalidateLoad = useCallback(() => { ++generation.current; }, []);
  useEffect(() => {
    invalidateLoad(); setEditObj(null); setYaratishOchiq(false); setQatorlar(null);
    void yukla();
    return invalidateLoad;
  }, [yukla, invalidateLoad]);

  /* Obyekt yaratish/o'chirish/tahrirlashdan keyin FAQAT shu sahifaning
   * lokal ro'yxatini emas, tizimdagi BARCHA obyekt keshini yangilash kerak.
   * Aks holda egasi ko'rgan xato takrorlanadi: obyekt bazada o'chgan
   * (holat='bekor'), lekin yon panel / PTO scope tanlagichi eski keshdan
   * (`useObyektlar` staleTime = 10 daq) uni hali ko'rsatib turadi; yangi
   * yaratilgan obyekt esa o'sha joylarda paydo bo'lmaydi. Uch mustaqil
   * kesh bor — React Query (`['obyektlar']`), bu sahifa (`yukla`) va PTO
   * workspace (`refresh`) — uchalasini ham qo'zg'atamiz. */
  const sinxronla = async () => {
    await yukla();
    qc.invalidateQueries({ queryKey: ['obyektlar'] });
    qc.invalidateQueries({ queryKey: ['pto-company-lineage', joriy?.id] });
    qc.invalidateQueries({ queryKey: ['pto-markup', joriy?.id] });
    qc.invalidateQueries({ queryKey: ['pto-markup-podvals', joriy?.id] });
    workspace.refresh();
  };

  return (
    <Sahifa
      sarlavha="Loyihalar va obyektlar"
      tavsif="Loyiha → shartnoma → obyekt → smeta va bajarilgan ishlar"
      amallar={
        <div className="flex items-center gap-2">
          <button onClick={() => setYaratishOchiq(true)}
            className="h-9 px-3 inline-flex items-center gap-2 rounded-[10px]
                       bg-[var(--accent)] text-white text-sm font-medium
                       hover:opacity-90 transition-opacity">
            <Plus size={15} />
            Yangi obyekt
          </button>
          <button onClick={() => void sinxronla()} disabled={yuklanmoqda}
            className="h-9 px-3 inline-flex items-center gap-2 rounded-[10px] karta text-sm
                       text-text hover:border-[var(--accent)]/50 transition-colors
                       disabled:opacity-50">
            <RefreshCw size={15} className={yuklanmoqda ? 'animate-spin' : ''} />
            Yangilash
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {yaratishOchiq && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-surface border border-border p-5 rounded-2xl w-[440px] shadow-2xl">
              <h3 className="font-bold text-lg mb-4 text-text flex items-center gap-2">
                <FolderKanban className="text-accent" /> Yangi obyekt
              </h3>
              <label className="block text-sm mb-3">
                <span className="text-text-dim text-[12px]">Nomi</span>
                <input value={yangiNom} onChange={e => setYangiNom(e.target.value)} autoFocus
                  className="mt-1 w-full bg-bg border border-border rounded-xl p-2.5 text-sm text-text outline-none focus:border-sky-500"
                  placeholder="Masalan: Amfiteatr, blok A" />
              </label>
              <label className="block text-sm mb-4">
                <span className="text-text-dim text-[12px]">Loyiha (ixtiyoriy)</span>
                <select value={yangiLoyihaId} onChange={e => setYangiLoyihaId(e.target.value)}
                  className="mt-1 w-full bg-bg border border-border rounded-xl p-2.5 text-sm text-text outline-none focus:border-sky-500">
                  <option value="">— Loyihasiz —</option>
                  {loyihalar.map(l => <option key={l.id} value={l.id}>{l.nom}</option>)}
                </select>
                {!loyihalar.length && (
                  <span className="text-[11px] text-text-mute mt-1 block">
                    Hali loyiha yo'q. <a href="/admin/loyiha" className="text-accent underline">Loyiha yaratish</a>
                  </span>
                )}
              </label>
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setYaratishOchiq(false); setYangiNom(''); setYangiLoyihaId(''); }}
                  className="px-5 py-2 rounded-xl text-sm font-medium text-text-dim hover:bg-surface-2 transition-colors">
                  Bekor qilish
                </button>
                <button onClick={() => void obyektYarat()} disabled={!yangiNom.trim() || yaratilmoqda}
                  className="px-5 py-2 rounded-xl text-sm font-medium bg-accent text-white hover:bg-accent/80 transition-colors shadow-lg shadow-accent/20 disabled:opacity-50">
                  {yaratilmoqda ? 'Yaratilmoqda…' : 'Yaratish'}
                </button>
              </div>
            </div>
          </div>
        )}
        {editObj && editObj.kompaniya_id === joriy?.id && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-surface border border-border p-5 rounded-2xl w-[600px] shadow-2xl flex flex-col max-h-[90vh]">
              <h3 className="font-bold text-lg mb-4 text-text flex items-center gap-2">
                <MapPin className="text-accent"/> Obyekt Joylashuvini Belgilash
              </h3>
              
              <div className="flex gap-3 mb-3">
                <input value={nomi} onChange={e=>setNomi(e.target.value)} className="flex-1 bg-bg border border-border rounded-xl p-2.5 text-sm text-text outline-none focus:border-sky-500" placeholder="Yangi nomi..." />
                <input value={tur} onChange={e=>setTur(e.target.value)} className="w-1/3 bg-bg border border-border rounded-xl p-2.5 text-sm text-text outline-none focus:border-sky-500" placeholder="Turi..." />
              </div>

              <p className="text-[12px] text-text-dim mb-2">Kartadan obyekt joylashgan nuqtani bosing:</p>
              
              <div className="flex-1 min-h-[300px] border border-border rounded-xl overflow-hidden mb-4 relative z-0">
                <Suspense fallback={<div className="skel h-full" />}><ObjectLocationMap position={position} onChange={setPosition} /></Suspense>
              </div>

              <div className="flex gap-2 justify-end mt-auto">
                <button onClick={() => setEditObj(null)} className="px-5 py-2 rounded-xl text-sm font-medium text-text-dim hover:bg-surface-2 transition-colors">Bekor qilish</button>
                <button onClick={saqlashTahrir} className="px-5 py-2 rounded-xl text-sm font-medium bg-accent text-white hover:bg-accent/80 transition-colors shadow-lg shadow-accent/20">Saqlash va Joylash</button>
              </div>
            </div>
          </div>
        )}
        
        {xato && (
          <div className="karta p-4 border-danger/40 bg-danger/5">
            <p className="text-[13px] text-danger flex items-center gap-2">
              <AlertTriangle size={15} /> {xato}
            </p>
          </div>
        )}

        {yuklanmoqda && !currentRows && <div className="skel h-40 rounded-xl" />}

        {currentRows && !currentRows.length && !xato && (
          <div className="karta p-6 text-center">
            <p className="text-[13px] text-text-dim">Tizim_02 hali BO'SH.</p>
            <p className="text-[12px] text-text-mute mt-1">Obyekt qo'shish uchun smeta faylini import qiling.</p>
          </div>
        )}

        {/* ProjectNavigator sums narxsiz at every level and marks incomplete financial totals. */}
        {joriy?.id && currentRows && <ProjectNavigator key={joriy.id} companyId={joriy.id} objects={currentRows}
          onOpen={(o, contractId) => {
            workspace.setObjectId(o.id);
            const params = new URLSearchParams();
            if (o.loyiha_id != null) params.set('loyiha', String(o.loyiha_id));
            if (contractId != null) params.set('shartnoma', String(contractId));
            navigate(`/admin/holat/${o.id}?${params}`);
          }}
          onEdit={o => handleTahrir({ stopPropagation() {} }, o)}
          onArchive={o => void handleOchirish({ stopPropagation() {} }, o)}
          onShare={o => setUlashObj(o)} />}
        {ulashObj && joriy?.id && <ObyektUlash kompaniyaId={joriy.id} obyekt={ulashObj} yopish={() => setUlashObj(null)} />}

      </div>
    </Sahifa>
  );
}
