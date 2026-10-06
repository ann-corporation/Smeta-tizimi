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
import { saqlanmaganIsh } from '../../_shared/versiya';

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
const F2_GRID = 'grid grid-cols-[30px_minmax(84px,120px)_minmax(260px,1fr)_72px_88px_68px_96px_118px_250px]';
const S_GRID = 'grid grid-cols-[minmax(84px,120px)_minmax(260px,1fr)_72px_88px_68px_96px_100px_112px]';
const KATAK = 'border-b border-r border-border/70 px-1.5 py-1';
/** Amal ustuni gorizontal aylantirishda ham o'ngda ko'rinib turadi (egasi sinovi: tugmalar kesilib qolardi). */
const AMAL_YOPISHQOQ = 'sticky right-0 z-[1] bg-surface-1 shadow-[-6px_0_6px_-6px_rgba(0,0,0,.6)]';
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
      <span className={`${u} ${AMAL_YOPISHQOQ} bg-surface-2`}>Amal</span>
    </div>
  );
}

/** Nomlarni solishtirish: registr, Ё/Е va bo'shliq farqi hisobga olinmaydi. */
const nomKalit = (x: string | null | undefined) => (x ?? '').toUpperCase().replace(/Ё/g, 'Е').replace(/\s+/g, ' ').trim();

export function F2V3Workbench(p: F2V3WorkbenchProps) {
  const { ind, S, ij } = p;
  const [tanlangan, setTanlangan] = useState<string | null>(null);
  const [ochiqS, setOchiqS] = useState<Set<number>>(new Set());
  const [yopiqF, setYopiqF] = useState<Set<string>>(new Set());
  // PTO birinchi kirganda butun manba daraxtini ko'radi. Virtualizatsiya katta
  // hujjatda DOM hajmini cheklaydi; filtrni operator keyin ongli ravishda tanlaydi.
  const [filtr, setFiltr] = useState<'hammasi' | 'hal' | 'muammo' | 'boglanmagan'>('hammasi');
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
  useEffect(() => { saqlanmaganIsh('f2-import', !p.disabled); return () => saqlanmaganIsh('f2-import', false); }, [p.disabled]);
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
  useEffect(() => {
    if (!tTugun) return;
    if (sudrabTanlandi.current) { sudrabTanlandi.current = false; return; }
    const b = ij.bog.get(tTugun.uid);
    const ids = [b?.qatorId, ...nomzodlar.slice(0, 3).map((n) => n.qatorId)].filter((x): x is number => x != null);
    if (!ids.length) return;
    setOchiqS((old) => {
      const s = new Set(old);
      for (const id of ids) for (let t = S.byId.get(id); t && t.otaId != null; t = S.byId.get(t.otaId)) s.add(t.otaId);
      return s;
    });
    smetaFokus.current = ids[0];
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
      if (s.tur === 'rz') { ochModal(f, { kind: 'additional', parent: p.raw.get(s.id)!, keyinId: s.id }); return; }
      if (sRes) { xab('Ishni smeta ISHIGA (bog‘lash/zamena) yoki RAZDELGA (qo‘shimcha ish) torting.'); return; }
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
        f2Fokus.current = t.uid;
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
            {d?.ok ? `→ ${sNom || 'smeta bo‘limi'}` : ishliRz ? 'bo‘lim ulanmagan — mos smeta bo‘limiga torting' : 'guruh'}
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
        draggable={!p.disabled} onDragStart={(e) => sudrashBoshla(e, t)} onDragEnd={sudrashTugadi}
        title={p.disabled ? undefined : 'Sudrab o‘ngdagi smeta qatoriga tashlang: ish → ish (bog‘lash/zamena), ish → razdel (qo‘shimcha)'}
        className={`${F2_GRID} cursor-grab text-[12px] active:cursor-grabbing ${sudrash?.uid === t.uid ? 'opacity-50' : ''} ${sel ? 'bg-accent/15 outline outline-1 outline-accent' : `${QATOR_FON[k]} hover:bg-surface-2/60`} ${ish ? 'font-medium text-text' : 'text-text-dim'}`}>
        <span className={`${KATAK} flex items-start justify-center text-[13px] font-bold ${HOLAT_KATAK[k]}`} title={B.t}>{B.b}</span>
        <span className={`${KATAK} overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10.5px] text-text-mute`} title={t.kod ?? ''}>{t.kod}</span>
        <button type="button"
          onClick={tanla}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tanla(); } }}
          aria-pressed={sel}
          className={`${KATAK} cursor-grab text-left`} style={{ paddingLeft: 6 + depth * 14 }}>
          {chevron}
          {t.belgi && <span className={`mr-1 rounded px-1 text-[10px] font-semibold ${t.belgi === 'zamena' ? 'bg-warn/20 text-warn' : 'bg-accent/20 text-accent'}`}
            title={t.belgi === 'zamena' ? 'Hujjatda zamena (~) deb belgilangan' : 'Hujjatda qo‘shimcha ish (+) deb belgilangan'}>{t.belgi === 'zamena' ? '~ zamena' : '+ qo‘shimcha'}</span>}
          <span className="break-words">{t.nom}</span>
          {/* Bog'langan smeta nomi faqat F2 nomidan FARQ qilsa (aks holda ✓ yetarli) va bitta qatorda — qator balandligi ikki baravar oshmaydi. */}
          {s && k !== 'otkazildi' && nomKalit(s.nom) !== nomKalit(t.nom) && <span className="mt-0.5 block truncate text-[10.5px] font-normal text-accent" title={s.nom ?? ''}>→ {s.nom}</span>}
          {!s && tavsiya && <span className="mt-0.5 block text-[10.5px] font-normal text-warn">{tavsiya.tur === 'zamena' ? `⇄ zamena taklifi: «${tavsiyaS?.nom ?? ''}» o‘rniga` : '＋ smeta ishida mos resurs yo‘q — qo‘shimcha resurs'}</span>}
          {t.ogohlantirish?.length ? <span className="mt-0.5 block text-[10.5px] font-normal text-danger">{t.ogohlantirish.join('; ')}</span> : null}
        </button>
        <span className={`${SON} text-text-mute`}>{t.norma == null ? '' : fmt(t.norma, 6)}</span>
        <span className={`${SON} text-text`}>{fmt(t.hajm)}</span>
        <span className={`${KATAK} break-words text-[11px]`}>{t.birlik ?? ''}</span>
        <span className={SON}>{t.barg && t.narx != null ? fmt(t.narx, 2) : ''}</span>
        <span className={`${SON} ${ish ? 'font-semibold text-text' : 'text-text'}`} title={t.barg ? undefined : 'Resurslari yig‘indisi'}>
          {t.barg ? fmt(t.summa, 2) : bolaSumma(t) != null ? fmt(bolaSumma(t), 2) : ''}
        </span>
        <span className={`${KATAK} ${AMAL_YOPISHQOQ} flex flex-wrap items-center gap-1 font-normal`} onMouseDown={(e) => e.stopPropagation()}>
          {k === 'taklif' && <button type="button" className={`${tugma} tugma-asosiy`} disabled={p.disabled}
            onClick={() => p.onIj(tasdiqla(ij, [t.uid]))} title="Tizim taklifini tasdiqlash"><Check size={11} /> Tasdiqlash</button>}
          {k === 'topilmadi' && ish && <button type="button" className={tugma} disabled={p.disabled}
            onClick={() => scrollTanlanganPanelga(t.uid)} title="Smeta razdelidagi qaysi ish o‘rniga bajarilganini tanlang">⇄ Zamena</button>}
          {k === 'topilmadi' && ish && rzId != null && p.raw.get(rzId) && <button type="button" className={tugma} disabled={p.disabled}
            onClick={() => ochModal(t, { kind: 'additional', parent: p.raw.get(rzId)!, keyinId: oldingiKeyin() })} title="Smetaga qo‘shimcha ish (resurslari bilan) — F2 dagi tartibda, oldingi bog‘langan ishdan keyin">＋ Qo‘shimcha</button>}
          <button type="button" className={tugma} disabled={p.disabled}
            aria-label={`Bog‘lash variantlari: ${t.nom}`} onClick={() => scrollTanlanganPanelga(t.uid)} title="Mos smeta qatorlari va dalillari"><Link2 size={11} /> {candidateCount ? `Variant ${candidateCount}` : 'Variantlar'}</button>
          {k === 'topilmadi' && !ish && tavsiyaS && <button type="button" className={`${tugma} tugma-asosiy`} disabled={p.disabled}
            onClick={() => zamena(t, tavsiyaS)} title={`Smetadagi «${tavsiyaS.nom ?? ''}» o‘rniga (zamena resurs) — aynan uning ortidan joylashadi`}>⇄ Zamena</button>}
          {k === 'topilmadi' && !ish && otaSmetaIsh != null && p.raw.get(otaSmetaIsh) && <button type="button" className={`${tugma} ${tavsiya?.tur === 'qoshimcha' ? 'tugma-asosiy' : ''}`} disabled={p.disabled}
            onClick={() => ochModal(t, { kind: 'resource', parent: p.raw.get(otaSmetaIsh)!, keyinId: resursKeyin() })} title="Smeta ishiga qo‘shimcha resurs — F2 dagi tartibda">＋ Resurs</button>}
          {k === 'topilmadi' && !ish && otaSmetaIsh == null && <button type="button" className={tugma} disabled={p.disabled}
            onClick={() => scrollTanlanganPanelga(t.uid)} title="Avval ishini bog‘lang">Tanlash</button>}
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
        if (p.disabled) return;
        e.preventDefault(); e.dataTransfer.dropEffect = 'link';
        const key = `s${s.id}:${zonaOl(e)}`;
        if (dropKey !== key) setDropKey(key);
      },
      onDragLeave: () => { if (dropKey?.startsWith(`s${s.id}:`)) setDropKey(null); },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const zona = zonaOl(e);
        setDropKey(null); setSudrash(null);
        const uid = e.dataTransfer.getData('text/plain');
        if (!uid) return;
        // Sudrab tashlanganda smeta oynasi O'Z JOYIDA qoladi (egasi: "boshqa joyga ketib qoladi").
        sudrabTanlandi.current = true;
        setTanlangan(uid);
        if (zona === 'ustiga') tashla(uid, s.id); else oraliqqaTashla(uid, s, zona);
      },
    };
  }
  /** Oraliqqa tashlash: qo'shimcha ish / resurs aynan shu ikki qator orasiga (langar = yuqoridagi qator). */
  function oraliqqaTashla(fUid: string, s: SmetaQator, zona: 'oldin' | 'keyin') {
    if (p.disabled) return;
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
  function smetaQator(s: SmetaQator, depth: number, tekis = false): React.ReactNode {
    const bolalar = S.bolalar.get(s.id) ?? [];
    const ochiq = !tekis && ochiqS.has(s.id);
    const percent = tTugun ? nomzodFoiz.get(s.id) : undefined;
    const band = shuF2.get(s.id);
    const tBog = tTugun ? ij.bog.get(tTugun.uid)?.qatorId === s.id : false;
    const drop = dropKey === `s${s.id}:ustiga`;
    // Oraliq nishoni: qatorlar ORASIDA qalin sariq chiziq (qo'shimcha aynan shu joyga).
    const oraliq = dropKey === `s${s.id}:oldin` ? ' shadow-[inset_0_3px_0_0_rgb(245,158,11)]'
      : dropKey === `s${s.id}:keyin` ? ' shadow-[inset_0_-3px_0_0_rgb(245,158,11)]' : '';
    const toggle = () => setOchiqS((x) => { const n = new Set(x); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; });
    const chevron = bolalar.length > 0
      ? <button type="button" aria-label={ochiq ? `Smeta qatorini yopish: ${s.nom}` : `Smeta qatorini ochish: ${s.nom}`} onClick={(e) => { e.stopPropagation(); toggle(); }} className="mr-1 shrink-0 align-middle text-text-mute">
          {ochiq ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
      : null;
    const tugma = 'tugma h-6 px-1.5 text-[11px]';
    if (s.tur === 'rz') {
      return (
        <div data-sid={s.id} {...dropProps(s)} className={`${S_GRID} text-[12px] font-semibold text-text ${drop ? 'bg-amber-500/25 outline outline-2 outline-amber-500' : mosNishon(s) ? 'bg-surface-2/80 outline-dashed outline-1 outline-accent/60' : 'bg-surface-2/80'}${oraliq}`}>
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
        + (drop ? 'bg-amber-500/25 outline outline-2 outline-amber-500' : mosNishon(s) ? 'outline-dashed outline-1 outline-accent/50 hover:bg-accent/10' : tBog ? 'bg-accent/15 outline outline-1 outline-accent' : band ? 'bg-ok/[0.07] hover:bg-surface-2/60' : 'hover:bg-surface-2/60') + oraliq}>
        <span className={`${KATAK} overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10.5px] text-text-mute`} title={s.kod ?? ''}>{s.kod}</span>
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
        <span className={`${KATAK} ${AMAL_YOPISHQOQ} flex flex-wrap items-center gap-1 font-normal`} onMouseDown={(e) => e.stopPropagation()}>
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
    const ota = ind.ota.get(tTugun.uid);
    const otaBoglangan = ota ? ij.bog.has(ota.uid) : false;
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-start gap-2">
          <span className={`text-lg font-bold leading-none ${BELGI[k].cls}`}>{BELGI[k].b}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-text">{tTugun.kod && <span className="mr-1 font-mono text-text-mute">{tTugun.kod}</span>}{tTugun.nom}</p>
            <p className="text-[11px] text-text-dim">
              {f2QatorTuriYorlig(tTugun.tur)} · {fmt(tTugun.hajm)} {tTugun.birlik ?? ''}{tTugun.narx != null ? ` × ${fmt(tTugun.narx, 2)}` : ''}{tTugun.summa != null ? ` = ${fmt(tTugun.summa, 2)}` : ''}
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
                return (
                  <div key={r.uid} className={`grid min-w-[860px] grid-cols-[28px_minmax(200px,1fr)_110px_minmax(200px,1fr)_110px_170px] text-[11.5px] ${QATOR_FON[rk]}`}>
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
          <span title="Moslik dvigateli dalillar bo‘yicha avtomatik topdi; bu operator tekshiruvi degani emas."><b className="text-ok">✓ {h.tizimTopdi}</b> tizim mos topdi</span>
          <span title="Avvalgi davrda tasdiqlangan bog‘lanish xotirasidan olindi."><b className="text-ok">↻ {h.avvalgiQaror}</b> oldingi qaror</span>
          <span title="Bu qatorni operator qo‘lda bog‘ladi yoki taklifni tasdiqladi."><b className="text-ok">✋ {h.operatorTasdiqladi}</b> operator tasdiqladi</span>
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

      {manbaTekshiruvi.length > 0 && (
        <section role="alert" aria-label="F2 faylini o‘qish tekshiruvi" className="karta space-y-1.5 border border-warn/50 p-3 text-[12px]">
          <p className="font-semibold text-warn">F2 faylida {manbaTekshiruvi.length} ta qator yoki sarlavha qo‘lda tekshirilishi kerak.</p>
          <p className="text-text-dim">Bu ro‘yxat bog‘lash holatidan alohida. “Bog‘lanishlar hal qilindi” degani fayldagi har bir qator to‘liq o‘qildi degani emas.</p>
          <details>
            <summary className="cursor-pointer text-text">Tekshiruv qatorlarini ko‘rish (birinchi {Math.min(20, manbaTekshiruvi.length)} ta)</summary>
            <ul className="mt-1 max-h-48 space-y-1 overflow-auto pl-4 text-text-dim">
              {manbaTekshiruvi.slice(0, 20).map((review, index) => (
                <li key={`${review.manzil?.qator ?? 'no-row'}-${review.kod}-${index}`}>
                  {review.manzil?.qator != null && <b className="text-text">Manba qatori {review.manzil.qator}: </b>}
                  {review.izoh}
                </li>
              ))}
              {manbaTekshiruvi.length > 20 && <li>Yana {manbaTekshiruvi.length - 20} ta tekshiruv bandi mavjud.</li>}
            </ul>
          </details>
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
      <div className="karta flex h-[164px] flex-col overflow-hidden p-2" ref={panelRef}>
        <div className="min-h-0 flex-1 overflow-auto"><Panel /></div>
        <p role={xabar ? 'status' : undefined} className="mt-1 flex h-5 shrink-0 items-center gap-2 border-t border-border/50 pt-1 text-[12px] text-text-dim">
          {xabar ? <>
            <span className="min-w-0 flex-1 truncate" title={xabar}>{xabar}</span>
            <button type="button" aria-label="Yopish" onClick={() => setXabar(null)}><X size={13} /></button>
          </> : null}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <section className="karta flex min-h-0 flex-col overflow-hidden" aria-label="F2 akt">
          <header className="border-b border-border bg-surface-2/60 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-dim">
            F2 akt — {p.akt.varaq} {filtr === 'hal' && halSoni === 0 ? '· bog‘lanishlar hal qilindi' : ''}
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
            {filtr === 'hal' && halSoni === 0 && <p className="p-3 text-center text-[12px] text-ok">Bog‘lash yoki tasdiq kutayotgan qator qolmadi. Faylni o‘qish tekshiruvlarini alohida ko‘ring.</p>}
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
              {tanlov.s.otaId != null && p.raw.get(tanlov.s.otaId) && (
                <button type="button" className="tugma justify-start text-left" onClick={() => {
                  const { f, s, tur } = tanlov; setTanlov(null);
                  ochModal(f, { kind: tur === 'ish' ? 'additional' : 'resource', parent: p.raw.get(s.otaId!)!, keyinId: s.id });
                }}>
                  <span>＋</span> <span><b>{tanlov.tur === 'ish' ? 'Qo‘shimcha ish' : 'Qo‘shimcha resurs'}</b> — smetada yo‘q; aynan shu qatordan KEYIN joylashadi</span>
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
          initialTur={modal.f.tur === 'bl' && !modal.f.bolalar.length && /^С(\s|$|\d)/.test((modal.f.kod ?? '').trim()) ? 'mat' : 'bl'}
          onClose={() => setModal(null)}
          resurslar={modal.f.tur === 'bl' ? modal.f.bolalar.map((r) => ({ tur: resTuri(r.birlik), nom: r.nom, birlik: r.birlik || 'шт', hajm: r.hajm, kod: r.kod })) : undefined}
          onCreated={(id, resIdlar) => { const f = modal.f; setModal(null); void p.onYaratildi(f, id, resIdlar); }}
        />
      )}
    </div>
  );
}
