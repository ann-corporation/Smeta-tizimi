/**
 * AI buyruq satri (Ctrl+K) — PTO sahifalarida (PTOWorkspaceBar ko'rinadigan joyda) BITTA kiritish qatori.
 * Yangi marshrut/menyu yo'q va yangi AI dvigatel yo'q: mavjud `AiYordamchiPanel` (`satr` varianti) + `agentSikli` + `/api/smeta-ai`
 * (`sahifa_suhbat`, sahifa «buyruq»; hisob — `aiHisobli`, kompaniya hamyonidan token). Model faqat o'qiydi va TAKLIF KARTASI beradi
 * (nima o'zgaradi, eski → yangi, pul farqi SummaJuft bilan); «Bajarish» — mavjud yozish yo'llari (`sbFaktYoz`, `narxProtokolYarat`)
 * operation_id bilan; pul/huquqiy amal — ikkinchi «Tasdiqlayman». Ovoz faqat matnni to'ldiradi.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { t } from '../i18n/til';
import { yangiOperationId, type T2Qator, type T2QatorHolat } from '../api/supabase';
import { sbFaktYoz } from '../api/t2-fakt';
import { chizmaTaasiriOl, chizmalarOl } from '../api/t2-loyihachi';
import { chizmaXulosaMatni } from '../lib/loyihachi/chizma-yadro';
import { narxProtokolYarat } from '../api/t2-narx-protokol';
import { tokenHolatOl, type TokenHolat } from '../api/t2-token';
import { daraxtVaHolatOl } from '../lib/oylik-hujjat/ostatka-slichitelniy';
import { useHotkeys } from '../lib/hotkeys/useHotkeys';
import { isPtoRoute, usePTOWorkspace } from '../umumiy/kontekst/PTOWorkspaceContext';
import { AiYordamchiPanel } from '../umumiy/ui/ai-yordamchi/AiYordamchiPanel';
import { SummaJuft } from '../umumiy/ui/SummaJuft';
import { useUstamaliSumma } from '../umumiy/ui/useUstamaliSumma';
import { toast } from '../umumiy/ui/Toast';
import { amalDelta, buyruqMalumotQur, buyruqVositalar, type BuyruqMalumot, type BuyruqYoz, type YozNatija } from '../lib/ai-yordamchi/buyruq-vositalar';
import { buyruqTokenTaxmini, buyruqXeshi } from '../lib/ai-yordamchi/buyruq-narx';
import type { SahifaAmal } from '../lib/ai-yordamchi/protokol';
import type { UstamaliFn } from '../lib/ai-yordamchi/fakt-vositalar';

export type MalumotNatija = { ok: true; rows: T2Qator[]; states: T2QatorHolat[] } | { ok: false; xato: string };
export type BuyruqDeps = {
  malumotOl: { (obyektId: number): Promise<MalumotNatija> };
  yoz: Pick<BuyruqYoz, 'faktYoz' | 'narxProtokol' | 'yangiOperationId'>;
  tokenOl: { (kompaniyaId: number): Promise<TokenHolat | null> };
  /** Loyihachi/chizma xulosasi (AI `chizma` vositasi uchun, faqat o'qish); xato bo'lsa null. */
  chizmaOl?: { (kompaniyaId: number, obyektId: number): Promise<string | null> };
};

/** Haqiqiy bog'lanishlar: mavjud o'qish va yozish yo'llari (yangi RPC yo'q). */
const HAQIQIY_DEPS: BuyruqDeps = {
  malumotOl: (id) => daraxtVaHolatOl(id),
  yoz: {
    faktYoz: (p) => sbFaktYoz({ obyektId: p.obyektId, sana: p.sana, qatorlar: p.qatorlar, izoh: p.izoh, operationId: p.operationId }) as Promise<YozNatija>,
    narxProtokol: (p) => narxProtokolYarat(p.obyektId, p.qatorlar, p.izoh, p.operationId),
    yangiOperationId,
  },
  tokenOl: async (kompaniyaId) => { const r = await tokenHolatOl(kompaniyaId).catch(() => null); return r && r.ok ? r.natija : null; },
  chizmaOl: async (kompaniyaId, obyektId) => {
    const [a, b] = await Promise.all([chizmalarOl(kompaniyaId, obyektId), chizmaTaasiriOl(kompaniyaId, obyektId)]).catch(() => [null, null] as const);
    return a && a.ok ? chizmaXulosaMatni(a.natija.toplamlar, b && b.ok ? b.natija.boglanishlar : []) : null;
  },
};

const KALIT_YORLIQ = 'Ctrl+K';
const NAMUNALAR = () => [t('Narxsiz qatorlarni ko‘rsat'), t('Qoldiq eng katta ishlar qaysi?'), t('Beton ishlarini top')];

/** Yuborishdan oldin: taxminiy token narxi + balans. Haqiqiy sarf serverda (real foydalanishga qarab). */
function TokenChip({ h, matn, kontekst }: { h: TokenHolat | null; matn: string; kontekst: () => string }): ReactNode {
  const taxmin = buyruqTokenTaxmini(h, matn, kontekst().length);
  return <span data-testid="ai-token-chip">
    {taxmin != null ? t('Taxminiy narx: ≈ {n} token', { n: taxmin }) : t('Narx: real sarfga qarab token yechiladi')}
    {h ? ` · ${t('balans')}: ${h.balans}` : ''} · {t('bir xil buyruq qayta yechilmaydi')}
  </span>;
}

export function AiBuyruqSatriIchki({ kompaniyaId, obyektId, obyektNomi, ochiq, onOchiq, deps = HAQIQIY_DEPS }: {
  kompaniyaId: number; obyektId: number | null; obyektNomi?: string; ochiq: boolean; onOchiq: (v: boolean) => void; deps?: BuyruqDeps;
}) {
  const h = useUstamaliSumma(obyektId, { kompaniyaId });
  const ustamaliRef = useRef<UstamaliFn>(() => ({ ustamali: null, taxminiy: false }));
  ustamaliRef.current = (s) => {
    const u = h.hisobla(s.kesim);
    if (u?.ustamali == null) return { ustamali: null, taxminiy: false };
    const nomalum = u.nomalum.soni > 0 || u.nomalum.summa !== 0;
    if (nomalum && u.ustamasiz === 0) return { ustamali: null, taxminiy: false };
    return { ustamali: nomalum ? u.ustamali + u.nomalum.summa : u.ustamali, taxminiy: nomalum };
  };

  const [data, setData] = useState<{ obyektId: number; rows: T2Qator[]; states: T2QatorHolat[] } | null>(null);
  const [chizmaMatni, setChizmaMatni] = useState<{ obyektId: number; matn: string } | null>(null);
  const [xato, setXato] = useState('');
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [versiya, setVersiya] = useState(0);
  const [token, setToken] = useState<TokenHolat | null>(null);
  const depsRef = useRef(deps); depsRef.current = deps;

  useEffect(() => {
    if (!ochiq || obyektId == null) return undefined;
    let tirik = true;
    setYuklanmoqda(true); setXato('');
    void depsRef.current.malumotOl(obyektId).then((r) => {
      if (!tirik) return;
      if (r.ok) setData({ obyektId, rows: r.rows, states: r.states }); else setXato(r.xato);
    }).catch(() => { if (tirik) setXato(t('Obyekt ma’lumotini o‘qib bo‘lmadi. Tarmoq yoki ruxsatni tekshiring.')); })
      .finally(() => { if (tirik) setYuklanmoqda(false); });
    return () => { tirik = false; };
  }, [ochiq, obyektId, versiya]);

  useEffect(() => {
    if (!ochiq || obyektId == null || !depsRef.current.chizmaOl) return undefined;
    let tirik = true;
    void depsRef.current.chizmaOl(kompaniyaId, obyektId).then((matn) => { if (tirik && matn) setChizmaMatni({ obyektId, matn }); }).catch(() => null);
    return () => { tirik = false; };
  }, [ochiq, kompaniyaId, obyektId, versiya]);

  useEffect(() => {
    if (!ochiq) return undefined;
    let tirik = true;
    void depsRef.current.tokenOl(kompaniyaId).then((r) => { if (tirik) setToken(r); }).catch(() => null);
    return () => { tirik = false; };
  }, [ochiq, kompaniyaId, versiya]);

  const m: BuyruqMalumot | null = useMemo(
    () => (data && data.obyektId === obyektId ? buyruqMalumotQur(data.rows, data.states, { obyektNomi, ustamali: (s) => ustamaliRef.current(s), chizmaMatni: chizmaMatni && chizmaMatni.obyektId === obyektId ? chizmaMatni.matn : undefined }) : null),
    [data, obyektId, obyektNomi, chizmaMatni]);
  const mRef = useRef<BuyruqMalumot | null>(m); mRef.current = m;
  const bos = useMemo(() => buyruqMalumotQur([], []), []);

  const yangila = useCallback(() => setVersiya((v) => v + 1), []);
  const vositalar = useMemo(() => buyruqVositalar(() => mRef.current ?? bos, obyektId ?? 0, {
    ...deps.yoz, yangila,
    korsat: (qatorId) => {
      const r = mRef.current?.qatorById.get(qatorId);
      toast(`[#${qatorId}] ${r?.kod ?? ''} ${r?.nom ?? ''}`.trim(), 'ok');
      window.dispatchEvent(new CustomEvent('ai-buyruq:korsat', { detail: { qatorId } }));
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [obyektId, bos, yangila]);

  if (!ochiq) return null;
  if (obyektId == null) return <aside role="dialog" aria-label={t('AI buyruq')} data-testid="ai-buyruq-obyekt-yoq" className="fixed left-1/2 top-14 z-50 w-[min(34rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-2xl border border-border bg-surface p-3 text-sm shadow-2xl">
    {t('AI buyruq satri obyekt bo‘yicha ishlaydi — avval yuqoridan obyektni tanlang.')}</aside>;
  if (!m) return <aside role="dialog" aria-label={t('AI buyruq')} data-testid="ai-buyruq-yuklash" className="fixed left-1/2 top-14 z-50 w-[min(34rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-2xl border border-border bg-surface p-3 text-sm shadow-2xl">
    {xato ? <span className="text-danger">{xato}</span> : yuklanmoqda ? t('Obyekt ma’lumoti o‘qilmoqda…') : t('Tayyorlanmoqda…')}
    <button type="button" className="ml-3 text-[11px] underline" onClick={() => onOchiq(false)}>{t('Yopish')}</button></aside>;

  const amalQoshimcha = (a: SahifaAmal): ReactNode => {
    const d = amalDelta(m, a);
    if (!d) return null;
    return <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-text-dim" data-testid="ai-taklif-delta">
      <span>{d.eski} → {d.yangi}</span>
      <SummaJuft obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={d.ustamasiz} katKesim={d.kesim} kichik rejim="ustamali" />
    </span>;
  };

  return <AiYordamchiPanel satr ochiq={ochiq} onOchiq={onOchiq} ovoz kompaniyaId={kompaniyaId} vositalar={vositalar} saqlashKalit={`buyruq:${kompaniyaId}:${obyektId}`}
    sarlavha={t('AI buyruq satri')} namunalar={NAMUNALAR()} amalQoshimcha={amalQoshimcha}
    narxChip={(matn) => <TokenChip h={token} matn={matn} kontekst={() => vositalar.kontekst()} />}
    keshKalit={(matn) => buyruqXeshi(kompaniyaId, obyektId, matn, vositalar.kontekst())} />;
}

/** AdminShell uchun: PTO marshrutlarida Ctrl+K va kichik tugma; boshqa joyda hech narsa. */
export function AiBuyruqSatri({ deps }: { deps?: BuyruqDeps } = {}) {
  const ws = usePTOWorkspace();
  const location = useLocation();
  const faol = ws.isProvider && ws.companyId != null && isPtoRoute(location.pathname);
  const [ochiq, setOchiq] = useState(false);
  useHotkeys('ai-buyruq', t('AI buyruq satri'), [
    { id: 'ai-buyruq.och', keys: 'ctrl+k', nom: t('AI buyruq satrini ochish / yopish'), inInput: true, run: () => { setOchiq((o) => !o); } },
    { id: 'ai-buyruq.yop', keys: 'esc', nom: t('AI buyruq satrini yopish'), inInput: true, run: () => { if (!ochiq) return false; setOchiq(false); } },
  ], faol);
  useEffect(() => { if (!faol) setOchiq(false); }, [faol]);
  if (!faol || ws.companyId == null) return null;
  const obyektNomi = ws.objects.find((o) => o.id === ws.scope.objectId)?.nom ?? undefined;
  return <>
    <button type="button" onClick={() => setOchiq((o) => !o)} aria-label={t('AI buyruq satrini ochish')} aria-expanded={ochiq} data-testid="ai-buyruq-tugma"
      title={t('AI buyruq satri (Ctrl+K)')} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-text-dim hover:text-text">
      <Sparkles size={13} className="text-accent" /> <span className="hidden xl:inline">{KALIT_YORLIQ}</span></button>
    <AiBuyruqSatriIchki kompaniyaId={ws.companyId} obyektId={ws.scope.objectId} obyektNomi={obyektNomi} ochiq={ochiq} onOchiq={setOchiq} deps={deps} />
  </>;
}
