import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowRight, Bot, Mic, MicOff, Send, Square, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { kasbSavolOqim, tizimYordamSavol, type KasbIshchi, type KasbYakun, type Qadam, type SahifaIshora } from '../../api/t2-agent-ish';
import { jarvisKichikGap } from '../../lib/jarvis/intent';
import { katalogKonteksti, narxSavolimi, vaqtBilan, type KatalogKontekst } from '../../lib/jarvis/katalog-kontekst';
import { t } from '../../i18n/til';
import { niyatAniqla, type Niyat } from '../../lib/yordamchi/niyat';
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
import { TOIFA_NOMI } from './ai-harakat';
import { studioKontekstObuna, studioKontekstOl, studioKontekstScope } from '../../lib/jarvis/studio-kontekst';

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

const ichkiYolmi = (h?: string): h is string => typeof h === 'string' && h.startsWith('/') && !h.startsWith('//');

/** Seans tarixi (sessionStorage): faqat yakunlangan xabarlar; taklif kartasi (funksiyalar) saqlanmaydi. */
function tarixOqi(kalit: string): Xabar[] {
  try { const v = JSON.parse(sessionStorage.getItem(kalit) ?? '[]'); return Array.isArray(v) ? (v as Xabar[]).slice(-30) : []; } catch { return []; }
}
function tarixYoz(kalit: string, x: readonly Xabar[]) {
  try { sessionStorage.setItem(kalit, JSON.stringify(x.filter((m) => !m.jonli).slice(-30).map(({ taklif: _t, ...q }) => q))); } catch { /* xotira yopiq */ }
}

/** AI ko'rsatgan sahifalarga o'tish tugmalari (yo'llar serverda katalog bilan tekshirilgan). */
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
export function AiChat({ kompaniyaId, kasb, sahifa, generatsiya, tayyorSavol, onOtish, onOqildi, yordamchi }: { kompaniyaId: number | null; kasb: KasbIshchi | null; sahifa: string; generatsiya: number; tayyorSavol?: TayyorSavol | null; onOtish?: () => void; onOqildi?: () => void; yordamchi?: YordamchiUlanish }) {
  const navigate = useNavigate();
  const [xabarlar, setXabarlar] = useState<Xabar[]>([]);
  const [matn, setMatn] = useState('');
  const [band, setBand] = useState(false);
  const oxir = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const studioScope = useSyncExternalStore(studioKontekstObuna, () => studioKontekstScope(kompaniyaId, sahifa), () => '');
  const scope = `${generatsiya}|${kompaniyaId}|${sahifa}|${studioScope}`;
  const gen = useRef(scope);
  gen.current = scope;
  const yaRef = useRef(yordamchi); yaRef.current = yordamchi;
  const xabarlarRef = useRef<Xabar[]>([]); xabarlarRef.current = xabarlar;
  /** Obyekt ma'lumoti yuklanishini kutayotgan buyruq (obyekt tanlangach avtomatik davom etadi). */
  const kutish = useRef<{ id: string; matn: string; obyektId: number } | null>(null);
  /** Vosita aniqlashtiruvchi savoli: keyingi xabar shunga javob (yangi suhbat/kompaniya almashsa tozalanadi). */
  const davomRef = useRef<Davom | null>(null);

  /* Yagona yordamchi: suhbat tarixi seans davomida saqlanadi (sahifa almashsa ham, oyna yopilsa ham); kompaniya bo'yicha alohida. */
  const tarixKalit = yordamchi ? `jarvis-chat:${kompaniyaId ?? 0}` : null;
  useEffect(() => { setXabarlar(tarixKalit ? tarixOqi(tarixKalit) : []); setMatn(''); setBand(false); busy.current = false; davomRef.current = null; abort.current?.abort();
    return () => { abort.current?.abort(); };
  }, [scope]);
  useEffect(() => { if (tarixKalit) tarixYoz(tarixKalit, xabarlar); }, [xabarlar, tarixKalit]);
  useEffect(() => { oxir.current?.scrollIntoView?.({ behavior: 'smooth' }); }, [xabarlar]);
  /* «Yangi suhbat»: tarix tozalanadi (sarlavhadagi tugma `ai:yangi-suhbat` hodisasini yuboradi). */
  useEffect(() => {
    const f = () => { abort.current?.abort(); busy.current = false; kutish.current = null; setBand(false); setMatn(''); setXabarlar([]); if (tarixKalit) { try { sessionStorage.removeItem(tarixKalit); } catch { /* xotira yopiq */ } } };
    window.addEventListener('ai:yangi-suhbat', f);
    return () => window.removeEventListener('ai:yangi-suhbat', f);
  }, [tarixKalit]);

  useEffect(() => { if (tayyorSavol?.matn) { void yubor(tayyorSavol.matn); onOqildi?.(); } /* faqat yangi hodisada */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tayyorSavol?.id]);

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
  const tarixOl = () => xabarlarRef.current.filter((x) => x.matn && !x.jonli).slice(-6).map((x) => ({ rol: x.rol === 'user' ? 'user' as const : 'assistant' as const, matn: x.matn.slice(0, 600) }));

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
    if (!s || (busy.current && !davom)) return;
    const boshlangich = gen.current;
    const id = davom?.id ?? Date.now().toString();
    if (!davom) setMatn('');
    let qoshHavola: SahifaIshora[] = []; let yaqinHavola: SahifaIshora[] = [];

    /* YAGONA YORDAMCHI (Jarvis) qatlami: navigatsiya, o'qish, yozuv taklifi — bepul va bir zumda; hal qilmasa mavjud oqim davom etadi. */
    const ya = yaRef.current;
    if (ya && ya.sahifalar.length && !jarvisKichikGap(s)) {
      const davom = davomRef.current; davomRef.current = null;
      if (davom && davomBekorMi(s)) { setXabarlar((p) => [...p, { id, rol: 'user', matn: s }, { id: id + 'a', rol: 'ai', jarvis: true, matn: t('Bekor qildim — hech narsa yozilmadi.') }]); setMatn(''); return; }
      const n: Niyat = davom ? { tur: 'vosita', id: davom.id, davom } : niyatAniqla(s, { sahifalar: ya.sahifalar, obyektlar: ya.obyektlar, joriyObyekt: ya.joriyObyekt, sahifaAmallar: ya.sahifaAmallar });
      const faqatNav = n.tur === 'yordam' || n.tur === 'kim' || n.tur === 'dars' || n.tur === 'ruxsatYoq' || n.tur === 'sahifaTanla' || n.tur === 'navigatsiya' || n.tur === 'sahifaAmal';
      const mahalliy = (n.tur === 'navigatsiya' ? n.aniqOchish : n.tur !== 'nomalum') && (kompaniyaId != null || faqatNav);
      if (n.tur === 'navigatsiya' && !n.aniqOchish) qoshHavola = [{ yol: n.sahifa.url, nom: n.sahifa.nom }];
      if (n.tur === 'nomalum') yaqinHavola = n.yaqin.map((x) => ({ yol: x.url, nom: x.nom }));
      if (mahalliy) {
        if (!davom) setXabarlar((p) => [...p, { id, rol: 'user', matn: s }, { id: id + 'a', rol: 'ai', matn: '', jonli: true, jarvis: true, qadamlar: [], kutadi: s }]);
        setBand(true); busy.current = true;
        const ctrl = new AbortController(); abort.current = ctrl;
        let r: IshlovNatija;
        try {
          r = await yordamchiIshla(n, s, {
            kompaniyaId, sahifalar: ya.sahifalar, motor: ya.motor, tarix: tarixOl(), hujjat: ya.hujjat ?? undefined, sahifaAmalBajar: ya.sahifaAmalBajar, kim: ya.kim, vosita: ya.vosita,
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
    setXabarlar((p) => [...p, { id, rol: 'user', matn: s }, { id: id + 'a', rol: 'ai', matn: '', jonli: true, qadamlar: [] }]);
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
      sahifa, signal: ctrl.signal, katalog, studio, obyektNomi: ya?.joriyObyekt?.nom ?? null,
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
    if (tinglayapti) { tinglov.current?.toxtat(); return; }
    const bosh = matn.trim();
    const hd = ovozBoshla(ovozTil, {
      natija: (m) => setMatn(bosh ? `${bosh} ${m}` : m),
      xato: (kod) => { setTinglayapti(false); toast(kod === 'not-allowed' || kod === 'service-not-allowed' ? t('Mikrofonga ruxsat berilmagan — matn bilan yozing.') : t('Ovoz tanilmadi — qayta urinib ko‘ring yoki matn bilan yozing.'), 'warn'); },
      tugadi: () => setTinglayapti(false),
    });
    tinglov.current = hd; setTinglayapti(!!hd);
  }
  const UMUMIY_SAVOLLAR = ['Bu sahifa nima uchun kerak?', 'Bu yerdagi raqamlar nimani bildiradi?', 'Keyingi qadam nima?'];
  return (
    <>
      <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
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
              {m.matn && <div className="prose prose-invert prose-sm max-w-none"><ReactMarkdown components={markdownBogla}>{m.matn}</ReactMarkdown></div>}
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
      <div className="border-t border-border bg-surface-2 p-3">
        <div className="relative">
          <textarea value={matn} onChange={(e) => setMatn(e.target.value)} rows={2} id="jarvis-kirish" data-testid="jarvis-kirish" autoFocus={!!yordamchi}
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
            <button type="button" onClick={() => void yubor(matn)} disabled={!matn.trim()} aria-label={t('Yuborish')} title={t('Yuborish')}
              className="fz-btn fz-btn--primary fz-btn--icon absolute bottom-2 right-2"><Send size={16} /></button>
          )}
        </div>
        <div className="mt-2 text-center text-[10px] text-text-mute">{t('AI xato qilishi mumkin. Pul va omborga ta’sir qiluvchi harakatlar faqat sizning tasdig‘ingiz bilan bajariladi.')}</div>
      </div>
    </>
  );
}
