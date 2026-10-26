import { t } from '../../i18n/til';
import { useState, useMemo, useRef, useEffect, useDeferredValue } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { TreeNode } from '../../api/types';
import { flattenTree, getAllKeys } from './utils';
import { FmtN } from '../../lib/format';
import { KatNishon } from '../ui/KatNishon';
import { ChevronRight, ChevronDown, RefreshCcw, Plus, Search, X, Layers, Package, Pickaxe, Box, Pencil, Info, Rows3, Rows2, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { PRICE_STATE_BADGE, type PriceControlLine } from '../../api/t2-price-control';
import { NARX_MUHR } from './narx-muhr';
import { QatorTahrirModal } from '../ui/QatorTahrirModal';
import { muhrBelgisi, muhrJuftlar, muhrManbaMatn, MUHR_MAYDON_NOMI, jurnalsiz, type QatorMuhrFarq } from '../../lib/qator-muhr/farq';

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
  /** Konteyner balandligini qatorlar soniga moslaydi: kam qator — past; ko'p — ekran balandligigacha (keyin ichki skroll).
   *  Berilmasa daraxt ota-konteynerni to'ldiradi (`h-full`) — eski sahifalar o'zgarmaydi. */
  moslashuvchan?: boolean;
  /** SMETA CONST: qator muhridan farq (view `t2_qator_muhr_farq`), `qator_id` bo'yicha. Berilmasa belgi ko'rinmaydi. */
  muhrFarq?: ReadonlyMap<number, QatorMuhrFarq>;
  onFaktSave?: (node: TreeNode, mode: 'qoshish' | 'jami', value: number) => Promise<{
    ok: boolean;
    message?: string;
    conflict?: boolean;
  }>;
}

type TezFiltr = 'all' | 'f2' | 'qosh' | 'zamena' | 'bl' | 'mat' | 'frozen' | 'risk' | 'basis' | 'muhr';
type Preset = 'ASOSIY' | 'F2' | 'NARX' | 'TOLIQ';
const PRESET_KALIT = 't2-smeta-tree-preset';
const omborOqi = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const omborYoz = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* xotira yopiq — sozlama faqat shu seans uchun */ } };

function TreeTypeIcon({ type }: { type: TreeNode['type'] }) {
  if (type === 'rz') return <Layers size={14} aria-hidden="true" />;
  if (type === 'mat') return <Package size={14} aria-hidden="true" />;
  if (type === 'ob') return <Box size={14} aria-hidden="true" />;
  return <Pickaxe size={14} aria-hidden="true" />;
}

/** Bajarilish chizig'i: F2 olingan (firuza) + fakt ortig'i (lojuvard) / smeta = 100%. Smeta noma'lum bo'lsa — «—», 0 emas. */
function Olchov({ sm, fk, f2, katta = false }: { sm: number | null | undefined; fk: number | null | undefined; f2: number | null | undefined; katta?: boolean }) {
  if (sm == null || !(sm > 0)) return <p className="text-[12px] text-text-mute">{t('Bajarilish: smeta qiymati noma’lum')}</p>;
  const fakt = Math.max(Number(fk ?? 0), 0), f2v = Math.max(Number(f2 ?? 0), 0);
  const f2u = Math.min(1, f2v / sm), fu = Math.min(1, Math.max(fakt, f2v) / sm), pct = Math.round((Math.max(fakt, f2v) / sm) * 100);
  return (
    <div className="space-y-1.5">
      <span className={`fz-meter ${katta ? 'fz-meter--lg' : ''} ${pct > 100 ? 'fz-meter--over' : ''}`} style={{ minWidth: 0 }}><span className="fz-meter__t"><i className="fz-meter__shu" style={{ width: `${f2u * 100}%` }} /><i className="fz-meter__fakt" style={{ width: `${Math.max(0, fu - f2u) * 100}%` }} /></span><span className="fz-meter__f">{pct}%</span></span>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11.5px] text-text-mute">
        <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--accent)' }} />{t('F2 olingan')}</span>
        <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--info)' }} />{t('fakt (F2 siz)')}</span>
        <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--surface-3)', border: '1px solid var(--border-strong)' }} />{t('qoldiq')}</span>
      </div>
    </div>
  );
}

export function SmetaTree({ data, oylar = [], isEditMode = false, edits = {}, setEdits, onNodeDrop, priceControlLines, onQatorTahrirlandi, onFaktSave, onFaktOpen, moslashuvchan = false, muhrFarq }: SmetaTreeProps) {
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [expandedDetailId, setExpandedDetailId] = useState<string | null>(null);
  const [draggedNode, setDraggedNode] = useState<TreeNode | null>(null);
  const [tahrirNode, setTahrirNode] = useState<TreeNode | null>(null);
  const [qidiruv, setQidiruv] = useState('');
  const [density, setDensity] = useState<'compact' | 'comfort'>(() =>
    omborOqi('t2-smeta-tree-density') === 'comfort' ? 'comfort' : 'compact');
  /* Firuza (egasi 2026-10-25): standart preset — «Asosiy» (hajm ustunlari bir ekranga sig'adi; «To'liq»
   * ~1900px talab qiladi). Pul summalari — smeta anatomiyasida va qator tafsilotida; «To'liq» yoki «Narx
   * nazorati» tanlansa ustun sifatida ham chiqadi. Tanlov brauzerda eslab qolinadi. */
  const [preset, setPreset] = useState<Preset>(() => {
    const x = omborOqi(PRESET_KALIT);
    return x === 'F2' || x === 'NARX' || x === 'TOLIQ' ? x : 'ASOSIY';
  });
  const [quickFilter, setQuickFilter] = useState<TezFiltr>('all');
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
      || (quickFilter === 'basis' && priceControlByQatorId.get(n.id || -1)?.price_state === 'ABOVE_REFERENCE_MISSING_BASIS')
      || (quickFilter === 'muhr' && n.id != null && !!muhrFarq?.has(n.id));
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
  }, [data, qidiruvKech, quickFilter, priceControlByQatorId, muhrFarq]);

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

  /* Tezkor filtr nishonlari: har filtrga nechta qator mos kelishi (butun daraxt bo'yicha, qidiruvdan mustaqil). */
  const tezSoni = useMemo(() => {
    const c: Record<TezFiltr, number> = { all: 0, f2: 0, qosh: 0, zamena: 0, bl: 0, mat: 0, frozen: 0, risk: 0, basis: 0, muhr: 0 };
    const yur = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (Number(n.f2mum) > 0) c.f2++;
        if (n.isQosh) c.qosh++;
        if (n.isZamena) c.zamena++;
        if (n.type === 'bl') c.bl++;
        if (n.type === 'mat') c.mat++;
        if (n.id != null && muhrFarq?.has(n.id)) c.muhr++;
        const pc = n.id == null ? undefined : priceControlByQatorId.get(n.id);
        if (pc) {
          if ((pc.frozen_amount || 0) > 0) c.frozen++;
          if ((pc.at_risk_amount || 0) > 0) c.risk++;
          if (pc.price_state === 'ABOVE_REFERENCE_MISSING_BASIS') c.basis++;
        }
        if (n.children?.length) yur(n.children);
      }
    };
    yur(data);
    return c;
  }, [data, priceControlByQatorId, muhrFarq]);
  const tezRoyxat: ReadonlyArray<readonly [TezFiltr, string]> = [
    ['all', 'Hammasi'], ['f2', 'F2 olish mumkin'], ['qosh', 'Qo‘shimcha'], ['zamena', 'Zamena'], ['bl', 'Faqat BL'], ['mat', 'Materiallar'],
    ...(priceControlReady ? [['frozen', 'Muzlagan'], ['risk', 'Xavf ostida'], ['basis', 'Protokolsiz']] as const : []),
    ...(muhrFarq?.size ? [['muhr', 'Asl smetadan farq']] as const : []),
  ];

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
    setDensity(next); omborYoz('t2-smeta-tree-density', next);
  };
  const showMoney = preset === 'TOLIQ' || preset === 'NARX';
  const showSmetaAndFakt = preset !== 'F2';
  const columnCount = 4 + (showSmetaAndFakt ? 2 : 0) + (showMoney ? 6 : 0);
  const minimumWidth = 400 + (showSmetaAndFakt ? 176 : 0) + 352 + 160 + (showMoney ? 512 : 0) + (columnCount - 1) * 16 + 16;
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

  /* Qator tafsiloti bo'limlari: ma'lumoti yo'q bo'lim ko'rsatilmaydi (avval «Ma'lumot ulanmagan» yozuvli bo'sh tablar bor edi). */
  const drawerPc = selected?.node.id != null ? priceControlByQatorId.get(selected.node.id) : undefined;
  const drawerTablar: ReadonlyArray<readonly ['umumiy' | 'fakt' | 'f2' | 'narx' | 'audit', string]> = [
    ['umumiy', 'Umumiy'], ['fakt', 'Fakt'], ['f2', 'F2'], ...(drawerPc ? [['narx', 'Narx'] as const] : []), ['audit', 'Audit'],
  ];
  const drawerTabEff = drawerTablar.some(([id]) => id === drawerTab) ? drawerTab : 'umumiy';

  return (
    <div className={`fz-card relative flex flex-col ${moslashuvchan ? '' : 'h-full'} ${density === 'compact' ? 'text-xs' : 'text-sm'}`}>
      <div className="sticky top-0 z-30 flex-shrink-0 bg-surface-2/95 backdrop-blur-md">
        <div className="border-b border-border px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-[9px] text-text-mute" aria-hidden="true" />
              <input
                type="text"
                value={qidiruv}
                onChange={(e) => setQidiruv(e.target.value)}
                placeholder={t('Qidiruv…')}
                aria-label="Daraxtdan qidirish"
                className="h-8 w-64 rounded-md border border-[var(--border-strong)] bg-bg pl-8 pr-7 text-[13px] focus:outline-none"
              />
              {qidiruv && <button type="button" onClick={() => setQidiruv('')} aria-label={t('Qidiruvni tozalash')} className="absolute right-1.5 top-[7px] text-text-mute hover:text-text"><X size={14} /></button>}
            </div>
            {!!qidiruv.trim() && <span className="whitespace-nowrap text-[11.5px] text-text-mute tabular-nums">{flatNodes.length} {t('ta qator topildi')}</span>}
            <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
            <select value={preset} onChange={(e) => { const x = e.target.value as Preset; setPreset(x); omborYoz(PRESET_KALIT, x); }} className="h-8 rounded-md border border-[var(--border-strong)] bg-surface px-2 text-[12.5px]" aria-label="Ustun preset" title={t('Ko‘rinadigan ustunlar to‘plami')}>
              <option value="ASOSIY">{t('Asosiy')}</option><option value="F2">F2</option><option value="NARX">{t('Narx nazorati')}</option><option value="TOLIQ">{t('To‘liq (pul ustunlari bilan)')}</option>
            </select>
            <div className="ml-auto flex flex-wrap items-center gap-1">
              <button type="button" onClick={() => changeDensity(density === 'compact' ? 'comfort' : 'compact')} className="fz-btn fz-btn--sm fz-btn--ghost" title={t('Qator balandligi')}>{density === 'compact' ? <Rows2 aria-hidden="true" /> : <Rows3 aria-hidden="true" />}{density === 'compact' ? t('Keng qatorlar') : t('Zich qatorlar')}</button>
              <button type="button" onClick={expandAll} className="fz-btn fz-btn--sm fz-btn--ghost"><ChevronsUpDown aria-hidden="true" />{t('Hammasini yoyish')}</button>
              <button type="button" onClick={collapseAll} className="fz-btn fz-btn--sm fz-btn--ghost"><ChevronsDownUp aria-hidden="true" />{t('Yig‘ish')}</button>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label={t('Tezkor filtrlar')}>
            {tezRoyxat.map(([id, label]) => <button key={id} type="button" aria-pressed={quickFilter === id} onClick={() => setQuickFilter(id)} className="fz-chip whitespace-nowrap" style={{ height: 24, padding: '0 9px', border: '1px solid ' + (quickFilter === id ? 'var(--accent)' : 'var(--border)'), cursor: 'pointer', ...(quickFilter === id ? { background: 'var(--accent)', color: 'var(--on-accent)' } : { background: 'var(--surface)' }) }}>{t(label)}{id !== 'all' && tezSoni[id] != null && <span className="tabular-nums opacity-80">{tezSoni[id]}</span>}</button>)}
            {!priceControlReady && <span className="px-2 text-[11px] text-text-mute" title={t('Muzlagan / Xavf ostida / Protokolsiz filtrlari narx nazorati ma’lumoti kelganda chiqadi')}>{t('Narx nazorati filtrlari: ma’lumot ulanmagan')}</span>}
          </div>
        </div>

      {/* ⚠️ Sarlavha va qatorlar AVVAL ikki alohida gorizontal kontekstda edi:
          930px dan tor ekranda tanani o'ngga surganda ustun sarlavhalari
          joyida qolib, raqamlar boshqa ustun tagiga tushib ketardi. Endi
          sarlavha tananing scrollLeft'iga ergashadi (pastdagi onScroll). */}
      <div ref={sarlavhaRef} className="overflow-x-hidden">
      <div style={{ minWidth: minimumWidth, width:bodyWidth }} className="h-9 border-b border-[var(--border-strong)] bg-surface-2 flex items-center text-[10.5px] font-semibold text-text-dim uppercase tracking-[.06em]">
        <div className="flex-1 min-w-0 px-4">{t('Nom / Birlik')}</div>
        <div className="flex items-center h-full pr-4 flex-shrink-0 gap-4">
          {showSmetaAndFakt && <div className="w-20 text-right" title={t('Smeta hajmi')}>{t('Smeta')}</div>}
          {showSmetaAndFakt && <div className="w-24 text-right" title={t('Fakt hajmi')}>{t('Fakt')}</div>}
          <div className="w-24 text-right" title={t('F2 hajmi')}>{t('F2 olingan')}</div>
          <div className="w-28 text-left" title={t('F2 olingan (firuza) va bajarilgan fakt (lojuvard) — smeta = 100%')}>{t('Bajarilish')}</div>
          <div className="w-24 text-right" title={t('F2 mumkin — bajarilgan (fakt), lekin hali F2 akti bilan topshirilmagan qism.')}>{t('F2 mumkin')}</div>
          <div className="w-20 text-right" title={t('Qoldiq hajmi')}>{t('Qoldiq')}</div>
          <div className="w-28 text-left text-text-mute" title={t('Narx nazorati holati')}>{t('Narx holati')}</div>
          
          {showMoney && <div className="w-4 border-r border-border h-full mx-2"></div>}
          
          {showMoney && <><div className="w-24 text-right" title={t('Smeta summasi')}>{t('Smeta, so‘m')}</div>
          <div className="w-24 text-right" title={t('Fakt summasi')}>{t('Fakt, so‘m')}</div>
          <div className="w-24 text-right" title={t('F2 summasi')}>{t('F2, so‘m')}</div>
          <div className="w-24 text-right" title={t('F2 mumkin')}>{t('F2 mumkin')}</div>
          <div className="w-24 text-right" title={t('Qoldiq summasi')}>{t('Qoldiq, so‘m')}</div></>}
        </div>
      </div>
      </div>
      </div>

      <div 
        className="flex-1 overflow-auto" 
        style={moslashuvchan ? { flex: '0 1 auto', maxHeight: 'max(320px, calc(100dvh - 330px))', minHeight: 96 } : undefined}
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
                className={`absolute top-0 left-0 w-full flex items-center border-b border-border hover:bg-surface-3 transition-colors text-sm group ${node.type === 'rz' ? 'bg-surface-2 font-semibold' : node.type === 'bl' ? 'font-medium' : ''} ${isEdited ? 'shadow-[inset_3px_0_0_var(--warn)] bg-warn/5' : ''} ${selectedKey === key ? 'bg-accent/10' : ''}`}
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
                        <button aria-label="Shoxni ochish yoki yopish" aria-expanded={row.isExpanded} onClick={(e) => { e.stopPropagation(); toggleExpand(key); }} className="p-0.5 hover:bg-surface-3 rounded text-text-dim hover:text-text">
                          {row.isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                      ) : (
                        <span className="w-4" />
                      )}
                    </div>
                    
                    {/* Zamena/Qoshimcha icons */}
                    {node.isZamena && <RefreshCcw size={14} className="text-accent flex-shrink-0" aria-label={t('zamena')} />}
                    {node.isQosh && <Plus size={14} className="text-ok flex-shrink-0" />}
                    
                    <span className="text-text-dim flex-shrink-0" title={`${t('Qator turi')}: ${node.type}`}><TreeTypeIcon type={node.type} /></span>

                    {/* Type Badge */}
                    {node.type !== 'rz' && node.type !== 'bl' && node.kat ? <KatNishon kat={node.kat} /> : null}
                    
                    {/* Kod (Shifr) */}
                    {node.kod && <span className="text-text-dim font-mono text-xs flex-shrink-0 w-24 truncate">{node.kod}</span>}
                    
                    {/* Nom */}
                    <span className={`truncate flex-1 ${node.type === 'rz' ? 'text-accent' : node.type === 'bl' ? 'text-text' : 'text-text-dim'}`} title={node.nom || 'Nomsiz'}>
                      {node.nom || <span className="text-text-mute italic">{t('Nomsiz')}</span>}
                    </span>
                    {/* SMETA CONST: asl smeta muhridan farq (o'zgargan / qo'shilgan / narx qo'yildi). */}
                    {(() => {
                      const mf = node.id != null ? muhrFarq?.get(node.id) : undefined;
                      if (!mf) return null;
                      const b = muhrBelgisi(mf);
                      const tafsil = mf.maydonlar.length ? `: ${mf.maydonlar.map((m) => t(MUHR_MAYDON_NOMI[m])).join(', ')}` : '';
                      return <button type="button" className={`fz-stamp fz-stamp--${b.ton} flex-shrink-0`} style={{ height: 18, padding: '0 5px', fontSize: 9.5, cursor: 'pointer' }}
                        title={`${t(b.izoh)}${tafsil}`} aria-label={`${t(b.soz)}${tafsil}`}
                        onClick={(e) => { e.stopPropagation(); setSelectedKey(key); setDrawerTab('umumiy'); setDrawerOpen(true); }}>{t(b.soz)}</button>;
                    })()}

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
                  {showSmetaAndFakt && <div className="w-20 text-right text-text-dim"><FmtN val={node.smetaHajm} /></div>}
                  {showSmetaAndFakt && <div className="w-24 text-right">
                    {isEditMode && node.type !== 'rz' ? (
                      <input
                        type="text"
                        value={currentFakt}
                        placeholder={t('Fakt')}
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
                        className={`w-full text-right bg-surface border rounded px-1.5 py-0.5 outline-none transition-colors ${isOverLimit ? 'border-warn text-warn' : 'border-[var(--border-strong)] text-text focus:border-[var(--focus)]'}`}
                        title={t('Fakt hajm kiriting')}
                      />
                    ) : (
                      <><FmtN val={node.fakt} cl={isOverLimit ? 'text-warn font-semibold' : 'text-text'} />{isOverLimit && <span className="ml-0.5 text-[9px] text-warn" aria-label={t('smetadan oshgan')}>▲</span>}</>
                    )}
                  </div>}
                  
                  <div className="w-24 text-right">
                       <FmtN val={node.f2ol} cl="text-accent" />
                  </div>
                  <div className="w-28">{(() => {
                    const sm = node.smetaHajm; const fk = Math.max(Number(node.fakt ?? 0), 0); const f2 = Math.max(Number(node.f2ol ?? 0), 0);
                    if (sm == null || !(sm > 0) || node.type === 'rz') return null;
                    const f2u = Math.min(1, f2 / sm), fu = Math.min(1, Math.max(fk, f2) / sm), pct = Math.round((Math.max(fk, f2) / sm) * 100);
                    return <span className={`fz-meter ${pct > 100 ? 'fz-meter--over' : ''}`} style={{ minWidth: 0 }} title={t('F2 olingan (firuza) va bajarilgan fakt (lojuvard) — smeta = 100%')}><span className="fz-meter__t"><i className="fz-meter__shu" style={{ width: `${f2u * 100}%` }} /><i className="fz-meter__fakt" style={{ width: `${Math.max(0, fu - f2u) * 100}%` }} /></span><span className="fz-meter__f">{pct}%</span></span>;
                  })()}
                  </div>
                  <div className="w-24 text-right text-text-dim"><FmtN val={node.f2mum} /></div>
                  
                  <div className="w-20 text-right text-text-mute"><FmtN val={node.qoldiq} /></div>
                  <div className="w-28 text-left" title={nazoratHolati ? t(nazoratHolati.label) : t('Narx nazorati ma’lumoti ulanmagan')}>{priceControl && nazoratHolati ? <span className={`fz-stamp fz-stamp--${NARX_MUHR[priceControl.price_state].ton}`} style={{ height: 18, padding: '0 5px', fontSize: 9.5 }}>{t(NARX_MUHR[priceControl.price_state].soz)}</span> : <span className="text-text-mute">—</span>}</div>

                  {showMoney && <div className="w-4 border-r border-border h-full mx-2" />}

                  {/* SUMMAS (Nakrutka) */}
                  {showMoney && <><div className="w-24 text-right text-text-dim"><FmtN val={node.smeta} /></div>
                  <div className="w-24 text-right text-text"><FmtN val={node.stFakt} /></div>
                  <div className="w-24 text-right text-accent font-semibold"><FmtN val={node.stF2} /></div>
                  <div className="w-24 text-right text-text-dim"><FmtN val={node.stF2Mum} /></div>
                  <div className="w-24 text-right text-text-mute"><FmtN val={node.stOst} /></div></>}
                </div>

                {/* Expanded RowDetailPanel for F2 Monthly Editing */}
                {expandedDetailId === key && (
                  <div className="absolute top-9 left-0 w-full h-[214px] bg-surface border-t border-border shadow-inner p-4 flex gap-6 z-10 overflow-hidden cursor-default" onClick={(e) => e.stopPropagation()}>
                    {/* Left: Quick Stats */}
                    <div className="w-64 flex-shrink-0 grid grid-cols-2 gap-3">
                      <div className="bg-surface-2 border border-border rounded-lg p-3">
                        <div className="text-[10px] text-text-mute font-bold">{t('Hajm Smeta')}</div>
                        <div className="text-sm text-text font-mono"><FmtN val={node.smetaHajm} /></div>
                      </div>
                      <div className="bg-surface-2 border border-border rounded-lg p-3">
                        <div className="text-[10px] text-text-mute font-bold">{t('Hajm Fakt')}</div>
                        <div className="text-sm text-text font-mono"><FmtN val={currentFakt} /></div>
                      </div>
                      <div className="bg-surface-2 border border-border rounded-lg p-3">
                        <div className="text-[10px] text-text-mute font-bold">{t('Hajm F2')}</div>
                        <div className="text-sm text-accent font-mono"><FmtN val={node.f2ol} /></div>
                      </div>
                      <div className="bg-surface-2 border border-border rounded-lg p-3">
                        <div className="text-[10px] text-text-mute font-bold">{t('Hajm Mumkin')}</div>
                        <div className="text-sm text-text-dim font-mono"><FmtN val={node.f2mum} /></div>
                      </div>
                    </div>
                    
                    {/* Right: Monthly F2 Inputs */}
                    <div className="flex-1 overflow-x-auto">
                      <h4 className="text-xs font-bold text-text-dim mb-3 flex items-center gap-2"><span className="w-2 h-2 rotate-45 bg-accent"></span>{t('Oylik F2 Hajmlarni Kiritish')}</h4>
                      <div className="flex gap-4">
                        {oylar.map((oy: string) => {
                          const oylarState = edits[key]?.edit?.oylar || node.oylar || {};
                          const currentOyVal = oylarState[oy] ?? 0;
                          return (
                            <div key={oy} className="bg-surface-2 border border-border rounded-xl p-3 w-44 flex-shrink-0">
                              <div className="text-xs font-bold text-text-dim mb-2">{oy}</div>
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
                                className="w-full bg-surface-2 border border-[var(--border-strong)] text-text font-mono text-sm rounded px-2 py-1 outline-none focus:border-[var(--focus)]"
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
        <aside className="absolute inset-y-0 right-0 z-40 flex w-[min(480px,92vw)] flex-col border-l border-[var(--border-strong)] bg-surface shadow-[var(--shadow-pop)]" aria-label="Qator tafsilotlari">
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              {selected.lineage.length > 1 && <p className="truncate text-[11.5px] text-text-mute" title={selected.lineage.slice(0, -1).join(' › ')}>{selected.lineage.slice(0, -1).join(' › ')}</p>}
              <h3 className="mt-1 text-[15px] font-semibold leading-5 text-text" style={{ fontFamily: 'var(--font-display)', overflowWrap: 'anywhere' }} title={selected.node.nom || t('Nomsiz')}>{selected.node.nom || t('Nomsiz')}</h3>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px] text-text-mute">
                {selected.node.type !== 'rz' && selected.node.kat ? <KatNishon kat={selected.node.kat} /> : null}
                {selected.node.type !== 'rz' && <span className="font-mono">{selected.node.kod || t('Kod yo‘q')}</span>}
                {selected.node.type !== 'rz' && <span>{selected.node.birlik || t('Birlik yo‘q')}</span>}
                {selected.node.isZamena && <span className="fz-stamp fz-stamp--info">{t('Zamena')}</span>}
                {selected.node.isQosh && <span className="fz-stamp fz-stamp--warn">{t('Qo‘shimcha')}</span>}
              </div>
              {/* Qator maydonlarini (nom/hajm/narx/birlik/kat) to'g'ridan-to'g'ri
                  tahrirlash — Fakt tahriridan alohida: u bajarilgan hajmni
                  yozadi, bu esa smeta qatorining o'zini o'zgartiradi. */}
              {selected.node.id != null && selected.node.versiya != null && (
                <button
                  type="button"
                  onClick={() => setTahrirNode(selected.node)}
                  title={t('Qator maydonlarini tahrirlash')}
                  className="fz-btn fz-btn--sm mt-2"
                >
                  <Pencil aria-hidden="true" /> {t('Tahrirlash')}
                </button>
              )}
            </div>
            <button type="button" onClick={() => setDrawerOpen(false)} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm shrink-0" aria-label="Qator tafsilotlarini yopish"><X aria-hidden="true" /></button>
          </div>
          <div className="flex gap-1 overflow-x-auto border-b border-border px-3" role="tablist" aria-label="Qator tafsilotlari bo‘limlari">
            {drawerTablar.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={drawerTabEff === id} onClick={() => setDrawerTab(id)} className="whitespace-nowrap px-2.5 py-2 text-[12.5px] font-medium" style={{ background: 'none', cursor: 'pointer', borderBottom: '2px solid ' + (drawerTabEff === id ? 'var(--accent)' : 'transparent'), color: drawerTabEff === id ? 'var(--text)' : 'var(--text-dim)' }}>{t(label)}</button>)}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {drawerTabEff === 'umumiy' && <div className="space-y-4">
            {selected.node.type === 'rz'
              ? <Olchov sm={selected.node.smeta} fk={selected.node.stFakt} f2={selected.node.stF2} katta />
              : <Olchov sm={selected.node.smetaHajm} fk={selected.node.fakt} f2={selected.node.f2ol} katta />}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
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
                ['Qoldiq hajmi', <FmtN key="qold" val={selected.node.qoldiq} />],
                ['Narx, so‘m', <FmtN key="narx" val={selected.node.narx} />],
              ]).map(([title, value]) => <div key={String(title)} className="fz-kpi"><span className="fz-kpi__label">{t(String(title))}</span><span className="fz-kpi__value" style={{ fontSize: 16, lineHeight: '22px' }}>{value}</span></div>)}
            </div>
            {selected.node.type !== 'rz' && [selected.node.smeta, selected.node.stFakt, selected.node.stF2, selected.node.stOst].some((x) => x != null) && <div className="rounded-md border border-border bg-surface-2 p-3">
              <p className="fz-panel__h">{t('Summalar, so‘m')}</p>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
                <span className="text-text-mute">{t('Smeta')}</span><b className="text-right tabular-nums"><FmtN val={selected.node.smeta} /></b>
                <span className="text-text-mute">{t('Fakt')}</span><b className="text-right tabular-nums"><FmtN val={selected.node.stFakt} /></b>
                <span className="text-text-mute">{t('F2 olingan')}</span><b className="text-right tabular-nums"><FmtN val={selected.node.stF2} /></b>
                <span className="text-text-mute">{t('Qoldiq')}</span><b className="text-right tabular-nums"><FmtN val={selected.node.stOst} /></b>
              </div>
            </div>}
            {(() => {
              const mf = selected.node.id != null ? muhrFarq?.get(selected.node.id) : undefined;
              if (!mf) return null;
              const b = muhrBelgisi(mf);
              const juft = muhrJuftlar(mf);
              return <div className="rounded-md border border-border bg-surface-2 p-3" aria-label={t('Asl smetadan farq')}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="fz-panel__h">{t('Asl smetadan farq')}</p>
                  <span className={`fz-stamp fz-stamp--${b.ton}`}>{t(b.soz)}</span>
                  {mf.ekspertizagacha && <span className="fz-chip">{t('ekspertizagacha bo‘lim')}</span>}
                </div>
                <p className="mt-1 text-[11.5px] text-text-mute">{t(b.izoh)}. {t('Muhr')}: {t(muhrManbaMatn(mf.muhr_manba))}{mf.asos_vaqt ? ` · ${new Date(mf.asos_vaqt).toLocaleDateString('ru-RU')}` : ''}</p>
                {juft.length > 0 && <table className="mt-2 w-full text-[12px]">
                  <thead><tr className="text-left text-text-mute"><th className="py-1 pr-2 font-medium">{t('Maydon')}</th><th className="py-1 pr-2 font-medium">{t('Avval (asl smeta)')}</th><th className="py-1 font-medium">{t('Endi')}</th></tr></thead>
                  <tbody>{juft.map((j) => <tr key={j.maydon} className="border-t border-border align-top">
                    <td className="py-1 pr-2 text-text-dim">{t(MUHR_MAYDON_NOMI[j.maydon])}</td>
                    <td className="py-1 pr-2 tabular-nums text-text-mute" style={{ overflowWrap: 'anywhere' }}>{j.avval ?? <i>{t('bo‘sh')}</i>}</td>
                    <td className="py-1 tabular-nums font-semibold text-text" style={{ overflowWrap: 'anywhere' }}>{j.endi ?? <i>{t('bo‘sh')}</i>}</td>
                  </tr>)}</tbody>
                </table>}
                {mf.tekshirilmagan?.length > 0 && <p className="mt-2 text-[11px] text-text-mute">{t('Asl qiymati tekshirilmagan maydonlar')}: {mf.tekshirilmagan.map((m) => t(MUHR_MAYDON_NOMI[m as keyof typeof MUHR_MAYDON_NOMI] ?? m)).join(', ')}</p>}
                {mf.holat === 'ozgargan' && <p className={`mt-2 text-[11.5px] ${jurnalsiz(mf) ? 'text-warn' : 'text-text-mute'}`}>
                  {jurnalsiz(mf)
                    ? t('O‘zgarishlar jurnalida yozuv yo‘q — o‘zgarish import yoki ommaviy amal orqali qilingan.')
                    : `${t('Jurnal')}: ${mf.jurnal_soni} ${t('ta yozuv')}${mf.oxirgi_tahrir ? ` · ${new Date(mf.oxirgi_tahrir).toLocaleString('ru-RU')}` : ''} · ${mf.oxirgi_kim ? mf.oxirgi_kim : t('kim — noma’lum')}`}
                </p>}
              </div>;
            })()}
          </div>}
          {drawerTabEff === 'fakt' && <div className="space-y-4">
            {onFaktSave ? <>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="fz-kpi"><span className="fz-kpi__label">{t('Smeta')}</span><span className="fz-kpi__value" style={{ fontSize: 16 }}><FmtN val={selected.node.smetaHajm} /></span></div>
                <div className="fz-kpi"><span className="fz-kpi__label">{t('Joriy Fakt')}</span><span className="fz-kpi__value" style={{ fontSize: 16, color: 'var(--info)' }}><FmtN val={selected.node.fakt} /></span></div>
                <div className="fz-kpi"><span className="fz-kpi__label">F2</span><span className="fz-kpi__value" style={{ fontSize: 16, color: 'var(--accent-text)' }}><FmtN val={selected.node.f2ol} /></span></div>
                <div className="fz-kpi"><span className="fz-kpi__label">{t('F2 mumkin')}</span><span className="fz-kpi__value" style={{ fontSize: 16 }}><FmtN val={selected.node.f2mum} /></span></div>
              </div>
              <fieldset className="space-y-3 rounded-md border border-border bg-surface-2 p-3" disabled={faktSaving}>
                <legend className="px-1 text-xs font-semibold text-text">{t('Fakt amalini tanlang')}</legend>
                <div className="grid grid-cols-2 gap-2">
                  <label className={`cursor-pointer rounded border p-2 text-xs ${faktMode === 'jami' ? 'border-accent bg-accent/10 text-text' : 'border-border text-text-dim'}`}><input className="sr-only" type="radio" name="lrv-fakt-mode" checked={faktMode === 'jami'} onChange={() => { setFaktMode('jami'); setFaktValue(String(selected.node.fakt ?? '')); setFaktStatus(null); }} />{t('Jami Faktni o‘rnatish')}<p className="mt-1 text-[11px] text-text-mute">{t('Server eskirgan qiymatni conflict sifatida tekshiradi.')}</p></label>
                  <label className={`cursor-pointer rounded border p-2 text-xs ${faktMode === 'qoshish' ? 'border-accent bg-accent/10 text-text' : 'border-border text-text-dim'}`}><input className="sr-only" type="radio" name="lrv-fakt-mode" checked={faktMode === 'qoshish'} onChange={() => { setFaktMode('qoshish'); setFaktValue(''); setFaktStatus(null); }} />{t('Faktga qo‘shish')}<p className="mt-1 text-[11px] text-text-mute">{t('Kiritilgan qiymat alohida Fakt qatoriga yoziladi.')}</p></label>
                </div>
                <label className="block text-xs font-medium text-text">{faktMode === 'jami' ? t('Yangi jami Fakt hajmi') : t('Qo‘shiladigan Fakt hajmi')}
                  <input aria-label={faktMode === 'jami' ? 'Yangi jami Fakt hajmi' : 'Qo‘shiladigan Fakt hajmi'} type="number" step="any" value={faktValue} onChange={(event) => setFaktValue(event.target.value)} className="mt-1 block h-9 w-full rounded-md border border-[var(--border-strong)] bg-bg px-3 text-right font-mono text-sm text-text" />
                </label>
                <button type="button" onClick={() => void faktniSaqlash()} disabled={faktSaving || selected.node.id == null || !faktValue.trim()} className="fz-btn fz-btn--primary">{faktSaving ? t('Saqlanmoqda…') : t('Faktni saqlash')}</button>
                {faktStatus && <p role={faktStatus.tone === 'danger' ? 'alert' : undefined} className={`text-xs ${faktStatus.tone === 'ok' ? 'text-ok' : faktStatus.tone === 'warn' ? 'text-warn' : 'text-danger'}`}>{faktStatus.text}</p>}
              </fieldset>
            </> : <div className="space-y-3">
              <div className="fz-kpi"><span className="fz-kpi__label">{t('Fakt hajmi')}</span><span className="fz-kpi__value"><FmtN val={selected.node.fakt}/></span><span className="fz-kpi__sub">{t('smeta')}: <FmtN val={selected.node.smetaHajm} /></span></div>
              {onFaktOpen && <button type="button" className="fz-btn fz-btn--primary" onClick={onFaktOpen}>{t('Fakt kiritish oynasini ochish')}</button>}
            </div>}
          </div>}
          {drawerTabEff === 'f2' && <div className="space-y-4">
            <Olchov sm={selected.node.type === 'rz' ? selected.node.smeta : selected.node.smetaHajm} fk={selected.node.type === 'rz' ? selected.node.stFakt : selected.node.fakt} f2={selected.node.type === 'rz' ? selected.node.stF2 : selected.node.f2ol} katta />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {(selected.node.type === 'rz'
                ? [['F2 summasi', selected.node.stF2], ['F2 mumkin', selected.node.stF2Mum]] as const
                : [['F2 hajmi', selected.node.f2ol], ['F2 mumkin', selected.node.f2mum]] as const
              ).map(([title, v]) => <div key={title} className="fz-kpi"><span className="fz-kpi__label">{t(title)}</span><span className="fz-kpi__value" style={{ fontSize: 16 }}><FmtN val={v} /></span></div>)}
            </div>
            <p className="text-[11.5px] text-text-mute">{t('F2 mumkin — bajarilgan (fakt), lekin hali F2 akti bilan topshirilmagan qism.')}</p>
            {oylar.length > 0 && <div><p className="fz-panel__h">{t('Oylar bo‘yicha F2 hajmi')}</p><div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px]">{oylar.map((oy) => <div key={oy} className="contents"><span className="text-text-mute">{oy}</span><b className="text-right tabular-nums"><FmtN val={selected.node.oylar?.[oy]?.obyom} /></b></div>)}</div></div>}
          </div>}
          {drawerTabEff === 'narx' && drawerPc && <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2"><span className={`fz-stamp fz-stamp--${NARX_MUHR[drawerPc.price_state].ton}`}>{t(NARX_MUHR[drawerPc.price_state].soz)}</span><span className="text-[12.5px] text-text-dim">{t(PRICE_STATE_BADGE[drawerPc.price_state].label)}</span></div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {([['Reference narx', drawerPc.reference_unit_price], ['F2 narx', drawerPc.certified_unit_price], ['Farq', drawerPc.price_delta], ['Muzlagan summa', drawerPc.frozen_amount], ['Xavf ostidagi summa', drawerPc.at_risk_amount]] as const).map(([title, v]) => <div key={title} className="fz-kpi"><span className="fz-kpi__label">{t(title)}</span><span className="fz-kpi__value" style={{ fontSize: 16 }}><FmtN val={v} /></span></div>)}
            </div>
          </div>}
          {drawerTabEff === 'audit' && <dl className="space-y-3 text-[12.5px]">
            <div><dt className="fz-panel__h">{t('Qator identifikatori')}</dt><dd className="mt-1 font-mono text-text-dim">{selected.node.id ?? t('Kanonik ID yo‘q')}</dd></div>
            {selected.node.versiya != null && <div><dt className="fz-panel__h">{t('Versiya')}</dt><dd className="mt-1 font-mono text-text-dim">{selected.node.versiya}</dd></div>}
            <div><dt className="fz-panel__h">{t('O‘zgarish holati')}</dt><dd className="mt-1 text-text-dim">{selected.node.isZamena ? t('Zamena aloqasi mavjud') : selected.node.isQosh ? t('Qo‘shimcha ish') : t('Oddiy qator')}</dd></div>
          </dl>}
          </div>
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
