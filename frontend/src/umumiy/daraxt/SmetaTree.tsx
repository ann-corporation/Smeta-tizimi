import { t } from '../../i18n/til';
import { useState, useMemo, useRef, useEffect, useDeferredValue } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { TreeNode } from '../../api/types';
import { flattenTree, getAllKeys } from './utils';
import { FmtN } from '../../lib/format';
import { Badge } from '../ui/Badge';
import { ChevronRight, ChevronDown, RefreshCcw, Plus, Search, X, Layers, Package, Pickaxe, Box, Pencil, Info } from 'lucide-react';
import { PRICE_STATE_BADGE, type PriceControlLine } from '../../api/t2-price-control';
import { QatorTahrirModal } from '../ui/QatorTahrirModal';

interface SmetaTreeProps {
  data: TreeNode[];
  oylar?: string[];
  isEditMode?: boolean;
  edits?: Record<string, any>;
  setEdits?: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  onNodeDrop?: (source: TreeNode, target?: TreeNode) => void;
  /** `t2_price_control_v1` read-modelining aynan shu object uchun natijasi. */
  priceControlLines?: readonly PriceControlLine[];
  /** Har bir muvaffaqiyatli `t2_qator_tahrir` saqlashidan keyin chaqiriladi
   *  (chaqiruvchi daraxtni qayta yuklashi uchun). Faqat kanonik qatorlarda
   *  (`node.id` va `node.versiya` mavjud bo'lganda) tahrirlash tugmasi
   *  ko'rinadi — GAS-nom asosidagi eski daraxtda bu maydonlar yo'q. */
  onQatorTahrirlandi?: () => void;
  /** LRV ichidagi kichik, canonical Fakt yozish porti. Backend qoidalari parentda qoladi. */
  onFaktOpen?: () => void;
  onFaktSave?: (node: TreeNode, mode: 'qoshish' | 'jami', value: number) => Promise<{
    ok: boolean;
    message?: string;
    conflict?: boolean;
  }>;
}

function TreeTypeIcon({ type }: { type: TreeNode['type'] }) {
  if (type === 'rz') return <Layers size={14} aria-hidden="true" />;
  if (type === 'mat') return <Package size={14} aria-hidden="true" />;
  if (type === 'ob') return <Box size={14} aria-hidden="true" />;
  return <Pickaxe size={14} aria-hidden="true" />;
}

export function SmetaTree({ data, oylar = [], isEditMode = false, edits = {}, setEdits, onNodeDrop, priceControlLines, onQatorTahrirlandi, onFaktSave, onFaktOpen }: SmetaTreeProps) {
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [expandedDetailId, setExpandedDetailId] = useState<string | null>(null);
  const [draggedNode, setDraggedNode] = useState<TreeNode | null>(null);
  const [tahrirNode, setTahrirNode] = useState<TreeNode | null>(null);
  const [qidiruv, setQidiruv] = useState('');
  const [density, setDensity] = useState<'compact' | 'comfort'>(() =>
    localStorage.getItem('t2-smeta-tree-density') === 'comfort' ? 'comfort' : 'compact');
  /* Owner (2026-09-10): "pul ham ko'rinishi kerak, faqat obyomlar emas" --
   * pul ustunlari (Sm./Fk./F2 Summa) allaqachon mavjud edi, lekin faqat
   * "To'liq"/"Narx nazorati" preset'ida ko'rinardi. Standart holat endi
   * "To'liq" -- har safar qayta tanlash shart emas. */
  const [preset, setPreset] = useState<'ASOSIY' | 'F2' | 'NARX' | 'TOLIQ'>('TOLIQ');
  const [quickFilter, setQuickFilter] = useState<'all' | 'f2' | 'qosh' | 'zamena' | 'bl' | 'mat' | 'frozen' | 'risk' | 'basis'>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'umumiy' | 'fakt' | 'f2' | 'narx' | 'audit'>('umumiy');
  useEffect(() => {
    if(!drawerOpen) return;
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape') setDrawerOpen(false);};
    window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);
  },[drawerOpen]);
  const [faktMode, setFaktMode] = useState<'qoshish' | 'jami'>('jami');
  const [faktValue, setFaktValue] = useState('');
  const [faktSaving, setFaktSaving] = useState(false);
  const [faktStatus, setFaktStatus] = useState<{ tone: 'ok' | 'warn' | 'danger'; text: string } | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  /** Ustun sarlavhalari — tana bilan birga gorizontal suriladi. */
  const [bodyWidth,setBodyWidth] = useState<number>();
  useEffect(() => {
    const body=parentRef.current; if(!body) return;
    const resize=()=>setBodyWidth(body.clientWidth);resize();
    if(typeof ResizeObserver === 'undefined') return;
    const observer=new ResizeObserver(resize);observer.observe(body);return()=>observer.disconnect();
  }, []);
  const sarlavhaRef = useRef<HTMLDivElement>(null);
  const priceControlByQatorId = useMemo(
    () => new Map((priceControlLines || []).map((line) => [line.qator_id, line])),
    [priceControlLines],
  );
  const priceControlReady = (priceControlLines?.length ?? 0) > 0;

  /* ⚠️ 2026-08-17 (audit): «Qidiruv…» maydoni hech narsaga ULANMAGAN edi —
     yozish mumkin, lekin daraxt o'zgarmasdi. Minglab qatorli smetada bu
     eng kerakli asbob, shuning uchun haqiqiy filtr qilib ulandi.
     Mantiq: mos kelgan tugun VA uning butun ota-zanjiri qoladi (aks holda
     topilgan resurs qaysi razdelniki ekani ko'rinmaydi); mos kelganning
     bolalari ham qoladi. */
  /* 27 000 qatorda har harf butun daraxtni filtrlaydi — kiritish darhol
     ko'rinadi, filtr esa kechiktirilgan qiymatdan hisoblanadi (egasi 2026-09-23). */
  const qidiruvKech = useDeferredValue(qidiruv);
  const filtrlangan = useMemo(() => {
    const s = qidiruvKech.trim().toLowerCase();
    const mos = (n: TreeNode) =>
      !s || String(n.nom || '').toLowerCase().includes(s) ||
      String((n as any).kod || '').toLowerCase().includes(s);
    const tezMos = (n: TreeNode) => quickFilter === 'all'
      || (quickFilter === 'f2' && Number(n.f2mum) > 0)
      || (quickFilter === 'qosh' && !!n.isQosh)
      || (quickFilter === 'zamena' && !!n.isZamena)
      || (quickFilter === 'bl' && n.type === 'bl')
      || (quickFilter === 'mat' && n.type === 'mat')
      || (quickFilter === 'frozen' && (priceControlByQatorId.get(n.id || -1)?.frozen_amount || 0) > 0)
      || (quickFilter === 'risk' && (priceControlByQatorId.get(n.id || -1)?.at_risk_amount || 0) > 0)
      || (quickFilter === 'basis' && priceControlByQatorId.get(n.id || -1)?.price_state === 'ABOVE_REFERENCE_MISSING_BASIS');
    const suz = (nodes: TreeNode[]): TreeNode[] => {
      const chiq: TreeNode[] = [];
      for (const n of nodes) {
        const bolalar = n.children ? suz(n.children) : [];
        if (mos(n) && tezMos(n)) chiq.push(n); // o'zi mos — butun shoxi bilan
        else if (bolalar.length) chiq.push({ ...n, children: bolalar });
      }
      return chiq;
    };
    return quickFilter === 'all' && !s ? data : suz(data);
  }, [data, qidiruvKech, quickFilter, priceControlByQatorId]);

  /* Qidiruvda hamma shox ochiq bo'lishi kerak, aks holda mos kelgan
     ichkaridagi qator ko'rinmay qoladi. */
  const kengaytirilgan = useMemo(
    () => (qidiruvKech.trim()
      ? Object.fromEntries(getAllKeys(filtrlangan).map((k) => [k, true]))
      : expandedMap),
    [qidiruvKech, filtrlangan, expandedMap]);

  const flatNodes = useMemo(
    () => flattenTree(filtrlangan, kengaytirilgan),
    [filtrlangan, kengaytirilgan]);

  const rowVirtualizer = useVirtualizer({
    count: flatNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (idx) => {
      const row = flatNodes[idx];
      if (expandedDetailId === row.key) return 250;
      return density === 'compact' ? 34 : 44;
    },
    overscan: 20,
  });

  const toggleExpand = (key: string) => {
    setExpandedMap(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAll = () => {
    const keys = getAllKeys(data);
    const newMap: Record<string, boolean> = {};
    keys.forEach(k => newMap[k] = true);
    setExpandedMap(newMap);
  };

  const collapseAll = () => setExpandedMap({});
  const changeDensity = (next: 'compact' | 'comfort') => {
    setDensity(next); localStorage.setItem('t2-smeta-tree-density', next);
  };
  const showMoney = preset === 'TOLIQ' || preset === 'NARX';
  const showSmetaAndFakt = preset !== 'F2';
  const columnCount = 4 + (showSmetaAndFakt ? 2 : 0) + (showMoney ? 6 : 0);
  const minimumWidth = 400 + (showSmetaAndFakt ? 176 : 0) + 352 + (showMoney ? 512 : 0) + (columnCount - 1) * 16 + 16;
  const selected = flatNodes.find((row) => row.key === selectedKey);
  const selectedFakt = selected?.node.fakt;

  useEffect(() => {
    if (!selectedKey) return;
    setFaktMode('jami');
    setFaktValue(selectedFakt == null ? '' : String(selectedFakt));
    setFaktStatus(null);
  }, [selectedFakt, selectedKey]);

  const faktniSaqlash = async () => {
    if (!selected || !onFaktSave || selected.node.id == null || faktSaving) return;
    const value = Number(faktValue.trim().replace(',', '.'));
    if (!Number.isFinite(value)) {
      setFaktStatus({ tone: 'warn', text: 'Fakt hajmini raqam ko‘rinishida kiriting.' });
      return;
    }
    setFaktSaving(true);
    setFaktStatus({ tone: 'warn', text: 'Saqlanmoqda…' });
    try {
      const result = await onFaktSave(selected.node, faktMode, value);
      if (result.ok) {
        setFaktStatus({ tone: 'ok', text: 'Saqlandi. Server qiymati yangilandi.' });
      } else {
        setFaktStatus({ tone: result.conflict ? 'warn' : 'danger', text: result.message || 'Fakt saqlanmadi.' });
      }
    } catch {
      setFaktStatus({ tone: 'danger', text: 'Javob olinmadi. O‘zgartirish qayta tekshiriladi.' });
    } finally {
      setFaktSaving(false);
    }
  };

  return (
    <div className={`relative flex flex-col h-full bg-surface border border-border rounded-xl shadow-sm overflow-hidden ${density === 'compact' ? 'text-xs' : 'text-sm'}`}>
      <div className="sticky top-0 z-30 flex-shrink-0 bg-surface-2/95 backdrop-blur-md">
        <div className="border-b border-border px-4 py-2">
          <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
          <Search size={14} className="absolute left-2 top-2 text-text-mute" />
          <input
            type="text"
            value={qidiruv}
            onChange={(e) => setQidiruv(e.target.value)}
            placeholder="Qidiruv..."
            aria-label="Daraxtdan qidirish"
            className="bg-bg border border-border rounded-md pl-7 pr-7 py-1.5 text-sm w-64 focus:outline-none focus:border-accent"
          />
          {qidiruv && <button onClick={() => setQidiruv('')} className="absolute right-2 top-2 text-text-mute"><X size={14}/></button>}
          </div>
          {!!qidiruv.trim() && (
            <span className="text-[11px] text-text-mute whitespace-nowrap">
              {flatNodes.length} qator
              <button onClick={() => setQidiruv('')}
                className="ml-2 text-accent hover:underline">tozalash</button>
            </span>
          )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
          <select value={preset} onChange={(e) => setPreset(e.target.value as any)} className="px-2 py-1.5 bg-surface border border-border rounded-md" aria-label="Ustun preset">
            <option value="ASOSIY">Asosiy</option><option value="F2">F2</option><option value="NARX">Narx nazorati</option><option value="TOLIQ">To'liq</option>
          </select>
          <button onClick={() => changeDensity(density === 'compact' ? 'comfort' : 'compact')} className="px-3 py-1.5 text-xs font-medium bg-surface hover:bg-surface-2 border border-border rounded-md">{density === 'compact' ? 'Comfort' : 'Compact'}</button>
          <button onClick={expandAll} className="px-3 py-1.5 text-xs font-medium bg-surface hover:bg-surface-2 border border-border rounded-md">Hammasini yoyish</button>
          <button onClick={collapseAll} className="px-3 py-1.5 text-xs font-medium bg-surface hover:bg-surface-2 border border-border rounded-md">Yig'ish</button>
          </div>
          <div className="mt-2 flex gap-1 overflow-x-auto">
          {([['all','Hammasi'],['f2','F2 olish mumkin'],['qosh','Qo\'shimcha'],['zamena','Zamena'],['bl','Faqat BL'],['mat','Materiallar']] as const).map(([id,label]) => <button key={id} onClick={() => setQuickFilter(id)} className={`whitespace-nowrap rounded-full px-2 py-1 text-[11px] ${quickFilter === id ? 'bg-accent text-white' : 'bg-surface text-text-dim border border-border'}`}>{label}</button>)}
          {priceControlReady ? ([['frozen','Muzlagan'],['risk','Xavf ostida'],['basis','Protokolsiz']] as const).map(([id,label]) => <button key={id} onClick={() => setQuickFilter(id)} className={`whitespace-nowrap rounded-full px-2 py-1 text-[11px] ${quickFilter === id ? 'bg-accent text-white' : 'bg-surface text-text-dim border border-border'}`}>{label}</button>) : <span className="px-2 py-1 text-[11px] text-text-mute">Narx nazorati ma'lumoti ulanmagan</span>}
          </div>
        </div>

      {/* ⚠️ Sarlavha va qatorlar AVVAL ikki alohida gorizontal kontekstda edi:
          930px dan tor ekranda tanani o'ngga surganda ustun sarlavhalari
          joyida qolib, raqamlar boshqa ustun tagiga tushib ketardi. Endi
          sarlavha tananing scrollLeft'iga ergashadi (pastdagi onScroll). */}
      <div ref={sarlavhaRef} className="overflow-x-hidden">
      <div style={{ minWidth: minimumWidth, width:bodyWidth }} className="h-8 border-b border-white/5 bg-black/40 flex items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
        <div className="flex-1 min-w-0 px-4">Nom / Birlik</div>
        <div className="flex items-center h-full pr-4 flex-shrink-0 gap-4">
          {showSmetaAndFakt && <div className="w-20 text-right text-blue-400/70" title="Smeta Hajm">Sm. Vol</div>}
          {showSmetaAndFakt && <div className="w-24 text-right text-emerald-400/70" title="Fakt Hajm">Fakt Vol</div>}
          <div className="w-24 text-right text-purple-400/70" title="Jami F2 Hajm">F2 Vol</div>
          <div className="w-24 text-right text-cyan-400/70" title="F2 Olish Mumkin (Fakt - F2)">F2 Mum.</div>
          <div className="w-20 text-right text-amber-400/70" title="Qoldiq Hajm">Qoldiq</div>
          <div className="w-20 text-left text-text-mute" title="Narx nazorati holati">Holat</div>
          
          {showMoney && <div className="w-4 border-r border-white/10 h-full mx-2"></div>}
          
          {showMoney && <><div className="w-24 text-right text-blue-400" title="Smeta Summa">Sm. Sum</div>
          <div className="w-24 text-right text-emerald-400" title="Fakt Summa (Nakrutka)">Fk. Sum</div>
          <div className="w-24 text-right text-purple-400" title="F2 Summa (Nakrutka)">F2 Sum</div>
          <div className="w-24 text-right text-cyan-400" title="F2 Olish Mumkin Summa (Nakrutka)">F2 M. Sum</div>
          <div className="w-24 text-right text-amber-400" title="Qoldiq Summa (Nakrutka)">Ost. Sum</div></>}
        </div>
      </div>
      </div>
      </div>

      <div 
        className="flex-1 overflow-auto" 
        ref={parentRef}
        onScroll={(e) => {
          const h = sarlavhaRef.current;
          if (h) h.scrollLeft = e.currentTarget.scrollLeft;
        }}
        onDragOver={(e) => {
          if (!isEditMode) return;
          e.preventDefault();
        }}
        onDrop={(e) => {
          if (!isEditMode || !draggedNode) return;
          e.preventDefault();
          // Drop on empty space (qoshimcha)
          if (onNodeDrop) onNodeDrop(draggedNode);
          setDraggedNode(null);
        }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = flatNodes[virtualRow.index];
            const node = row.node;
            const key = row.key;
            const isEdited = !!edits[key];
            const currentFakt = edits[key]?.edit.fakt ?? node.fakt ?? 0;
            const isOverLimit = node.smetaHajm != null && currentFakt > node.smetaHajm;
            const priceControl = node.id == null ? undefined : priceControlByQatorId.get(node.id);
            const nazoratHolati = priceControl ? PRICE_STATE_BADGE[priceControl.price_state] : undefined;
            
            return (
              <div
                key={row.key}
                draggable={isEditMode}
                onDragStart={(e) => {
                  if (!isEditMode) return;
                  setDraggedNode(node);
                  e.dataTransfer.effectAllowed = 'copyMove';
                }}
                onDragOver={(e) => {
                  if (!isEditMode) return;
                  e.preventDefault();
                  e.stopPropagation(); // Prevent bubbling to empty space drop
                }}
                onDrop={(e) => {
                  if (!isEditMode || !draggedNode) return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (onNodeDrop) onNodeDrop(draggedNode, node);
                  setDraggedNode(null);
                }}
                className={`absolute top-0 left-0 w-full flex items-center border-b border-border/50 hover:bg-surface-2/30 transition-colors text-sm group ${isEdited ? 'shadow-[inset_3px_0_0_var(--warn)] bg-warn/5' : ''} ${selectedKey === key ? 'bg-accent/10' : ''}`}
                style={{
                  minWidth: minimumWidth,
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                  cursor: (row.hasChildren || (isEditMode && (node.type === 'bl' || node.type === 'rs'))) ? 'pointer' : 'default'
                }}
                onClick={() => {
                  setSelectedKey(key); setDrawerOpen(false);
                  if (row.hasChildren) toggleExpand(key);
                  if ((node.type === 'bl' || node.type === 'rs') && isEditMode) {
                    setExpandedDetailId(prev => prev === key ? null : key);
                  }
                }}
                onDoubleClick={() => {
                  if (onFaktSave) { setSelectedKey(key); setDrawerTab('fakt'); setDrawerOpen(true); }
                }}
              >
                {row.depth > 0 && <span aria-hidden="true" className="absolute top-0 bottom-0 border-l border-border/70" style={{ left: `${row.depth * 24 + 23}px` }} />}
                <div 
                  className="sticky left-0 z-10 bg-inherit flex items-center h-full px-4 flex-1 min-w-0"
                  style={{ paddingLeft: `${row.depth * 24 + 16}px` }}
                >
                  <div className="flex items-center gap-2 w-full">
                    {/* Expand/Collapse Chevron */}
                    <div className="w-5 flex items-center justify-center flex-shrink-0">
                      {row.hasChildren ? (
                        <button aria-label="Shoxni ochish yoki yopish" aria-expanded={row.isExpanded} onClick={(e) => { e.stopPropagation(); toggleExpand(key); }} className="p-0.5 hover:bg-surface-2 rounded text-text-dim hover:text-white">
                          {row.isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                      ) : (
                        <span className="w-4" />
                      )}
                    </div>
                    
                    {/* Zamena/Qoshimcha icons */}
                    {node.isZamena && <RefreshCcw size={14} className="text-[#a855f7] flex-shrink-0" />}
                    {node.isQosh && <Plus size={14} className="text-ok flex-shrink-0" />}
                    
                    <span className="text-text-dim flex-shrink-0" title={`Qator turi: ${node.type}`}><TreeTypeIcon type={node.type} /></span>

                    {/* Type Badge */}
                    <Badge variant={node.type as any} className="flex-shrink-0 w-8 justify-center uppercase">{node.type}</Badge>
                    
                    {/* Kod (Shifr) */}
                    {node.kod && <span className="text-text-dim font-mono text-xs flex-shrink-0 w-24 truncate">{node.kod}</span>}
                    
                    {/* Nom */}
                    <span className="text-white truncate flex-1" title={node.nom || 'Nomsiz'}>
                      {node.nom || <span className="text-white/30 italic">Nomsiz</span>}
                    </span>
                    
                    {/* Birlik */}
                    <span className="text-text-dim w-12 text-center flex-shrink-0">{node.birlik}</span>

                    {!isEditMode && <button type="button" aria-label="Qator tafsilotlarini ochish" title="Qator tafsilotlari" onClick={(e) => { e.stopPropagation(); setSelectedKey(key); setDrawerTab('umumiy'); setDrawerOpen(true); }} className="shrink-0 rounded p-1 text-text-dim hover:bg-surface-2 hover:text-accent"><Info size={14}/></button>}
                    {/* Kanonik qatorni to'g'ridan-to'g'ri tahrirlash. GAS-nom
                        asosidagi eski daraxtda `id`/`versiya` yo'q — u yerda
                        tugma ko'rinmaydi (Drive orqali emas, saytning o'zida
                        tahrirlash faqat kanonik qatorlarda mumkin). */}
                    {node.id != null && node.versiya != null && (
                      <button
                        aria-label="Qatorni tahrirlash"
                        title="Qatorni tahrirlash"
                        onClick={(e) => { e.stopPropagation(); setTahrirNode(node); }}
                        className="shrink-0 p-1 rounded text-text-mute opacity-0 group-hover:opacity-100 hover:bg-surface-2 hover:text-accent transition-opacity"
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                  </div>
                </div>
                
                {/* Data Columns with Gantt/Progress Visual */}
                <div className="flex items-center h-full pr-4 flex-shrink-0 font-medium tabular-nums text-[11px] gap-4">
                  {/* VOLUMES */}
                  {showSmetaAndFakt && <div className="w-20 text-right text-blue-300/80"><FmtN val={node.smetaHajm} /></div>}
                  {showSmetaAndFakt && <div className="w-24 text-right">
                    {isEditMode && node.type !== 'rz' ? (
                      <input
                        type="text"
                        value={currentFakt}
                        placeholder="Fakt"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const val = Number(e.target.value.replace(/,/g, '.'));
                          if (isNaN(val)) return;
                          if (setEdits && node.varaq && node.row) {
                            setEdits(prev => ({
                              ...prev,
                              [key]: {
                                node,
                                edit: { ...(prev[key]?.edit || {}), varaq: node.varaq!, row: node.row!, fakt: val }
                              }
                            }));
                          }
                        }}
                        className={`w-full text-right bg-black/60 border rounded px-1.5 py-0.5 outline-none transition-colors ${isOverLimit ? 'border-red-500/50 text-red-400' : 'border-emerald-500/30 text-emerald-300 focus:border-emerald-400'}`}
                        title="Fakt hajm kiriting"
                      />
                    ) : (
                      <FmtN val={node.fakt} cl={isOverLimit ? 'text-red-400' : 'text-emerald-400'} />
                    )}
                  </div>}
                  
                  <div className="w-24 text-right">
                       <FmtN val={node.f2ol} cl="text-purple-400" />
                  </div>
                  <div className="w-24 text-right text-cyan-300"><FmtN val={node.f2mum} /></div>
                  
                  <div className="w-20 text-right text-amber-300/80"><FmtN val={node.qoldiq} /></div>
                  <div className={nazoratHolati ? `w-20 text-left truncate ${nazoratHolati.className}` : 'w-20 text-left text-text-mute'} title={nazoratHolati?.label || 'Narx nazorati ma\'lumoti ulanmagan'}>{nazoratHolati ? `${nazoratHolati.emoji} ${nazoratHolati.label}` : '—'}</div>

                  {showMoney && <div className="w-4 border-r border-white/10 h-full mx-2 flex items-center justify-center">
                    {/* Tiny visual progress bar for Fakt */}
                    <div className="w-full h-8 flex flex-col justify-end bg-black/30 rounded-sm overflow-hidden" title={node.fakt != null && node.smetaHajm != null ? `Fakt: ${Math.round((node.fakt / (node.smetaHajm || 1)) * 100)}%` : 'Fakt foizi noma’lum'}>
                      {node.fakt != null && node.smetaHajm != null && <div className="w-full bg-emerald-500/50" style={{ height: `${Math.min((node.fakt / (node.smetaHajm || 1)) * 100, 100)}%` }} />}
                    </div>
                  </div>}

                  {/* SUMMAS (Nakrutka) */}
                  {showMoney && <><div className="w-24 text-right text-blue-200"><FmtN val={node.smeta} /></div>
                  <div className="w-24 text-right text-emerald-300 font-bold"><FmtN val={node.stFakt} /></div>
                  <div className="w-24 text-right text-purple-300 font-bold"><FmtN val={node.stF2} /></div>
                  <div className="w-24 text-right text-cyan-300"><FmtN val={node.stF2Mum} /></div>
                  <div className="w-24 text-right text-amber-300"><FmtN val={node.stOst} /></div></>}
                </div>

                {/* Expanded RowDetailPanel for F2 Monthly Editing */}
                {expandedDetailId === key && (
                  <div className="absolute top-9 left-0 w-full h-[214px] bg-black/60 border-t border-white/5 shadow-inner backdrop-blur-md p-4 flex gap-6 z-10 overflow-hidden cursor-default" onClick={(e) => e.stopPropagation()}>
                    {/* Left: Quick Stats */}
                    <div className="w-64 flex-shrink-0 grid grid-cols-2 gap-3">
                      <div className="bg-white/5 border border-white/5 rounded-lg p-3">
                        <div className="text-[10px] text-slate-500 font-bold">Hajm Smeta</div>
                        <div className="text-sm text-blue-400 font-mono"><FmtN val={node.smetaHajm} /></div>
                      </div>
                      <div className="bg-white/5 border border-white/5 rounded-lg p-3">
                        <div className="text-[10px] text-slate-500 font-bold">Hajm Fakt</div>
                        <div className="text-sm text-emerald-400 font-mono"><FmtN val={currentFakt} /></div>
                      </div>
                      <div className="bg-white/5 border border-white/5 rounded-lg p-3">
                        <div className="text-[10px] text-slate-500 font-bold">Hajm F2</div>
                        <div className="text-sm text-purple-400 font-mono"><FmtN val={node.f2ol} /></div>
                      </div>
                      <div className="bg-white/5 border border-white/5 rounded-lg p-3">
                        <div className="text-[10px] text-slate-500 font-bold">Hajm Mumkin</div>
                        <div className="text-sm text-cyan-400 font-mono"><FmtN val={node.f2mum} /></div>
                      </div>
                    </div>
                    
                    {/* Right: Monthly F2 Inputs */}
                    <div className="flex-1 overflow-x-auto">
                      <h4 className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-purple-500"></span>Oylik F2 Hajmlarni Kiritish</h4>
                      <div className="flex gap-4">
                        {oylar.map((oy: string) => {
                          const oylarState = edits[key]?.edit?.oylar || node.oylar || {};
                          const currentOyVal = oylarState[oy] ?? 0;
                          return (
                            <div key={oy} className="bg-white/5 border border-white/10 rounded-xl p-3 w-44 flex-shrink-0">
                              <div className="text-xs font-bold text-slate-300 mb-2">{oy}</div>
                              <input
                                type="text"
                                value={currentOyVal}
                                onChange={(e) => {
                                  const val = Number(e.target.value.replace(/,/g, '.'));
                                  if (isNaN(val)) return;
                                  if (setEdits) {
                                    setEdits(prev => {
                                      const existingOylar = prev[key]?.edit?.oylar || node.oylar || {};
                                      return {
                                        ...prev,
                                        [key]: {
                                          node,
                                          edit: { 
                                            ...(prev[key]?.edit || {}), 
                                            varaq: node.varaq!, row: node.row!,
                                            oylar: { ...existingOylar, [oy]: val }
                                          }
                                        }
                                      };
                                    });
                                  }
                                }}
                                className="w-full bg-black/50 border border-white/10 text-purple-300 font-mono text-sm rounded px-2 py-1 outline-none focus:border-purple-500/50"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {drawerOpen && selected && !isEditMode && (
        <aside className="absolute inset-y-0 right-0 z-40 w-[min(460px,90vw)] overflow-auto border-l border-border bg-surface p-4 shadow-2xl" aria-label="Qator tafsilotlari">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-text-mute">{selected.lineage.slice(0,-1).join(' › ')}</p>
              <h3 className="mt-2 truncate font-semibold" title={selected.node.nom || 'Nomsiz'}>{selected.node.nom || 'Nomsiz'}</h3>
              {selected.node.type !== 'rz' && <p className="mt-1 text-[11px] text-text-mute">{selected.node.kod || 'Kod yo‘q'} · {selected.node.birlik || 'Birlik yo‘q'}</p>}
              {/* Qator maydonlarini (nom/hajm/narx/birlik/kat) to'g'ridan-to'g'ri
                  tahrirlash — Fakt tahriridan alohida: u bajarilgan hajmni
                  yozadi, bu esa smeta qatorining o'zini o'zgartiradi. */}
              {selected.node.id != null && selected.node.versiya != null && (
                <button
                  onClick={() => setTahrirNode(selected.node)}
                  title="Qator maydonlarini tahrirlash"
                  className="mt-2 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-text-dim hover:bg-surface-2 hover:text-accent"
                >
                  <Pencil size={12} /> Tahrirlash
                </button>
              )}
            </div>
            <button onClick={() => setDrawerOpen(false)} className="shrink-0 rounded p-1 text-text-dim hover:bg-surface-2 hover:text-text" aria-label="Qator tafsilotlarini yopish"><X size={18}/></button>
          </div>
          <div className="mt-4 flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label="Qator tafsilotlari bo‘limlari">
            {([['umumiy', 'Umumiy'], ['fakt', 'Fakt'], ['f2', 'F2 tarixi'], ['narx', 'Narx'], ['audit', 'Audit']] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={drawerTab === id} onClick={() => setDrawerTab(id)} className={`whitespace-nowrap border-b-2 px-2 py-2 text-xs font-medium ${drawerTab === id ? 'border-accent text-text' : 'border-transparent text-text-dim hover:text-text'}`}>{label}</button>)}
          </div>
          {drawerTab === 'umumiy' && <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            {(selected.node.type === 'rz' ? [
              ['Smeta summasi', <FmtN key="sm" val={selected.node.smeta}/>],
              ['Fakt summasi', <FmtN key="fk" val={selected.node.stFakt}/>],
              ['F2 summasi', <FmtN key="f2sum" val={selected.node.stF2}/>],
              ['Qoldiq summasi', <FmtN key="ost" val={selected.node.stOst}/>],
            ] : [
              ['Smeta hajmi', <FmtN key="smeta" val={selected.node.smetaHajm} />],
              ['Fakt hajmi', <FmtN key="fakt" val={selected.node.fakt} />],
              ['F2 hajmi', <FmtN key="f2" val={selected.node.f2ol} />],
              ['F2 mumkin', <FmtN key="mumkin" val={selected.node.f2mum} />],
              ['Resurslar', 'Qator zanjiri orqali'],
              ['O‘zgarish', selected.node.isZamena ? 'Zamena aloqasi mavjud' : selected.node.isQosh ? 'Qo‘shimcha ish' : 'Oddiy qator'],
            ]).map(([title, value]) => <div key={String(title)} className="rounded border border-border p-3"><b>{title}</b><p className="mt-1 text-text-dim">{value}</p></div>)}
          </div>}
          {drawerTab === 'fakt' && <div className="mt-4 space-y-4">
            {onFaktSave ? <>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded border border-border p-3"><span className="text-text-mute">Smeta</span><strong className="mt-1 block text-text"><FmtN val={selected.node.smetaHajm} /></strong></div>
                <div className="rounded border border-border p-3"><span className="text-text-mute">Joriy Fakt</span><strong className="mt-1 block text-ok"><FmtN val={selected.node.fakt} /></strong></div>
                <div className="rounded border border-border p-3"><span className="text-text-mute">F2</span><strong className="mt-1 block text-accent"><FmtN val={selected.node.f2ol} /></strong></div>
                <div className="rounded border border-border p-3"><span className="text-text-mute">F2 mumkin</span><strong className="mt-1 block text-accent"><FmtN val={selected.node.f2mum} /></strong></div>
              </div>
              <fieldset className="space-y-3 rounded-lg border border-border bg-surface-2/50 p-3" disabled={faktSaving}>
                <legend className="px-1 text-xs font-semibold text-text">Fakt amalini tanlang</legend>
                <div className="grid grid-cols-2 gap-2">
                  <label className={`cursor-pointer rounded border p-2 text-xs ${faktMode === 'jami' ? 'border-accent bg-accent/10 text-text' : 'border-border text-text-dim'}`}><input className="sr-only" type="radio" name="lrv-fakt-mode" checked={faktMode === 'jami'} onChange={() => { setFaktMode('jami'); setFaktValue(String(selected.node.fakt ?? '')); setFaktStatus(null); }} />Jami Faktni o‘rnatish<p className="mt-1 text-[11px] text-text-mute">Server eskirgan qiymatni conflict sifatida tekshiradi.</p></label>
                  <label className={`cursor-pointer rounded border p-2 text-xs ${faktMode === 'qoshish' ? 'border-accent bg-accent/10 text-text' : 'border-border text-text-dim'}`}><input className="sr-only" type="radio" name="lrv-fakt-mode" checked={faktMode === 'qoshish'} onChange={() => { setFaktMode('qoshish'); setFaktValue(''); setFaktStatus(null); }} />Faktga qo‘shish<p className="mt-1 text-[11px] text-text-mute">Kiritilgan qiymat alohida Fakt qatoriga yoziladi.</p></label>
                </div>
                <label className="block text-xs font-medium text-text">{faktMode === 'jami' ? 'Yangi jami Fakt hajmi' : 'Qo‘shiladigan Fakt hajmi'}
                  <input aria-label={faktMode === 'jami' ? 'Yangi jami Fakt hajmi' : 'Qo‘shiladigan Fakt hajmi'} type="number" step="any" value={faktValue} onChange={(event) => setFaktValue(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-right font-mono text-sm text-text outline-none focus:border-accent" />
                </label>
                <button type="button" onClick={() => void faktniSaqlash()} disabled={faktSaving || selected.node.id == null || !faktValue.trim()} className="inline-flex items-center justify-center rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{faktSaving ? 'Saqlanmoqda…' : 'Faktni saqlash'}</button>
                {faktStatus && <p role={faktStatus.tone === 'danger' ? 'alert' : undefined} className={`text-xs ${faktStatus.tone === 'ok' ? 'text-ok' : faktStatus.tone === 'warn' ? 'text-warn' : 'text-danger'}`}>{faktStatus.text}</p>}
              </fieldset>
            </> : <div className="rounded border border-border p-3 text-xs"><b>Fakt hajmi</b><p className="mt-1"><FmtN val={selected.node.fakt}/></p>{onFaktOpen && <button type="button" className="tugma mt-3" onClick={onFaktOpen}>{t('Fakt kiritish oynasini ochish')}</button>}</div>}
          </div>}
          {drawerTab === 'f2' && <div className="mt-4 space-y-2 text-xs"><div className="rounded border border-border p-3"><b>F2 tarixi</b><p className="mt-1 text-text-dim">{oylar.length ? `${oylar.length} oy — obyom, narx va summa` : 'Ma’lumot ulanmagan'}</p></div><div className="rounded border border-border p-3"><b>F2 mumkin</b><p className="mt-1 text-text-dim"><FmtN val={selected.node.f2mum} /></p></div></div>}
          {drawerTab === 'narx' && <div className="mt-4 rounded border border-border p-3 text-xs"><b>Narx nazorati</b><p className="mt-1 text-text-dim">{selected.node.id != null && priceControlByQatorId.get(selected.node.id) ? PRICE_STATE_BADGE[priceControlByQatorId.get(selected.node.id)!.price_state].label : 'Ma’lumot ulanmagan'}</p></div>}
          {drawerTab === 'audit' && <div className="mt-4 space-y-2 text-xs"><div className="rounded border border-border p-3"><b>Qator identifikatori</b><p className="mt-1 font-mono text-text-dim">{selected.node.id ?? 'Kanonik ID yo‘q'}</p></div><div className="rounded border border-border p-3"><b>O‘zgarish holati</b><p className="mt-1 text-text-dim">{selected.node.isZamena ? 'Zamena aloqasi mavjud' : selected.node.isQosh ? 'Qo‘shimcha ish' : 'Oddiy qator'}</p></div></div>}
        </aside>
      )}
      {tahrirNode && tahrirNode.id != null && tahrirNode.versiya != null && (
        <QatorTahrirModal
          nishon={{
            qatorId: tahrirNode.id,
            versiya: tahrirNode.versiya,
            nom: tahrirNode.nom || 'Nomsiz',
            maydonlar: {
              nom: tahrirNode.nom,
              hajm: tahrirNode.smetaHajm,
              narx: tahrirNode.narx,
              birlik: tahrirNode.birlik,
              kat: tahrirNode.kat,
            },
          }}
          yop={() => setTahrirNode(null)}
          saqlandi={() => onQatorTahrirlandi?.()}
        />
      )}
    </div>
  );
}
