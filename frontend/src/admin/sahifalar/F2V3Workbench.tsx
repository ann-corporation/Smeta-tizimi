import { oshibKetdimi } from '../../lib/ostatka-export';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ChevronDown, Search, Link2, Unlink, Check, SkipForward, ArrowDownToLine, X, Pencil, Trash2 } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { T2Qator } from '../../api/supabase';
import type { F2Akt, F2Tugun } from '../../lib/smeta-anatomiya/f2';
import { qidiruvMatni, qidiruvMoslagich } from '../../lib/f2-moslash-v3/qidiruv';
import type { F2MoslashNatija, Nomzod, SmetaQator } from '../../lib/f2-moslash-v3';
import {
  bogla, f2HajmiSmetaBirligida, guruhHisobla, guruhHolati, guruhIldizi, hisobla, ishniBogla, ishniTasdiqla, korinish, narxFarqiFoiz, oshaQatormi, otkazibYubor, rzTaklifHisobla, tasdiqla, TARKIB_USUL, uz,
  type F2Indeks, type IshJoyi, type KorinishHolat, type SmetaIndeks,
} from '../../lib/f2-moslash-v3/ishJoyi';
import { F2AddReplModal, type DropAction, type ModalRejali } from './F2AddReplModal';
import { IshAbcModal, type AbcRejim, type AbcTahrir } from './IshAbcModal';
import { abcXato, ishAbcOchir, resursIshZamena, type NarxManba } from '../../api/t2-ish-abc';
import { yangiOperationId } from '../../api/supabase';
import { katAniqla, type AbcResurs } from '../../lib/ish-abc';
import { qoshilganmi, smetaQatorTuri, type SmetaQatorTuri } from '../../lib/f2-moslash-v3/qoshilgan';
import { moslikIndeksiPercent } from '../../lib/f2-link-review/compatibility';
import { reconcileF2Links } from '../../lib/f2-link-review/reconciliation';
import type { KatKesim } from '../../lib/ustamali-summa';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { expandableDepths, expandableIdsAtDepth, flattenVisibleTree } from '../../lib/f2-link-review/tree';
import { saqlanmaganIsh } from '../../_shared/versiya';
import { t, t as tarj } from '../../i18n/til';

/**
 * F2 V3 — ikki oynali moslashtirish (docs/architecture/F2_IMPORT_V3.md §3).
 *
 * CHAP  — F2 akt daraxti (fayldan: razdel → ish → resurslar), har qatorda holat:
 *         ✓ bog'langan · ◐ taklif (tasdiqlang) · ✕ topilmadi · – o'tkazildi.
 * O'NG  — obyekt smetasi (t2_qator): smeta hajmi / oldingi F2 / shu F2 / qoldiq.
 *
 * Tizim1 drag-drop qoidalari (chapdan o'ngga torting yoki chapda tanlab o'ngni bosing):
 *   ish → o'sha smeta ishi        : resurslari bilan birga bog'lanadi
 *   ish → boshqa ish              : so'raladi — Bog'lash / ⇄ Zamena (shu ish o'rniga)
 *   ish → razdel                  : ＋ Qo'shimcha ish (resurslari bilan yaratiladi)
 *   resurs → o'sha resurs         : bog'lanadi
 *   resurs → boshqa resurs        : so'raladi — Bog'lash / ⇄ Zamena material
 *   resurs → smeta ishi           : ＋ Qo'shimcha resurs shu ish ostiga
 *   razdel → smeta razdeli        : razdel o'rgatiladi, qayta moslashtiriladi
 */

const fmt = (n: number | null | undefined, max = 3) =>
  n == null ? '—' : (Math.abs(n) < 1e-9 ? 0 : n).toLocaleString('ru-RU', { maximumFractionDigits: max });

const BELGI: Record<KorinishHolat, { b: string; cls: string; t: string }> = {
  aniq: { b: '✓', cls: 'text-ok', t: 'Aniq bog‘landi' },
  xotira: { b: '✓', cls: 'text-ok', t: 'O‘tgan oylardagi tasdiqlangan bog‘lanish' },
  qolda: { b: '✓', cls: 'text-accent', t: 'Siz bog‘ladingiz' },
  taklif: { b: '◐', cls: 'text-warn', t: 'Taklif — tasdiqlang yoki boshqasini tanlang' },
  topilmadi: { b: '✕', cls: 'text-danger', t: 'Topilmadi — torting: qo‘shimcha / zamena' },
  otkazildi: { b: '–', cls: 'text-text-mute', t: 'Aktga kiritilmaydi' },
};

/** Egasi 2026-09-29: har qator holatiga ko'ra och fon — bir qarashda tushunarli. */
const QATOR_FON: Record<KorinishHolat, string> = {
  aniq: 'bg-ok/[0.05]', xotira: 'bg-ok/[0.05]', qolda: 'bg-accent/[0.06]',
  taklif: 'bg-warn/[0.09]', topilmadi: 'bg-danger/[0.08]', otkazildi: 'opacity-60',
};

type Tanlov = { f: F2Tugun; s: SmetaQator; tur: 'ish' | 'resurs' | 'ish_resurs' };

function TreeControls(props: {
  depths: number[];
  onOpenAll: () => void;
  onCloseAll: () => void;
  onToggleDepth: (depth: number) => void;
}) {
  return <div className="flex flex-wrap items-center gap-1 border-b border-border/50 px-2 py-1" aria-label="Daraxt ko‘rinishini boshqarish">
    <button type="button" className="tugma h-6 px-1.5 text-[10px]" onClick={props.onOpenAll}>{t('Hammasini ochish')}</button>
    <button type="button" className="tugma h-6 px-1.5 text-[10px]" onClick={props.onCloseAll}>{t('Hammasini yopish')}</button>
    {props.depths.map((depth) => <button key={depth} type="button" className="tugma h-6 px-1.5 text-[10px]"
      aria-label={`${depth + 1}-qavatdagi barcha bo‘limlarni ochish/yopish`} onClick={() => props.onToggleDepth(depth)}>
      {depth + 1}-qavat
    </button>)}
  </div>;
}

export interface F2V3WorkbenchProps {
  akt: F2Akt;
  ind: F2Indeks;
  natija: F2MoslashNatija;
  S: SmetaIndeks;
  raw: Map<number, T2Qator>;
  /** smeta qator id → oldingi (tasdiqlangan) F2 hajmi. */
  oldingi: Map<number, number>;
  /** smeta qator id → BOSHQA bekor qilinmagan F2 qoralamalaridagi hajm (dublikat qo'riqchi). */
  band?: Map<number, number>;
  ij: IshJoyi;
  onIj: (next: IshJoyi) => void;
  onRzBog: (f2RzUid: string, smetaRzId: number) => void;
  companyId: number;
  objectId: number;
  /** Qo'shimcha/zamena qator yaratilgach: sahifa smetani yangilaydi, ish bo'lsa resurslarini yaratadi va bog'laydi. */
  onYaratildi: (f: F2Tugun, qatorId: number, resursQatorIdlar?: number[]) => Promise<void>;
  /** Zamena qatori id → u almashtirgan ASL smeta qatori id (asl qator o'zi o'zgarmaydi). */
  zamenaAsl?: ReadonlyMap<number, number>;
  /** Qo'shilgan qator tahrirlandi (yangiId) yoki o'chirildi: sahifa smetani yangilaydi va F2 bog'lanishlarini to'g'rilaydi. */
  onQoshilganOzgardi?: (eskiIdlar: number[], yangiId?: number | null) => Promise<void>;
  /** Berilsa — qo'shimcha/zamena/resurs serverga darhol yozilmaydi, qoralamaga (rejali) qo'shiladi. */
  onRejali?: (f: F2Tugun, b: ModalRejali) => void;
  /** Rejali (hali yozilmagan) vaqtinchalik qatorni olib tashlash. */
  onRejaliOchir?: (tempId: number) => void;
  /** Joriy rejali ish qatorlarining vaqtinchalik id lari (guruhni zanjir qilib joylashtirish uchun). */
  rejaliIdlar?: () => number[];
  /** Berilsa — siz qo'shgan qatorni o'chirish ham qoralamaga (serverga «F2 ni yozish» da). */
  onOchirishRejali?: (b: { qatorId: number; versiya: number; eskiIdlar: number[]; nom: string; sabab: string }) => void;
  /** Berilsa — siz qo'shgan qatorni TAHRIRLASH ham qoralamaga: eskisi o'chiriladi, yangisi «F2 ni yozish» da yoziladi. Vaqtinchalik id qaytaradi. */
  onTahrirRejali?: (b: { eski: { qatorId: number; versiya: number; eskiIdlar: number[]; nom: string }; command: 'additional' | 'replacement' | 'resurs_zamena' | 'resurs_ish';
    otaQatorId: number | null; almashtirilayotganQatorId?: number | null; resursQatorId?: number | null; ish: unknown; resurslar: unknown[]; sabab: string; operationId: string }) => number | null;
  /** Smetaga yangi bo'lim (qoralamaga). otaQatorId null — yuqori daraja. Vaqtinchalik id yoki null (nom noto'g'ri). */
  onBolimRejali?: (nom: string, otaQatorId: number | null, keyinQatorId?: number) => number | null;
  disabled?: boolean;
}

const BOSH_XARITA: ReadonlyMap<number, number> = new Map();
const NARX_MANBALAR: readonly NarxManba[] = ['smeta_obyekt', 'smeta_shartnoma', 'smeta', 'katalog', 'qolda'];

/** Egasi 2026-10-18: "vizual tushunarsiz — ranglarni yaxshiroq ko'rinadigan qil". Qator manbasi bir qarashda. */
const QATOR_RANG: Record<SmetaQatorTuri, { fon: string; chegara: string; belgi: string; yorliq: string }> = {
  asl: { fon: '', chegara: 'border-l-4 border-l-transparent', belgi: '🔒', yorliq: 'Smetadan — o‘zgarmas' },
  qoshimcha: { fon: 'bg-emerald-500/15', chegara: 'border-l-4 border-l-emerald-500', belgi: '＋', yorliq: 'Qo‘shimcha — siz qo‘shgansiz (tahrirlanadi)' },
  zamena: { fon: 'bg-amber-500/15', chegara: 'border-l-4 border-l-amber-500', belgi: '⇄', yorliq: 'Zamena — siz qo‘shgansiz (tahrirlanadi)' },
  almashtirilgan: { fon: 'bg-rose-500/10', chegara: 'border-l-4 border-l-rose-500', belgi: '↷', yorliq: 'Smeta qatori, o‘rniga zamena kiritilgan' },
};

/** Smeta paneli tepasidagi rang izohi. */
export function QatorRangIzohi() {
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/50 px-2 py-1 text-[10.5px] text-text-dim" aria-label={t('Qator ranglari izohi')}>
    {(Object.keys(QATOR_RANG) as SmetaQatorTuri[]).map((k) => (
      <span key={k} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${QATOR_RANG[k].fon} ${QATOR_RANG[k].chegara}`}>
        <span aria-hidden>{QATOR_RANG[k].belgi}</span>{QATOR_RANG[k].yorliq}
      </span>
    ))}
  </div>;
}

/** Resurs turi birlikdan: ЧЕЛ/МАШ — rs, qolgani material (kategoriyani server birlik/nom bo'yicha aniqlaydi). */
const resTuri = (birlik: string | null): 'rs' | 'mat' => (/ЧЕЛ|МАШ/i.test(birlik ?? '') ? 'rs' : 'mat');

function f2QatorTuriYorlig(i: F2Tugun['tur']): string {
  switch (i) {
    case 'bl': return 'Ish';
    case 'rs': return 'Ish tarkibidagi resurs';
    case 'mat': return 'Mustaqil material';
    case 'ob': return 'Mustaqil uskuna';
    case 'rz': return 'Bo‘lim';
  }
}

/** Egasi 2026-09-28: har pozitsiya — norma · miqdor · birlik · narx · summa (aniq ustunlarda). */
const USTUN_GRID = 'ml-auto grid shrink-0 grid-cols-[58px_72px_52px_76px_96px] items-center gap-x-1 text-right tabular-nums text-[11px]';
function SonUstunlari({ norma, miqdor, birlik, narx, oxirgi, oxirgiCls = '' }: { norma?: number | null; miqdor?: number | null; birlik?: string | null; narx?: number | null; oxirgi?: React.ReactNode; oxirgiCls?: string }) {
  return (
    <span className={USTUN_GRID}>
      <span className="text-text-mute">{norma == null ? '' : fmt(norma, 6)}</span>
      <span className="text-text">{fmt(miqdor)}</span>
      <span className="truncate text-left text-text-dim" title={birlik ?? ''}>{birlik ?? ''}</span>
      <span className="text-text-dim">{narx == null ? '' : fmt(narx, 2)}</span>
      <span className={oxirgiCls || 'text-text'}>{oxirgi}</span>
    </span>
  );
}
/**
 * Egasi 2026-09-29: "har bir qator xuddi Excel'day — o'z chegarasi, formati va rangi; matnlar
 * sig'sin". Jadval: har ustun alohida katak (chegara bilan), nom o'raladi (qisqartirilmaydi),
 * tor oynada gorizontal aylantiriladi (Excel kabi), sarlavha yopishqoq.
 */
const F2_GRID = 'f2-grid grid grid-cols-[26px_88px_minmax(180px,1fr)_56px_72px_52px_76px_96px_96px]';
const S_GRID = 'smeta-grid grid grid-cols-[22px_88px_minmax(180px,1fr)_56px_72px_52px_76px_76px_80px_100px]';
/** Smeta bo'limi qatori: belgi · nom · amallar. */
const S_RZ_GRID = 'grid grid-cols-[22px_minmax(180px,1fr)_auto]';
const KATAK = 'border-b border-r border-border/70 px-1.5 py-1';
/** Amal ustuni gorizontal aylantirishda ham o'ngda ko'rinib turadi (egasi sinovi: tugmalar kesilib qolardi). */
/** Egasi 2026-10-06: har bir ish va uning resurslari massivi alohida chegarada ko'rinsin (ikkala panelda bir xil).
 *  Ish — ustida qalin chiziq; uning resurslari — chapda shu rangdagi vertikal chiziq. */
const ISH_CHEGARA = 'border-t-2 border-t-sky-400/70';
/** Sudrash nishoni — `data-drop` atributi orqali (React qayta chizmaydi): ustiga — sariq fon, oldin/keyin — qatorlar orasida sariq chiziq. */
const DROP_NISHON = 'data-[drop=ustiga]:bg-amber-500/25 data-[drop=ustiga]:outline data-[drop=ustiga]:outline-2 data-[drop=ustiga]:outline-amber-500 '
  + 'data-[drop=oldin]:shadow-[inset_0_3px_0_0_rgb(245,158,11)] data-[drop=keyin]:shadow-[inset_0_-3px_0_0_rgb(245,158,11)]';
const RESURS_CHEGARA = 'shadow-[inset_4px_0_0_0_rgba(56,189,248,0.45)]';
const AMAL_YOPISHQOQ = 'sticky right-0 z-[1] bg-surface-1 shadow-[-6px_0_6px_-6px_rgba(0,0,0,.6)]';
const SON = `${KATAK} text-right tabular-nums text-[11.5px]`;
/** Holat katagi — to'liq rangli fon (Excel shartli formatlashi kabi). */
const HOLAT_KATAK: Record<KorinishHolat, string> = {
  aniq: 'bg-ok/25 text-ok', xotira: 'bg-ok/25 text-ok', qolda: 'bg-accent/25 text-accent',
  taklif: 'bg-warn/30 text-warn', topilmadi: 'bg-danger/30 text-danger', otkazildi: 'bg-surface-2 text-text-mute',
};
/** Panel filtri — F2 va smeta panellarida bir xil ko'rinish va xatti-harakat. */
function PanelFiltr<T extends string>(props: { label: string; value: T; onChange: (v: T) => void; options: ReadonlyArray<readonly [T, string]>; izoh?: string }) {
  return (
    <div role="group" aria-label={props.label} className="flex flex-wrap items-center gap-1 border-b border-border/60 px-2 py-1">
      {props.options.map(([v, l]) => <button key={v} type="button" aria-pressed={props.value === v}
        className={`tugma h-6 px-1.5 text-[10.5px] ${props.value === v ? 'tugma-asosiy' : ''}`} onClick={() => props.onChange(v)}>{l}</button>)}
      {props.izoh && <span className="ml-auto text-[10px] text-text-mute">{props.izoh}</span>}
    </div>
  );
}

function JadvalSarlavha({ tur }: { tur: 'f2' | 'smeta' }) {
  const u = 'border-b border-r border-border px-1.5 py-1.5';
  return (
    <div className={`${tur === 'f2' ? F2_GRID : S_GRID} sticky top-0 z-10 bg-surface-2 text-[10.5px] font-semibold uppercase tracking-wide text-text-dim`}>
      {tur === 'f2' ? <span className={`${u} text-center`} title="Holat">●</span> : <span className={`${u} text-center`} title={tarj('Belgilash')}>☐</span>}
      <span className={u}>{t('Shifr / kod')}</span><span className={u}>{t('Nomi')}</span>
      <span className={`${u} text-right`}>{t('Norma')}</span><span className={`${u} text-right`}>{t('Miqdor')}</span><span className={u}>{t('Birlik')}</span>
      <span className={`${u} text-right`}>Narx</span>{tur === 'smeta' && <span className={`${u} text-right`} title={t('Boshqa F2 qoralamalarida band hajm (tasdiqlanmagan)')}>{t('Qoralamada')}</span>}<span className={`${u} text-right`}>{tur === 'f2' ? 'Summa' : 'Qoldiq'}</span>
      <span className={`${u} ${AMAL_YOPISHQOQ} bg-surface-2`}>Amal</span>
    </div>
  );
}

/** Nomlarni solishtirish: registr, Ё/Е va bo'shliq farqi hisobga olinmaydi. */
const nomKalit = (x: string | null | undefined) => (x ?? '').toUpperCase().replace(/Ё/g, 'Е').replace(/\s+/g, ' ').trim();

export function F2V3Workbench(p: F2V3WorkbenchProps) {
  const { ind, S, ij } = p;
  const [tanlangan, setTanlangan] = useState<string | null>(null);
  /** Smeta qatori ostida ochilgan «qaysi F2 qatorlari bog'langan» ro'yxati (egasi 2026-10-24). */
  const [manbaOchiq, setManbaOchiq] = useState<number | null>(null);
  // Ommaviy belgilash (egasi 2026-10-20): holat belgisini bosish — belgilash, Shift — oraliq. Amallar bitta qaytarish qadami.
  const [belgi, setBelgi] = useState<ReadonlySet<string>>(new Set());
  const oxirgiBelgi = useRef<string | null>(null);
  useEffect(() => { setBelgi(new Set()); oxirgiBelgi.current = null; }, [p.akt]);
  // Egasi 2026-10-21: «smeta va F2 tarafda bir xil funksiyalar kerak — qatorlarni smeta tarafda tanlab bo'lmaydi».
  const [sBelgi, setSBelgi] = useState<ReadonlySet<number>>(new Set());
  const oxirgiSBelgi = useRef<number | null>(null);
  const [tafsilot, setTafsilot] = useState(false);
  const [panellar, setPanellar] = useState<'teng' | 'f2' | 'smeta' | 'ustma'>('teng');
  const [ochiqS, setOchiqS] = useState<Set<number>>(new Set());
  const [yopiqF, setYopiqF] = useState<Set<string>>(new Set());
  // PTO birinchi kirganda butun manba daraxtini ko'radi. Virtualizatsiya katta
  // hujjatda DOM hajmini cheklaydi; filtrni operator keyin ongli ravishda tanlaydi.
  const [filtr, setFiltr] = useState<'hammasi' | 'hal' | 'muammo' | 'boglanmagan'>('hammasi');
  const [q, setQ] = useState('');
  /** F2 panelidagi qidiruv (smetadagi bilan bir xil) va smeta panelidagi filtr (F2 dagi bilan bir xil). */
  const [qF, setQF] = useState('');
  const [sFiltr, setSFiltr] = useState<'hammasi' | 'boglangan' | 'boglanmagan'>('hammasi');
  /** Tashlash nishoni (sudrash paytida qaysi smeta qatori/oralig'i yoritilgan). React holati EMAS — DOM atributi
   *  `data-drop` bilan: har dragover da butun ish oynasi qayta chizilib, katta F2 da sudrash qotib qolardi
   *  (egasi 2026-10-24, o'lchov: 262 qatorda har harakat 100–760 ms). */
  const dropEl = useRef<{ el: HTMLElement; zona: string } | null>(null);
  function dropBelgila(el: HTMLElement | null, zona?: string) {
    const old = dropEl.current;
    if (old && old.el === el && old.zona === zona) return;
    if (old) old.el.removeAttribute('data-drop');
    if (el && zona) { el.setAttribute('data-drop', zona); dropEl.current = { el, zona }; } else dropEl.current = null;
  }
  /** Sudralayotgan F2 qatori (egasi 2026-09-29: drag-and-drop aniq ko'rinsin). */
  const [sudrash, setSudrash] = useState<F2Tugun | null>(null);
  const [tanlov, setTanlov] = useState<Tanlov | null>(null);
  /** «Tanlangan qator» bloki yig'iladi (egasi 2026-10-24: ekranning yarmini egallab ikki panelni suradi); holati eslab qolinadi. */
  const [panelYopiq, setPanelYopiq] = useState(() => { try { return localStorage.getItem('f2v3.panelYopiq') === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem('f2v3.panelYopiq', panelYopiq ? '1' : '0'); } catch { /* xotira yo'q */ } }, [panelYopiq]);
  const [modal, setModal] = useState<{ f: F2Tugun; action: DropAction } | null>(null);
  const [xabar, setXabar] = useState<string | null>(null);
  // ── Qo'shilgan qatorlar (qo'shimcha/zamena): TAHRIRLASH va O'CHIRISH. Asl smeta qatorlari — o'zgarmas (server ham rad etadi). ──
  const [abc, setAbc] = useState<{ rejim: AbcRejim; tahrir: AbcTahrir; eskiIdlar: number[]; rejali?: boolean; saqlash?: Parameters<typeof IshAbcModal>[0]['saqlash'] } | null>(null);
  const mutationLock = useRef(false);
  const mutationOps = useRef(new Map<string, string>());
  const [mutationBusy, setMutationBusy] = useState(false);
  const zamenaAsl = p.zamenaAsl ?? BOSH_XARITA;
  const almashtirilgan = useMemo(() => new Set(zamenaAsl.values()), [zamenaAsl]);
  const qatorTuri = (id: number): SmetaQatorTuri => { const r = p.raw.get(id); return r ? smetaQatorTuri(r, almashtirilgan) : 'asl'; };
  const pastdagiIdlar = (id: number): number[] => {
    const out = [id];
    for (let i = 0; i < out.length; i++) for (const b of S.bolalar.get(out[i]) ?? []) out.push(b.id);
    return out;
  };
  const resursPrefill = (c: T2Qator): AbcResurs => {
    const norma = Number(c.norma ?? 0);
    const usul = String(c.narx_usul ?? '').toLowerCase() as NarxManba;
    return { kat: katAniqla(c.kat, c.tur, c.birlik), kod: c.kod ?? '', nom: c.nom ?? '', birlik: c.birlik ?? '',
      norma: norma > 0 ? String(norma) : '', hajm: norma > 0 ? '' : String(c.hajm ?? ''),
      narx: c.narx != null ? String(c.narx) : '', manba: NARX_MANBALAR.includes(usul) ? usul : 'qolda' };
  };
  /** Rejali rejimda modalning «saqlash» i serverga emas, qoralamaga yozadi. */
  function rejaliSaqlash(r: T2Qator, command: 'additional' | 'replacement' | 'resurs_zamena' | 'resurs_ish', otaQatorId: number | null, almashtirilayotganQatorId?: number | null, resursQatorId?: number | null) {
    return async (d: { ish: unknown; resurslar: unknown[]; sabab: string; operationId: string }) => {
      const tempId = p.onTahrirRejali!({ eski: { qatorId: r.id, versiya: r.versiya, eskiIdlar: pastdagiIdlar(r.id), nom: r.nom ?? '' }, command, otaQatorId,
        almashtirilayotganQatorId, resursQatorId, ish: d.ish, resurslar: d.resurslar, sabab: d.sabab, operationId: d.operationId });
      return tempId == null ? { ok: false, error: tarj('Qoralamaga qo‘shilmadi.') } : { ok: true, qator_id: tempId };
    };
  }
  function qoshilganTahrir(id: number) {
    if (id < 0) { xab('Bu qator hali saqlanmagan (qoralamada). O‘zgartirish uchun uni o‘chirib, qayta qo‘shing.'); return; }
    const r = p.raw.get(id);
    if (!r || !qoshilganmi(r)) { xab('Bu qator smetadan — o‘zgarmaydi. Faqat siz qo‘shgan qatorlar tahrirlanadi.'); return; }
    const ota = r.ota_id != null ? p.raw.get(r.ota_id) : undefined;
    if (r.tur === 'bl') {
      const bolalar = [...p.raw.values()].filter((c) => c.ota_id === r.id && (c.tur === 'rs' || c.tur === 'mat' || c.tur === 'ob'));
      const eskiAsl = r.zamena && zamenaAsl.has(r.id) ? p.raw.get(zamenaAsl.get(r.id)!) : undefined;
      const tahrir: AbcTahrir = { qatorId: r.id, kutilganVersiya: r.versiya, oldAmount: [...p.raw.values()].some((c)=>c.ota_id===r.id && c.narx==null) ? null : r.summa, ish: { kod: r.kod ?? '', nom: r.nom ?? '', birlik: r.birlik ?? '', hajm: String(r.hajm ?? '') }, resurslar: bolalar.map(resursPrefill), fakt: '' };
      if (eskiAsl && eskiAsl.tur !== 'bl' && eskiAsl.tur !== 'rz') {
        // Resurs o'rnidagi ish (ГПС → qazib olish): tahrir = eskisini arxivlab shu resurs o'rniga yangi ish (bitta tranzaksiya).
        setAbc({ rejim: { tur: 'additional' }, tahrir, eskiIdlar: pastdagiIdlar(r.id), rejali: !!p.onTahrirRejali,
          saqlash: p.onTahrirRejali ? rejaliSaqlash(r, 'resurs_ish', eskiAsl.ota_id ?? null, eskiAsl.id, eskiAsl.id) : (d) => resursIshZamena({ kompaniyaId: p.companyId, obyektId: p.objectId, resursQatorId: eskiAsl.id, sabab: d.sabab, operationId: d.operationId,
            eskiQatorId: r.id, kutilganVersiya: r.versiya, ishlar: [{ ish: d.ish!, resurslar: d.resurslar }] }) });
        return;
      }
      setAbc({
        rejim: r.zamena && eskiAsl
          ? { tur: 'replacement', eski: { id: eskiAsl.id, kod: eskiAsl.kod ?? null, nom: eskiAsl.nom ?? '', birlik: eskiAsl.birlik ?? null, otaId: eskiAsl.ota_id ?? null, otaVersiya: ota?.versiya ?? null } }
          : { tur: 'additional' },
        tahrir: { qatorId: r.id, kutilganVersiya: r.versiya, oldAmount: [...p.raw.values()].some((c)=>c.ota_id===r.id && c.narx==null) ? null : r.summa, ish: { kod: r.kod ?? '', nom: r.nom ?? '', birlik: r.birlik ?? '', hajm: String(r.hajm ?? '') }, resurslar: bolalar.map(resursPrefill), fakt: '' },
        eskiIdlar: pastdagiIdlar(r.id), rejali: !!p.onTahrirRejali,
        saqlash: p.onTahrirRejali ? rejaliSaqlash(r, r.zamena && eskiAsl ? 'replacement' : 'additional', r.ota_id ?? null, r.zamena && eskiAsl ? eskiAsl.id : null) : undefined,
      });
    } else if (r.zamena && zamenaAsl.has(r.id)) {
      const aslId = zamenaAsl.get(r.id)!; const eskiAsl = p.raw.get(aslId);
      setAbc({ rejim: { tur: 'resurs_zamena', eski: { id: aslId, nom: eskiAsl?.nom ?? r.nom ?? '', birlik: eskiAsl?.birlik ?? r.birlik ?? null, kat: eskiAsl?.kat ?? r.kat ?? null, norma: eskiAsl?.norma ?? null }, ishHajm: ota?.hajm ?? null },
        tahrir: { qatorId: r.id, kutilganVersiya: r.versiya, oldAmount:r.summa, resurslar: [resursPrefill(r)] }, eskiIdlar: [r.id], rejali: !!p.onTahrirRejali,
        saqlash: p.onTahrirRejali ? rejaliSaqlash(r, 'resurs_zamena', r.ota_id ?? null, aslId) : undefined });
    } else xab('Bu resurs siz qo‘shgan ish ichida — ishning o‘zini tahrirlang.');
  }
  async function qoshilganOchir(id: number) {
    if (p.disabled || mutationLock.current) return;
    if (id < 0) { p.onRejaliOchir?.(id); xab('Saqlanmagan qator qoralamadan olib tashlandi.'); return; }
    const r = p.raw.get(id);
    if (!r || !qoshilganmi(r)) { xab('Bu qator smetadan — o‘chirilmaydi. Faqat siz qo‘shgan qatorlar o‘chiriladi.'); return; }
    const sabab = window.prompt(`«${r.nom ?? ''}» o‘chirilsinmi? ${r.zamena ? 'Zamena bekor bo‘ladi, smetaning asl qatori qoladi.' : r.tur === 'rz' ? 'Bo‘lim va uning ichidagi barcha qatorlar o‘chiriladi (arxivda saqlanadi).' : 'Qator va uning resurslari o‘chiriladi (arxivda saqlanadi).'} Unga bog‘langan F2 qatorlari qayta bog‘lash uchun bo‘shaydi. Smetadagi qator summasi: ${r.summa == null ? 'noma’lum' : fmt(r.summa, 2)}.\nSabab (ixtiyoriy):`, '');
    if (sabab === null) return;
    const eskiIdlar = pastdagiIdlar(id);
    if (p.onOchirishRejali) {
      p.onOchirishRejali({ qatorId: id, versiya: r.versiya, eskiIdlar, nom: r.nom ?? '', sabab: sabab || 'F2 import: xato qo‘shilgan' });
      xab(tarj('O‘chirishga belgilandi — «F2 ni yozish» bosilganda o‘chiriladi. Bo‘shagan F2 qatorlarini qayta bog‘lang.'));
      return;
    }
    const opKey = `${p.companyId}:${p.objectId}:${id}:${sabab}`;
    const operationId = mutationOps.current.get(opKey) ?? yangiOperationId();
    mutationOps.current.set(opKey, operationId);
    mutationLock.current = true; setMutationBusy(true);
    try {
    const res = await ishAbcOchir({ kompaniyaId: p.companyId, obyektId: p.objectId, qatorId: id, kutilganVersiya: r.versiya, sabab: sabab || 'F2 import: xato qo‘shilgan', operationId });
    if (!res.ok) { xab(abcXato(res)); return; }
    xab(r.zamena ? 'Zamena bekor qilindi — asl smeta qatori o‘z joyida.' : `O‘chirildi: ${res.ochirildi ?? 1} ta qator. Bo‘shagan F2 qatorlarini qayta bog‘lang.`);
    await p.onQoshilganOzgardi?.(eskiIdlar, null);
    mutationOps.current.delete(opKey);
    } catch { xab('Javob olinmadi. Bog‘lanishlar saqlangan — qayta urinib ko‘ring.'); }
    finally { mutationLock.current = false; setMutationBusy(false); }
  }
  const smetaQuti = useRef<HTMLDivElement>(null);
  const f2Quti = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** Sudrab tashlangan tanlov — smeta oynasi avto-aylantirilmaydi (operator o'sha joyda ishlayapti). */
  const sudrabTanlandi = useRef(false);
  /** Smeta daraxti birinchi marta ochildimi — keyingi qayta yuklashlarda yoyilganlar saqlanadi. */
  const smetaOchildi = useRef(false);

  const h = useMemo(() => hisobla(ind, ij), [ind, ij]);
  const barchaManbaIzohlari = p.akt.anatomiya?.review ?? [];
  const manbaTekshiruvi = barchaManbaIzohlari.filter((review) => review.kod !== 'f2_podval_qatori');
  const manbaPodvalQatorlari = barchaManbaIzohlari.filter((review) => review.kod === 'f2_podval_qatori');
  const shuF2 = useMemo(() => {
    const m = new Map<number, { hajm: number; uidlar: string[] }>();
    for (const [uid, b] of ij.bog) {
      const t = ind.byUid.get(uid);
      if (!t || ij.otkaz.has(uid) || b.usul === TARKIB_USUL) continue;
      const x = m.get(b.qatorId) ?? { hajm: 0, uidlar: [] };
      // Yig'ma summa (birliksiz, narx 1) smeta birligiga o'tkaziladi — qoldiq so'mda emas, smeta birligida hisoblansin.
      x.hajm += f2HajmiSmetaBirligida(t, S.byId.get(b.qatorId)).hajm ?? 0; x.uidlar.push(uid);
      m.set(b.qatorId, x);
    }
    return m;
  }, [ij, ind, S]);
  const rzDiag = useMemo(() => new Map(p.natija.rzDiag.map((d) => [d.f2Uid, d])), [p.natija]);
  const tTugun = tanlangan ? ind.byUid.get(tanlangan) ?? null : null;

  const reconciliation = useMemo(() => reconcileF2Links(p.akt.jami.pryamye,
    ind.qatorlar.filter((t) => t.barg).map((t) => {
      const state = korinish(ij, t.uid);
      const binding = ij.bog.get(t.uid);
      const target = binding ? S.byId.get(binding.qatorId) : undefined;
      return {
        state: state === 'otkazildi' ? 'excluded' as const
          : state === 'taklif' ? 'suggested' as const
            : state === 'topilmadi' ? 'unbound' as const : 'confirmed' as const,
        sourceAmount: t.summa,
        sourceQuantity: f2HajmiSmetaBirligida(t, target).hajm,
        referenceUnitPrice: target?.narx ?? null,
        kat: target?.kat ?? null,
      };
    })), [p.akt.jami.pryamye, ind, ij, S]);

  const f2ExpandableDepths = useMemo(() => expandableDepths(p.akt.daraxt, (node) => node.bolalar), [p.akt.daraxt]);
  const smetaRoots = useMemo(() => S.bolalar.get(null) ?? [], [S]);
  const smetaExpandableDepths = useMemo(() => expandableDepths(smetaRoots, (node) => S.bolalar.get(node.id) ?? []), [S, smetaRoots]);
  const halUidlar = useMemo(() => new Set(guruhHisobla(ind, ij).hal), [ind, ij]);
  const f2VisibleRows = useMemo(() => {
    const mos = qidiruvMoslagich(qF);
    if (mos) {
      const out: Array<{ node: F2Tugun; depth: number }> = [];
      for (const t of ind.qatorlar) {
        if (t.tur === 'rz') continue;
        if (mos(qidiruvMatni(t))) { out.push({ node: t, depth: 0 }); if (out.length >= 500) break; }
      }
      return out;
    }
    const matches = (node: F2Tugun) => {
      if (node.tur === 'rz') return filtr === 'hammasi';
      if (filtr === 'hammasi') return true;
      const state = korinish(ij, node.uid);
      const binding = ij.bog.get(node.uid);
      const duplicate = binding ? h.kopBog.has(binding.qatorId) : false;
      const target = binding ? S.byId.get(binding.qatorId) : undefined;
      const previous = binding ? (p.oldingi.get(binding.qatorId) ?? 0) : 0;
      const remaining = target?.hajm == null ? null : target.hajm - previous;
      const used = binding ? (shuF2.get(binding.qatorId)?.hajm ?? 0) : 0;
      const over = remaining != null && (target!.hajm! >= 0 ? used > remaining + 1e-9 : used < remaining - 1e-9);
      const unbound = state === 'topilmadi' || (!binding && state !== 'otkazildi');
      const ildiz = guruhIldizi(ind, node.uid);
      const unresolved = !!ildiz && halUidlar.has(ildiz.uid);
      const missingValue = node.barg && (node.hajm == null || node.summa == null);
      if (filtr === 'hal') return unresolved;
      if (filtr === 'boglanmagan') return unbound;
      return unresolved || !!node.ogohlantirish?.length || duplicate || over || !!missingValue;
    };
    return flattenVisibleTree(p.akt.daraxt, (node) => node.bolalar, (node) => node.uid,
      matches, (uid) => !yopiqF.has(String(uid)));
  }, [p.akt.daraxt, filtr, ij, h.kopBog, S, shuF2, yopiqF, p.oldingi, qF, ind, halUidlar]);
  const qidiruvNatija = useMemo(() => {
    const mos = qidiruvMoslagich(q);
    if (!mos) return null;
    const out: SmetaQator[] = [];
    for (const s of S.byId.values()) {
      if (s.tur === 'rz') continue;
      if (mos(qidiruvMatni(s))) { out.push(s); if (out.length >= 500) break; }
    }
    return out;
  }, [q, S]);
  const smetaVisibleRows = useMemo(() => qidiruvNatija
    ? qidiruvNatija.map((node) => ({ node, depth: 0 }))
    : flattenVisibleTree(smetaRoots, (node) => S.bolalar.get(node.id) ?? [], (node) => node.id,
      (node) => sFiltr === 'hammasi' || (node.tur !== 'rz' && (sFiltr === 'boglangan') === shuF2.has(node.id)),
      // Filtr yoqilganda mos qatorlar yopiq bo'limda yashirinib qolmasin.
      (id) => sFiltr !== 'hammasi' || ochiqS.has(Number(id))), [qidiruvNatija, smetaRoots, S, ochiqS, sFiltr, shuF2]);
  // getItemKey MAJBURIY: o'lcham keshi qator identifikatori bo'yicha. Index bo'yicha bo'lsa (avvalgi holat), razdel
  // ochilib-yopilganda qatorlar indeksi o'zgaradi, eski indeksning balandligi ishlatilib, qatorlar orasida bo'shliq
  // yoki ustma-ust tushish paydo bo'lardi (egasi sinovi 2026-10-06: «СТЕНЫ» yopilganda 153 px gacha bo'shliq).
  const f2Virtual = useVirtualizer({ count: f2VisibleRows.length, getScrollElement: () => f2Quti.current, estimateSize: () => 38, overscan: 12,
    getItemKey: (i) => f2VisibleRows[i]?.node.uid ?? i });
  const smetaVirtual = useVirtualizer({ count: smetaVisibleRows.length, getScrollElement: () => smetaQuti.current, estimateSize: () => 38, overscan: 12,
    getItemKey: (i) => smetaVisibleRows[i]?.node.id ?? i });
  // Virtual ro'yxatda maqsad qator DOM'da bo'lmasligi mumkin — querySelector+scrollIntoView ishlamaydi. Aylantirish
  // indeks orqali; daraxt ochilishi (state) render bo'lgach bajariladi.
  // Moslashtirish ish joyi ochiq — deploy/yangilash ishni so'ramasdan o'chirmasin (versiya.ts).
  const workbenchEditable = !p.disabled && !mutationBusy;
  useEffect(() => { saqlanmaganIsh('f2-import', workbenchEditable); return () => saqlanmaganIsh('f2-import', false); }, [workbenchEditable]);
  const f2RowsRef = useRef(f2VisibleRows); f2RowsRef.current = f2VisibleRows;
  const smetaRowsRef = useRef(smetaVisibleRows); smetaRowsRef.current = smetaVisibleRows;
  const f2Fokus = useRef<string | null>(null), smetaFokus = useRef<number | null>(null);
  useEffect(() => {
    if (f2Fokus.current != null) {
      const i = f2RowsRef.current.findIndex((r) => r.node.uid === f2Fokus.current);
      if (i >= 0) { f2Virtual.scrollToIndex(i, { align: 'center' }); f2Fokus.current = null; }
    }
    if (smetaFokus.current != null) {
      const i = smetaRowsRef.current.findIndex((r) => r.node.id === smetaFokus.current);
      if (i >= 0) { smetaVirtual.scrollToIndex(i, { align: 'center' }); smetaFokus.current = null; }
    }
  });

  // Har ikki daraxt birinchi ochilganda to'liq ochiq; keyin operator har sathni alohida boshqaradi.
  // Egasi 2026-09-30: qo'shimcha/zamena yozilgach smeta qayta yuklanadi — yoyilgan bo'limlar va
  // aylantirish joyi SAQLANADI (avval hammasi qayta ochilib, operator joyni qaytadan qidirardi).
  useEffect(() => {
    if (smetaOchildi.current) {
      const top = smetaQuti.current?.scrollTop ?? 0;
      setOchiqS((old) => new Set([...old].filter((id) => S.byId.has(id))));
      requestAnimationFrame(() => { if (smetaQuti.current) smetaQuti.current.scrollTop = top; });
      return;
    }
    smetaOchildi.current = true;
    setOchiqS(smetaExpandableDepths.reduce((expanded, depth) => {
      for (const id of expandableIdsAtDepth(smetaRoots, (node) => S.bolalar.get(node.id) ?? [], (node) => node.id, depth)) expanded.add(Number(id));
      return expanded;
    }, new Set<number>()));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S]);

  /** Tanlangan F2 qatori uchun nomzodlar: dvigateldan; resurs uchun — bog'langan smeta ishi ichidagilar. */
  const nomzodlar = useMemo<Nomzod[]>(() => {
    if (!tTugun) return [];
    const n = p.natija.natijalar.get(tTugun.uid)?.nomzodlar ?? [];
    if (n.length || tTugun.tur !== 'rs') return n;
    const ota = ind.ota.get(tTugun.uid);
    const otaBog = ota ? ij.bog.get(ota.uid) : undefined;
    if (!otaBog) return [];
    return (S.bolalar.get(otaBog.qatorId) ?? []).filter((s) => s.tur !== 'rz').map((s) => ({
      qatorId: s.id, ball: oshaQatormi(tTugun, s) ? 50 : 0, yol: '', qavatlar: [], sabab: [oshaQatormi(tTugun, s) ? 'kod/nom ✓' : 'ish ichidagi resurs'],
    })).sort((a, b) => b.ball - a.ball);
  }, [tTugun, p.natija, ind, ij, S]);
  const nomzodFoiz = useMemo(() => {
    if (!tTugun) return new Map<number, number | null>();
    return new Map(nomzodlar.map((candidate) => [candidate.qatorId, moslikIndeksiPercent(candidate, tTugun)]));
  }, [nomzodlar, tTugun]);

  // Tanlanganda: bog'langan qator (yoki eng yaxshi nomzodlar) o'ngda ochiladi va ko'rinadi.
  const selectedTarget = tanlangan ? ij.bog.get(tanlangan)?.qatorId : undefined;
  useEffect(() => {
    if (!tTugun) return;
    if (sudrabTanlandi.current) { sudrabTanlandi.current = false; return; }
    const b = ij.bog.get(tTugun.uid);
    const ids = [b?.qatorId, ...nomzodlar.slice(0, 3).map((n) => n.qatorId)].filter((x): x is number => x != null);
    if (!ids.length) return;
    // A previous search/filter must not hide the linked row the operator is reviewing.
    setQ(''); setSFiltr('hammasi');
    setOchiqS((old) => {
      const s = new Set(old);
      for (const id of ids) for (let t = S.byId.get(id); t && t.otaId != null; t = S.byId.get(t.otaId)) s.add(t.otaId);
      return s;
    });
    smetaFokus.current = ids[0];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tanlangan, selectedTarget]);

  // ── Amallar ──
  function xab(m: string) { setXabar(m); }
  function ishBogla(f: F2Tugun, sId: number) {
    const r = ishniBogla(ij, f, sId, S);
    p.onIj(r.ij);
    xab(f.bolalar.length
      ? `«${f.nom.slice(0, 50)}» bog‘landi, resurslar: ${r.boglandi} ta ✓${r.qoldi ? `, ${r.qoldi} tasi mos kelmadi (✕ — zamena material yoki qo‘shimcha resurs)` : ''}.`
      : `«${f.nom.slice(0, 50)}» bog‘landi.`);
  }
  /** Tashlash (yoki tanlab bosish) — Tizim1 qoidalari. */
  function tashla(fUid: string, sId: number) {
    if ((p.disabled || mutationBusy)) return;
    const f = ind.byUid.get(fUid);
    const s = S.byId.get(sId);
    if (!f || !s) return;
    const sRes = s.tur !== 'rz' && s.tur !== 'bl';
    if (f.tur === 'rz') {
      if (s.tur !== 'rz') { xab('Razdelni smeta RAZDELIGA torting — shu razdel ichidan qidiriladi.'); return; }
      p.onRzBog(f.uid, s.id);
      xab(`«${f.nom.slice(0, 50)}» → «${(s.nom ?? '').slice(0, 50)}» razdeliga o‘rgatildi, qayta moslashtirildi.`);
      return;
    }
    if (f.tur === 'bl') {
      if (s.tur === 'rz') { ochModal(f, { kind: 'additional', parent: p.raw.get(s.id)!, keyinId: s.id }); return; }
      if (sRes) {
        // Egasi 2026-10-18: ish smeta RESURSIGA tashlansa — "shu resurs o'rniga ish" (masalan ГПС ni buyurtmachi bergan:
        // material olinmaydi, qazib olish va tashish ishlari olinadi).
        if (qoshilganmi(p.raw.get(s.id))) { xab('Bu resursni o‘zingiz qo‘shgansiz — uni tahrirlang yoki o‘chiring.'); return; }
        // Egasi 2026-10-21: F2 da resurssiz «ish» qatori aslida material (masalan ПК → ПБ plita). Uni smeta resursiga
        // tashlash — material bog'lash/zamenasi; «resurs o'rniga ish» (karyer) faqat resurslari bor ish uchun.
        if (!f.bolalar.length) {
          if (aynanBirXil(f, s)) { p.onIj(bogla(ij, f.uid, s.id)); xab(`«${f.nom.slice(0, 50)}» bog‘landi.`); return; }
          setTanlov({ f, s, tur: 'resurs' });
          return;
        }
        setTanlov({ f, s, tur: 'ish_resurs' });
        return;
      }
      // Egasi 2026-09-30: nomida bitta nuqta farq bo'lsa ham so'ralsin (bog'lash / zamena / qo'shimcha).
      if (aynanBirXil(f, s)) { ishBogla(f, s.id); return; }
      setTanlov({ f, s, tur: 'ish' });
      return;
    }
    // resurs
    if (s.tur === 'bl') { ochModal(f, { kind: 'resource', parent: p.raw.get(s.id)!, keyinId: s.id }); return; }
    if (s.tur === 'rz') { xab('Resursni smeta RESURSIGA (bog‘lash/zamena) yoki smeta ISHIGA (qo‘shimcha resurs) torting.'); return; }
    if (aynanBirXil(f, s)) { p.onIj(bogla(ij, f.uid, s.id)); xab(`«${f.nom.slice(0, 50)}» bog‘landi.`); return; }
    setTanlov({ f, s, tur: 'resurs' });
  }
  /** Qo'lda tashlaganda jim bog'lanadigan yagona holat: nom (katta-kichik harf va bo'shliqdan tashqari)
   *  va birlik AYNAN bir xil. Kod bir xil bo'lsa ham ("С" materiallar) nom farq qilsa — so'raladi. */
  function aynanBirXil(f: F2Tugun, s: SmetaQator): boolean {
    const n = (x: string | null | undefined) => (x ?? '').toUpperCase().replace(/Ё/g, 'Е').replace(/\s+/g, ' ').trim();
    return n(f.nom) === n(s.nom) && n(f.birlik) === n(s.birlik) && oshaQatormi(f, s);
  }
  function ochModal(f: F2Tugun, action: DropAction) {
    if (!action.parent) { xab('Smeta qatori topilmadi — sahifani yangilang.'); return; }
    setModal({ f, action });
  }
  /** F2 ishi (resurslari bilan) smeta RESURSI o'rniga: server o'sha bo'limda, resursning ishidan keyin yangi ish yaratadi;
   *  asl resurs o'zgarmaydi. Bir resurs o'rniga bir nechta ish — har birini shu resursga tashlang. */
  async function resursOrnigaIsh(f: F2Tugun, s: SmetaQator) {
    const hajm = Number(f.hajm);
    if (!Number.isFinite(hajm) || hajm === 0) { xab('F2 ishining hajmi bo‘sh yoki 0 — avval hujjatdagi hajmni tekshiring.'); return; }
    const sabab = window.prompt(`«${s.nom ?? ''}» o‘rniga «${f.nom}» ishi yoziladi (resurs o‘zi o‘zgarmaydi).\nSabab:`, 'Material buyurtmachidan (masalan karyer) — o‘rniga ish bajarilgan');
    if (sabab === null || !sabab.trim()) return;
    const resurslar = f.bolalar.filter((r) => Number.isFinite(Number(r.hajm)) && Number(r.hajm) !== 0).map((r) => ({
      kat: katAniqla(null, r.tur, r.birlik), kod: r.kod ?? null, nom: r.nom, birlik: r.birlik || 'шт',
      norma: null, hajm: Number(r.hajm), narx: r.narx != null && r.narx > 0 ? r.narx : null, narx_manba: 'qolda' as const,
    }));
    // Qoralama rejimi: serverga «F2 ni yozish» da. Ish resursning bo'limiga, resursning ishidan keyin qo'yiladi.
    if (p.onRejali) {
      const ishQ = s.otaId != null ? S.byId.get(s.otaId) : undefined;
      const rzId = ishQ?.otaId ?? undefined;
      if (!ishQ || rzId == null) { xab(tarj('Resurs ish ichida emas — ish zamenasi uchun bo‘lim aniqlanmadi.')); return; }
      p.onRejali(f, { kind: 'resurs_ish', tur: 'bl', otaQatorId: rzId, keyinQatorId: ishQ.id, almashtirilayotganQatorId: s.id, resursQatorId: s.id,
        nom: f.nom, birlik: f.birlik || 'шт', hajm, kod: f.kod ?? undefined, sabab: sabab.trim(), operationId: yangiOperationId(),
        resurslar: f.bolalar.map((r) => ({ tur: resTuri(r.birlik), nom: r.nom, birlik: r.birlik || 'шт', hajm: r.hajm, kod: r.kod })), ishResurslari: resurslar });
      xab(`«${f.nom.slice(0, 50)}» — «${(s.nom ?? '').slice(0, 40)}» ${tarj('o‘rniga qoralamaga qo‘shildi.')}`);
      return;
    }
    const res = await resursIshZamena({ kompaniyaId: p.companyId, obyektId: p.objectId, resursQatorId: s.id, sabab: sabab.trim(), operationId: yangiOperationId(),
      ishlar: [{ ish: { kod: f.kod ?? null, nom: f.nom, birlik: f.birlik || 'шт', hajm }, resurslar }] });
    if (!res.ok || res.qator_id == null) { xab(abcXato(res)); return; }
    xab(`«${f.nom.slice(0, 50)}» — «${(s.nom ?? '').slice(0, 40)}» o‘rniga yozildi.`);
    await p.onYaratildi(f, res.qator_id, res.resurs_idlar?.[0] ?? []);
  }
  function zamena(f: F2Tugun, s: SmetaQator) {
    const oldRow = p.raw.get(s.id);
    const parent = s.otaId != null ? p.raw.get(s.otaId) : undefined;
    if (!oldRow || !parent) { xab('Zamena uchun smeta qatorining otasi topilmadi.'); return; }
    ochModal(f, { kind: 'replacement', oldRow, parent });
  }
  /** Ish va uning resurslari — bitta guruh: tasdiqlash ish + barcha resurslari (kod → kanon → nom+birlik ish ichida), mos topilmaganlar ish ichida qoladi. */
  function ishTasdiq(f: F2Tugun) {
    const r = ishniTasdiqla(ij, f, S);
    p.onIj(r.ij);
    xab(`${tarj('Ish tasdiqlandi')}: ${r.tasdiqlandi} ${tarj('ta taklif tasdiqlandi')}, ${r.boglandi} ${tarj('ta resurs avtomatik bog‘landi')}${r.qoldi ? `; ${r.qoldi} ${tarj('ta resurs uchun smetada mos topilmadi — ish ichida zamena/qo‘shimcha resurs bilan hal qiling')}` : ''}`);
  }
  function keyingiHal() {
    // Navbat ISH darajasida (ildiz): resurslar bitta-bitta chiqmaydi.
    const list = ind.qatorlar.filter((t) => guruhIldizi(ind, t.uid)?.uid === t.uid);
    const tanlanganIldiz = tanlangan ? guruhIldizi(ind, tanlangan)?.uid : undefined;
    const bosh = tanlanganIldiz ? list.findIndex((t) => t.uid === tanlanganIldiz) + 1 : 0;
    for (let i = 0; i < list.length; i++) {
      const t = list[(bosh + i) % list.length];
      const k = guruhHolati(ind, ij, t);
      if (k === 'topilmadi' || k === 'taklif') {
        setTanlangan(t.uid);
        setYopiqF((old) => {
          const next = new Set(old);
          for (let parent = ind.ota.get(t.uid); parent; parent = ind.ota.get(parent.uid)) next.delete(parent.uid);
          return next;
        });
        f2Fokus.current = t.uid;
        return;
      }
    }
    xab('Hal qilinmagan qator qolmadi.');
  }
  /** F2 qatorini tanlab, chap daraxtda ko'rinadigan qilish (ota bo'limlari ochiladi). */
  function f2Korsat(uid: string) {
    setTanlangan(uid);
    setYopiqF((old) => {
      const next = new Set(old);
      for (let parent = ind.ota.get(uid); parent; parent = ind.ota.get(parent.uid)) next.delete(parent.uid);
      return next;
    });
    f2Fokus.current = uid;
  }
  /** Smeta qatoriga bog'langan F2 qatorlari ro'yxati: qayerdan, qancha, qanday usulda — va har birini uzish. */
  function manbaRoyxati(band: { hajm: number; uidlar: string[] }) {
    const uzBir = (uid: string) => { const tg = ind.byUid.get(uid); if (tg) p.onIj(uz(ij, tg)); };
    const uzHammasi = () => {
      let next = ij;
      for (const uid of band.uidlar) { const tg = ind.byUid.get(uid); if (tg && next.bog.has(uid)) next = uz(next, tg); }
      p.onIj(next); setManbaOchiq(null);
      xab(`${band.uidlar.length} ${tarj('ta F2 qatorining bog‘lanishi uzildi. Kerak bo‘lsa «Orqaga» bilan qaytaring.')}`);
    };
    return (
      <div className="border-b border-l-4 border-accent/60 bg-surface-2/70 px-3 py-2 text-[11.5px]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <b className="text-text">{tarj('Shu smeta qatoriga bog‘langan F2 qatorlari')}: {band.uidlar.length}</b>
          <button type="button" className="tugma h-6 px-1.5 text-[11px] text-danger" disabled={p.disabled} onClick={uzHammasi}><Unlink size={11} /> {tarj('Hammasini uzish')}</button>
          <button type="button" className="tugma h-6 px-1.5 text-[11px]" onClick={() => setManbaOchiq(null)}>✕</button>
        </div>
        <ul className="space-y-0.5">
          {band.uidlar.map((uid) => {
            const f = ind.byUid.get(uid);
            const b = ij.bog.get(uid);
            if (!f || !b) return null;
            const minus = (f.hajm ?? 0) < 0;
            return (
              <li key={uid} className={`flex flex-wrap items-center gap-2 rounded px-1 ${minus ? 'bg-danger/10' : ''}`}>
                <span className="font-mono text-[10.5px] text-text-mute">{f.manzil.varaq}!{f.manzil.qator}</span>
                <span className="min-w-0 flex-1 truncate text-text" title={f.nom}>{f.kod ? `${f.kod} · ` : ''}{f.nom}</span>
                <span className={`font-mono ${minus ? 'font-semibold text-danger' : 'text-text'}`}>{fmt(f.hajm ?? 0)} {f.birlik ?? ''}</span>
                <span className="rounded bg-surface px-1 text-[10px] text-text-dim" title={b.usul}>{usulNomi(b)}</span>
                <button type="button" className="tugma h-6 px-1.5 text-[11px]" onClick={() => f2Korsat(uid)}>{tarj('F2 da ko‘rsatish')}</button>
                <button type="button" className="tugma h-6 px-1.5 text-[11px]" disabled={p.disabled} onClick={() => uzBir(uid)}><Unlink size={11} /> {tarj('Uzish')}</button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
  function f2BarchasiniOch() { setYopiqF(new Set()); }
  function f2BarchasiniYop() { setYopiqF(new Set(collectF2ExpandableIds(p.akt.daraxt))); }
  function smetaBarchasiniYop() { setOchiqS(new Set()); }
  function collectF2ExpandableIds(roots: readonly F2Tugun[]): string[] {
    const ids: string[] = [];
    const visit = (nodes: readonly F2Tugun[]) => { for (const node of nodes) { if (node.bolalar.length) ids.push(node.uid); visit(node.bolalar); } };
    visit(roots);
    return ids;
  }
  /** Tanlash sahifani aylantirmaydi: tafsilot paneli daraxtlar ustida, doimiy balandlikda (pastki qatorlar siljimaydi). */
  function scrollTanlanganPanelga(uid: string) {
    setTanlangan(uid);
  }

  // ── Chap: F2 daraxti. Har qator mustaqil tanlanadi; bog'lash amali qatorning o'zida. ──
  /** Ishning resurslari summasi (ish qatorida o'zi pul yo'q — pul resurslarda). */
  /** Razdel jami (egasi: har qavatning o'z hisobi) — ichidagi barcha pozitsiyalar summasi. */
  const rzSumma = useMemo(() => {
    const m = new Map<string, number>();
    const yur = (t: F2Tugun): number => {
      let x = 0;
      for (const c of t.bolalar) x += c.tur === 'rz' ? yur(c) : c.barg ? (c.summa ?? 0) : c.bolalar.reduce((a, r) => a + (r.summa ?? 0), 0);
      m.set(t.uid, x);
      return x;
    };
    p.akt.daraxt.filter((t) => t.tur === 'rz').forEach(yur);
    return m;
  }, [p.akt.daraxt]);
  const bolaSumma = (t: F2Tugun): number | null => {
    if (!t.bolalar.length) return null;
    let s = 0, bor = false;
    for (const r of t.bolalar) if (r.summa != null) { s += r.summa; bor = true; }
    return bor ? s : null;
  };
  function f2Qator(t: F2Tugun, depth: number): React.ReactNode {
    const ochiqmi = t.bolalar.length > 0 && !yopiqF.has(t.uid);
    const almashtir = () => setYopiqF((old) => { const next = new Set(old); if (next.has(t.uid)) next.delete(t.uid); else next.add(t.uid); return next; });
    const chevron = t.bolalar.length > 0
      ? <button type="button" className="mr-1 shrink-0 align-middle text-text-mute" aria-label={ochiqmi ? `F2 qatorni yopish: ${t.nom}` : `F2 qatorni ochish: ${t.nom}`} onClick={(e) => { e.stopPropagation(); almashtir(); }}>
          {ochiqmi ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
      : null;
    if (t.tur === 'rz') {
      // Razdel — butun eni bo'ylab birlashgan sarlavha katagi, o'z jami summasi bilan.
      const d = rzDiag.get(t.uid);
      const sNom = d?.smetaRzIdlar.map((id) => S.byId.get(id)?.nom).filter(Boolean).join(' | ');
      const ishliRz = t.bolalar.some((c) => c.tur !== 'rz');
      const rzTaklif = !d?.ok && ishliRz ? rzTaklifHisobla(t, ij, S) : null;
      return (
        <div data-fuid={t.uid} className="grid grid-cols-[minmax(180px,1fr)_85px_160px] bg-surface-2/80 text-[12px] font-semibold text-text">
          <div onPointerDown={(e) => ptrBoshla(e, t)} data-sudrash={(p.disabled || mutationBusy) ? undefined : 'ha'}
            className={`${KATAK} flex cursor-grab items-center text-left uppercase`} style={{ paddingLeft: 6 + depth * 14 }}
            title="Razdelni o‘ngdagi smeta razdeliga tortsangiz — shu razdel ichidan qidiriladi">
            {chevron}<button type="button" className="min-w-0 flex-1 break-words text-left" onClick={() => scrollTanlanganPanelga(t.uid)}>{t.nom}</button>
          </div>
          <span className={`${SON} font-semibold`}>{fmt(rzSumma.get(t.uid) ?? null, 2)}</span>
          <span className={`${KATAK} text-[10.5px] font-normal normal-case ${d?.ok || !ishliRz ? 'text-text-mute' : 'text-warn'}`} title={sNom || undefined}>
            {d?.ok ? `→ ${sNom || 'smeta bo‘limi'}` : ishliRz ? (rzTaklif ? '' : 'bo‘lim ulanmagan — mos smeta bo‘limiga torting') : 'guruh'}
            {!d?.ok && rzTaklif && <button type="button" className="tugma tugma-asosiy h-6 px-1.5 text-[11px]" disabled={p.disabled || mutationBusy}
              title={`${rzTaklif.soni}/${rzTaklif.jami} ${tarj('ish shu bo‘limga bog‘langan')}`}
              onClick={() => p.onRzBog(t.uid, rzTaklif.smetaRzId)}>
              <Check size={11} /> {tarj('Bo‘lim')}: {(rzTaklif.nom || '').slice(0, 40)} ({Math.round(rzTaklif.ulush * 100)}%)
            </button>}
          </span>
        </div>
      );
    }
    const k = korinish(ij, t.uid);
    const B = BELGI[k];
    const b = ij.bog.get(t.uid);
    const s = b ? S.byId.get(b.qatorId) : undefined;
    const sel = tanlangan === t.uid;
    /** Faqat summa bilan kelgan qator (birliksiz, narx 1): smeta birligida hajm = summa / smeta narx. */
    const bk = f2HajmiSmetaBirligida(t, s);
    const farqFoiz = t.barg && b && k !== 'otkazildi' ? bk.summaBoyicha ? null : narxFarqiFoiz(t.narx, s?.narx) : null;
    const candidateCount = p.natija.natijalar.get(t.uid)?.nomzodlar.length ?? 0;
    const ish = t.tur === 'bl';
    // Qo'shimcha ish uchun smeta razdeli: F2 razdeli bog'langan smeta razdeli (bitta bo'lsa).
    const otaRz = ind.ota.get(t.uid);
    const rzId = otaRz ? rzDiag.get(otaRz.uid)?.smetaRzIdlar[0] : undefined;
    const tanla = () => (sel ? setTanlangan(null) : scrollTanlanganPanelga(t.uid));
    /** F2 dagi qo'shnilar tartibi: shu qatordan oldingi, smetaga bog'langan eng yaqin qatordan keyin. */
    const oldingiKeyin = (): number | undefined => {
      const aka = otaRz?.bolalar ?? [];
      for (let i = aka.findIndex((x) => x.uid === t.uid) - 1; i >= 0; i--) {
        const bb = ij.bog.get(aka[i].uid);
        if (bb && S.byId.get(bb.qatorId)?.otaId === rzId) return bb.qatorId;
      }
      return rzId;
    };
    // Resurs uchun: F2 ishi bog'langan smeta ishi va massivdagi oldingi resursning smeta jufti.
    const otaIsh = !ish ? ind.ota.get(t.uid) : undefined;
    const otaSmetaIsh = otaIsh ? ij.bog.get(otaIsh.uid)?.qatorId : undefined;
    const resursKeyin = (): number | undefined => {
      if (otaSmetaIsh == null || !otaIsh) return undefined;
      const aka = otaIsh.bolalar;
      for (let i = aka.findIndex((x) => x.uid === t.uid) - 1; i >= 0; i--) {
        const bb = ij.bog.get(aka[i].uid);
        if (bb && S.byId.get(bb.qatorId)?.otaId === otaSmetaIsh) return bb.qatorId;
      }
      return otaSmetaIsh;
    };
    const tavsiya = p.natija.natijalar.get(t.uid)?.tavsiya;
    const tavsiyaS = tavsiya?.tur === 'zamena' ? S.byId.get(tavsiya.qatorId) : undefined;
    const tugma = 'tugma h-6 px-1.5 text-[11px]';
    return (
      <div data-fuid={t.uid} role="group" aria-label={`F2 qatori (${f2QatorTuriYorlig(t.tur)}): ${t.nom}`}
        onPointerDown={(e) => ptrBoshla(e, t)} data-sudrash={(p.disabled || mutationBusy) ? undefined : 'ha'}
        title={(p.disabled || mutationBusy) ? undefined : 'Sudrab o‘ngdagi smeta qatoriga tashlang: ish → ish (bog‘lash/zamena), ish → razdel (qo‘shimcha)'}
        className={`${F2_GRID} cursor-grab text-[12px] active:cursor-grabbing ${sudrash?.uid === t.uid ? 'opacity-50' : ''} ${sel ? 'bg-accent/15 outline outline-1 outline-accent' : `${QATOR_FON[k]} hover:bg-surface-2/60`} ${ish ? `font-medium text-text ${ISH_CHEGARA}` : `text-text-dim ${RESURS_CHEGARA}`}`}>
        <button type="button" aria-pressed={belgi.has(t.uid)} aria-label={`${tarj('Belgilash')}: ${t.nom}`} onClick={(e) => belgiBos(t.uid, e.shiftKey)}
          className={`${KATAK} flex items-start justify-center text-[13px] font-bold ${belgi.has(t.uid) ? 'bg-accent text-white' : HOLAT_KATAK[k]}`}
          title={`${B.t} — ${tarj('bosing: belgilash (Shift: oraliq)')}`}>{belgi.has(t.uid) ? '☑' : B.b}</button>
        <span className={`${KATAK} overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10.5px] text-text-mute`} title={t.kod ?? ''}>{t.kod}</span>
        <div className={`${KATAK} flex items-start text-left`} style={{ paddingLeft: 6 + depth * 14 }}>
          {chevron}
        <button type="button"
          onClick={tanla}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tanla(); } }}
          aria-pressed={sel}
          className="min-w-0 flex-1 cursor-grab text-left">
          {t.belgi && <span className={`mr-1 rounded px-1 text-[10px] font-semibold ${t.belgi === 'zamena' ? 'bg-warn/20 text-warn' : 'bg-accent/20 text-accent'}`}
            title={t.belgi === 'zamena' ? 'Hujjatda zamena (~) deb belgilangan' : 'Hujjatda qo‘shimcha ish (+) deb belgilangan'}>{t.belgi === 'zamena' ? '~ zamena' : '+ qo‘shimcha'}</span>}
          <span className="break-words">{t.nom}</span>
          {/* Bog'langan smeta nomi faqat F2 nomidan FARQ qilsa (aks holda ✓ yetarli) va bitta qatorda — qator balandligi ikki baravar oshmaydi. */}
          {b?.usul === TARKIB_USUL && k !== 'otkazildi' && <span className="mt-0.5 block text-[10.5px] font-normal text-accent">{tarj('ish narxi tarkibi — ishning o‘z puli, alohida yozilmaydi')}</span>}
          {b?.usul !== TARKIB_USUL && s && k !== 'otkazildi' && nomKalit(s.nom) !== nomKalit(t.nom) && <span className="mt-0.5 block truncate text-[10.5px] font-normal text-accent" title={s.nom ?? ''}>→ {s.nom}</span>}
          {!s && tavsiya && <span className="mt-0.5 block text-[10.5px] font-normal text-warn">{tavsiya.tur === 'zamena' ? `⇄ zamena taklifi: «${tavsiyaS?.nom ?? ''}» o‘rniga` : '＋ smeta ishida mos resurs yo‘q — qo‘shimcha resurs'}</span>}
          {t.ogohlantirish?.length ? <span className="mt-0.5 block text-[10.5px] font-normal text-danger">{t.ogohlantirish.join('; ')}</span> : null}
          {bk.summaBoyicha && <span className="mt-0.5 block text-[10.5px] font-normal text-text-mute">{tarj('summa bo‘yicha hisoblandi')}: {fmt(bk.summa, 2)} / {fmt(bk.smetaNarx, 2)}</span>}
        </button>
        </div>
        <span className={`${SON} text-text-mute`}>{t.norma == null ? '' : fmt(t.norma, 6)}</span>
        <span className={`${SON} text-text`} title={bk.summaBoyicha ? `${tarj('summa bo‘yicha hisoblandi')}: ${fmt(bk.summa, 2)} / ${fmt(bk.smetaNarx, 2)}` : undefined}>{fmt(bk.hajm, bk.summaBoyicha ? 6 : undefined)}</span>
        <span className={`${KATAK} whitespace-nowrap text-[11px]`}>{bk.birlik ?? ''}</span>
        <span className={SON}>{t.barg && bk.narx != null ? fmt(bk.narx, 2) : ''}
          {farqFoiz != null && <span className={`block text-[10px] font-semibold ${farqFoiz > 0 ? 'text-warn' : 'text-accent'}`}
            title={`${tarj('Narx farqi')}: F2 ${fmt(t.narx, 2)} / ${tarj('smeta')} ${fmt(s?.narx ?? null, 2)}`}>{farqFoiz > 0 ? '+' : ''}{farqFoiz.toFixed(2)}%</span>}
        </span>
        <span className={`${SON} ${ish ? 'font-semibold text-text' : 'text-text'}`} title={t.barg ? undefined : 'Resurslari yig‘indisi'}>
          {t.barg ? fmt(t.summa, 2) : bolaSumma(t) != null ? fmt(bolaSumma(t), 2) : ''}
        </span>
        <span className={`${KATAK} ${AMAL_YOPISHQOQ} flex flex-wrap items-center gap-1 font-normal`} onMouseDown={(e) => e.stopPropagation()}>
          {(t.tur === 'bl' ? guruhHolati(ind, ij, t) === 'taklif' && ij.bog.has(t.uid) : k === 'taklif' && ind.ota.get(t.uid)?.tur !== 'bl') && <button type="button" className={`${tugma} tugma-asosiy`} disabled={(p.disabled || mutationBusy)}
            onClick={() => (t.tur === 'bl' ? ishTasdiq(t) : p.onIj(tasdiqla(ij, [t.uid])))} title={t.tur === 'bl' ? tarj('Ishni va uning barcha resurslarini tasdiqlash') : 'Tizim taklifini tasdiqlash'}><Check size={11} /> Tasdiqlash</button>}
          {k === 'topilmadi' && ish && <button type="button" className={tugma} disabled={(p.disabled || mutationBusy)}
            onClick={() => scrollTanlanganPanelga(t.uid)} title="Smeta razdelidagi qaysi ish o‘rniga bajarilganini tanlang">⇄ Zamena</button>}
          {k === 'topilmadi' && ish && rzId != null && p.raw.get(rzId) && <button type="button" className={tugma} disabled={(p.disabled || mutationBusy)}
            onClick={() => ochModal(t, { kind: 'additional', parent: p.raw.get(rzId)!, keyinId: oldingiKeyin() })} title="Smetaga qo‘shimcha ish (resurslari bilan) — F2 dagi tartibda, oldingi bog‘langan ishdan keyin">＋ Qo‘shimcha</button>}
          <button type="button" className={tugma} disabled={(p.disabled || mutationBusy)}
            aria-label={`Bog‘lash variantlari: ${t.nom}`} onClick={() => scrollTanlanganPanelga(t.uid)} title={candidateCount ? `Mos smeta qatorlari va dalillari (${candidateCount} ta variant)` : 'Mos smeta qatorlari va dalillari'}><Link2 size={11} /> {tarj('Variantlar')}{candidateCount ? ` (${candidateCount})` : ''}</button>
          {k === 'topilmadi' && !ish && tavsiyaS && <button type="button" className={`${tugma} tugma-asosiy`} disabled={(p.disabled || mutationBusy)}
            onClick={() => zamena(t, tavsiyaS)} title={`Smetadagi «${tavsiyaS.nom ?? ''}» o‘rniga (zamena resurs) — aynan uning ortidan joylashadi`}>⇄ Zamena</button>}
          {k === 'topilmadi' && !ish && otaSmetaIsh != null && p.raw.get(otaSmetaIsh) && <button type="button" className={`${tugma} ${tavsiya?.tur === 'qoshimcha' ? 'tugma-asosiy' : ''}`} disabled={(p.disabled || mutationBusy)}
            onClick={() => ochModal(t, { kind: 'resource', parent: p.raw.get(otaSmetaIsh)!, keyinId: resursKeyin() })} title="Smeta ishiga qo‘shimcha resurs — F2 dagi tartibda">＋ Resurs</button>}
          {k === 'topilmadi' && !ish && otaSmetaIsh == null && <button type="button" className={tugma} disabled={(p.disabled || mutationBusy)}
            onClick={() => scrollTanlanganPanelga(t.uid)} title="Avval ishini bog‘lang">Tanlash</button>}
          {b && <button type="button" className={tugma} disabled={(p.disabled || mutationBusy)}
            aria-label={`Bog‘lanishni uzish: ${t.nom}`} onClick={() => p.onIj(uz(ij, t))} title="Bog‘lanishni bekor qilish"><Unlink size={11} /></button>}
        </span>
      </div>
    );
  }

  /** Smeta tomonda belgilash — F2 dagi bilan bir xil: bosish — belgilash, Shift — oraliq. */
  function sBelgiBos(id: number, oraliq: boolean) {
    const a = oxirgiSBelgi.current; // setState yangilovchisi kechikib ishlashi mumkin — oldingi belgi hozir olinadi
    setSBelgi((old) => {
      const n = new Set(old);
      if (oraliq && a != null && a !== id) {
        const idlar = smetaVisibleRows.map((r) => r.node.id);
        const [i, j] = [idlar.indexOf(a), idlar.indexOf(id)].sort((x, y) => x - y);
        if (i >= 0) for (const x of idlar.slice(i, j + 1)) n.add(x);
      } else if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
    oxirgiSBelgi.current = id;
  }
  /** Yangi bo'lim (qoralamaga): ota null — smetaning yuqori darajasi; keyin — shu darajadagi bo'limdan keyin. */
  function yangiBolim(ota: SmetaQator | null, keyin?: SmetaQator) {
    if (!p.onBolimRejali || p.disabled || mutationBusy) return;
    const nom = window.prompt(ota ? `«${(ota.nom ?? '').slice(0, 60)}» ${tarj('ichida yangi bo‘lim nomi:')}` : tarj('Yangi bo‘lim nomi:'), '');
    if (nom == null) return;
    const id = p.onBolimRejali(nom, ota?.id ?? null, keyin?.id);
    if (id == null) { xab(tarj('Bo‘lim nomini yozing (1–300 belgi).')); return; }
    if (ota) setOchiqS((o) => new Set(o).add(ota.id));
    smetaFokus.current = id;
    xab(`«${nom.trim().slice(0, 50)}» ${tarj('bo‘limi qoralamaga qo‘shildi — «F2 ni yozish» bosilganda yoziladi.')}`);
  }
  /** Belgilangan smeta qatorlari ichida otasi ham belgilanganlar alohida hisoblanmaydi (ota bilan birga ketadi). */
  function sBelgiIldizlar(): number[] {
    const ichida = (id: number) => { for (let t = S.byId.get(id)?.otaId ?? null; t != null; t = S.byId.get(t)?.otaId ?? null) if (sBelgi.has(t)) return true; return false; };
    return [...sBelgi].filter((id) => S.byId.has(id) && !ichida(id));
  }
  /** Belgilangan QO'SHILGAN qatorlar (bo'limlar ham) — o'chirishga (qoralamaga). Asl smeta qatorlari o'zgarmaydi. */
  function sOmmaviyOchir() {
    if (p.disabled || mutationBusy) return;
    const ildiz = sBelgiIldizlar();
    const asl = ildiz.filter((id) => id > 0 && !qoshilganmi(p.raw.get(id)));
    const olinadi = ildiz.filter((id) => !asl.includes(id));
    if (!olinadi.length) { xab(tarj('Belgilanganlar orasida siz qo‘shgan qator yo‘q — smetaning asl qatorlari o‘chirilmaydi.')); return; }
    if (!window.confirm(`${olinadi.length} ${tarj('ta qo‘shilgan qator (ichidagilari bilan) o‘chirishga belgilansinmi? «F2 ni yozish» bosilganda o‘chiriladi, arxivda qoladi.')}${asl.length ? ` ${asl.length} ${tarj('ta asl smeta qatori o‘tkazib yuboriladi.')}` : ''}`)) return;
    let n = 0;
    for (const id of olinadi) {
      if (id < 0) { if (p.onRejaliOchir) { p.onRejaliOchir(id); n++; } continue; }
      const r = p.raw.get(id);
      if (!r || !p.onOchirishRejali) continue;
      p.onOchirishRejali({ qatorId: id, versiya: r.versiya, eskiIdlar: pastdagiIdlar(id), nom: r.nom ?? '', sabab: 'F2 import: ommaviy o‘chirish' });
      n++;
    }
    setSBelgi(new Set());
    xab(`${n} ${tarj('ta qator o‘chirishga belgilandi. Bo‘shagan F2 qatorlarini qayta bog‘lang.')}${asl.length ? ` ${asl.length} ${tarj('ta asl smeta qatori o‘tkazib yuborildi.')}` : ''}`);
  }
  /** Belgilangan smeta qatorlariga (va ichidagilariga) bog'langan barcha F2 qatorlarini uzish — bitta «Orqaga» qadami. */
  function sOmmaviyUz() {
    const idlar = new Set<number>();
    for (const id of sBelgi) for (const x of pastdagiIdlar(id)) idlar.add(x);
    let next = ij; let n = 0;
    for (const [uid, b] of ij.bog) {
      if (!idlar.has(b.qatorId)) continue;
      const tg = ind.byUid.get(uid);
      if (tg && next.bog.has(uid)) { next = uz(next, tg); n++; }
    }
    if (n) p.onIj(next);
    setSBelgi(new Set());
    xab(n ? `${n} ${tarj('ta F2 qatorining bog‘lanishi uzildi. Kerak bo‘lsa «Orqaga» bilan qaytaring.')}` : tarj('Belgilangan smeta qatorlariga bog‘langan F2 qatori yo‘q.'));
  }
  function belgiBos(uid: string, oraliq: boolean) {
    const a = oxirgiBelgi.current; // setState yangilovchisi kechikib ishlashi mumkin — oldingi belgi hozir olinadi
    setBelgi((old) => {
      const n = new Set(old);
      if (oraliq && a && a !== uid) {
        const uidlar = f2VisibleRows.map((r) => r.node.uid);
        const [i, j] = [uidlar.indexOf(a), uidlar.indexOf(uid)].sort((x, y) => x - y);
        if (i >= 0) for (const u of uidlar.slice(i, j + 1)) if (ind.byUid.get(u)?.tur !== 'rz') n.add(u);
      } else {
        // Ish belgilansa resurslari ham belgilanadi (bitta guruh); olib tashlansa ham birga.
        const f = ind.byUid.get(uid);
        const guruh = [uid, ...(f?.tur === 'bl' ? f.bolalar.map((r) => r.uid) : [])];
        if (n.has(uid)) for (const u of guruh) n.delete(u); else for (const u of guruh) n.add(u);
      }
      return n;
    });
    oxirgiBelgi.current = uid;
  }
  /** Belgilangan bog'lanmagan qatorlarni bittada QORALAMAGA qo'shish (egasi 2026-10-20: «hammasi qo'shimcha ish bo'lsa»).
   *  Ish → o'z razdeliga qo'shimcha ish (F2 resurslari bilan); resurs → bog'langan ishiga qo'shimcha resurs.
   *  'taklif': tizim zamena taklif qilgan qatorlar zamena bo'ladi. Serverga hech narsa yozilmaydi — «Saqlash»da bittada. */
  function ommaviyQoralama(rejim: 'qoshimcha' | 'taklif') {
    if (!p.onRejali) return;
    const tugunlar = [...belgi].map((u) => ind.byUid.get(u)).filter((x): x is F2Tugun => !!x && x.tur !== 'rz');
    const ishlar = new Set(tugunlar.filter((x) => x.tur === 'bl').map((x) => x.uid));
    let qoshildi = 0; const otkazildi: string[] = [];
    for (const f of tugunlar) {
      if (ij.bog.has(f.uid) || ij.otkaz.has(f.uid)) { otkazildi.push(`${f.nom.slice(0, 40)} (${tarj('allaqachon bog‘langan')})`); continue; }
      const ish = f.tur === 'bl';
      const ota = ind.ota.get(f.uid);
      if (!ish && ota && ishlar.has(ota.uid)) continue; // ishi bilan birga yaratiladi
      const tavsiya = p.natija.natijalar.get(f.uid)?.tavsiya;
      const eski = rejim === 'taklif' && tavsiya?.tur === 'zamena' ? p.raw.get(tavsiya.qatorId) : undefined;
      const eskiOta = eski?.ota_id != null ? p.raw.get(eski.ota_id) : undefined;
      const hajm = Number(f.hajm);
      if (!(hajm > 0)) { otkazildi.push(`${f.nom.slice(0, 40)} (${tarj('hajm yo‘q')})`); continue; }
      const resurslar = ish ? f.bolalar.map((r) => ({ tur: resTuri(r.birlik), nom: r.nom, birlik: r.birlik || 'шт', hajm: r.hajm, kod: r.kod })) : [];
      const umumiy = { nom: f.nom, birlik: f.birlik || 'шт', hajm, kod: f.kod ?? undefined, resurslar, operationId: yangiOperationId(),
        sabab: rejim === 'taklif' ? 'F2 import: tizim taklifi (ommaviy)' : 'F2 import: qo‘shimcha (ommaviy)' };
      if (eski && eskiOta) {
        p.onRejali(f, { ...umumiy, kind: 'replacement', tur: ish ? 'bl' : resTuri(f.birlik), otaQatorId: eskiOta.id, almashtirilayotganQatorId: eski.id, keyinQatorId: eski.id });
        qoshildi++; continue;
      }
      if (ish) {
        const rzId = ota ? rzDiag.get(ota.uid)?.smetaRzIdlar[0] : undefined;
        if (rzId == null || !p.raw.get(rzId)) { otkazildi.push(`${f.nom.slice(0, 40)} (${tarj('razdeli smetaga bog‘lanmagan')})`); continue; }
        const mat = !f.bolalar.length && /^С(\s|$|\d)/.test((f.kod ?? '').trim());
        p.onRejali(f, { ...umumiy, kind: 'additional', tur: f.bolalar.length ? 'bl' : mat ? 'mat' : 'bl', otaQatorId: rzId });
        qoshildi++; continue;
      }
      const otaIsh = ota ? ij.bog.get(ota.uid)?.qatorId : undefined;
      if (otaIsh == null || !p.raw.get(otaIsh)) { otkazildi.push(`${f.nom.slice(0, 40)} (${tarj('ishi bog‘lanmagan')})`); continue; }
      p.onRejali(f, { ...umumiy, kind: 'resource', tur: resTuri(f.birlik), otaQatorId: otaIsh });
      qoshildi++;
    }
    setBelgi(new Set());
    xab(`${qoshildi} ${tarj('ta qator qoralamaga qo‘shildi — «Saqlash» bosilganda bittada yoziladi.')}${otkazildi.length ? ` ${tarj('Qo‘shilmadi')}: ${otkazildi.slice(0, 5).join('; ')}${otkazildi.length > 5 ? '…' : ''}` : ''}`);
  }
  /** Belgilangan guruhni smetadagi tanlangan JOYGA tashlash (egasi 2026-10-20: «tortib olib smeta tarafga kerakli joyga»).
   *  Ishlar — shu razdelga, tashlangan joydan keyin, F2 dagi tartibda ketma-ket qo'shimcha; resurslar — ishga tashlansa
   *  o'sha ishga qo'shimcha resurs. Hammasi qoralamaga (serverga «Saqlash» da). */
  function guruhniTashla(s: SmetaQator, zona: 'oldin' | 'ustiga' | 'keyin') {
    if (!p.onRejali || p.disabled || mutationBusy) return;
    const ota = (x: SmetaQator | undefined) => (x?.otaId != null ? S.byId.get(x.otaId) : undefined);
    let langar: SmetaQator | undefined = s;
    if (zona === 'oldin') { const i = smetaVisibleRows.findIndex((r) => r.node.id === s.id); langar = i > 0 ? smetaVisibleRows[i - 1].node : undefined; }
    // Razdel va undan keyingi joy (oraliqqaTashla bilan bir xil qoida).
    let rz: SmetaQator | undefined; let keyin: number | undefined;
    if (!langar) { rz = s.tur === 'rz' ? s : ota(s); keyin = rz?.id; }
    else if (langar.tur === 'rz') { rz = langar; keyin = zona === 'ustiga' ? undefined : langar.id; }
    else { const ish = ota(langar)?.tur === 'rz' ? langar : ota(langar); rz = ish ? ota(ish) : undefined; keyin = ish?.id; }
    const resursOta = zona === 'ustiga' && s.tur === 'bl' ? s : undefined;
    const tartib = new Map(ind.qatorlar.map((x, i) => [x.uid, i]));
    const tugunlar = [...belgi].map((u) => ind.byUid.get(u)).filter((x): x is F2Tugun => !!x && x.tur !== 'rz')
      .sort((a, b) => (tartib.get(a.uid) ?? 0) - (tartib.get(b.uid) ?? 0));
    const ishlar = new Set(tugunlar.filter((x) => x.tur === 'bl').map((x) => x.uid));
    let qoshildi = 0; const otkazildi: string[] = [];
    let oldingiTemp: number | undefined;
    const temp = () => { const id = oldingiTemp; return id; };
    for (const f of tugunlar) {
      if (ij.bog.has(f.uid) || ij.otkaz.has(f.uid)) { otkazildi.push(`${f.nom.slice(0, 40)} (${tarj('allaqachon bog‘langan')})`); continue; }
      const fOta = ind.ota.get(f.uid);
      if (f.tur !== 'bl' && fOta && ishlar.has(fOta.uid)) continue;
      const hajm = Number(f.hajm);
      if (!(hajm > 0)) { otkazildi.push(`${f.nom.slice(0, 40)} (${tarj('hajm yo‘q')})`); continue; }
      const resurslar = f.tur === 'bl' ? f.bolalar.map((r) => ({ tur: resTuri(r.birlik), nom: r.nom, birlik: r.birlik || 'шт', hajm: r.hajm, kod: r.kod })) : [];
      const umumiy = { nom: f.nom, birlik: f.birlik || 'шт', hajm, kod: f.kod ?? undefined, resurslar, operationId: yangiOperationId(), sabab: 'F2 import: qo‘shimcha (guruh, sudrab)' };
      if (f.tur !== 'bl' && resursOta) {
        p.onRejali(f, { ...umumiy, kind: 'resource', tur: resTuri(f.birlik), otaQatorId: resursOta.id });
        qoshildi++; continue;
      }
      if (!rz || rz.tur !== 'rz') { otkazildi.push(`${f.nom.slice(0, 40)} (${tarj('bu joyda razdel topilmadi')})`); continue; }
      const mat = f.tur !== 'bl' || (!f.bolalar.length && /^С(\s|$|\d)/.test((f.kod ?? '').trim()));
      // Zanjir: birinchisi tanlangan joydan keyin, keyingilari — oldingi qo'shilgandan keyin (F2 tartibi saqlanadi).
      const keyinId = temp() ?? keyin;
      const oldin = new Set(p.rejaliIdlar?.() ?? []);
      p.onRejali(f, { ...umumiy, kind: 'additional', tur: f.bolalar.length ? 'bl' : mat ? (f.tur === 'ob' ? 'ob' : 'mat') : 'bl', otaQatorId: rz.id, keyinQatorId: keyinId });
      oldingiTemp = (p.rejaliIdlar?.() ?? []).find((id) => !oldin.has(id)) ?? oldingiTemp;
      qoshildi++;
    }
    setBelgi(new Set());
    xab(`${qoshildi} ${tarj('ta qator qoralamaga qo‘shildi — «Saqlash» bosilganda bittada yoziladi.')}${otkazildi.length ? ` ${tarj('Qo‘shilmadi')}: ${otkazildi.slice(0, 5).join('; ')}${otkazildi.length > 5 ? '…' : ''}` : ''}`);
  }
  /** Belgilangan qatorlarga bitta amal — bitta onIj (bitta «Orqaga» qadami). */
  function ommaviy(amal: 'tasdiq' | 'uz' | 'otkaz' | 'kirit') {
    const tugunlar = [...belgi].map((u) => ind.byUid.get(u)).filter((x): x is F2Tugun => !!x && x.tur !== 'rz');
    if (!tugunlar.length) return;
    let next = ij;
    if (amal === 'tasdiq') {
      // Ish tanlansa resurslari ham tasdiqlanadi/bog'lanadi (guruh).
      for (const x of tugunlar) next = x.tur === 'bl' ? ishniTasdiqla(next, x, S).ij : tasdiqla(next, [x.uid]);
    } else for (const x of tugunlar) next = amal === 'uz' ? uz(next, x) : otkazibYubor(next, x, amal === 'otkaz');
    p.onIj(next);
    xab(`${tugunlar.length} ${tarj('ta qatorga amal bajarildi. Kerak bo‘lsa «Orqaga» bilan qaytaring.')}`);
    setBelgi(new Set());
  }

  // ── Daraxt boshqaruvi: butun daraxt yoki aynan bitta chuqurlikni ochish/yopish. ──
  function f2Sath(depth: number) {
    const ids = expandableIdsAtDepth(p.akt.daraxt, (node) => node.bolalar, (node) => node.uid, depth).map(String);
    const shouldOpen = ids.some((id) => yopiqF.has(id));
    setYopiqF((old) => {
      const next = new Set(old);
      for (const id of ids) {
        if (shouldOpen) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }
  function smetaSath(depth: number) {
    const ids = expandableIdsAtDepth(smetaRoots, (node) => S.bolalar.get(node.id) ?? [], (node) => node.id, depth).map(Number);
    const shouldOpen = ids.some((id) => !ochiqS.has(id));
    setOchiqS((old) => {
      const next = new Set(old);
      for (const id of ids) {
        if (shouldOpen) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }
  function smetaBarchasiniOch() {
    setOchiqS(smetaExpandableDepths.reduce((expanded, depth) => {
      for (const id of expandableIdsAtDepth(smetaRoots, (node) => S.bolalar.get(node.id) ?? [], (node) => node.id, depth)) expanded.add(Number(id));
      return expanded;
    }, new Set<number>()));
  }

  // ── O'ng: smeta daraxti ──

  /**
   * SUDRASH — brauzerning HTML5 drag-and-drop i EMAS, sichqoncha/pointer hodisalari bilan (egasi 2026-10-24: «F2 dan ushlab
   * smeta ustiga tashlasam hech qanday reaksiya yo'q»). Sabab: qator nomi <button> — Chrome tugma ustidan boshlangan
   * native sudrashni boshlamaydi; Windows/overlay dasturlar ham OS drag-and-drop ni buzishi mumkin. Pointer usuli
   * qatorning istalgan joyidan (nomidan ham) ishlaydi; 6 px dan kam siljish — oddiy bosish (tanlash) bo'lib qoladi.
   * Tanlov (yuqoridagi panel) sudrash paytida O'ZGARMAYDI — tashlangach tanlanadi (egasi sinovi 2026-09-29).
   */
  const ptr = useRef<{ t: F2Tugun; x: number; y: number; faol: boolean } | null>(null);
  const sharpa = useRef<HTMLDivElement | null>(null);
  const bosishniYut = useRef(false);
  function ptrBoshla(e: React.PointerEvent, t: F2Tugun) {
    if (e.button !== 0 || p.disabled || mutationBusy) return;
    if ((e.target as HTMLElement).closest('input,select,textarea,a,[data-sudrashsiz]')) return;
    ptr.current = { t, x: e.clientX, y: e.clientY, faol: false };
  }
  function zonaRect(el: HTMLElement, y0: number): 'oldin' | 'ustiga' | 'keyin' {
    const r = el.getBoundingClientRect();
    const y = y0 - r.top;
    if (y < r.height * 0.25) return 'oldin';
    if (y > r.height * 0.75) return 'keyin';
    return 'ustiga';
  }
  /** Tashlash natijasi — pointer va (zaxira) native drop uchun bitta yo'l. */
  function tashlashBajar(uid: string, sId: number, zona: 'oldin' | 'ustiga' | 'keyin') {
    const s = S.byId.get(sId);
    if (!s || p.disabled || mutationBusy) return;
    // Sudrab tashlanganda smeta oynasi O'Z JOYIDA qoladi (egasi: "boshqa joyga ketib qoladi").
    sudrabTanlandi.current = true;
    // Belgilangan bir nechta qatordan biri sudralsa — butun guruh shu joyga (qoralamaga) qo'shiladi.
    if (p.onRejali && belgi.size > 1 && belgi.has(uid)) { guruhniTashla(s, zona); return; }
    setTanlangan(uid);
    if (zona === 'ustiga') tashla(uid, s.id); else oraliqqaTashla(uid, s, zona);
  }
  const tashlashRef = useRef(tashlashBajar);
  tashlashRef.current = tashlashBajar;
  useEffect(() => {
    const tozala = () => {
      sharpa.current?.remove(); sharpa.current = null;
      document.body.style.userSelect = ''; document.body.style.cursor = '';
      dropBelgila(null); setSudrash(null);
    };
    const nishon = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-sid]') ?? null;
    const move = (e: PointerEvent) => {
      const d = ptr.current;
      if (!d) return;
      if (!d.faol) {
        if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 6) return;
        d.faol = true;
        setSudrash(d.t);
        document.body.style.userSelect = 'none'; document.body.style.cursor = 'grabbing';
        window.getSelection()?.removeAllRanges();
        const g = document.createElement('div');
        g.className = 'pointer-events-none fixed z-[1000] max-w-[380px] truncate rounded-md border border-accent bg-surface px-2 py-1 text-[12px] font-medium text-text shadow-lg';
        g.textContent = `${d.t.kod ? d.t.kod + ' · ' : ''}${d.t.nom}`;
        document.body.appendChild(g);
        sharpa.current = g;
      }
      if (sharpa.current) { sharpa.current.style.left = `${e.clientX + 14}px`; sharpa.current.style.top = `${e.clientY + 12}px`; }
      const row = nishon(e.clientX, e.clientY);
      if (row) dropBelgila(row, zonaRect(row, e.clientY)); else dropBelgila(null);
      // Smeta oynasi chetiga yaqinlashsa — o'zi aylanadi.
      const q = smetaQuti.current;
      if (q) {
        const r = q.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right) {
          if (e.clientY < r.top + 60) q.scrollTop -= Math.ceil((r.top + 60 - e.clientY) / 3);
          else if (e.clientY > r.bottom - 60) q.scrollTop += Math.ceil((e.clientY - (r.bottom - 60)) / 3);
        }
      }
    };
    const up = (e: PointerEvent) => {
      const d = ptr.current;
      ptr.current = null;
      if (!d?.faol) return;
      bosishniYut.current = true;
      window.setTimeout(() => { bosishniYut.current = false; }, 0);
      const row = nishon(e.clientX, e.clientY);
      const zona = row ? zonaRect(row, e.clientY) : null;
      tozala();
      if (row && zona) tashlashRef.current(d.t.uid, Number(row.dataset.sid), zona);
    };
    const bekor = () => { if (ptr.current?.faol) tozala(); ptr.current = null; };
    const tugma = (e: KeyboardEvent) => { if (e.key === 'Escape' && ptr.current?.faol) { e.preventDefault(); bekor(); } };
    // Sudrash tugagach qatordagi tugmaning «click» i (tanlash) ishlamasin.
    const click = (e: MouseEvent) => { if (bosishniYut.current) { e.stopPropagation(); e.preventDefault(); } };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', bekor);
    document.addEventListener('keydown', tugma);
    document.addEventListener('click', click, true);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', bekor);
      document.removeEventListener('keydown', tugma);
      document.removeEventListener('click', click, true);
      sharpa.current?.remove();
    };
  // dropBelgila/setSudrash barqaror; tashlash eng so'nggi holat bilan tashlashRef orqali.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** Sudralayotgan F2 qatori shu smeta qatoriga tushishi mumkinmi (Tizim1 qoidalari, tashla() bilan bir xil). */
  function mosNishon(s: SmetaQator): boolean {
    if (!sudrash) return false;
    if (sudrash.tur === 'rz') return s.tur === 'rz';
    if (sudrash.tur === 'bl') return s.tur === 'rz' || s.tur === 'bl' || !(S.bolalar.get(s.id) ?? []).length && s.tur !== 'rs';
    return s.tur !== 'rz';
  }
  /** Sudrash paytida smeta oynasi chetiga yaqinlashsa — o'zi aylanadi. */
  function avtoAylantir(e: React.DragEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const chet = 60;
    if (e.clientY < r.top + chet) el.scrollTop -= Math.ceil((r.top + chet - e.clientY) / 3);
    else if (e.clientY > r.bottom - chet) el.scrollTop += Math.ceil((e.clientY - (r.bottom - chet)) / 3);
  }
  /** Egasi 2026-09-30: "qatorlar ORASIGA sudrab qo'yib bo'lmaydi". Qatorning yuqori/pastki
   *  choragi — oraliq (qo'shimcha aynan shu joyga), o'rtasi — qatorning o'ziga (bog'lash/zamena). */
  function zonaOl(e: React.DragEvent): 'oldin' | 'ustiga' | 'keyin' {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - r.top;
    if (y < r.height * 0.25) return 'oldin';
    if (y > r.height * 0.75) return 'keyin';
    return 'ustiga';
  }
  function dropProps(s: SmetaQator) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if ((p.disabled || mutationBusy)) return;
        e.preventDefault(); e.dataTransfer.dropEffect = 'link';
        dropBelgila(e.currentTarget as HTMLElement, zonaOl(e));
      },
      onDragLeave: (e: React.DragEvent) => {
        // Qator ichidagi bola elementlarga o'tish «chiqish» emas — faqat qatordan tashqariga chiqqanda tozalanadi.
        const el = e.currentTarget as HTMLElement;
        if (dropEl.current?.el === el && !el.contains(e.relatedTarget as Node | null)) dropBelgila(null);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const zona = zonaOl(e);
        dropBelgila(null); setSudrash(null);
        const uid = e.dataTransfer.getData('text/plain');
        if (!uid) return;
        tashlashBajar(uid, s.id, zona);
      },
    };
  }
  /** Oraliqqa tashlash: qo'shimcha ish / resurs aynan shu ikki qator orasiga (langar = yuqoridagi qator). */
  function oraliqqaTashla(fUid: string, s: SmetaQator, zona: 'oldin' | 'keyin') {
    if ((p.disabled || mutationBusy)) return;
    const f = ind.byUid.get(fUid);
    if (!f) return;
    // Langar: "keyin" — shu qator; "oldin" — ekranda undan oldingi qator (yo'q bo'lsa — ota boshiga).
    let langar: SmetaQator | undefined = s;
    if (zona === 'oldin') {
      const i = smetaVisibleRows.findIndex((r) => r.node.id === s.id);
      langar = i > 0 ? smetaVisibleRows[i - 1].node : undefined;
    }
    const ota = (x: SmetaQator | undefined) => (x?.otaId != null ? S.byId.get(x.otaId) : undefined);
    if (f.tur === 'rz') { xab('Razdelni smeta razdeliga torting.'); return; }
    if (f.tur === 'bl' || ((f.tur === 'mat' || f.tur === 'ob') && (!langar || langar.tur === 'rz' || ota(langar)?.tur === 'rz'))) {
      // Qo'shimcha ish (yoki razdel ostidagi mustaqil MAT/OB): ota — razdel, langar — shu razdeldagi ish.
      let rz: SmetaQator | undefined, keyin: SmetaQator | undefined;
      if (!langar) { rz = s.tur === 'rz' ? s : ota(s); keyin = rz; }
      else if (langar.tur === 'rz' && zona === 'keyin' && langar.id === s.id) { rz = langar; keyin = langar; }
      else {
        const ish = langar.tur === 'rz' ? undefined : (ota(langar)?.tur === 'rz' ? langar : ota(langar));
        rz = ish ? ota(ish) : langar;
        keyin = ish ?? langar;
      }
      if (!rz || rz.tur !== 'rz') { xab('Bu joyda razdel topilmadi — qo‘shimcha ishni razdel ichiga torting.'); return; }
      ochModal(f, { kind: 'additional', parent: p.raw.get(rz.id)!, keyinId: keyin?.id ?? rz.id });
      return;
    }
    // Resurs: ota — ish (bl), langar — shu ishdagi resurs (yoki ishning o'zi — boshiga).
    const ish = langar?.tur === 'bl' ? langar : ota(langar)?.tur === 'bl' ? ota(langar) : undefined;
    if (!ish) { xab('Qo‘shimcha resursni smeta ISHI ichiga (resurslari orasiga) torting.'); return; }
    ochModal(f, { kind: 'resource', parent: p.raw.get(ish.id)!, keyinId: langar!.id });
  }
  function sBelgiKatak(s: SmetaQator) {
    const on = sBelgi.has(s.id);
    return <button type="button" aria-pressed={on} aria-label={`${tarj('Smetada belgilash')}: ${s.nom ?? ''}`} onClick={(e) => { e.stopPropagation(); sBelgiBos(s.id, e.shiftKey); }}
      className={`${KATAK} flex items-start justify-center text-[12px] ${on ? 'bg-accent text-white' : 'text-text-mute hover:bg-surface-2'}`}
      title={tarj('bosing: belgilash (Shift: oraliq)')}>{on ? '☑' : '☐'}</button>;
  }
  function smetaQator(s: SmetaQator, depth: number, tekis = false): React.ReactNode {
    const bolalar = S.bolalar.get(s.id) ?? [];
    const ochiq = !tekis && ochiqS.has(s.id);
    const percent = tTugun ? nomzodFoiz.get(s.id) : undefined;
    const band = shuF2.get(s.id);
    const tBog = tTugun ? ij.bog.get(tTugun.uid)?.qatorId === s.id : false;
    const toggle = () => setOchiqS((x) => { const n = new Set(x); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; });
    const chevron = bolalar.length > 0
      ? <button type="button" aria-label={ochiq ? `Smeta qatorini yopish: ${s.nom}` : `Smeta qatorini ochish: ${s.nom}`} onClick={(e) => { e.stopPropagation(); toggle(); }} className="mr-1 shrink-0 align-middle text-text-mute">
          {ochiq ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
      : null;
    const tugma = 'tugma h-6 px-1.5 text-[11px]';
    if (s.tur === 'rz') {
      return (
        <div data-sid={s.id} {...dropProps(s)} className={`${S_RZ_GRID} text-[12px] font-semibold text-text ${mosNishon(s) ? 'bg-surface-2/80 outline-dashed outline-1 outline-accent/60' : 'bg-surface-2/80'} ${DROP_NISHON}`}>
          {sBelgiKatak(s)}
          <div className={`${KATAK} flex items-center text-left uppercase`} style={{ paddingLeft: 6 + depth * 14 }}>
            {chevron}
          <button type="button" className="flex min-w-0 flex-1 items-center text-left"
            onClick={() => tTugun ? tashla(tTugun.uid, s.id) : toggle()} title={tTugun ? 'Tanlangan F2 qatorini shu smeta razdeliga bog‘lash/qo‘shimcha qilish' : undefined}>
            <span className="min-w-0 flex-1 break-words">{s.nom}</span>
            <span className="ml-2 shrink-0 text-[10px] font-normal normal-case text-text-mute">{bolalar.length} ichki qator</span>
          </button>
          </div>
          <span className={`${KATAK} flex flex-wrap items-center justify-end gap-1 font-normal`} onMouseDown={(e) => e.stopPropagation()}>
            {tTugun?.tur === 'bl' && <button type="button" className={tugma} disabled={(p.disabled || mutationBusy)}
              onClick={() => tashla(tTugun.uid, s.id)} title="Tanlangan F2 ishini shu razdelga qo‘shimcha ish sifatida qo‘shish">＋ Qo‘shimcha</button>}
            {p.onBolimRejali && <button type="button" className={tugma} disabled={(p.disabled || mutationBusy)} onClick={() => yangiBolim(s)}
              aria-label={`${tarj('Ichida yangi bo‘lim')}: ${s.nom}`} title={tarj('Shu bo‘lim ichida yangi bo‘lim')}>＋ {tarj('Ichki bo‘lim')}</button>}
            {p.onBolimRejali && <button type="button" className={tugma} disabled={(p.disabled || mutationBusy)} onClick={() => yangiBolim(s.otaId != null ? S.byId.get(s.otaId) ?? null : null, s)}
              aria-label={`${tarj('Keyin yangi bo‘lim')}: ${s.nom}`} title={tarj('Shu bo‘limdan keyin, xuddi shu darajada yangi bo‘lim')}>＋ {tarj('Bo‘lim')}</button>}
            {(s.id < 0 || qoshilganmi(p.raw.get(s.id))) && <button type="button" className={`${tugma} text-danger`} disabled={(p.disabled || mutationBusy)}
              onClick={() => void qoshilganOchir(s.id)} aria-label={`${tarj('Bo‘limni o‘chirish')}: ${s.nom}`}
              title={tarj('Siz qo‘shgan bo‘limni ichidagilari bilan o‘chirish (asl smeta bo‘limlari o‘chirilmaydi)')}><Trash2 size={11} /></button>}
          </span>
        </div>
      );
    }
    const old = p.oldingi.get(s.id) ?? 0;
    const qoralamada = p.band?.get(s.id) ?? 0;
    const qoldiq = s.hajm != null ? s.hajm - old - qoralamada - (band?.hajm ?? 0) : null;
    const ish = s.tur === 'bl';
    const tur = qatorTuri(s.id);
    const rang = QATOR_RANG[tur];
    const qoshilgan = tur === 'qoshimcha' || tur === 'zamena';
    return (<>
      <div data-sid={s.id} data-qator-turi={tur} {...dropProps(s)} className={`${S_GRID} text-[12px] ${ish ? 'font-medium text-text' : 'text-text-dim'} ${rang.chegara} `
        + (tBog ? 'bg-accent/25 outline outline-2 outline-accent' : mosNishon(s) ? 'outline-dashed outline-1 outline-accent/50 hover:bg-accent/10' : rang.fon ? `${rang.fon} hover:brightness-110` : band ? 'bg-ok/[0.07] hover:bg-surface-2/60' : 'hover:bg-surface-2/60')
        + ' ' + (ish ? ISH_CHEGARA : RESURS_CHEGARA) + ' ' + DROP_NISHON}>
        {sBelgiKatak(s)}
        <span className={`${KATAK} overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10.5px] text-text-mute`} title={s.kod ?? ''}>{s.kod}</span>
        <div className={`${KATAK} flex items-start text-left`} style={{ paddingLeft: 6 + depth * 14 }}>
          {chevron}
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { if (tTugun) tashla(tTugun.uid, s.id); }}
          title={tTugun ? 'Tanlangan F2 qatorini shu yerga bog‘lash yoki o‘zgarish sifatida kiritish' : undefined}>
          {percent != null && <span className="mr-1 rounded bg-warn/20 px-1 text-[10px] font-semibold text-warn" title="Moslik indeksi — ehtimollik emas">{percent}%</span>}
          <span className={`break-words ${tur === 'almashtirilgan' ? 'line-through decoration-rose-500/70' : ''}`}>{s.nom}</span>
          {s.id < 0 && <span title="Hali serverga yozilmagan — «Saqlash» bosilganda yoziladi" className="ml-1 rounded bg-sky-500/20 px-1 text-[10px] font-semibold text-sky-700 dark:text-sky-300">⏳ saqlanmagan</span>}
          {tur !== 'asl' && <span title={rang.yorliq} className={`ml-1 rounded px-1 text-[10px] font-semibold ${tur === 'qoshimcha' ? 'bg-emerald-500/25 text-emerald-700 dark:text-emerald-300' : tur === 'zamena' ? 'bg-amber-500/25 text-amber-700 dark:text-amber-300' : 'bg-rose-500/20 text-rose-700 dark:text-rose-300'}`}>
            {rang.belgi} {tur === 'qoshimcha' ? 'qo‘shimcha' : tur === 'zamena' ? 'zamena' : 'almashtirilgan'}</span>}
          {tekis && <span className="mt-0.5 block text-[10.5px] font-normal text-text-mute">{yolMatn(s)}</span>}
          {(old > 0 || band) && <span className="mt-0.5 block text-[10.5px] font-normal text-text-mute">
            oldin F2 {fmt(old)}{band && <span className="ml-1 text-ok">· shu F2 {fmt(band.hajm)}</span>}
          </span>}
        </button>
        {band && (() => {
          const minuslar = band.uidlar.filter((u) => (ind.byUid.get(u)?.hajm ?? 0) < 0).length;
          const kop = band.uidlar.length > 1;
          return <button type="button" onClick={(e) => { e.stopPropagation(); setManbaOchiq(manbaOchiq === s.id ? null : s.id); }}
            className={`ml-1 mt-0.5 shrink-0 self-start rounded px-1 text-[10px] font-semibold ${kop || minuslar ? 'bg-warn/25 text-warn' : 'bg-ok/15 text-ok'}`}
            title={tarj('Qaysi F2 qatorlari bog‘langanini ko‘rish va uzish')}>
            ← {band.uidlar.length} F2{minuslar ? ` · ${minuslar} minus` : ''} {manbaOchiq === s.id ? '▴' : '▾'}</button>;
        })()}
        </div>
        <span className={`${SON} text-text-mute`}>{s.norma == null ? '' : fmt(s.norma, 6)}</span>
        <span className={`${SON} text-text`}>{fmt(s.hajm)}</span>
        <span className={`${KATAK} whitespace-nowrap text-[11px]`}>{s.birlik ?? ''}</span>
        <span className={SON}>{s.narx ? fmt(s.narx, 2) : ''}</span>
        <span className={`${SON} ${qoralamada ? 'text-warn' : 'text-text-mute'}`} title={qoralamada ? t('Boshqa F2 qoralamalarida band') : undefined}>{qoralamada ? fmt(qoralamada) : ''}</span>
        {(() => {
          const oshdi = qoldiq != null && s.hajm != null && oshibKetdimi(s.hajm, qoldiq) && Math.abs(qoldiq) > 1e-9;
          // Manfiy qoldiq — HAJM oshdi (smeta birligida), pul emas: birlik yonida ko'rsatiladi.
          return <span className={`${SON} ${oshdi ? 'bg-danger/20 font-semibold text-danger' : 'text-text-dim'}`}
            title={oshdi ? `${tarj('hajm oshdi')}: ${fmt(Math.abs(qoldiq!), 6)} ${s.birlik ?? ''}` : undefined}>
            {qoldiq == null ? '' : <>{fmt(qoldiq)}{oshdi && s.birlik ? <span className="ml-0.5 text-[10px] font-normal">{s.birlik} · {tarj('hajm oshdi')}</span> : null}</>}</span>;
        })()}
        <span className={`${KATAK} ${AMAL_YOPISHQOQ} flex flex-wrap items-center gap-1 font-normal`} onMouseDown={(e) => e.stopPropagation()}>
          {tTugun && (tBog
            ? <button type="button" className={tugma} disabled={(p.disabled || mutationBusy)} onClick={() => p.onIj(uz(ij, tTugun))}><Unlink size={11} /> Uzish</button>
            : <button type="button" className={tugma} disabled={(p.disabled || mutationBusy)} onClick={() => tashla(tTugun.uid, s.id)}><Link2 size={11} /> Bog‘lash</button>)}
          {qoshilgan && p.onQoshilganOzgardi && <>
            <button type="button" className={tugma} disabled={(p.disabled || mutationBusy)} onClick={() => qoshilganTahrir(s.id)}
              aria-label={`Tahrirlash: ${s.nom}`} title={t('Siz qo‘shgan qatorni tahrirlash (nom, hajm, resurslar, narx)')}><Pencil size={11} /></button>
            <button type="button" className={`${tugma} text-danger`} disabled={(p.disabled || mutationBusy)} onClick={() => void qoshilganOchir(s.id)}
              aria-label={`O‘chirish: ${s.nom}`} title={t('Siz qo‘shgan qatorni o‘chirish (arxivda qoladi; smeta qatori o‘zgarmaydi)')}><Trash2 size={11} /></button>
          </>}
        </span>
      </div>
      {manbaOchiq === s.id && band && manbaRoyxati(band)}
    </>);
  }

  /** Bog'lanish qanday paydo bo'lgani — odam tilida (egasi: «qayerdan bog'langanini bildirib turadigan»). */
  function usulNomi(b: { holat: string; usul: string }): string {
    if (b.usul === TARKIB_USUL) return tarj('ish narxi tarkibi');
    if (b.usul === 'pereraschet_taklif') return tarj('avto: pereraschet/minus taklifi');
    if (b.usul === 'qolda') return tarj('qo‘lda');
    if (b.usul === 'taklif_tasdiq') return tarj('taklif, siz tasdiqlagan');
    if (b.usul === 'ish_ichida') return tarj('ish bilan birga');
    if (b.usul === 'xotira' || b.usul === 'tasdiqlangan') return tarj('xotiradan (oldingi F2)');
    if (b.holat === 'taklif') return tarj('avto taklif ◐');
    return tarj('avto');
  }

  function yolMatn(s: SmetaQator) {
    const y: string[] = [];
    for (let t = s.otaId != null ? S.byId.get(s.otaId) : undefined; t; t = t.otaId != null ? S.byId.get(t.otaId) : undefined) y.unshift(t.nom ?? '');
    return y.join(' › ');
  }

  // ── Tanlangan qator paneli ──
  function Panel() {
    if (!tTugun) {
      return <p className="text-[12px] text-text-dim">Chapdan qatorni tanlang (yoki <b>Keyingi hal qilinmagan</b>). Keyin o‘ngdagi smeta qatoriga torting yoki bosing.</p>;
    }
    const k = korinish(ij, tTugun.uid);
    const r = p.natija.natijalar.get(tTugun.uid);
    const b = ij.bog.get(tTugun.uid);
    const s = b ? S.byId.get(b.qatorId) : undefined;
    const ota = ind.ota.get(tTugun.uid);
    const otaBoglangan = ota ? ij.bog.has(ota.uid) : false;
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-start gap-2">
          <span className={`text-lg font-bold leading-none ${BELGI[k].cls}`}>{BELGI[k].b}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-text">{tTugun.kod && <span className="mr-1 font-mono text-text-mute">{tTugun.kod}</span>}{tTugun.nom}</p>
            {(() => {
              const bk = f2HajmiSmetaBirligida(tTugun, s);
              return <>
                <p className="text-[11px] text-text-dim">
                  {f2QatorTuriYorlig(tTugun.tur)} · {fmt(bk.hajm, bk.summaBoyicha ? 6 : undefined)} {bk.birlik ?? ''}{bk.narx != null ? ` × ${fmt(bk.narx, 2)}` : ''}{tTugun.summa != null ? ` = ${fmt(tTugun.summa, 2)}` : ''}
                  {' · '}{tTugun.manzil.varaq}!{tTugun.manzil.qator}
                </p>
                {bk.summaBoyicha && <p className="text-[11px] text-text-mute">{tarj('summa bo‘yicha hisoblandi')}: {fmt(bk.summa, 2)} / {fmt(bk.smetaNarx, 2)}</p>}
              </>;
            })()}
            {s && <p className="text-[11px] text-accent">→ {s.kod ? s.kod + ' ' : ''}{s.nom} ({s.birlik ?? '—'}) <span className="text-text-mute">[{b!.usul}]</span></p>}
            {s && <p className="text-[11px] text-text-dim">{t('Smetadagi joyi')}: {yolMatn(s) || '—'}</p>}
            {r?.sabab && k !== 'qolda' && <p className="text-[11px] text-text-mute">{r.sabab}</p>}
          </div>
          <div className="flex flex-wrap gap-1">
            {(tTugun.tur === 'bl' ? guruhHolati(ind, ij, tTugun) === 'taklif' && !!b : k === 'taklif') && <button type="button" className="tugma tugma-asosiy h-7 px-2 text-[12px]" onClick={() => (tTugun.tur === 'bl' ? ishTasdiq(tTugun) : p.onIj(tasdiqla(ij, [tTugun.uid])))}><Check size={13} /> {tTugun.tur === 'bl' ? tarj('Ish va resurslarini tasdiqlash') : 'Tasdiqlash'}</button>}
            {b && <button type="button" className="tugma h-7 px-2 text-[12px]" onClick={() => p.onIj(uz(ij, tTugun))}><Unlink size={13} /> Uzish</button>}
            <button type="button" className="tugma h-7 px-2 text-[12px]" onClick={() => p.onIj(otkazibYubor(ij, tTugun, k !== 'otkazildi'))}>
              <SkipForward size={13} /> {k === 'otkazildi' ? 'Aktga qaytarish' : 'Aktga kiritmaslik'}
            </button>
          </div>
        </div>
        {tTugun.tur === 'bl' && b && tTugun.bolalar.length > 0 && (() => {
          // Egasi 2026-09-29: ish — resurslar MASSIVI. F2 resurslari ↔ smeta ishining resurslari
          // yonma-yon; juftsiz har biri uchun aniq amal (zamena / qo'shimcha); smetada qolgan
          // juftsiz resurslar ham ko'rinadi — hech biri "tushib qolmaydi".
          const sIshId = b.qatorId;
          const smetaRes = (S.bolalar.get(sIshId) ?? []).filter((x) => x.tur !== 'rz');
          const juftSmeta = new Set<number>();
          for (const r of tTugun.bolalar) { const rb = ij.bog.get(r.uid); if (rb) juftSmeta.add(rb.qatorId); }
          const juftsiz = smetaRes.filter((x) => !juftSmeta.has(x.id));
          const kat = 'border-b border-r border-border/60 px-1.5 py-1';
          return (
            <div className="overflow-auto rounded border border-border/60">
              <div className="grid min-w-[860px] grid-cols-[28px_minmax(200px,1fr)_110px_minmax(200px,1fr)_110px_170px] bg-surface-2 text-[10.5px] font-semibold uppercase text-text-dim">
                <span className={kat}>●</span><span className={kat}>F2 resursi</span><span className={`${kat} text-right`}>F2 miqdor</span>
                <span className={kat}>Smeta resursi (jufti)</span><span className={`${kat} text-right`}>Smeta miqdor</span><span className={kat}>Amal</span>
              </div>
              {tTugun.bolalar.map((r, i) => {
                const rk = korinish(ij, r.uid);
                const rb = ij.bog.get(r.uid);
                const sr = rb ? S.byId.get(rb.qatorId) : undefined;
                const tv = p.natija.natijalar.get(r.uid)?.tavsiya;
                const tvS = tv?.tur === 'zamena' ? S.byId.get(tv.qatorId) : undefined;
                let keyin: number = sIshId;
                for (let j = i - 1; j >= 0; j--) { const bb = ij.bog.get(tTugun.bolalar[j].uid); if (bb && S.byId.get(bb.qatorId)?.otaId === sIshId) { keyin = bb.qatorId; break; } }
                const guruhBosh = r.guruh && r.guruhUid !== tTugun.bolalar[i - 1]?.guruhUid;
                return (
                  <Fragment key={r.uid}>
                  {/* F2 dagi matnli guruh sarlavhasi («ДЕТАЛЬ -1»): resurs emas — keyingi resurslar smetadagi shu nomli razdelga bog‘lanadi. */}
                  {guruhBosh && <div className="min-w-[860px] border-t border-border/60 bg-surface-2/60 px-2 py-0.5 text-[11px] font-semibold text-text-dim">▸ {r.guruh}</div>}
                  <div className={`grid min-w-[860px] grid-cols-[28px_minmax(200px,1fr)_110px_minmax(200px,1fr)_110px_170px] text-[11.5px] ${QATOR_FON[rk]}`}>
                    <span className={`${kat} text-center font-bold ${HOLAT_KATAK[rk]}`}>{BELGI[rk].b}</span>
                    <span className={kat}>{r.nom}</span>
                    <span className={`${kat} text-right tabular-nums`}>{fmt(r.hajm)} {r.birlik ?? ''}</span>
                    <span className={kat}>{sr ? sr.nom : tvS ? <span className="text-warn">⇄ taklif: {tvS.nom}</span> : <span className="text-text-mute">— smetada jufti yo‘q</span>}</span>
                    <span className={`${kat} text-right tabular-nums`}>{sr ? `${fmt(sr.hajm)} ${sr.birlik ?? ''}` : ''}</span>
                    <span className={`${kat} flex flex-wrap gap-1`}>
                      {!sr && tvS && <button type="button" className="tugma tugma-asosiy h-6 px-1.5 text-[11px]" onClick={() => zamena(r, tvS)}>⇄ Zamena</button>}
                      {!sr && p.raw.get(sIshId) && <button type="button" className="tugma h-6 px-1.5 text-[11px]" onClick={() => ochModal(r, { kind: 'resource', parent: p.raw.get(sIshId)!, keyinId: keyin })}>＋ Resurs</button>}
                      {sr && <button type="button" className="tugma h-6 px-1.5 text-[11px]" onClick={() => p.onIj(uz(ij, r))}><Unlink size={11} /> Uzish</button>}
                    </span>
                  </div>
                  </Fragment>
                );
              })}
              {juftsiz.length > 0 && (
                <div className="border-t border-border/60 bg-surface-2/40 px-2 py-1 text-[11px] text-text-dim">
                  <b>Smetada, lekin shu F2 da yo‘q ({juftsiz.length}):</b> {juftsiz.map((x) => x.nom).join('; ')} — bu oy bajarilmagan yoki F2 dagi boshqa resurs uning o‘rniga (⇄ Zamena).
                </div>
              )}
            </div>
          );
        })()}
        {nomzodlar.length > 0 && (
          <div className="rounded border border-border/60">
            <p className="border-b border-border/60 bg-surface-2/50 px-2 py-1 text-[11px] font-semibold text-text-dim">{tarj('Mos smeta qatorlari — bog‘lang yoki zamena qiling')}</p>
            {nomzodlar.slice(0, 20).map((n) => {
              const ns = S.byId.get(n.qatorId);
              if (!ns) return null;
              const percent = nomzodFoiz.get(n.qatorId);
              return (
                <div key={n.qatorId} className="flex items-center gap-2 border-b border-border/40 px-2 py-1 text-[11.5px] last:border-0">
                  <span className="w-12 shrink-0 text-right font-semibold tabular-nums text-warn" title="Dalillarga asoslangan moslik indeksi; ehtimollik ham, avtomatik tasdiq ham emas.">{percent == null ? '—' : `${percent}%`}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-text">{ns.kod && <span className="mr-1 font-mono text-text-mute">{ns.kod}</span>}{ns.nom} <span className="text-text-mute">({ns.birlik ?? '—'}, {fmt(ns.hajm)})</span></span>
                    <span className="block truncate text-[10.5px] text-text-mute">
                      {n.qavatlar.length ? n.qavatlar.map((qv) => `${qv.izoh} ${qv.ball > 0 ? '+' : ''}${qv.ball}`).join(' · ') : n.sabab.join(', ')}
                      {n.yol ? ` — ${n.yol}` : ''}
                    </span>
                  </span>
                  <button type="button" className="tugma h-6 shrink-0 px-1.5 text-[11px]" onClick={() => (tTugun.tur === 'bl' ? ishBogla(tTugun, ns.id) : (p.onIj(bogla(ij, tTugun.uid, ns.id)), xab('Bog‘landi.')))}>
                    <Link2 size={12} /> Bog‘lash
                  </button>
                  <button type="button" className="tugma h-6 shrink-0 px-1.5 text-[11px]" onClick={() => zamena(tTugun, ns)} title="F2 qatori shu smeta qatori o‘rniga bajarilgan (zamena)">⇄ Zamena</button>
                </div>
              );
            })}
          </div>
        )}
        {tTugun.tur === 'rs' && otaBoglangan && nomzodlar.length === 0 && (
          <p className="rounded border border-warn/30 bg-warn/5 px-2 py-1.5 text-[11px] text-text-dim">
            Shu ish ichida shifr yoki nom bo‘yicha ishonchli resurs varianti topilmadi. O‘ngdagi smeta daraxtidan qidirib, mos resursni qo‘lda bog‘lang. Bir xil birlikning o‘zi moslik dalili emas.
          </p>
        )}
        {k === 'topilmadi' && tTugun.tur === 'bl' && (() => {
          // Egasi sinovi 2026-09-28: ✕ ish — smetaning o'sha razdelida nima borligi yonma-yon;
          // bir bosishda "shu ish o'rniga (zamena)" yoki "qo'shimcha ish".
          const otaRz = ind.ota.get(tTugun.uid);
          const rzIdlar = otaRz ? rzDiag.get(otaRz.uid)?.smetaRzIdlar ?? [] : [];
          if (!rzIdlar.length) return null;
          return rzIdlar.map((rzId) => {
            const rzS = S.byId.get(rzId);
            const ishlar = (S.bolalar.get(rzId) ?? []).filter((x) => x.tur !== 'rz');
            return (
              <div key={rzId} className="rounded border border-border/60">
                <div className="flex items-center gap-2 border-b border-border/60 bg-surface-2/50 px-2 py-1 text-[11.5px]">
                  <span className="min-w-0 flex-1 truncate">Smetaning <b>«{rzS?.nom}»</b> razdelida ({ishlar.length} ta qator) — qaysi ish o‘rniga bajarilgan?</span>
                  <button type="button" className="tugma h-6 shrink-0 px-1.5 text-[11px]" disabled={(p.disabled || mutationBusy) || !p.raw.get(rzId)}
                    onClick={() => ochModal(tTugun, { kind: 'additional', parent: p.raw.get(rzId)! })}>＋ Qo‘shimcha ish</button>
                </div>
                <div>
                  {ishlar.map((x) => (
                    <div key={x.id} className="flex items-center gap-2 border-b border-border/30 px-2 py-1 text-[11.5px] last:border-0">
                      <span className="min-w-0 flex-1 truncate" title={x.nom ?? ''}>{x.kod && x.kod.length > 2 && <span className="mr-1 font-mono text-text-mute">{x.kod.split(/\s+/)[0]}</span>}{x.nom}</span>
                      <SonUstunlari norma={x.norma} miqdor={x.hajm} birlik={x.birlik} narx={x.narx} oxirgi="" />
                      <button type="button" className="tugma h-6 shrink-0 px-1.5 text-[11px]" disabled={(p.disabled || mutationBusy)} onClick={() => zamena(tTugun, x)} title="F2 ishi smetadagi shu ish o‘rniga bajarilgan">⇄ Zamena</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          });
        })()}
      </div>
    );
  }

  const gh = guruhHisobla(ind, ij);
  const halSoni = gh.hal.length;
  return (
    <div className="space-y-2">
      <div className="karta space-y-2 p-2 text-[12px]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span title="Moslik dvigateli dalillar bo‘yicha avtomatik topdi; bu operator tekshiruvi degani emas."><b className="text-ok">✓ {gh.tizimTopdi}</b> tizim mos topdi</span>
          <span title="Avvalgi davrda tasdiqlangan bog‘lanish xotirasidan olindi."><b className="text-ok">↻ {gh.avvalgiQaror}</b> oldingi qaror</span>
          <span title="Bu qatorni operator qo‘lda bog‘ladi yoki taklifni tasdiqladi."><b className="text-ok">✋ {gh.operatorTasdiqladi}</b> operator tasdiqladi</span>
          <span><b className="text-warn">◐ {gh.taklif}</b> operator tasdig‘ini kutmoqda</span>
          <span><b className="text-danger">✕ {gh.topilmadi}</b> topilmadi</span>
          <span><b className="text-text-mute">– {gh.otkazildi}</b> ataylab chiqarilgan</span>
          <button type="button" className="tugma tugma-asosiy ml-auto h-7 px-2 text-[12px]" disabled={!halSoni} onClick={keyingiHal}>
            <ArrowDownToLine size={13} /> Keyingi tekshirilmagan
          </button>
        </div>
        {/* Egasi 2026-09-28: xulosa — to'rtta aniq son va bitta chiziq; chalkash foiz/taqqos qatorlari yo'q. */}
        {(() => {
          const jami = reconciliation.sourceAmount.knownAmount;
          const ok = reconciliation.confirmedAmount.knownAmount;
          const taklif = reconciliation.suggestedAmount.knownAmount;
          const yoq = reconciliation.unboundAmount.knownAmount;
          const ulush = (x: number) => (jami > 0 ? Math.max(0, Math.min(100, (x / jami) * 100)) : 0);
          return (
            <div className="space-y-1.5 border-t border-border/60 pt-2">
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                {[
                  ['F2 hujjat jami', jami, 'text-text', [reconciliation.sourceAmount.complete ? '' : `${reconciliation.sourceAmount.unknownCount} ta qator summasi noma’lum`, reconciliation.declaredDocumentAmount != null ? `hujjat ИТОГО ПРЯМЫЕ: ${fmt(reconciliation.declaredDocumentAmount, 2)}${reconciliation.sourceVsDeclaredDifference != null && Math.abs(reconciliation.sourceVsDeclaredDifference) >= 0.005 ? ` · farq ${fmt(reconciliation.sourceVsDeclaredDifference, 2)}` : ' ✓'}` : ''].filter(Boolean).join(' · '), reconciliation.katKesim.source],
                  ['✓ Bog‘langan', ok, 'text-ok', `${fmt(ulush(ok), 1)} %`, reconciliation.katKesim.confirmed],
                  ['◐ Tasdiq kutmoqda', taklif, 'text-warn', `${fmt(ulush(taklif), 1)} %`, reconciliation.katKesim.suggested],
                  ['✕ Bog‘lanmagan', yoq, 'text-danger', `${fmt(ulush(yoq), 1)} % — zamena / qo‘shimcha`, reconciliation.katKesim.unbound],
                ].map(([t, v, c, iz, kk]) => (
                  <div key={t as string} className="rounded-md bg-surface-2/50 px-2 py-1.5">
                    <span className="block text-[10.5px] text-text-mute">{t as string}</span>
                    {/* Egasi 2026-10-24: har summa ustamali (asosiy) + ustamasiz (kichik). */}
                    <SummaJuft className={`block ${c as string}`} obyektId={p.objectId} kompaniyaId={p.companyId} ustamasiz={v as number} katKesim={kk as KatKesim} />
                    {iz ? <span className="block text-[10px] text-text-mute">{iz as string}</span> : null}
                  </div>
                ))}
              </div>
              <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <span className="bg-emerald-500" style={{ width: `${ulush(ok)}%` }} />
                <span className="bg-amber-500" style={{ width: `${ulush(taklif)}%` }} />
                <span className="bg-rose-500" style={{ width: `${ulush(yoq)}%` }} />
              </div>
            </div>
          );
        })()}
      </div>

      {manbaTekshiruvi.length > 0 && (
        <section role="alert" aria-label="F2 faylini o‘qish tekshiruvi" className="karta space-y-1.5 border border-warn/50 p-3 text-[12px]">
          <p className="font-semibold text-warn">F2 faylida {manbaTekshiruvi.length} ta qator yoki sarlavha qo‘lda tekshirilishi kerak.</p>
          <p className="text-text-dim">Bu ro‘yxat bog‘lash holatidan alohida. “Bog‘lanishlar hal qilindi” degani fayldagi har bir qator to‘liq o‘qildi degani emas.</p>
          <div>
            <ul className="mt-1 max-h-28 space-y-0.5 overflow-auto pl-4 text-text-dim">
              {manbaTekshiruvi.slice(0, 20).map((review, index) => (
                <li key={`${review.manzil?.qator ?? 'no-row'}-${review.kod}-${index}`}>
                  {review.manzil?.qator != null && <b className="text-text">Manba qatori {review.manzil.qator}: </b>}
                  {review.izoh}
                </li>
              ))}
              {manbaTekshiruvi.length > 20 && <li>Yana {manbaTekshiruvi.length - 20} ta tekshiruv bandi mavjud.</li>}
            </ul>
          </div>
        </section>
      )}
      {manbaPodvalQatorlari.length > 0 && (
        <section role="note" aria-label="F2 hisob va podval satrlari" className="karta space-y-1.5 border border-border p-3 text-[12px]">
          <p className="font-semibold text-text">F2 hisobida {manbaPodvalQatorlari.length} ta yakuniy/podval satri aniqlandi.</p>
          <p className="text-text-dim">Bular ish yoki resurs emas, shuning uchun smeta bilan bog‘lash daraxtiga kiritilmaydi. Ular F2 manba summasini tekshirishda alohida hisobga olinadi.</p>
        </section>
      )}
      {/* Tanlangan qator paneli va xabar — daraxtlar ustida, DOIMIY balandlikda: tanlash/bog'lash pastdagi
          daraxtlarni surmaydi (egasi sinovi 2026-10-06: tanlashda ~130 px, bog'lashda ~26 px sakrash). */}
      <div className={`karta sticky top-2 z-20 flex flex-col overflow-hidden p-2 backdrop-blur-xl ${panelYopiq ? '' : 'min-h-[120px] max-h-[30vh]'}`} ref={panelRef}>
        <button type="button" aria-expanded={!panelYopiq} aria-label={t('Tanlangan qator paneli')} onClick={() => setPanelYopiq((v) => !v)}
          className="mb-1 flex w-full shrink-0 items-center gap-1 text-left text-[11px] font-semibold text-text-dim hover:text-text">
          <span aria-hidden>{panelYopiq ? '▸' : '▾'}</span><span>{t('Tanlangan qator')}</span>
          {panelYopiq && tTugun && <span className="min-w-0 flex-1 truncate font-normal text-text">{tTugun.kod ? tTugun.kod + ' ' : ''}{tTugun.nom}</span>}
        </button>
        {!panelYopiq && <div className="min-h-0 flex-1 overflow-auto"><Panel /></div>}
        <p role={xabar ? 'status' : undefined} className="mt-1 flex h-5 shrink-0 items-center gap-2 border-t border-border/50 pt-1 text-[12px] text-text-dim">
          {xabar ? <>
            <span className="min-w-0 flex-1 truncate" title={xabar}>{xabar}</span>
            <button type="button" aria-label="Yopish" onClick={() => setXabar(null)}><X size={13} /></button>
          </> : null}
        </p>
      </div>

      <div className="karta flex flex-wrap items-center gap-2 p-2" aria-label={t('Panel ko‘rinishi')}>
        <span className="text-[12px] text-text-dim">{t('1. F2 qatorini tanlang → 2. Smetadan mos qatorni tanlang → 3. Bog‘lanishni tekshiring.')}</span>
        <div role="group" aria-label={t('Panel kengligi')} className="ml-auto flex flex-wrap gap-1">
          {([['teng', t('Teng panellar')], ['f2', t('F2 kengroq')], ['smeta', t('Smeta kengroq')], ['ustma', t('Ustma-ust')]] as const).map(([value, label]) => <button key={value} type="button" className={`tugma text-[11px] ${panellar === value ? 'tugma-asosiy' : ''}`} aria-pressed={panellar === value} onClick={() => setPanellar(value)}>{label}</button>)}
          <button type="button" className="tugma text-[11px]" aria-pressed={tafsilot} onClick={() => setTafsilot(!tafsilot)}>{t('Norma va narx tafsilotlari')}</button>
        </div>
      </div>
      <div className={`grid grid-cols-1 gap-2 ${panellar === 'teng' ? 'lg:grid-cols-2' : panellar === 'f2' ? 'lg:grid-cols-[3fr_2fr]' : panellar === 'smeta' ? 'lg:grid-cols-[2fr_3fr]' : ''} ${tafsilot ? '' : '[&_.f2-grid]:grid-cols-[26px_72px_minmax(160px,1fr)_70px_45px_85px_64px] [&_.f2-grid>*:nth-child(4)]:hidden [&_.f2-grid>*:nth-child(7)]:hidden [&_.smeta-grid]:grid-cols-[22px_72px_minmax(180px,1fr)_70px_45px_75px_100px] [&_.smeta-grid>*:nth-child(4)]:hidden [&_.smeta-grid>*:nth-child(7)]:hidden'}`}>
        <section className="karta flex min-h-0 flex-col overflow-hidden" aria-label="F2 akt">
          <header className="flex flex-wrap items-center gap-2 border-b border-border bg-sky-500/10 px-2 py-2">
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-text-dim">F2 akt — {p.akt.varaq} {filtr === 'hal' && halSoni === 0 ? '· hal qilindi' : ''}</span>
            <div className="relative flex-1">
              <Search size={12} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-text-mute" />
              <input aria-label="F2 dan qidirish" value={qF} onChange={(e) => setQF(e.target.value)} placeholder="shifr yoki nom…"
                className="input h-7 w-full pl-5 pr-1.5 text-[12px]" />
            </div>
          </header>
          <TreeControls depths={qF.trim().length >= 2 ? [] : f2ExpandableDepths} onOpenAll={f2BarchasiniOch} onCloseAll={f2BarchasiniYop} onToggleDepth={f2Sath} />
          <PanelFiltr label="F2 filtri" value={filtr} onChange={setFiltr} options={[['hammasi', 'Hammasi'], ['hal', `Tekshirilmagan (${halSoni})`], ['boglanmagan', 'Bog‘lanmagan'], ['muammo', 'Muammoli']]}
            izoh={`${f2VisibleRows.length.toLocaleString('ru-RU')} qator ko‘rinmoqda`} />
          <div role="toolbar" aria-label={tarj('Belgilangan F2 qatorlari')} className="flex flex-wrap items-center gap-1 border-b border-border bg-surface-2/50 px-2 py-1 text-[11px]">
            {belgi.size ? <>
              <span className="font-semibold text-text">{belgi.size} {tarj('ta belgilandi:')}</span>
              <button type="button" className="tugma h-6 px-1.5 text-[11px]" disabled={p.disabled || mutationBusy} onClick={() => ommaviy('tasdiq')}><Check size={11} /> {tarj('Tasdiqlash')}</button>
              <button type="button" className="tugma h-6 px-1.5 text-[11px]" disabled={p.disabled || mutationBusy} onClick={() => ommaviy('uz')}><Unlink size={11} /> {tarj('Uzish')}</button>
              <button type="button" className="tugma h-6 px-1.5 text-[11px]" disabled={p.disabled || mutationBusy} onClick={() => ommaviy('otkaz')}>{tarj('Aktga kiritmaslik')}</button>
              <button type="button" className="tugma h-6 px-1.5 text-[11px]" disabled={p.disabled || mutationBusy} onClick={() => ommaviy('kirit')}>{tarj('Aktga qaytarish')}</button>
              {p.onRejali && <button type="button" className="tugma tugma-asosiy h-6 px-1.5 text-[11px]" disabled={p.disabled || mutationBusy}
                onClick={() => ommaviyQoralama('qoshimcha')} title={tarj('Belgilangan bog‘lanmagan ishlar o‘z razdeliga qo‘shimcha ish (resurslari bilan), resurslar o‘z ishiga qo‘shimcha resurs bo‘lib qoralamaga qo‘shiladi')}>＋ {tarj('Hammasi qo‘shimcha')}</button>}
              {p.onRejali && <button type="button" className="tugma h-6 px-1.5 text-[11px]" disabled={p.disabled || mutationBusy}
                onClick={() => ommaviyQoralama('taklif')} title={tarj('Tizim zamena taklif qilgan qatorlar — zamena, qolganlari — qo‘shimcha')}>⇄ {tarj('Takliflar bo‘yicha')}</button>}
              <button type="button" className="tugma h-6 px-1.5 text-[11px]" onClick={() => setBelgi(new Set())}>{tarj('Belgini tozalash')}</button>
            </> : <span className="text-text-mute">{tarj('Holat belgisini (✓ ◐ ✕) bosib qatorlarni belgilang — bir nechtasini birga tasdiqlash, uzish yoki aktdan chiqarish mumkin.')}</span>}
            <button type="button" className="tugma ml-auto h-6 px-1.5 text-[11px]" disabled={!f2VisibleRows.length}
              onClick={() => setBelgi(new Set(f2VisibleRows.filter((r) => r.node.tur !== 'rz').map((r) => r.node.uid)))}>{tarj('Ko‘rinadiganlarni belgilash')}</button>
          </div>
          <div ref={f2Quti} className="h-[66vh] overflow-auto">
            <div className={`${tafsilot ? 'min-w-[742px]' : 'min-w-[560px]'} border-l border-t border-border/70`}>
            <JadvalSarlavha tur="f2" />
            <div style={{ height: f2Virtual.getTotalSize(), position: 'relative', width: '100%' }}>
              {f2Virtual.getVirtualItems().map((virtualRow) => {
                const row = f2VisibleRows[virtualRow.index];
                return <div key={row.node.uid} data-index={virtualRow.index} ref={f2Virtual.measureElement}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}>
                  {f2Qator(row.node, row.depth)}
                </div>;
              })}
            </div>
            </div>
            {filtr === 'hal' && halSoni === 0 && <p className="p-3 text-center text-[12px] text-ok">Bog‘lash yoki tasdiq kutayotgan qator qolmadi. Faylni o‘qish tekshiruvlarini alohida ko‘ring.</p>}
            {filtr !== 'hammasi' && !f2VisibleRows.length && <p className="p-3 text-center text-[12px] text-text-mute">Bu filtr bo‘yicha qator topilmadi.</p>}
          </div>
        </section>
        <section className="karta flex min-h-0 flex-col overflow-hidden" aria-label="Smeta">
          <header className="flex flex-wrap items-center gap-2 border-b border-border bg-emerald-500/10 px-2 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">Smeta (LRV)</span>
            <div className="relative flex-1">
              <Search size={12} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-text-mute" />
              <input aria-label="Smetadan qidirish" value={q} onChange={(e) => setQ(e.target.value)} placeholder="shifr yoki nom…"
                className="input h-7 w-full pl-5 pr-1.5 text-[12px]" />
            </div>
            {p.onBolimRejali && <button type="button" className="tugma h-7 px-2 text-[11px]" disabled={p.disabled || mutationBusy} onClick={() => yangiBolim(null)}
              title={tarj('Smetaning yuqori darajasiga yangi bo‘lim (oxiriga)')}>＋ {tarj('Bo‘lim')}</button>}
          </header>
          <QatorRangIzohi />
          <TreeControls depths={qidiruvNatija ? [] : smetaExpandableDepths} onOpenAll={smetaBarchasiniOch} onCloseAll={smetaBarchasiniYop} onToggleDepth={smetaSath} />
          <PanelFiltr label="Smeta filtri" value={sFiltr} onChange={setSFiltr} options={[['hammasi', 'Hammasi'], ['boglangan', 'Shu F2 da bog‘langan'], ['boglanmagan', 'Bog‘lanmagan']]}
            izoh={`${smetaVisibleRows.length.toLocaleString('ru-RU')} qator ko‘rinmoqda`} />
          <div role="toolbar" aria-label={tarj('Belgilangan smeta qatorlari')} className="flex flex-wrap items-center gap-1 border-b border-border bg-surface-2/50 px-2 py-1 text-[11px]">
            {sBelgi.size ? <>
              <span className="font-semibold text-text">{sBelgi.size} {tarj('ta belgilandi:')}</span>
              <button type="button" className="tugma h-6 px-1.5 text-[11px]" disabled={p.disabled || mutationBusy} onClick={sOmmaviyUz}><Unlink size={11} /> {tarj('F2 bog‘lanishlarini uzish')}</button>
              {(p.onOchirishRejali || p.onRejaliOchir) && <button type="button" className="tugma h-6 px-1.5 text-[11px] text-danger" disabled={p.disabled || mutationBusy} onClick={sOmmaviyOchir}
                title={tarj('Faqat siz qo‘shgan qatorlar va bo‘limlar o‘chiriladi; asl smeta qatorlari o‘zgarmaydi')}><Trash2 size={11} /> {tarj('Qo‘shilganlarni o‘chirish')}</button>}
              <button type="button" className="tugma h-6 px-1.5 text-[11px]" onClick={() => setSBelgi(new Set())}>{tarj('Belgini tozalash')}</button>
            </> : <span className="text-text-mute">{tarj('☐ ni bosib smeta qatorlarini belgilang (Shift — oraliq): bir nechtasining F2 bog‘lanishini uzish yoki siz qo‘shganlarini o‘chirish mumkin.')}</span>}
            <button type="button" className="tugma ml-auto h-6 px-1.5 text-[11px]" disabled={!smetaVisibleRows.length}
              onClick={() => setSBelgi(new Set(smetaVisibleRows.map((r) => r.node.id)))}>{tarj('Ko‘rinadiganlarni belgilash')}</button>
          </div>
          {sudrash && <div className="border-b border-accent/40 bg-accent/15 px-2 py-1 text-[11.5px] text-text" role="status">
            <b>«{sudrash.nom.slice(0, 60)}»</b> — {sudrash.tur === 'rz' ? 'smeta RAZDELIGA tashlang (razdel o‘rgatiladi)'
              : sudrash.tur === 'bl' ? 'smeta ISHIGA tashlang (bog‘lash yoki zamena) yoki RAZDELGA (qo‘shimcha ish)'
                : 'smeta RESURSIGA (bog‘lash/zamena) yoki ISHIGA (qo‘shimcha resurs) tashlang'}. Punktir ramka — mos joylar.
          </div>}
          <div ref={smetaQuti} className="h-[66vh] overflow-auto" onDragOver={avtoAylantir}>
            <div className={`${tafsilot ? 'min-w-[704px]' : 'min-w-[560px]'} border-l border-t border-border/70`}>
            <JadvalSarlavha tur="smeta" />
            {qidiruvNatija && !qidiruvNatija.length
              ? <p className="p-2 text-[12px] text-text-mute">Topilmadi.</p>
              : <div style={{ height: smetaVirtual.getTotalSize(), position: 'relative', width: '100%' }}>
                {smetaVirtual.getVirtualItems().map((virtualRow) => {
                  const row = smetaVisibleRows[virtualRow.index];
                  return <div key={row.node.id} data-index={virtualRow.index} ref={smetaVirtual.measureElement}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}>
                    {smetaQator(row.node, row.depth, !!qidiruvNatija)}
                  </div>;
                })}
              </div>}
            </div>
          </div>
        </section>
      </div>

      {tanlov && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setTanlov(null)}>
          <div className="karta w-full max-w-lg space-y-3 p-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Bog‘lash turi">
            <h3 className="text-[14px] font-semibold text-text">Bu qanday bog‘lanish?</h3>
            <div className="grid gap-1 text-[12px]">
              <p><span className="text-text-mute">F2:</span> {tanlov.f.kod} {tanlov.f.nom} <span className="text-text-mute">({tanlov.f.birlik ?? '—'}, {fmt(tanlov.f.hajm)})</span></p>
              <p><span className="text-text-mute">Smeta:</span> {tanlov.s.kod} {tanlov.s.nom} <span className="text-text-mute">({tanlov.s.birlik ?? '—'}, {fmt(tanlov.s.hajm)})</span></p>
            </div>
            {tanlov.tur === 'ish_resurs' ? <div className="grid gap-2">
              <button type="button" className="tugma tugma-asosiy justify-start text-left" onClick={() => { const { f, s } = tanlov; setTanlov(null); void resursOrnigaIsh(f, s); }}>
                <span>⇄</span> <span><b>Shu resurs o‘rniga ish</b> — masalan ГПС ni buyurtmachi bergan: material olinmaydi, uning o‘rniga qazib olish / tashish ishi yoziladi. Resursning o‘zi o‘zgarmaydi.</span>
              </button>
              <button type="button" className="tugma justify-start text-left" onClick={() => { const { f, s } = tanlov; setTanlov(null); zamena(f, s); }}>
                <span>⇄</span> <span><b>{tarj('Zamena material')}</b> — {tarj('faqat material almashgan (masalan ПК o‘rniga ПБ): smetadagi resurs o‘rniga F2 dagisi, yangi qator, eskisi o‘zgarmaydi')}</span>
              </button>
              <button type="button" className="tugma" onClick={() => setTanlov(null)}>Bekor qilish</button>
            </div> : <div className="grid gap-2">
              <button type="button" className="tugma justify-start text-left" onClick={() => {
                const { f, s } = tanlov; setTanlov(null);
                if (f.tur === 'bl') ishBogla(f, s.id); else { p.onIj(bogla(ij, f.uid, s.id)); xab('Bog‘landi.'); }
              }}>
                <Link2 size={14} /> <span><b>Bog‘lash</b> — bu o‘sha {tanlov.tur === 'ish' ? 'ish' : 'resurs'} (nomi/shifri boshqacha yozilgan)</span>
              </button>
              <button type="button" className="tugma justify-start text-left" onClick={() => { const { f, s } = tanlov; setTanlov(null); zamena(f, s); }}>
                <span>⇄</span> <span><b>{tanlov.tur === 'ish' ? 'Zamena ish' : 'Zamena material'}</b> — smetadagi qator o‘rniga F2 dagisi bajarilgan (yangi qator, eskisi o‘zgarmaydi)</span>
              </button>
              {tanlov.s.otaId != null && p.raw.get(tanlov.s.otaId) && (
                <button type="button" className="tugma justify-start text-left" onClick={() => {
                  const { f, s, tur } = tanlov; setTanlov(null);
                  ochModal(f, { kind: tur === 'ish' ? 'additional' : 'resource', parent: p.raw.get(s.otaId!)!, keyinId: s.id });
                }}>
                  <span>＋</span> <span><b>{tanlov.tur === 'ish' ? 'Qo‘shimcha ish' : 'Qo‘shimcha resurs'}</b> — smetada yo‘q; aynan shu qatordan KEYIN joylashadi</span>
                </button>
              )}
              <button type="button" className="tugma" onClick={() => setTanlov(null)}>Bekor qilish</button>
            </div>}
          </div>
        </div>
      )}

      {modal && (
        <F2AddReplModal
          action={modal.action}
          companyId={p.companyId}
          objectId={p.objectId}
          initialNom={modal.f.nom}
          initialKod={modal.f.kod ?? undefined}
          initialBirlik={modal.f.birlik ?? undefined}
          initialHajm={modal.f.hajm ?? undefined}
          initialTur={modal.action.kind === 'replacement' && (modal.action.oldRow?.tur === 'mat' || modal.action.oldRow?.tur === 'ob') ? modal.action.oldRow.tur
            : modal.f.tur === 'bl' && !modal.f.bolalar.length && /^С(\s|$|\d)/.test((modal.f.kod ?? '').trim()) ? 'mat' : 'bl'}
          onClose={() => setModal(null)}
          resurslar={modal.f.tur === 'bl' ? modal.f.bolalar.map((r) => ({ tur: resTuri(r.birlik), nom: r.nom, birlik: r.birlik || 'шт', hajm: r.hajm, kod: r.kod })) : undefined}
          onCreated={(id, resIdlar) => { const f = modal.f; setModal(null); void p.onYaratildi(f, id, resIdlar); }}
          onRejali={p.onRejali ? (b) => { const f = modal.f; setModal(null); p.onRejali!(f, b); xab(`«${b.nom.slice(0, 50)}» qoralamaga qo‘shildi — «Saqlash» bosilganda yoziladi.`); } : undefined}
        />
      )}

      {abc && (
        <IshAbcModal kompaniyaId={p.companyId} obyektId={p.objectId} sana={new Date().toISOString().slice(0, 10)} bolimlar={[]}
          rejim={abc.rejim} tahrir={abc.tahrir} saqlash={abc.saqlash} onYop={() => setAbc(null)}
          onSaqlandi={async (matn, yangiId) => {
            if (abc.rejali) { setAbc(null); xab(tarj('Tahrir qoralamaga qo‘shildi — «F2 ni yozish» bosilganda yoziladi. F2 bog‘lanishi yangi qatorga o‘tdi.')); return; }
            await p.onQoshilganOzgardi?.(abc.eskiIdlar, yangiId ?? null);
            setAbc(null); xab(`${matn} F2 bog‘lanishi yangi qatorga o‘tkazildi.`);
          }} />
      )}
    </div>
  );
}
