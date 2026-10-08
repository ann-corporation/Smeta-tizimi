import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowRight, Bot, Send, Square, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { kasbSavolOqim, tizimYordamSavol, type KasbIshchi, type KasbYakun, type Qadam, type SahifaIshora } from '../../api/t2-agent-ish';
import { jarvisSalommi } from '../../lib/jarvis/intent';
import { t } from '../../i18n/til';
import { AiBaho } from './AiBaho';
import { AiHarakatKarta } from './AiHarakatKarta';
import { AiQadamlar } from './AiQadamlar';
import { TOIFA_NOMI } from './ai-harakat';

type Xabar = { id: string; rol: 'user' | 'ai'; matn: string; yakun?: KasbYakun; qadamlar?: Qadam[]; jonli?: boolean; xato?: boolean; sahifalar?: SahifaIshora[]; yordam?: boolean };
/** Istalgan joydan chatni tayyor savol bilan ochish: AiHelper `ai:ochish` hodisasini (detail: { savol }) eshitadi. */
export type TayyorSavol = { id: number; matn: string };

const XATO_MATNI: Record<string, string> = {
  BYUDJET_YOQ: 'AI hali sozlanmagan: platforma oylik limiti belgilanmagan. Administratorga murojaat qiling.',
  BYUDJET_TUGADI: 'AI oylik limiti tugadi. Administrator limitni oshirishi mumkin.',
  TOKEN_YETMAYDI: 'Tokenlar yetarli emas — hisobni to‘ldiring.',
  KOMPANIYA_AI_OCHIQ: 'Kompaniya administratori AI ni o‘chirgan (Sozlamalar → AI).',
  TOKEN_LIMIT_TUGADI: 'Kompaniyaning AI oylik token limiti tugadi.',
};

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
export function AiChat({ kompaniyaId, kasb, sahifa, generatsiya, tayyorSavol, onOtish, onOqildi }: { kompaniyaId: number | null; kasb: KasbIshchi | null; sahifa: string; generatsiya: number; tayyorSavol?: TayyorSavol | null; onOtish?: () => void; onOqildi?: () => void }) {
  const navigate = useNavigate();
  const [xabarlar, setXabarlar] = useState<Xabar[]>([]);
  const [matn, setMatn] = useState('');
  const [band, setBand] = useState(false);
  const oxir = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const gen = useRef(generatsiya);
  gen.current = generatsiya;

  useEffect(() => { setXabarlar([]); setMatn(''); setBand(false); abort.current?.abort(); }, [generatsiya, kompaniyaId]);
  useEffect(() => { oxir.current?.scrollIntoView?.({ behavior: 'smooth' }); }, [xabarlar]);

  useEffect(() => { if (tayyorSavol?.matn) { void yubor(tayyorSavol.matn); onOqildi?.(); } /* faqat yangi hodisada */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tayyorSavol?.id]);

  const ochish = (yol: string) => { navigate(yol); onOtish?.(); };

  const yubor = async (savol: string) => {
    const s = savol.trim();
    if (!s || band) return;
    const boshlangich = gen.current;
    const id = Date.now().toString();
    setMatn('');
    if (!kompaniyaId) {   // kompaniya/lavozim yo'q: tokensiz «Tizim yordamchisi» (lug'at + sahifa katalogi), kompaniya ma'lumotisiz
      setXabarlar((p) => [...p, { id, rol: 'user', matn: s }]);
      const y = await tizimYordamSavol(s, sahifa);
      setXabarlar((p) => [...p, { id: id + 'a', rol: 'ai', yordam: true, xato: !y.ok, matn: y.ok ? y.natija.javob : y.error, sahifalar: y.ok ? y.natija.sahifalar : [] }]);
      return;
    }
    if (jarvisSalommi(s) && kasb) {
      const javob = `${t('Salom! Men —')} **${kasb.nom}**. ${kasb.vazifa}`;
      setXabarlar((p) => [...p, { id, rol: 'user', matn: s }, { id: id + 'a', rol: 'ai', matn: javob }]);
      return;
    }
    setXabarlar((p) => [...p, { id, rol: 'user', matn: s }, { id: id + 'a', rol: 'ai', matn: '', jonli: true, qadamlar: [] }]);
    setBand(true);
    const ctrl = new AbortController(); abort.current = ctrl;
    const yakun = await kasbSavolOqim(kompaniyaId, s, {
      sahifa, signal: ctrl.signal,
      qadam: (q) => { if (gen.current === boshlangich) setXabarlar((p) => p.map((x) => (x.id === id + 'a' ? { ...x, qadamlar: [...(x.qadamlar ?? []), q] } : x))); },
    });
    if (gen.current !== boshlangich) return;   // kompaniya almashdi — eski javob ko'rsatilmaydi
    setBand(false);
    setXabarlar((p) => p.map((x) => (x.id === id + 'a' ? {
      ...x, jonli: false, yakun, xato: !yakun.ok, qadamlar: yakun.qadamlar ?? x.qadamlar,
      matn: yakun.ok ? (yakun.javob ?? '') : t(XATO_MATNI[yakun.code ?? ''] ?? yakun.error ?? 'AI javob bera olmadi'),
    } : x)));
  };

  const UMUMIY_SAVOLLAR = ['Bu sahifa nima uchun kerak?', 'Bu yerdagi raqamlar nimani bildiradi?', 'Keyingi qadam nima?'];
  return (
    <>
      <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {xabarlar.length === 0 && !kompaniyaId && (
          <div className="rounded-xl border border-border bg-surface-2 p-3 text-sm">
            <div className="flex items-center gap-2 font-semibold text-text"><Bot size={16} className="text-accent" /> {t('Tizim yordamchisi')}</div>
            <p className="mt-1 text-xs text-text-dim">{t('Kompaniya tanlanmagan: men tizim haqida (atamalar, sahifalar, hisob mantig‘i) javob beraman. Kompaniyani tanlasangiz — lavozimingizga mos AI ishchi sizning ma‘lumotlaringiz bo‘yicha ishlaydi.')}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['F2 nima?', 'Nakopitelniy qayerda?', 'NULL va 0 farqi nima?', ...UMUMIY_SAVOLLAR].map((x) => (
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
                <button key={x} type="button" onClick={() => void yubor(t(x))} className="rounded-full border border-border px-2.5 py-1 text-xs text-text-dim hover:bg-white/5">{t(x)}</button>
              ))}
            </div>
            {kasb.taqiq_izoh && <p className="mt-2 text-[11px] text-text-mute">🔒 {kasb.taqiq_izoh}</p>}
          </div>
        )}
        {xabarlar.map((m) => (
          <div key={m.id} className={`flex gap-3 ${m.rol === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${m.rol === 'user' ? 'bg-surface-2 text-text-dim' : 'bg-accent/20 text-accent'}`}>
              {m.rol === 'user' ? <User size={16} /> : <Bot size={16} />}
            </div>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${m.rol === 'user' ? 'rounded-tr-none bg-accent text-white' : `rounded-tl-none border bg-surface-2 text-text ${m.xato ? 'border-danger/50' : 'border-border'}`}`}>
              {m.rol === 'ai' && m.jonli && !m.qadamlar?.length && <span className="text-xs text-text-dim">{t('Ulanmoqda…')}</span>}
              {m.matn && <div className="prose prose-invert prose-sm max-w-none"><ReactMarkdown>{m.matn}</ReactMarkdown></div>}
              {m.rol === 'ai' && m.yakun?.rad && <div className="mt-1 text-[11px] text-warn">🛑 {t('Doiradan tashqari savol — model chaqirilmadi')}</div>}
              {m.rol === 'ai' && (m.qadamlar?.length || m.jonli) ? <AiQadamlar qadamlar={m.qadamlar ?? []} jonli={m.jonli === true} /> : null}
              <OtishTugmalari royxat={m.sahifalar ?? m.yakun?.sahifalar} ochish={ochish} />
              {kompaniyaId != null && m.yakun?.harakatlar?.map((h) => <AiHarakatKarta key={h.id} h={h} kompaniyaId={kompaniyaId} />)}
              {kompaniyaId != null && m.rol === 'ai' && m.yakun?.ok && !m.yakun.rad && m.yakun.model !== 'local' && <AiBaho kompaniyaId={kompaniyaId} profil={m.yakun.kasb?.profil} sahifa={sahifa} />}
              {m.yordam && <div className="mt-1 text-[11px] text-text-mute">{t('Tizim yordamchisi — model chaqirilmadi, token sarflanmadi')}</div>}
              {m.yakun?.ok && !m.yakun.rad && m.yakun.model !== 'local' && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-1.5 text-[10px] text-text-mute">
                  {(m.yakun.toifalar ?? []).map((x) => <span key={x} className="rounded bg-surface px-1.5 py-0.5">{t(TOIFA_NOMI[x] ?? x)}</span>)}
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
          <textarea value={matn} onChange={(e) => setMatn(e.target.value)} rows={1} placeholder={t('Xabaringizni yozing...')}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void yubor(matn); } }}
            className="max-h-32 min-h-[44px] w-full resize-none rounded-xl border border-border bg-surface py-3 pl-4 pr-12 text-sm text-white focus:border-accent focus:outline-none" />
          {band ? (
            <button type="button" onClick={() => abort.current?.abort()} aria-label={t('To‘xtatish')} title={t('To‘xtatish')} className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg bg-danger text-white"><Square size={14} /></button>
          ) : (
            <button type="button" onClick={() => void yubor(matn)} disabled={!matn.trim()} aria-label={t('Yuborish')} title={t('Yuborish')}
              className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white disabled:cursor-not-allowed disabled:opacity-50"><Send size={16} /></button>
          )}
        </div>
        <div className="mt-2 text-center text-[10px] text-text-mute">{t('AI xato qilishi mumkin. Pul va omborga ta’sir qiluvchi harakatlar faqat sizning tasdig‘ingiz bilan bajariladi.')}</div>
      </div>
    </>
  );
}
