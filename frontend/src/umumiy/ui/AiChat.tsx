import { suhbatKonteksti } from '../../lib/ai-yordamchi/suhbat-kontekst';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { mdBolaklar } from '../../lib/yordamchi/jadval';
import { ArrowRight, Bot, Mic, MicOff, Send, Square, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { kasbSavolOqim, niyatLlmOl, suhbatRoyxatOl, suhbatServerdanOl, suhbatServerga, type ServerSuhbat, tizimYordamSavol, type KasbIshchi, type KasbYakun, type Qadam, type SahifaIshora } from '../../api/t2-agent-ish';
import { appendJarvisMessages, jarvisConversationPage, mutateJarvisConversation, syncJarvisConversation, type ConversationPageCursor } from '../../api/jarvis-suhbat-sync';
import { jarvisOutboxRead, jarvisOutboxRemove, jarvisOutboxStore, type JarvisQueuedWrite } from '../../lib/jarvis/conversation-outbox';
import { jarvisKichikGap } from '../../lib/jarvis/intent';
import { katalogKonteksti, narxSavolimi, vaqtBilan, type KatalogKontekst } from '../../lib/jarvis/katalog-kontekst';
import { t } from '../../i18n/til';
import { niyatAniqla, type Niyat } from '../../lib/yordamchi/niyat';
import { suhbatArxivla, suhbatKaliti, suhbatOqi, suhbatYoz, type Suhbat } from '../../lib/yordamchi/suhbatlar';
import { niyatLlmGaMosmi } from '../../lib/yordamchi/niyat-llm';
import { davomBekorMi } from '../../lib/yordamchi/vosita/ishla';
import type { Davom, Variant } from '../../lib/yordamchi/vosita/tur';
import { OVOZ_TILLAR, ovozBoshla, ovozQollanadimi, type OvozTil } from '../../lib/ai-yordamchi/ovoz';
import { yordamchiIshla, type IshlovNatija, type IshlovTaklif, type YordamchiUlanish } from './yordamchi/ishlov';
import { YordamchiTaklif } from './yordamchi/YordamchiTaklif';
import type { ObyektQisqa } from '../../lib/yordamchi/kontekst-ajrat';
import { toast } from './Toast';
import { AiBaho } from './AiBaho';
import { AiHarakatKarta } from './AiHarakatKarta';
import { AiQadamlar } from './AiQadamlar';
import { ISHCHI_HODISA, type IshchiHodisa } from './useIshchiNatija';
import { TOIFA_NOMI } from './ai-harakat';
import { studioKontekstObuna, studioKontekstOl, studioKontekstScope } from '../../lib/jarvis/studio-kontekst';
import { sensorliQurilma } from '../../lib/mobil/korinish-viewport';

type Xabar = { id: string; rol: 'user' | 'ai'; matn: string; yakun?: KasbYakun; qadamlar?: Qadam[]; jonli?: boolean; xato?: boolean; sahifalar?: SahifaIshora[]; yordam?: boolean;
  /** Yagona yordamchi (Jarvis) javobi: navigatsiya/o‘qish/taklif kartasi. */
  jarvis?: boolean; taklif?: IshlovTaklif; obyektTanla?: ObyektQisqa[]; kutadi?: string;
  /** Aniqlashtiruvchi savol variantlari (bosilsa shu matn javob sifatida yuboriladi). */ tanlov?: Variant[] };
/** Istalgan joydan chatni tayyor savol bilan ochish: AiHelper `ai:ochish` hodisasini (detail: { savol }) eshitadi. */
export type TayyorSavol = { id: number; matn: string };

const XATO_MATNI: Record<string, string> = {
  BYUDJET_YOQ: 'AI hali sozlanmagan: platforma oylik limiti belgilanmagan. Administratorga murojaat qiling.',
  BYUDJET_TUGADI: 'AI oylik limiti tugadi. Administrator limitni oshirishi mumkin.',
  TOKEN_YETMAYDI: 'Tokenlar yetarli emas — hisobni to‘ldiring.',
  KOMPANIYA_AI_OCHIQ: 'Kompaniya administratori AI ni o‘chirgan (Sozlamalar → AI).',
  TOKEN_LIMIT_TUGADI: 'Kompaniyaning AI oylik token limiti tugadi.',
};

/** Javob matni: jadval bo'laklari <table>, qolgani markdown (remark-gfm yo'q — lib/yordamchi/jadval.ts). */
function Markdown({ matn, bogla }: { matn: string; bogla: Components }) {
  return <>{mdBolaklar(matn).map((b, i) => b.tur === 'md'
    ? <ReactMarkdown key={i} components={bogla}>{b.matn}</ReactMarkdown>
    : <div key={i} className="my-2 max-w-full overflow-x-auto" data-testid="ai-jadval"><table className="w-full border-collapse text-xs">
        <thead><tr>{b.bosh.map((h, k) => <th key={k} className="border border-border bg-surface-2 px-2 py-1 font-semibold" style={{ textAlign: JADVAL_TEKIS[b.tekis[k]] }}><ReactMarkdown components={{ ...bogla, p: ({ children }) => <>{children}</> }}>{h}</ReactMarkdown></th>)}</tr></thead>
        <tbody>{b.qatorlar.map((q, r) => <tr key={r}>{q.map((x, k) => <td key={k} className="border border-border px-2 py-1" style={{ textAlign: JADVAL_TEKIS[b.tekis[k]] }}><ReactMarkdown components={{ ...bogla, p: ({ children }) => <>{children}</> }}>{x}</ReactMarkdown></td>)}</tr>)}</tbody>
      </table></div>)}</>;
}
const JADVAL_TEKIS = { l: 'left', r: 'right', c: 'center' } as const;

const ichkiYolmi = (h?: string): h is string => typeof h === 'string' && h.startsWith('/') && !h.startsWith('//');

/** Seans tarixi (sessionStorage): faqat yakunlangan xabarlar; taklif kartasi (funksiyalar) saqlanmaydi. */
function tarixOqi(kalit: string): Xabar[] {
  try { const v = JSON.parse(sessionStorage.getItem(kalit) ?? '[]'); return Array.isArray(v) ? (v as Xabar[]).slice(-30) : []; } catch { return []; }
}
function tarixYoz(kalit: string, x: readonly Xabar[]) {
  try { sessionStorage.setItem(kalit, JSON.stringify(x.filter((m) => !m.jonli).slice(-30).map(({ taklif: _t, ...q }) => q))); } catch { /* xotira yopiq */ }
}

/** AI ko'rsatgan sahifalarga o'tish tugmalari (yo'llar serverda katalog bilan tekshirilgan). */
function xabarImzo(a: { rol: string; matn: string }[]): string { return a.map((x) => `${x.rol}:${x.matn}`).join('\u0001'); }
function suhbatXabarlari(xabarlar: Xabar[]) {
  return xabarlar.flatMap(x => {
    const m = x.matn;
    return m.trim() ? [{ r: x.rol, m }] : [];
  });
}
const queuedPreview = (xabarlar: Xabar[]) => xabarlar.slice(-12).flatMap(x => {
  const m = x.matn;
  return m.trim() ? [{ r: x.rol, m }] : [];
});

function OtishTugmalari({ royxat, ochish }: { royxat?: SahifaIshora[]; ochish: (yol: string) => void }) {
  if (!royxat?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {royxat.map((x) => (
        <button key={x.yol} type="button" onClick={() => ochish(x.yol)} className="inline-flex items-center gap-1 rounded-md border border-accent/50 px-2 py-1 text-xs text-accent hover:bg-accent/10">
          {t('Ochish')}: {x.nom} <ArrowRight size={12} />
        </button>
      ))}
    </div>
  );
}

/** Kasb ishchisi bilan suhbat: har savolda AI qadamlari JONLI ko'rinadi; harakat takliflari tasdiq kartasi bilan keladi. */
function AiChatContent({ kompaniyaId, kasb, sahifa, generatsiya, tayyorSavol, onOtish, onOqildi, yordamchi, foydalanuvchiId = null, ixcham = false }: { ixcham?: boolean; foydalanuvchiId?: number | null; kompaniyaId: number | null; kasb: KasbIshchi | null; sahifa: string; generatsiya: number; tayyorSavol?: TayyorSavol | null; onOtish?: () => void; onOqildi?: () => void; yordamchi?: YordamchiUlanish }) {
  const navigate = useNavigate();
  const [xabarlar, setXabarlar] = useState<Xabar[]>([]);
  const [matn, setMatn] = useState('');
  const [band, setBand] = useState(false);
  const [saqlashHolati, setSaqlashHolati] = useState<'idle' | 'saving' | 'saved' | 'local'>('idle');
  const oxir = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const studioScope = useSyncExternalStore(studioKontekstObuna, () => studioKontekstScope(kompaniyaId, sahifa), () => '');
  const scope = `${generatsiya}|${foydalanuvchiId}|${kompaniyaId}|${sahifa}|${studioScope}`;
  const suhbatAvlod = useRef(0);
  const gen = useRef(scope);
  gen.current = `${scope}|${suhbatAvlod.current}`;
  useEffect(() => () => { gen.current = 'unmounted'; abort.current?.abort(); }, []);
  const yaRef = useRef(yordamchi); yaRef.current = yordamchi;
  const xabarlarRef = useRef<Xabar[]>([]); xabarlarRef.current = xabarlar;
  /** Obyekt ma'lumoti yuklanishini kutayotgan buyruq (obyekt tanlangach avtomatik davom etadi). */
  const kutish = useRef<{ id: string; matn: string; obyektId: number } | null>(null);
  /** Vosita aniqlashtiruvchi savoli: keyingi xabar shunga javob (yangi suhbat/kompaniya almashsa tozalanadi). */
  const davomRef = useRef<Davom | null>(null);

  /* Yagona yordamchi: suhbat tarixi seans davomida saqlanadi (sahifa almashsa ham, oyna yopilsa ham); kompaniya bo'yicha alohida. */
  const tarixKalit = yordamchi && foydalanuvchiId != null ? `jarvis-chat:${foydalanuvchiId}:${kompaniyaId ?? 0}` : null;
  const [tarixEga, setTarixEga] = useState<string | null>(null);
  /** Yuklangan/tanlangan suhbat tarkibi imzosi: shu o'zgarmaguncha (haqiqiy yangi xabar yo'q) serverga/arxivga yozilmaydi va yangilandi ko'tarilmaydi. */
  const yuklanganImzo = useRef('');
  const remoteAnchor = useRef<{
    id: string; etag: string | null; count: number; base: Array<{ r: 'user' | 'ai'; m: string }>;
  } | null>(null);
  const appendPending = useRef<typeof remoteAnchor.current>(null);
  const appendRetry = useRef<{
    anchor: NonNullable<typeof remoteAnchor.current>; etag: string; operationId: string;
    delta: ReturnType<typeof ixchamXabarlar>; count: number; signature: string; stale?: boolean;
  } | null>(null);
  const yangiServerSuhbat = useRef<{
    id: string; start: number; sending?: boolean; stale?: boolean;
    first?: { title: string; messages: ReturnType<typeof ixchamXabarlar>; count: number; signature: string };
  } | null>(null);
  const [saqlashQadami, setSaqlashQadami] = useState(0);
  const [outboxScope, setOutboxScope] = useState<string | null>(null);
  const [discardPending, setDiscardPending] = useState(false);
  const discardingPending = useRef(false);
  const outboxOwner = foydalanuvchiId != null && kompaniyaId != null ? { actor: foydalanuvchiId, company: kompaniyaId } : null;
  const outboxLoading = !!yordamchi && !!outboxOwner && outboxScope !== scope;
  /** Serverdan faqat qisqartma sifatida yuklangan suhbat id si: yangi xabar qo'shilganda asl nusxa ustiga yozilmaydi, yangi suhbat (fork) bo'ladi. */
  const qisqartmaDan = useRef<string | null>(null);
  const yuklashNomer = useRef(0);
  const [yuklanayotgan, setYuklanayotgan] = useState<string | null>(null);
  const [suhbatTahriri, setSuhbatTahriri] = useState<{
    id: string; avlod: string; etag: string; amal: 'rename' | 'delete'; nom: string;
  } | null>(null);
  const tahrirVersiya = useRef(0);
  const tahrirSorov = useRef<string | null>(null);
  const [tahrirBand, setTahrirBand] = useState(false);
  const suhbatToxtat = () => {
    remoteAnchor.current = null;
    appendRetry.current = null;
    yangiServerSuhbat.current = null;
    setDiscardPending(false);
    setSuhbatTahriri(null);
    setYuklanayotgan(null); yuklashNomer.current++; suhbatAvlod.current++; gen.current = `${scope}|${suhbatAvlod.current}`;
    abort.current?.abort(); busy.current = false; kutish.current = null; davomRef.current = null;
    setBand(false); setMatn(''); setSaqlashHolati('idle');
  };
  useEffect(() => { setYuklanayotgan(null); setTarixEga(tarixKalit); kutish.current = null; const tiklangan = tarixKalit ? tarixOqi(tarixKalit) : []; yuklanganImzo.current = xabarImzo(tiklangan); remoteAnchor.current = null; appendRetry.current = null; qisqartmaDan.current = null; setXabarlar(tiklangan); setMatn(''); setBand(false); busy.current = false; davomRef.current = null; abort.current?.abort();
    return () => { abort.current?.abort(); };
  }, [scope, tarixKalit]);
  useEffect(() => { if (tarixKalit && tarixEga === tarixKalit) {
    if (qisqartmaDan.current && xabarImzo(xabarlar) !== yuklanganImzo.current) {
      suhbatId.current = crypto.randomUUID();
      yangiServerSuhbat.current = { id: suhbatId.current, start: remoteAnchor.current?.count ?? 0 };
      qisqartmaDan.current = null;
    }
    if (remoteAnchor.current && remoteAnchor.current.id !== suhbatId.current) remoteAnchor.current = null;
    if (remoteAnchor.current || yangiServerSuhbat.current?.id === suhbatId.current) return;
    tarixYoz(tarixKalit, xabarlar);
    try { sessionStorage.setItem(tarixKalit + ':id', suhbatId.current); } catch { /* xotira yopiq */ }
  } }, [xabarlar, tarixKalit, tarixEga]);
  useEffect(() => { oxir.current?.scrollIntoView?.({ behavior: 'smooth' }); }, [xabarlar]);
  /* «Yangi suhbat»: tarix tozalanadi (sarlavhadagi tugma `ai:yangi-suhbat` hodisasini yuboradi). */
  useEffect(() => {
    const f = () => {
      if (outboxLoading || appendRetry.current || yangiServerSuhbat.current?.first) return;
      suhbatToxtat(); yuklanganImzo.current = ''; qisqartmaDan.current = null; setXabarlar([]);
      suhbatId.current = crypto.randomUUID();
      if (kompaniyaId != null) yangiServerSuhbat.current = { id: suhbatId.current, start: 0 };
      if (tarixKalit) { try { sessionStorage.removeItem(tarixKalit); sessionStorage.removeItem(tarixKalit + ':id'); } catch { /* xotira yopiq */ } }
    };
    window.addEventListener('ai:yangi-suhbat', f);
    return () => window.removeEventListener('ai:yangi-suhbat', f);
  }, [tarixKalit, scope, outboxLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  /* AI ishchi natijasi tayyor bo'lganda (panel ochiq, yengil polling — useIshchiNatija) chatda xabar: sarlavha + qisqa xulosa + inbox havolasi. */
  useEffect(() => {
    if (!yordamchi) return undefined;
    const f = (e: Event) => {
      const d = (e as CustomEvent<IshchiHodisa>).detail;
      if (!d) return;
      setXabarlar((p) => [...p, { id: `ishchi-${d.id}`, rol: 'ai', jarvis: true, matn: `**${t('AI ishchi natijasi tayyor')}:** ${d.sarlavha}\n\n${(d.xulosa ?? '').slice(0, 400)}`, sahifalar: [{ yol: '/admin/ai-agentlar', nom: t('AI ishchilar') }] }]);
    };
    window.addEventListener(ISHCHI_HODISA, f);
    return () => window.removeEventListener(ISHCHI_HODISA, f);
  }, [!!yordamchi]); // eslint-disable-line react-hooks/exhaustive-deps

  const tayyorSavolOqildi = useRef<number | null>(null);
  useEffect(() => {
    if (tayyorSavol?.matn && !outboxLoading && tayyorSavolOqildi.current !== tayyorSavol.id) {
      tayyorSavolOqildi.current = tayyorSavol.id;
      void yubor(tayyorSavol.matn);
      onOqildi?.();
    }
  }, [tayyorSavol?.id, outboxScope, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  /* SUHBATLAR RO'YXATI: joriy suhbat har yakunlanganda ixcham arxivlanadi (brauzerda, 30 kun); bo'sh oynada oxirgilari ko'rinadi va davom ettiriladi. */
  const arxivKalit = suhbatKaliti(foydalanuvchiId, kompaniyaId);
  const [arxiv, setArxiv] = useState<Suhbat[]>([]);
  const suhbatId = useRef(`s${Date.now()}`);
  useEffect(() => {
    setArxiv(foydalanuvchiId != null ? suhbatOqi(arxivKalit) : []);
    let oldId: string | null = null;
    try { oldId = tarixKalit ? sessionStorage.getItem(tarixKalit + ':id') : null; } catch { /* xotira yopiq */ }
    const restored = oldId && /^[a-zA-Z0-9-]{1,100}$/.test(oldId) ? oldId : null;
    suhbatId.current = restored ?? crypto.randomUUID();
    yangiServerSuhbat.current = !restored && kompaniyaId != null ? { id: suhbatId.current, start: 0 } : null;
  }, [arxivKalit, foydalanuvchiId, tarixKalit, kompaniyaId]);
  useEffect(() => {
    if (!yordamchi || !outboxOwner) return;
    const avlod = gen.current;
    let alive = true;
    void jarvisOutboxRead(outboxOwner).then(queued => {
      if (!alive || !queued || gen.current !== avlod || busy.current) return;
      suhbatToxtat();
      suhbatId.current = queued.id;
      qisqartmaDan.current = null;
      const view = queued.preview.map((x, i) => ({
        id: `${queued.id}-pending-${i}`, rol: x.r, matn: x.m, jarvis: x.r === 'ai',
      }));
      const signature = xabarImzo(view);
      yuklanganImzo.current = '';
      if (queued.kind === 'create') {
        yangiServerSuhbat.current = { id: queued.id, start: 0, stale: queued.stale,
          first: { title: queued.title, messages: queued.turns, count: view.length, signature } };
      } else {
        const anchor = { id: queued.id, etag: queued.etag, count: 0, base: [] };
        remoteAnchor.current = anchor;
        appendRetry.current = { anchor, etag: queued.etag, operationId: queued.operation, delta: queued.turns,
          count: view.length, signature, stale: queued.stale };
      }
      setXabarlar(view);
    }).catch(() => {
      if (alive && gen.current === avlod) toast(t('Saqlanmagan xabarlarni tiklab bo‘lmadi.'), 'warn');
    }).finally(() => { if (alive) setOutboxScope(scope); });
    return () => { alive = false; };
  }, [scope, !!yordamchi]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const online = () => {
      if ((appendRetry.current && !appendRetry.current.stale) ||
          (yangiServerSuhbat.current?.first && !yangiServerSuhbat.current.stale)) setSaqlashQadami(i => i + 1);
    };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, []);
  useEffect(() => {
    if (!yordamchi || !tarixKalit || tarixEga !== tarixKalit || !xabarlar.length) return;
    if (outboxOwner && outboxScope !== scope) return;
    /* Javob oqayotgan paytda oldingi saqlash bekor bo'ladi: yorliq «saqlanmoqda» bo'lib qotib qolmasin. */
    if (xabarlar.some((x) => x.jonli)) { setSaqlashHolati('idle'); return; }
    /* Faqat ochilgan/tanlangan suhbat (yangi xabar yo'q): arxivga/serverga yozilmaydi. */
    if (xabarImzo(xabarlar) === yuklanganImzo.current) return;
    const anchor = remoteAnchor.current;
    if (anchor && anchor.id === suhbatId.current) {
      if (kompaniyaId == null) return;
      const avlod = gen.current;
      const stillCurrent = () => gen.current === avlod && remoteAnchor.current === anchor;
      const retry = appendRetry.current?.anchor === anchor ? appendRetry.current : null;
      const until = Math.min(xabarlar.length, anchor.count + 12);
      const delta = suhbatXabarlari(xabarlar.slice(anchor.count, until));
      if (retry?.stale || (!retry && !delta.length)) { setSaqlashHolati('local'); return; }
      setSaqlashHolati('saving');
      const save = async () => {
        if (!stillCurrent() || appendPending.current === anchor || discardingPending.current) return;
        appendPending.current = anchor;
        try {
          let etag = retry?.etag ?? anchor.etag;
          if (!etag) {
            const result = await syncJarvisConversation(kompaniyaId, { id: anchor.id, etag: null }, AbortSignal.timeout(8000));
            const snapshot = result?.suhbat;
            if (snapshot?.holat === 'changed' && snapshot.xabarlar?.length === anchor.base.length &&
                snapshot.xabarlar.every((x, i) => x.r === anchor.base[i].r && x.m === anchor.base[i].m)) etag = snapshot.etag;
          }
          if (!stillCurrent()) return;
          if (!etag) { setSaqlashHolati('local'); return; }
          const batch: NonNullable<typeof appendRetry.current> = retry ?? {
            anchor, etag, delta, operationId: crypto.randomUUID(), count: until,
            signature: xabarImzo(xabarlar.slice(0, until)),
          };
          appendRetry.current = batch;
          const queued: JarvisQueuedWrite = { kind: 'append', id: anchor.id, operation: batch.operationId,
            etag: batch.etag, turns: batch.delta, preview: queuedPreview(xabarlar.slice(0, batch.count)) };
          if (outboxOwner && !await jarvisOutboxStore(outboxOwner, queued)) { if (stillCurrent()) setSaqlashHolati('local'); return; }
          if (!stillCurrent()) return;
          const result = await appendJarvisMessages(kompaniyaId, anchor.id, batch.etag, batch.delta, batch.operationId, outboxOwner?.actor);
          if (outboxOwner && result && 'etag' in result && !await jarvisOutboxRemove(outboxOwner, queued.operation)) {
            if (stillCurrent()) setSaqlashHolati('local');
            return;
          }
          if (outboxOwner && result && 'stale' in result) await jarvisOutboxStore(outboxOwner, { ...queued, stale: true });
          if (!stillCurrent()) return;
          if (!result || 'stale' in result) {
            batch.stale = !!result;
            if (batch.stale) toast(t('Suhbat boshqa qurilmada o‘zgargan. Yangilangan suhbatni tekshiring.'), 'warn');
            setSaqlashHolati('local');
            return;
          }
          appendRetry.current = null;
          remoteAnchor.current = { ...anchor, etag: result.etag, count: batch.count };
          yuklanganImzo.current = batch.signature;
          setSaqlashHolati('saved');
          if (xabarlarRef.current.length > batch.count) setSaqlashQadami(i => i + 1);
        } finally {
          if (appendPending.current === anchor) appendPending.current = null;
        }
      };
      const timer = setTimeout(() => { void save(); }, 1000);
      return () => clearTimeout(timer);
    }
    const fresh = yangiServerSuhbat.current;
    if (fresh?.id === suhbatId.current && kompaniyaId != null) {
      if (fresh.stale) { setSaqlashHolati('local'); return; }
      setSaqlashHolati('saving');
      const avlod = gen.current;
      const save = async () => {
        if (fresh.sending || discardingPending.current || gen.current !== avlod || yangiServerSuhbat.current !== fresh) return;
        const messages = suhbatXabarlari(xabarlar.slice(fresh.start));
        if (!fresh.first) {
          if (!messages.length || messages.length > 12) { setSaqlashHolati('local'); return; }
          const title = (messages.find(x => x.r === 'user') ?? messages[0]).m.replace(/\s+/g, ' ').slice(0, 80).trim();
          fresh.first = { title, messages, count: xabarlar.length, signature: xabarImzo(xabarlar) };
        }
        const first = fresh.first;
        fresh.sending = true;
        const stillCurrent = () => gen.current === avlod && yangiServerSuhbat.current === fresh;
        try {
          const queued: JarvisQueuedWrite = { kind: 'create', id: fresh.id, operation: fresh.id, title: first.title,
            turns: first.messages, preview: queuedPreview(xabarlar.slice(0, first.count)) };
          if (outboxOwner && !await jarvisOutboxStore(outboxOwner, queued)) { if (stillCurrent()) setSaqlashHolati('local'); return; }
          if (!stillCurrent()) return;
          const result = await mutateJarvisConversation(kompaniyaId, fresh.id, null,
            { harakat: 'create', sarlavha: first.title, xabarlar: first.messages }, outboxOwner?.actor);
          if (outboxOwner && result.status === 'saved' && !await jarvisOutboxRemove(outboxOwner, queued.operation)) {
            if (stillCurrent()) setSaqlashHolati('local');
            return;
          }
          if (outboxOwner && result.status === 'stale') await jarvisOutboxStore(outboxOwner, { ...queued, stale: true });
          if (!stillCurrent()) return;
          if (result.status !== 'saved') {
            fresh.stale = result.status === 'stale';
            if (fresh.stale) toast(t('Suhbat boshqa qurilmada o‘zgargan. Yangilangan suhbatni tekshiring.'), 'warn');
            setSaqlashHolati('local');
            return;
          }
          remoteAnchor.current = { id: fresh.id, etag: result.etag, count: first.count, base: first.messages };
          yangiServerSuhbat.current = null;
          yuklanganImzo.current = first.signature;
          setSaqlashHolati('saved');
          setSaqlashQadami(i => i + 1);
        } finally { fresh.sending = false; }
      };
      const timer = setTimeout(() => { void save(); }, 1000);
      return () => clearTimeout(timer);
    }
    const yangi = suhbatArxivla(suhbatOqi(arxivKalit), suhbatId.current, xabarlar.map((x) => ({ rol: x.rol, matn: x.matn, jonli: x.jonli })));
    suhbatYoz(arxivKalit, yangi); setArxiv(yangi);
    /* Serverga (qurilmalar orasida): 1.5 s kutib, xato bo'lsa jim — brauzer nusxasi zaxira. */
    if (kompaniyaId == null || foydalanuvchiId == null) return;
    const id = suhbatId.current; const s = yangi.find((q) => q.id === id);
    if (!s) return;
    let tirik = true; const avlod = gen.current;
    setSaqlashHolati('saving');
    const tm = setTimeout(() => { void suhbatServerga(kompaniyaId, id, s.sarlavha, s.xabarlar.map((x) => ({ r: x.rol, m: x.matn }))).then((r) => {
      if (tirik && gen.current === avlod && suhbatId.current === id) setSaqlashHolati(r?.ok ? 'saved' : 'local');
    }).catch(() => { if (tirik && gen.current === avlod && suhbatId.current === id) setSaqlashHolati('local'); }); }, 1500);
    return () => { tirik = false; clearTimeout(tm); };
  }, [xabarlar, arxivKalit, yordamchi, tarixKalit, tarixEga, saqlashQadami, outboxScope, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const [serverRoyxat, setServerRoyxat] = useState<ServerSuhbat[]>([]);
  const [extraHistory, setExtraHistory] = useState<{ owner: string; rows: ServerSuhbat[]; next: ConversationPageCursor | null } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyRequest = useRef<object | null>(null);
  const history = extraHistory?.owner === tarixKalit ? extraHistory : null;
  const loadOlderChats = async () => {
    if (kompaniyaId == null || !tarixKalit || historyRequest.current || tahrirSorov.current || (history && !history.next)) return;
    const marker = {};
    const avlod = gen.current;
    const oldVersion = tahrirVersiya.current;
    historyRequest.current = marker;
    setHistoryLoading(true);
    try {
      const first = await jarvisConversationPage(kompaniyaId, history?.next ?? null);
      if (gen.current !== avlod || tahrirVersiya.current !== oldVersion) return;
      if (!first) { toast(t('Eski suhbatlarni yuklab bo‘lmadi.'), 'warn'); return; }
      const rows = new Map((history?.rows ?? []).map(row => [row.id, row]));
      const latest = new Set(serverRoyxat.map(row => row.id));
      let page = first;
      if (!history && page.keyingi && page.royxat.every(row => latest.has(row.id))) {
        const older = await jarvisConversationPage(kompaniyaId, page.keyingi);
        if (gen.current !== avlod || tahrirVersiya.current !== oldVersion) return;
        if (!older) { toast(t('Eski suhbatlarni yuklab bo‘lmadi.'), 'warn'); return; }
        page = older;
      }
      for (const row of page.royxat) rows.set(row.id, row);
      setExtraHistory({ owner: tarixKalit, rows: [...rows.values()], next: page.keyingi });
    } finally {
      if (historyRequest.current === marker) {
        historyRequest.current = null;
        setHistoryLoading(false);
      }
    }
  };
  const syncListed = useRef(false);
  useEffect(() => {
    let tirik = true;
    syncListed.current = false;
    setServerRoyxat([]);
    setExtraHistory(null);
    historyRequest.current = null;
    setHistoryLoading(false);
    if (kompaniyaId != null && foydalanuvchiId != null && yordamchi) {
      void suhbatRoyxatOl(kompaniyaId).then((r) => { if (tirik && r && !syncListed.current) setServerRoyxat(r); });
    }
    return () => { tirik = false; };
  }, [kompaniyaId, foydalanuvchiId, !!yordamchi]); // eslint-disable-line react-hooks/exhaustive-deps
  // Only an untouched server-opened conversation accepts remote messages. A local or in-flight
  // change stays on this device until the versioned write path can reconcile it.
  const readPoll = useRef(async (_signal: AbortSignal) => false);
  const pollBlocked = useRef(false);
  pollBlocked.current = !!matn.trim() || yuklanayotgan !== null || saqlashHolati === 'saving' || saqlashHolati === 'local';
  const suhbatSof = () => !busy.current && !pollBlocked.current && xabarImzo(xabarlarRef.current) === yuklanganImzo.current;
  readPoll.current = async (signal) => {
    if (kompaniyaId == null) return false;
    if (tahrirSorov.current !== null) return true;
    const versiya = tahrirVersiya.current;
    const avlod = gen.current;
    const loadNumber = yuklashNomer.current;
    const requestId = suhbatId.current;
    const anchor = remoteAnchor.current;
    const cursor = anchor?.id === requestId && suhbatSof() ? { id: anchor.id, etag: anchor.etag } : null;
    const sync = await syncJarvisConversation(kompaniyaId, cursor, signal);
    if (!sync || signal.aborted || gen.current !== avlod || tahrirVersiya.current !== versiya) return !!sync;
    syncListed.current = true;
    setServerRoyxat(current => current.length === sync.royxat.length && current.every((row, i) => {
      const fresh = sync.royxat[i];
      return row.id === fresh.id && row.sarlavha === fresh.sarlavha && row.yangilandi === fresh.yangilandi && row.toliq === fresh.toliq;
    }) ? current : sync.royxat);
    const remote = sync.suhbat;
    if (!remote || !cursor || remoteAnchor.current !== anchor || suhbatId.current !== requestId ||
        yuklashNomer.current !== loadNumber || !suhbatSof()) return true;
    if (remote.holat === 'same') return true;
    davomRef.current = null;
    if (remote.holat === 'missing') {
      setExtraHistory(items => items?.rows.some(row => row.id === requestId) ? { ...items, rows: items.rows.filter(row => row.id !== requestId) } : items);
      remoteAnchor.current = null;
      qisqartmaDan.current = null;
      suhbatId.current = crypto.randomUUID();
      yangiServerSuhbat.current = { id: suhbatId.current, start: 0 };
      yuklanganImzo.current = xabarImzo([]);
      setXabarlar([]);
      return true;
    }
    setExtraHistory(items => items?.rows.some(row => row.id === requestId && row.sarlavha !== remote.sarlavha) ?
      { ...items, rows: items.rows.map(row => row.id === requestId ? { ...row, sarlavha: remote.sarlavha } : row) } : items);
    const messages = remote.xabarlar ?? (remote.qisqartma ? [{ r: 'ai' as const, m: t('Eski suhbat (qisqartma)') + ': ' + remote.qisqartma }] : []);
    const next = messages.map((x, i) => ({ id: requestId + '-' + i, rol: x.r, matn: x.m, jarvis: x.r === 'ai' }));
    if (remote.xabarlar === null || remote.arxivlangan) qisqartmaDan.current = requestId;
    else qisqartmaDan.current = null;
    remoteAnchor.current = { id: requestId, etag: remote.etag, count: next.length, base: remote.xabarlar ?? [] };
    yuklanganImzo.current = xabarImzo(next);
    setXabarlar(next);
    return true;
  };
  useEffect(() => {
    if (!tarixKalit || kompaniyaId == null) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController | null = null;
    const schedule = (ms: number) => { if (!stopped) timer = setTimeout(() => { void poll(); }, ms); };
    async function poll() {
      if (document.visibilityState === 'hidden') { schedule(3000); return; }
      const active = new AbortController();
      request = active;
      const timeout = setTimeout(() => active.abort(), 8000);
      try {
        const ok = await readPoll.current(active.signal);
        schedule(ok ? 3000 : 30000);
      } finally { clearTimeout(timeout); request = null; }
    }
    schedule(3000);
    return () => { stopped = true; clearTimeout(timer); request?.abort(); };
  }, [tarixKalit, kompaniyaId, scope]);
  /* Ko'rinadigan ro'yxat: brauzer nusxasi + faqat serverda bor (boshqa qurilma) suhbatlar. */
  const allServerRows = useMemo(() => [...new Map([...(history?.rows ?? []), ...serverRoyxat].map(row => [row.id, row])).values()],
    [history, serverRoyxat]);
  const korinadigan = useMemo(() => {
    const bor = new Set(arxiv.map((s) => s.id));
    const sv = allServerRows.filter((s) => !bor.has(s.id)).map((s) => ({ id: s.id, sarlavha: s.sarlavha, yangilandi: Date.parse(s.yangilandi) || 0, xabarlar: [] as Suhbat['xabarlar'], server: true as const }));
    return [...arxiv.map((s) => ({ ...s, server: false as const })), ...sv].sort((a, b) => b.yangilandi - a.yangilandi);
  }, [arxiv, allServerRows]);
  const serverSuhbat = allServerRows.find(s => s.id === suhbatId.current && s.id === remoteAnchor.current?.id);
  const faolTahrir = suhbatTahriri?.avlod === gen.current && suhbatTahriri.id === serverSuhbat?.id ? suhbatTahriri : null;
  const tahrirMumkin = serverSuhbat && remoteAnchor.current?.etag && suhbatSof() && !tahrirBand;
  const tahrirOch = (amal: 'rename' | 'delete') => {
    const etag = remoteAnchor.current?.etag;
    if (!tahrirMumkin || !serverSuhbat || !etag) return;
    setSuhbatTahriri({ id: serverSuhbat.id, avlod: gen.current, etag, amal, nom: serverSuhbat.sarlavha });
  };
  const tahrirSaqlash = async () => {
    const draft = faolTahrir;
    if (!draft || kompaniyaId == null || !suhbatSof() || tahrirSorov.current !== null) return;
    const anchor = remoteAnchor.current;
    const name = draft.nom.trim();
    if (draft.amal === 'rename' && !name) return;
    if (anchor?.id !== draft.id || anchor.etag !== draft.etag) {
      setSuhbatTahriri(null);
      toast(t('Suhbat boshqa qurilmada o‘zgargan. Yangilangan suhbatni tekshiring.'), 'warn');
      return;
    }
    tahrirSorov.current = draft.avlod;
    tahrirVersiya.current++;
    setTahrirBand(true);
    const result = await mutateJarvisConversation(kompaniyaId, draft.id, draft.etag,
      draft.amal === 'delete' ? { harakat: 'delete' } : { harakat: 'rename', sarlavha: name });
    tahrirSorov.current = null;
    setTahrirBand(false);
    if (gen.current !== draft.avlod || remoteAnchor.current !== anchor) return;
    if (result.status === 'failed') { toast(t('Suhbatdagi o‘zgarish saqlanmadi.'), 'warn'); return; }
    setSuhbatTahriri(null);
    if (result.status === 'stale') { toast(t('Suhbat boshqa qurilmada o‘zgargan. Yangilangan suhbatni tekshiring.'), 'warn'); return; }
    if (result.status === 'saved') {
      remoteAnchor.current = { ...anchor, etag: result.etag };
      setServerRoyxat(rows => rows.map(row => row.id === draft.id ? { ...row, sarlavha: name } : row));
      setExtraHistory(items => items?.owner === tarixKalit ? { ...items, rows: items.rows.map(row => row.id === draft.id ? { ...row, sarlavha: name } : row) } : items);
    } else {
      setServerRoyxat(rows => rows.filter(row => row.id !== draft.id));
      setExtraHistory(items => items?.owner === tarixKalit ? { ...items, rows: items.rows.filter(row => row.id !== draft.id) } : items);
      suhbatToxtat();
      qisqartmaDan.current = null;
      suhbatId.current = crypto.randomUUID();
      yangiServerSuhbat.current = { id: suhbatId.current, start: 0 };
      yuklanganImzo.current = xabarImzo([]);
      setXabarlar([]);
    }
  };
  const serverdanDavom = async (s: Suhbat) => {
    /* Avval yuklaymiz: xato bo'lsa joriy (oqayotgan) javob bekor qilinmaydi. */
    const boshlangich = gen.current; const nomer = ++yuklashNomer.current;
    setYuklanayotgan(s.sarlavha);
    let r: Awaited<ReturnType<typeof suhbatServerdanOl>> = null;
    try { r = kompaniyaId != null ? await suhbatServerdanOl(kompaniyaId, s.id) : null; }
    catch { /* Yuklash xatosi quyida ko'rsatiladi. */ }
    if (gen.current !== boshlangich || yuklashNomer.current !== nomer) return;
    setYuklanayotgan(null);
    if (!r) { toast(t('Suhbatni yuklab bo‘lmadi'), 'warn'); return; }
    const toLiq = !!r.xabarlar;
    const x = r.xabarlar ?? (r.qisqartma ? [{ r: 'ai' as const, m: `${t('Eski suhbat (qisqartma)')}: ${r.qisqartma}` }] : []);
    suhbatToxtat();
    suhbatId.current = s.id; qisqartmaDan.current = r.arxivlangan || (!toLiq && x.length) ? s.id : null;
    remoteAnchor.current = { id: s.id, etag: null, count: x.length, base: r.xabarlar ?? [] };
    if (tarixKalit) {
      try { sessionStorage.removeItem(tarixKalit); sessionStorage.removeItem(tarixKalit + ':id'); } catch { /* storage off */ }
    }
    const yangi = x.map((q, i) => ({ id: `${s.id}-${i}`, rol: q.r, matn: q.m, jarvis: q.r === 'ai' }));
    yuklanganImzo.current = xabarImzo(yangi);
    setXabarlar(yangi);
  };
  const suhbatDavom = (s: Suhbat & { server?: boolean }) => {
    if (outboxLoading || appendRetry.current || yangiServerSuhbat.current?.first) return;
    if (s.server) { void serverdanDavom(s); return; }
    suhbatToxtat(); suhbatId.current = s.id; qisqartmaDan.current = null;
    const yangi = s.xabarlar.map((x, i) => ({ id: `${s.id}-${i}`, rol: x.rol, matn: x.matn, jarvis: x.rol === 'ai' }));
    yuklanganImzo.current = xabarImzo(yangi); setXabarlar(yangi);
  };
  /* QURILMA ALMASHGANDA: bu qurilmada tarix yo'q (brauzer arxivi va joriy chat bo'sh), serverda esa oxirgi 48 soatdagi suhbat bor — o'zi tiklanadi (bir marta). */
  const tiklandi = useRef<string | null>(null);
  useEffect(() => {
    if (!yordamchi || (outboxOwner && outboxScope !== scope) || tiklandi.current === arxivKalit ||
        xabarlarRef.current.length || arxiv.length || !serverRoyxat.length) return;
    const s = [...serverRoyxat].sort((a, b) => Date.parse(b.yangilandi) - Date.parse(a.yangilandi))[0];
    const vaqt = Date.parse(s.yangilandi);
    if (!Number.isFinite(vaqt) || Date.now() - vaqt > 48 * 3_600_000) return;
    tiklandi.current = arxivKalit;
    void serverdanDavom({ id: s.id, sarlavha: s.sarlavha, yangilandi: vaqt, xabarlar: [] });
  }, [serverRoyxat, arxiv.length, arxivKalit, !!yordamchi, outboxScope, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const pendingWrite = appendRetry.current?.operationId ?? (yangiServerSuhbat.current?.first ? yangiServerSuhbat.current.id : null);
  const clearPendingWrite = async () => {
    if (!pendingWrite || !outboxOwner || saqlashHolati !== 'local' ||
        discardingPending.current || appendPending.current || yangiServerSuhbat.current?.sending) return;
    const avlod = gen.current;
    discardingPending.current = true;
    try {
      if (!await jarvisOutboxRemove(outboxOwner, pendingWrite) || gen.current !== avlod) return;
      appendRetry.current = null;
      yangiServerSuhbat.current = null;
      window.dispatchEvent(new Event('ai:yangi-suhbat'));
    } finally { discardingPending.current = false; }
  };
  const ochish = (yol: string) => { navigate(yol); onOtish?.(); };
  /* Javobdagi ichki havolalar (/admin/...) sahifani qayta yuklamay, router orqali ochiladi; tashqilari yangi oynada. */
  const markdownBogla = useMemo(() => ({
    a: ({ href, children }: { href?: string; children?: ReactNode }) => {
      if (ichkiYolmi(href)) return <a href={href} onClick={(e) => { e.preventDefault(); ochish(href); }} className="text-accent underline">{children}</a>;
      return <a href={href} target="_blank" rel="noreferrer noopener" className="text-accent underline">{children}</a>;
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const xabarYangila = (xid: string, f: (x: Xabar) => Xabar) => setXabarlar((p) => p.map((x) => (x.id === xid ? f(x) : x)));
  const tarixOl = (joriyId?: string) => suhbatKonteksti(xabarlarRef.current.filter((x) => x.matn && !x.jonli && x.id !== joriyId).map((x) => ({ rol: x.rol === 'user' ? 'user' as const : 'assistant' as const, matn: x.matn }))).xabarlar;

  /** Yagona yordamchi natijasini xabarga yozadi; navigatsiya — sahifani ochadi (yozuv emas). */
  const yordamchiNatijasi = (id: string, r: IshlovNatija) => {
    if (r.tur === 'obyektTanla') { xabarYangila(id + 'a', (x) => ({ ...x, jonli: false, matn: r.matn, obyektTanla: r.nomzodlar, kutadi: x.kutadi })); return; }
    if (r.tur === 'taklif') { davomRef.current = null; xabarYangila(id + 'a', (x) => ({ ...x, jonli: false, matn: r.matn, taklif: r.taklif, sahifalar: r.havolalar })); return; }
    if (r.tur === 'savol') { davomRef.current = r.davom; xabarYangila(id + 'a', (x) => ({ ...x, jonli: false, matn: r.matn, tanlov: r.variantlar })); return; }
    if (r.tur !== 'javob') return;
    xabarYangila(id + 'a', (x) => ({ ...x, jonli: false, matn: r.matn, xato: r.xato, sahifalar: r.havolalar }));
    if (r.ochish) { navigate(r.ochish); toast(t('Ochildi'), 'ok'); onOtish?.(); }
    else if (r.yop) onOtish?.();
  };


  const yubor = async (savol: string, davom?: { id: string }) => {
    const s = savol.trim();
    if (!s || outboxLoading || tahrirSorov.current === gen.current || (busy.current && !davom)) return;
    const boshlangich = gen.current;
    const id = davom?.id ?? Date.now().toString();
    if (!davom) setMatn('');
    let qoshHavola: SahifaIshora[] = []; let yaqinHavola: SahifaIshora[] = [];

    /* YAGONA YORDAMCHI (Jarvis) qatlami: navigatsiya, o'qish, yozuv taklifi — bepul va bir zumda; hal qilmasa mavjud oqim davom etadi. */
    const ya = yaRef.current;
    if (ya && ya.sahifalar.length && !jarvisKichikGap(s)) {
      const davom = davomRef.current; davomRef.current = null;
      if (davom && davomBekorMi(s)) { setXabarlar((p) => [...p, { id, rol: 'user', matn: s }, { id: id + 'a', rol: 'ai', jarvis: true, matn: t('Bekor qildim — hech narsa yozilmadi.') }]); setMatn(''); return; }
      let n: Niyat = davom ? { tur: 'vosita', id: davom.id, davom } : niyatAniqla(s, { sahifalar: ya.sahifalar, obyektlar: ya.obyektlar, joriyObyekt: ya.joriyObyekt, sahifaAmallar: ya.sahifaAmallar });
      let ishMatn = s; let oldindanQoyildi = false;
      /* LLM «niyat + slot»: mahalliy qatlam tushunmagan qisqa gap -> kanonik buyruq yoki BITTA aniqlashtiruvchi savol (hisobli, tier fast). */
      if (n.tur === 'nomalum' && !davom && kompaniyaId != null && niyatLlmGaMosmi(s)) {
        setXabarlar((p) => [...p, { id, rol: 'user', matn: s }, { id: id + 'a', rol: 'ai', matn: '', jonli: true, jarvis: true, qadamlar: [{ ms: 0, belgi: '🧭', matn: t('Gapni tushunyapman…') }], kutadi: s }]);
        setMatn(''); setBand(true); busy.current = true;
        const ctrl0 = new AbortController(); abort.current = ctrl0;
        const lr = await niyatLlmOl(kompaniyaId, s, { tarix: tarixOl(id), sahifa, obyektNomi: ya.joriyObyekt?.nom ?? null, signal: ctrl0.signal });
        if (gen.current !== boshlangich) return;
        busy.current = false; setBand(false);
        if (lr?.tur === 'noaniq') { xabarYangila(id + 'a', (x) => ({ ...x, jonli: false, qadamlar: undefined, matn: lr.savol ?? '', tanlov: lr.variantlar.map((v) => ({ nom: v, matn: v })) })); return; }
        const n2 = lr?.tur === 'buyruq' && lr.qayta ? niyatAniqla(lr.qayta, { sahifalar: ya.sahifalar, obyektlar: ya.obyektlar, joriyObyekt: ya.joriyObyekt, sahifaAmallar: ya.sahifaAmallar }) : null;
        if (lr?.qayta && n2 && n2.tur !== 'nomalum') { n = n2; ishMatn = lr.qayta; oldindanQoyildi = true; }
        else setXabarlar((p) => p.filter((x) => x.id !== id && x.id !== id + 'a'));   // oddiy oqim davom etadi
      }
      const faqatNav = n.tur === 'yordam' || n.tur === 'kim' || n.tur === 'dars' || n.tur === 'ruxsatYoq' || n.tur === 'sahifaTanla' || n.tur === 'navigatsiya' || n.tur === 'sahifaAmal';
      const mahalliy = (n.tur === 'navigatsiya' ? n.aniqOchish : n.tur !== 'nomalum') && (kompaniyaId != null || faqatNav);
      if (n.tur === 'navigatsiya' && !n.aniqOchish) qoshHavola = [{ yol: n.sahifa.url, nom: n.sahifa.nom }];
      if (n.tur === 'nomalum') yaqinHavola = n.yaqin.map((x) => ({ yol: x.url, nom: x.nom }));
      if (mahalliy) {
        if (!davom && !oldindanQoyildi) setXabarlar((p) => [...p, { id, rol: 'user', matn: s }, { id: id + 'a', rol: 'ai', matn: '', jonli: true, jarvis: true, qadamlar: [], kutadi: s }]);
        setBand(true); busy.current = true;
        const ctrl = new AbortController(); abort.current = ctrl;
        let r: IshlovNatija;
        try {
          r = await yordamchiIshla(n, ishMatn, {
            kompaniyaId, sahifalar: ya.sahifalar, motor: ya.motor, tarix: tarixOl(id), hujjat: ya.hujjat ?? undefined, sahifaAmalBajar: ya.sahifaAmalBajar, kim: ya.kim, vosita: ya.vosita,
            qadam: (q) => { if (gen.current === boshlangich) xabarYangila(id + 'a', (x) => ({ ...x, qadamlar: [...(x.qadamlar ?? []), { ms: 0, belgi: q.holat === 'xato' ? '✗' : '⏳', matn: q.matn }] })); },
            tirikmi: () => gen.current === boshlangich && !ctrl.signal.aborted,
          });
        } catch (e) { r = { tur: 'javob', xato: true, matn: e instanceof Error ? e.message : String(e) }; }
        if (gen.current !== boshlangich) return;
        if (r.tur === 'kut') {   // obyekt ma'lumoti yuklanmoqda: tayyor bo'lgach (effekt) davom etamiz
          kutish.current = { id, matn: s, obyektId: r.obyektId };
          xabarYangila(id + 'a', (x) => ({ ...x, qadamlar: [{ ms: 0, belgi: '⏳', matn: t('Obyekt ma’lumotini o‘qiyapman…') }] }));
          if (ya.motor.obyektId !== r.obyektId) ya.obyektTanla(r.obyektId);
          setTimeout(() => {
            if (kutish.current?.id !== id || gen.current !== boshlangich) return;
            kutish.current = null; busy.current = false; setBand(false);
            xabarYangila(id + 'a', (x) => ({ ...x, jonli: false, xato: true, matn: t('Obyekt ma’lumoti yuklanmadi. Obyektni yuqoridan tanlab, qayta urinib ko‘ring.') }));
          }, 20000);
          return;
        }
        busy.current = false; setBand(false);
        yordamchiNatijasi(id, r);
        return;
      }
    }
    if (!kompaniyaId) {   // kompaniya/lavozim yo'q: tokensiz «Tizim yordamchisi» (lug'at + sahifa katalogi), kompaniya ma'lumotisiz
      setXabarlar((p) => [...p, { id, rol: 'user', matn: s }]);
      const y = await tizimYordamSavol(s, sahifa);
      if (gen.current !== boshlangich) return;
      const sah = y.ok ? [...y.natija.sahifalar, ...qoshHavola.filter((q) => !y.natija.sahifalar.some((z) => z.yol === q.yol))] : [];
      setXabarlar((p) => [...p, { id: id + 'a', rol: 'ai', yordam: true, xato: !y.ok, matn: y.ok ? y.natija.javob : y.error, sahifalar: sah.length ? sah : undefined }]);
      return;
    }
    /* Kichik suhbat (salom, hol-ahvol, rahmat) — server va model kerak emas, javob bir zumda (lavozim yuklanishini ham kutmaydi). */
    const kichik = jarvisKichikGap(s);
    if (kichik) {
      const javob = kichik === 'rahmat' ? t('Arzimaydi! Yana savol bo‘lsa — yozing.')
        : kasb ? `${t('Salom! Men —')} **${kasb.nom}**. ${kasb.vazifa}` : t('Salom! Men Jarvis — sizga qanday yordam bera olaman?');
      setXabarlar((p) => [...p, { id, rol: 'user', matn: s }, { id: id + 'a', rol: 'ai', matn: javob }]);
      return;
    }
    setXabarlar((p) => (davom ? p : [...p, { id, rol: 'user', matn: s }, { id: id + 'a', rol: 'ai', matn: '', jonli: true, qadamlar: [] }]));
    setBand(true);
    busy.current = true;
    const ctrl = new AbortController(); abort.current = ctrl;
    // The role label may still be loading; the server always decides whether the model may receive this draft.
    const studio = (!kasb || kasb.kategoriyalar.includes('smeta_pul')) ? studioKontekstOl(kompaniyaId, sahifa) : null;
    // Price question → the platform price index (R2) is searched here and sent as context (owner 2026-10-15).
    const katalog = narxSavolimi(s) ? await vaqtBilan(katalogKonteksti(s).catch(() => [] as KatalogKontekst[]), 4000, [] as KatalogKontekst[]) : [];
    if (ctrl.signal.aborted || gen.current !== boshlangich) {
      if (gen.current === boshlangich) { busy.current = false; setBand(false);
        setXabarlar(p => p.map(x => x.id === id + 'a' ? {...x,jonli:false,matn:t('So‘rov to‘xtatildi — yangi AI chaqiruvi yuborilmadi.')} : x));
      }
      return;
    }
    if (katalog.length && gen.current === boshlangich)
      setXabarlar((p) => p.map((x) => (x.id === id + 'a' ? { ...x, qadamlar: [...(x.qadamlar ?? []), { ms: 0, belgi: '📚', matn: t('Platforma narx indeksidan {n} ta mos qator olindi', { n: katalog.length }) }] } : x)));
    const yakun = await kasbSavolOqim(kompaniyaId, s, {
      sahifa, signal: ctrl.signal, katalog, studio, obyektNomi: ya?.joriyObyekt?.nom ?? null, tarix: tarixOl(id),
      qadam: (q) => { if (gen.current === boshlangich) setXabarlar((p) => p.map((x) => (x.id === id + 'a' ? { ...x, qadamlar: [...(x.qadamlar ?? []), q] } : x))); },
    });
    if (gen.current !== boshlangich) return;   // kompaniya almashdi — eski javob ko'rsatilmaydi
    setBand(false);
    busy.current = false;
    /* Hech qachon rad etmaymiz: doiradan tashqari/xato bo'lsa — eng yaqin sahifalar tugma bo'lib qo'shiladi. */
    const sahMerge = [...(yakun.sahifalar ?? []), ...qoshHavola, ...((yakun.rad || !yakun.ok) ? yaqinHavola : [])]
      .filter((q, i, a) => a.findIndex((z) => z.yol === q.yol) === i);
    setXabarlar((p) => p.map((x) => (x.id === id + 'a' ? {
      ...x, jonli: false, yakun, xato: !yakun.ok, qadamlar: yakun.qadamlar ?? x.qadamlar, sahifalar: sahMerge.length ? sahMerge : undefined,
      matn: yakun.ok ? (yakun.javob ?? '') : t(XATO_MATNI[yakun.code ?? ''] ?? yakun.error ?? 'AI javob bera olmadi'),
    } : x)));
  };

  /* Obyekt tanlangach (yoki ma'lumot yuklangach) kutib turgan buyruq davom etadi. */
  useEffect(() => {
    const k = kutish.current;
    if (!k || !yordamchi) return;
    if (yordamchi.motor.obyektId === k.obyektId && yordamchi.motor.holat !== 'yuklanmoqda') { kutish.current = null; void yubor(k.matn, { id: k.id }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yordamchi?.motor.obyektId, yordamchi?.motor.holat]);

  /* Ovozli kiritish: faqat matnni to'ldiradi — yuborish ham, tasdiqlash ham foydalanuvchida (noto'g'ri tanish xavfi). */
  const ovozBor = useMemo(() => ovozQollanadimi(), []);
  const [ovozTil, setOvozTil] = useState<OvozTil>(() => { try { return localStorage.getItem('jarvis-ovoz-til') === 'ru-RU' ? 'ru-RU' : 'uz-UZ'; } catch { return 'uz-UZ'; } });
  const [tinglayapti, setTinglayapti] = useState(false);
  const tinglov = useRef<{ toxtat: () => void } | null>(null);
  useEffect(() => () => { tinglov.current?.toxtat(); }, []);
  function mikrofon() {
    if (tahrirSorov.current === gen.current) return;
    if (tinglayapti) { tinglov.current?.toxtat(); return; }
    const bosh = matn.trim();
    const hd = ovozBoshla(ovozTil, {
      natija: (m) => { if (tahrirSorov.current !== gen.current) setMatn(bosh ? `${bosh} ${m}` : m); },
      xato: (kod) => { setTinglayapti(false); toast(kod === 'not-allowed' || kod === 'service-not-allowed' ? t('Mikrofonga ruxsat berilmagan — matn bilan yozing.') : t('Ovoz tanilmadi — qayta urinib ko‘ring yoki matn bilan yozing.'), 'warn'); },
      tugadi: () => setTinglayapti(false),
    });
    tinglov.current = hd; setTinglayapti(!!hd);
  }
  const UMUMIY_SAVOLLAR = ['Bu sahifa nima uchun kerak?', 'Bu yerdagi raqamlar nimani bildiradi?', 'Keyingi qadam nima?'];
  return (
    <>
      {yordamchi && <div className={`border-b border-border bg-surface-2 px-4 ${ixcham ? 'py-1' : 'py-2'}`} data-testid="jarvis-conversation-bar" aria-busy={outboxLoading}>
        <div className="flex items-center gap-2">
          <select aria-label={t('Suhbatni tanlash')} value="" disabled={outboxLoading || !!pendingWrite} onChange={(e) => { const selected = korinadigan.find((q) => q.id === e.target.value); if (selected) suhbatDavom(selected); }} className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1 text-sm">
            <option value="">{korinadigan.find((q) => q.id === suhbatId.current)?.sarlavha ?? t('Suhbatni tanlash')}</option>
            {korinadigan.map((q) => <option key={q.id} value={q.id}>{q.sarlavha}</option>)}
          </select>
          {!ixcham && <button type="button" disabled={outboxLoading || !!pendingWrite} onClick={() => window.dispatchEvent(new Event('ai:yangi-suhbat'))} className="rounded border border-border px-2 py-1 text-sm">{t('Yangi suhbat')}</button>}
        </div>
        {tarixKalit && kompaniyaId != null && (!history || history.next) && <button type="button"
          disabled={historyLoading || outboxLoading || tahrirBand || !!pendingWrite} onClick={() => void loadOlderChats()}
          className="mt-1 rounded border border-border px-2 py-1 text-xs disabled:opacity-50">
          {t('Eski suhbatlarni ko‘rish')}
        </button>}
        {serverSuhbat && !faolTahrir && <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
          <button type="button" disabled={!tahrirMumkin || tinglayapti} onClick={() => tahrirOch('rename')} className="rounded border border-border px-2 py-1 disabled:opacity-50">{t('Suhbat nomini o‘zgartirish')}</button>
          <button type="button" disabled={!tahrirMumkin || tinglayapti} onClick={() => tahrirOch('delete')} className="rounded border border-border px-2 py-1 disabled:opacity-50">{t('Suhbatni o‘chirish')}</button>
        </div>}
        {faolTahrir && <form className="mt-1 flex flex-wrap items-center gap-1.5 text-xs" onSubmit={e => { e.preventDefault(); void tahrirSaqlash(); }} aria-busy={tahrirBand}>
          {faolTahrir.amal === 'rename' ? <input
            aria-label={t('Suhbat nomi')} maxLength={80} value={faolTahrir.nom} disabled={tahrirBand}
            onChange={e => setSuhbatTahriri({ ...faolTahrir, nom: e.target.value })}
            className="min-w-24 flex-1 rounded border border-border bg-surface px-2 py-1"
          /> : <span className="flex-1">{t('Serverdagi «{nom}» suhbatini o‘chirasizmi?', { nom: faolTahrir.nom })}</span>}
          <button type="submit" disabled={!tahrirMumkin || tinglayapti || (faolTahrir.amal === 'rename' && !faolTahrir.nom.trim())} className="rounded border border-border px-2 py-1 disabled:opacity-50">
            {faolTahrir.amal === 'rename' ? t('Saqlash') : t('O‘chirishni tasdiqlash')}
          </button>
          <button type="button" disabled={tahrirBand} onClick={() => setSuhbatTahriri(null)} className="rounded border border-border px-2 py-1 disabled:opacity-50">{t('Bekor qilish')}</button>
        </form>}
        {!ixcham && <p className="mt-1 text-xs text-text-dim">{kompaniyaId == null ? t('Kontekst: umumiy suhbat') : t('Kontekst: kompaniya #{id}', { id: String(kompaniyaId) })}{yordamchi.joriyObyekt ? ' · ' + yordamchi.joriyObyekt.nom : ''}</p>}
        {yuklanayotgan !== null && <div className="mt-1 flex items-center gap-2 text-xs" data-testid="jarvis-conversation-loading">
          <span role="status">{t('Suhbat yuklanmoqda: {nom}', {nom: yuklanayotgan})}</span>
          <button type="button" onClick={() => { yuklashNomer.current++; setYuklanayotgan(null); }} className="rounded border border-border px-2 py-1">{t('Suhbat yuklashni bekor qilish')}</button>
        </div>}
        {saqlashHolati !== 'idle' && <p role="status" className="mt-1 text-xs text-text-dim">{saqlashHolati === 'saving' ? t('Suhbat serverga saqlanmoqda…') : saqlashHolati === 'saved' ? t('Suhbat serverga saqlandi') : t('Serverga saqlanmadi — bu oynani yopmang')}</p>}
        {saqlashHolati === 'local' && ((yangiServerSuhbat.current?.first && !yangiServerSuhbat.current.stale) ||
          (appendRetry.current && !appendRetry.current.stale)) && <button type="button"
          onClick={() => setSaqlashQadami(i => i + 1)} className="mt-1 rounded border border-border px-2 py-1 text-xs">
          {t('Qayta urinish')}
        </button>}
        {saqlashHolati === 'local' && pendingWrite && (!discardPending ? <button type="button"
          onClick={() => setDiscardPending(true)} className="ml-2 mt-1 rounded border border-border px-2 py-1 text-xs">
          {t('Yuborilmagan xabarlarni bekor qilish')}
        </button> : <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <span>{t('Mahalliy navbatdagi xabarlar o‘chirilsinmi?')}</span>
          <button type="button" onClick={() => void clearPendingWrite()} className="rounded border border-border px-2 py-1">{t('O‘chirishni tasdiqlash')}</button>
          <button type="button" onClick={() => setDiscardPending(false)} className="rounded border border-border px-2 py-1">{t('Bekor qilish')}</button>
        </div>)}
      </div>}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4" aria-live="polite">
        {studioScope && kasb?.kategoriyalar.includes('smeta_pul') && <p className="rounded-lg border border-border p-2 text-xs text-text-dim">{t('Jarvis joriy qoralamani o‘qiydi; u hali tasdiqlangan hujjat emas.')}</p>}
        {xabarlar.length === 0 && !kompaniyaId && (
          <div className="rounded-xl border border-border bg-surface-2 p-3 text-sm">
            <div className="flex items-center gap-2 font-semibold text-text"><Bot size={16} className="text-accent" /> {t('Tizim yordamchisi')}</div>
            <p className="mt-1 text-xs text-text-dim">{t('Kompaniya tanlanmagan: men tizim haqida (atamalar, sahifalar, hisob mantig‘i) javob beraman. Kompaniyani tanlasangiz — lavozimingizga mos AI ishchi sizning ma‘lumotlaringiz bo‘yicha ishlaydi.')}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['F2 nima?', 'Nakopitelniy qayerda?', 'Narxsiz qator jamiga qanday kiradi?', ...UMUMIY_SAVOLLAR].map((x) => (
                <button key={x} type="button" onClick={() => void yubor(t(x))} className="rounded-full border border-accent/40 px-2.5 py-1 text-xs text-accent hover:bg-accent/10">{t(x)}</button>
              ))}
            </div>
          </div>
        )}
        {xabarlar.length === 0 && kasb && (
          <div className="rounded-xl border border-border bg-surface-2 p-3 text-sm">
            <div className="flex items-center gap-2 font-semibold text-text"><Bot size={16} className="text-accent" /> {kasb.nom}</div>
            <p className="mt-1 text-xs text-text-dim">{kasb.vazifa}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {kasb.namuna_savollar.map((x) => (
                <button key={x} type="button" onClick={() => void yubor(x)} className="rounded-full border border-accent/40 px-2.5 py-1 text-xs text-accent hover:bg-accent/10">{x}</button>
              ))}
              {UMUMIY_SAVOLLAR.map((x) => (
                <button key={x} type="button" onClick={() => void yubor(t(x))} className="rounded-full border border-border px-2.5 py-1 text-xs text-text-dim hover:bg-surface-3">{t(x)}</button>
              ))}
            </div>
            {yordamchi && <div className="mt-2 flex flex-wrap gap-1.5" data-testid="jarvis-namunalar">
              {[t('Mindmapni och'), t('Narxsiz qatorlarni ko‘rsat'), t('F2 tarixini och'), t('Nima qila olasan?')].map((x) => (
                <button key={x} type="button" onClick={() => void yubor(x)} className="rounded-full border border-accent/40 px-2.5 py-1 text-xs text-accent hover:bg-accent/10">{x}</button>
              ))}
            </div>}
            {kasb.taqiq_izoh && <p className="mt-2 text-[11px] text-text-mute">🔒 {kasb.taqiq_izoh}</p>}
          </div>
        )}
        {xabarlar.length === 0 && yordamchi && korinadigan.length > 0 && (
          <div className="rounded-xl border border-border p-3 text-sm" data-testid="jarvis-suhbatlar">
            <div className="text-xs font-semibold text-text-dim">{t('Oldingi suhbatlar')}</div>
            <ul className="mt-1.5 space-y-1">{korinadigan.slice(0, 6).map((s) => (
              <li key={s.id}><button type="button" onClick={() => suhbatDavom(s)} className="w-full truncate rounded px-2 py-1 text-left text-xs text-text hover:bg-surface-2" title={s.sarlavha}>{s.sarlavha}</button></li>))}</ul>
          </div>
        )}
        {xabarlar.map((m) => (
          <div key={m.id} className={`flex gap-3 ${m.rol === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${m.rol === 'user' ? 'bg-surface-2 text-text-dim' : 'bg-accent/20 text-accent'}`}>
              {m.rol === 'user' ? <User size={16} /> : <Bot size={16} />}
            </div>
            <div className={`max-w-[85%] text-sm ${m.rol === 'user' ? 'rounded-[var(--radius-md)] rounded-tr-none bg-accent px-4 py-2 text-[var(--on-accent)]' : `fz-panel gap-1.5 rounded-tl-none px-3.5 py-2.5 text-text ${m.xato ? 'border-danger/50' : ''}`}`} data-testid={m.rol === 'ai' ? 'ai-javob-karta' : undefined}>
              {m.rol === 'ai' && !m.jonli && <div className="flex items-center gap-1.5">
                <span className="fz-panel__h">{m.yordam ? t('Tizim yordamchisi javobi') : m.jarvis ? 'Jarvis' : m.yakun?.kasb?.nom ?? t('AI javobi')}</span>
                {m.xato && <span className="fz-stamp fz-stamp--danger ml-auto">{t('Xato')}</span>}
                {!m.xato && m.yakun?.rad && <span className="fz-stamp fz-stamp--warn ml-auto">{t('Doiradan tashqari')}</span>}
              </div>}
              {m.rol === 'ai' && m.jonli && !m.qadamlar?.length && <span className="text-xs text-text-dim">{t('Ulanmoqda…')}</span>}
              {m.matn && <div className="prose prose-invert prose-sm max-w-none"><Markdown matn={m.matn} bogla={markdownBogla} /></div>}
              {m.rol === 'ai' && m.yakun?.rad && <div className="mt-1 text-[11px] text-warn">🛑 {t('Doiradan tashqari savol — model chaqirilmadi')}</div>}
              {m.rol === 'ai' && (m.qadamlar?.length || m.jonli) ? <AiQadamlar qadamlar={m.qadamlar ?? []} jonli={m.jonli === true} /> : null}
              <OtishTugmalari royxat={m.sahifalar ?? m.yakun?.sahifalar} ochish={ochish} />
              {m.obyektTanla?.length ? <div className="mt-2 flex flex-wrap gap-1.5" data-testid="yordamchi-obyekt-tanla">{m.obyektTanla.map((o) => (
                <button key={o.id} type="button" onClick={() => void yubor(`${o.nom} ${m.kutadi ?? ''}`)} className="rounded-full border border-accent/50 px-2.5 py-1 text-xs text-accent hover:bg-accent/10">{o.nom}</button>))}</div> : null}
              {m.tanlov?.length ? <div className="mt-2 flex flex-wrap gap-1.5" data-testid="yordamchi-tanlov">{m.tanlov.map((v) => (
                <button key={v.matn} type="button" onClick={() => void yubor(v.matn)} className="rounded-full border border-accent/50 px-2.5 py-1 text-xs text-accent hover:bg-accent/10">{v.nom}</button>))}</div> : null}
              {m.taklif && <YordamchiTaklif taklif={m.taklif} onTugadi={(natija) => { if (natija.length) setXabarlar((p) => [...p, { id: `${Date.now()}r`, rol: 'ai', jarvis: true, matn: natija.join('\n') }]); }} />}
              {kompaniyaId != null && m.yakun?.harakatlar?.map((h) => <AiHarakatKarta key={h.id} h={h} kompaniyaId={kompaniyaId} />)}
              {kompaniyaId != null && m.rol === 'ai' && m.yakun?.ok && !m.yakun.rad && m.yakun.model !== 'local' && <AiBaho kompaniyaId={kompaniyaId} profil={m.yakun.kasb?.profil} sahifa={sahifa} />}
              {m.yordam && <div className="mt-1 text-[11px] text-text-mute">{t('Tizim yordamchisi — model chaqirilmadi, token sarflanmadi')}</div>}
              {m.yakun?.ok && !m.yakun.rad && m.yakun.model !== 'local' && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-border pt-1.5 text-[10.5px] text-text-mute">
                  {(m.yakun.toifalar ?? []).map((x) => <span key={x} className="fz-chip" title={t('Javob shu ma’lumot toifasiga tayangan')}>{t(TOIFA_NOMI[x] ?? x)}</span>)}
                  <span className="ml-auto">{m.yakun.model} · {((m.yakun.ms ?? 0) / 1000).toFixed(1)} s</span>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={oxir} />
      </div>
      <div className="shrink-0 border-t border-border bg-surface-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="relative">
          <textarea readOnly={tahrirBand || outboxLoading} value={matn} onChange={(e) => setMatn(e.target.value)} rows={2} id="jarvis-kirish" data-testid="jarvis-kirish" autoFocus={!!yordamchi && !ixcham && !sensorliQurilma()}
            placeholder={yordamchi ? t('Masalan: «mindmapni och», «narxsiz qatorlar», «Yevropa 1 F2»') : t('Xabaringizni yozing...')}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void yubor(matn); } }}
            className={`max-h-[40vh] min-h-[72px] w-full resize-none [field-sizing:content] rounded-xl border border-border bg-surface py-3 pl-4 text-sm text-text focus:border-accent focus:outline-none ${ovozBor ? 'pr-28' : 'pr-12'}`} />
          {ovozBor && <>
            <button type="button" data-testid="ai-ovoz-til" onClick={() => setOvozTil((x) => { const y = OVOZ_TILLAR[(OVOZ_TILLAR.indexOf(x) + 1) % OVOZ_TILLAR.length]; try { localStorage.setItem('jarvis-ovoz-til', y); } catch { /* xotira yopiq */ } return y; })} disabled={tinglayapti}
              aria-label={t('Ovoz tili')} title={t('Ovoz tili')} className="absolute bottom-2.5 right-[5.25rem] rounded border border-border px-1.5 py-0.5 text-[11px] text-text-dim hover:text-text">{ovozTil === 'uz-UZ' ? 'UZ' : 'RU'}</button>
            <button type="button" data-testid="ai-ovoz-tugma" onClick={mikrofon} aria-pressed={tinglayapti} aria-label={tinglayapti ? t('Tinglashni to‘xtatish') : t('Ovoz bilan buyruq')}
              title={t('Ovoz faqat matnni to‘ldiradi — yuborish va tasdiqlash o‘zingizda')}
              className={`fz-btn fz-btn--icon absolute bottom-2 right-11 ${tinglayapti ? 'text-danger' : ''}`}>{tinglayapti ? <MicOff size={16} /> : <Mic size={16} />}</button>
          </>}
          {band ? (
            <button type="button" onClick={() => abort.current?.abort()} aria-label={t('To‘xtatish')} title={t('To‘xtatish')} className="fz-btn fz-btn--danger fz-btn--icon absolute bottom-2 right-2"><Square size={14} /></button>
          ) : (
            <button type="button" onClick={() => void yubor(matn)} disabled={!matn.trim() || outboxLoading} aria-label={t('Yuborish')} title={t('Yuborish')}
              className="fz-btn fz-btn--primary fz-btn--icon absolute bottom-2 right-2"><Send size={16} /></button>
          )}
        </div>
        <div className="mt-2 hidden text-center text-[10px] text-text-mute sm:block">{t('AI xato qilishi mumkin. Pul va omborga ta’sir qiluvchi harakatlar faqat sizning tasdig‘ingiz bilan bajariladi.')}</div>
      </div>
    </>
  );
}

/** Actor/company change mounts isolated state before any old history can render. */
export function AiChat(props: Parameters<typeof AiChatContent>[0]) {
  return <AiChatContent key={`${props.foydalanuvchiId ?? "anonymous"}:${props.kompaniyaId ?? "general"}`} {...props} />;
}
