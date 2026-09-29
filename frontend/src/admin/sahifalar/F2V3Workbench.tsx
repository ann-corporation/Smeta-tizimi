import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ChevronDown, Search, Link2, Unlink, Check, SkipForward, ArrowDownToLine, X } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { T2Qator } from '../../api/supabase';
import type { F2Akt, F2Tugun } from '../../lib/smeta-anatomiya/f2';
import type { F2MoslashNatija, Nomzod, SmetaQator } from '../../lib/f2-moslash-v3';
import {
  bogla, hisobla, ishniBogla, korinish, oshaQatormi, otkazibYubor, tasdiqla, uz,
  type F2Indeks, type IshJoyi, type KorinishHolat, type SmetaIndeks,
} from '../../lib/f2-moslash-v3/ishJoyi';
import { F2AddReplModal, type DropAction } from './F2AddReplModal';
import { moslikIndeksiPercent } from '../../lib/f2-link-review/compatibility';
import { reconcileF2Links } from '../../lib/f2-link-review/reconciliation';
import { expandableDepths, expandableIdsAtDepth, flattenVisibleTree } from '../../lib/f2-link-review/tree';

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

type Tanlov = { f: F2Tugun; s: SmetaQator; tur: 'ish' | 'resurs' };

function TreeControls(props: {
  depths: number[];
  onOpenAll: () => void;
  onCloseAll: () => void;
  onToggleDepth: (depth: number) => void;
}) {
  return <div className="flex flex-wrap items-center gap-1 border-b border-border/50 px-2 py-1" aria-label="Daraxt ko‘rinishini boshqarish">
    <button type="button" className="tugma h-6 px-1.5 text-[10px]" onClick={props.onOpenAll}>Hammasini ochish</button>
    <button type="button" className="tugma h-6 px-1.5 text-[10px]" onClick={props.onCloseAll}>Hammasini yopish</button>
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
  ij: IshJoyi;
  onIj: (next: IshJoyi) => void;
  onRzBog: (f2RzUid: string, smetaRzId: number) => void;
  companyId: number;
  objectId: number;
  /** Qo'shimcha/zamena qator yaratilgach: sahifa smetani yangilaydi, ish bo'lsa resurslarini yaratadi va bog'laydi. */
  onYaratildi: (f: F2Tugun, qatorId: number, resursQatorIdlar?: number[]) => Promise<void>;
  disabled?: boolean;
}

/** Resurs turi birlikdan: ЧЕЛ/МАШ — rs, qolgani material (kategoriyani server birlik/nom bo'yicha aniqlaydi). */
const resTuri = (birlik: string | null): 'rs' | 'mat' => (/ЧЕЛ|МАШ/i.test(birlik ?? '') ? 'rs' : 'mat');

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
const F2_GRID = 'grid grid-cols-[30px_minmax(84px,120px)_minmax(260px,1fr)_72px_88px_68px_96px_118px_250px]';
const S_GRID = 'grid grid-cols-[minmax(84px,120px)_minmax(260px,1fr)_72px_88px_68px_96px_100px_112px]';
const KATAK = 'border-b border-r border-border/70 px-1.5 py-1';
const SON = `${KATAK} text-right tabular-nums text-[11.5px]`;
/** Holat katagi — to'liq rangli fon (Excel shartli formatlashi kabi). */
const HOLAT_KATAK: Record<KorinishHolat, string> = {
  aniq: 'bg-ok/25 text-ok', xotira: 'bg-ok/25 text-ok', qolda: 'bg-accent/25 text-accent',
  taklif: 'bg-warn/30 text-warn', topilmadi: 'bg-danger/30 text-danger', otkazildi: 'bg-surface-2 text-text-mute',
};
function JadvalSarlavha({ tur }: { tur: 'f2' | 'smeta' }) {
  const u = 'border-b border-r border-border px-1.5 py-1.5';
  return (
    <div className={`${tur === 'f2' ? F2_GRID : S_GRID} sticky top-0 z-10 bg-surface-2 text-[10.5px] font-semibold uppercase tracking-wide text-text-dim`}>
      {tur === 'f2' && <span className={`${u} text-center`} title="Holat">●</span>}
      <span className={u}>Shifr / kod</span><span className={u}>Nomi</span>
      <span className={`${u} text-right`}>Norma</span><span className={`${u} text-right`}>Miqdor</span><span className={u}>Birlik</span>
      <span className={`${u} text-right`}>Narx</span><span className={`${u} text-right`}>{tur === 'f2' ? 'Summa' : 'Qoldiq'}</span>
      <span className={u}>Amal</span>
    </div>
  );
}

export function F2V3Workbench(p: F2V3WorkbenchProps) {
  const { ind, S, ij } = p;
  const [tanlangan, setTanlangan] = useState<string | null>(null);
  const [ochiqS, setOchiqS] = useState<Set<number>>(new Set());
  const [yopiqF, setYopiqF] = useState<Set<string>>(new Set());
  const [filtr, setFiltr] = useState<'hammasi' | 'hal' | 'muammo' | 'boglanmagan'>('hal');
  const [q, setQ] = useState('');
  const [dropKey, setDropKey] = useState<string | null>(null);
  /** Sudralayotgan F2 qatori (egasi 2026-09-29: drag-and-drop aniq ko'rinsin). */
  const [sudrash, setSudrash] = useState<F2Tugun | null>(null);
  const [tanlov, setTanlov] = useState<Tanlov | null>(null);
  const [modal, setModal] = useState<{ f: F2Tugun; action: DropAction } | null>(null);
  const [xabar, setXabar] = useState<string | null>(null);
  const smetaQuti = useRef<HTMLDivElement>(null);
  const f2Quti = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const h = useMemo(() => hisobla(ind, ij), [ind, ij]);
  const shuF2 = useMemo(() => {
    const m = new Map<number, { hajm: number; uidlar: string[] }>();
    for (const [uid, b] of ij.bog) {
      const t = ind.byUid.get(uid);
      if (!t || ij.otkaz.has(uid)) continue;
      const x = m.get(b.qatorId) ?? { hajm: 0, uidlar: [] };
      x.hajm += t.hajm ?? 0; x.uidlar.push(uid);
      m.set(b.qatorId, x);
    }
    return m;
  }, [ij, ind]);
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
        sourceQuantity: t.hajm,
        referenceUnitPrice: target?.narx ?? null,
      };
    })), [p.akt.jami.pryamye, ind, ij, S]);

  const f2ExpandableDepths = useMemo(() => expandableDepths(p.akt.daraxt, (node) => node.bolalar), [p.akt.daraxt]);
  const smetaRoots = useMemo(() => S.bolalar.get(null) ?? [], [S]);
  const smetaExpandableDepths = useMemo(() => expandableDepths(smetaRoots, (node) => S.bolalar.get(node.id) ?? []), [S, smetaRoots]);
  const f2VisibleRows = useMemo(() => {
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
      const over = remaining != null && used > remaining + 1e-9;
      const unbound = state === 'topilmadi' || (!binding && state !== 'otkazildi');
      const unresolved = state === 'topilmadi' || state === 'taklif';
      const missingValue = node.barg && (node.hajm == null || node.summa == null);
      if (filtr === 'hal') return unresolved;
      if (filtr === 'boglanmagan') return unbound;
      return unresolved || !!node.ogohlantirish?.length || duplicate || over || !!missingValue;
    };
    return flattenVisibleTree(p.akt.daraxt, (node) => node.bolalar, (node) => node.uid,
      matches, (uid) => !yopiqF.has(String(uid)));
  }, [p.akt.daraxt, filtr, ij, h.kopBog, S, shuF2, yopiqF, p.oldingi]);
  const qidir = q.trim().toUpperCase();
  const qidiruvNatija = useMemo(() => {
    if (qidir.length < 2) return null;
    const out: SmetaQator[] = [];
    for (const s of S.byId.values()) {
      if (s.tur === 'rz') continue;
      if (((s.kod ?? '') + ' ' + (s.nom ?? '')).toUpperCase().includes(qidir)) { out.push(s); if (out.length >= 500) break; }
    }
    return out;
  }, [qidir, S]);
  const smetaVisibleRows = useMemo(() => qidiruvNatija
    ? qidiruvNatija.map((node) => ({ node, depth: 0 }))
    : flattenVisibleTree(smetaRoots, (node) => S.bolalar.get(node.id) ?? [], (node) => node.id,
      () => true, (id) => ochiqS.has(Number(id))), [qidiruvNatija, smetaRoots, S, ochiqS]);
  const f2Virtual = useVirtualizer({ count: f2VisibleRows.length, getScrollElement: () => f2Quti.current, estimateSize: () => 38, overscan: 12 });
  const smetaVirtual = useVirtualizer({ count: smetaVisibleRows.length, getScrollElement: () => smetaQuti.current, estimateSize: () => 38, overscan: 12 });

  // Har ikki daraxt birinchi ochilganda to'liq ochiq; keyin operator har sathni alohida boshqaradi.
  useEffect(() => {
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
  useEffect(() => {
    if (!tTugun) return;
    const b = ij.bog.get(tTugun.uid);
    const ids = [b?.qatorId, ...nomzodlar.slice(0, 3).map((n) => n.qatorId)].filter((x): x is number => x != null);
    if (!ids.length) return;
    setOchiqS((old) => {
      const s = new Set(old);
      for (const id of ids) for (let t = S.byId.get(id); t && t.otaId != null; t = S.byId.get(t.otaId)) s.add(t.otaId);
      return s;
    });
    const fokus = ids[0];
    requestAnimationFrame(() => {
      const el = smetaQuti.current?.querySelector(`[data-sid="${fokus}"]`);
      if (el && 'scrollIntoView' in el) (el as HTMLElement).scrollIntoView({ block: 'center' });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tanlangan]);

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
    if (p.disabled) return;
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
      if (s.tur === 'rz') { ochModal(f, { kind: 'additional', parent: p.raw.get(s.id)! }); return; }
      if (sRes) { xab('Ishni smeta ISHIGA (bog‘lash/zamena) yoki RAZDELGA (qo‘shimcha ish) torting.'); return; }
      if (oshaQatormi(f, s) || (nomzodBallOf(f.uid, s.id) ?? -1) >= 45) { ishBogla(f, s.id); return; }
      setTanlov({ f, s, tur: 'ish' });
      return;
    }
    // resurs
    if (s.tur === 'bl') { ochModal(f, { kind: 'resource', parent: p.raw.get(s.id)! }); return; }
    if (s.tur === 'rz') { xab('Resursni smeta RESURSIGA (bog‘lash/zamena) yoki smeta ISHIGA (qo‘shimcha resurs) torting.'); return; }
    if (oshaQatormi(f, s)) { p.onIj(bogla(ij, f.uid, s.id)); xab(`«${f.nom.slice(0, 50)}» bog‘landi.`); return; }
    setTanlov({ f, s, tur: 'resurs' });
  }
  function nomzodBallOf(uid: string, sId: number) {
    const n = p.natija.natijalar.get(uid)?.nomzodlar.find((x) => x.qatorId === sId);
    return n && !n.qavatlar.some((qv) => (qv.nom === 'birlik' || qv.nom === 'marka') && qv.ball < 0) ? n.ball : undefined;
  }
  function ochModal(f: F2Tugun, action: DropAction) {
    if (!action.parent) { xab('Smeta qatori topilmadi — sahifani yangilang.'); return; }
    setModal({ f, action });
  }
  function zamena(f: F2Tugun, s: SmetaQator) {
    const oldRow = p.raw.get(s.id);
    const parent = s.otaId != null ? p.raw.get(s.otaId) : undefined;
    if (!oldRow || !parent) { xab('Zamena uchun smeta qatorining otasi topilmadi.'); return; }
    ochModal(f, { kind: 'replacement', oldRow, parent });
  }
  function keyingiHal() {
    const list = ind.qatorlar;
    const bosh = tanlangan ? list.findIndex((t) => t.uid === tanlangan) + 1 : 0;
    for (let i = 0; i < list.length; i++) {
      const t = list[(bosh + i) % list.length];
      const k = korinish(ij, t.uid);
      if (k === 'topilmadi' || k === 'taklif') {
        setTanlangan(t.uid);
        setYopiqF((old) => {
          const next = new Set(old);
          for (let parent = ind.ota.get(t.uid); parent; parent = ind.ota.get(parent.uid)) next.delete(parent.uid);
          return next;
        });
        requestAnimationFrame(() => document.querySelector(`[data-fuid="${CSS.escape(t.uid)}"]`)?.scrollIntoView({ block: 'center' }));
        return;
      }
    }
    xab('Hal qilinmagan qator qolmadi.');
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
  function scrollTanlanganPanelga(uid: string) {
    setTanlangan(uid);
    requestAnimationFrame(() => panelRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }));
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
      return (
        <div data-fuid={t.uid} className={`${F2_GRID} bg-surface-2/80 text-[12px] font-semibold text-text`}>
          <button type="button" draggable={!p.disabled}
            onDragStart={(e) => sudrashBoshla(e, t)} onDragEnd={sudrashTugadi}
            onClick={() => scrollTanlanganPanelga(t.uid)}
            className={`${KATAK} col-span-7 flex items-center text-left uppercase`} style={{ paddingLeft: 6 + depth * 14 }}
            title="Razdelni o‘ngdagi smeta razdeliga tortsangiz — shu razdel ichidan qidiriladi">
            {chevron}<span className="min-w-0 flex-1 break-words">{t.nom}</span>
          </button>
          <span className={`${SON} font-semibold`}>{fmt(rzSumma.get(t.uid) ?? null, 2)}</span>
          <span className={`${KATAK} text-[10.5px] font-normal normal-case ${d?.ok || !ishliRz ? 'text-text-mute' : 'text-warn'}`} title={sNom || undefined}>
            {d?.ok ? `→ ${sNom || 'smeta razdeli'}` : ishliRz ? 'smetada razdel topilmadi — smeta razdeliga torting' : 'guruh'}
          </span>
        </div>
      );
    }
    const k = korinish(ij, t.uid);
    const B = BELGI[k];
    const b = ij.bog.get(t.uid);
    const s = b ? S.byId.get(b.qatorId) : undefined;
    const sel = tanlangan === t.uid;
    const candidateCount = p.natija.natijalar.get(t.uid)?.nomzodlar.length ?? 0;
    const ish = t.tur === 'bl';
    // Qo'shimcha ish uchun smeta razdeli: F2 razdeli bog'langan smeta razdeli (bitta bo'lsa).
    const otaRz = ind.ota.get(t.uid);
    const rzId = otaRz ? rzDiag.get(otaRz.uid)?.smetaRzIdlar[0] : undefined;
    const tanla = () => (sel ? setTanlangan(null) : scrollTanlanganPanelga(t.uid));
    const tugma = 'tugma h-6 px-1.5 text-[11px]';
    return (
      <div data-fuid={t.uid} role="group" aria-label={`F2 ${t.tur}: ${t.nom}`}
        draggable={!p.disabled} onDragStart={(e) => sudrashBoshla(e, t)} onDragEnd={sudrashTugadi}
        title={p.disabled ? undefined : 'Sudrab o‘ngdagi smeta qatoriga tashlang: ish → ish (bog‘lash/zamena), ish → razdel (qo‘shimcha)'}
        className={`${F2_GRID} cursor-grab text-[12px] active:cursor-grabbing ${sudrash?.uid === t.uid ? 'opacity-50' : ''} ${sel ? 'bg-accent/15 outline outline-1 outline-accent' : `${QATOR_FON[k]} hover:bg-surface-2/60`} ${ish ? 'font-medium text-text' : 'text-text-dim'}`}>
        <span className={`${KATAK} flex items-start justify-center text-[13px] font-bold ${HOLAT_KATAK[k]}`} title={B.t}>{B.b}</span>
        <span className={`${KATAK} break-all font-mono text-[10.5px] text-text-mute`} title={t.kod ?? ''}>{t.kod}</span>
        <button type="button"
          onClick={tanla}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tanla(); } }}
          aria-pressed={sel}
          className={`${KATAK} cursor-grab text-left`} style={{ paddingLeft: 6 + depth * 14 }}>
          {chevron}
          {t.belgi && <span className={`mr-1 rounded px-1 text-[10px] font-semibold ${t.belgi === 'zamena' ? 'bg-warn/20 text-warn' : 'bg-accent/20 text-accent'}`}
            title={t.belgi === 'zamena' ? 'Hujjatda zamena (~) deb belgilangan' : 'Hujjatda qo‘shimcha ish (+) deb belgilangan'}>{t.belgi === 'zamena' ? '~ zamena' : '+ qo‘shimcha'}</span>}
          <span className="break-words">{t.nom}</span>
          {s && k !== 'otkazildi' && <span className="mt-0.5 block text-[10.5px] font-normal text-accent" title={s.nom ?? ''}>→ {s.nom}</span>}
          {t.ogohlantirish?.length ? <span className="mt-0.5 block text-[10.5px] font-normal text-danger">{t.ogohlantirish.join('; ')}</span> : null}
        </button>
        <span className={`${SON} text-text-mute`}>{t.norma == null ? '' : fmt(t.norma, 6)}</span>
        <span className={`${SON} text-text`}>{fmt(t.hajm)}</span>
        <span className={`${KATAK} break-words text-[11px]`}>{t.birlik ?? ''}</span>
        <span className={SON}>{t.barg && t.narx != null ? fmt(t.narx, 2) : ''}</span>
        <span className={`${SON} ${ish ? 'font-semibold text-text' : 'text-text'}`} title={t.barg ? undefined : 'Resurslari yig‘indisi'}>
          {t.barg ? fmt(t.summa, 2) : bolaSumma(t) != null ? fmt(bolaSumma(t), 2) : ''}
        </span>
        <span className={`${KATAK} flex flex-wrap items-center gap-1 font-normal`} onMouseDown={(e) => e.stopPropagation()}>
          {k === 'taklif' && <button type="button" className={`${tugma} tugma-asosiy`} disabled={p.disabled}
            onClick={() => p.onIj(tasdiqla(ij, [t.uid]))} title="Tizim taklifini tasdiqlash"><Check size={11} /> Tasdiqlash</button>}
          {k === 'topilmadi' && ish && <button type="button" className={tugma} disabled={p.disabled}
            onClick={() => scrollTanlanganPanelga(t.uid)} title="Smeta razdelidagi qaysi ish o‘rniga bajarilganini tanlang">⇄ Zamena</button>}
          {k === 'topilmadi' && ish && rzId != null && p.raw.get(rzId) && <button type="button" className={tugma} disabled={p.disabled}
            onClick={() => ochModal(t, { kind: 'additional', parent: p.raw.get(rzId)! })} title="Smetaga qo‘shimcha ish sifatida qo‘shish (resurslari bilan)">＋ Qo‘shimcha</button>}
          <button type="button" className={tugma} disabled={p.disabled}
            aria-label={`Bog‘lash variantlari: ${t.nom}`} onClick={() => scrollTanlanganPanelga(t.uid)} title="Mos smeta qatorlari va dalillari"><Link2 size={11} /> {candidateCount ? `Variant ${candidateCount}` : 'Variantlar'}</button>
          {k === 'topilmadi' && !ish && <button type="button" className={tugma} disabled={p.disabled}
            onClick={() => scrollTanlanganPanelga(t.uid)} title="O‘ngdagi smeta resursiga bog‘lash, zamena yoki qo‘shimcha resurs">Tanlash</button>}
          {b && <button type="button" className={tugma} disabled={p.disabled}
            aria-label={`Bog‘lanishni uzish: ${t.nom}`} onClick={() => p.onIj(uz(ij, t))} title="Bog‘lanishni bekor qilish"><Unlink size={11} /> Uzish</button>}
        </span>
      </div>
    );
  }

  // ── Daraxt boshqaruvi: butun daraxt yoki aynan bitta chuqurlikni ochish/yopish. ──
  function f2Sath(depth: number) {
    const ids = expandableIdsAtDepth(p.akt.daraxt, (node) => node.bolalar, (node) => node.uid, depth).map(String);
    const shouldOpen = ids.some((id) => yopiqF.has(id));
    setYopiqF((old) => { const next = new Set(old); for (const id of ids) shouldOpen ? next.delete(id) : next.add(id); return next; });
  }
  function smetaSath(depth: number) {
    const ids = expandableIdsAtDepth(smetaRoots, (node) => S.bolalar.get(node.id) ?? [], (node) => node.id, depth).map(Number);
    const shouldOpen = ids.some((id) => !ochiqS.has(id));
    setOchiqS((old) => { const next = new Set(old); for (const id of ids) shouldOpen ? next.add(id) : next.delete(id); return next; });
  }
  function smetaBarchasiniOch() {
    setOchiqS(smetaExpandableDepths.reduce((expanded, depth) => {
      for (const id of expandableIdsAtDepth(smetaRoots, (node) => S.bolalar.get(node.id) ?? [], (node) => node.id, depth)) expanded.add(Number(id));
      return expanded;
    }, new Set<number>()));
  }

  // ── O'ng: smeta daraxti ──

  function sudrashBoshla(e: React.DragEvent, t: F2Tugun) {
    e.dataTransfer.setData('text/plain', t.uid);
    e.dataTransfer.effectAllowed = 'link';
    // Tanlov (yuqoridagi panel) sudrash paytida O'ZGARMAYDI — aks holda panel ochilib jadvalni
    // pastga suradi va nishon qo'l ostidan qochadi (egasi sinovi 2026-09-29). Tashlangach tanlanadi.
    setSudrash(t);
  }
  function sudrashTugadi() { setSudrash(null); setDropKey(null); }
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
  function dropProps(s: SmetaQator) {
    const key = 's' + s.id;
    return {
      onDragOver: (e: React.DragEvent) => { if (p.disabled) return; e.preventDefault(); e.dataTransfer.dropEffect = 'link'; if (dropKey !== key) setDropKey(key); },
      onDragLeave: () => { if (dropKey === key) setDropKey(null); },
      onDrop: (e: React.DragEvent) => { e.preventDefault(); setDropKey(null); setSudrash(null); const uid = e.dataTransfer.getData('text/plain'); if (uid) { setTanlangan(uid); tashla(uid, s.id); } },
    };
  }
  function smetaQator(s: SmetaQator, depth: number, tekis = false): React.ReactNode {
    const bolalar = S.bolalar.get(s.id) ?? [];
    const ochiq = !tekis && ochiqS.has(s.id);
    const percent = tTugun ? nomzodFoiz.get(s.id) : undefined;
    const band = shuF2.get(s.id);
    const tBog = tTugun ? ij.bog.get(tTugun.uid)?.qatorId === s.id : false;
    const drop = dropKey === 's' + s.id;
    const toggle = () => setOchiqS((x) => { const n = new Set(x); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; });
    const chevron = bolalar.length > 0
      ? <button type="button" aria-label={ochiq ? `Smeta qatorini yopish: ${s.nom}` : `Smeta qatorini ochish: ${s.nom}`} onClick={(e) => { e.stopPropagation(); toggle(); }} className="mr-1 shrink-0 align-middle text-text-mute">
          {ochiq ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
      : null;
    const tugma = 'tugma h-6 px-1.5 text-[11px]';
    if (s.tur === 'rz') {
      return (
        <div data-sid={s.id} {...dropProps(s)} className={`${S_GRID} text-[12px] font-semibold text-text ${drop ? 'bg-amber-500/25 outline outline-2 outline-amber-500' : mosNishon(s) ? 'bg-surface-2/80 outline-dashed outline-1 outline-accent/60' : 'bg-surface-2/80'}`}>
          <button type="button" className={`${KATAK} col-span-7 flex items-center text-left uppercase`} style={{ paddingLeft: 6 + depth * 14 }}
            onClick={() => tTugun ? tashla(tTugun.uid, s.id) : toggle()} title={tTugun ? 'Tanlangan F2 qatorini shu smeta razdeliga bog‘lash/qo‘shimcha qilish' : undefined}>
            {chevron}<span className="min-w-0 flex-1 break-words">{s.nom}</span>
            <span className="ml-2 shrink-0 text-[10px] font-normal normal-case text-text-mute">{bolalar.length} ichki qator</span>
          </button>
          <span className={`${KATAK} font-normal`}>
            {tTugun?.tur === 'bl' && <button type="button" className={tugma} disabled={p.disabled}
              onClick={() => tashla(tTugun.uid, s.id)} title="Tanlangan F2 ishini shu razdelga qo‘shimcha ish sifatida qo‘shish">＋ Qo‘shimcha</button>}
          </span>
        </div>
      );
    }
    const old = p.oldingi.get(s.id) ?? 0;
    const qoldiq = s.hajm != null ? s.hajm - old - (band?.hajm ?? 0) : null;
    const yangi = p.raw.get(s.id);
    const ish = s.tur === 'bl';
    return (
      <div data-sid={s.id} {...dropProps(s)} className={`${S_GRID} text-[12px] ${ish ? 'font-medium text-text' : 'text-text-dim'} `
        + (drop ? 'bg-amber-500/25 outline outline-2 outline-amber-500' : mosNishon(s) ? 'outline-dashed outline-1 outline-accent/50 hover:bg-accent/10' : tBog ? 'bg-accent/15 outline outline-1 outline-accent' : band ? 'bg-ok/[0.07] hover:bg-surface-2/60' : 'hover:bg-surface-2/60')}>
        <span className={`${KATAK} break-all font-mono text-[10.5px] text-text-mute`} title={s.kod ?? ''}>{s.kod}</span>
        <button type="button" className={`${KATAK} text-left`} style={{ paddingLeft: 6 + depth * 14 }} onClick={() => { if (tTugun) tashla(tTugun.uid, s.id); }}
          title={tTugun ? 'Tanlangan F2 qatorini shu yerga bog‘lash yoki o‘zgarish sifatida kiritish' : undefined}>
          {chevron}
          {percent != null && <span className="mr-1 rounded bg-warn/20 px-1 text-[10px] font-semibold text-warn" title="Moslik indeksi — ehtimollik emas">{percent}%</span>}
          <span className="break-words">{s.nom}</span>
          {(yangi?.qoshimcha || yangi?.zamena) && <span className="ml-1 rounded bg-accent/20 px-1 text-[10px] font-semibold text-accent">{yangi.zamena ? 'zamena' : 'qo‘shimcha'}</span>}
          {tekis && <span className="mt-0.5 block text-[10.5px] font-normal text-text-mute">{yolMatn(s)}</span>}
          {(old > 0 || band) && <span className="mt-0.5 block text-[10.5px] font-normal text-text-mute">
            oldin F2 {fmt(old)}{band && <span className="ml-1 text-ok">· shu F2 {fmt(band.hajm)}{band.uidlar.length > 1 ? ` (${band.uidlar.length} qism)` : ''}</span>}
          </span>}
        </button>
        <span className={`${SON} text-text-mute`}>{s.norma == null ? '' : fmt(s.norma, 6)}</span>
        <span className={`${SON} text-text`}>{fmt(s.hajm)}</span>
        <span className={`${KATAK} break-words text-[11px]`}>{s.birlik ?? ''}</span>
        <span className={SON}>{s.narx ? fmt(s.narx, 2) : ''}</span>
        <span className={`${SON} ${qoldiq != null && qoldiq < -1e-9 ? 'bg-danger/20 font-semibold text-danger' : 'text-text-dim'}`}>{qoldiq == null ? '' : fmt(qoldiq)}</span>
        <span className={`${KATAK} flex flex-wrap items-center gap-1 font-normal`} onMouseDown={(e) => e.stopPropagation()}>
          {tTugun && (tBog
            ? <button type="button" className={tugma} disabled={p.disabled} onClick={() => p.onIj(uz(ij, tTugun))}><Unlink size={11} /> Uzish</button>
            : <button type="button" className={tugma} disabled={p.disabled} onClick={() => tashla(tTugun.uid, s.id)}><Link2 size={11} /> Bog‘lash</button>)}
        </span>
      </div>
    );
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
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-start gap-2">
          <span className={`text-lg font-bold leading-none ${BELGI[k].cls}`}>{BELGI[k].b}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-text">{tTugun.kod && <span className="mr-1 font-mono text-text-mute">{tTugun.kod}</span>}{tTugun.nom}</p>
            <p className="text-[11px] text-text-dim">
              {tTugun.tur === 'bl' ? 'Ish' : 'Resurs'} · {fmt(tTugun.hajm)} {tTugun.birlik ?? ''}{tTugun.narx != null ? ` × ${fmt(tTugun.narx, 2)}` : ''}{tTugun.summa != null ? ` = ${fmt(tTugun.summa, 2)}` : ''}
              {' · '}{tTugun.manzil.varaq}!{tTugun.manzil.qator}
            </p>
            {s && <p className="text-[11px] text-accent">→ {s.kod ? s.kod + ' ' : ''}{s.nom} ({s.birlik ?? '—'}) <span className="text-text-mute">[{b!.usul}]</span></p>}
            {r?.sabab && k !== 'qolda' && <p className="text-[11px] text-text-mute">{r.sabab}</p>}
          </div>
          <div className="flex flex-wrap gap-1">
            {k === 'taklif' && <button type="button" className="tugma tugma-asosiy h-7 px-2 text-[12px]" onClick={() => p.onIj(tasdiqla(ij, [tTugun.uid]))}><Check size={13} /> Tasdiqlash</button>}
            {b && <button type="button" className="tugma h-7 px-2 text-[12px]" onClick={() => p.onIj(uz(ij, tTugun))}><Unlink size={13} /> Uzish</button>}
            <button type="button" className="tugma h-7 px-2 text-[12px]" onClick={() => p.onIj(otkazibYubor(ij, tTugun, k !== 'otkazildi'))}>
              <SkipForward size={13} /> {k === 'otkazildi' ? 'Aktga qaytarish' : 'Aktga kiritmaslik'}
            </button>
          </div>
        </div>
        {nomzodlar.length > 0 && (
          <div className="max-h-48 overflow-auto rounded border border-border/60">
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
                  <button type="button" className="tugma h-6 shrink-0 px-1.5 text-[11px]" disabled={p.disabled || !p.raw.get(rzId)}
                    onClick={() => ochModal(tTugun, { kind: 'additional', parent: p.raw.get(rzId)! })}>＋ Qo‘shimcha ish</button>
                </div>
                <div className="max-h-56 overflow-auto">
                  {ishlar.map((x) => (
                    <div key={x.id} className="flex items-center gap-2 border-b border-border/30 px-2 py-1 text-[11.5px] last:border-0">
                      <span className="min-w-0 flex-1 truncate" title={x.nom ?? ''}>{x.kod && x.kod.length > 2 && <span className="mr-1 font-mono text-text-mute">{x.kod.split(/\s+/)[0]}</span>}{x.nom}</span>
                      <SonUstunlari norma={x.norma} miqdor={x.hajm} birlik={x.birlik} narx={x.narx} oxirgi="" />
                      <button type="button" className="tugma h-6 shrink-0 px-1.5 text-[11px]" disabled={p.disabled} onClick={() => zamena(tTugun, x)} title="F2 ishi smetadagi shu ish o‘rniga bajarilgan">⇄ Zamena</button>
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

  const halSoni = h.topilmadi + h.taklif;
  return (
    <div className="space-y-2">
      <div className="karta space-y-2 p-2 text-[12px]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span><b className="text-ok">✓ {h.tayyor}</b> tasdiqlangan bog‘lanish</span>
          <span><b className="text-warn">◐ {h.taklif}</b> operator tasdig‘ini kutmoqda</span>
          <span><b className="text-danger">✕ {h.topilmadi}</b> topilmadi</span>
          <span><b className="text-text-mute">– {h.otkazildi}</b> ataylab chiqarilgan</span>
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
                  ['F2 hujjat jami', jami, 'text-text', [reconciliation.sourceAmount.complete ? '' : `${reconciliation.sourceAmount.unknownCount} ta qator summasi noma’lum`, reconciliation.declaredDocumentAmount != null ? `hujjat ИТОГО ПРЯМЫЕ: ${fmt(reconciliation.declaredDocumentAmount, 2)}${reconciliation.sourceVsDeclaredDifference != null && Math.abs(reconciliation.sourceVsDeclaredDifference) >= 0.005 ? ` · farq ${fmt(reconciliation.sourceVsDeclaredDifference, 2)}` : ' ✓'}` : ''].filter(Boolean).join(' · ')],
                  ['✓ Bog‘langan', ok, 'text-ok', `${fmt(ulush(ok), 1)} %`],
                  ['◐ Tasdiq kutmoqda', taklif, 'text-warn', `${fmt(ulush(taklif), 1)} %`],
                  ['✕ Bog‘lanmagan', yoq, 'text-danger', `${fmt(ulush(yoq), 1)} % — zamena / qo‘shimcha`],
                ].map(([t, v, c, iz]) => (
                  <div key={t as string} className="rounded-md bg-surface-2/50 px-2 py-1.5">
                    <span className="block text-[10.5px] text-text-mute">{t}</span>
                    <b className={`block tabular-nums text-[14px] ${c}`}>{fmt(v as number, 2)}</b>
                    {iz ? <span className="block text-[10px] text-text-mute">{iz}</span> : null}
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
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2">
          {([
            ['hal', `Tekshirilmagan (${halSoni})`], ['boglanmagan', 'Bog‘lanmagan'], ['muammo', 'Muammoli'], ['hammasi', 'Barcha qatorlar'],
          ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filtr === value}
            className={`tugma h-7 px-2 text-[11px] ${filtr === value ? 'tugma-asosiy' : ''}`} onClick={() => setFiltr(value)}>{label}</button>)}
          <span className="ml-auto text-[10px] text-text-mute">{f2VisibleRows.length.toLocaleString('ru-RU')} qator ko‘rinmoqda</span>
        </div>
      </div>

      <div className="karta p-2" ref={panelRef}><Panel /></div>
      {xabar && (
        <p role="status" className="flex items-start gap-2 text-[12px] text-text-dim">
          <span className="flex-1">{xabar}</span>
          <button type="button" aria-label="Yopish" onClick={() => setXabar(null)}><X size={13} /></button>
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <section className="karta flex min-h-0 flex-col overflow-hidden" aria-label="F2 akt">
          <header className="border-b border-border bg-surface-2/60 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-dim">
            F2 akt — {p.akt.varaq} {filtr === 'hal' && halSoni === 0 ? '· hammasi tekshirilgan' : ''}
          </header>
          <TreeControls depths={f2ExpandableDepths} onOpenAll={f2BarchasiniOch} onCloseAll={f2BarchasiniYop} onToggleDepth={f2Sath} />
          <div ref={f2Quti} className="h-[66vh] overflow-auto">
            <div className="min-w-[1080px] border-l border-t border-border/70">
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
            {filtr === 'hal' && halSoni === 0 && <p className="p-3 text-center text-[12px] text-ok">Tekshirilmagan qator qolmadi. „Barcha qatorlar“ filtrida qayta ko‘rishingiz mumkin.</p>}
            {filtr !== 'hammasi' && !f2VisibleRows.length && <p className="p-3 text-center text-[12px] text-text-mute">Bu filtr bo‘yicha qator topilmadi.</p>}
          </div>
        </section>
        <section className="karta flex min-h-0 flex-col overflow-hidden" aria-label="Smeta">
          <header className="flex items-center gap-2 border-b border-border bg-surface-2/60 px-2 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">Smeta (LRV)</span>
            <div className="relative flex-1">
              <Search size={12} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-text-mute" />
              <input aria-label="Smetadan qidirish" value={q} onChange={(e) => setQ(e.target.value)} placeholder="shifr yoki nom…"
                className="input h-7 w-full pl-5 pr-1.5 text-[12px]" />
            </div>
          </header>
          <TreeControls depths={qidiruvNatija ? [] : smetaExpandableDepths} onOpenAll={smetaBarchasiniOch} onCloseAll={smetaBarchasiniYop} onToggleDepth={smetaSath} />
          {sudrash && <div className="border-b border-accent/40 bg-accent/15 px-2 py-1 text-[11.5px] text-text" role="status">
            <b>«{sudrash.nom.slice(0, 60)}»</b> — {sudrash.tur === 'rz' ? 'smeta RAZDELIGA tashlang (razdel o‘rgatiladi)'
              : sudrash.tur === 'bl' ? 'smeta ISHIGA tashlang (bog‘lash yoki zamena) yoki RAZDELGA (qo‘shimcha ish)'
                : 'smeta RESURSIGA (bog‘lash/zamena) yoki ISHIGA (qo‘shimcha resurs) tashlang'}. Punktir ramka — mos joylar.
          </div>}
          <div ref={smetaQuti} className="h-[66vh] overflow-auto" onDragOver={avtoAylantir}>
            <div className="min-w-[960px] border-l border-t border-border/70">
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
            <div className="grid gap-2">
              <button type="button" className="tugma justify-start text-left" onClick={() => {
                const { f, s } = tanlov; setTanlov(null);
                if (f.tur === 'bl') ishBogla(f, s.id); else { p.onIj(bogla(ij, f.uid, s.id)); xab('Bog‘landi.'); }
              }}>
                <Link2 size={14} /> <span><b>Bog‘lash</b> — bu o‘sha {tanlov.tur === 'ish' ? 'ish' : 'resurs'} (nomi/shifri boshqacha yozilgan)</span>
              </button>
              <button type="button" className="tugma justify-start text-left" onClick={() => { const { f, s } = tanlov; setTanlov(null); zamena(f, s); }}>
                <span>⇄</span> <span><b>{tanlov.tur === 'ish' ? 'Zamena ish' : 'Zamena material'}</b> — smetadagi qator o‘rniga F2 dagisi bajarilgan (yangi qator, eskisi o‘zgarmaydi)</span>
              </button>
              {tanlov.tur === 'ish' && tanlov.s.otaId != null && (
                <button type="button" className="tugma justify-start text-left" onClick={() => { const { f, s } = tanlov; setTanlov(null); ochModal(f, { kind: 'additional', parent: p.raw.get(s.otaId!)! }); }}>
                  <span>＋</span> <span><b>Qo‘shimcha ish</b> — smetada yo‘q ish, shu razdelga qo‘shiladi</span>
                </button>
              )}
              <button type="button" className="tugma" onClick={() => setTanlov(null)}>Bekor qilish</button>
            </div>
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
          onClose={() => setModal(null)}
          resurslar={modal.f.tur === 'bl' ? modal.f.bolalar.map((r) => ({ tur: resTuri(r.birlik), nom: r.nom, birlik: r.birlik || 'шт', hajm: r.hajm, kod: r.kod })) : undefined}
          onCreated={(id, resIdlar) => { const f = modal.f; setModal(null); void p.onYaratildi(f, id, resIdlar); }}
        />
      )}
    </div>
  );
}
