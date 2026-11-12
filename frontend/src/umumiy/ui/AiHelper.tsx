import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bot, Eye, EyeOff, Lightbulb, Maximize2, Minimize2, PanelRight, SquarePen, X } from 'lucide-react';
import { kasbOl, type KasbIshchi } from '../../api/t2-agent-ish';
import { t } from '../../i18n/til';
import { yolNaqshi } from '../../lib/agent-faoliyat';
import { useKompaniya } from '../kontekst/KompaniyaKontekst';
import { usePTOWorkspace } from '../kontekst/PTOWorkspaceContext';
import { useHotkeys } from '../../lib/hotkeys/useHotkeys';
import { useYordamchiSahifalar } from '../../lib/yordamchi/sahifa-store';
import { sahifaAmaliniBajar, useSahifaAmallari } from '../../lib/yordamchi/sahifa-amal-store';
import { haqiqiyHujjatDeps } from '../../lib/yordamchi/hujjat-oqim';
import { useObyektMotor } from './yordamchi/useObyektMotor';
import type { YordamchiUlanish } from './yordamchi/ishlov';
import { AiChat, type TayyorSavol } from './AiChat';
import { ModelChip } from './ModelChip';
import { AiSelektsiya } from './AiSelektsiya';
import { AiFikrPanel } from './AiFikrPanel';
import { AiJurnal } from './AiJurnal';
import { AiShaxsiy } from './AiShaxsiy';
import { useAiKuzatuv } from './useAiKuzatuv';
import { kimMalumoti } from './yordamchi/kim-ulanish';
import { haqiqiyVositaApi } from '../../lib/yordamchi/vosita/haqiqiy';
import { yangiOperationId } from '../../api/supabase';
import { amalRejim, oynaKaliti, oynaOqi, oynaYoz, olchamlash, surish, suzuvchiRect, yonOlcham, yonSukut, type OynaHolat, type Rejim } from '../../lib/yordamchi/oyna';

type Tab = 'chat' | 'jurnal' | 'fikr' | 'sozlama';
const TABLAR: Array<[Tab, string]> = [['chat', 'Suhbat'], ['jurnal', 'Jurnal'], ['fikr', 'Fikr / muammo'], ['sozlama', 'Sozlamalar']];
const TAB_USLUB = 'flex-1 px-2 py-2 text-xs font-medium transition-colors';
const KALIT = 'Ctrl+K';
const ADMIN_ROLLAR = ['boss', 'admin', 'director', 'superadmin'];

/**
 * Global AI yordamchi: foydalanuvchining LAVOZIMIGA mos kasb ishchisi (PTO, bugalter, prorab, usta, skladchi, direktor …).
 * U faqat shu lavozimga ruxsat etilgan ma'lumotni ko'radi; har qadam jonli ko'rinadi; jiddiy qarorlarni foydalanuvchining o'zi tasdiqlaydi.
 */
/** Sarlavha qatoridagi Jarvis tugmasi (suzuvchi tugma yo'q — sahifa amallari ustida hech narsa turmaydi). Bir bosish = bir marta ochiladi. */
export function AiHelperTugma() {
  return (
    <button type="button" data-testid="jarvis-tugma" onClick={() => window.dispatchEvent(new CustomEvent('ai:ochish', { detail: {} }))}
      aria-label={t('Jarvis AI yordamchisini ochish')} title={t('Jarvis AI yordamchisi (Ctrl+K)')}
      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-text-dim hover:text-text">
      <Bot size={14} className="text-accent" /> <span className="hidden xl:inline">{KALIT}</span>
    </button>
  );
}

export function AiHelper() {
  const location = useLocation();
  const navigate = useNavigate();
  const kk = useKompaniya();
  const { joriyId } = kk;
  const companyRef = useRef({ id: joriyId, generation: 0 });
  if (companyRef.current.id !== joriyId) companyRef.current = { id: joriyId, generation: companyRef.current.generation + 1 };
  const [tab, setTab] = useState<Tab>('chat');
  const [isOpen, setIsOpen] = useState(false);
  /** Bir marta ochilgach suhbat oynasi o'chirilmaydi, yashiriladi — yopib-ochganda suhbat tarixi saqlanadi. */
  const [ochilgan, setOchilgan] = useState(false);
  useEffect(() => { if (isOpen) setOchilgan(true); }, [isOpen]);
  const [kasb, setKasb] = useState<KasbIshchi | null>(null);
  const kuzatuv = useAiKuzatuv(joriyId ?? undefined);
  const sahifalar = useYordamchiSahifalar();
  const ws = usePTOWorkspace();
  const obyektlar = useMemo(() => (ws.isProvider ? ws.objects.map((o) => ({ id: o.id, nom: o.nom ?? '' })).filter((o) => o.nom) : []), [ws.isProvider, ws.objects]);
  const joriyObyekt = obyektlar.find((o) => o.id === ws.scope.objectId) ?? null;
  const motor = useObyektMotor({ kompaniyaId: joriyId ?? null, obyektId: ws.isProvider ? ws.scope.objectId : null, obyektNomi: joriyObyekt?.nom, faol: isOpen, sahifalar, och: (yol) => { navigate(yol); setIsOpen(false); } });
  const sahifaAmallar = useSahifaAmallari();
  /* KIM: sessiyadan (useMen -> KompaniyaKontekst). Foydalanuvchi matnidan hech qachon olinmaydi. */
  const kim = useMemo(() => kimMalumoti(kk, location.pathname, joriyObyekt?.nom ?? null, ws.scope.objectId ?? null), [kk, location.pathname, joriyObyekt, ws.scope.objectId]);
  /* OYNA: rejim/joy/o'lcham foydalanuvchi bo'yicha eslab qolinadi (localStorage). */
  const uid = kk.foydalanuvchi?.id ?? null;
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => { const f = () => setVp({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const [oyna, setOyna] = useState<OynaHolat>(() => oynaOqi(oynaKaliti(uid), window.innerWidth, window.innerHeight));
  const yuklanganUid = useRef<number | null>(uid);
  useEffect(() => { if (yuklanganUid.current !== uid) { yuklanganUid.current = uid; setOyna(oynaOqi(oynaKaliti(uid), window.innerWidth, window.innerHeight)); } }, [uid]);
  useEffect(() => { if (yuklanganUid.current === uid) oynaYoz(oynaKaliti(uid), oyna); }, [oyna, uid]);
  const rejim: Rejim = amalRejim(oyna, vp.w);
  const yonW = oyna.yonW || yonSukut(vp.w);
  /* Yon panel: sahifa torayadi (ustini yopmaydi). */
  useEffect(() => {
    if (!isOpen || rejim !== 'yon') return;
    const eski = document.body.style.paddingRight;
    document.body.style.paddingRight = `${yonW}px`;
    return () => { document.body.style.paddingRight = eski; };
  }, [isOpen, rejim, yonW]);
  const rejimOl = (r: Rejim) => setOyna((o) => ({ ...o, rejim: r }));
  const sur = (e: RPointerEvent, tur: 'ko' | 'ol' | 'yon') => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    const bosh = { x: e.clientX, y: e.clientY }; const asl = oyna;
    const harakat = (m: PointerEvent) => {
      const dx = m.clientX - bosh.x; const dy = m.clientY - bosh.y; const w = window.innerWidth; const h = window.innerHeight;
      setOyna(tur === 'ko' ? surish(asl, dx, dy, w, h) : tur === 'ol' ? olchamlash(asl, dx, dy, w, h) : yonOlcham(asl, dx, w));
    };
    const tugat = () => { window.removeEventListener('pointermove', harakat); window.removeEventListener('pointerup', tugat); };
    window.addEventListener('pointermove', harakat); window.addEventListener('pointerup', tugat);
  };
  const vosita = useMemo(() => (joriyId ? { kompaniyaId: joriyId, kim, obyekt: joriyObyekt, obyektlar, sahifalar, api: haqiqiyVositaApi(joriyId), opId: yangiOperationId } : null), [joriyId, kim, joriyObyekt, obyektlar, sahifalar]);
  const hujjat = useMemo(() => (joriyId ? haqiqiyHujjatDeps(joriyId) : null), [joriyId]);
  const yordamchi: YordamchiUlanish | undefined = useMemo(() => (sahifalar.length ? { sahifalar, obyektlar, joriyObyekt, obyektTanla: (id: number) => ws.setObjectId(id), motor, hujjat, sahifaAmallar, sahifaAmalBajar: (id: string) => { sahifaAmaliniBajar(id); }, kim, vosita } : undefined), [sahifalar, obyektlar, joriyObyekt, ws, motor, hujjat, sahifaAmallar, kim, vosita]);
  const [tayyor, setTayyor] = useState<TayyorSavol | null>(null);
  /* Istalgan sahifa/komponent `window.dispatchEvent(new CustomEvent('ai:ochish', { detail: { savol } }))` bilan AI ni tayyor savol bilan ochadi. */
  useEffect(() => {
    const eshit = (e: Event) => {
      const savol = String((e as CustomEvent<{ savol?: string }>).detail?.savol ?? '').trim().slice(0, 600);
      setIsOpen(true); setTab('chat');
      if (savol) setTayyor({ id: Date.now(), matn: savol });
    };
    window.addEventListener('ai:ochish', eshit);
    return () => window.removeEventListener('ai:ochish', eshit);
  }, []);

  useEffect(() => {
    let tirik = true;
    setKasb(null);
    if (joriyId && isOpen) void kasbOl(joriyId).then((r) => { if (tirik && r.ok) setKasb(r.natija); });
    return () => { tirik = false; };
  }, [joriyId, isOpen]);

  /* Ctrl+K — YAGONA yordamchi (Jarvis) hamma joyda, Smeta Studiyada ham (Studio buyruqlari reestr orqali unga beriladi). */
  const hotkeyFaol = !location.pathname.startsWith('/boss');
  /* Ochilganda kiritish maydoniga fokus (suhbat yashirin saqlanadi, qayta mount bo'lmaydi). */
  useEffect(() => { if (isOpen && tab === 'chat') setTimeout(() => (document.getElementById('jarvis-kirish') as HTMLTextAreaElement | null)?.focus(), 0); }, [isOpen, tab]);
  useHotkeys('jarvis', t('Jarvis yordamchisi'), [
    { id: 'jarvis.och', keys: 'ctrl+k', nom: t('Jarvis yordamchisini ochish / yopish'), inInput: true, run: () => { setIsOpen((o) => !o); setTab('chat'); } },
    { id: 'jarvis.yop', keys: 'esc', nom: t('Jarvis yordamchisini yopish'), inInput: true, run: () => { if (!isOpen) return false; setIsOpen(false); } },
  ], hotkeyFaol);

  if (location.pathname.startsWith('/boss')) return null;

  /* Proaktiv taklif kartasi: ixtiyoriy — qabul qilish yoki rad etish; hech narsani o'zi bajarmaydi. */
  const taklifKarta = kuzatuv.taklif ? (
    <div role="status" className="rounded-xl border border-accent/40 bg-surface-2 p-3 text-sm shadow-lg">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-accent"><Lightbulb size={14} /> {t('AI taklifi (ixtiyoriy)')}</div>
      <p className="text-text">{kuzatuv.taklif.taklif}</p>
      <div className="mt-2 flex gap-2">
        {kuzatuv.taklif.yol && (
          <button type="button" className="fz-btn fz-btn--primary fz-btn--sm"
            onClick={() => { const y = kuzatuv.taklif?.yol; kuzatuv.qabul(); if (y) navigate(y); }}>{t('Ko‘rish')}</button>
        )}
        <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={kuzatuv.rad}>{t('Hozir kerak emas')}</button>
      </div>
    </div>
  ) : null;

  return (
    <>
      {location.pathname.startsWith('/admin') && <AiSelektsiya />}
      {ochilgan && (
        <div hidden={!isOpen} role="dialog" aria-modal="false" aria-label={t('Jarvis AI yordamchisi')} data-testid="jarvis-oyna" data-rejim={rejim}
          style={rejim === 'kichik' ? suzuvchiRect(oyna, vp.w, vp.h) : rejim === 'yon' ? { width: yonW } : undefined}
          className={`fixed z-50 ${isOpen ? 'flex' : 'hidden'} flex-col overflow-hidden border-border bg-surface shadow-2xl ${rejim === 'kichik' ? 'rounded-2xl border' : rejim === 'yon' ? 'bottom-0 right-0 top-0 border-l' : 'inset-0'}`}>
          {rejim === 'yon' && <div role="separator" aria-orientation="vertical" aria-label={t('Panel kengligi')} data-testid="jarvis-yon-tutqich" onPointerDown={(e) => sur(e, 'yon')} className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize hover:bg-accent/40" />}
          <div data-testid="jarvis-sarlavha" onPointerDown={(e) => { if (rejim === 'kichik' && !(e.target as HTMLElement).closest('button')) sur(e, 'ko'); }} onDoubleClick={() => rejimOl(rejim === 'toliq' ? 'kichik' : 'toliq')}
            className={`flex shrink-0 items-center justify-between border-b border-border bg-surface-2 px-4 py-3 ${rejim === 'kichik' ? 'cursor-move select-none touch-none' : ''}`}>
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-accent"><Bot size={20} /></div>
              <div>
                <h3 className="text-sm font-semibold text-text">{kasb?.nom ?? 'Jarvis AI'}{kim.ism || kim.login ? <span className="ml-1 font-normal text-text-dim" data-testid="jarvis-kim">· {kim.ism ?? kim.login}{kim.kompaniya ? ` · ${kim.kompaniya.nom}` : ''}</span> : null}</h3>
                <p className="flex items-center gap-1 text-xs text-text-dim"><span className="h-1.5 w-1.5 rounded-full bg-ok"></span> {t('Sizning lavozimingizga mos AI ishchi')} · {KALIT}</p>
              </div>
            </div>
            <div className="flex items-center">
              <button type="button" data-testid="jarvis-yangi-suhbat" onClick={() => { setTab('chat'); window.dispatchEvent(new CustomEvent('ai:yangi-suhbat')); }} aria-label={t('Yangi suhbat')} title={t('Yangi suhbat')} className="mr-1 rounded p-1 text-text-dim transition-colors hover:bg-surface-3 hover:text-text"><SquarePen size={18} /></button>
              {vp.w >= 640 && <>
                <button type="button" data-testid="jarvis-rejim-kichik" onClick={() => rejimOl('kichik')} aria-pressed={rejim === 'kichik'} aria-label={t('Kichik oyna')} title={t('Kichik oyna (sudrab ko‘chiriladi)')} className={`rounded p-1 transition-colors hover:bg-surface-3 ${rejim === 'kichik' ? 'text-accent' : 'text-text-dim'}`}><Minimize2 size={18} /></button>
                <button type="button" data-testid="jarvis-rejim-yon" onClick={() => rejimOl('yon')} aria-pressed={rejim === 'yon'} aria-label={t('Yon panel')} title={t('Keng yon panel (sahifa bilan yonma-yon)')} className={`rounded p-1 transition-colors hover:bg-surface-3 ${rejim === 'yon' ? 'text-accent' : 'text-text-dim'}`}><PanelRight size={18} /></button>
                <button type="button" data-testid="jarvis-rejim-toliq" onClick={() => rejimOl('toliq')} aria-pressed={rejim === 'toliq'} aria-label={t('To‘liq ekran')} title={t('To‘liq ekran')} className={`mr-1 rounded p-1 transition-colors hover:bg-surface-3 ${rejim === 'toliq' ? 'text-accent' : 'text-text-dim'}`}><Maximize2 size={18} /></button>
              </>}
              <button type="button" onClick={() => kuzatuv.almashtir(!kuzatuv.yoqilgan)} aria-pressed={kuzatuv.yoqilgan} aria-label={t('AI kuzatuvi')}
                title={kuzatuv.yoqilgan ? t('AI kuzatuvi yoqilgan: qiyinchilikda taklif beradi (matn o‘qilmaydi)') : t('AI kuzatuvi o‘chiq')}
                className={`mr-1 rounded p-1 transition-colors hover:bg-surface-3 ${kuzatuv.yoqilgan ? 'text-accent' : 'text-text-dim'}`}>
                {kuzatuv.yoqilgan ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
              <button onClick={() => setIsOpen(false)} aria-label={t('Yopish')} title={t('Yopish')} className="rounded p-1 text-text-dim transition-colors hover:bg-surface-3 hover:text-text"><X size={20} /></button>
            </div>
          </div>

          <div className="flex shrink-0 border-b border-border bg-surface" role="tablist">
            {TABLAR.map(([id, nom]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={`${TAB_USLUB} ${tab === id ? 'border-b-2 border-accent text-text' : 'text-text-dim'}`}>{t(nom)}</button>
            ))}
          </div>
          {taklifKarta && <div className="shrink-0 p-3">{taklifKarta}</div>}

          {tab === 'chat' && kasb && <ModelChip profil={kasb.profil} kompaniyaId={joriyId ?? null} />}
          {tab === 'chat' && <AiChat foydalanuvchiId={uid} kompaniyaId={joriyId ?? null} kasb={kasb} sahifa={yolNaqshi(location.pathname)} generatsiya={companyRef.current.generation} tayyorSavol={tayyor} onOqildi={() => setTayyor(null)} yordamchi={yordamchi} onOtish={() => setIsOpen(false)} />}
          {tab === 'jurnal' && (joriyId ? <AiJurnal kompaniyaId={joriyId} admin={ADMIN_ROLLAR.includes(kasb?.rol ?? '')} /> : <p className="p-4 text-sm text-text-dim">{t('Avval kompaniyani tanlang')}</p>)}
          {tab === 'fikr' && <AiFikrPanel kompaniyaId={joriyId ?? undefined} sahifa={yolNaqshi(location.pathname)} />}
          {tab === 'sozlama' && <AiShaxsiy kasb={kasb} kuzatuvYoqilgan={kuzatuv.yoqilgan} kuzatuvAlmashtir={kuzatuv.almashtir} />}
          {rejim === 'kichik' && <div role="separator" aria-label={t('O‘lchamni o‘zgartirish')} data-testid="jarvis-olcham-tutqich" onPointerDown={(e) => sur(e, 'ol')} className="absolute bottom-0 right-0 z-10 h-4 w-4 cursor-nwse-resize touch-none" style={{ background: 'linear-gradient(135deg, transparent 50%, var(--border, #888) 50%)' }} />}
        </div>
      )}
    </>
  );
}
