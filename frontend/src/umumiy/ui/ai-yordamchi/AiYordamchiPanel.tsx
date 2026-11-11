/**
 * Sahifa AI yordamchisi paneli (egasi 2026-10-25: «fakt va F2 tayyorlash oynalarida AI xuddi Smeta Studio'dagi agent kuchida
 * ishlasin»). Smeta Studio agenti bilan BIR xil qismlar (AgentQismlar) va bir xil server qatlami (/api/smeta-ai, kompaniya
 * AI byudjeti va hisobi): model vositalar bilan real ma'lumotni o'qiydi, amallarni faqat TAKLIF qiladi; har yozuv —
 * foydalanuvchi «Bajarish» ni bosgandan keyin mavjud yozish yo'li orqali (kiritma + Saqlash, mavjud oynalar).
 *
 * `satr` varianti (Ctrl+K «AI buyruq satri»): xuddi shu agent sikli, ixcham bitta qator ko'rinishida — yangi panel/dvigatel emas.
 * Qo'shimchalar: ovozli kiritish (faqat matnga yozadi, avto-yubormaydi, hech qachon tasdiqlamaydi), yuborishdan oldin token chipi,
 * bir xil mazmunni qayta yechmaslik (keshKalit), pul/huquqiy amallar uchun ikkinchi «Tasdiqlayman».
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Mic, MicOff, Sparkles, X } from 'lucide-react';
import { t, tilOl } from '../../../i18n/til';
import { ModelChip } from '../ModelChip';
import { AgentAmallar, AgentPulTasdiq, AgentQadamlar, AgentXabarlar, type AgentQadam } from './AgentQismlar';
import { agentSikli, type SahifaVositalar } from '../../../lib/ai-yordamchi/sikl';
import type { SahifaAmal, SahifaXabar } from '../../../lib/ai-yordamchi/protokol';
import { OVOZ_TILLAR, ovozBoshla, ovozQollanadimi, ovozSukutTil, type OvozTil } from '../../../lib/ai-yordamchi/ovoz';
import { buyruqKeshdan, buyruqKeshgaYoz } from '../../../lib/ai-yordamchi/buyruq-narx';

const XATO: Record<string, string> = {
  AI_NOT_CONFIGURED: 'AI hali sozlanmagan (Cloudflare’da AI kaliti yo‘q).',
  BYUDJET_YOQ: 'AI uchun oylik limit belgilanmagan — Boshqaruv → AI markazi → Xarajat bo‘limida limit qo‘ying.',
  BYUDJET_TUGADI: 'AI oylik limiti tugadi.', TOKEN_YETMAYDI: 'Tokenlar yetarli emas — hisobni to‘ldiring.',
  KOMPANIYA_AI_OCHIQ: 'Kompaniya admini AI ni o‘chirgan.', FORBIDDEN: 'Bu kompaniyaga ruxsat yo‘q.', AUTH_REQUIRED: 'Sessiya tugagan — qayta kiring.',
};
const xatoMatn = (code: string, message?: string) => t(XATO[code] ?? message ?? 'AI hozir javob bermadi. Keyinroq qayta urinib ko‘ring.');

type Taklif = SahifaAmal & { ogoh: string | null; tanlangan: boolean };

export function AiYordamchiPanel({ kompaniyaId, vositalar, saqlashKalit, sarlavha, namunalar, qoshimcha, satr = false, ochiq: ochiqProp, onOchiq, ovoz = false, narxChip, amalQoshimcha, keshKalit }: {
  kompaniyaId: number; vositalar: SahifaVositalar;
  /** Suhbat shu kalit bilan (masalan obyekt bo'yicha) brauzerda saqlanadi — faqat qulaylik. */
  saqlashKalit: string; sarlavha: string; namunalar: readonly string[];
  /** Sahifaga xos qo'shimcha bo'lim (masalan F2: «Matndan reja») — suhbat ustida, panel ichida. */
  qoshimcha?: ReactNode;
  /** Ixcham buyruq satri ko'rinishi (Ctrl+K): suzuvchi tugma yo'q, bitta kiritish qatori. */
  satr?: boolean;
  /** Tashqaridan boshqariladigan ochiq/yopiq (Ctrl+K uchun). Berilmasa panel o'zi boshqaradi. */
  ochiq?: boolean; onOchiq?: (v: boolean) => void;
  /** Ovozli kiritish (Web Speech API). Brauzer qo'llamasa tugma yashiriladi. */
  ovoz?: boolean;
  /** Yuborishdan oldin ko'rinadigan token narxi chipi (buyruq matniga qarab). */
  narxChip?: (matn: string) => ReactNode;
  /** Taklif kartasiga qo'shimcha: masalan pul farqi (SummaJuft). */
  amalQoshimcha?: (a: SahifaAmal) => ReactNode;
  /** Bir xil mazmun kaliti: berilsa, shu kalit bilan natija qayta ishlatiladi (token takror yechilmaydi). */
  keshKalit?: { (matn: string): Promise<string> };
}) {
  const [ichkiOchiq, setIchkiOchiq] = useState(false);
  const ochiq = ochiqProp ?? ichkiOchiq;
  const setOchiq = (v: boolean) => { setIchkiOchiq(v); onOchiq?.(v); };
  const kalit = `ai-yordamchi:${saqlashKalit}`;
  const [xabarlar, setXabarlar] = useState<SahifaXabar[]>(() => { try { const v = JSON.parse(localStorage.getItem(kalit) ?? '[]'); return Array.isArray(v) ? v.slice(-30) : []; } catch { return []; } });
  useEffect(() => { try { localStorage.setItem(kalit, JSON.stringify(xabarlar.slice(-30))); } catch { /* storage off */ } }, [xabarlar, kalit]);
  const [matn, setMatn] = useState('');
  const [band, setBand] = useState(false);
  const [holat, setHolat] = useState('');
  const [qadamlar, setQadamlar] = useState<AgentQadam[]>([]);
  const [takliflar, setTakliflar] = useState<Taklif[]>([]);
  /** Pul ta'sirli amal tanlangan: «Bajarish»dan keyin ikkinchi aniq tasdiq kutilmoqda. */
  const [pulTasdiq, setPulTasdiq] = useState(false);
  const tirik = useRef(true);
  const vRef = useRef(vositalar); vRef.current = vositalar;
  const oxir = useRef<HTMLDivElement>(null);
  useEffect(() => { tirik.current = true; return () => { tirik.current = false; }; }, []);
  useEffect(() => { oxir.current?.scrollIntoView?.({ block: 'nearest' }); }, [xabarlar.length, band]);
  const qadam = (q: AgentQadam) => setQadamlar(l => [...l.map(x => (x.holat === 'ishda' ? { ...x, holat: 'ok' as const } : x)), q].slice(-40));

  /* Ovoz: faqat input matnini to'ldiradi. Yuborish ham, tasdiq ham — foydalanuvchining qo'lida. */
  const ovozBor = useMemo(() => ovoz && ovozQollanadimi(), [ovoz]);
  const [ovozTil, setOvozTil] = useState<OvozTil>(() => ovozSukutTil(tilOl()));
  const [tinglayapti, setTinglayapti] = useState(false);
  const tinglov = useRef<{ toxtat: () => void } | null>(null);
  useEffect(() => () => { tinglov.current?.toxtat(); }, []);
  function mikrofon() {
    if (tinglayapti) { tinglov.current?.toxtat(); return; }
    const bosh = matn.trim();
    const h = ovozBoshla(ovozTil, {
      natija: (m) => { if (tirik.current) setMatn(bosh ? `${bosh} ${m}` : m); },
      xato: (kod) => { if (tirik.current) { setTinglayapti(false); setHolat(kod === 'not-allowed' || kod === 'service-not-allowed' ? t('Mikrofonga ruxsat berilmagan — matn bilan yozing.') : t('Ovoz tanilmadi — qayta urinib ko‘ring yoki matn bilan yozing.')); } },
      tugadi: () => { if (tirik.current) setTinglayapti(false); },
    });
    tinglov.current = h; setTinglayapti(!!h);
    if (!h) setHolat(t('Bu brauzerda ovozli kiritish yo‘q — matn bilan yozing.'));
  }

  async function yubor(txt?: string) {
    const m = (txt ?? matn).trim();
    if (!m || band) return;
    tinglov.current?.toxtat();
    const yangi = [...xabarlar, { rol: 'user' as const, matn: m }];
    setXabarlar(yangi); setMatn(''); setHolat(''); setBand(true); setQadamlar([]); setTakliflar([]); setPulTasdiq(false);
    try {
      const xesh = keshKalit ? await keshKalit(m).catch(() => null) : null;
      const keshda = xesh ? buyruqKeshdan(xesh) : null;
      if (keshda) {
        // Bir xil mazmun: natija qayta ishlatiladi — model chaqirilmaydi, token qayta yechilmaydi.
        if (!tirik.current) return;
        qadam({ matn: t('Bir xil buyruq — oldingi natija qayta ishlatildi, token qayta yechilmadi'), holat: 'ok' });
        setXabarlar(x => [...x, { rol: 'assistant', matn: [keshda.javob, ...keshda.savollar.map(s => '• ' + s)].filter(Boolean).join('\n') || t('Tushunarli.') }]);
        setTakliflar(keshda.amallar.map(a => { const ogoh = vRef.current.tekshir(a); return { ...a, ogoh, tanlangan: !ogoh }; }));
        return;
      }
      qadam({ matn: t('Savolingizni o‘qiyapman va sahifa ma’lumotini tekshiraman'), holat: 'ishda' });
      const r = await agentSikli({ kompaniyaId, xabarlar: yangi, vositalar: { ...vRef.current, kontekst: () => vRef.current.kontekst(), oqi: s => vRef.current.oqi(s) }, qadam, tirikmi: () => tirik.current });
      if (!tirik.current) return;
      if (!r.ok) { qadam({ matn: xatoMatn(r.code, r.message), holat: 'xato' }); setHolat(xatoMatn(r.code, r.message)); return; }
      if (xesh) buyruqKeshgaYoz(xesh, r);
      qadam({ matn: t('Tayyor: {a} ta amal taklifi', { a: r.amallar.length }), holat: 'ok' });
      setXabarlar(x => [...x, { rol: 'assistant', matn: [r.javob, ...r.savollar.map(s => '• ' + s)].filter(Boolean).join('\n') || t('Tushunarli.') }]);
      setTakliflar(r.amallar.map(a => ({ ...a, tanlangan: !a.ogoh })));
      if (r.ogohlantirish) setHolat(r.ogohlantirish);
    } finally { if (tirik.current) setBand(false); }
  }

  const pulMi = (a: SahifaAmal) => vRef.current.pul?.(a) === true;

  /** `tasdiqlangan` — pul ta'sirli amalda ikkinchi aniq tasdiq («Tasdiqlayman») berilgan. */
  async function bajar(tasdiqlangan = false) {
    const tanlangan = takliflar.filter(a => a.tanlangan && !a.ogoh);
    if (!tanlangan.length) return;
    if (!tasdiqlangan && tanlangan.some(pulMi)) { setPulTasdiq(true); return; }
    setPulTasdiq(false);
    setBand(true);
    try {
      const natija = await vRef.current.bajar(tanlangan.map(({ tanlangan: _t, ogoh: _o, ...a }) => a));
      if (!tirik.current) return;
      setTakliflar([]);
      if (natija.length) setXabarlar(x => [...x, { rol: 'assistant', matn: natija.join('\n') }]);
    } finally { if (tirik.current) setBand(false); }
  }

  const amalQatorlari = takliflar.map(a => ({ nom: vositalar.nomi(a), izoh: a.izoh, ogoh: a.ogoh, tanlangan: a.tanlangan, pul: pulMi(a), qoshimcha: amalQoshimcha?.(a) }));
  const amallarBlok = pulTasdiq
    ? <AgentPulTasdiq band={band} amallar={amalQatorlari} onTasdiq={() => void bajar(true)} onOrqaga={() => setPulTasdiq(false)} />
    : <AgentAmallar band={band} onBajar={() => void bajar()} onBekor={() => { setTakliflar([]); setPulTasdiq(false); }}
      onTanla={(i, v) => setTakliflar(l => l.map((x, j) => (j === i && !x.ogoh ? { ...x, tanlangan: v } : x)))} amallar={amalQatorlari} />;

  if (satr) {
    if (!ochiq) return null;
    const korinadi = xabarlar.length > 0 || band || qadamlar.length > 0 || takliflar.length > 0 || !!holat;
    return <aside role="dialog" aria-modal="false" aria-label={sarlavha} data-testid="ai-buyruq-satr"
      className="fixed left-1/2 top-14 z-50 flex max-h-[80vh] w-[min(46rem,calc(100vw-1.5rem))] -translate-x-1/2 flex-col gap-2 overflow-hidden rounded-2xl border border-border bg-surface p-3 text-sm shadow-2xl"
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setOchiq(false); } }}>
      <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); void yubor(); }}>
        <Sparkles size={16} className="shrink-0 text-accent" />
        <input autoFocus type="text" aria-label={t('AI buyruq')} data-testid="ai-buyruq-kirish" className="input h-9 min-w-0 flex-1 text-[13px]" value={matn} disabled={band}
          placeholder={t('Buyruq: masalan «narxsiz qatorlarni ko‘rsat»')} onChange={e => setMatn(e.target.value)} />
        {ovozBor && <>
          <select aria-label={t('Ovoz tili')} data-testid="ai-ovoz-til" className="input h-9 w-[4.2rem] px-1 text-[12px]" value={ovozTil} onChange={e => setOvozTil(e.target.value as OvozTil)} disabled={tinglayapti}>
            {OVOZ_TILLAR.map(x => <option key={x} value={x}>{x === 'uz-UZ' ? 'UZ' : 'RU'}</option>)}
          </select>
          <button type="button" data-testid="ai-ovoz-tugma" aria-pressed={tinglayapti} aria-label={tinglayapti ? t('Tinglashni to‘xtatish') : t('Ovoz bilan buyruq')}
            title={t('Ovoz faqat matnni to‘ldiradi — yuborish va tasdiqlash o‘zingizda')} onClick={mikrofon}
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${tinglayapti ? 'border-danger text-danger' : 'border-border text-text-dim hover:text-text'}`}>
            {tinglayapti ? <MicOff size={16} /> : <Mic size={16} />}</button>
        </>}
        <button type="submit" className="tugma tugma-asosiy h-9 px-3" disabled={band || !matn.trim()}>{t('Yuborish')}</button>
        <button type="button" onClick={() => setOchiq(false)} aria-label={t('Yopish')} className="rounded p-1 text-text-dim hover:bg-surface-3 hover:text-text"><X size={16} /></button>
      </form>
      {narxChip && <div className="text-[11px] text-text-mute" data-testid="ai-buyruq-narx">{narxChip(matn)}</div>}
      {!korinadi && namunalar.length > 0 && <div className="flex flex-wrap gap-1.5">{namunalar.map(x => <button key={x} type="button" onClick={() => setMatn(x)} className="rounded-full border border-accent/40 px-2.5 py-1 text-[11.5px] text-accent hover:bg-accent/10">{x}</button>)}</div>}
      {korinadi && <div className="karta max-h-[46vh] min-h-[60px] space-y-2 overflow-auto p-2" role="log" aria-live="polite">
        <AgentXabarlar xabarlar={xabarlar.slice(-6)} />
        <AgentQadamlar qadamlar={qadamlar} band={band} sarlavha={(n, ishda) => ishda ? t('Yordamchi ishlayapti — {n} qadam', { n }) : t('Yordamchi nima qildi ({n} qadam)', { n })} />
        <div ref={oxir} />
      </div>}
      {holat && <p role="status" className="text-xs text-warn">{holat}</p>}
      {amallarBlok}
      <p className="text-center text-[10px] text-text-mute">{t('AI faqat taklif qiladi: yozuv «Bajarish» bilan, pul ta’sirli amal ikkinchi «Tasdiqlayman» bilan. Ovoz hech qachon tasdiqlamaydi.')}</p>
    </aside>;
  }

  if (!ochiq) return <button type="button" onClick={() => setOchiq(true)} aria-label={t('AI yordamchini ochish')} title={t('AI yordamchi: qidiradi, tushuntiradi, taklif qiladi — yozuv faqat sizning tasdig‘ingiz bilan')}
    className="fixed bottom-3 right-16 z-40 inline-flex h-11 items-center gap-1.5 rounded-full bg-accent px-3 text-[12px] font-semibold text-[var(--on-accent)] opacity-75 shadow-xl transition hover:opacity-100 hover:brightness-110 focus-visible:opacity-100" data-testid="ai-yordamchi-ochish">
    <Sparkles size={16} /> {t('AI yordamchi')}</button>;

  return <aside role="dialog" aria-modal="false" aria-label={sarlavha} className="fixed bottom-4 right-4 z-50 flex max-h-[85vh] w-[28rem] max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-hidden rounded-2xl border border-border bg-surface p-3 text-sm shadow-2xl" data-testid="ai-yordamchi-panel">
    <div className="flex items-center gap-2">
      <Sparkles size={16} className="text-accent" />
      <h3 className="flex-1 text-[13px] font-semibold text-text">{sarlavha}</h3>
      {xabarlar.length > 0 && <button type="button" className="text-[11px] text-text-mute underline" onClick={() => { setXabarlar([]); setTakliflar([]); setQadamlar([]); setPulTasdiq(false); }}>{t('Yangi suhbat')}</button>}
      <button type="button" onClick={() => setOchiq(false)} aria-label={t('Yopish')} className="rounded p-1 text-text-dim hover:bg-surface-3 hover:text-text"><X size={16} /></button>
    </div>
    <ModelChip profil="smeta_ai" kompaniyaId={kompaniyaId} />
    {qoshimcha}
    <div className="karta min-h-[140px] flex-1 space-y-2 overflow-auto p-2" role="log" aria-live="polite">
      {!xabarlar.length && <div className="space-y-1.5 text-[12.5px] text-text-dim">
        <p className="font-medium text-text">{t('Savol bering yoki vazifa yozing — AI sahifadagi real ma’lumotni o‘qib, tushuntiradi va amal taklif qiladi. Yozuv faqat siz «Bajarish» va «Saqlash» ni bosganingizda.')}</p>
        <div className="flex flex-wrap gap-1.5">{namunalar.map(x => <button key={x} type="button" onClick={() => void yubor(x)} className="rounded-full border border-accent/40 px-2.5 py-1 text-[11.5px] text-accent hover:bg-accent/10">{x}</button>)}</div>
      </div>}
      <AgentXabarlar xabarlar={xabarlar} />
      <AgentQadamlar qadamlar={qadamlar} band={band} sarlavha={(n, ishda) => ishda ? t('Yordamchi ishlayapti — {n} qadam', { n }) : t('Yordamchi nima qildi ({n} qadam)', { n })} />
      <div ref={oxir} />
    </div>
    {holat && <p role="status" className="text-xs text-warn">{holat}</p>}
    {amallarBlok}
    <form className="flex items-end gap-2" onSubmit={e => { e.preventDefault(); void yubor(); }}>
      <textarea aria-label={t('AI yordamchiga xabar')} className="input min-h-[64px] w-full min-w-0 flex-1 resize-y py-2 text-[13px]" rows={2} value={matn} disabled={band}
        placeholder={t('Masalan: beton ishlarini top, fakt nega kam?')} onChange={e => setMatn(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void yubor(); } }} />
      <button type="submit" className="tugma tugma-asosiy h-9 px-3" disabled={band || !matn.trim()}>{t('Yuborish')}</button>
    </form>
    <p className="text-center text-[10px] text-text-mute">{t('AI faqat taklif qiladi: fakt, zamena, narx va F2 faqat sizning tasdig‘ingiz bilan yoziladi; asl smeta o‘zgarmaydi.')}</p>
  </aside>;
}
